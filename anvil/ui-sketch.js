// ui-sketch.js — viewport mouse handling, sketch mode and the 2D sketch tools.
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el;
  var viewport = UI.viewport;

  // ------------------------------------------------------------------ sketch mode
  function enterSketch(id, opts) {
    if (UI.isAssembly && UI.isAssembly()) { if (UI.setStatus) UI.setStatus('Sketches are not available in an assembly document'); return; }
    var f = K.findFeature(App.model, id);
    if (!f || f.type !== 'sketch') return;
    if (App.mode === 'sketch' && App.activeSketch !== id) exitSketch(true);
    App.mode = 'sketch';
    App.activeSketch = id;
    App.sel = null; App.sel2 = null;
    App.sketchDirty = false;
    woken = []; wokenLines = [];
    setTool('select');
    // rfAY: Rapid Sketch keeps the view. sketchflow2: so does a view already normal to the sketch (Normal To on the
    // face first, or Edit Sketch again): SolidWorks only turns the view, it never zooms out of the area being worked on
    if (!(opts && opts.keepView) && !viewIsNormalTo(UI.activePlane())) { UI.viewNormalTo(UI.activePlane()); UI.zoomToFit(); }
    App.gridStale = true;
    UI.updateSketches(); UI.updatePlanes(); UI.updateHighlights();
    UI.setRibbonTab('Sketch');
    $('exit-sketch').hidden = false;
    App.relHover = null;
    refreshCorner(true);
    UI.refreshTree(); UI.refreshStatus();
    UI.setStatus('Editing ' + f.name + '. Pick a tool from the Sketch tab, or click an entity to edit its values.');
    (UI.sketchEnterHooks || []).forEach(function (h) { try { h(f); } catch (e) { /* entering the sketch goes on */ } });   // lane CV: Link Values notes the values
    // lane mcdirect: a drawing tool clicked with no sketch open (SolidWorks' Edit Sketch prompt) is on once the new sketch opens
    if (pendingStart && App.newSketchId === id) { var ps = pendingStart; pendingStart = null; rapidRunItem(ps); }
  }
  UI.sketchEnterHooks = UI.sketchEnterHooks || [];   // functions (f) run as sketch f is opened (enterSketch)
  // sketchflow2: the camera looks straight at plane pl with its y axis up (and the model is on screen)
  function viewIsNormalTo(pl) {
    var c = UI.cam;
    if (!c || !c.dir || !c.up || !pl || !pl.n || !pl.y || !App.mesh || !(App.mesh.triCount > 0)) return false;
    var d = c.dir.clone().normalize(), u = c.up.clone().normalize();
    return d.x * pl.n[0] + d.y * pl.n[1] + d.z * pl.n[2] > 1 - 1e-6 && u.x * pl.y[0] + u.y * pl.y[1] + u.z * pl.y[2] > 1 - 1e-6;
  }
  UI.sketchViewIsNormal = function () { return App.mode === 'sketch' && viewIsNormalTo(UI.activePlane()); };   // test hook

  // r5/sketch5: the confirmation corner, side by side in the top-right corner of the graphics area as SolidWorks has
  // it: Exit Sketch (rebuilds) and Discard Changes and Exit; while a PropertyManager is open in the sketch it holds that
  // PropertyManager's OK / Cancel instead (follows #pm being shown / hidden).
  var cornerMode = null;
  function refreshCorner(force) {
    var cc = $('exit-sketch');
    if (App.mode !== 'sketch') { cornerMode = null; return; }
    var mode = UI.hasPM && UI.hasPM() ? 'pm' : 'sketch';
    if (mode === cornerMode && !force && cc.children.length) return;
    cornerMode = mode;
    cc.innerHTML = '';
    cc.classList.toggle('pm', mode === 'pm');
    if (mode === 'pm') {
      cc.appendChild(el('button', { 'class': 'cc-ok', title: 'OK (Enter)', 'aria-label': 'OK', html: Icons('ok', 24), onclick: function () { UI.pmOK(); } }));
      cc.appendChild(el('button', { 'class': 'cc-cancel', title: 'Cancel (Esc)', 'aria-label': 'Cancel', html: Icons('cancel', 24), onclick: function () { UI.pmCancel(); } }));
    } else {
      cc.appendChild(el('button', { 'class': 'cc-exit', title: 'Exit Sketch (S): keep the changes and rebuild', 'aria-label': 'Exit Sketch', html: Icons('exitSketch', 24), onclick: function () { exitSketch(); } }));
      cc.appendChild(el('button', { 'class': 'cc-cancel', title: 'Discard Changes and Exit', 'aria-label': 'Discard Changes and Exit', html: Icons('cancel', 24), onclick: function () { confirmCancelSketch(); } }));
    }
  }
  if ($('pm') && window.MutationObserver) new MutationObserver(function () { refreshCorner(); }).observe($('pm'), { attributes: true, attributeFilter: ['hidden'] });
  UI.refreshSketchCorner = refreshCorner;

  function exitSketch(silent) {
    if (App.mode !== 'sketch') return UI.whenIdle();
    var f = UI.activeSketchFeature();
    cancelTool();
    App.mode = 'part';
    App.activeSketch = null;
    App.sel = null;
    UI.sketchExitHooks.forEach(function (h) { try { h(f); } catch (e) { /* leaving the sketch goes on */ } });   // sketch-hooks: Dynamic Mirror turns off …
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
    if (rapidHoverKey) { rapidHoverKey = null; App.hover = null; }   // rfAY
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

  // r5/sketch5: Discard Changes and Exit (the red ✗ of the confirmation corner) asks first when the sketch was changed,
  // as SolidWorks does; an unchanged sketch just closes
  function sketchChanged() {
    var f = UI.activeSketchFeature();
    if (!f || !App.sketchSnapshot) return false;
    var s = JSON.parse(App.sketchSnapshot);
    function n(x) { return x && x.length ? JSON.stringify(x) : '[]'; }
    return n(f.entities) !== n(s.entities) || n(f.dims) !== n(s.dims) || n(f.rels) !== n(s.rels);
  }
  function confirmCancelSketch() {
    var f = UI.activeSketchFeature();
    if (!f || !sketchChanged()) { cancelSketch(); return; }
    UI.showModal({
      title: 'Discard Changes?',
      body: '<p>Discard the changes made to <b>' + String(f.name).replace(/</g, '&lt;') + '</b> and exit the sketch?</p>',
      buttons: [
        { id: 'sk-discard', label: 'Discard Changes and Exit', primary: true, action: function () { UI.closeModal(); cancelSketch(); } },
        { id: 'sk-keep', label: 'Keep Editing', action: UI.closeModal }
      ]
    });
  }
  UI.confirmCancelSketch = confirmCancelSketch;
  UI.sketchChanged = sketchChanged;
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
    line: 'Click the start point, then each next point, or press and drag for one line. Type a number for the length; <b>A</b> draws a tangent arc. Started on a circle or arc the line starts where you click; <b>T</b> turns Tangent start on (the start slides round to the tangent point, <b>N</b>: the other one). Double-click or <b>Esc</b> ends the chain; right-click for End Chain.',
    rect: 'Click the first corner, then the opposite corner.',
    crect: 'Click the center, then a corner.',
    circle: 'Click the center, then a point on the circle.',
    arc: 'Click the center, the start point, then the end point; the arc runs the way you move. From a line or arc end, move the center out square to it (a tangent guide line) for a tangent arc.',
    arc3: 'Click the start point, then the end point, then a point the arc passes through. From a line or arc end the arc locks tangent to it as it comes near (a tangent guide line).',
    polygon: 'Click the center, then a vertex. Set the number of sides in the PropertyManager.',
    slot: 'Click the two slot centers, then a point to set the width.',
    point: 'Click to place a point.',
    dimension: 'Click a line, circle, arc, rectangle, slot or polygon (or two points), then click where the dimension should sit: above / below or beside two points for a horizontal or vertical distance. Double-click a value to change it, drag it to move it; <b>Delete</b> removes a selected dimension.'
  };
  function setTool(name) {
    // rfE: Smart Dimension with one or two sketch entities selected starts from them (SolidWorks: the dimension is on
    // the cursor, the next click places it); read before an entity's PropertyManager closes and drops the selection
    // rfAY: Rapid Sketch on and no sketch open: a drawing tool is armed (a plane / face click opens the sketch)
    // lane mcdirect: any other drawing tool with no sketch open starts one (sketchToolStart: Mastercam's direct
    // wireframe on the construction plane, Rapid Sketch's armed tool, or SolidWorks' Edit Sketch prompt)
    if (App.mode !== 'sketch' && name && name !== 'select' && name !== 'dimension' && !(UI.drawingActive && UI.drawingActive())) { sketchToolStart({ tool: name }); return; }
    if (midHover) midReady(null);   // rfIG: a midpoint's hover clock starts again with the tool
    if (App.mode !== 'sketch' && (!name || name === 'select')) { rapidDisarm(); pendingStart = null; }
    var presel = name === 'dimension' && App.mode === 'sketch' ? dimPreselection() : null;
    var statusBefore = $('status-msg') ? $('status-msg').textContent : null;
    cancelTool(true);
    App.tool = name || 'select';
    App.toolState = { pts: [] };
    App.drawConstruction = false;
    App.dimsStale = true;   // p9-sketchfix: the dimension grips (Instant3D) show with the Select tool only: redrawn now
    viewport.classList.toggle('tool-cross', App.tool !== 'select');
    viewport.setAttribute('data-sktool', App.tool);   // r12/sketchui12: the pencil cursor with the tool's glyph (style.css)
    var hint = $('sketch-hint');
    hint.hidden = App.mode !== 'sketch';
    hint.classList.remove('dismissed');
    hint.innerHTML = TOOL_HINTS[App.tool] || '';
    // a sketch tool's own PropertyManager (Insert Line, Rectangle, Circle …, as SolidWorks opens on the tool): registered
    // in UI.sketchToolPMs[tool] = function (tool) { UI.openPM(…) } by the ui-sketch-*.js files; opened here exempt from
    // "a PM opening puts the sketch tool down"
    var toolPM = UI.sketchToolPMs[App.tool] || (App.tool === 'polygon' ? function () { UI.openToolPM('polygon'); } : null);
    if (toolPM) { toolPMOpening = true; try { toolPM(App.tool); } finally { toolPMOpening = false; } }
    else if (App.tool !== 'select' || toolPMOpen()) UI.closePM();
    if (presel) startDimFrom(presel);
    // rfE: the status bar describes the new tool too (it kept the previous command's prompt), unless the tool's own
    // PropertyManager put a message there already; the Select tool leaves the last message (Exited, Chain ended …)
    if (App.mode === 'sketch' && App.tool !== 'select' && $('status-msg') && $('status-msg').textContent === statusBefore) UI.setStatus(hintText());
    UI.refreshRibbon();
  }
  function hintText() { var h = $('sketch-hint'); return h ? String(h.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function cancelTool(keep) {
    var hkF = UI.sketchFreeHooks[App.tool];   // ui-sketch-spline: Esc / another tool ends a spline with what it has
    if (hkF && hkF.finish && App.toolState && App.toolState.pts && App.toolState.pts.length) hkF.finish(App.toolState);
    if (App.toolState && App.toolState.modelRefs && UI.dropUnusedModelRefs) UI.dropUnusedModelRefs(App.toolState.modelRefs);
    if (App.toolState && (App.toolState.arcMode || App.toolState.tanFrom) && App.mode === 'sketch') $('sketch-hint').innerHTML = TOOL_HINTS[App.tool] || '';
    App.toolState = { pts: [] };
    if (!keep) App.quickSnap = null;   // rfAR: putting the tool down drops a Quick Snap
    closeNumBox();
    if (App.inferPreview && App.inferPreview.length) { App.inferPreview = []; App.dimsStale = true; }
    App.tempEntities = [];
    clearFeedback();
    if (App.tempDim) { App.tempDim = null; App.dimsStale = true; }
    if (App.tempRelDim) { App.tempRelDim = null; App.dimsStale = true; }
    UI.updateTemp();
    if (!keep) { App.tool = 'select'; viewport.classList.remove('tool-cross'); if (toolPMOpen()) UI.closePM(); UI.refreshRibbon(); if (App.mode === 'sketch') { $('sketch-hint').innerHTML = TOOL_HINTS.select; } }
  }
  // p9-sketchtab: a sketch tool's own PropertyManager (spec.sketchTool, Insert Line / Rectangle / Point …) closes when
  // the tool is put down (Esc, the tool's button again, the chain ended with nothing in progress), as in SolidWorks
  function toolPMOpen() { var s = UI.pmSpec && UI.pmSpec(); return !!(s && s.sketchTool); }
  // p9-sketchtab: per-tool hooks registered by the ui-sketch-*.js files: UI.sketchToolHooks[tool] = { entities(pts, cur),
  // steps(), commit(ents, st, typed) -> true when it added the geometry itself, after(f, n0, st), single(), numFields(n),
  // liveValues(p), typedPoint(cur, v), readout(pts, p), live(pts, p, temp) }; each optional, null / undefined falls through
  UI.sketchToolHooks = UI.sketchToolHooks || {};
  function toolHook() { return UI.sketchToolHooks[App.tool] || null; }
  // p9-sketchfix: a PropertyManager that opens in a sketch (Linear Sketch Pattern, Trim, DXF/DWG Output, …) puts the
  // sketch tool down, as SolidWorks does: Smart Dimension no longer takes the PM's first click, and Line / Circle /
  // Polygon / Smart Dimension no longer stay highlighted with their hint over it. Every PropertyManager goes through
  // App.command (ui-commands.js openPM / closePM set it), so the hook is there: set while a PM is open (UI.hasPM) =
  // a PM opening; the tool's own PM (Polygon's sides) is opened by setTool and exempt. When a PM closes with the Select
  // tool, the hint goes back to the Select tool's (a command's onClose may have put back the hint of the tool it found).
  var toolPMOpening = false, commandNow = App.command;
  function endSketchTool() {
    if (App.mode !== 'sketch' || !App.tool || App.tool === 'select') return false;
    cancelTool();
    return true;
  }
  Object.defineProperty(App, 'command', {
    configurable: true, enumerable: true,
    get: function () { return commandNow; },
    set: function (v) {
      commandNow = v;
      if (App.mode !== 'sketch' || toolPMOpening) return;
      if (UI.hasPM ? UI.hasPM() : v != null) { endSketchTool(); pmHint(); return; }
      if (App.tool === 'select') setTimeout(function () {
        var h = $('sketch-hint');
        if (h && App.mode === 'sketch' && App.tool === 'select' && !(UI.hasPM && UI.hasPM())) h.innerHTML = TOOL_HINTS.select;
      }, 0);
    }
  });
  // rfE (fidelity finding 14): a sketch command's PropertyManager (Extend, Move, Rotate, Offset, Trim, Bisector …) puts
  // its message in the sketch hint line, which kept the Select tool's "Click an entity to select it"; a property PM on
  // a selection (Dimension, Line / Circle Properties: no message, or the Dimension's state) leaves the hint alone
  var pmHintSpec = null;
  function pmHint() {
    var spec = UI.pmSpec && UI.pmSpec(), h = $('sketch-hint');
    if (!spec || !h || !spec.message || spec.sketchTool || (UI.dimensionPMOpen && UI.dimensionPMOpen())) return;
    h.classList.remove('dismissed');
    h.innerHTML = spec.message;
    // and the status bar, which still showed the previous command's prompt (re-audit 2026-10-12, #14 / #15)
    // (once per PropertyManager: a command that later writes its own status, e.g. an ordinate's value, keeps it)
    if (spec === pmHintSpec) return;
    pmHintSpec = spec;
    if (UI.setStatus) UI.setStatus(String(spec.message).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  }
  UI.endSketchTool = endSketchTool;
  UI.sketchToolPMs = UI.sketchToolPMs || {};
  // UI.sketchFreeHooks[tool] = { entities(pts, state) -> preview / new entities, steps(state) -> clicks needed,
  // click(p, state) -> true when it took the click, finish(state) (a double-click, right-click, Esc), readout(pts, p) }:
  // a drawing tool defined in another file (ui-sketch-spline.js: Spline, Ellipse, Partial Ellipse)
  UI.sketchFreeHooks = UI.sketchFreeHooks || {};
  // UI.withToolPM(fn): run fn (which opens or re-renders a PM) without putting the active sketch tool down — for a tool
  // PM that reopens itself, e.g. when its type (Corner / Center Rectangle …) is switched from inside the PM
  UI.withToolPM = function (fn) { var was = toolPMOpening; toolPMOpening = true; try { return fn(); } finally { toolPMOpening = was; } };

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
  // rfII: sketch lines the cursor passed over ("woken", as SolidWorks): a Line drawn from another point may then lock
  // parallel or square to one of them and the click adds Parallel / Perpendicular. { e, a, b } (the line as it was
  // woken: one that moved or went away is forgotten); the last 4; reset per sketch
  var wokenLines = [];
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
    var key = f.id + ':' + JSON.stringify(f.entities) + (f.layers ? JSON.stringify(f.layers) : '');
    if (candCache.key === key) return candCache.pts;
    var S = window.SketchSolver, pts = [], curves = [];
    f.entities.forEach(function (e, i) {
      if (UI.entityLayerHidden && UI.entityLayerHidden(f, e)) return;   // sketch-layers: hidden layers give no snaps
      if (S) {
        S.pointRefs(f, i).forEach(function (pr) {
          var s = pr.ref.split('.')[1] || '';
          if (s === 'c' && (e.t === 'rect' || e.t === 'slot')) return;   // r15/snapaudit15: not sketch points (SolidWorks), the solver adds nothing there
          pts.push({ pt: pr.pt, kind: s === 'mid' ? 'midpoint' : s === 'c' ? 'center' : 'end', isPoint: !s || undefined });   // (rfIG: a sketch point is named Point)
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

  // ---- p9-modelsnap: snapping onto the model while sketching on (or above / below) a solid. The model's useful points
  // (vertices, edge midpoints, arc / hole centres and quadrants, the centres of the faces parallel to the sketch, the
  // part's centre in the sketch view and its centre of mass) and its edges are projected straight onto the sketch plane,
  // worked out once per model rebuild and sketch plane (modelSnaps), so a mouse move is a distance scan. They come after
  // the sketch's own points (a sketch point as near wins) and after sketch curves and are drawn in their own colour with
  // a label naming them. View ▸ Snap to Model turns them off (App.view.snapModel). Lane sketchref: a point placed on a
  // vertex / edge midpoint / round edge's centre / edge gets Coincident / Midpoint to that model geometry, brought in as
  // reference geometry that follows the model (UI.modelSnapRelations; snaps carry `src`, the 3D geometry); face / part
  // centres and quadrants add none.
  var MODEL_RANK = { mvertex: 0, mref: 0, mcenter: 1, mmid: 2, mquad: 3, mface: 4, mpart: 5, mmass: 6 };   // lane DF: mref
  var MODEL_LABEL = { mvertex: 'Vertex', mcenter: 'Center', mmid: 'Midpoint', mquad: 'Quadrant', mface: 'Face center', mpart: 'Part center', mmass: 'Center of mass', medge: 'On edge' };
  var MODEL_MAX = 5000, MODEL_FACES_MAX = 400, MODEL_COLOR = '#c2409f';
  var modelCache = { key: null };
  function modelSnapOn() { return App.view.snapModel !== false && !!App.mesh && App.mesh.triCount > 0; }
  // { pts: [{ pt, kind, model: true, label }], segs: [{ a, b, lo, hi }], arcs: [{ c, r, full, a0, sw, sg }] } for plane pl
  function modelSnaps(pl) {
    var m = App.mesh, key = [pl.origin, pl.x, pl.y, pl.n].join(';');
    if (modelCache.mesh === m && modelCache.edges === App.edges && modelCache.curves === App.curves && modelCache.hidden === App.triHidden && modelCache.key === key) return modelCache;
    var res = { mesh: m, edges: App.edges, curves: App.curves, hidden: App.triHidden, key: key, pts: [], segs: [], arcs: [] };
    try { buildModelSnaps(m, pl, res); } catch (err) { res.pts = []; res.segs = []; res.arcs = []; }
    modelCache = res;
    return res;
  }
  // is angle ang (radians, in the sketch) on the projected model arc ar?
  function onModelArc(ar, ang) {
    if (ar.full) return true;
    var rel = (((ang - ar.a0) * ar.sg) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    return rel <= ar.sw + 1e-9;
  }
  function buildModelSnaps(m, pl, res) {
    var V = K.vec, n = pl.n, th = App.triHidden, curves = App.curves || [], edges = App.edges || [], seen = {};
    function p2(p) { return K.to2D(pl, p); }
    // lane sketchref: src, the 3D model geometry behind a vertex / centre / midpoint (UI.modelSnapRelations)
    function add(q, kind, src) {
      var k = Math.round(q[0] * 1e5) + ',' + Math.round(q[1] * 1e5), o = seen[k];
      if (o) { if (MODEL_RANK[kind] < MODEL_RANK[o.kind]) { o.kind = kind; o.label = MODEL_LABEL[kind]; o.src = src || null; } return; }
      seen[k] = o = { pt: [q[0], q[1]], kind: kind, model: true, label: MODEL_LABEL[kind], src: src || null };
      res.pts.push(o);
    }
    function faceShown(fi) { var fc = m.faces[fi]; return !!fc && !(th && th[fc.start]); }
    function square(v) { return Math.abs(Math.abs(V.dot(v, n)) - 1) < 1e-6; }
    // the part's extent in the sketch view: every shown facet corner, and the exact extremes of the true curves
    var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    function grow(q) { if (q[0] < lo[0]) lo[0] = q[0]; if (q[1] < lo[1]) lo[1] = q[1]; if (q[0] > hi[0]) hi[0] = q[0]; if (q[1] > hi[1]) hi[1] = q[1]; }
    var P = m.positions64 || m.positions;
    m.faces.forEach(function (fc) {
      if (th && th[fc.start]) return;
      for (var i = fc.start * 9; i < (fc.start + fc.count) * 9; i += 3) grow(p2([P[i], P[i + 1], P[i + 2]]));
    });
    // true circles and arcs: their ends are vertices; square to the sketch also their centre, middle, quadrants and the
    // curve itself (an "on edge" target)
    var arcOf = {};
    curves.forEach(function (c, ci) {
      var C = c && c.curve;
      if (!C || (c.edges && c.edges.length && !c.edges.some(function (e) { return e.faces.some(faceShown); }))) return;
      var yd = V.cross(C.normal, C.xdir), sweep = C.a1 - C.a0, full = sweep >= 2 * Math.PI - 1e-6;
      function at(a) { return V.add(C.center, V.add(V.scale(C.xdir, Math.cos(a) * C.radius), V.scale(yd, Math.sin(a) * C.radius))); }
      function within(a) { if (full) return true; var rel = ((a - C.a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); return rel <= sweep + 1e-9; }
      [pl.x, pl.y].forEach(function (d) {
        var cx = V.dot(C.xdir, d), cy = V.dot(yd, d);
        if (Math.hypot(cx, cy) < 1e-12) return;
        var a = Math.atan2(cy, cx);
        [a, a + Math.PI].forEach(function (b) { if (within(b)) grow(p2(at(b))); });
      });
      if (!full) { add(p2(at(C.a0)), 'mvertex', { k: 'vertex', p: at(C.a0) }); add(p2(at(C.a1)), 'mvertex', { k: 'vertex', p: at(C.a1) }); }
      if (!square(C.normal)) return;
      // lane sketchref2: a partial arc's src carries its frame and ends (x, a0, a1) so a snap on it or its middle keeps a reference
      var cen = p2(C.center), s0 = p2(at(C.a0)), csrc = { k: 'circle', c: C.center.slice(), n: C.normal.slice(), r: C.radius, full: full, x: C.xdir.slice(), a0: C.a0, a1: C.a1 };
      var ar = arcOf[ci] = { c: cen, r: C.radius, full: full, a0: Math.atan2(s0[1] - cen[1], s0[0] - cen[0]), sw: sweep, sg: V.dot(C.normal, n) > 0 ? 1 : -1, src: csrc };
      res.arcs.push(ar);
      add(cen, 'mcenter', csrc);
      if (!full) add(p2(at((C.a0 + C.a1) / 2)), 'mmid', csrc);
      [0, 0.5, 1, 1.5].forEach(function (t) { var a = t * Math.PI; if (onModelArc(ar, a)) add([cen[0] + C.radius * Math.cos(a), cen[1] + C.radius * Math.sin(a)], 'mquad'); });
    });
    // straight edges: collinear pieces meeting at a point no other edge reaches (a face outline split them) are joined
    // into one edge first, so their joints are not vertices and the midpoint is the whole edge's (as Convert Entities)
    var useSmooth = curves.length > 0;   // facets of one curved face are flagged (seam) only where the curves were found: tangent edges count then
    function vk(p) { return Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000) + ',' + Math.round(p[2] * 1000); }
    var inc = {}, lines = [];
    edges.forEach(function (e) {
      if (e.seam || (e.smooth && !useSmooth) || !e.faces || !e.faces.some(faceShown)) return;
      var ka = e.ka || vk(e.a), kb = e.kb || vk(e.b);
      (inc[ka] = inc[ka] || []).push(e); (inc[kb] = inc[kb] || []).push(e);
      if (e.curve == null || !curves[e.curve]) lines.push({ e: e, ka: ka, kb: kb });
    });
    function udir(e) { var d = V.sub(e.b, e.a), l = V.len(d); return l > 1e-12 ? V.scale(d, 1 / l) : null; }
    function joint(k) {
      var l = inc[k];
      if (!l || l.length !== 2 || l.some(function (e) { return e.curve != null && curves[e.curve]; })) return false;
      var u = udir(l[0]), w = udir(l[1]);
      return !!(u && w && V.len(V.cross(u, w)) < 1e-7);
    }
    var byEdge = new Map(), used = new Set();
    lines.forEach(function (L) { byEdge.set(L.e, L); });
    lines.forEach(function (L) {
      if (used.has(L.e)) return;
      used.add(L.e);
      // walk out through joints from end key k of L: the far end point of the joined run
      function walk(k) {
        var e = L.e, key = k, p = k === L.ka ? L.e.a : L.e.b, guard = 0;
        while (joint(key) && guard++ < 10000) {
          var nx = inc[key][0] === e ? inc[key][1] : inc[key][0], NL = byEdge.get(nx);
          if (!NL || used.has(nx)) break;
          used.add(nx);
          var far = NL.ka === key ? NL.kb : NL.ka;
          p = far === NL.ka ? nx.a : nx.b; key = far; e = nx;
        }
        return p;
      }
      var A = walk(L.ka), B = walk(L.kb), a = p2(A), b = p2(B), esrc = { k: 'edge', a: A.slice(), b: B.slice() };
      add(a, 'mvertex', { k: 'vertex', p: A.slice() }); add(b, 'mvertex', { k: 'vertex', p: B.slice() });
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) return;   // square to the sketch: a point
      add([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'mmid', esrc);
      if (res.segs.length < MODEL_MAX) res.segs.push({ a: a, b: b, lo: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], hi: [Math.max(a[0], b[0]), Math.max(a[1], b[1])], src: esrc });
    });
    // faces parallel to the sketch (the one it sits on first): the area centroid of each connected region
    var nf = 0, onPlane = [], other = [], fedges = {};
    m.faces.forEach(function (fc, fi) {
      if (!fc.normal || !square(fc.normal) || !faceShown(fi) || (fc.polys && fc.polys[0] && fc.polys[0].surf)) return;
      var hf = fc.centroid ? V.dot(n, fc.centroid) : fc.w * (V.dot(fc.normal, n) > 0 ? 1 : -1), h0 = V.dot(n, pl.origin);
      (Math.abs(hf - h0) < 1e-6 * Math.max(1, Math.abs(h0)) ? onPlane : other).push(fi);
      fedges[fi] = [];
    });
    edges.forEach(function (e) { (e.faces || []).forEach(function (fi) { if (fedges[fi]) fedges[fi].push(e); }); });
    onPlane.concat(other).forEach(function (fi) {
      if (nf++ >= MODEL_FACES_MAX) return;
      faceCenters(m, fi, pl, fedges[fi], arcOf).forEach(function (q) { add(q, 'mface'); });
    });
    if (isFinite(lo[0])) add([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], 'mpart');
    if (!th) {
      var mp = null;
      try { mp = K.massProps(m); } catch (e) { mp = null; }
      if (mp && mp.volume > 1e-12 && mp.centroid) add(p2(mp.centroid), 'mmass');
    }
    if (res.pts.length > MODEL_MAX) res.pts = res.pts.sort(function (x, y) { return MODEL_RANK[x.kind] - MODEL_RANK[y.kind]; }).slice(0, MODEL_MAX);
  }
  // The area centroids (sketch coordinates) of the connected regions of planar face fi, which is parallel to plane pl,
  // from its outline edges fe in App.edges (bodyEdges: the first face listed on an edge runs it a -> b with the face on
  // its left, the second b -> a): one loop per connected set of edges, each hole taken out of the outer loop around it,
  // and the circular segment between each facet chord of a true arc (e.curve) and the arc itself added or taken away,
  // so a face with round holes or round ends has its exact centre. Falls back to the facets' centroid.
  function faceCenters(m, fi, pl, fe, arcOf) {
    var fc = m.faces[fi], V = K.vec, s = V.dot(fc.normal, pl.n) > 0 ? 1 : -1;
    if (!fe || fe.length < 3) {
      var P = m.positions64 || m.positions, A = 0, c = [0, 0, 0];
      for (var t = fc.start; t < fc.start + fc.count; t++) {
        var i = t * 9, a = [P[i], P[i + 1], P[i + 2]], b = [P[i + 3], P[i + 4], P[i + 5]], d = [P[i + 6], P[i + 7], P[i + 8]];
        var w = V.len(V.cross(V.sub(b, a), V.sub(d, a))) / 2;
        A += w; for (var k = 0; k < 3; k++) c[k] += w * (a[k] + b[k] + d[k]) / 3;
      }
      return A > 1e-12 ? [K.to2D(pl, [c[0] / A, c[1] / A, c[2] / A])] : [];
    }
    // loops: edges joined through shared end keys (union-find)
    var up = {}, loops = {}, list = [];
    function vk(p) { return Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000) + ',' + Math.round(p[2] * 1000); }
    function root(k) { while (up[k] !== k) { up[k] = up[up[k]]; k = up[k]; } return k; }
    fe.forEach(function (e) {
      var ka = e.ka || vk(e.a), kb = e.kb || vk(e.b);
      if (up[ka] == null) up[ka] = ka;
      if (up[kb] == null) up[kb] = kb;
      var ra = root(ka), rb = root(kb);
      if (ra !== rb) up[ra] = rb;
    });
    fe.forEach(function (e) {
      var r = root(e.ka || vk(e.a)), L = loops[r];
      if (!L) { L = loops[r] = { segs: [], A: 0, Mx: 0, My: 0 }; list.push(L); }
      var fwd = e.faces[0] === fi, p = K.to2D(pl, fwd ? e.a : e.b), q = K.to2D(pl, fwd ? e.b : e.a);
      L.segs.push([p, q]);
      // shoelace terms, signed about the face's own normal (outer loops positive, holes negative)
      var cr = s * (p[0] * q[1] - q[0] * p[1]);
      L.A += cr / 2; L.Mx += (p[0] + q[0]) * cr / 6; L.My += (p[1] + q[1]) * cr / 6;
      var ar = e.curve != null ? arcOf[e.curve] : null;
      if (!ar) return;
      var tol = 1e-5 * Math.max(1, ar.r);
      if (Math.abs(Math.hypot(p[0] - ar.c[0], p[1] - ar.c[1]) - ar.r) > tol || Math.abs(Math.hypot(q[0] - ar.c[0], q[1] - ar.c[1]) - ar.r) > tol) return;   // a piece of a chord
      var th = 2 * Math.asin(Math.min(1, Math.hypot(q[0] - p[0], q[1] - p[1]) / (2 * ar.r)));
      var mx = (p[0] + q[0]) / 2 - ar.c[0], my = (p[1] + q[1]) / 2 - ar.c[1], ml = Math.hypot(mx, my);
      if (th < 1e-6 || ml < 1e-12) return;
      var u = [mx / ml, my / ml], As = ar.r * ar.r / 2 * (th - Math.sin(th)), dc = 4 * ar.r * Math.pow(Math.sin(th / 2), 3) / (3 * (th - Math.sin(th)));
      // the segment lies on the bulge side (u) of the chord: it adds to the face when that side is outside the loop
      // (right of the chord, the face being on its left), as on a round end, and is taken away for a hole
      var sg = s * ((q[0] - p[0]) * u[1] - (q[1] - p[1]) * u[0]) < 0 ? 1 : -1;
      L.A += sg * As; L.Mx += sg * As * (ar.c[0] + u[0] * dc); L.My += sg * As * (ar.c[1] + u[1] * dc);
    });
    // crossing number of a ray from pt against a loop's segments (in any order)
    function inside(pt, segs) {
      var c = false;
      segs.forEach(function (g) {
        var a = g[0], b = g[1];
        if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
      });
      return c;
    }
    // each hole belongs to the smallest outer loop around it
    var outers = list.filter(function (l) { return l.A > 0; });
    outers.forEach(function (l) { l.sum = { A: l.A, Mx: l.Mx, My: l.My }; });
    list.forEach(function (l) {
      if (l.A > 0) return;
      var own = null, pt = l.segs[0][0];
      outers.forEach(function (ol) { if ((!own || ol.A < own.A) && inside(pt, ol.segs)) own = ol; });
      if (own) { own.sum.A += l.A; own.sum.Mx += l.Mx; own.sum.My += l.My; }
    });
    var out = [];
    outers.forEach(function (l) { if (l.sum.A > 1e-12) out.push([l.sum.Mx / l.sum.A, l.sum.My / l.sum.A]); });
    return out;
  }
  // The model point nearest the cursor within tolPx screen pixels, or null; candidates within 1 px of the nearest go by
  // rank (a vertex before a centre before a midpoint …), so a face centre and the centre of mass a hair apart read as one.
  function modelPointSnap(mc, pl, raw, mx, my, px, tolPx) {
    var lim = 3 * tolPx * px, hits = [], dmin = Infinity;
    for (var i = 0; i < mc.pts.length; i++) {
      var c = mc.pts[i];
      if (Math.abs(c.pt[0] - raw[0]) > lim || Math.abs(c.pt[1] - raw[1]) > lim) continue;
      var s = UI.worldToScreen(K.to3D(pl, c.pt[0], c.pt[1])), d = Math.hypot(s[0] - mx, s[1] - my);
      if (d < tolPx - 1e-9) { hits.push({ c: c, d: d }); if (d < dmin) dmin = d; }
    }
    var best = null;
    hits.forEach(function (h) {
      if (h.d > dmin + 1) return;
      if (!best || MODEL_RANK[h.c.kind] < MODEL_RANK[best.c.kind] || (MODEL_RANK[h.c.kind] === MODEL_RANK[best.c.kind] && h.d < best.d)) best = h;
    });
    return best;
  }
  // The nearest point on a projected model edge (straight, or a true circle / arc square to the sketch) within tolPx
  // screen pixels of the cursor: { p, d, seg | arc }, or null.
  function modelEdgeSnap(mc, pl, raw, mx, my, px, tolPx) {
    var lim = 3 * tolPx * px, best = null;
    function consider(q, src) {
      var s = UI.worldToScreen(K.to3D(pl, q[0], q[1])), d = Math.hypot(s[0] - mx, s[1] - my);
      if (d < (best ? best.d : tolPx)) best = { p: q, d: d, seg: src.seg, arc: src.arc };
    }
    // rfA: the point lands on the edge rounded as a free point is (x -5, not -4.950000000000003): a level / upright
    // edge's free coordinate, a slanted edge's distance from its start
    var h = 0.5 * px * 1.05;
    mc.segs.forEach(function (sg) {
      if (raw[0] < sg.lo[0] - lim || raw[0] > sg.hi[0] + lim || raw[1] < sg.lo[1] - lim || raw[1] > sg.hi[1] + lim) return;
      var dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1], L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
      var t = Math.max(0, Math.min(1, ((raw[0] - sg.a[0]) * dx + (raw[1] - sg.a[1]) * dy) / L2)), q = [sg.a[0] + t * dx, sg.a[1] + t * dy];
      if (Math.abs(dy) <= 1e-9 * L) q = [Math.max(sg.lo[0], Math.min(sg.hi[0], niceRound(q[0], h))), sg.a[1]];
      else if (Math.abs(dx) <= 1e-9 * L) q = [sg.a[0], Math.max(sg.lo[1], Math.min(sg.hi[1], niceRound(q[1], h)))];
      else { var tr = Math.max(0, Math.min(1, niceRound(t * L, h) / L)); q = [sg.a[0] + tr * dx, sg.a[1] + tr * dy]; }
      consider(q, { seg: sg });
    });
    mc.arcs.forEach(function (ar) {
      var vx = raw[0] - ar.c[0], vy = raw[1] - ar.c[1], r = Math.hypot(vx, vy);
      if (r < 1e-12 || Math.abs(r - ar.r) > lim || !onModelArc(ar, Math.atan2(vy, vx))) return;
      consider([ar.c[0] + vx / r * ar.r, ar.c[1] + vy / r * ar.r], { arc: ar });
    });
    return best;
  }
  // where model edge hit (from modelEdgeSnap) crosses the line coordinate k (0: x, 1: y) = v, nearest raw; or null
  function modelEdgeAt(hit, k, v, raw) {
    var j = 1 - k, q = null;
    if (hit.seg) {
      var a = hit.seg.a, b = hit.seg.b, d = b[k] - a[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (Math.abs(d) > 1e-9 * L) {
        var t = (v - a[k]) / d;
        if (t < -1e-9 || t > 1 + 1e-9) return null;
        q = []; q[k] = v; q[j] = a[j] + t * (b[j] - a[j]);
      } else if (Math.abs(a[k] - v) < 1e-9 * Math.max(1, Math.abs(v))) { q = []; q[k] = v; q[j] = hit.p[j]; }   // along the edge itself
      return q;
    }
    var ar = hit.arc, off = v - ar.c[k];
    if (Math.abs(off) > ar.r) return null;
    var s = Math.sqrt(ar.r * ar.r - off * off), best = null;
    [s, -s].forEach(function (sj) {
      var c = []; c[k] = v; c[j] = ar.c[j] + sj;
      if (!onModelArc(ar, Math.atan2(c[1] - ar.c[1], c[0] - ar.c[0]))) return;
      if (!best || Math.hypot(c[0] - raw[0], c[1] - raw[1]) < Math.hypot(best[0] - raw[0], best[1] - raw[1])) best = c;
    });
    return best;
  }
  // lane DF: the shown reference Points, Axis ends and Coordinate System origins before the sketch (UI.sketchRefPoints,
  // ui-select.js) projected onto plane pl: point snaps like model vertices, labelled with the feature's name, no relation
  function refSnaps(f, pl) {
    if (App.view.snapModel === false || !UI.sketchRefPoints) return [];
    return UI.sketchRefPoints(f).map(function (q) { return { pt: K.to2D(pl, q.p), kind: 'mref', model: true, label: q.label }; });
  }
  UI.sketchRefSnaps = function () { var f = UI.activeSketchFeature(); return App.mode === 'sketch' && f ? refSnaps(f, UI.activePlane()) : []; };   // test hook
  UI.sketchModelSnaps = function () { return App.mode === 'sketch' && modelSnapOn() ? modelSnaps(UI.activePlane()) : null; };   // test / script hook

  // Where a drawing tool's next point goes for the cursor at sketch point raw (screen mx, my):
  // { p, snap: { kind, pt } | null, align: [{ from, axis: 'x' | 'y', prev }], px }.
  function inferPoint(raw, mx, my) {
    var f = UI.activeSketchFeature(), pl = UI.activePlane(), out = { p: raw.slice(), snap: null, align: [], px: 0 };
    if (!f) return out;
    if (mx == null) { var s0 = UI.worldToScreen(K.to3D(pl, raw[0], raw[1])); mx = s0[0]; my = s0[1]; }
    var px = out.px = pxSize(pl, mx, my), st = App.toolState || { pts: [] }, prev = st.pts[st.pts.length - 1];
    function scr(p) { return UI.worldToScreen(K.to3D(pl, p[0], p[1])); }
    // sketch-refine: Ctrl held while moving suppresses every snap (the point stays under the cursor, rounded)
    if (UI.sketchCtrlHeld && UI.sketchCtrlHeld()) { var hC = 0.5 * px * 1.05; out.p = [niceRound(raw[0], hC), niceRound(raw[1], hC)]; return out; }
    // rfAR: a Quick Snap takes the next point alone (nothing of its kind in reach: the point stays free); Sketch
    // Settings ▸ Enable Snapping off: no snaps at all (the sketch grid still rounds when it is shown)
    if (App.quickSnap || !skSetting('snapping')) {
      if (App.quickSnap && quickSnapPoint(App.quickSnap, f, pl, raw, mx, my, px, st, prev, out)) return out;
      var hS = 0.5 * px * 1.05, gS = App.view.showGrid ? UI.snapStep() : 0;
      out.p = [gS ? +(Math.round(raw[0] / gS) * gS).toPrecision(12) : niceRound(raw[0], hS), gS ? +(Math.round(raw[1] / gS) * gS).toPrecision(12) : niceRound(raw[1], hS)];
      return out;
    }
    // 1. an existing point
    var cands = sketchPoints(f).slice(), mc = modelSnapOn() ? modelSnaps(pl) : null, rsn = refSnaps(f, pl);   // lane DF: rsn
    // r15/snapaudit15: a woken point whose entity is gone (Undo, Delete, a drag moved it) is forgotten, so nothing lines
    // up with a point that is no longer there (p9-modelsnap: a model point stays while the model has it)
    function has(list, w) { return list.some(function (c) { return c.pt[0] === w[0] && c.pt[1] === w[1]; }); }
    if (woken.length) woken = woken.filter(function (w) { return (w[0] === 0 && w[1] === 0) || has(cands, w) || st.pts.some(function (q) { return q[0] === w[0] && q[1] === w[1]; }) || (mc && has(mc.pts, w)) || has(rsn, w); });
    cands.push({ pt: [0, 0], kind: 'origin' });
    // sketch-hooks: the tool's own points are snap and alignment targets unless its definition says this step must not
    // land on them (UI.sketchToolDefs[tool].noOwnSnap(st) or UI.sketchFreeHooks[tool].noOwnSnap(st): an arc slot's width
    // click near its third point, an ellipse's minor axis point near its centre)
    var tdef = UI.sketchToolDefs[App.tool] || UI.sketchFreeHooks[App.tool], ownSnap = !(tdef && tdef.noOwnSnap && tdef.noOwnSnap(st));   // (an ellipse's minor axis point too)
    if (ownSnap) st.pts.forEach(function (p) { cands.push({ pt: p, kind: 'end' }); });
    // rfA: … nor on any point sitting where one of them is (an ellipse centred on the origin: its minor axis click near
    // the centre snapped onto the origin, the centre again, and was refused)
    else cands = cands.filter(function (c) { return !st.pts.some(function (q) { return Math.abs(q[0] - c.pt[0]) < 1e-9 && Math.abs(q[1] - c.pt[1]) < 1e-9; }); });
    var best = null, bestD = INFER_PX.point;
    cands.forEach(function (c) {
      var s = scr(c.pt), d = Math.hypot(s[0] - mx, s[1] - my);
      if (d < bestD - 1e-9) { bestD = d; best = c; }
    });
    // p9-modelsnap: then a model point (vertex, midpoint, centre, face / part centre …); a sketch point wins unless the
    // model point is more than a pixel nearer
    if (mc && mc.pts.length) {
      var mp = modelPointSnap(mc, pl, raw, mx, my, px, INFER_PX.point);
      if (mp && (!best || mp.d < bestD - 1)) best = mp.c;
    }
    // lane DF: a reference point, as a model vertex (and ahead of a model point no nearer)
    if (rsn.length) {
      var rpS = modelPointSnap({ pts: rsn }, pl, raw, mx, my, px, INFER_PX.point);
      if (rpS && (!best || (best.model ? rpS.d <= (mp ? mp.d : Infinity) + 1e-9 : rpS.d < bestD - 1))) best = rpS.c;
    }
    if (best) {
      out.p = [best.pt[0], best.pt[1]]; out.snap = best;
      // a point the cursor has passed over is "woken": inference lines can then align with it (as in SolidWorks)
      if (!woken.some(function (w) { return w[0] === best.pt[0] && w[1] === best.pt[1]; })) { woken.push([best.pt[0], best.pt[1]]); if (woken.length > 8) woken.shift(); }
      return out;
    }
    // r15/tanslide15: Line tool with a tangent-sliding start (the first point was clicked on a circle / arc, like
    //     Mastercam's Line Endpoints with Tangent): the start follows the cursor round the curve (toolEntities,
    //     tangentStart), so direction locks and alignments with the clicked point mean nothing; the free end still
    //     snaps to points (above) and curves, and is rounded like a free coordinate otherwise
    if (App.tool === 'line' && st.tanFrom && !st.tanFrom.off && !st.arcMode && st.pts.length === 1) {
      // p9-sketch: never onto the curve the start slides on from outside it (the line would end where it starts);
      // inside it the line starts at the clicked point, so a chord to the curve is fine
      var eS = f.entities[st.tanFrom.e], outS = eS && eS.r > 0 && Math.hypot(raw[0] - (+eS.cx || 0), raw[1] - (+eS.cy || 0)) > eS.r;
      var ocT = curveSnap(f, pl, [mx, my], INFER_PX.curve, outS ? st.tanFrom.e : -1);
      if (ocT) { out.p = ocT.slice(); out.snap = { kind: 'on', pt: out.p, e: ocT.e }; }
      else {
        var hT = 0.5 * px * 1.05, gT = App.view.showGrid ? UI.snapStep() : 0;
        out.p = [gT ? +(Math.round(raw[0] / gT) * gT).toPrecision(12) : niceRound(raw[0], hT), gT ? +(Math.round(raw[1] / gT) * gT).toPrecision(12) : niceRound(raw[1], hT)];
      }
      out.tanSlide = true;
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
    // 1c. r15/tangent15: a line ending tangent to a circle / arc. With the cursor within 7 px of a circle (or of an arc,
    //     the tangent point inside its sweep) and within 6 px of one of the two tangent points from the line's first
    //     point, the end takes that tangent point exactly; the click infers the end's Coincident and Tangent
    //     (SketchSolver.inferCandidates). Both ends: this runs before the start's tangent-direction lock (2b), so when
    //     the line starts on circle A and the cursor reaches a tangent point of circle B, the end tangent to B wins
    //     (the start point cannot move, so both are rarely possible at once); the start then keeps its Coincident only,
    //     and gets Tangent to A too only if the line from it to that tangent point already touches A (to the solver's
    //     1e-7), as an end placed at a common tangent point does.
    if (App.tool === 'line' && prev && !st.arcMode) {
      var et = lineEndTangent(f, prev, raw, px);
      if (et) { out.p = et.p; out.snap = { kind: 'on', pt: et.p }; out.tan = et; return out; }
    }
    // 2b (computed first). A line leaving an existing end point: along the tangent of the arc that ends there, or
    //     square to the line that ends there (within 6 px of that direction; the length is rounded like a free
    //     coordinate). The click then infers Tangent / Perpendicular (SketchSolver.inferCandidates). Axis-aligned
    //     directions are left to H / V. r15/tangent15: also along the tangent of a circle / arc the line starts on
    //     (curveTangentDirs; the radial direction gets nothing new); p9-sketch: also when a line / arc already ends
    //     there (a chain going on from a point on the circle: the solver follows the chain's Coincidents to the circle
    //     and adds Tangent).
    var bestDir = null;
    if (App.tool === 'line' && prev && !st.arcMode) {
      var w = [raw[0] - prev[0], raw[1] - prev[1]], sd = smoothDirs(f, prev);
      sd.dirs.concat(curveTangentDirs(f, prev), wokenLineDirs(f, prev)).forEach(function (c) {
        var s = w[0] * c.u[0] + w[1] * c.u[1], dd = Math.abs(w[0] * c.u[1] - w[1] * c.u[0]) / px;
        if (s > 0 && dd < INFER_PX.align && (!bestDir || dd < bestDir.d)) bestDir = { d: dd, c: c, s: s };
      });
    }
    // 2. on a line / circle / arc (the solver infers a point-on-curve Coincident there). p9-sketch: near its start a
    //    line leaving a curve along its tangent hugs that curve, so on the curve the line starts from (or one ending
    //    there) the direction lock wins while the cursor is nearer the locked direction than the curve; a pick on the
    //    curve itself (nearer the curve, or out of the 6 px lock) still lands on it.
    var onCurve = curveSnap(f, pl, [mx, my], INFER_PX.curve);
    if (onCurve) wakeLine(f, onCurve.e);   // rfII: a line the cursor passes over is woken (parallel / perpendicular locks)
    if (onCurve && bestDir && bestDir.d <= onCurve.d && entityThrough(f.entities[onCurve.e], prev)) onCurve = null;
    if (onCurve) {
      out.p = onCurve.slice(); out.snap = { kind: 'on', pt: out.p, e: onCurve.e };
      // rfKU: on a curve *and* in line with the previous point (or a woken point), as SolidWorks: the point goes where
      // the horizontal / vertical inference line crosses the curve, so a line drawn level to an edge ends on it level
      // (it took the nearest point on the curve, 1-2 px off the level, and the click added no Horizontal)
      var ac = curveAlign(f, onCurve, raw, px, st, prev, ownSnap);
      if (ac) { out.p = ac.p; out.snap.pt = out.p; out.align.push(ac.align); }
      return out;
    }
    if (bestDir) {
      var sl = App.view.showGrid ? bestDir.s : niceRound(bestDir.s, 0.5 * px * 1.05), u = bestDir.c.u;
      out.p = [prev[0] + u[0] * sl, prev[1] + u[1] * sl];
      out.dir = { type: bestDir.c.type, from: prev, u: u };
      if (bestDir.c.glyph) out.dir.glyph = bestDir.c.glyph;   // r15/tangent15: the Tangent glyph by the cursor
      if (bestDir.c.rel) out.dir.rel = bestDir.c.rel;   // rfII: Parallel / Perpendicular to a woken line (the click adds it)
      return out;
    }
    // 3. aligned with the previous point (horizontal / vertical) or with another sketch point (inference lines);
    //    a rectangle's second corner is not aligned with its first (it would have no width or height)
    var tol = INFER_PX.align * px, boxTool = App.tool === 'rect' || App.tool === 'crect';
    var ax = null, ay = null;
    var alignC = [];
    if (prev && !boxTool && ownSnap) alignC.push({ pt: prev, prev: true });
    if (ownSnap) st.pts.forEach(function (p) { if (p !== prev && !(boxTool && p === st.pts[0])) alignC.push({ pt: p }); });
    // (rfA: a step that must not land on the tool's own points lines up with none of them either: an ellipse's minor
    // axis point lined up with the major axis end, and the ellipse came out flat)
    function own(p) { return st.pts.some(function (q) { return q[0] === p[0] && q[1] === p[1]; }); }
    woken.forEach(function (p) { if (!(boxTool && st.pts[0] && p[0] === st.pts[0][0] && p[1] === st.pts[0][1]) && (ownSnap || !own(p))) alignC.push({ pt: p }); });
    alignC.forEach(function (c) {
      var dx = Math.abs(raw[0] - c.pt[0]), dy = Math.abs(raw[1] - c.pt[1]);
      if (dx < tol && (!ax || dx < ax.d - 1e-9)) ax = { d: dx, c: c };
      if (dy < tol && (!ay || dy < ay.d - 1e-9)) ay = { d: dy, c: c };
    });
    // p9-modelsnap: on a model edge (after the sketch's curves and direction locks). With one inference line the point
    // goes where that line crosses the edge, so both hold; with none, or no crossing near the cursor, the nearest point
    // on the edge; with two, the aligned point stands.
    var mE = mc && !(ax && ay) && (mc.segs.length || mc.arcs.length) ? modelEdgeSnap(mc, pl, raw, mx, my, px, INFER_PX.curve) : null;
    if (mE) {
      var fx = ay ? { k: 1, al: ay } : ax ? { k: 0, al: ax } : null, qE = mE.p;
      if (fx) {
        var qa = modelEdgeAt(mE, fx.k, fx.al.c.pt[fx.k], raw), sa = qa && scr(qa);
        if (qa && Math.hypot(sa[0] - mx, sa[1] - my) < INFER_PX.curve) { qE = qa; out.align.push({ from: fx.al.c.pt, axis: fx.k ? 'y' : 'x', prev: !!fx.al.c.prev }); }
      }
      out.p = qE.slice(); out.snap = { kind: 'medge', pt: out.p, model: true, label: MODEL_LABEL.medge, src: (mE.seg && mE.seg.src) || (mE.arc && mE.arc.src) || null };
      return out;
    }
    var h = 0.5 * px * 1.05, grid = App.view.showGrid ? UI.snapStep() : 0;
    function free(v) { return grid ? +(Math.round(v / grid) * grid).toPrecision(12) : niceRound(v, h); }
    out.p = [ax ? ax.c.pt[0] : free(raw[0]), ay ? ay.c.pt[1] : free(raw[1])];
    // r15/snapaudit15: a grid-rounded or aligned point that lands on a curve is a snap (the solver adds the Coincident), so the ring shows it
    if ((grid || ax || ay) && window.SketchSolver && window.SketchSolver.onCurveRef && window.SketchSolver.onCurveRef(f, -1, out.p, 1e-7)) out.snap = { kind: 'on', pt: out.p.slice() };
    if (ax) out.align.push({ from: ax.c.pt, axis: 'x', prev: !!ax.c.prev });
    if (ay) out.align.push({ from: ay.c.pt, axis: 'y', prev: !!ay.c.prev });
    // a circle / polygon / arc radius is rounded as a length (R 12.5, not a rounded end point)
    var a = st.pts[0];
    if (a && !grid && !out.align.length && (App.tool === 'circle' || App.tool === 'polygon' || (App.tool === 'arc' && st.pts.length === 1))) {
      var vx = raw[0] - a[0], vy = raw[1] - a[1], r = Math.hypot(vx, vy);
      if (r > 1e-12) { var rr = niceRound(r, h); out.p = [a[0] + vx / r * rr, a[1] + vy / r * rr]; }
    }
    // r9/sketch9: a slot's width is rounded as a length too (W 6, not 5.8 from a rounded point)
    if (a && !grid && App.tool === 'slot' && st.pts.length === 2) {
      var b2 = st.pts[1], ux = b2[0] - a[0], uy = b2[1] - a[1], La = Math.hypot(ux, uy);
      if (La > 1e-12) {
        ux /= La; uy /= La;
        var sd = (raw[0] - a[0]) * -uy + (raw[1] - a[1]) * ux, along = (raw[0] - a[0]) * ux + (raw[1] - a[1]) * uy;
        var hw = niceRound(2 * Math.abs(sd), 2 * h) / 2 * (sd < 0 ? -1 : 1);
        out.p = [a[0] + ux * along - uy * hw, a[1] + uy * along + ux * hw];
        out.align = [];
      }
    }
    if (UI.sketchToolDefs[App.tool] && UI.sketchToolDefs[App.tool].refine) UI.sketchToolDefs[App.tool].refine(out, raw, st, h, grid);   // p9-sketch-curves: a tool's own rounding (ui-sketch-*.js)
    return out;
  }
  // rfKU: where a horizontal / vertical inference line (through the previous point first, else a woken point, within
  // INFER_PX.align of the cursor) crosses the line / circle / arc the cursor is on, within INFER_PX.curve of the
  // cursor -> { p, align } or null
  function curveAlign(f, oc, raw, px, st, prev, ownSnap) {
    var e = f.entities[oc.e];
    if (!e || !(e.t === 'line' || e.t === 'circle' || e.t === 'arc')) return null;
    var pl = UI.activePlane(), tol = INFER_PX.align * px, boxTool = App.tool === 'rect' || App.tool === 'crect';
    var cs = [];
    if (prev && !boxTool && ownSnap) cs.push({ pt: prev, prev: true });
    woken.forEach(function (p) { if (!(prev && p[0] === prev[0] && p[1] === prev[1]) && !(boxTool && st.pts[0] && p[0] === st.pts[0][0] && p[1] === st.pts[0][1])) cs.push({ pt: p }); });
    var best = null;
    cs.forEach(function (c) {
      [0, 1].forEach(function (k) {
        var d = Math.abs(raw[k] - c.pt[k]);
        if (d >= tol) return;
        var q = curveAtCoord(e, k, c.pt[k], raw);
        if (!q) return;
        var s = UI.worldToScreen(K.to3D(pl, q[0], q[1])), s0 = UI.worldToScreen(K.to3D(pl, raw[0], raw[1]));
        if (Math.hypot(s[0] - s0[0], s[1] - s0[1]) >= INFER_PX.curve) return;
        if (q[0] === c.pt[0] && q[1] === c.pt[1]) return;   // the aligned point itself (a point snap handles it)
        var key = (c.prev ? 0 : 1) + d / tol;   // the previous point's alignment first
        if (!best || key < best.key) best = { key: key, p: q, align: { from: c.pt, axis: k ? 'y' : 'x', prev: !!c.prev } };
      });
    });
    return best;
  }
  // the point of line / circle / arc e whose coordinate k is v, nearest raw (null: none)
  function curveAtCoord(e, k, v, raw) {
    if (e.t === 'line') {
      var a = [e.x1, e.y1], b = [e.x2, e.y2], d = b[k] - a[k];
      if (Math.abs(d) < 1e-12) return null;
      var t = (v - a[k]) / d;
      var inf = window.SketchSolver && window.SketchSolver.infSides ? window.SketchSolver.infSides(e) : null;
      if ((t < 0 && !(inf && inf.p1)) || (t > 1 && !(inf && inf.p2))) return null;
      var q = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      q[k] = v;
      return q;
    }
    var c = [+e.cx, +e.cy], off = v - c[k];
    if (Math.abs(off) > e.r) return null;
    var o = Math.sqrt(Math.max(0, e.r * e.r - off * off)), best = null;
    [o, -o].forEach(function (s) {
      var q = [0, 0]; q[k] = v; q[1 - k] = c[1 - k] + s;
      if (e.t === 'arc') {
        var ang = Math.atan2(q[1] - c[1], q[0] - c[0]) * 180 / Math.PI, rel = ((ang - e.a0) % 360 + 360) % 360, sw = ((e.a1 - e.a0) % 360 + 360) % 360;
        if (rel > sw + 1e-9 && e.a1 - e.a0 < 360) return;
      }
      if (!best || Math.hypot(q[0] - raw[0], q[1] - raw[1]) < Math.hypot(best[0] - raw[0], best[1] - raw[1])) best = q;
    });
    return best;
  }
  function snap(uv, mx, my) { return inferPoint(uv, mx, my).p; }
  UI.sketchInferPoint = inferPoint;   // r9/sketch9: script / test hook (where a drawing tool would put its next point)

  // The nearest point on a line, circle or arc of sketch f within tolPx screen pixels of scr, or null; .e is its
  // entity, .d its distance in pixels. skip: an entity index left out (p9-sketch).
  function curveSnap(f, pl, scr, tolPx, skip) {
    var best = null, bestD = tolPx;
    function S(uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
    f.entities.forEach(function (e, i) {
      if (i === skip || (UI.entityLayerHidden && UI.entityLayerHidden(f, e))) return;
      if (e.t === 'line') {
        var a = S([e.x1, e.y1]), b = S([e.x2, e.y2]), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        if (L2 < 1) return;
        var t = ((scr[0] - a[0]) * dx + (scr[1] - a[1]) * dy) / L2;
        // sketch-refine: an infinite line (or ray) runs on past the end(s) it has no end at
        var inf = window.SketchSolver && window.SketchSolver.infSides ? window.SketchSolver.infSides(e) : null;
        if ((t <= 0 && !(inf && inf.p1)) || (t >= 1 && !(inf && inf.p2))) return;
        var d = Math.hypot(scr[0] - (a[0] + t * dx), scr[1] - (a[1] + t * dy));
        if (d < bestD) { bestD = d; best = [e.x1 + t * (e.x2 - e.x1), e.y1 + t * (e.y2 - e.y1)]; best.e = i; }
      } else if (e.t === 'circle' || e.t === 'arc') {
        var c = UI.screenToPlane(scr[0], scr[1], pl);
        if (!c) return;
        var vx = c[0] - e.cx, vy = c[1] - e.cy, r = Math.hypot(vx, vy);
        if (r < 1e-12) return;
        var ang = Math.atan2(vy, vx) * 180 / Math.PI;
        if (e.t === 'arc') { var rel = ((ang - e.a0) % 360 + 360) % 360; if (rel > ((e.a1 - e.a0) % 360 + 360) % 360 && e.a1 - e.a0 < 360) return; }
        var q = [e.cx + vx / r * e.r, e.cy + vy / r * e.r], s = S(q), dd = Math.hypot(s[0] - scr[0], s[1] - scr[1]);
        if (dd < bestD) { bestD = dd; best = q; best.e = i; }
      } else if ((e.t === 'rect' || e.t === 'crect' || e.t === 'poly' || e.t === 'polyline') && window.SketchSolver) {
        // r15/snapaudit15: rectangle, polygon and polyline edges are on-curve targets too (alignment could land a point
        // on one and the solver added its Coincident with no snap shown); slots stay out, as in SketchSolver.onCurveRef
        var SS0 = window.SketchSolver;
        SS0.curveRefs(f, i).forEach(function (cr) {
          var c = SS0.refCurve(f, cr);
          if (!c || c.kind !== 'line') return;
          var a2 = S(c.a), b2 = S(c.b), ex = b2[0] - a2[0], ey = b2[1] - a2[1], E2 = ex * ex + ey * ey;
          if (E2 < 1) return;
          var tt = ((scr[0] - a2[0]) * ex + (scr[1] - a2[1]) * ey) / E2;
          if (tt <= 0 || tt >= 1) return;
          var d2 = Math.hypot(scr[0] - (a2[0] + tt * ex), scr[1] - (a2[1] + tt * ey));
          if (d2 < bestD) { bestD = d2; best = [c.a[0] + tt * (c.b[0] - c.a[0]), c.a[1] + tt * (c.b[1] - c.a[1])]; best.e = i; }
        });
      } else if ((e.t === 'spline' || e.t === 'ellipse' || e.t === 'pellipse') && window.SketchSolver && window.SketchSolver.freeCurve) {
        // sketch-refine: splines and ellipses are on-curve targets (the solver keeps a point on them); not past an open end
        var SF = window.SketchSolver, fc = SF.freeCurve(e), cu = fc && UI.screenToPlane(scr[0], scr[1], pl);
        if (!cu) return;
        var hit = SF.freeClosest(fc, cu);
        if (!hit || hit.end) return;
        var sq = S(hit.p), d3 = Math.hypot(sq[0] - scr[0], sq[1] - scr[1]);
        if (d3 < bestD) { bestD = d3; best = [hit.p[0], hit.p[1]]; best.e = i; }
      }
    });
    if (best) best.d = bestD;
    return best;
  }
  // p9-sketch: does line / circle / arc e pass through P (to the solver's tolerance)? The curve a line starts on, or
  // one that ends where it starts.
  function entityThrough(e, P) {
    if (!e || !P) return false;
    var tol = Math.max(1e-7, 1e-9 * Math.max(1, Math.abs(P[0]), Math.abs(P[1])));
    if (e.t === 'circle' || e.t === 'arc') return Math.abs(Math.hypot(P[0] - (+e.cx || 0), P[1] - (+e.cy || 0)) - e.r) < tol;
    if (e.t === 'line') {
      var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L2 = dx * dx + dy * dy;
      if (!(L2 > 0)) return false;
      var t = Math.max(0, Math.min(1, ((P[0] - e.x1) * dx + (P[1] - e.y1) * dy) / L2));
      return Math.hypot(P[0] - (e.x1 + t * dx), P[1] - (e.y1 + t * dy)) < tol;
    }
    return false;
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
      // rfII: an open spline's / partial ellipse's end too (a line or tangent arc leaving it along its tangent: Tangent)
      var freeEnd = e && ((e.t === 'spline' && !e.closed) || e.t === 'pellipse') && S.freeEndDir;
      if (!e || (e.t !== 'line' && e.t !== 'arc' && !freeEnd)) continue;
      for (var k = 1; k <= 2; k++) {
        var q = S.refPoint(f, i + '.p' + k);
        if (!q || Math.abs(q[0] - P[0]) > tol || Math.abs(q[1] - P[1]) > tol) continue;
        if (freeEnd) {
          var tf = S.freeEndDir(e, q);   // the curve's direction of travel at that end
          if (!tf) continue;
          var ff = k === 2 ? tf : [-tf[0], -tf[1]];
          if (!out.fwd) out.fwd = ff;
          if (!axis(ff)) out.dirs.push({ type: 'tangent', u: ff, glyph: 'tangent' });
          continue;
        }
        var t = S.endDir(e, q);
        if (!t || !(Math.abs(t[0]) + Math.abs(t[1]) > 0.5)) continue;
        var fwd = k === 2 ? t : [-t[0], -t[1]];
        if (!out.fwd) out.fwd = fwd;
        // rfII: every lock names the relation its click adds (the cursor label, drawFeedback)
        if (e.t === 'arc') { if (!axis(fwd)) out.dirs.push({ type: 'tangent', u: fwd, glyph: 'tangent' }); }
        else if (!axis(t)) out.dirs.push({ type: 'perpendicular', u: [-t[1], t[0]], glyph: 'perpendicular' }, { type: 'perpendicular', u: [t[1], -t[0]], glyph: 'perpendicular' });
      }
    }
    return out;
  }
  // rfII: wake line i of sketch f (the cursor passed over it): it joins wokenLines (the most recent last, at most 4)
  function wakeLine(f, i) {
    var e = f.entities[i];
    if (!e || e.t !== 'line') return;
    wokenLines = wokenLines.filter(function (w) { return w.e !== i; });
    wokenLines.push({ e: i, a: [e.x1, e.y1], b: [e.x2, e.y2] });
    if (wokenLines.length > 4) wokenLines.shift();
  }
  // rfII: the directions a Line leaving P may lock to, parallel and square to each woken line of sketch f:
  // [{ type: 'parallel' | 'perpendicular', u, glyph, rel: { type, ref } }] (rel: the relation the click adds, through
  // inferOpts' dirRels). A woken line that moved or went away is forgotten; one ending at P (smoothDirs gives its
  // Perpendicular) or running through P (its own on-curve snap) adds nothing; axis-aligned directions are left to H / V.
  function wokenLineDirs(f, P) {
    var out = [], sc = Math.max(1, Math.abs(P[0]), Math.abs(P[1])), tol = 1e-9 * sc;
    wokenLines = wokenLines.filter(function (w) { var e = f.entities[w.e]; return !!(e && e.t === 'line' && e.x1 === w.a[0] && e.y1 === w.a[1] && e.x2 === w.b[0] && e.y2 === w.b[1]); });
    wokenLines.forEach(function (w) {
      var e = f.entities[w.e], dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy);
      if (!(L > 1e-12) || (UI.entityLayerHidden && UI.entityLayerHidden(f, e))) return;
      if (distPointLine(P, [e.x1, e.y1], [e.x2, e.y2]) < 1e-7 * sc + tol) return;   // (an end at P is on it too)
      var d = [dx / L, dy / L];
      if (Math.abs(d[0]) < 1e-9 || Math.abs(d[1]) < 1e-9) return;
      var par = { type: 'parallel', ref: String(w.e) }, per = { type: 'perpendicular', ref: String(w.e) };
      out.push({ type: 'parallel', u: d, glyph: 'parallel', rel: par }, { type: 'parallel', u: [-d[0], -d[1]], glyph: 'parallel', rel: par },
        { type: 'perpendicular', u: [-d[1], d[0]], glyph: 'perpendicular', rel: per }, { type: 'perpendicular', u: [d[1], -d[0]], glyph: 'perpendicular', rel: per });
    });
    return out;
  }
  UI.sketchWokenLines = function () { return wokenLines.map(function (w) { return w.e; }); };   // rfII: test hook
  // r15/tangent15: Line tool, end tangent to a circle / arc. For each circle or arc of sketch f the cursor point raw is
  // within 7 px of, the two points where a line from P touches it (computed exactly: c + r (cos, sin)(th ± acos(r / d))),
  // an arc's only inside its sweep; the one nearest the cursor within 6 px: { p, e (entity index), from: P, d (px) },
  // or null. P on or inside a circle has no tangent point on it.
  function lineEndTangent(f, P, raw, px) {
    var best = null;
    f.entities.forEach(function (e, j) {
      if (!e || (e.t !== 'circle' && e.t !== 'arc') || !(e.r > 0)) return;
      var cx = +e.cx || 0, cy = +e.cy || 0, d = Math.hypot(P[0] - cx, P[1] - cy);
      if (!(d > e.r * (1 + 1e-9))) return;
      if (Math.abs(Math.hypot(raw[0] - cx, raw[1] - cy) - e.r) / px >= INFER_PX.curve) return;
      var th = Math.atan2(P[1] - cy, P[0] - cx), al = Math.acos(e.r / d), cv = { c: [cx, cy], arc: e.t === 'arc' ? e : null };
      [th + al, th - al].forEach(function (a) {
        var T = [cx + e.r * Math.cos(a), cy + e.r * Math.sin(a)], dd = Math.hypot(raw[0] - T[0], raw[1] - T[1]) / px;
        if (dd < INFER_PX.align && onArc(cv, T) && (!best || dd < best.d)) best = { d: dd, p: T, e: j, from: P };
      });
    });
    return best;
  }
  // r15/tanslide15: the sliding start of a tangent line from a circle / arc (st.tanFrom: the entity the first point was
  // clicked on, Mastercam's Line Endpoints with Tangent). For the cursor at Q the start is the tangent point of that
  // curve on Q's side: the one nearer the previous start (continuity as the cursor sweeps round), the clicked point
  // the first time; an arc's only inside its sweep. Inside the circle there is none: the line starts at the clicked
  // point. The point is exact (c + r·(cos, sin)(θ ± acos(r / d))), so the click infers Tangent and Coincident.
  // p9-sketch: N (UI.flipTangent) takes the other tangent point once (Mastercam's choice of tangent): tf.flip, applied
  // on the next call, after which continuity keeps the line on that side.
  function tangentStart(st, Q) {
    var f = UI.activeSketchFeature(), tf = st.tanFrom, e = f && tf && f.entities[tf.e];
    if (!e || (e.t !== 'circle' && e.t !== 'arc') || !(e.r > 0)) return null;
    var cx = +e.cx || 0, cy = +e.cy || 0, d = Math.hypot(Q[0] - cx, Q[1] - cy);
    if (!(d > e.r * (1 + 1e-9))) return null;
    var th = Math.atan2(Q[1] - cy, Q[0] - cx), al = Math.acos(e.r / d), ref = tf.last || tf.p0, best = null, other = null, cv = { c: [cx, cy], arc: e.t === 'arc' ? e : null };
    [th + al, th - al].forEach(function (a) {
      var T = [cx + e.r * Math.cos(a), cy + e.r * Math.sin(a)], dd = Math.hypot(T[0] - ref[0], T[1] - ref[1]);
      if (!onArc(cv, T)) return;
      if (!best || dd < best.d) { other = best; best = { d: dd, p: T }; } else other = { d: dd, p: T };
    });
    if (!best) return null;
    if (tf.flip) { tf.flip = false; if (other) best = other; }
    tf.last = best.p;
    return best.p;
  }
  // p9-sketch: the free end of a sliding tangent line with typed values v ({ len, ang }) for cursor Q: the length is
  // measured from the sliding tangent point (not the clicked point); a typed angle picks the tangent point whose line
  // at that angle passes nearer the cursor. null when nothing applies (inside the circle: from the clicked point).
  function tangentTyped(st, Q, v) {
    var f = UI.activeSketchFeature(), tf = st.tanFrom, e = f && tf && f.entities[tf.e];
    if (!e || !(e.r > 0) || !v || (v.len == null && v.ang == null)) return null;
    var c = [+e.cx || 0, +e.cy || 0], T = null, u;
    if (v.ang != null) {
      var D = Math.PI / 180, cv = { c: c, arc: e.t === 'arc' ? e : null };
      u = [Math.cos(v.ang * D), Math.sin(v.ang * D)];
      [1, -1].forEach(function (k) {
        var P = [c[0] - k * u[1] * e.r, c[1] + k * u[0] * e.r], dl = Math.abs((Q[0] - P[0]) * u[1] - (Q[1] - P[1]) * u[0]);
        if (onArc(cv, P) && (!T || dl < T.d)) T = { d: dl, p: P };
      });
      if (!T) return null;
      T = T.p; tf.last = T;
    } else {
      T = tangentStart(st, Q);
      if (!T) return null;
      var wx = Q[0] - T[0], wy = Q[1] - T[1], wl = Math.hypot(wx, wy);
      if (!(wl > 1e-12)) return null;
      u = [wx / wl, wy / wl];
    }
    var L = v.len != null ? v.len : Math.max(0, (Q[0] - T[0]) * u[0] + (Q[1] - T[1]) * u[1]);
    return [clean(T[0] + u[0] * L), clean(T[1] + u[1] * L)];
  }
  function sliding(st) { return !!(App.tool === 'line' && st && st.tanFrom && !st.tanFrom.off && !st.arcMode && st.pts.length === 1); }
  // r15/tangent15: the directions a line leaving P runs tangent to a circle / arc that P lies on (to the solver's
  // tolerance; inside an arc's sweep, not at its ends, which smoothDirs covers): [{ type: 'tangent', u, glyph }], both
  // ways round. Axis-aligned ones are left to H / V (the solver still infers Tangent there).
  function curveTangentDirs(f, P) {
    var out = [], tol = Math.max(1e-7, 1e-9 * Math.max(1, Math.abs(P[0]), Math.abs(P[1])) + 1e-9);
    f.entities.forEach(function (e) {
      if (!e || (e.t !== 'circle' && e.t !== 'arc') || !(e.r > 0)) return;
      var vx = P[0] - (+e.cx || 0), vy = P[1] - (+e.cy || 0), L = Math.hypot(vx, vy);
      if (Math.abs(L - e.r) >= tol) return;
      if (e.t === 'arc') {
        var sw = e.a1 - e.a0, rel = ((Math.atan2(vy, vx) * 180 / Math.PI - e.a0) % 360 + 360) % 360;
        if (sw < 360 && (rel < 1e-7 || rel > sw - 1e-7)) return;
      }
      var t = [-vy / L, vx / L];
      if (Math.abs(t[0]) < 1e-9 || Math.abs(t[1]) < 1e-9) return;
      out.push({ type: 'tangent', u: t, glyph: 'tangent' }, { type: 'tangent', u: [-t[0], -t[1]], glyph: 'tangent' });
    });
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
    var hk = toolHook(), he = hk && hk.entities ? hk.entities(pts, cur, all) : null;
    if (he) return he;
    if (UI.sketchFreeHooks[t] && UI.sketchFreeHooks[t].entities) return UI.sketchFreeHooks[t].entities(all, App.toolState || { pts: [] });
    var a = all[0], b = all[1], c = all[2];
    if (UI.sketchToolDefs[t] && UI.sketchToolDefs[t].entities) return UI.sketchToolDefs[t].entities(pts, cur, App.toolState || { pts: [] });   // p9-sketch-curves: tools defined in ui-sketch-*.js
    switch (t) {
      case 'line': {
        var st0 = App.toolState || {}, ta = st0.arcMode && st0.arcDir ? tangentArc(a, st0.arcDir, b) : null;
        var a0 = !ta && st0.tanFrom && !st0.tanFrom.off ? (tangentStart(st0, b) || a) : a;   // r15/tanslide15: the start slides round the curve
        return [ta || { t: 'line', x1: a0[0], y1: a0[1], x2: b[0], y2: b[1] }];
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
        var w = cleanLen(Math.max(2 * distPointLine(c, a, b), 0.01)), b2 = slotFarCentre(a, b, w);
        return [{ t: 'slot', x1: a[0], y1: a[1], x2: b2[0], y2: b2[1], w: w }];
      }
      case 'point': return [{ t: 'point', x: a[0], y: a[1] }];
    }
    return [];
  }
  function cleanLen(x) { return +x.toPrecision(12); }   // a radius rounded as a length stays 12.5, not 12.499999999999998
  // slot-overall: the Slot PropertyManager's Length option (ui-sketch-curves.js, Center to Center / Overall Length)
  // decides what a typed L means: with Overall Length the slot is L from cap to cap, so once its width w is known the
  // far centre comes in to L - w from the first (the clicked direction holds); the typed dimension is the overall one
  function slotOverall() { return !!(UI.sketchCurveOptions && UI.sketchCurveOptions().overall); }
  function slotFarCentre(a, b, w) {
    var st = App.toolState || {}, tl = st.typed && st.typed.len;
    if (tl == null || !slotOverall()) return b;
    var ux = b[0] - a[0], uy = b[1] - a[1], L0 = Math.hypot(ux, uy);
    if (!(L0 > 1e-12) || !(tl - w > 1e-9)) return b;
    return [cleanLen(a[0] + ux / L0 * (tl - w)), cleanLen(a[1] + uy / L0 * (tl - w))];
  }
  // p9-sketch-curves: drawing tools defined outside this file (ui-sketch-*.js): UI.sketchToolDefs[tool] = { steps,
  // entities(pts, cur, st), accept(st, p, typed) -> false refuses the click, after(f, firstIndex, count, st), fields(n, st),
  // live(pts, p, st), typed(pts, cur, v, st), readout(pts, p, fmt), refine(info, raw, st, h, grid) }; the helpers they share
  UI.sketchToolDefs = UI.sketchToolDefs || {};
  // sketch-hooks: what runs once a drawing tool has committed its entities, in the same click (and so the same undo
  // step): UI.sketchCommitHooks is a list of functions (f, n0, st) — f the sketch, n0 the index of the first entity the
  // tool added (f.entities.slice(n0) is what it added, with its typed dimensions and relations in place), st the tool
  // state. placePoint calls UI.afterSketchCommit(f, n0, st) for every tool that commits through it; a tool that adds
  // its entities itself (Spline, Parallel Line) calls it after they are in, and a UI.sketchFreeHooks tool whose click
  // added entities without calling it (Text) is committed by placePoint once its click is over. Dynamic Mirror
  // (ui-sketch-tools.js) mirrors the new entities from here.
  UI.sketchCommitHooks = UI.sketchCommitHooks || [];
  UI.sketchExitHooks = UI.sketchExitHooks || [];   // functions (f) run as sketch f is left (exitSketch)
  var commitSeq = 0;   // how many commits have run (placePoint tells whether a free tool's click made its own)
  UI.afterSketchCommit = function (f, n0, st) {
    if (!f || !(n0 < f.entities.length)) return;
    commitSeq++;
    UI.sketchCommitHooks.forEach(function (h) { try { h(f, n0, st || App.toolState || { pts: [] }); } catch (e) { console.error('sketch commit hook: ' + (e && e.message)); } });
  };
  UI.sketchGeom = { tangentArc: tangentArc, threePointArc: threePointArc, smoothDirs: smoothDirs, arcClockwise: arcClockwise, distPointLine: distPointLine, cleanLen: cleanLen, niceRound: niceRound, pxSize: pxSize };
  function distPointLine(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
  }
  function stepsNeeded() {
    var hk = toolHook();
    if (hk && hk.steps) return hk.steps();
    if (UI.sketchToolDefs[App.tool] && UI.sketchToolDefs[App.tool].steps) return UI.sketchToolDefs[App.tool].steps;   // p9-sketch-curves
    if (UI.sketchFreeHooks[App.tool] && UI.sketchFreeHooks[App.tool].steps) return UI.sketchFreeHooks[App.tool].steps(App.toolState || { pts: [] });
    switch (App.tool) { case 'arc': case 'arc3': case 'slot': return 3; case 'point': return 1; default: return 2; }
  }

  // rfA: points a tool computes rather than places infer nothing, as SolidWorks infers relations only where points are
  // placed: the centre of a Tangent / 3 Point Arc, a Perimeter Circle, a 3 Point Arc Slot and the Line tool's tangent arc
  // (a tangent arc whose centre happened to land on a rectangle edge's midpoint got a Midpoint), an ellipse's other axis
  // ends. The point refs skipped (SketchSolver.infer opts.skip), or null.
  var COMPUTED_CENTRE = { tarc: 1, arc3: 1, pcircle: 1, aslot3: 1 };
  function inferSkip() {
    if (COMPUTED_CENTRE[App.tool] || (App.tool === 'line' && App.toolState && App.toolState.arcMode)) return { skip: /\.c$/ };
    if (App.tool === 'ellipse' || App.tool === 'pellipse') return { skip: /\.v[123]$/ };
    return undefined;
  }
  // fidelity #8 (lane C for the rectangles, rfH for every tool): SolidWorks infers Coincident / Midpoint / Tangent only
  // where a point is placed, so SketchSolver.infer gets the points the tool placed (opts.placed: st.pts, plus the
  // sliding start of a tangent line, which is where the click landed on the curve): a point the tool computes (a
  // centerpoint slot's far centre, a polygon's other corners) infers nothing even where it lands on a line. A chain's
  // closing click is not pushed into st.pts: its segment infers at every point (the loop closes on the first point).
  // pts: the points placed; e: the entity (null for none); closing: the chain-closing segment
  // rfII: dirRel ({ type: 'parallel' | 'perpendicular', ref }: the woken-line lock the point was placed with; default
  // the tool state's, set by sketchClick) goes to the solver as opts.dirRels for a Line tool line
  function inferOpts(pts, e, closing, dirRel) {
    var o = inferSkip(), st = App.toolState;
    if (dirRel === undefined) dirRel = st ? st.dirRel : null;
    if (dirRel && e && e.t === 'line' && App.tool === 'line') { o = Object.assign({}, o || {}); o.dirRels = [dirRel]; }
    if (closing || !pts || !pts.length) return o;
    o = o ? Object.assign({}, o) : {};
    o.placed = pts.map(function (q) { return [q[0], q[1]]; });
    if (e && e.t === 'line' && App.tool === 'line' && st && st.tanFrom && !st.tanFrom.off && !st.arcMode) o.placed.push([e.x1, e.y1]);
    return o;
  }
  // the preview glyphs follow the commit (the point under the cursor is the one about to be placed)
  function previewInferOpts(p, e) {
    var st = App.toolState, pts = st && st.pts ? st.pts : [];
    var closing = App.tool === 'line' && pts.length && st.chainStart && Math.abs(p[0] - st.chainStart[0]) < 1e-9 && Math.abs(p[1] - st.chainStart[1]) < 1e-9;
    return inferOpts(pts.concat([p]), e, closing, st ? st.hoverDirRel || null : null);
  }
  function addEntity(e, closing) {
    var f = UI.activeSketchFeature();
    if (!f) return;
    if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
    if (App.drawConstruction) e.construction = true;   // the Centerline tool (ui-relations.js)
    if (UI.sketchLayerNew) UI.sketchLayerNew(f, e);   // sketch-layers: a new entity goes on the current layer
    f.entities.push(e);
    // automatic relations, as SolidWorks infers them while sketching (coincident / horizontal / vertical …), for the
    // points the tool placed (rfH)
    if (window.SketchSolver) SketchSolver.infer(f, f.entities.length - 1, inferOpts(App.toolState && App.toolState.pts, e, closing === true));
    // lane sketchref: points placed on a model vertex / midpoint / edge / centre are related to it (SolidWorks)
    if (UI.modelSnapRelations && App.toolState && App.toolState.modelSnaps && App.toolState.modelSnaps.length && skSetting('autoRelations')) { try { UI.modelSnapRelations(f, f.entities.indexOf(e), App.toolState.modelSnaps); } catch (err) { console.error('model snap relations: ' + (err && err.message)); } }
    // rfAR: Automatic Relations off still keeps a Line chain in one piece (SolidWorks: the segments share their ends)
    var stC = App.toolState;
    if (window.SketchSolver && !skSetting('autoRelations') && App.tool === 'line' && f.entities.length > 1 && stC && stC.chainStart) {
      var SSc = window.SketchSolver, iN = f.entities.length - 1, endsOf = function (i) { return SSc.pointRefs(f, i).filter(function (pr) { return /\.p\d$/.test(pr.ref); }); };
      var tie = function (j, at) {
        return endsOf(iN).some(function (a) {
          if (at && (Math.abs(a.pt[0] - at[0]) > 1e-9 || Math.abs(a.pt[1] - at[1]) > 1e-9)) return false;
          return endsOf(j).some(function (b) {
            if (Math.abs(a.pt[0] - b.pt[0]) > 1e-9 || Math.abs(a.pt[1] - b.pt[1]) > 1e-9) return false;
            (f.rels = f.rels || []).push({ type: 'coincident', refs: [b.ref, a.ref] });
            return true;
          });
        });
      };
      tie(iN - 1, stC.pts[0]);
      if (closing === true) { for (var jC = iN - 2; jC >= 0; jC--) if (tie(jC, stC.chainStart)) break; }   // the loop closes on the chain's first segment
    }
    App.gridStale = true;
    UI.updateSketches();
    UI.refreshTree();
  }

  function sketchClick(mx, my, ev) {
    var pl = UI.activePlane(), raw = UI.screenToPlane(mx, my, pl);
    if (!raw) return;
    if (App.command && App.command.onSketchPoint) { App.command.onSketchPoint(raw, mx, my); return; }
    if (rapidSwitch(mx, my)) return;   // rfAY: Rapid Sketch: a click on another plane / face moves the sketch there
    if (App.tool === 'select') {
      // a click selects the point or entity under the cursor, Ctrl / Shift toggle, the Selection Filter (ui-select.js,
      // which takes every Select-tool click: rfH, the plain pick that followed it here could not run)
      if (UI.sketchSelectClick) UI.sketchSelectClick(mx, my, ev);
      return;
    }
    if (App.tool === 'dimension') { dimToolClick(raw, mx, my); return; }
    var info0 = inferPoint(raw, mx, my), p = info0.p, typed = null;
    if (info0.snap && info0.snap.model && info0.snap.src) { var msl = App.toolState.modelSnaps = App.toolState.modelSnaps || []; msl.push({ pt: info0.p.slice(), snap: info0.snap }); if (msl.length > 8) msl.shift(); }   // lane sketchref
    App.toolState.lastSnap = info0.snap || null;   // r15/tanslide15: what the point landed on (a curve's index for the tangent slide)
    App.toolState.dirRel = (info0.dir && info0.dir.rel) || null;   // rfII: a woken-line lock: its Parallel / Perpendicular (inferOpts)
    if (App.quickSnap) { App.quickSnap = null; qsParallel = null; if (UI.refreshRibbon) UI.refreshRibbon(); }   // rfAR: a Quick Snap is for one pick
    // values typed into the on-screen box hold (the length, the radius …); the click supplies the rest
    if (numBox) { typed = numValues(); if (Object.keys(typed).length) p = typedPoint(p, typed); else typed = null; closeNumBox(); }
    // rfCF: the Line tool logs its clicks (screen point, the entities the click made, whether it pushed an undo
    // snapshot) for the double-click that ends the chain (the viewport's dblclick handler takes back what the
    // double-click's own two clicks made). The log lives on the tool state, so it is the chain's
    // rfCN: "this click pushed the snapshot" is the dirty flag's flip (addEntity pushes when it is clear and sets it;
    // every mouse press clears it), not the stack's growth: at 60 snapshots pushUndo shifts the oldest and the length
    // stays, so by length nothing ever counted as pushed and the discarded segment came back on the next Ctrl+Z
    var fL = App.tool === 'line' ? UI.activeSketchFeature() : null, nL = fL ? fL.entities.length : 0, cleanL = !App.sketchDirty;
    placePoint(p, typed);
    if (App.toolState) App.toolState.dirRel = null;
    if (fL && App.tool === 'line' && App.toolState) {
      var madeL = [];
      for (var kL = nL; kL < fL.entities.length; kL++) madeL.push(kL);
      App.toolState.clicks = (App.toolState.clicks || []).slice(-2).concat([{ sx: mx, sy: my, made: madeL, pushed: cleanL && !!App.sketchDirty }]);
    }
  }
  // The next point of the drawing tool: closes a Line chain on its first point, completes an entity once the tool has
  // all its points (adding a dimension for each value typed for it), otherwise waits for the next.
  function placePoint(p, typed) {
    var st = App.toolState;
    // a second click on the point just placed (the first half of a double-click) adds nothing: no zero-length lines
    var lastPt = st.pts[st.pts.length - 1];
    if (lastPt && Math.abs(p[0] - lastPt[0]) < 1e-9 && Math.abs(p[1] - lastPt[1]) < 1e-9) return;
    if (UI.sketchFreeHooks[App.tool] && UI.sketchFreeHooks[App.tool].click) {   // ui-sketch-spline, ui-sketch-text
      var fF = UI.activeSketchFeature(), nF = fF ? fF.entities.length : 0, seqF = commitSeq;
      if (UI.sketchFreeHooks[App.tool].click(p, st, typed)) {
        // sketch-hooks: what the click added is committed (Dynamic Mirror) unless the tool did it itself
        if (fF && commitSeq === seqF && fF.entities.length > nF && UI.activeSketchFeature() === fF) UI.afterSketchCommit(fF, nF, st);
        return;
      }
    }
    // clicking the chain's first point closes the loop and ends the chain (the Line tool stays active)
    if (App.tool === 'line' && st.pts.length && st.chainStart && Math.abs(p[0] - st.chainStart[0]) < 1e-9 && Math.abs(p[1] - st.chainStart[1]) < 1e-9) {
      var fc = UI.activeSketchFeature(), nc = fc ? fc.entities.length : 0;
      addEntity(toolEntities([st.pts[st.pts.length - 1]], p)[0], true);   // rfH: the closing point is in no st.pts
      if (fc && dimAllOnCreate() && fc.entities.length === nc + 1) typedDims(fc, nc, ALL_TYPED);   // r6/sketch6; lane CV: not with Create dimension only when value is entered
      if (fc && fc.entities.length === nc + 1) typedOutside(fc, nc);   // rfCR: the outline closed: its typed dimensions go outside it
      UI.afterSketchCommit(fc, nc, st);   // sketch-hooks: the closing segment is committed too (Dynamic Mirror)
      cancelTool(true);
      return;
    }
    // r15/snapaudit15: a point equal to one this tool already placed collapses the entity (a Centerpoint Arc ending on
    // its own centre became a 360° arc, a slot's width point on its first centre a 0.01-wide slot): the click is not taken
    if (st.pts.some(function (q) { return Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9; })) { UI.setStatus('That point is already part of the entity being drawn: click somewhere else.'); return; }
    if (UI.sketchToolDefs[App.tool] && UI.sketchToolDefs[App.tool].accept && UI.sketchToolDefs[App.tool].accept(st, p, typed) === false) return;   // p9-sketch-curves
    if (typed) st.typed = Object.assign(st.typed || {}, typed);
    st.pts.push(p);
    // r15/tanslide15: a Line started on a circle / arc (the on-curve snap, not one of its points) can slide tangent to
    // it. rfE (fidelity finding 5): only with Tangent start on (T with the Line tool, UI.setLineTangentStart); by
    // default the line starts where clicked with Coincident, as in SolidWorks (tanFrom.off: T still turns it on here)
    if (App.tool === 'line' && st.pts.length === 1 && st.lastSnap && st.lastSnap.kind === 'on' && st.lastSnap.e != null) {
      var fT = UI.activeSketchFeature(), eT = fT && fT.entities[st.lastSnap.e];
      if (eT && (eT.t === 'circle' || eT.t === 'arc')) {
        st.tanFrom = { e: st.lastSnap.e, p0: p.slice(), last: null, off: !lineTanStart };
        if (lineTanStart) { UI.setStatus('Tangent line from the ' + eT.t + ': its start follows the cursor round the curve. N takes the other tangent point, T draws from the clicked point instead.'); if ($('sketch-hint')) $('sketch-hint').innerHTML = 'Tangent line: its start slides round the ' + eT.t + '. Click the end, or type its length. <b>N</b>: the other tangent point. <b>T</b>: from the clicked point.'; }
      }
    }
    st.away = st.back = false;
    if (App.tool === 'arc' && st.pts.length === 2) { st.arcSweep = 0; st.lastAng = null; }   // the sweep starts at the start point
    if (st.pts.length >= stepsNeeded()) {
      var f = UI.activeSketchFeature(), n0 = f ? f.entities.length : 0;
      var ents = toolEntities(st.pts);
      // a 3 Point Arc through three points in a line is no arc: the third click is not taken
      if (App.tool === 'arc3' && (!ents[0] || ents[0].t !== 'arc')) { st.pts.pop(); UI.setStatus('The three points are in a line: click a point off the line from start to end.'); return; }
      // p9-sketch: a typed size is the entity's exact value (.281/2 is R 0.1405, not 0.140499999995 measured back from
      // a point rounded to 12 digits): circle / arc / polygon radius, slot width
      var tv0 = st.typed, e0 = ents[0];
      if (tv0 && e0 && ents.length === 1) {
        if (tv0.r != null && (e0.t === 'circle' || e0.t === 'poly' || (e0.t === 'arc' && App.tool === 'arc'))) e0.r = tv0.r;
        else if (tv0.d != null && e0.t === 'circle') e0.r = tv0.d / 2;
        if (tv0.w != null && e0.t === 'slot' && App.tool === 'slot') { e0.w = tv0.w; var fc2 = slotFarCentre([e0.x1, e0.y1], st.pts[1], e0.w); e0.x2 = fc2[0]; e0.y2 = fc2[1]; }   // slot-overall: the exact width sets the far centre (the Centerpoint Straight Slot's own entities do this)
      }
      var dimsBefore = UI.dimsSnapshot(f);   // rfHW: the dimensions this commit adds step clear of the others below
      var hkP = toolHook(), typedAll = dimAllOnCreate() ? Object.assign({}, ALL_TYPED, st.typed || {}) : st.typed;   // lane CV: only typed values with Create dimension only when value is entered
      if (!(hkP && hkP.commit && hkP.commit(ents, st, typedAll))) ents.forEach(function (e) { addEntity(e); });
      if (f && UI.sketchLayerNew) f.entities.slice(n0).forEach(function (e) { UI.sketchLayerNew(f, e); });   // sketch-layers: a tool's own commit
      // r6/sketch6: with Sketch Settings ▸ Enable on-screen numeric input on entity creation, every value of the new
      // entity gets a driving dimension (as SolidWorks), not only the typed ones
      if (f && typedAll && f.entities.length === n0 + 1) typedDims(f, n0, typedAll);
      if (hkP && hkP.after && f) hkP.after(f, n0, st);
      if (f && UI.sketchToolDefs[App.tool] && UI.sketchToolDefs[App.tool].after) UI.sketchToolDefs[App.tool].after(f, n0, f.entities.length - n0, st);   // p9-sketch-curves: Add dimensions, relations, the tool PM
      if (f) { try { clearDimPlacement(f, UI.newDimsSince(f, dimsBefore)); } catch (err) { console.error('dimension placement: ' + (err && err.message)); } }   // rfHW: Add dimensions / typed values clear of the other dimensions (never breaks the commit)
      UI.afterSketchCommit(f, n0, st);   // sketch-hooks: the entities are in, with their dimensions and relations
      st.typed = null;
      if (App.tool === 'line' && !(hkP && hkP.single && hkP.single())) {
        var last = st.pts[st.pts.length - 1];
        st.chainStart = st.chainStart || st.pts[0];
        st.pts = [last];
        if (st.tanFrom && $('sketch-hint')) $('sketch-hint').innerHTML = TOOL_HINTS.line;
        st.tanFrom = null;   // r15/tanslide15: the chain goes on from the free end
        // remember the chain start so closing the loop ends the tool
        st.pts.chainStart = st.chainStart;
        if (st.arcMode) setArcMode(false);   // after a tangent arc the chain goes on with lines, as in SolidWorks
      } else {
        st.pts = [];
      }
      App.tempEntities = [];
      UI.updateTemp();
    }
    autoNumBox();   // r9/sketch9: numeric input on: the box for the next value opens by itself
  }
  // A driving dimension for each value typed while drawing entity idx (SolidWorks adds them with on-screen numeric
  // input): a line's length, a rectangle's width / height, a circle's diameter, an arc / polygon radius, a slot's
  // length / width. Typed angles only set the direction (0 / 90° lines infer Horizontal / Vertical). One that would
  // over-define the sketch is left out.
  // r6/sketch6: Tools ▸ Sketch Settings ▸ Enable on-screen numeric input on entity creation (off by default; kept per
  // browser): every entity drawn gets its dimensions
  var ALL_TYPED = { len: 1, w: 1, h: 1, r: 1 }, numInputOn = null;
  // lane BP: the unit request box. For these tools the on-screen box opens by itself after the first click whatever
  // the numeric-input setting, and Enter is one-shot: the first Enter commits what the box shows (typed, or the live
  // value, which then holds), the second makes the entity and closes the tool. A command (Parallel Line) opens the
  // same box with UI.sketchUnitBox.open(spec, values) and gets onChange / onCommit / onFinish; unitOwner is its spec.
  var UNIT_BOX_TOOLS = { circle: 1, pcircle: 1 }, unitOwner = null;
  function numericInputOn() {
    if (numInputOn == null) { numInputOn = false; try { numInputOn = window.localStorage.getItem('anvil.sketchNumericInput') === '1'; } catch (e) { /* storage blocked */ } }
    return numInputOn;
  }
  // lane CV: Tools ▸ Sketch Settings ▸ Create dimension only when value is entered (SolidWorks' sub-option of the
  // on-screen numeric input): on, only the values typed in the box become dimensions; off (the default), every value of
  // an entity drawn with the numeric input on does. Without the numeric input, typed values make dimensions as before.
  function dimAllOnCreate() { return numericInputOn() && !skSetting('dimOnlyTyped'); }
  UI.sketchDimAllOnCreate = dimAllOnCreate;
  UI.sketchNumericInput = function (on) {
    if (on == null) return numericInputOn();
    numInputOn = !!on;
    try { window.localStorage.setItem('anvil.sketchNumericInput', numInputOn ? '1' : '0'); } catch (e) { /* storage blocked */ }
    return numInputOn;
  };
  // rfAR: Tools ▸ Sketch Settings, as SolidWorks 2024 has them (kept per browser, 'anvil.sketchSettings'):
  //   autoRelations  Automatic Relations — the relations a tool infers where its points land (off: none; a Line
  //                  chain's segments still share their ends)
  //   autoSolve      Automatic Solve — off: a drag moves the geometry without solving (as No Solve Move)
  //   snapping       Enable Snapping — off: no point / curve snaps, inference lines or alignments (as Ctrl held)
  //   noSolveMove    No Solve Move — a drag moves the entity alone; its relations and dimensions are not solved
  //   detachOnDrag   Detach Segment on Drag — dragging a line or arc breaks its shared ends (Coincident, Tangent there)
  //   overrideDims   Override Dims on Drag/Move — a dimensioned entity can be dragged; its dimensions take the new values
  //   ghostOnDrag    rfAY: Ghost image on drag — while sketch geometry is dragged its pre-drag shape stays drawn faded
  //   rapidSketch    rfAY: Rapid Sketch (the Sketch tab toggle, not in the menu) — a sketch tool picked with no sketch open
  //                  sketches on the plane / planar face clicked first, and moves to another one clicked between entities
  var SK_SET_DEF = { autoRelations: true, autoSolve: true, snapping: true, noSolveMove: false, detachOnDrag: false, overrideDims: false, ghostOnDrag: true, rapidSketch: false, dimOnlyTyped: false };   // lane CV: dimOnlyTyped
  var SK_SET_NAMES = { autoRelations: 'Automatic Relations', autoSolve: 'Automatic Solve', snapping: 'Enable Snapping', noSolveMove: 'No Solve Move', detachOnDrag: 'Detach Segment on Drag', overrideDims: 'Override Dims on Drag/Move', ghostOnDrag: 'Ghost image on drag', rapidSketch: 'Rapid Sketch', dimOnlyTyped: 'Create dimension only when value is entered' };
  var skSet = null;
  function skSettings() {
    if (skSet) return skSet;
    skSet = {};
    Object.keys(SK_SET_DEF).forEach(function (k) { skSet[k] = SK_SET_DEF[k]; });
    try { var o = JSON.parse(window.localStorage.getItem('anvil.sketchSettings') || '{}'); Object.keys(SK_SET_DEF).forEach(function (k) { if (typeof o[k] === 'boolean') skSet[k] = o[k]; }); } catch (e) { /* storage blocked */ }
    return skSet;
  }
  function skSetting(k) { return !!skSettings()[k]; }
  UI.sketchSettings = {
    NAMES: SK_SET_NAMES, DEFAULTS: SK_SET_DEF,
    get: function (k) { return skSetting(k); },
    all: function () { var s = skSettings(), o = {}; Object.keys(s).forEach(function (k) { o[k] = s[k]; }); return o; },
    set: function (k, v) {
      if (!(k in SK_SET_DEF)) throw new Error('Unknown sketch setting ' + k);
      skSettings()[k] = !!v;
      try { window.localStorage.setItem('anvil.sketchSettings', JSON.stringify(skSet)); } catch (e) { /* storage blocked */ }
      if (k === 'snapping' || k === 'autoRelations') { App.inferPreview = []; clearFeedback(); }
      if (k === 'rapidSketch' && !v) rapidDisarm();   // rfAY
      return !!v;
    },
    toggle: function (k) { return UI.sketchSettings.set(k, !skSetting(k)); },
    reset: function () { Object.keys(SK_SET_DEF).forEach(function (k) { UI.sketchSettings.set(k, SK_SET_DEF[k]); }); }
  };
  // Automatic Relations off: SketchSolver.infer (every drawing tool calls it for the points it placed) adds nothing.
  // Commands that add their relations themselves (a rectangle's sides, Mirror, Offset …) are not affected.
  if (window.SketchSolver && !SketchSolver.infer.rfAR) {
    (function (SS0) {
      var inf0 = SS0.infer;
      SS0.infer = function () { return skSetting('autoRelations') ? inf0.apply(SS0, arguments) : []; };
      SS0.infer.rfAR = true;
    })(window.SketchSolver);
  }

  // ---- rfAY: Ghost image on drag (Tools ▸ Sketch Settings): while sketch geometry is dragged (the Select tool's
  // solver drag, a free Sketch Text), every entity that has moved is drawn faded where it was when the drag began,
  // until the release. The pre-drag entities are kept as JSON; an entity equal to its copy draws no ghost.
  var skGhost = null, skGhostMat = null;
  function ghostWrap(hook) {
    if (!hook || hook.rfAYGhost) return hook;
    var s0 = hook.start, e0 = hook.end;
    hook.rfAYGhost = true;
    hook.start = function () {
      var f = UI.activeSketchFeature();
      skGhost = f && skSetting('ghostOnDrag') ? { id: f.id, before: f.entities.map(function (e) { return JSON.stringify(e); }), ents: {} } : null;
      return s0.apply(this, arguments);
    };
    hook.end = function () {
      try { return e0.apply(this, arguments); }
      finally { if (skGhost) { skGhost = null; UI.updateSketches(); } }
    };
    return hook;
  }
  function ghostObjects(f, pl) {
    if (!skGhost || !f || f.id !== skGhost.id) return [];
    var pls = [], n = 0;
    skGhost.before.forEach(function (js, i) {
      var cur = f.entities[i];
      if (cur && JSON.stringify(cur) === js) return;
      var e = skGhost.ents[i] || (skGhost.ents[i] = JSON.parse(js));
      if (e.t === 'point') {
        var a = UI.screenToPlane(0, 0, pl), b = UI.screenToPlane(3, 0, pl), s = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0.1;
        pls.push({ pts: [[e.x - s, e.y], [e.x + s, e.y]], closed: false }, { pts: [[e.x, e.y - s], [e.x, e.y + s]], closed: false });
      } else { try { pls = pls.concat((UI.screenPolylines || K.entityPolylines)(e)); } catch (err) { return; } }
      n++;
    });
    if (!pls.length) return [];
    if (!skGhostMat) skGhostMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35, depthTest: false, depthWrite: false });
    skGhostMat.color.copy(UI.mats && UI.mats.sketch ? UI.mats.sketch.color : new THREE.Color(0xffffff));
    var ls = new THREE.LineSegments(UI.lineGeometryFromPolylines(pl, pls), skGhostMat);
    ls.renderOrder = 9;
    ls.userData = { sketchGhost: true, count: n };
    return [ls];
  }
  if (UI.sketchOverlayHooks) UI.sketchOverlayHooks.push(ghostObjects);
  UI.sketchGhostWrap = ghostWrap;
  // the number of entities drawn as a ghost now (0 with no drag, or the setting off)
  UI.sketchGhostCount = function () {
    var f = UI.activeSketchFeature(), n = 0;
    if (!f || !skGhost) return 0;
    ghostObjects(f, UI.activePlane()).forEach(function (o) { n += o.userData.count; o.geometry.dispose(); });
    return n;
  };

  // ---- rfAY: Rapid Sketch (SolidWorks: the Sketch tab toggle). With it on and no sketch open, a sketch-entity tool is
  // armed instead of greyed: planes and planar faces highlight under the cursor, and the first click on one opens a
  // sketch there (the view stays as it is) and places the entity's first point where the click was. While a drawing
  // tool is on and no entity is in progress, moving onto another plane / face highlights it, and a click there closes
  // this sketch (an empty one is discarded, as Exit Sketch does) and opens one on the new plane / face, the entity
  // starting there. Esc, or the tool put down, ends it; turning Rapid Sketch off disarms a waiting tool.
  // App.command { pickPlane, rapidSketch, rapidItem } is the armed state (the ribbon item, or { tool } from setTool).
  var rapidItem = null;
  function rapidOn() { return skSetting('rapidSketch'); }
  function rapidArmed() { return !!(App.mode !== 'sketch' && App.command && App.command.rapidSketch); }
  function rapidItemLabel(item) { return String(item.label || item.tool || 'entity').replace(/\s*\n\s*/g, ' '); }
  function rapidArm(item) {
    if (UI.isAssembly && UI.isAssembly()) { UI.toast('Sketches are not available in an assembly document'); return false; }
    if (rapidArmed() && (App.command.rapidItem === item || (!item.id && App.command.rapidItem.tool === item.tool))) { rapidDisarm(); return false; }   // its button again: off
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    App.sel = null; App.sel2 = null;
    App.command = { pickPlane: true, rapidSketch: true, rapidItem: item, onPick: function (pk) { return rapidStart(pk, item) !== false; } };
    viewport.classList.add('tool-cross');
    viewport.setAttribute('data-sktool', item.tool || 'line');
    UI.updatePlanes(); UI.updateHighlights();
    UI.setStatus('Rapid Sketch: click a plane or a planar face to start the ' + rapidItemLabel(item) + ' there (Esc cancels).');
    if (UI.refreshRibbon) UI.refreshRibbon();
    return true;
  }
  function rapidDisarm() {
    if (!(App.command && App.command.rapidSketch)) return;
    App.command = null;
    App.hover = null;
    if (App.mode !== 'sketch') { viewport.classList.remove('tool-cross'); viewport.removeAttribute('data-sktool'); }
    UI.updatePlanes(); UI.updateHighlights();
    if (UI.refreshRibbon) UI.refreshRibbon();
  }
  // the plane of a pick, for the "is it the sketch's own plane" test: { n, d } with n·x = d
  function rapidPickPlane(pk) {
    if (pk.kind === 'plane' && pk.plane) return { n: pk.plane.n, d: K.vec.dot(pk.plane.n, pk.plane.origin) };
    var fc = pk.kind === 'face' && App.mesh && App.mesh.faces[pk.index];
    return fc ? { n: fc.normal, d: isFinite(fc.w) ? fc.w : K.vec.dot(fc.normal, pk.point || fc.centroid) } : null;
  }
  function samePlane(a, pl) {
    var c = K.vec.dot(a.n, pl.n), tol = 1e-6 * Math.max(1, Math.abs(a.d));
    return Math.abs(Math.abs(c) - 1) < 1e-7 && Math.abs(a.d - c * K.vec.dot(pl.n, pl.origin)) < tol;
  }
  // a plane / planar face under the cursor that is not the open sketch's plane (none next to the sketch's own geometry)
  function rapidOtherPick(mx, my) {
    if (UI.pickEntity && UI.pickEntity(mx, my)) return null;
    var pk = UI.pickFace(mx, my) || UI.pickPlane(mx, my);
    var pp = pk && rapidPickPlane(pk);
    return pp && !samePlane(pp, UI.activePlane()) ? pk : null;
  }
  // in a sketch: Rapid Sketch's switch applies with a drawing tool on and nothing in progress
  function rapidCanSwitch() {
    return rapidOn() && App.mode === 'sketch' && App.tool !== 'select' && App.tool !== 'dimension' && !App.command &&
      !(App.toolState && App.toolState.pts && App.toolState.pts.length) && !(UI.isAssembly && UI.isAssembly());
  }
  function rapidNewSketch(pk) {
    var plane, face = null;
    if (pk.kind === 'plane') plane = typeof pk.ref === 'number' ? { featureId: pk.ref } : { ref: pk.ref, offset: 0 };
    else { face = App.mesh.faces[pk.index]; if (!face) return null; plane = UI.facePlane(face, pk.point || face.centroid); }
    UI.pushUndo();
    var f = { id: App.model.nextId++, type: 'sketch', plane: plane, entities: [] };
    f.name = K.featureName(App.model, 'sketch');
    if (face) { try { var fo = K.faceOutline(App.mesh, pk.index); if (fo) f.faceLoops = fo.loops; } catch (e) { /* no outline */ } }
    App.model.features.push(f);
    App.sketchSnapshot = JSON.stringify({ entities: [] });
    App.newSketchId = f.id;
    return f;
  }
  function rapidRunItem(item) {
    if (item.run) item.run();
    else setTool(item.tool);
    if (item.lineMode && UI.lineMode && UI.lineMode() !== item.lineMode) {   // Centerline / Midpoint Line carried across
      if (item.lineMode === 'centerline' && UI.cmdCenterline) UI.cmdCenterline();
      else if (item.lineMode === 'midline' && UI.cmdMidpointLine) UI.cmdMidpointLine();
    }
    if (UI.refreshRibbon) UI.refreshRibbon();
  }
  // open a sketch on the pick, with the tool, and place the entity's first point at the screen point s
  function rapidStart(pk, item, s) {
    var at = s || (pk.point ? UI.worldToScreen(pk.point) : null);
    if (!at) return false;
    if (App.command && App.command.rapidSketch) App.command = null;
    App.hover = null; rapidHoverKey = null;
    var f = rapidNewSketch(pk);
    if (!f) return false;
    rapidItem = item;
    enterSketch(f.id, { keepView: true });
    UI.rebuild();
    rapidRunItem(item);
    UI.setStatus('Rapid Sketch: sketching on ' + (pk.kind === 'plane' ? pk.name || 'the plane' : 'the face') + ' (' + f.name + '). Click another plane or face between entities to move there.');
    sketchClick(at[0], at[1]);
    return true;
  }
  // a click in a sketch: on another plane / face with Rapid Sketch's switch on, move there; true when it did
  function rapidSwitch(mx, my) {
    if (!rapidCanSwitch()) return false;
    var pk = rapidOtherPick(mx, my);
    if (!pk) return false;
    var item = rapidItem && rapidItem.tool === App.tool ? rapidItem : { tool: App.tool };
    if (App.tool === 'line' && UI.lineMode) item = { tool: 'line', label: item.label, lineMode: UI.lineMode() };
    var s = pk.point ? UI.worldToScreen(pk.point) : [mx, my];
    App.hover = null;
    exitSketch(true);
    rapidStart(pk, item, s);
    return true;
  }
  // the hover while sketching: another plane / face lights up where a click would move the sketch
  var rapidHoverKey = null;
  function rapidHover(mx, my) {
    var pk = rapidCanSwitch() ? rapidOtherPick(mx, my) : null;
    var key = pk ? pk.kind + ':' + (pk.kind === 'plane' ? pk.ref : pk.index) : null;
    if (key === rapidHoverKey) return;
    rapidHoverKey = key;
    App.hover = pk;
    UI.updateHighlights();
  }
  UI.rapidSketchOn = rapidOn;
  UI.toggleRapidSketch = function (on) {
    var v = UI.sketchSettings.set('rapidSketch', on == null ? !rapidOn() : !!on);
    UI.setStatus(v ? 'Rapid Sketch on: pick a sketch tool, then click a plane or planar face to sketch on it.' : 'Rapid Sketch off.');
    if (UI.refreshRibbon) UI.refreshRibbon();
    return v;
  };
  UI.rapidSketchArm = rapidArm;
  UI.rapidSketchArmed = function () { return rapidArmed() ? App.command.rapidItem : null; };
  UI.rapidSketchHover = function () { return rapidHoverKey; };
  // Esc with a tool armed and no sketch open disarms it (before ui-app.js's Esc only clears the selection)
  window.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' || !rapidArmed()) return;
    var tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    rapidDisarm();
    UI.setStatus('Rapid Sketch tool cancelled.');
    ev.preventDefault(); ev.stopPropagation();
  }, true);

  // ---- lane mcdirect (user 2026-11-11: "update all the greyed out settings to actually work"): a drawing tool with no
  // sketch open starts one, in the way of the active interface profile (data, not a fork: the profile's
  // `wireframe: { direct, plane }` section, read through UI.Profiles.def):
  //  * SolidWorks (no section): a plane / planar face already selected opens the sketch there with the tool on;
  //    otherwise the Edit Sketch PropertyManager asks for one (the standard planes shown) and the pick opens the sketch
  //    with the tool on (pendingStart, applied at the end of enterSketch); Esc / ✗ cancels it and nothing is left.
  //  * wireframe.direct (Mastercam): the tool draws at once on the construction plane (UI.cplane(), ui-core.js): an
  //    ordinary sketch named as sketches are, opened without turning the view and without the confirmation corner
  //    (#viewport.mc-direct); the tool stays on for the next entity, a second tool goes on in the same sketch, Esc with
  //    no tool on closes it (empty: discarded), a solids command closes it and takes it (withSketch, ui-commands.js),
  //    a new construction plane closes it and starts the next on the new plane, a profile switch closes it.
  //  * Rapid Sketch on (rfAY, SolidWorks' toggle): the tool is armed until a plane / face is clicked, as before.
  var pendingStart = null, directId = null, profHooked = false;
  function profDef() { try { return UI.Profiles && UI.Profiles.def ? UI.Profiles.def(UI.Profiles.active()) : null; } catch (e) { return null; } }
  function directOn() { var p = profDef(); return !!(p && p.wireframe && p.wireframe.direct); }
  function directOpen() { return directId != null && App.mode === 'sketch' && App.activeSketch === directId; }
  function sketchToolStart(item) {
    if (typeof item === 'string') item = { tool: item };
    if (!item || !item.tool) return false;
    if (UI.isAssembly && UI.isAssembly()) { UI.toast('Sketches are not available in an assembly document'); return false; }
    hookProfiles();
    if (directOn()) return directStart(item);
    if (rapidOn()) return rapidArm(item);
    return promptStart(item);
  }
  function promptStart(item) {
    var label = rapidItemLabel(item);
    rapidDisarm();
    pendingStart = item;
    if (App.sel && (App.sel.kind === 'face' || App.sel.kind === 'plane')) {   // preselected: the sketch opens there at once
      if (UI.hasPM && UI.hasPM()) UI.closePM();
      UI.cmdSketch();
      return true;
    }
    var pickedRef = function (pk) { App.sel = pk; UI.cmdSketch(); return true; };
    UI.openPM({
      title: 'Edit Sketch', icon: 'sketch',
      message: 'Select a plane on which to create a sketch for the entity (<b>' + label.replace(/</g, '&lt;') + '</b>): a <b>plane</b> or a <b>planar face</b>. The standard planes are shown in the graphics area.',
      command: { pickPlane: true, onPick: pickedRef },
      groups: [{ title: 'Standard planes', fields: [{ type: 'buttons', buttons: ['Front', 'Top', 'Right'].map(function (r) { return { label: r + ' Plane', onclick: function () { UI.newSketchOnPlane(r); } }; }) }] }],
      onCancel: function () { pendingStart = null; UI.setStatus(label + ' cancelled.'); }
    });
    // the PM's message names the tool; a pick of the plane is waited for
    UI.setStatus('Edit Sketch: select a plane or a planar face for the ' + label + ' (Esc cancels).');
    return true;
  }
  // the construction plane's sketch frame ({ ref } | { featureId } | a custom frame for Back / Bottom / Left)
  function cplaneSketchPlane() {
    var spec = UI.cplaneSketchPlane ? UI.cplaneSketchPlane() : null;
    return spec || { ref: 'Top', offset: 0 };
  }
  function directStart(item) {
    if (App.mode === 'sketch') { rapidRunItem(item); return true; }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    rapidDisarm(); pendingStart = null;
    UI.pushUndo();
    var f = { id: App.model.nextId++, type: 'sketch', plane: cplaneSketchPlane(), entities: [] };
    f.name = K.featureName(App.model, 'sketch');
    App.model.features.push(f);
    App.sketchSnapshot = JSON.stringify({ entities: [] });
    App.newSketchId = f.id;
    directId = f.id;
    viewport.classList.add('mc-direct');
    enterSketch(f.id, { keepView: true });
    UI.rebuild();
    rapidRunItem(item);
    var cp = UI.cplaneLabel ? UI.cplaneLabel() : 'Top';
    UI.setStatus(rapidItemLabel(item) + ' on the ' + cp + ' construction plane (' + f.name + '). Esc puts the tool down; Esc again closes the geometry.');
    return true;
  }
  // close the open direct geometry (kept unless empty), staying on the CommandManager tab the user was on
  function directClose() {
    if (!directOpen()) return UI.whenIdle();
    var tab = App.ribbonTab, p = exitSketch(true);
    if (tab && UI.setRibbonTab) UI.setRibbonTab(tab);
    return p;
  }
  UI.sketchExitHooks = UI.sketchExitHooks || [];
  UI.sketchExitHooks.push(function () { directId = null; viewport.classList.remove('mc-direct'); });
  function hookProfiles() {
    if (profHooked || !UI.Profiles || !UI.Profiles.onChange) return;
    profHooked = true;
    UI.Profiles.onChange(function () {
      if (directOpen()) directClose();   // (d) a profile switch closes the direct geometry cleanly
      var p = profDef();
      if (p && p.wireframe && p.wireframe.plane && UI.setCplane) UI.setCplane(p.wireframe.plane);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(hookProfiles, 0); });
  else setTimeout(hookProfiles, 0);
  // a new construction plane while drawing: this geometry closes and the next goes on the new plane, with the same tool
  if (UI.onCplane) UI.onCplane(function () {
    if (!directOpen()) return;
    var item = App.tool && App.tool !== 'select' && App.tool !== 'dimension' ? { tool: App.tool } : null;
    if (item && item.tool === 'line' && UI.lineMode && UI.lineMode() !== 'line') item.lineMode = UI.lineMode();
    directClose();
    if (item) directStart(item);
  });
  // Esc with no tool on (and nothing selected, no PropertyManager, menu or box open) closes the direct geometry
  window.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' || !directOpen()) return;
    var tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (App.tool !== 'select' || (UI.hasPM && UI.hasPM()) || (UI.menuOpen && UI.menuOpen()) || ($('modal') && !$('modal').hidden)) return;
    if (App.sel || (UI.selection && UI.selection().length) || (App.toolState && App.toolState.pts && App.toolState.pts.length)) return;
    if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) return;
    directClose();
    UI.setStatus('Geometry closed.');
  }, true);
  UI.sketchToolStart = sketchToolStart;
  UI.directWireframe = function () { return { on: directOn(), open: directOpen(), sketch: directOpen() ? directId : null }; };
  UI.closeDirectWireframe = directClose;

  // ---- rfAR: Quick Snaps (SolidWorks: Sketch tab ▸ Quick Snaps, or right-click while sketching): the next point snaps
  // to that one kind of geometry only (within a wider reach), then the usual inference comes back
  var QUICK_SNAPS = [
    ['point', 'Point'], ['center', 'Center Point'], ['midpoint', 'Midpoint'], ['quadrant', 'Quadrant'], ['intersection', 'Intersection'],
    ['nearest', 'Nearest'], ['tangent', 'Tangent'], ['perpendicular', 'Perpendicular'], ['parallel', 'Parallel'],
    ['hvLines', 'Horizontal/Vertical'], ['hvPoints', 'Horizontal/Vertical to Points'], ['length', 'Length'], ['grid', 'Grid'], ['angle', 'Angle']
  ];
  var QS_PX = 20, qsParallel = null, QS_ANGLE = 45;
  UI.QUICK_SNAPS = QUICK_SNAPS;
  UI.quickSnapAngle = function () { return QS_ANGLE; };
  UI.quickSnap = function (kind) {
    if (kind === undefined) return App.quickSnap || null;
    if (kind && !QUICK_SNAPS.some(function (q) { return q[0] === kind; })) throw new Error('Unknown quick snap ' + kind);
    if (kind && App.mode !== 'sketch') { UI.toast('Open a sketch and pick a drawing tool first.'); return null; }
    if (kind && (App.tool === 'select' || App.tool === 'dimension')) setTool('line');   // (SolidWorks starts the Line tool)
    App.quickSnap = kind || null;
    qsParallel = null;
    if (kind) {
      var name = QUICK_SNAPS.filter(function (q) { return q[0] === kind; })[0][1];
      UI.setStatus('Quick Snap ' + name + ': the next point snaps to ' + name.toLowerCase() + ' only; then snapping goes back to normal.');
    }
    clearFeedback();
    if (UI.refreshRibbon) UI.refreshRibbon();
    return App.quickSnap;
  };
  // Where the point goes under quick snap qs, or null (nothing of that kind within reach: the point stays free)
  function quickSnapPoint(qs, f, pl, raw, mx, my, px, st, prev, out) {
    function scr(p) { return UI.worldToScreen(K.to3D(pl, p[0], p[1])); }
    function dpx(p) { var s = scr(p); return Math.hypot(s[0] - mx, s[1] - my); }
    function nearestOf(list) { var b = null, bd = QS_PX; list.forEach(function (c) { var d = dpx(c.pt); if (d < bd) { bd = d; b = c; } }); return b; }
    function take(pt, kind) { out.p = [pt[0], pt[1]]; out.snap = { kind: kind, pt: out.p }; return out; }
    var pts = sketchPoints(f), on = curveSnap(f, pl, [mx, my], QS_PX), eOn = on ? f.entities[on.e] : null, c;
    var h = 0.5 * px * 1.05;
    switch (qs) {
      case 'point':
        c = nearestOf(pts.filter(function (x) { return x.kind === 'end'; }).concat([{ pt: [0, 0], kind: 'origin' }]));
        return c ? take(c.pt, c.kind) : null;
      case 'center': case 'midpoint': case 'quadrant': {
        var kind = qs, own = pts.filter(function (x) { return x.kind === kind; });
        c = nearestOf(own);
        if (c) return take(c.pt, kind);
        if (!eOn) return null;
        // hovering the curve itself: its centre / midpoint / nearest quadrant
        if (kind === 'center' && (eOn.t === 'circle' || eOn.t === 'arc')) return take([+eOn.cx || 0, +eOn.cy || 0], 'center');
        if (kind === 'midpoint' && eOn.t === 'line') return take([(eOn.x1 + eOn.x2) / 2, (eOn.y1 + eOn.y2) / 2], 'midpoint');
        if (kind === 'quadrant' && (eOn.t === 'circle' || eOn.t === 'arc')) {
          var bq = null;
          [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(function (d) { var q = [eOn.cx + d[0] * eOn.r, eOn.cy + d[1] * eOn.r]; if (!bq || Math.hypot(q[0] - on[0], q[1] - on[1]) < Math.hypot(bq[0] - on[0], bq[1] - on[1])) bq = q; });
          return take(bq, 'quadrant');
        }
        return null;
      }
      case 'intersection':
        c = nearestOf(pts.filter(function (x) { return x.kind === 'intersection'; }));
        return c ? take(c.pt, 'intersection') : null;
      case 'nearest':
        if (!on) return null;
        out.p = on.slice(); out.snap = { kind: 'on', pt: out.p, e: on.e }; return out;
      case 'tangent': {
        if (!prev || !eOn || !(eOn.t === 'circle' || eOn.t === 'arc')) return null;
        var cx = +eOn.cx || 0, cy = +eOn.cy || 0, dx = prev[0] - cx, dy = prev[1] - cy, D = Math.hypot(dx, dy);
        if (!(D > eOn.r + 1e-12)) return null;
        var base = Math.atan2(dy, dx), al = Math.acos(eOn.r / D), best = null;
        [base + al, base - al].forEach(function (a) { var q = [cx + eOn.r * Math.cos(a), cy + eOn.r * Math.sin(a)]; if (!best || Math.hypot(q[0] - raw[0], q[1] - raw[1]) < Math.hypot(best[0] - raw[0], best[1] - raw[1])) best = q; });
        out.p = best; out.snap = { kind: 'on', pt: best, e: on.e }; return out;
      }
      case 'perpendicular': {
        if (!prev || !eOn || eOn.t !== 'line') return null;
        var ux = eOn.x2 - eOn.x1, uy = eOn.y2 - eOn.y1, L2 = ux * ux + uy * uy;
        if (!(L2 > 0)) return null;
        var t = ((prev[0] - eOn.x1) * ux + (prev[1] - eOn.y1) * uy) / L2, ft = [eOn.x1 + t * ux, eOn.y1 + t * uy];
        out.p = ft; out.snap = { kind: 'on', pt: ft, e: on.e }; return out;
      }
      case 'parallel': {
        // hover a line to take its direction, then the new line runs parallel to it from the last point
        if (eOn && eOn.t === 'line') { var lx = eOn.x2 - eOn.x1, ly = eOn.y2 - eOn.y1, ll = Math.hypot(lx, ly); if (ll > 0) qsParallel = [lx / ll, ly / ll]; }
        if (!prev || !qsParallel) return null;
        var u = qsParallel, s = (raw[0] - prev[0]) * u[0] + (raw[1] - prev[1]) * u[1];
        s = niceRound(s, h);
        out.p = [prev[0] + u[0] * s, prev[1] + u[1] * s]; out.dir = { type: 'parallel', from: prev, u: s < 0 ? [-u[0], -u[1]] : u }; return out;
      }
      case 'hvLines': case 'hvPoints': {
        var targets = qs === 'hvLines' ? (prev ? [prev] : []) : pts.map(function (x) { return x.pt; }).concat([[0, 0]]).filter(function (p) { return !prev || p[0] !== prev[0] || p[1] !== prev[1]; });
        var tol = QS_PX * px, ax = null, ay = null;
        targets.forEach(function (p) {
          var ddx = Math.abs(raw[0] - p[0]), ddy = Math.abs(raw[1] - p[1]);
          if (ddx < tol && (!ax || ddx < ax.d)) ax = { d: ddx, p: p };
          if (ddy < tol && (!ay || ddy < ay.d)) ay = { d: ddy, p: p };
        });
        if (ax && ay) { if (ax.d <= ay.d) ay = null; else ax = null; }
        if (!ax && !ay) return null;
        out.p = [ax ? ax.p[0] : niceRound(raw[0], h), ay ? ay.p[1] : niceRound(raw[1], h)];
        out.align.push(ax ? { from: ax.p, axis: 'x', prev: qs === 'hvLines' } : { from: ay.p, axis: 'y', prev: qs === 'hvLines' });
        return out;
      }
      case 'length': {
        if (!prev) return null;
        var vx = raw[0] - prev[0], vy = raw[1] - prev[1], r = Math.hypot(vx, vy), step = UI.snapStep ? UI.snapStep() : 1;
        if (!(r > 1e-12) || !(step > 0)) return null;
        var rr = Math.max(step, Math.round(r / step) * step);
        out.p = [prev[0] + vx / r * rr, prev[1] + vy / r * rr]; return out;
      }
      case 'grid': {
        var g = UI.snapStep ? UI.snapStep() : 1;
        out.p = [+(Math.round(raw[0] / g) * g).toPrecision(12), +(Math.round(raw[1] / g) * g).toPrecision(12)];
        if (window.SketchSolver.onCurveRef && window.SketchSolver.onCurveRef(f, -1, out.p, 1e-7)) out.snap = { kind: 'on', pt: out.p.slice() };
        return out;
      }
      case 'angle': {
        if (!prev) return null;
        var ax2 = raw[0] - prev[0], ay2 = raw[1] - prev[1], R = Math.hypot(ax2, ay2);
        if (!(R > 1e-12)) return null;
        // lane HP: SolidWorks' Snap angle (System Options ▸ Relations/Snaps; 45° on the user's seat, was 15° here), measured
        // from the line the point starts at the end of (its help: "the snap angle is based on the existing line"), else from X
        var base = 0, st0 = QS_ANGLE * Math.PI / 180;
        for (var li = f.entities.length - 1; li >= 0; li--) {
          var L0 = f.entities[li];
          if (!L0 || L0.t !== 'line' || L0.construction) continue;
          var tolA = 1e-9 * Math.max(1, Math.abs(prev[0]), Math.abs(prev[1]));
          if (Math.hypot(L0.x2 - prev[0], L0.y2 - prev[1]) <= tolA) { base = Math.atan2(L0.y2 - L0.y1, L0.x2 - L0.x1); break; }
          if (Math.hypot(L0.x1 - prev[0], L0.y1 - prev[1]) <= tolA) { base = Math.atan2(L0.y1 - L0.y2, L0.x1 - L0.x2); break; }
        }
        var A = base + Math.round((Math.atan2(ay2, ax2) - base) / st0) * st0, Rr = niceRound(R, h);
        out.p = [prev[0] + Math.cos(A) * Rr, prev[1] + Math.sin(A) * Rr];
        if (Math.abs(out.p[0] - prev[0]) < 1e-12) out.p[0] = prev[0];
        if (Math.abs(out.p[1] - prev[1]) < 1e-12) out.p[1] = prev[1];
        out.dir = { type: 'angle', from: prev, u: [Math.cos(A), Math.sin(A)] }; return out;
      }
    }
    return null;
  }
  // rfCR (sketch user report #12): a dimension made from a value typed while drawing sits TYPED_PX off its entity, so
  // its text clears the line by about one text height and a gap, as SolidWorks places them at the shop's zoom (it was
  // 14 px: the text 6 px off the line). On a closed outline it goes outside the region, whichever way the outline was
  // drawn: when a Line chain closes, each typed length dimension on the loop whose dimension line lies inside the
  // region flips to the other side (typedOutside). An open chain keeps the side rule (the left of the line's direction,
  // where `off` is positive). typedMade: the dimension objects typedDims made (the ones typedOutside may flip).
  var TYPED_PX = 26, typedMade = [];
  function typedDims(f, idx, typed) {
    var e = f.entities[idx], s = UI.cam.scale || 0.1, off = Math.round(TYPED_PX * s * 1e4) / 1e4, list = [];
    if (!e) return;
    function lin(k, o) { list.push({ e: idx, k: k, off: o }); }
    function rad(k) { list.push({ e: idx, k: k, ang: 45, off: Math.round((e.r + TYPED_PX * s) * 1e4) / 1e4 }); }
    switch (e.t) {
      case 'line': if (typed.len != null) lin('len', off); break;
      case 'rect': case 'crect': if (typed.w != null) lin('w', -off); if (typed.h != null) lin('h', off); break;
      case 'circle': if (typed.r != null || typed.d != null) rad('dia'); break;
      case 'arc': if (typed.r != null && (App.tool === 'arc' || App.tool === 'arc3')) rad('r'); break;
      case 'poly': if (typed.r != null) rad('r'); break;
      // p9-sketch: outside the slot — the length beside its side, the width beyond its first end (both sat inside it,
      // the width's label on the length's line)
      case 'slot': if (typed.len != null) lin(slotOverall() ? 'olen' : 'len', Math.round((e.w / 2 + TYPED_PX * s) * 1e4) / 1e4); if (typed.w != null) lin('w', -Math.round((e.w / 2 + TYPED_PX * s) * 1e4) / 1e4); break;   // slot-overall
    }
    list.forEach(function (d) {
      f.dims = f.dims || [];
      f.dims.push(d);
      if (window.SketchSolver && SketchSolver.overDefines(f, 'dim', f.dims.length - 1)) f.dims.pop();
      else { typedMade.push(d); if (typedMade.length > 200) typedMade.shift(); }
    });
    if (f.dims && !f.dims.length) delete f.dims;
    App.dimsStale = true;
    if (list.length) UI.updateSketches();
  }
  // The closed loop of lines / arcs through entity idx (end to end, within 1e-6), or null: [{ i, fwd }] in order, fwd =
  // the entity is run p1 -> p2 along the loop.
  function closedLoopThrough(f, idx) {
    var E = f.entities, S = window.SketchSolver;
    if (!S || !E[idx] || (E[idx].t !== 'line' && E[idx].t !== 'arc')) return null;
    function ends(i) { return S.pointRefs(f, i).filter(function (pr) { return /\.p[12]$/.test(pr.ref); }).map(function (pr) { return pr.pt; }); }
    function same(a, b) { return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6; }
    var e0 = ends(idx);
    if (e0.length !== 2 || same(e0[0], e0[1])) return null;
    var loop = [{ i: idx, fwd: true }], at = e0[1], start = e0[0], guard = 0;
    while (!same(at, start) && guard++ < 1000) {
      var next = -1, to = null, fwd = true;
      for (var j = 0; j < E.length && next < 0; j++) {
        if (!E[j] || (E[j].t !== 'line' && E[j].t !== 'arc') || E[j].construction || loop.some(function (l) { return l.i === j; })) continue;
        var ej = ends(j);
        if (ej.length !== 2) continue;
        if (same(ej[0], at)) { next = j; to = ej[1]; fwd = true; } else if (same(ej[1], at)) { next = j; to = ej[0]; fwd = false; }
      }
      if (next < 0) return null;
      loop.push({ i: next, fwd: fwd }); at = to;
    }
    return same(at, start) ? loop : null;
  }
  // rfCR: the Line chain through entity idx just closed: every typed length dimension on the loop whose dimension line
  // lies inside the region flips to the outside.
  function typedOutside(f, idx) {
    var loop = closedLoopThrough(f, idx), E = f.entities;
    if (!loop || !f.dims) return;
    var poly = [];
    loop.forEach(function (l) {
      var pl = K.entityPolylines(E[l.i])[0], pts = pl ? pl.pts.slice() : [];
      if (!l.fwd) pts.reverse();
      pts.forEach(function (p) { poly.push(p); });
    });
    if (poly.length < 3) return;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    poly.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var eps = 1e-4 * Math.max(1, x1 - x0, y1 - y0), flipped = 0;
    function inside(p) {
      var c = false;
      for (var a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        var pa = poly[a], pb = poly[b];
        if ((pa[1] > p[1]) !== (pb[1] > p[1]) && p[0] < (pb[0] - pa[0]) * (p[1] - pa[1]) / (pb[1] - pa[1]) + pa[0]) c = !c;
      }
      return c;
    }
    f.dims.forEach(function (d) {
      if (d.k !== 'len' || typedMade.indexOf(d) < 0 || !loop.some(function (l) { return l.i === d.e; }) || !E[d.e] || E[d.e].t !== 'line') return;
      var g = K.dimGeometry(E[d.e], d);
      if (!g || g.type !== 'linear' || !(d.off > 0 || d.off < 0)) return;
      var n = [-g.dir[1], g.dir[0]], sgn = d.off > 0 ? 1 : -1, m = [(g.P[0] + g.Q[0]) / 2 + n[0] * sgn * eps, (g.P[1] + g.Q[1]) / 2 + n[1] * sgn * eps];
      if (inside(m)) { d.off = -d.off; flipped++; }
    });
    if (flipped) { App.dimsStale = true; UI.updateSketches(); }
  }
  UI.typedOutside = typedOutside;

  // ---- on-screen numeric input while drawing (SolidWorks): with a point placed, typing a number opens a small box at
  // the cursor for the live value(s) — L and A for a line, W and H for a rectangle, R for a circle … Tab moves to the
  // next value, Enter places the point, Esc closes the box. A typed value holds while the mouse supplies the rest
  // (type a length, then swing the line round); blank values follow the mouse.
  var numBox = null;   // { el, inputs: [{ key, input }] }
  var lastMove = null; // the last cursor position in the viewport [mx, my]
  function numFields() {
    var st = App.toolState || { pts: [] }, n = st.pts.length;
    if (unitOwner) return unitOwner.fields;   // lane BP: a command's unit request box (Parallel Line)
    if (!n || App.mode !== 'sketch' || (App.command && App.command.onSketchPoint)) return null;
    var hk = toolHook(), hf = hk && hk.numFields ? hk.numFields(n) : null;
    if (hf) return hf;
    if (UI.sketchToolDefs[App.tool] && UI.sketchToolDefs[App.tool].fields) return UI.sketchToolDefs[App.tool].fields(n, st);   // p9-sketch-curves
    switch (App.tool) {
      case 'line': return st.arcMode ? null : [['L', 'len'], ['A', 'ang']];
      case 'rect': case 'crect': return [['W', 'w'], ['H', 'h']];
      case 'circle': return [['R', 'r'], ['Ø', 'd']];   // p9-sketch: Ø (Tab) for a hole typed as its diameter
      case 'polygon': return [['R', 'r'], ['A', 'ang']];
      case 'arc': return n === 1 ? [['R', 'r']] : [['A', 'sweep']];
      case 'arc3': return n === 1 ? [['L', 'len'], ['A', 'ang']] : [['R', 'r']];   // r5/sketch5: chord, then radius
      case 'slot': return n === 1 ? [['L', 'len'], ['A', 'ang']] : [['W', 'w']];
    }
    return null;
  }
  // r9/sketch9: with Sketch Settings ▸ Enable on-screen numeric input on, the box opens by itself after each click of a
  // drawing tool (auto), as in SolidWorks. A field nobody has typed in shows the live value (it follows the mouse and is
  // selected, so typing replaces it); a typed field holds. In either box only typed fields hold.
  function openNumBox(firstChar, auto) {
    var fields = numFields();
    if (!fields) return false;
    closeNumBox();
    var el = document.createElement('div');
    el.id = 'sk-num';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Value of the entity being drawn');
    el.style.cssText = 'position:absolute;z-index:5;display:flex;gap:4px;align-items:center;background:var(--input-bg);border:1px solid var(--blue);border-radius:3px;padding:2px 4px;box-shadow:0 2px 8px var(--shadow);font:12px "Segoe UI",sans-serif;color:var(--text)';
    var box = { el: el, inputs: [], auto: !!auto };
    fields.forEach(function (fd) {
      var lab = document.createElement('label');
      lab.textContent = fd[0];
      lab.style.cssText = 'color:var(--blue);font-weight:600';
      var inp = document.createElement('input');
      inp.type = 'text'; inp.setAttribute('inputmode', 'decimal'); inp.spellcheck = false; inp.autocomplete = 'off';
      inp.setAttribute('aria-label', fd[0] === 'A' ? 'Angle' : fd[0] === 'L' ? 'Length' : fd[0] === 'R' ? 'Radius' : fd[0] === 'W' ? 'Width' : fd[0] === 'Ø' ? 'Diameter' : fd[0] === 'D' ? 'Distance' : 'Height');
      inp.style.cssText = 'width:58px;border:0;outline:0;background:transparent;font:inherit;color:inherit;padding:1px 2px;border-bottom:1px solid var(--line)';
      inp.addEventListener('keydown', numKey);
      var item = { key: fd[1], input: inp, typed: false };
      inp.addEventListener('input', function () {
        inp.style.outline = '0'; inp.title = ''; item.bad = false; item.error = null; item.typed = !!inp.value.trim();
        // p9-sketch: R and Ø are the same size: typing one lets go of the other (a "." typed into R before Tab to Ø)
        var twin = item.key === 'r' ? 'd' : item.key === 'd' ? 'r' : null;
        if (twin && item.typed && numBox) numBox.inputs.forEach(function (x) { if (x.key === twin && x.typed) { x.typed = false; x.bad = false; x.input.value = ''; x.input.style.outline = '0'; } });
        if (unitOwner && unitOwner.onChange) unitOwner.onChange(numValues(true));   // lane BP: the command's preview follows the typing
        numPreview();
      });
      lab.appendChild(inp);
      el.appendChild(lab);
      box.inputs.push(item);
    });
    el.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    dimEdit.parentNode.appendChild(el);
    numBox = box;
    positionNumBox();
    // lane BV (shop-user audit): the Circle box opens on the field the last circle was typed in (Ø for a shop that
    // types hole sizes, R by default, as Mastercam remembers its Radius / Diameter choice); a typed first digit
    // always goes to the first field
    var firstIdx = 0;
    if (!firstChar && UNIT_BOX_TOOLS[App.tool] && circleBoxField) box.inputs.forEach(function (x, i) { if (x.key === circleBoxField) firstIdx = i; });
    var first = box.inputs[firstIdx].input;
    first.value = firstChar || '';
    box.inputs[firstIdx].typed = !!firstChar;
    first.focus();
    first.setSelectionRange(first.value.length, first.value.length);
    numPreview();
    return true;
  }
  var circleBoxField = null;   // 'r' | 'd': the Circle box field last committed with Enter (lane BV)
  // r9/sketch9: the live values of the entity being drawn for the cursor point p, by box field key
  function liveValues(p) {
    var st = App.toolState || { pts: [] }, pts = st.pts, a = pts[0], out = {};
    if (!a || !p) return out;
    if (UI.sketchToolDefs[App.tool] && UI.sketchToolDefs[App.tool].live) return UI.sketchToolDefs[App.tool].live(pts, p, st) || out;   // p9-sketch-curves
    function ang(x, y) { var d = Math.atan2(y, x) * 180 / Math.PI; return d < 0 ? d + 360 : d; }
    var hk = toolHook(), hv = hk && hk.liveValues ? hk.liveValues(p) : null;
    if (hv) return hv;
    var dx = p[0] - a[0], dy = p[1] - a[1], L = Math.hypot(dx, dy);
    switch (App.tool) {
      case 'line': { var q = (sliding(st) && tangentStart(st, p)) || pts[pts.length - 1]; out.len = Math.hypot(p[0] - q[0], p[1] - q[1]); out.ang = ang(p[0] - q[0], p[1] - q[1]); break; }
      case 'rect': out.w = Math.abs(dx); out.h = Math.abs(dy); break;
      case 'crect': out.w = 2 * Math.abs(dx); out.h = 2 * Math.abs(dy); break;
      case 'circle': out.r = L; out.d = 2 * L; break;
      case 'polygon': out.r = L; out.ang = ang(dx, dy); break;
      case 'arc': {
        if (pts.length < 2) { out.r = L; break; }
        var b = pts[1], sw = (Math.atan2(dy, dx) - Math.atan2(b[1] - a[1], b[0] - a[0])) * 180 / Math.PI;
        if (arcClockwise(a, b)) sw = -sw;
        while (sw <= 0) sw += 360;
        out.sweep = sw;
        break;
      }
      case 'arc3': {
        if (pts.length < 2) { out.len = L; out.ang = ang(dx, dy); break; }
        var e3 = toolEntities(pts, p)[0];
        if (e3 && e3.t === 'arc') out.r = e3.r;
        break;
      }
      case 'slot': if (pts.length < 2) { out.len = L; out.ang = ang(dx, dy); } else out.w = 2 * distPointLine(p, a, pts[1]); break;
    }
    return out;
  }
  // untyped fields show the live value; the focused one stays selected so the next key replaces it
  function updateNumLive(p) {
    if (!numBox) return;
    var lv = liveValues(p);
    numBox.inputs.forEach(function (x) {
      if (x.typed || lv[x.key] == null) return;
      var s = UI.fmtNum(lv[x.key], x.key !== 'ang' && x.key !== 'sweep' && UI.unitLabel() === 'in' ? 3 : 2);   // p9-sketch: 3 places in inches
      if (x.input.value !== s) x.input.value = s;
      if (document.activeElement === x.input) x.input.select();
    });
  }
  // after a click of a drawing tool (Sketch Settings ▸ numeric input on): open the box for the next value
  function autoNumBox() {
    if (numBox || !(numericInputOn() || UNIT_BOX_TOOLS[App.tool]) || !numFields()) return false;   // lane BP: the Circle tools always ask
    openNumBox('', true);
    if (lastMove) {
      var pl = UI.activePlane(), raw = UI.screenToPlane(lastMove[0], lastMove[1], pl);
      if (raw) updateNumLive(inferPoint(raw, lastMove[0], lastMove[1]).p);
    }
    return true;
  }
  function positionNumBox() {
    if (!numBox) return;
    var m = lastMove || [UI.size.w / 2, UI.size.h / 2];
    var bw = numBox.w || (numBox.w = numBox.el.offsetWidth || 160);
    // r9/sketch9: kept inside the view; past the right edge it flips to the left of the cursor
    numBox.el.style.left = Math.round(Math.max(4, m[0] + 14 + bw > UI.size.w - 4 ? m[0] - 14 - bw : m[0] + 14)) + 'px';
    numBox.el.style.top = Math.round(Math.max(4, m[1] - 52)) + 'px';
  }
  function closeNumBox() {
    if (!numBox) return;
    var b = numBox; numBox = null; unitOwner = null;
    if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
  }
  // lane BP: the unit request box for a command (see UNIT_BOX_TOOLS): spec { fields: [[label, key], …], onChange(values),
  // onCommit(values), onFinish(values) }, values the prefilled text per key (shown selected: typing replaces it)
  UI.sketchUnitBox = {
    open: function (spec, values) {
      closeNumBox();
      unitOwner = spec;
      if (!openNumBox('', false)) { unitOwner = null; return false; }
      numBox.inputs.forEach(function (x) {
        var s = values && values[x.key] != null ? String(values[x.key]) : '';
        x.input.value = s; x.typed = !!s; x.input._armed = s;
      });
      var take = function () { if (numBox && unitOwner === spec) { try { numBox.inputs[0].input.focus(); numBox.inputs[0].input.select(); } catch (e) { } } };
      take(); setTimeout(take, 0);   // again after the click's own focus change, when opened from a mouse event
      return true;
    },
    close: function () { if (unitOwner) closeNumBox(); },
    isOpen: function () { return !!(numBox && unitOwner); }
  };
  // the typed values: { len, ang, w, h, r, sweep } (only those entered); a bad entry is marked and left out.
  // p9-sketch: quiet (the live preview while typing) leaves a half-typed entry ("3/", "1-1/") unmarked: only Enter or a
  // click marks it red with the parser's message
  function numValues(quiet) {
    var out = {};
    if (!numBox) return out;
    numBox.inputs.forEach(function (x) {
      var s = x.input.value.trim();
      if (!s || !x.typed) return;   // r9/sketch9: a live (untyped) value follows the mouse
      var r = parseDimInput(s, x.key === 'ang' || x.key === 'sweep' ? 'angle' : 'length');
      var msg = r.error != null || !isFinite(r.value) ? (r.error || 'not a number') : (x.key !== 'ang' && x.key !== 'sweep') && !(r.value > 0) ? 'not greater than 0' : null;
      if (msg) {
        if (!quiet) { x.input.style.outline = '1px solid #d33'; x.input.title = msg; x.bad = true; x.error = msg; }
        return;
      }
      out[x.key] = r.value;
    });
    return out;
  }
  function clean(v) { return +v.toPrecision(12); }
  // 3 Point Arc with a typed radius r (r5/sketch5): the middle point of the arc from A to B of radius r that bulges to
  // the cursor's side of the chord, the shorter or the longer way round, whichever is nearer the cursor. A radius
  // under half the chord is taken as half the chord (a half circle).
  function arc3Through(A, B, cur, r) {
    var mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, ux = B[0] - A[0], uy = B[1] - A[1], c = Math.hypot(ux, uy);
    if (c < 1e-12) return cur;
    var n = [-uy / c, ux / c], d = (cur[0] - mx) * n[0] + (cur[1] - my) * n[1], sg = d < 0 ? -1 : 1;
    r = Math.max(r, c / 2);
    var h = Math.sqrt(Math.max(0, r * r - c * c / 4)), bulge = Math.abs(Math.abs(d) - (r + h)) < Math.abs(Math.abs(d) - (r - h)) ? r + h : r - h;
    return [clean(mx + n[0] * sg * bulge), clean(my + n[1] * sg * bulge)];
  }
  // The tool's next point for cursor point cur with the typed values v holding.
  function typedPoint(cur, v) {
    var st = App.toolState, pts = st.pts, a = pts[0], last = pts[pts.length - 1], D = Math.PI / 180;
    if (!a || !v) return cur;
    var hk = toolHook(), hp = hk && hk.typedPoint ? hk.typedPoint(cur, v) : null;
    if (hp) return hp;
    if (UI.sketchToolDefs[App.tool] && UI.sketchToolDefs[App.tool].typed) return UI.sketchToolDefs[App.tool].typed(pts, cur, v, st);   // p9-sketch-curves
    function polar(o, L, ang) { return [clean(o[0] + L * Math.cos(ang)), clean(o[1] + L * Math.sin(ang))]; }
    function sg(x) { return x < 0 ? -1 : 1; }
    var dx = cur[0] - a[0], dy = cur[1] - a[1];
    if (sliding(st)) { var tt = tangentTyped(st, cur, v); if (tt) return tt; }   // p9-sketch: from the sliding tangent point
    switch (App.tool) {
      case 'line': case 'slot': case 'polygon': case 'arc3': {
        if (App.tool === 'arc3' && pts.length === 2) return v.r == null ? cur : arc3Through(a, pts[1], cur, v.r);
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
      case 'circle': { var rc = v.r != null ? v.r : v.d != null ? v.d / 2 : null; return rc == null ? cur : polar(a, rc, Math.hypot(dx, dy) > 1e-12 ? Math.atan2(dy, dx) : 0); }
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
    var anyTyped = numBox.inputs.some(function (x) { return x.typed; });
    // r9/sketch9: a box that opened by itself must not swallow the sketcher's keys while nothing is typed in it:
    // a letter (A for a tangent arc, L, D …) or a Ctrl shortcut closes it and goes on to the sketch as if the box
    // were not there
    if (numBox.auto && !anyTyped && ((ev.key.length === 1 && /[a-zA-Z]/.test(ev.key) && !(k >= 0 && /^=/.test(list[k].value))) || ev.ctrlKey || ev.metaKey || /^F\d+$/.test(ev.key))) {
      ev.preventDefault();
      closeNumBox();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ev.key, code: ev.code, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey, bubbles: true, cancelable: true }));
      if (lastMove && App.mode === 'sketch') sketchMove(lastMove[0], lastMove[1]);
      return;
    }
    // lane CG: Esc in the box (the on-screen box or the unit request box of Circle / Parallel Line) ends the whole
    // command in one press: the box closes unapplied, the tool goes down, the command's PropertyManager is cancelled
    if (ev.key === 'Escape') { ev.preventDefault(); UI.escapeCommand(); return; }
    // rfCN: Ctrl+Z / Ctrl+Y in a command's unit request box (Parallel Line) with nothing newly typed cancels the
    // command, as they do in the command's own PropertyManager boxes (ui-app.js undoCancelsPM; the key never reaches
    // that shortcut from here, and the box is outside #pm). A half-typed entry keeps the browser's own text undo.
    if (unitOwner && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && /^[zZyY]$/.test(ev.key)) {
      if (numBox.inputs.every(function (x) { return x.input.value === x.input._armed; })) {
        ev.preventDefault();
        var ttl = UI.pmTitle ? UI.pmTitle() : '', smU = document.getElementById('status-msg');
        UI.escapeCommand();
        if (ttl && smU && !/cancelled/.test(smU.textContent)) UI.setStatus(ttl + ' cancelled.');
      }
      return;
    }
    if (ev.key === 'Tab') {
      ev.preventDefault();
      var nx = list[(k + (ev.shiftKey ? list.length - 1 : 1)) % list.length];
      nx.focus(); nx.select();
    } else if ((ev.key === 'Backspace' || ev.key === 'Delete') && numBox.auto && k >= 0 && !numBox.inputs[k].typed) {
      // clearing a live value starts typing a new one
      ev.preventDefault();
      list[k].value = '';
      numBox.inputs[k].typed = true;
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      // lane BP: Enter places what was typed; in a chain tool Enter with nothing typed (the box opened by itself, or
      // emptied) ends the tool, the same second-Enter rule as a PropertyManager's (ui-commands.js pmEnter)
      var oneShot = !!(unitOwner || UNIT_BOX_TOOLS[App.tool]);
      if (!anyTyped && !oneShot) {
        closeNumBox();
        cancelTool();
        UI.setStatus('Tool ended: Enter with nothing typed closes it (type a value and press Enter to place it, Enter again to finish).');
        return;
      }
      if (oneShot && !anyTyped) { var fx = numBox.inputs[k >= 0 ? k : 0]; fx.typed = !!fx.input.value.trim(); }   // the live value holds
      var v = numValues();
      var badX = numBox.inputs.filter(function (x) { return x.bad; })[0];
      if (badX) {   // r9/sketch9: x.bad, not the outline (0px on every untouched field)
        // p9-sketch: the parser's own message (Unknown unit "xx", Division by zero, ...) when it has one
        UI.setStatus('Not a valid value' + (badX.error ? ' (' + badX.error + ')' : '') + ': type a positive length (.375, 3/8, 1-1/2, 25mm), or an angle in degrees.'); return; }
      if (oneShot) {
        // the unit request box (Circle, Parallel Line): the first Enter commits what the box shows, the second makes
        // the entity and closes the tool / command; a value typed after a commit is committed first
        var fk = numBox.inputs[k >= 0 ? k : 0];
        if (!unitOwner && (fk.key === 'r' || fk.key === 'd') && fk.typed) circleBoxField = fk.key;   // lane BV: remembered for the next circle
        if (!numBox.committed || numBox.inputs.some(function (x) { return x.input.value !== x.input._armed; })) {
          var bxC = numBox;
          numBox.committed = true;
          if (unitOwner) { if (unitOwner.onCommit) unitOwner.onCommit(v); } else numPreview();
          if (numBox !== bxC) return;   // the commit closed the box
          // rfCN: armed after the commit, not before: the preview rewrites the untyped fields from the committed
          // value (R 0.313 held makes Ø 0.626 where the live 0.6254 showed 0.625), and the next Enter compares with
          // what the box shows now; armed before, it saw a change and committed again, and a third Enter was needed
          numBox.inputs.forEach(function (x) { x.input._armed = x.input.value; });
          var fv = v[fk.key];
          if (UI.pmEntryStatus) UI.pmEntryStatus(fk.input.getAttribute('aria-label') || '', fv == null ? fk.input.value : fk.key === 'ang' || fk.key === 'sweep' ? UI.fmtNum(fv, 2) + '°' : UI.fmtDim(fv) + ' ' + UI.unitLabel());
          try { fk.input.focus(); fk.input.select(); } catch (e) { }
          return;
        }
        if (unitOwner) { var own = unitOwner; closeNumBox(); if (own.onFinish) own.onFinish(v); return; }
        var plO = UI.activePlane(), mO = lastMove, rawO = mO ? UI.screenToPlane(mO[0], mO[1], plO) : null;
        var curO = rawO ? inferPoint(rawO, mO[0], mO[1]).p : (App.toolState.pts[App.toolState.pts.length - 1] || [0, 0]);
        var pO = typedPoint(curO, v);
        closeNumBox();
        App.sketchDirty = false;
        placePoint(pO, v);
        cancelTool();
        UI.setStatus('Placed at the typed size; the tool is closed (Enter twice). Pick a tool to draw more.');
        return;
      }
      var pl = UI.activePlane(), m = lastMove, raw = m ? UI.screenToPlane(m[0], m[1], pl) : null;
      var cur = raw ? inferPoint(raw, m[0], m[1]).p : (App.toolState.pts[App.toolState.pts.length - 1] || [0, 0]);
      var p = typedPoint(cur, v);
      closeNumBox();
      App.sketchDirty = false;   // r15/snapaudit15: each segment placed by a typed value is its own Ctrl+Z step (Enter in the box skips the keydown reset)
      placePoint(p, v);
      if (m) sketchMove(m[0], m[1]);
    }
  }
  // typing a number (or "=" for an equation) with a drawing tool and a point placed opens the box; A in the Line tool
  // switches to a tangent arc and back
  document.addEventListener('keydown', function (ev) {
    if (App.mode !== 'sketch' || ev.ctrlKey || ev.metaKey || ev.altKey || numBox) return;
    var tag = (ev.target && ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (ev.target && ev.target.isContentEditable)) return;
    if (App.tool === 'line' && (ev.key === 't' || ev.key === 'T')) {   // r15/tanslide15, rfE: T toggles Tangent start
      ev.preventDefault(); ev.stopImmediatePropagation();
      setLineTangentStart(!lineTanStart);
      return;
    }
    // p9-sketch: N takes the other tangent point of the sliding start (Mastercam's choice of tangent); no other
    // shortcut uses N
    if (App.tool === 'line' && (ev.key === 'n' || ev.key === 'N') && sliding(App.toolState)) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      UI.flipTangent();
      return;
    }
    if (App.tool === 'line' && (ev.key === 'a' || ev.key === 'A') && App.toolState.pts.length) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      setArcMode(!App.toolState.arcMode);
      if (lastMove) sketchMove(lastMove[0], lastMove[1]);
      return;
    }
    if (/^[0-9.=(]$/.test(ev.key) || (ev.key === '-' && App.tool !== 'select')) {
      if (!numFields()) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      openNumBox(ev.key);
    }
  }, true);
  // rfE (fidelity finding 5): Line ▸ Tangent start, off by default (SolidWorks starts a line where it is clicked on a
  // circle or arc, Coincident only). On, a line started on a circle / arc slides round it to the tangent point for the
  // cursor (Mastercam's Line Endpoints ▸ Tangent; N the other tangent point). T with the Line tool toggles it, also for
  // a start already clicked; it stays as set for the session. UI.lineTangentStart() reads it.
  var lineTanStart = false;
  function setLineTangentStart(on) {
    lineTanStart = !!on;
    var st = App.toolState;
    if (st && st.tanFrom) st.tanFrom.off = !lineTanStart;
    var sliding0 = !!(st && st.tanFrom && !st.tanFrom.off);
    UI.setStatus(lineTanStart
      ? (sliding0 ? 'Tangent start on: the start follows the cursor round the curve (N: the other tangent point, T: from the clicked point).' : 'Tangent start on: a line started on a circle or arc slides round it to the tangent point (T turns it off).')
      : (st && st.tanFrom ? 'Tangent start off: the line starts at the clicked point (T: tangent to the curve again).' : 'Tangent start off: a line started on a circle or arc starts where you click (T turns it on).'));
    if (App.mode === 'sketch' && App.tool === 'line' && $('sketch-hint') && !(st && st.arcMode)) $('sketch-hint').innerHTML = sliding0 ? 'Tangent line: its start slides round the curve. Click the end, or type its length. <b>N</b>: the other tangent point. <b>T</b>: from the clicked point.' : TOOL_HINTS.line;
    if (lastMove && App.mode === 'sketch' && App.tool === 'line') sketchMove(lastMove[0], lastMove[1]);
    if (UI.lineTangentStartChanged) UI.lineTangentStartChanged(lineTanStart);   // a Line PM check box can follow (ui-sketch-lines.js)
    return lineTanStart;
  }
  UI.lineTangentStart = function () { return lineTanStart; };
  UI.setLineTangentStart = setLineTangentStart;
  // p9-sketch: the sliding tangent start goes to the other tangent point (the N key); false when nothing slides
  UI.flipTangent = function () {
    var st = App.toolState;
    if (!sliding(st)) return false;
    st.tanFrom.flip = true;
    UI.setStatus('Tangent line: the other tangent point (N flips again, T draws from the clicked point).');
    if (lastMove) sketchMove(lastMove[0], lastMove[1]);
    return true;
  };
  UI.sketchNumBox = function () { return numBox ? numBox.inputs.map(function (x) { return x.input; }) : null; };

  function sketchMove(mx, my) {
    var pl = UI.activePlane(), raw = UI.screenToPlane(mx, my, pl);
    if (!raw) return;
    var drawing = App.tool !== 'select' && App.tool !== 'dimension' && !(App.command && App.command.onSketchPoint);
    lastMove = [mx, my];
    if (rapidHoverKey || rapidOn()) rapidHover(mx, my);   // rfAY
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
    // r9/sketch9: the box that opens by itself follows the tool (none for a tangent arc of the Line tool)
    if (drawing && numBox && numBox.auto && !numFields()) closeNumBox();
    else if (drawing && !numBox && App.toolState.pts.length) autoNumBox();
    if (info && numBox) {
      var tv = numValues(true);
      if (Object.keys(tv).length) { p = typedPoint(p, tv); info = { p: p, snap: null, align: [], px: info.px }; }
      updateNumLive(p);
      positionNumBox();
    }
    if (drawing && App.toolState) App.toolState.hoverDirRel = (info && info.dir && info.dir.rel) || null;   // rfII: the preview's woken-line relation
    var readout = drawing && App.toolState.pts.length ? toolReadout(App.toolState.pts, p) : '';
    var cd = UI.unitLabel() === 'in' ? 3 : 2;   // sketch-units: inch coordinates read 3 places, as the dimensions do
    $('status-coords').textContent = 'X: ' + UI.fmtNum(p[0], cd).padStart(9) + '   Y: ' + UI.fmtNum(p[1], cd).padStart(9) + '  ' + UI.unitLabel() + (readout ? '   ' + readout : '');
    if (!drawing) {
      // pre-highlight what a click would pick (select, Smart Dimension, Add Relations, Trim …), as SolidWorks does
      var own = !!(App.command && App.command.ownHover);   // r13/trim13: Trim highlights the span it would remove itself
      var ref = UI.pickSketchRef && !App.zoomAreaMode && !own ? dimPickRef(mx, my) : null;
      if (own) clearFeedback();
      else hoverFeedback(pl, ref, mx, my);
      // a sketch command's own hover preview (Extend Entities shows where the end would go)
      if (App.command && App.command.onSketchMove) App.command.onSketchMove(raw, mx, my);
    }
    if (App.tool === 'dimension') { dimToolMove(raw); return; }
    if (drawing && App.toolState.pts.length) {
      App.tempEntities = toolEntities(App.toolState.pts, p);
      UI.updateTemp();
      var hkM = toolHook();
      if (hkM && hkM.live) hkM.live(App.toolState.pts, p, App.tempEntities);   // p9-sketchtab: the tool PM's live values
      // yellow inference icons: the relations the entity being drawn would get
      var f = UI.activeSketchFeature();
      App.inferPreview = f && window.SketchSolver && App.tempEntities.length === 1 && skSetting('autoRelations') ? SketchSolver.inferPreview(f, App.tempEntities[0], previewInferOpts(p, App.tempEntities[0])) : [];
    } else if (App.inferPreview && App.inferPreview.length) App.inferPreview = [];
    if (drawing) drawFeedback(pl, info, mx, my, numBox ? '' : readout);   // the box shows the values itself
  }
  // while dragging an end point: the point / curve it would merge with (ui-relations.js), or null (rfBR: the marker
  // only, no relation glyph by the cursor)
  UI.sketchSnapMark = function (uv, q, onCurve) {
    var layer = feedbackLayer();
    clearFeedback();
    if (!uv) return;
    var s = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1]));
    svg('circle', { cx: s[0], cy: s[1], r: onCurve ? 3 : 5, style: 'fill:' + (onCurve ? '#e8891c' : 'none') + ';stroke:#e8891c;stroke-width:1.5' }, layer);
  };
  // orange dashed polylines (sketch coordinates) added to the cursor feedback: a command's preview
  // (r13/trim13: style replaces the dashed orange one, cls the class; the Trim hover and the Power trim trail)
  UI.sketchPreview = function (polylines, style, cls) {
    var layer = feedbackLayer(), pl = UI.activePlane();
    (polylines || []).forEach(function (pts) {
      var s = pts.map(function (q) { var p = UI.worldToScreen(K.to3D(pl, q[0], q[1])); return Math.round(p[0] * 10) / 10 + ',' + Math.round(p[1] * 10) / 10; });
      svg('polyline', { 'class': cls || 'sk-preview', points: s.join(' '), style: style || 'stroke:#e8891c;stroke-width:2;fill:none;stroke-dasharray:5 3;stroke-linecap:round' }, layer);
    });
  };
  // lane DE2: a label (sketch point uv, offset dx / dy px) in the cursor feedback: a command's preview text (the sketch
  // patterns' Display instance count)
  UI.sketchPreviewText = function (uv, text, cls, dx, dy) {
    var layer = feedbackLayer(), p = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1]));
    var t = svg('text', { 'class': cls || 'sk-preview-text', x: Math.round((p[0] + (dx || 0)) * 10) / 10, y: Math.round((p[1] + (dy || 0)) * 10) / 10, 'text-anchor': 'middle', 'dominant-baseline': 'middle', style: 'fill:#e8891c;font:600 13px sans-serif' }, layer);
    t.textContent = String(text);
    return t;
  };
  UI.sketchFeedbackClear = function () { clearFeedback(); };
  var HOVER_STYLE ='stroke:#e8891c;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.9';
  function drawHover(pl, ref) {
    var layer = feedbackLayer(), f = UI.activeSketchFeature(), S = window.SketchSolver;
    clearFeedback();
    if (!ref || !f || !S) return;
    function scr(p) { return UI.worldToScreen(K.to3D(pl, p[0], p[1])); }
    var pr = S.parseRef(ref), p = S.refPoint(f, ref);
    if (p && /\.mid$/.test(ref)) { drawMidMarker(scr(p)); return; }   // rfIG: a line's midpoint picked by Smart Dimension
    if (p) { var s = scr(p); svg('circle', { cx: s[0], cy: s[1], r: 4.5, style: 'stroke:#e8891c;stroke-width:1.5;fill:#e8891c;fill-opacity:0.35' }, layer); return; }
    var e = pr && !pr.o && f.entities[pr.e], c = S.refCurve(f, ref), pls;
    if (!e) return;
    if (c && c.kind === 'line' && pr.s === 'e') pls = [{ pts: [c.a, c.b], closed: false }];
    else pls = e.t === 'point' ? [] : (UI.screenPolylines || K.entityPolylines)(e);
    pls.forEach(function (l) {
      var pts = l.pts.map(function (q) { return scr(q).map(function (v) { return Math.round(v * 10) / 10; }).join(','); });
      if (l.closed && pts.length) pts.push(pts[0]);
      svg('polyline', { points: pts.join(' '), style: HOVER_STYLE }, layer);
    });
  }
  // rfIG: the descriptor by the cursor (SolidWorks' names): a small themed box below-right of the pointer (never under
  // it), class sk-snap-label (+ sk-snap-label-model / -sketch); its text is what a click there takes
  var SNAP_LABEL = { end: 'Endpoint', midpoint: 'Midpoint', center: 'Center', quadrant: 'Quadrant', intersection: 'Intersection', origin: 'Origin', on: 'On curve' };
  function snapLabel(snap) {
    if (snap.model) return snap.label || null;
    if (snap.isPoint) return 'Point';
    return SNAP_LABEL[snap.kind] || null;
  }
  var DIR_LABEL = { tangent: 'Tangent', perpendicular: 'Perpendicular', parallel: 'Parallel' };   // rfII
  function cursorLabel(layer, mx, my, text, model) {
    var col = model ? MODEL_COLOR : '#e8891c', ly = my + 12, lw = Math.round(text.length * 6.2 + 10);
    var lg = svg('g', { 'class': 'sk-snap-label ' + (model ? 'sk-snap-label-model' : 'sk-snap-label-sketch') }, layer);
    svg('rect', { x: mx + 14, y: ly, width: lw, height: 16, rx: 3, style: 'fill:var(--menu-bg);stroke:' + col + ';stroke-width:1' }, lg);
    var lt = svg('text', { x: mx + 19, y: ly + 12, style: 'fill:var(--text);font-size:11px' }, lg);
    lt.textContent = text;
    return lg;
  }
  // what sketch ref `ref` is, in SolidWorks' words
  var ENTITY_LABEL = { line: 'Line', arc: 'Arc', circle: 'Circle', slot: 'Slot', aslot: 'Slot', spline: 'Spline', ellipse: 'Ellipse', pellipse: 'Partial Ellipse', point: 'Point', text: 'Text', poly: 'Polygon', rect: 'Rectangle', crect: 'Rectangle', polyline: 'Polyline' };
  function refLabel(ref) {
    var f = UI.activeSketchFeature(), S = window.SketchSolver;
    if (ref === 'O') return 'Origin';
    var p = f && S && ref ? S.parseRef(ref) : null, e = p && !p.o ? f.entities[p.e] : null;
    if (!e) return null;
    switch (p.s) {
      case null: return ENTITY_LABEL[e.t] || null;
      case 'mid': case 'em': return 'Midpoint';   // (rfII: 'em' a rectangle / polygon side's)
      case 'p': return 'Endpoint';
      case 'c': return 'Center';
      case 'h': return 'Spline handle';
      case 'e': return 'Line';
      case 'v': return e.t === 'spline' ? 'Spline point' : e.t === 'ellipse' || e.t === 'pellipse' ? 'Quadrant' : 'Endpoint';
    }
    return null;
  }
  // the hover feedback of the Select tool, Smart Dimension and the picking commands: the highlight of what a click takes
  // and (Select, Smart Dimension) the descriptor naming it; Smart Dimension in a sketch on a face also names the model
  // edge / vertex / edge midpoint under the cursor
  function hoverFeedback(pl, ref, mx, my) {
    drawHover(pl, ref === 'O' ? null : ref);
    var dim = App.tool === 'dimension', lab = null, model = false;
    if (!dim && !(App.tool === 'select' && !(App.command && App.command.onSketchPoint))) return;
    if (ref) lab = refLabel(ref);
    else if (dim && !App.zoomAreaMode && App.edges && App.edges.length) {
      var mm = modelMidAt(mx, my);
      if (mm) { drawMidMarker(mm.s, true); lab = 'Midpoint'; }
      else if (UI.pickVertex && UI.pickVertex(mx, my)) lab = 'Vertex';
      else if (UI.pickEdge && UI.pickEdge(mx, my)) lab = 'Edge';
      model = !!lab;
    }
    if (lab) cursorLabel(feedbackLayer(), mx, my, lab, model);
  }
  UI.sketchHoverLabel = function () { var n = fbLayer && fbLayer.querySelector('.sk-snap-label text'); return n ? n.textContent : null; };
  // rfIG: the midpoint marker Smart Dimension shows at the middle of a line (or of a straight model edge, in the model
  // colour): the point hover's ring, class sk-mid-hover (tests find it by that)
  function drawMidMarker(s, model) {
    var col = model ? MODEL_COLOR : '#e8891c';
    svg('circle', { cx: s[0], cy: s[1], r: 4.5, 'class': 'sk-mid-hover', style: 'stroke:' + col + ';stroke-width:1.5;fill:' + col + ';fill-opacity:0.35' }, feedbackLayer());
  }

  // Live value next to the cursor while drawing (SolidWorks shows the length / radius / angle as you drag).
  function toolReadout(pts, p) {
    // p9-sketch: lengths read 3 places in an inch sketch (0.141, not 0.14 for a .281 hole), angles 1 place
    var a = pts[0], inch = UI.unitLabel() === 'in', n = function (v, d) { return UI.fmtNum(v, d === 2 && inch ? 3 : d); }, t = App.tool;
    if (!a) return '';
    var hk = toolHook(), hr = hk && hk.readout ? hk.readout(pts, p) : null;
    if (hr) return hr;
    if (UI.sketchToolDefs[t] && UI.sketchToolDefs[t].readout) return UI.sketchToolDefs[t].readout(pts, p, n) || '';   // p9-sketch-curves
    var dx = p[0] - a[0], dy = p[1] - a[1], L = Math.hypot(dx, dy);
    function ang(x, y) { var d = Math.atan2(y, x) * 180 / Math.PI; return n(d < 0 ? d + 360 : d, 1) + '°'; }
    if (UI.sketchFreeHooks[t] && UI.sketchFreeHooks[t].readout) return UI.sketchFreeHooks[t].readout(pts, p, n);
    switch (t) {
      case 'line': {
        var st1 = App.toolState || {}, q = (sliding(st1) && tangentStart(st1, p)) || pts[pts.length - 1], ta = st1.arcMode && st1.arcDir ? tangentArc(q, st1.arcDir, p) : null;
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
        if (pts.length < 2) return 'L ' + n(L, 2) + '   A ' + ang(dx, dy);
        var ta3 = toolEntities(pts, p)[0];
        return ta3 && ta3.t === 'arc' ? 'R ' + n(ta3.r, 2) + '   A ' + n(ta3.a1 - ta3.a0, 1) + '°' : 'L ' + n(Math.hypot(pts[1][0] - a[0], pts[1][1] - a[1]), 2);
      }
      case 'slot': {
        if (pts.length < 2) return 'L ' + n(L, 2);
        var sw = 2 * distPointLine(p, a, pts[1]), sb = slotFarCentre(a, pts[1], cleanLen(Math.max(sw, 0.01))), sl = Math.hypot(sb[0] - a[0], sb[1] - a[1]);
        return 'L ' + n(sl + (slotOverall() ? sw : 0), 2) + '   W ' + n(sw, 2);   // slot-overall: the overall length while the width is picked
      }
    }
    return '';
  }

  // ---- cursor feedback: inference lines, the snapped point and the live value, in a group of the #dim-layer SVG that
  // drawDims keeps (redrawn on every mouse move without redrawing the dimensions). rfBR: no relation glyphs by the
  // cursor and none next to the entities (Mastercam's graphics area); relations still exist and Display/Delete
  // Relations lists them.
  var fbLayer = null;
  function feedbackLayer() {
    if (!fbLayer) fbLayer = svg('g', { 'class': 'sk-feedback', 'pointer-events': 'none' });
    if (fbLayer.parentNode !== dimLayer) dimLayer.appendChild(fbLayer);
    return fbLayer;
  }
  function clearFeedback() { if (fbLayer) while (fbLayer.firstChild) fbLayer.removeChild(fbLayer.firstChild); }
  function drawFeedback(pl, info, mx, my, readout) {
    var layer = feedbackLayer();
    clearFeedback();
    if (!info) return;
    function scr(p) { return UI.worldToScreen(K.to3D(pl, p[0], p[1])); }
    var sp = scr(info.p);
    // dotted grey inference lines from the points the cursor lines up with (rfBR: a darker grey is a guide that adds no
    // relation, a lighter one whose relation the click adds; colours --sk-infer / --sk-infer-rel in style.css)
    info.align.forEach(function (al) {
      if (al.prev && App.tool === 'line') return;   // the rubber band itself shows that one
      var a = scr(al.from);
      svg('line', { x1: a[0], y1: a[1], x2: sp[0], y2: sp[1], 'class': 'sk-infer', style: 'stroke:var(--sk-infer, #8c8c8c);stroke-width:1;stroke-dasharray:2 3' }, layer);
    });
    // the point taken: an orange ring on an existing point, a small dot on a curve
    // a tangent / perpendicular direction taken: a dotted inference line along it from the end point, past the cursor
    if (info.dir) {
      var a0 = scr(info.dir.from), vx = sp[0] - a0[0], vy = sp[1] - a0[1], vl = Math.hypot(vx, vy) || 1;
      var relLine = !!info.dir.glyph && skSetting('autoRelations');
      svg('line', { x1: a0[0], y1: a0[1], x2: sp[0] + vx / vl * 40, y2: sp[1] + vy / vl * 40, 'class': relLine ? 'sk-infer sk-infer-rel' : 'sk-infer', style: 'stroke:' + (relLine ? 'var(--sk-infer-rel, #c8c8c8)' : 'var(--sk-infer, #8c8c8c)') + ';stroke-width:1;stroke-dasharray:2 3' }, layer);
    }
    // (p9-modelsnap: a point on the model in its own colour, MODEL_COLOR)
    if (info.snap) {
      var sCol = info.snap.model ? MODEL_COLOR : '#e8891c', sDot = info.snap.kind === 'on' || info.snap.kind === 'medge';
      svg('circle', { cx: sp[0], cy: sp[1], r: sDot ? 3 : 5, 'class': info.snap.model ? 'sk-model-snap' : 'sk-snap', style: 'fill:' + (sDot ? sCol : 'none') + ';stroke:' + sCol + ';stroke-width:1.5' }, layer);
    }
    // p9-modelsnap: a small label by the cursor names a model snap (lane sketchref: the click relates the point to it). rfIG (user 2026-11-05: "a little
    // descriptor of what youre hovering over"): every snap is named, sketch ones in the sketch snap colour
    // rfII: a tangent / perpendicular / parallel lock is named after the relation (SolidWorks' inference glyph; shown
    // with Automatic Relations off too, when the click adds nothing)
    var snapName = info.tan ? 'Tangent' : info.snap ? snapLabel(info.snap) : null;
    if (!snapName && info.dir && info.dir.glyph) snapName = DIR_LABEL[info.dir.glyph] || null;
    if (snapName) cursorLabel(layer, mx, my, snapName, !!(info.snap && info.snap.model));
    if (readout) {
      var t = svg('text', { x: mx + 14, y: my - 10, style: 'fill:#e8e8e8;font-size:11px;pointer-events:none' }, layer);   // rfBR: light grey on the dark ground
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
  // r12/sketchui12: drawDims no longer throws away and rebuilds its ~1000 nodes on every frame of a drag. While it
  // runs (rcParents set), svg() walks the children already in the layer in order and reuses the next one when it has
  // the same tag: only the attributes that changed are written, and nodes left over at the end are removed. Event
  // listeners are attached once per node and read the item they act on from node._d (set again on every redraw).
  var rcParents = null;
  function rcOpen(n, first) { n._rcNext = first; n._rcOn = true; rcParents.push(n); }
  function svg(tag, attrs, parent) {
    attrs = attrs || {};
    var a = {}, k;
    for (k in attrs) a[k] = String(attrs[k]);
    if (rcParents && parent && parent._rcOn) {
      var m = parent._rcNext;
      if (m === fbLayer) m = null;
      if (m && m.nodeName === tag) {
        parent._rcNext = m.nextSibling;
        var old = m._a || {};
        for (k in a) if (old[k] !== a[k]) m.setAttribute(k, a[k]);
        for (k in old) if (!(k in a)) m.removeAttribute(k);
        m._a = a; m._d = null;
        rcOpen(m, m.firstChild);
        return m;
      }
      var c = document.createElementNS(SVGNS, tag);
      for (k in a) c.setAttribute(k, a[k]);
      c._a = a;
      parent.insertBefore(c, m || (fbLayer && fbLayer.parentNode === parent ? fbLayer : null));
      rcOpen(c, null);
      return c;
    }
    var n = document.createElementNS(SVGNS, tag);
    for (k in a) n.setAttribute(k, a[k]);
    n._a = a;
    if (parent) parent.appendChild(n);
    return n;
  }
  // text of a node, written only when it changed (a reused node keeps its text node)
  function svgText(n, s) { s = String(s); if (n._t !== s) { n.textContent = s; n._t = s; } n._rcNext = null; }   // (its text node is not trimmed)
  function rcBegin(layer, first) { rcParents = []; rcOpen(layer, first); }
  function rcEnd() {
    var list = rcParents;
    rcParents = null;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      for (var c = p._rcNext; c; ) { var nx = c.nextSibling; if (c !== fbLayer) p.removeChild(c); c = nx; }
      p._rcOn = false; p._rcNext = null;
    }
  }
  // r15/inches15: inch dimensions read 3 decimals (IPS). p9-sketch: as an inch shop print reads them (ANSI): three
  // places with the trailing zeros and no leading zero (.500, 6.000, Ø.281, R.250); millimetres as before (2 places,
  // trailing zeros dropped). Two-entity distances (ui-relations.js) use the same text through UI.fmtDim.
  function fmtDim(n) {
    if (UI.unitLabel() !== 'in' || n == null || !isFinite(n)) return UI.fmtNum(n, 2);
    var t = Math.abs(n).toFixed(3);
    if (t === '0.000') return '0';
    return (n < 0 ? '-' : '') + t.replace(/^0\./, '.');
  }
  UI.fmtDim = fmtDim;
  // sketch-units: a length in a status bar or toast message: the dimension style plus the document's unit (.250 in,
  // 6.35 mm). The solver's own messages (a fillet's largest radius, a corner's position) go through SketchSolver.fmtLen.
  function fmtLen(n) { return fmtDim(n) + ' ' + UI.unitLabel(); }
  UI.fmtLen = fmtLen;
  if (window.SketchSolver) SketchSolver.fmtLen = fmtLen;

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
  // r5/sketch5: where a placed dimension's label sits, in sketch coordinates, and the exact placement that puts it at
  // a given point (no snapping to the middle). Commands that move or copy entities with their dimensions (Mirror in
  // place) carry the label with the geometry: anchor -> transform -> place at.
  function dimAnchor(e, d) {
    var g = K.dimGeometry(e, d), s = UI.cam.scale || 0.1;
    if (!g) return null;
    if (g.type === 'linear') {
      var n = [-g.dir[1], g.dir[0]], off = d.off != null ? d.off : 16 * s, t = g.value / 2 + (d.tx || 0);
      return [g.P[0] + n[0] * off + g.dir[0] * t, g.P[1] + n[1] * off + g.dir[1] * t];
    }
    var a = (d.ang != null ? d.ang : 45) * Math.PI / 180, dist = Math.max(d.off != null ? d.off : 0, g.r + 18 * s);
    return [g.C[0] + Math.cos(a) * dist, g.C[1] + Math.sin(a) * dist];
  }
  function dimPlaceAt(e, d, uv) {
    var g = K.dimGeometry(e, d);
    if (!g) return {};
    if (g.type !== 'linear') return dimPlacement(e, d, uv);
    var n = [-g.dir[1], g.dir[0]], t = (uv[0] - g.P[0]) * g.dir[0] + (uv[1] - g.P[1]) * g.dir[1] - g.value / 2;
    var out = { off: Math.round(((uv[0] - g.P[0]) * n[0] + (uv[1] - g.P[1]) * n[1]) * 1e4) / 1e4 };
    if (Math.abs(t) > 1e-6) out.tx = Math.round(t * 1e4) / 1e4;
    return out;
  }
  UI.dimAnchor = dimAnchor;
  UI.dimPlaceAt = dimPlaceAt;

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
    // r14/sketchui14: extension lines leave a 2 px gap at the geometry and run 4 px past the dimension line
    [[P, off], [Q, off + (P[0] - Q[0]) * n[0] + (P[1] - Q[1]) * n[1]]].forEach(function (x) {
      var X = x[0], o = x[1], sg = o < 0 ? -1 : 1, gap = 2 * s * sg, ext = o + 4 * s * sg;
      out.lines.push([S([X[0] + n[0] * gap, X[1] + n[1] * gap]), S([X[0] + n[0] * ext, X[1] + n[1] * ext])]);
    });
    // r14/sketchui14: the dimension line, its arrows and where the label goes are settled by dimLayout once the
    // label's width is known (ANSI: horizontal text in a break of the line; arrows and text outside when short)
    var u = unit(sA, sB), L = Math.hypot(sB[0] - sA[0], sB[1] - sA[1]);
    out.lin = { a: sA, b: sB, u: u, L: L };
    out.text = { x: (sA[0] + sB[0]) / 2, y: (sA[1] + sB[1]) / 2, anchor: 'middle' };
    out.along = { u: u, half: L / 2, shift: tx ? tx / s : 0, fixed: tx != null };
    return out;
  }
  // ---- r14/sketchui14: dimensions drawn as SolidWorks draws them with the ANSI standard (as on drawing sheets since
  // r13/drawings13), scaled for the screen: Century Gothic, the text horizontal and centred in a break of the
  // dimension line, slim filled arrowheads (10 × 3.4 px, ANSI 1 : 3), and radius / diameter leaders that end in a
  // short horizontal shoulder with the text after it. Text widths come from the font itself (canvas measureText,
  // cached per character), so the break fits the digits on any machine (a fallback font measures as itself).
  var DIM_FONT = '"Century Gothic", "URW Gothic", "URW Gothic L", "TeX Gyre Adventor", "Avant Garde", Futura, "Segoe UI", Arial, sans-serif';
  var DIM_PX = 13, DIM_CAP = Math.round(DIM_PX * 0.72 * 10) / 10, DIM_GAP = 3, ARROW_L = 10, ARROW_HW = 1.7, SHOULDER = 12;
  var charW = {}, measureCtx = null;
  function dimTextWidth(str) {
    str = String(str);
    var w = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i), cw = charW[ch];
      if (cw == null) {
        if (!measureCtx) { try { measureCtx = document.createElement('canvas').getContext('2d'); } catch (e) { measureCtx = null; } if (measureCtx) measureCtx.font = DIM_PX + 'px ' + DIM_FONT; }
        cw = charW[ch] = measureCtx ? measureCtx.measureText(ch).width : DIM_PX * 0.56;
      }
      w += cw;
    }
    return w;
  }
  // the dimension line of a linear dimension, its arrows, and the label's default place (the middle; beyond the far
  // arrow when text and arrows do not fit between the extension lines, as on the sheet)
  function dimLayout(sc) {
    var ln = sc.lin;
    if (ln && !sc.laid) {
      var u = ln.u, w = dimTextWidth(sc.label), along = Math.abs(u[0]) * w + Math.abs(u[1]) * DIM_CAP + 2 * DIM_GAP;
      var fits = ln.L >= along + 2 * ARROW_L + 4, xo = ARROW_L + 6, a = ln.a, b = ln.b;
      if (fits) {
        sc.lines.push([a, b]);
        sc.arrows.push({ tip: a, dir: [-u[0], -u[1]] }, { tip: b, dir: u });
      } else {
        sc.lines.push([[a[0] - u[0] * xo, a[1] - u[1] * xo], [b[0] + u[0] * xo, b[1] + u[1] * xo]]);
        sc.arrows.push({ tip: a, dir: u }, { tip: b, dir: [-u[0], -u[1]] });
        if (!sc.along.fixed) sc.along.shift = ln.L / 2 + xo + along / 2;
      }
      sc.text.y += DIM_CAP / 2;   // y is the baseline: the digits centred on the line
    }
    sc.laid = true;
    return sc;
  }
  // lines broken where they cross the label's box (b = [x0, y0, x1, y1]): Liang–Barsky clip, the pieces outside kept
  function breakLines(lines, b) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var p = lines[i][0], q = lines[i][1], dx = q[0] - p[0], dy = q[1] - p[1], t0 = 0, t1 = 1, ok = true;
      var P4 = [-dx, dx, -dy, dy], Q4 = [p[0] - b[0], b[2] - p[0], p[1] - b[1], b[3] - p[1]];
      for (var k = 0; k < 4 && ok; k++) {
        if (Math.abs(P4[k]) < 1e-12) { if (Q4[k] < 0) ok = false; continue; }
        var r = Q4[k] / P4[k];
        if (P4[k] < 0) { if (r > t1) ok = false; else if (r > t0) t0 = r; }
        else { if (r < t0) ok = false; else if (r < t1) t1 = r; }
      }
      if (!ok || t1 - t0 < 1e-9) { out.push(lines[i]); continue; }
      if (t0 > 1e-6) out.push([p, [p[0] + dx * t0, p[1] + dy * t0]]);
      if (t1 < 1 - 1e-6) out.push([[p[0] + dx * t1, p[1] + dy * t1], q]);
    }
    return out;
  }
  // path data: lines as M..L.. pieces, arrowheads as closed triangles
  function r2(v) { return Math.round(v * 100) / 100; }
  // rfHA: a 1 px dimension / extension line that runs square to the screen sits on a device pixel's centre (crisp, not
  // a two-pixel grey smear); slanted lines are left as they are
  function pxSnap(v) {
    var dpr = window.devicePixelRatio || 1, dw = Math.max(1, Math.round(dpr)), o = (dw % 2) * 0.5;
    return (Math.floor(v * dpr - o + 0.5) + o) / dpr;
  }
  function linesPath(lines) {
    var d = '';
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i], x0 = l[0][0], y0 = l[0][1], x1 = l[1][0], y1 = l[1][1];
      if (Math.abs(y1 - y0) < 0.01 && Math.abs(x1 - x0) > 0.5) { y0 = y1 = pxSnap(y0); }
      else if (Math.abs(x1 - x0) < 0.01 && Math.abs(y1 - y0) > 0.5) { x0 = x1 = pxSnap(x0); }
      d += 'M' + r2(x0) + ' ' + r2(y0) + 'L' + r2(x1) + ' ' + r2(y1);
    }
    return d || 'M0 0';
  }
  function arrowsPath(arrows) {
    var d = '';
    for (var i = 0; i < arrows.length; i++) {
      var a = arrows[i], ax = a.dir[0] * ARROW_L, ay = a.dir[1] * ARROW_L, px = -a.dir[1] * ARROW_HW, py = a.dir[0] * ARROW_HW;
      d += 'M' + r2(a.tip[0]) + ' ' + r2(a.tip[1]) + 'L' + r2(a.tip[0] - ax + px) + ' ' + r2(a.tip[1] - ay + py) + 'L' + r2(a.tip[0] - ax - px) + ' ' + r2(a.tip[1] - ay - py) + 'Z';
    }
    return d || 'M0 0';
  }
  // Instant3D / feature dimensions in the part (ui-select.js) draw with the same layout: sc from UI.linearDimScreen or
  // UI.radialDimScreen -> { d: lines path, arrows: arrowheads path, text }
  UI.dimLayout = function (sc) {
    dimLayout(sc);
    // lane DA: in a part (Instant3D / feature dimensions) the label keeps off the model's visible edges
    if (App.mode === 'part' && UI.modelEdgeInBox && sc.along && !sc.along.radial && sc.text && UI.modelEdgeInBox(labelBox(sc, 0, 0))) {
      var al = sc.along, b0 = labelBox(sc, 0, 0), w = b0[2] - b0[0], step = Math.abs(al.u[0]) * w + Math.abs(al.u[1]) * (b0[3] - b0[1]) + 4;
      var tries = [1, -1, 2, -2, 3, -3, 4, -4];
      for (var k = 0; k < tries.length; k++) {
        var t = tries[k] * step;
        if (UI.modelEdgeInBox(labelBox(sc, al.u[0] * t, al.u[1] * t))) continue;
        sc.text = { x: sc.text.x + al.u[0] * t, y: sc.text.y + al.u[1] * t, anchor: sc.text.anchor };
        var reach = Math.abs(t) + step / 2;
        if (sc.lin && reach > al.half) {   // the dimension line runs on to a label moved past its end
          var c = [(sc.lin.a[0] + sc.lin.b[0]) / 2, (sc.lin.a[1] + sc.lin.b[1]) / 2], sg = t < 0 ? -1 : 1;
          sc.lines.push([[c[0] + al.u[0] * sg * al.half, c[1] + al.u[1] * sg * al.half], [c[0] + al.u[0] * sg * reach, c[1] + al.u[1] * sg * reach]]);
        }
        break;
      }
    }
    var b = labelBox(sc, 0, 0);
    return { d: linesPath(breakLines(sc.lines, b)), arrows: arrowsPath(sc.arrows), text: sc.text };
  };
  UI.dimTextWidth = dimTextWidth;
  UI.DIM_CAP = DIM_CAP;
  UI.linearDimScreen = linearDimScreen;

  // Screen-space drawing data for one dimension: lines, arrow heads, and the label with its anchor point.
  function dimScreen(pl, e, d) {
    var g = K.dimGeometry(e, d);
    if (!g) return null;
    var s = UI.cam.scale; // sketch units per pixel (orthographic camera)
    function S(uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
    var out = { lines: [], arrows: [], value: g.value, label: (g.prefix === '⌀' ? 'Ø' : g.prefix) + fmtDim(g.value) };   // r14/sketchui14: Century Gothic's Ø (it has no ⌀): the full-height diameter sign of SolidWorks' dimensions
    if (UI.dimLabelText) out.label = UI.dimLabelText(d, g.value, g.prefix === '⌀' ? 'dia' : g.prefix === 'R' ? 'r' : 'len');   // sketchdims: tolerance, precision, text, radius / diameter
    if (g.type === 'linear') {
      var ld = linearDimScreen(pl, g.P, g.Q, g.dir, d.off, d.tx);
      ld.value = g.value; ld.label = out.label;
      return ld;
    }
    var rd = radialDimScreen(pl, g.C, g.r, d.ang, d.off);
    rd.value = g.value; rd.label = out.label;
    return rd;
  }
  // a radius / diameter: arrow on the curve, a leader straight out from the centre at `angDeg`, then (ANSI,
  // r14/sketchui14) a short horizontal shoulder with the text after it, centred on it
  function radialDimScreen(pl, C, r, angDeg, off) {
    var s = UI.cam.scale;
    function S(uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
    var ang = (angDeg != null ? angDeg : 45) * Math.PI / 180, ux = Math.cos(ang), uy = Math.sin(ang);
    var dist = Math.max(off != null ? off : 0, r + 18 * s);
    var sPc = S([C[0] + ux * r, C[1] + uy * r]), sT = S([C[0] + ux * dist, C[1] + uy * dist]);
    var dx = sT[0] - sPc[0], dy = sT[1] - sPc[1], L = Math.hypot(dx, dy) || 1, ut = [dx / L, dy / L], sg = ut[0] >= -1e-9 ? 1 : -1;
    var out = { lines: [[sPc, sT], [sT, [sT[0] + sg * SHOULDER, sT[1]]]], arrows: [{ tip: sPc, dir: [-ut[0], -ut[1]] }] };
    out.text = { x: sT[0] + sg * (SHOULDER + DIM_GAP), y: sT[1] + DIM_CAP / 2, anchor: sg > 0 ? 'start' : 'end' };
    out.along = { u: ut, half: 0, radial: true };
    out.laid = true;
    return out;
  }
  UI.radialDimScreen = radialDimScreen;

  // ---- labels kept apart: each label drawn takes a box; a label that would overlap one drawn before it slides along
  // its dimension line (a radius / diameter label: out along its leader) to the nearest free place, and the
  // dimension line is extended to reach it. Display only: the stored placement does not change. The label being
  // placed with the Smart Dimension tool stays under the cursor and moves nothing.
  var labelBoxes = [];
  // p9-sketch: and clear of the other dimensions' lines (a label sitting on a neighbour's extension or dimension line,
  // QUEUE Round-14). drawDims collects every dimension's lines as it draws (dimSegsNow, with the owner's key) and,
  // when a label landed on another dimension's line, draws once more with those lines as obstacles (dimSegs).
  var dimSegs = null, dimSegsNow = [], drawnLabels = [], prevLabels = null;   // prevLabels: the labels of the previous layout pass
  function segHitsBox(p, q, b) {
    var dx = q[0] - p[0], dy = q[1] - p[1], t0 = 0, t1 = 1;
    var P4 = [-dx, dx, -dy, dy], Q4 = [p[0] - b[0], b[2] - p[0], p[1] - b[1], b[3] - p[1]];
    for (var k = 0; k < 4; k++) {
      if (Math.abs(P4[k]) < 1e-12) { if (Q4[k] < 0) return false; continue; }
      var r = Q4[k] / P4[k];
      if (P4[k] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t1 - t0 > 1e-9;
  }
  function onOtherLines(b, owner, segs) {
    for (var i = 0; i < segs.length; i++) if (segs[i].owner !== owner && segHitsBox(segs[i].a, segs[i].b, b)) return true;
    return false;
  }
  // r14/sketchui14: the label's box from the font's own widths, its capitals' height and a 3 px gap round it (also
  // the break in the dimension line)
  function labelBox(sc, dx, dy) {
    var w = dimTextWidth(sc.label), x = sc.text.x + dx, y = sc.text.y + dy;
    var x0 = sc.text.anchor === 'middle' ? x - w / 2 : sc.text.anchor === 'end' ? x - w : x;
    return [x0 - DIM_GAP, y - DIM_CAP - DIM_GAP, x0 + w + DIM_GAP, y + DIM_GAP];
  }
  // owner (a dimension's key): its label must also stay off the other dimensions' lines (dimSegs, second pass)
  // geo (p9-sketchfix): and off the sketch's own geometry (geoSegs: a label slides off a hole it landed on, a relation
  // icon that finds no free place clear of the curves is not drawn, so zoomed out the icons no longer cover the sketch)
  function boxFree(b, owner, geo) {
    for (var i = 0; i < labelBoxes.length; i++) { var o = labelBoxes[i]; if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false; }
    if (owner != null && dimSegs && onOtherLines(b, owner, dimSegs)) return false;
    if (geo && geoSegs && onGeometry(b)) return false;
    return true;
  }
  // the active sketch's curves on screen as segments (with their boxes, for a quick reject), made once per drawDims
  var geoSegs = null;
  function screenGeometry(f, pl) {
    var out = [], W = UI.size ? UI.size.w : 1e9, H = UI.size ? UI.size.h : 1e9;
    (f.entities || []).forEach(function (e) {
      if (!e || e.t === 'point') return;
      var pls;
      try { pls = K.entityPolylines(e); } catch (err) { return; }
      pls.forEach(function (l) {
        var s = l.pts.map(function (q) { return UI.worldToScreen(K.to3D(pl, q[0], q[1])); }), n = s.length, cnt = l.closed ? n : n - 1;
        for (var k = 0; k < cnt; k++) {
          var a = s[k], c = s[(k + 1) % n];
          if (!a || !c) continue;
          var x0 = Math.min(a[0], c[0]), x1 = Math.max(a[0], c[0]), y0 = Math.min(a[1], c[1]), y1 = Math.max(a[1], c[1]);
          if (x1 < -50 || y1 < -50 || x0 > W + 50 || y0 > H + 50) continue;
          out.push({ a: a, b: c, box: [x0, y0, x1, y1] });
        }
      });
    });
    return out;
  }
  function onGeometry(b) {
    for (var i = 0; i < geoSegs.length; i++) {
      var g = geoSegs[i], q = g.box;
      if (q[2] < b[0] || q[0] > b[2] || q[3] < b[1] || q[1] > b[3]) continue;
      if (segHitsBox(g.a, g.b, b)) return true;
    }
    return false;
  }
  UI.sketchGeometryAt = function (b) { var f = UI.activeSketchFeature(); if (!f || App.mode !== 'sketch') return false; geoSegs = screenGeometry(f, UI.activePlane()); var r = onGeometry(b); geoSegs = null; return r; };

  // rfIB (user 2026-11-05: "dont let smart dimensions take line size priority"). The dimension layer is an SVG over the
  // WebGL canvas, so a dimension's 1 px line and its 3 px light casing (rfHA) replaced the sketch line wherever they ran
  // along it — a distance between two parallel lines draws its extension lines from each line's middle, along the line,
  // so half of every edge of a dimensioned rectangle was a hairline — and notched it (and the end dots) where they
  // crossed it. Every dimension / extension line is now cut where it comes within GEO_CLEAR px of the active sketch's
  // drawn curves (GEO_PT_CLEAR of its dots); an arrowhead whose tip lands on them steps back to touch them, and one
  // they cross is masked (#dim-geo-mask: only those arrowheads, a mask costs a paint per element). So the geometry
  // always shows at its full weight and colour, in every status colour, at every zoom. Text is left as it was (in front).
  var GEO_CLEAR = 3, GEO_PT_CLEAR = 6.5, GEO_ARROW_CLEAR = 1.6, GEO_ARROW_PT = 5.75;   // px from a curve's centre (a 2 px line, a 1 px casing)
  // per drawDims: { f, m (sketch -> screen, affine), grid (built on the first query), mSegs, mPts, mKeys (the mask's) }
  var clipState = null;
  var uvCache = { key: null, f: null, ents: null };
  // the drawn curves (as ui-core draws them: UI.screenPolylines) and dots (sketchEndPoints' rule) of each shown entity of
  // f in sketch coordinates, as flat arrays (seg: ax ay bx by …, pts: x y …); kept while the sketches are not redrawn
  // (UI.sketchSceneVersion), so a zoom or pan frame only maps them to the screen
  function clipEntitiesUV(f) {
    var key = (UI.sketchSceneVersion ? UI.sketchSceneVersion() : NaN) + ':' + f.entities.length;
    if (uvCache.f === f && uvCache.key === key) return uvCache.ents;
    var S = window.SketchSolver, ents = [];
    f.entities.forEach(function (e, i) {
      if (!e) return;
      var ly = UI.sketchLayerStyle ? UI.sketchLayerStyle(f, e, true) : null;
      if (ly && ly.hidden) return;
      var seg = [], pts = [];
      if (e.t === 'point') pts.push(e.x, e.y);
      else {
        var pls;
        try { pls = UI.screenPolylines ? UI.screenPolylines(e) : K.entityPolylines(e); } catch (err) { pls = []; }
        (pls || []).forEach(function (l) {
          var q = l.pts, n = q ? q.length : 0, cnt = l.closed ? n : n - 1;
          for (var k = 0; k < cnt && n > 1; k++) { var a = q[k], b = q[(k + 1) % n]; seg.push(a[0], a[1], b[0], b[1]); }
        });
        if (S && S.pointRefs) {
          try {
            var inf = S.infSides ? S.infSides(e) : null;
            S.pointRefs(f, i).forEach(function (pr) {
              if (/\.mid$/.test(pr.ref) || (e.t === 'rect' && /\.c$/.test(pr.ref))) return;
              if (inf && inf[pr.ref.split('.')[1]]) return;
              if (App.view.showEndpoints === false && !/\.c$/.test(pr.ref)) return;
              pts.push(pr.pt[0], pr.pt[1]);
            });
          } catch (err) { /* no dots */ }
        }
      }
      if (seg.length || pts.length) ents.push({ seg: seg, pts: pts });
    });
    uvCache = { key: key, f: f, ents: ents };
    return ents;
  }
  var geoClearOn = true;
  // UI.dimGeometryClear(on?) -> whether dimension lines are cut clear of the sketch geometry (off: as before rfIB, for comparisons)
  UI.dimGeometryClear = function (on) { if (on != null) { geoClearOn = !!on; App.dimsStale = true; } return geoClearOn; };
  function clipBegin(f, pl) {
    clipState = null;
    if (!f || !pl || !geoClearOn) return;
    // the view is orthographic, so sketch (u, v) -> screen is affine: three projections per draw, not one per point
    var o = UI.worldToScreen(K.to3D(pl, 0, 0)), x = UI.worldToScreen(K.to3D(pl, 1, 0)), y = UI.worldToScreen(K.to3D(pl, 0, 1));
    if (!o || !x || !y) return;
    var m = [o[0], o[1], x[0] - o[0], x[1] - o[1], y[0] - o[0], y[1] - o[1]];
    if (!(Math.abs(m[2] * m[5] - m[4] * m[3]) > 1e-12)) return;   // the sketch plane seen edge-on: nothing to keep clear
    clipState = { f: f, m: m, grid: null, mSegs: [], mPts: [], mKeys: new Set() };
  }
  // The sketch on screen in a grid (built once per drawDims, on the first query): item k is a segment (xy[4k…4k+3]) or
  // a dot (dot[k] = 1), listed in every cell its box meets. The grid spans the items' box (cut to the view and a
  // margin: anything further out is clamped into the border cells, as a query is, so nothing is missed) in cells sized
  // to the items' density, so a sketch zoomed far out (everything within a few pixels) still tests few per query
  var GRID_MARGIN = 240, GRID_DENSE = 4;
  function clipGrid() {
    var st = clipState;
    if (st.grid) return st.grid;
    var m = st.m, W = UI.size ? UI.size.w : 2000, H = UI.size ? UI.size.h : 2000, xy = [], dot = [];
    clipEntitiesUV(st.f).forEach(function (en) {
      var s = en.seg, p = en.pts;
      for (var j = 0; j < s.length; j += 4) { xy.push(m[0] + s[j] * m[2] + s[j + 1] * m[4], m[1] + s[j] * m[3] + s[j + 1] * m[5], m[0] + s[j + 2] * m[2] + s[j + 3] * m[4], m[1] + s[j + 2] * m[3] + s[j + 3] * m[5]); dot.push(0); }
      for (var k = 0; k < p.length; k += 2) { var x = m[0] + p[k] * m[2] + p[k + 1] * m[4], y = m[1] + p[k] * m[3] + p[k + 1] * m[5]; xy.push(x, y, x, y); dot.push(1); }
    });
    var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (var a = 0; a < xy.length; a += 2) { if (xy[a] < bx0) bx0 = xy[a]; if (xy[a] > bx1) bx1 = xy[a]; if (xy[a + 1] < by0) by0 = xy[a + 1]; if (xy[a + 1] > by1) by1 = xy[a + 1]; }
    bx0 = Math.max(bx0, -GRID_MARGIN); by0 = Math.max(by0, -GRID_MARGIN); bx1 = Math.min(bx1, W + GRID_MARGIN); by1 = Math.min(by1, H + GRID_MARGIN);
    if (!(bx1 >= bx0)) { bx0 = bx1 = 0; } if (!(by1 >= by0)) { by0 = by1 = 0; }
    var wB = bx1 - bx0 + 1, hB = by1 - by0 + 1, size = Math.sqrt(wB * hB / Math.max(1, dot.length)) * 2;
    size = Math.max(size, Math.sqrt(wB * hB / 40000), 3);   // at most about 40 000 cells
    size = Math.min(size, 48);
    var nx = Math.max(1, Math.ceil(wB / size)), ny = Math.max(1, Math.ceil(hB / size)), cells = new Array(nx * ny);
    function cx(x) { var c = Math.floor((x - bx0) / size); return c < 0 ? 0 : c >= nx ? nx - 1 : c; }
    function cy(y) { var c = Math.floor((y - by0) / size); return c < 0 ? 0 : c >= ny ? ny - 1 : c; }
    for (var k2 = 0; k2 < dot.length; k2++) {
      var o = 4 * k2, i0 = cx(Math.min(xy[o], xy[o + 2])), i1 = cx(Math.max(xy[o], xy[o + 2])), j0 = cy(Math.min(xy[o + 1], xy[o + 3])), j1 = cy(Math.max(xy[o + 1], xy[o + 3]));
      for (var jj = j0; jj <= j1; jj++) for (var ii = i0; ii <= i1; ii++) { var c = jj * nx + ii; (cells[c] || (cells[c] = [])).push(k2); }
    }
    // a sketch so far zoomed out that its curves average under GRID_DENSE px apart: no dimension line can be clear of
    // them (nor read) there, so none is cut (it would cost a few ms a frame for nothing)
    var spacing = Math.sqrt(wB * hB / Math.max(1, dot.length));
    st.grid = { xy: xy, dot: dot, cells: cells, nx: nx, cx: cx, cy: cy, stamp: new Int32Array(dot.length), q: 0, spacing: spacing, dense: spacing < GRID_DENSE };
    return st.grid;
  }
  // the part [spanLo, spanHi] of p + t·d (t over all reals) within r of the segment a–b: a capsule, convex, so one
  // interval (the union of its two end discs' and its middle band's spans); false when the line misses it
  var spanLo = 0, spanHi = 0;
  function capsuleSpan(px, py, dx, dy, ax, ay, bx, by, r) {
    var lo = Infinity, hi = -Infinity, A = dx * dx + dy * dy, r2s = r * r;
    if (A < 1e-12) return false;
    for (var e = 0; e < 2; e++) {
      var cx = e ? bx : ax, cy = e ? by : ay;
      if (e && bx === ax && by === ay) break;
      var fx = px - cx, fy = py - cy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r2s, D = B * B - 4 * A * C;
      if (D < 0) continue;
      var s = Math.sqrt(D), t0 = (-B - s) / (2 * A), t1 = (-B + s) / (2 * A);
      if (t0 < lo) lo = t0;
      if (t1 > hi) hi = t1;
    }
    var ex = bx - ax, ey = by - ay, L = Math.sqrt(ex * ex + ey * ey);
    if (L > 1e-9) {
      ex /= L; ey /= L;
      var qx = px - ax, qy = py - ay, w0 = -Infinity, w1 = Infinity;
      // along the segment 0 … L, across it −r … r
      var u0 = qx * ex + qy * ey, du = dx * ex + dy * ey, v0 = -qx * ey + qy * ex, dv = -dx * ey + dy * ex;
      for (var k = 0; k < 2; k++) {
        var q0 = k ? v0 : u0, dq = k ? dv : du, mn = k ? -r : 0, mx = k ? r : L;
        if (Math.abs(dq) < 1e-12) { if (q0 < mn || q0 > mx) w0 = Infinity; continue; }
        var s0 = (mn - q0) / dq, s1 = (mx - q0) / dq;
        if (s0 > s1) { var tt = s0; s0 = s1; s1 = tt; }
        if (s0 > w0) w0 = s0;
        if (s1 < w1) w1 = s1;
      }
      if (w0 <= w1) { if (w0 < lo) lo = w0; if (w1 > hi) hi = w1; }
    }
    if (!(lo <= hi)) return false;
    spanLo = lo; spanHi = hi;
    return true;
  }
  // calls fn(lo, hi, k, isDot) for every drawn segment / dot k of the sketch within r (rDot) of the line p–q (spans
  // meeting its [0, 1] part): the grid cells its padded box meets, then a band test, then the exact one
  function nearGeometry(p, q, r, rDot, fn) {
    var g = clipGrid(), dx = q[0] - p[0], dy = q[1] - p[1], Lq = Math.sqrt(dx * dx + dy * dy);
    if (Lq < 1e-9 || !g.dot.length || g.dense) return;
    var pad = Math.max(r, rDot), xy = g.xy, stamp = g.stamp, qn = ++g.q;
    var i0 = g.cx(Math.min(p[0], q[0]) - pad), i1 = g.cx(Math.max(p[0], q[0]) + pad), j0 = g.cy(Math.min(p[1], q[1]) - pad), j1 = g.cy(Math.max(p[1], q[1]) + pad);
    var ux = dx / Lq, uy = dy / Lq, nc = -uy * p[0] + ux * p[1], tc = ux * p[0] + uy * p[1];
    for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
      var cell = g.cells[j * g.nx + i];
      if (!cell) continue;
      for (var c = 0; c < cell.length; c++) {
        var k = cell[c];
        if (stamp[k] === qn) continue;
        stamp[k] = qn;
        var isDot = g.dot[k] === 1, rr = isDot ? rDot : r, o = 4 * k, Ax = xy[o], Ay = xy[o + 1], Bx = xy[o + 2], By = xy[o + 3];
        var na = -uy * Ax + ux * Ay - nc, nb = -uy * Bx + ux * By - nc;
        if ((na > rr && nb > rr) || (na < -rr && nb < -rr)) continue;
        var ta = ux * Ax + uy * Ay - tc, tb = ux * Bx + uy * By - tc;
        if ((ta < -rr && tb < -rr) || (ta > Lq + rr && tb > Lq + rr)) continue;
        if (capsuleSpan(p[0], p[1], dx, dy, Ax, Ay, Bx, By, rr) && spanHi > 0 && spanLo < 1) fn(spanLo, spanHi, k, isDot);
      }
    }
  }
  // dimension / extension lines with the parts on or by the sketch's drawn curves and dots taken out
  function clearOfGeometry(lines) {
    if (!clipState) return lines;
    var out = [], cuts;
    function cut(lo, hi) { cuts.push(lo < 0 ? 0 : lo, hi > 1 ? 1 : hi); }
    for (var i = 0; i < lines.length; i++) {
      var p = lines[i][0], q = lines[i][1], L = Math.sqrt((q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]));
      cuts = [];
      if (L < 1e-6) { out.push(lines[i]); continue; }
      nearGeometry(p, q, GEO_CLEAR, GEO_PT_CLEAR, cut);
      if (!cuts.length) { out.push(lines[i]); continue; }
      var order = [];
      for (var c = 0; c < cuts.length; c += 2) order.push(c);
      order.sort(function (a, b) { return cuts[a] - cuts[b]; });
      var t = 0, minT = 0.75 / L;   // pieces under 3/4 px are dropped
      for (var k = 0; k <= order.length; k++) {
        var end = k < order.length ? cuts[order[k]] : 1;
        if (end - t > minT) out.push([[p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], [p[0] + (q[0] - p[0]) * end, p[1] + (q[1] - p[1]) * end]]);
        if (k < order.length && cuts[order[k] + 1] > t) t = cuts[order[k] + 1];
      }
    }
    return out;
  }
  // the arrowheads clear of the sketch's curves and dots: one test per arrowhead, along its axis (tip to the middle of
  // its base) within ARROW_R (its half width and its casing). A tip that lands on a curve (or a dot) steps back along
  // the arrow until it only touches it (GEO_ARROW_CLEAR from a curve's centre: its edge; at most half the arrow's
  // length); a curve across the rest of it goes into the mask and the dimension's arrowheads are masked (arrowsMasked)
  var ARROW_R = ARROW_HW + 0.75, arrowsMasked = false;
  function arrowsClear(arrows) {
    var st = clipState, g = clipGrid();
    arrowsMasked = false;
    function take(k, dot) {
      arrowsMasked = true;
      if (st.mKeys.has(k)) return;
      st.mKeys.add(k);
      var o = 4 * k;
      if (dot) st.mPts.push([g.xy[o], g.xy[o + 1]]); else st.mSegs.push([g.xy[o], g.xy[o + 1], g.xy[o + 2], g.xy[o + 3]]);
    }
    return arrows.map(function (a) {
      var hits = [], back = 0, base = [a.tip[0] - a.dir[0] * ARROW_L, a.tip[1] - a.dir[1] * ARROW_L];
      nearGeometry(a.tip, base, ARROW_R, GEO_ARROW_PT, function (lo, hi, k, dot) { hits.push([lo, hi, k, dot]); });
      if (!hits.length) return a;
      hits.forEach(function (h) { if (h[0] <= 0.05) back = Math.max(back, h[3] ? h[1] : h[1] - (ARROW_R - GEO_ARROW_CLEAR) / ARROW_L); });
      if (back > 0.5) back = 0;   // a curve along the arrow: it stays, masked
      hits.forEach(function (h) { if (!(back > 0 && h[0] <= 0.05)) take(h[2], h[3]); });
      if (!(back > 0)) return a;
      var c = {}, key;
      for (key in a) c[key] = a[key];
      c.tip = [a.tip[0] - a.dir[0] * ARROW_L * back, a.tip[1] - a.dir[1] * ARROW_L * back];
      return c;
    });
  }
  // the mask's path data: the curves an arrowhead crosses (stroked, GEO_ARROW_CLEAR each side), their dots (filled)
  function maskPaths() {
    var st = clipState, dl = '', dp = '';
    if (st) {
      st.mSegs.forEach(function (g) { dl += 'M' + r2(g[0]) + ' ' + r2(g[1]) + 'L' + r2(g[2]) + ' ' + r2(g[3]); });
      st.mPts.forEach(function (g) { var r = GEO_ARROW_PT; dp += 'M' + r2(g[0] - r) + ' ' + r2(g[1]) + 'a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0a' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0Z'; });
    }
    return { lines: dl || 'M0 0', dots: dp || 'M0 0' };
  }
  // test hook: the dimension lines as drawn after the cut (screen px) for lines given in screen px
  UI.dimLinesClearOfGeometry = function (lines) {
    var f = UI.activeSketchFeature();
    if (!f || App.mode !== 'sketch') return lines;
    var keep = clipState;
    clipBegin(f, UI.activePlane());
    try { return clearOfGeometry(lines); } finally { clipState = keep; }
  };
  function placeLabel(sc, it) {
    if (!sc.text) return;
    var own = it.temp ? null : dimKey(it);
    var al = sc.along, s0 = al && al.shift || 0, b = labelBox(sc, al ? al.u[0] * s0 : 0, al ? al.u[1] * s0 : 0), best = s0;
    if (al && !it.temp && !boxFree(b, own, true)) {
      var w = b[2] - b[0], step = al.radial ? 14 : Math.abs(al.u[0]) * w + Math.abs(al.u[1]) * (b[3] - b[1]) + 4, tries = al.radial ? [1, 2, 3, 4, 5] : [1, -1, 2, -2, 3, -3, 4, -4];
      // p9-sketchfix: first a place clear of the sketch's curves too; failing that, clear of the labels and lines only
      // (where it is, if it is), as before
      for (var pass = 0; pass < 2; pass++) {
        var geo = pass === 0, found = false;
        if (!geo && boxFree(b, own, false)) break;
        for (var k = 0; k < tries.length; k++) {
          var t = s0 + tries[k] * step, bb = labelBox(sc, al.u[0] * t, al.u[1] * t);
          if (boxFree(bb, own, geo)) { best = t; b = bb; found = true; break; }
        }
        if (found) break;
      }
    }
    if (al && best) {
      sc.text = { x: sc.text.x + al.u[0] * best, y: sc.text.y + al.u[1] * best, anchor: sc.text.anchor };
      // the dimension line runs on to a label moved past its end (into the label's break: drawOne cuts it there)
      var reach = Math.abs(best);
      if (!al.radial && reach > al.half) {
        var line = sc.lines[sc.lines.length - 1], c = [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2], sg = best < 0 ? -1 : 1;
        sc.lines.push([[c[0] + al.u[0] * sg * al.half, c[1] + al.u[1] * sg * al.half], [c[0] + al.u[0] * sg * reach, c[1] + al.u[1] * sg * reach]]);
      } else if (al.radial) {
        // the leader runs on and the shoulder moves out with the label
        var ld = sc.lines[0], dx = al.u[0] * best, dy = al.u[1] * best, sh = sc.lines[1];
        sc.lines.push([ld[1], [ld[1][0] + dx, ld[1][1] + dy]]);
        if (sh) sc.lines[1] = [[sh[0][0] + dx, sh[0][1] + dy], [sh[1][0] + dx, sh[1][1] + dy]];
      }
    }
    sc.box = b;
    if (!it.temp) {
      labelBoxes.push(b);
      drawnLabels.push({ box: b, owner: own, label: sc.label });
      sc.lines.forEach(function (l) { dimSegsNow.push({ a: l[0], b: l[1], owner: own }); });
    }
  }

  // ---- selecting, moving and editing a dimension, as in SolidWorks: a click selects it, a double-click opens the
  // Modify box, dragging the value moves the dimension (its offset / angle; a distance keeps its direction)
  var lastDimDown = null;   // { key, t } of the last press on a dimension value (double-click detection)
  function dimKey(it) { return it.rel != null ? 'r' + it.rel : it.auto ? 'a' + it.d.e + it.d.k + (it.d.i | 0) : 'd' + it.index; }
  function selectDim(it) {
    if (it.rel != null) App.sel = { kind: 'rel', index: it.rel };
    else if (!it.auto) App.sel = { kind: 'dim', index: it.index };
    else return;
    if (UI.openDimensionPM && UI.openDimensionPM(App.sel)) { UI.updateSketches(); return; }   // sketchdims: its Dimension PropertyManager
    UI.closePM(); UI.updateSketches();
  }
  function editDimItem(it) {
    if (it.d.driven && UI.drivenDimClick) { UI.drivenDimClick(it); return; }
    openDimEdit(it);
  }
  // p9-sketchfix: while a PropertyManager collects a selection (Linear Sketch Pattern, Mirror Entities, Add Relations …)
  // or a tool is waiting for an entity (a drawing tool, Smart Dimension's second pick), a press on a dimension's text
  // that also lies on sketch geometry goes to the geometry, as the click was meant: the 3.000 label sitting on a Ø.266
  // hole no longer opens the dimension instead of picking the hole.
  function geometryUnderLabel(ev) {
    var st = App.toolState || {};
    var wants = (App.command && (App.command.onSketchPoint || App.command.onPick)) || (UI.pmCollectsSelection && UI.pmCollectsSelection()) ||
      (App.tool && App.tool !== 'select' && (App.tool !== 'dimension' || st.dim || st.pt1 || st.relDim));
    if (!wants) return null;
    var p = pos(ev);
    return UI.pickEntity(p[0], p[1]) ? p : null;
  }
  function passToGeometry(ev, p) {
    ev.stopPropagation(); ev.preventDefault();
    function up(e2) {
      window.removeEventListener('mouseup', up, true);
      var q = pos(e2);
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 4 || e2.button !== 0) return;
      e2.stopPropagation();
      sketchClick(p[0], p[1], e2);
    }
    window.addEventListener('mouseup', up, true);
  }
  // the same for a relation icon (ui-relations.js): true when the press went to the geometry under it
  UI.labelPassThrough = function (ev) {
    if (ev.button !== 0) return false;
    var p = geometryUnderLabel(ev);
    if (!p) return false;
    passToGeometry(ev, p);
    return true;
  };
  function dimPress(ev, it) {
    if (ev.button !== 0) return;
    var through = geometryUnderLabel(ev);
    if (through) { passToGeometry(ev, through); return; }
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
      if (d.type === 'angle') { if (pl.ta != null) d.ta = pl.ta; else delete d.ta; }   // r5/sketch5: an angle's label too
      else if (pl.off != null && pl.ang == null) { if (pl.tx != null) d.tx = pl.tx; else delete d.tx; }   // a linear label sits where it is dropped
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

  var dimCasing = null;   // rfHA: the casing path data of the drawing in progress (drawDimsIn), else null
  function drawOne(sc, it) {
    var isSel = it.rel != null ? App.sel && App.sel.kind === 'rel' && App.sel.index === it.rel : App.sel && App.sel.kind === 'dim' && App.sel.index === it.index;
    var cls = 'dim' + (it.temp ? ' temp' : '') + (it.auto ? ' auto' : '') + (!it.temp && !it.auto && isSel ? ' sel' : '') + (it.state && it.state !== 'ok' ? ' ' + it.state : '');
    dimLayout(sc);
    placeLabel(sc, it);
    var gEl = svg('g', { 'class': cls }, dimLayer);
    // r14/sketchui14: every line of the dimension stops at the label's box (the text sits in a break of the line)
    // All its lines are one <path>, its arrowheads another (r12/sketchui12 slender, r14/sketchui14 ANSI 10 × 3.4 px):
    // four nodes per dimension whatever the break does, so the frame-to-frame node reuse always matches
    // rfHA: the lines also go into the layer's one dark casing path (path.dlh, 3 px, under every dimension: drawDimsIn)
    // so the light 1 px lines read on a light face as on the ground, as the text's halo does; the arrows take the same
    // casing from CSS (paint-order: stroke). One node for the whole layer keeps three children per dimension.
    // rfIB: and where they run on or cross the sketch's own curves and dots (the geometry is drawn over them)
    var dlD = linesPath(clearOfGeometry(sc.box ? breakLines(sc.lines, sc.box) : sc.lines));
    if (dimCasing != null) dimCasing += dlD;
    svg('path', { 'class': 'dl', d: dlD }, gEl);
    // rfIB: an arrowhead whose tip lands on the sketch's curves steps back to touch them, not cover them; one that still
    // overlaps them (a curve running across its body) is masked
    var arr = clipState ? arrowsClear(sc.arrows) : sc.arrows, daA = { 'class': 'da', d: arrowsPath(arr) };
    if (clipState && arrowsMasked) daA.mask = 'url(#dim-geo-mask)';
    svg('path', daA, gEl);
    var ta = { x: r2(sc.text.x), y: r2(sc.text.y), 'text-anchor': sc.text.anchor };
    if (!it.temp) { ta.tabindex = '0'; ta.role = 'button'; ta['aria-label'] = 'Dimension ' + sc.label + ', double-click to change, drag to move'; }
    var t = svg('text', ta, gEl);
    svgText(t, sc.label);
    // sketchdims: a Basic dimension's value in a box
    if (it.d && it.d.tol && it.d.tol.type === 'basic' && sc.box) svg('rect', { 'class': 'dbox', x: r2(sc.box[0] + 1), y: r2(sc.box[1] + 1), width: r2(sc.box[2] - sc.box[0] - 2), height: r2(sc.box[3] - sc.box[1] - 2) }, gEl);
    it.label = sc.label;
    it.sc = sc;   // rfAV: Instant2D finds the dimension's lines, arrows and label box here
    if (!it.temp) {
      t._d = it;
      // r12/sketchui12: listeners once per (reused) node; they act on the item drawn there now
      if (!t._dimLis) {
        t._dimLis = true;
        t.addEventListener('mousedown', function (ev) { if (t._d) dimPress(ev, t._d); });
        t.addEventListener('click', function (ev) { if (t._d) ev.stopPropagation(); });
        t.addEventListener('dblclick', function (ev) { if (t._d) ev.stopPropagation(); });
        t.addEventListener('keydown', function (ev) { var d = t._d; if (d && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.stopPropagation(); selectDim(d); editDimItem(d); } });
      }
    }
    it.text = sc.text;
  }

  // Redraw every dimension of the active sketch. Called from the render loop whenever App.dimsStale is set.
  var lastDimDraw = 0, settleTimer = 0;
  function drawDims(full) {   // full: the whole layout even right after another draw (tests)
    var f = UI.activeSketchFeature(), out, now = performance.now(), busy = !full && now - lastDimDraw < 120;
    lastDimDraw = now;
    dimSegs = null; prevLabels = null;
    var fG = UI.activeSketchFeature();
    geoSegs = fG && App.mode === 'sketch' ? screenGeometry(fG, UI.activePlane()) : null;
    clipBegin(fG && App.mode === 'sketch' ? fG : null, fG ? UI.activePlane() : null);   // rfIB
    // p9-sketch: a second pass when a label landed on another dimension's line, with every line as an obstacle
    // (and a third when a label moved in the second ran a neighbour's line on into another label). While the view or
    // the sketch changes every frame (zoom, pan, drag) one pass is drawn and the full layout follows 150 ms after the
    // last frame, so a crowded sketch stays fast to move.
    if (busy) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () { lastDimDraw = 0; App.dimsStale = true; if (UI.requestRender) UI.requestRender(); }, 150);
    }
    function layout(turn) {
      radialTurnOn = turn; radialTurned = false; dimSegs = null; prevLabels = null;
      for (var pass = 0; pass < (busy ? 1 : 3); pass++) {
        labelBoxes = []; drawnLabels = []; dimSegsNow = [];
        rcBegin(dimLayer, dimLayer.firstChild);
        try { out = drawDimsIn(f); } finally { rcEnd(); }
        if (pass === 2 || !drawnLabels.some(function (x) { return onOtherLines(x.box, x.owner, dimSegsNow); })) break;
        dimSegs = dimSegs ? dimSegs.concat(dimSegsNow) : dimSegsNow;
        prevLabels = drawnLabels.slice();
      }
      return drawnLabels.filter(function (x) { return onOtherLines(x.box, x.owner, dimSegsNow); }).length;
    }
    // a layout with turned Ø / R leaders is kept only when it ends with fewer labels on other lines than the plain one
    var withTurn = layout(true);
    if (radialTurned && withTurn > 0 && layout(false) > withTurn) layout(true);
    radialTurnOn = true;
    dimSegs = null; geoSegs = null; prevLabels = null; clipState = null;
    lastClashes = drawnLabels.filter(function (x) { return onOtherLines(x.box, x.owner, dimSegsNow); }).map(function (x) {
      return x.label + ' on ' + dimSegsNow.filter(function (g) { return g.owner !== x.owner && segHitsBox(g.a, g.b, x.box); }).map(function (g) { return g.owner; }).join('/');
    });
    return out;
  }
  // A Ø / R dimension the user has not turned (no `ang`) whose leader crossed another dimension's label, or whose own
  // label had no free place, in the previous layout pass: the leader turns to the first angle clear of both (45° stays
  // when nothing is free), as SolidWorks places radial dimensions away from their neighbours
  var RADIAL_TRIES = [135, -45, -135, 90, -90, 0, 180, 30, 150, -30, -150, 60, 120, -60, -120];
  var radialTurnOn = true, radialTurned = false;
  function radialClear(pl, e, it, sc) {
    if (!radialTurnOn) return sc;
    var own = dimKey(it);
    function clashes(c) {
      var segs = c.lines.map(function (l) { return { a: l[0], b: l[1], owner: own }; });
      if (prevLabels.some(function (x) { return x.owner !== own && onOtherLines(x.box, x.owner, segs); })) return true;
      return !boxFree(labelBox(c, 0, 0), own, false);
    }
    if (!clashes(sc)) return sc;
    for (var k = 0; k < RADIAL_TRIES.length; k++) {
      var d2 = {}; for (var key in it.d) d2[key] = it.d[key];
      d2.ang = RADIAL_TRIES[k];
      var c = dimScreen(pl, e, d2);
      if (c && !clashes(c)) { radialTurned = true; return c; }
    }
    return sc;
  }
  // p9-sketch: test hook — how many labels of the last drawing sit on another dimension's lines (0 when all are clear);
  // list: which ("R.250 on r3")
  var lastClashes = [];
  UI.dimLabelClashes = function (list) { return list ? lastClashes.slice() : lastClashes.length; };
  UI.dimKey = dimKey;   // rfAV: Instant2D (ui-sketch-dims.js)
  // rfHW: a linear dimension placed automatically (Fully Define / Autodimension rows, a tool's Add dimensions, typed
  // values) steps further out, one usual dimension spacing at a time (SolidWorks' 6 mm "from last dimension", at least
  // 34 px at the current zoom), until its label sits clear of the other dimensions' lines and labels, and off the
  // sketch geometry when such a place is found within CLEAR_STEPS steps (else the first place clear of the dimensions,
  // else where it was). Out = away from its first point on the side it is on (the sign of `off`). A dimension the
  // user placed or dragged is never passed here. made: [{ dim: i } | { rel: i }], handled in order, each one against
  // the dimensions not in the list and the ones of the list already handled. Returns how many moved.
  var CLEAR_STEPS = 8, SVG_NS = 'http://www.w3.org/2000/svg';
  function defaultScreens(f, pl, keys) {   // key -> sc (laid out, label at its default place) of placed dims and rels
    var out = {};
    (f.dims || []).forEach(function (d, i) { var k = 'd' + i, e = f.entities[d.e], sc = keys[k] !== false && e ? dimScreen(pl, e, d) : null; if (sc) out[k] = dimLayout(sc); });
    if (UI.drawRelations && f.rels && f.rels.length) {
      var dummy = function () { return document.createElementNS(SVG_NS, 'g'); };
      UI.drawRelations(f, pl, dummy(), { svg: dummy, text: function () {}, list: [], free: function () { return true; }, freeKeep: function () { return true; }, take: function () {},
        drawOne: function (sc, it) { if (!it.temp && it.rel != null && keys['r' + it.rel] !== false && sc) out['r' + it.rel] = dimLayout(sc); } });
    }
    return out;
  }
  function defaultBox(sc) { var al = sc.along, s0 = al && al.shift || 0; return labelBox(sc, al ? al.u[0] * s0 : 0, al ? al.u[1] * s0 : 0); }
  function boxesMeet(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
  function placeClear(sc, others, geo) {
    var b = defaultBox(sc);
    for (var i = 0; i < others.length; i++) {
      var o = others[i];
      if (boxesMeet(b, o.box)) return false;
      if (o.sc.lines.some(function (l) { return segHitsBox(l[0], l[1], b); })) return false;
      if (sc.lines.slice(2).some(function (l) { return segHitsBox(l[0], l[1], o.box); })) return false;   // its dimension line (its extension lines run where its points are, wherever it sits)
    }
    return !(geo && geoSegs && onGeometry(b));
  }
  function clearDimPlacement(f, made) {
    if (!f || !made || !made.length || App.mode !== 'sketch' || UI.activeSketchFeature() !== f || !UI.cam || !(UI.cam.scale > 0)) return 0;
    var pl = UI.activePlane(), s = UI.cam.scale, mm = UI.unitLabel && UI.unitLabel() === 'in' ? 1 / 25.4 : 1;
    var stepLen = Math.max(6 * mm, 34 * s), moved = 0;
    var keyOf = function (m) { return m.rel != null ? 'r' + m.rel : 'd' + m.dim; };
    var target = function (m) { return m.rel != null ? f.rels && f.rels[m.rel] : f.dims && f.dims[m.dim]; };
    var pending = {};
    made.forEach(function (m) { pending[keyOf(m)] = true; });
    geoSegs = screenGeometry(f, pl);
    try {
      made.forEach(function (m) {
        var key = keyOf(m), d = target(m);
        delete pending[key];
        if (!d || typeof d.off !== 'number' || !d.off) return;
        var all = defaultScreens(f, pl, {}), sc = all[key];
        if (!sc || !sc.lin) return;   // linear dimensions only (Ø / R turn by themselves: radialClear)
        var others = [];
        Object.keys(all).forEach(function (k) { if (k !== key && !pending[k]) others.push({ sc: all[k], box: defaultBox(all[k]) }); });
        if (placeClear(sc, others, true)) return;
        var off0 = d.off, sg = off0 < 0 ? -1 : 1, keep = null, found = null;
        for (var k = 1; k <= CLEAR_STEPS && found == null; k++) {
          d.off = Math.round((off0 + sg * k * stepLen) * 1e4) / 1e4;
          var c = defaultScreens(f, pl, onlyKey(f, key))[key];
          if (!c || !c.lin) continue;
          if (placeClear(c, others, true)) found = d.off;
          else if (keep == null && placeClear(c, others, false)) keep = d.off;
        }
        d.off = found != null ? found : keep != null ? keep : off0;
        if (d.off !== off0) moved++;
      });
    } finally { geoSegs = null; }
    if (moved) { App.dimsStale = true; if (UI.requestRender) UI.requestRender(); }
    return moved;
  }
  function onlyKey(f, key) {   // the keys map that lays out one dimension only
    var keys = {};
    (f.dims || []).forEach(function (d, i) { keys['d' + i] = false; });
    (f.rels || []).forEach(function (r, i) { keys['r' + i] = false; });
    keys[key] = true;
    return keys;
  }
  UI.clearDimPlacement = clearDimPlacement;
  // the dimensions and distance relations of f added since `before` = { dims: [...], rels: [...] } (the arrays as they
  // were), as clearDimPlacement's list
  UI.newDimsSince = function (f, before) {
    var out = [], oldD = new Set(before.dims), oldR = new Set(before.rels);
    (f.dims || []).forEach(function (d, i) { if (!oldD.has(d)) out.push({ dim: i }); });
    (f.rels || []).forEach(function (r, i) { if (!oldR.has(r) && r.v != null && r.off != null) out.push({ rel: i }); });
    return out;
  };
  UI.dimsSnapshot = function (f) { return { dims: (f && f.dims || []).slice(), rels: (f && f.rels || []).slice() }; };
  function drawDimsIn(f) {
    if (!f || App.mode !== 'sketch') { clearFeedback(); if (dimEditing) closeDimEdit(false); return []; }
    var pl = UI.activePlane(), placed = f.dims || [], list = [], stale = [];
    var an = App.sketchState;
    // rfIB: the mask of the arrowheads that touch the sketch's curves (filled in below with what they touch)
    var BIG = 40000, mask = svg('mask', { id: 'dim-geo-mask', maskUnits: 'userSpaceOnUse', x: -BIG / 2, y: -BIG / 2, width: BIG, height: BIG }, svg('defs', {}, dimLayer));
    svg('rect', { x: -BIG / 2, y: -BIG / 2, width: BIG, height: BIG, fill: '#fff' }, mask);
    var maskL = svg('path', { fill: 'none', stroke: '#000', 'stroke-width': 2 * GEO_ARROW_CLEAR, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, mask);
    var maskP = svg('path', { fill: '#000', stroke: 'none' }, mask);
    if (clipState) { clipState.mSegs = []; clipState.mPts = []; clipState.mKeys = new Set(); }
    var casing = svg('path', { 'class': 'dlh' }, dimLayer);   // rfHA: filled in below, drawn under every dimension
    dimCasing = '';
    placed.forEach(function (d, i) { list.push({ d: d, index: i, state: d.driven ? 'driven' : UI.danglingEntity && UI.danglingEntity(f, d.e) ? 'dangling' : an && an.dims ? an.dims[i] : null }); });   // lane sketchref: dangling
    if (App.view.showDims) f.entities.forEach(function (e, i) { autoDims(e, i, placed).forEach(function (d) { list.push({ d: d, auto: true }); }); });
    if (App.tempDim) list.push({ d: App.tempDim, temp: true });
    list.forEach(function (it) {
      var e = f.entities[it.d.e], sc = e && dimScreen(pl, e, it.d);
      if (!sc) { if (it.index != null) stale.push(it.index); return; }
      if (prevLabels && !it.temp && sc.along && sc.along.radial && it.d.ang == null) sc = radialClear(pl, e, it, sc);
      if (it.d.driven) sc.label = '(' + sc.label + ')';   // driven (reference) dimension
      drawOne(sc, it);
    });
    // the two-entity (distance / angle) dimensions and the relation highlights: ui-relations.js
    if (UI.drawRelations) UI.drawRelations(f, pl, dimLayer, { svg: svg, text: svgText, drawOne: drawOne, list: list, free: function (b) { return boxFree(b, null, true); }, freeKeep: function (b) { return boxFree(b, null, false); }, take: function (b) { labelBoxes.push(b); } });
    var cd = dimCasing || 'M0 0';
    if (casing.getAttribute('d') !== cd) casing.setAttribute('d', cd);
    dimCasing = null;
    var md = maskPaths();
    if (maskL.getAttribute('d') !== md.lines) maskL.setAttribute('d', md.lines);
    if (maskP.getAttribute('d') !== md.dots) maskP.setAttribute('d', md.dots);
    // placed dimensions whose entity vanished or changed type (delete, trim, mirror in place) are dropped
    if (stale.length) {
      f.dims = placed.filter(function (d, i) { return stale.indexOf(i) < 0; });
      if (App.sel && App.sel.kind === 'dim') App.sel = null;
    }
    if (fbLayer && fbLayer.parentNode === dimLayer && dimLayer.lastChild !== fbLayer) dimLayer.appendChild(fbLayer);   // cursor feedback stays on top
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
  // r14/sketchui14: laid out as SolidWorks' Modify box: a "Modify" title, the row of ✓ ✗ and Rebuild (the traffic
  // light) buttons, then the value with its unit and the spin arrows. Drawn icons (inline SVG), not text glyphs.
  function dmIcon(body) { return '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' + body + '</svg>'; }
  var DM_OK = dmIcon('<path d="M2.8 8.6 L6.4 12.1 L13.2 4.2" fill="none" stroke="#1f9a4b" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>');
  var DM_CANCEL = dmIcon('<path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="#d9302c" stroke-width="2.2" stroke-linecap="round"/>');
  var DM_REBUILD = dmIcon('<rect x="4.5" y="0.8" width="7" height="14.4" rx="2" fill="#3b4048"/><circle cx="8" cy="4" r="1.9" fill="#ef4136"/><circle cx="8" cy="8" r="1.9" fill="#ffc20e"/><circle cx="8" cy="12" r="1.9" fill="#3fb34f"/>');
  var dimHead = document.createElement('div'), dimRow = document.createElement('div'), dimUnit = document.createElement('span');
  dimHead.className = 'dm-head'; dimHead.textContent = 'Modify';
  dimRow.className = 'dm-row'; dimUnit.className = 'dm-unit';
  dmButton(dimSpin, 'dm-up', 'Increase (wheel up; Ctrl ×10, Alt ÷10)', dmIcon('<path d="M4 10.5 L8 5.5 L12 10.5 Z" fill="currentColor"/>'), function (ev) { spinDim(1, ev); });
  dmButton(dimSpin, 'dm-down', 'Decrease (wheel down; Ctrl ×10, Alt ÷10)', dmIcon('<path d="M4 5.5 L8 10.5 L12 5.5 Z" fill="currentColor"/>'), function (ev) { spinDim(-1, ev); });
  dmButton(dimBtns, 'dm-ok', 'OK (Enter): keep the value and close', DM_OK, function () { closeDimEdit(true, true); });
  dmButton(dimBtns, 'dm-cancel', 'Cancel (Esc): restore the value and close', DM_CANCEL, function () { closeDimEdit(false); });
  dmButton(dimBtns, 'dm-rebuild', 'Rebuild: regenerate the sketch with the typed value', DM_REBUILD, function () { var r = parseDimInput(dimInput.value); if (r.error != null) dimEditError(r.error); else previewDim(r.value); });
  // sketchdims: Reverse the sense of the dimension (ui-sketch-dims.js UI.reverseDimSense), on the sketch as it was before any preview
  dmButton(dimBtns, 'dm-reverse', 'Reverse the sense of the dimension', dmIcon('<path d="M3 5.5 H12.5 M10 3 L12.8 5.5 L10 8 M13 10.5 H3.5 M6 8 L3.2 10.5 L6 13" fill="none" stroke="#2f7fd6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'), function () {
    var ed = dimEditing;
    if (!ed || !UI.reverseDimSense || ed.auto) return;
    restoreDimPreview();
    var r = UI.reverseDimSense(ed.rel != null ? { kind: 'rel', index: ed.rel } : { kind: 'dim', index: ed.index });
    if (!r.ok) dimEditError(r.error);
    dimInput.focus();
  });
  dimEdit.insertBefore(dimHead, dimInput);
  dimEdit.insertBefore(dimBtns, dimInput);
  dimEdit.insertBefore(dimRow, dimInput);
  dimRow.appendChild(dimInput);
  dimRow.appendChild(dimUnit);
  dimRow.appendChild(dimSpin);
  function openDimEdit(it) {
    var f = UI.activeSketchFeature();
    if (!f) return;
    if (dimEditing) closeDimEdit(true);
    // sketchdims: scale = shown / stored (a circle's diameter shown as its radius: 0.5, UI.dimShowScale)
    var scale = it.rel == null && UI.dimShowScale ? UI.dimShowScale(it.d) : 1;
    var value = (it.rel != null ? f.rels[it.rel].v : K.dimValue(f.entities[it.d.e], it.d)) * scale;
    // rfAV: an angle (Smart Dimension between two lines) or an Angular Running value is in degrees: its own unit, a 1°
    // spin step and its own range (angle: above 0 up to 180; running angle: 0 up to 360, the spin wraps round)
    var rtype = it.rel != null ? f.rels[it.rel].type : null;
    dimEditing = { d: it.d, auto: !!it.auto, index: it.index, rel: it.rel, sketchId: f.id, value: value, angle: rtype === 'angle' || rtype === 'runangle', range: dimAngleRange(rtype), scale: scale };
    dimEdit.hidden = false;
    dimUnit.textContent = dimEditing.angle ? '°' : (UI.unitLabel ? UI.unitLabel() : 'mm');
    // rfIF: rounded to 4 places, or to the dimension's own / the document's precision when that is finer (up to 8)
    var mPl = Math.max(4, UI.dimPlaces ? UI.dimPlaces(it.rel != null ? f.rels[it.rel] : it.d, dimEditing.angle) : 4);
    dimInput.value = String(Math.round(dimEditing.value * Math.pow(10, mPl)) / Math.pow(10, mPl));
    // sketchflow2: a dimension linked to a global variable shows its equation
    var lnk = it.rel != null ? f.rels[it.rel] : !it.auto && f.dims ? f.dims[it.index] : null;
    if (lnk && lnk.expr) dimInput.value = lnk.expr;
    // rfE: the text as shown (rounded to 4 places); ✓ / Enter / a click elsewhere with it untouched is no change (a √13
    // line keeps 3.6055513, not the 3.6056 shown), as the SolidWorks Modify box only shows the value rounded
    dimEditing.text = dimInput.value;
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
  // rfAV: the range of an angle-valued dimension (null for a length): lo is excluded when loOpen, hi when hiOpen; wrap:
  // the spin goes round (359° + 1° = 0°)
  function dimAngleRange(type) {
    if (type === 'angle') return { lo: 0, hi: 180, loOpen: true, msg: 'Angle must be between 0 and 180 degrees.' };
    if (type === 'runangle') return { lo: 0, hi: 360, hiOpen: true, wrap: true, msg: 'An angular running value must be from 0 up to 360 degrees.' };
    return null;
  }
  function inAngleRange(rg, v) { return !rg || ((rg.loOpen ? v > rg.lo : v >= rg.lo) && (rg.hiOpen ? v < rg.hi : v <= rg.hi)); }
  UI.dimEditUnit = function () { return dimEditing ? dimUnit.textContent : null; };   // test hook
  // The spin step: 1 mm (0.1 in, 1°), ×10 with Ctrl, ÷10 with Alt.
  function spinStep(ev) {
    var base = dimEditing && dimEditing.angle ? 1 : /in/.test(UI.unitLabel ? UI.unitLabel() : '') ? 0.1 : 1;
    return base * (ev && ev.ctrlKey ? 10 : ev && ev.altKey ? 0.1 : 1);
  }
  function spinDim(sgn, ev) {
    if (!dimEditing) return;
    var r = parseDimInput(dimInput.value), cur = r.error != null ? (dimEditing.preview != null ? dimEditing.preview : dimEditing.value) : r.value;
    var step = spinStep(ev), v = +(cur + sgn * step).toPrecision(12), rg = dimEditing.range;
    if (rg && rg.wrap) v = +(((v - rg.lo) % (rg.hi - rg.lo) + (rg.hi - rg.lo)) % (rg.hi - rg.lo) + rg.lo).toPrecision(12);
    else if (!(v > 0)) v = +(cur / 2).toPrecision(6);
    if (rg && !rg.wrap && v > rg.hi) v = rg.hi;
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
    var res = ed.rel != null ? SketchSolver.setRelValue(f, ed.rel, ed.preview) : SketchSolver.setDim(f, ed.auto ? ed.d : ed.index, ed.preview / (ed.scale || 1));
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
  // Value typed in the Modify box or the on-screen numeric input: a number, shop input (3/8, 1-1/2, 25mm, 2*3/8;
  // UI.parseLength) or an equation ("=T*3"). kind: 'length' | 'angle' (default: the open Modify box's). The sketch
  // stores the resulting number, never the expression.
  function parseDimInput(text, kind) {
    if (!kind) kind = dimEditing && dimEditing.angle ? 'angle' : 'length';
    if (UI.parseLength) return UI.parseLength(text, { kind: kind });
    if (UI.evalInput) return UI.evalInput(text);
    var v = parseFloat(text);
    return isNaN(v) ? { error: 'Not a number: ' + text } : { value: v };
  }
  // commit: apply the typed value. keepOnError: an invalid entry leaves the box open with the message (Enter);
  // otherwise (blur) the box closes without applying and the message stays in the status bar.
  // sketchflow2: the equation text to keep on a dimension for what was typed in the Modify box: "=…" naming at least
  // one global variable (Tools ▸ Equations), else null (a plain number or an expression of numbers only)
  UI.dimExprOf = function (text) {
    var s = String(text || '').trim();
    if (!/^=/.test(s)) return null;
    var vars = UI.equationVars ? UI.equationVars() : {}, ids = s.slice(1).match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    return ids.some(function (id) { return Object.prototype.hasOwnProperty.call(vars, id); }) ? s : null;
  };
  function closeDimEdit(commit, keepOnError) {
    var ed = dimEditing;
    if (!ed) return;
    var r = null;
    if (commit) {
      r = parseDimInput(dimInput.value);
      if (r.error == null && ed.range && !inAngleRange(ed.range, r.value)) r = { error: ed.range.msg };
      if (r.error != null && keepOnError) { dimEditError(r.error); dimInput.focus(); dimInput.select(); return; }
    }
    // a live preview is undone first: the undo step and the solve start from the sketch as it was
    if (previewFrame) { cancelAnimationFrame(previewFrame); previewFrame = 0; }
    var previewed = restoreDimPreview(true);
    dimEditing = null;
    dimEdit.hidden = true;
    // rfA: the hidden box gives the keyboard back (it kept the focus: Esc no longer put Smart Dimension down, and the
    // tool shortcuts went nowhere until the next click)
    if (document.activeElement === dimInput) dimInput.blur();
    if (r && r.error != null) UI.setStatus('Dimension not changed: ' + r.error);
    dimEditError('');
    var f = UI.activeSketchFeature(), e = f && f.id === ed.sketchId && (ed.rel != null ? f.rels && f.rels[ed.rel] : f.entities[ed.d.e]);
    var v = r && r.value;
    var untouched = ed.text != null && String(dimInput.value).trim() === ed.text;   // rfE: the shown text kept: no change, no undo step
    // sketchflow2: a value typed as an equation that names a global variable ("=W", "=W/2 + T") stays linked to it
    // (SolidWorks' ="W"): the item keeps `expr` and follows the variable at every rebuild (UI.syncSketchDimExprs,
    // ui-sketch-dims.js); a plain number typed later lets it go
    var holder = commit && r && r.error == null && e && !ed.auto ? (ed.rel != null ? f.rels[ed.rel] : f.dims && f.dims[ed.index]) : null;
    var newExpr = holder ? UI.dimExprOf(dimInput.value) : null;
    if (holder && !untouched && Math.abs(v - ed.value) < 1e-9 && (holder.expr || null) !== newExpr) {
      if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
      if (newExpr) holder.expr = newExpr; else delete holder.expr;
      if (previewed) App.gridStale = true;
      UI.updateSketches();
      UI.setStatus(newExpr ? 'Dimension linked to ' + newExpr + '.' : 'Dimension no longer linked to an equation.');
      return;
    }
    if (!commit || !r || r.error != null || !e || untouched || Math.abs(v - ed.value) < 1e-9) {
      if (previewed) { App.gridStale = true; UI.updateSketches(); }
      return;
    }
    if (previewed) App.gridStale = true;
    try {
      if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
      if (window.SketchSolver) {
        // a driving dimension: the whole sketch is re-solved with the new value (relations and other dimensions hold)
        var res = ed.rel != null ? SketchSolver.setRelValue(f, ed.rel, v) : SketchSolver.setDim(f, ed.auto ? ed.d : ed.index, v / (ed.scale || 1));
        if (!res.ok) throw new Error(res.error);
      } else K.setDimValue(e, ed.d, v);
      if (holder) { if (newExpr) holder.expr = newExpr; else delete holder.expr; }
      App.gridStale = true;
      UI.updateSketches(); UI.refreshTree();
      UI.setStatus('Dimension set to ' + (ed.angle ? (Math.round(v * 1e4) / 1e4) + '°' : fmtDim(v) + ' ' + UI.unitLabel()) + (newExpr ? ' (' + newExpr + ')' : '') + '.');
      if (UI.refreshDimensionPM) UI.refreshDimensionPM();   // rfE: an open Dimension PM shows the new value
    } catch (err) { lastDimError = err.message; UI.toast(err.message); UI.setStatus('Dimension not changed: ' + err.message); App.dimsStale = true; if (previewed) UI.updateSketches(); }
  }
  dimInput.addEventListener('keydown', function (ev) {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); closeDimEdit(true, true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); UI.escapeCommand(); }   // lane CG: closes unapplied (escapeBoxes below) and ends Smart Dimension
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
    UI.updateSketches();   // r5/sketch5: the sketch's state and colours follow at once
    UI.setStatus('Dimension deleted.');
  }

  // ---- the Smart Dimension tool: click an entity, then click where the dimension should sit
  function dimToolClick(raw, mx, my) {
    var f = UI.activeSketchFeature(), st = App.toolState;
    if (!f) return;
    if (st.relDim) {
      // sketchdims: an arc length waits for the arc's other end point first (UI.dimPickNeed)
      if (st.relDim.need && UI.dimPickNeed && UI.dimPickNeed(f, st.relDim, mx, my)) return;
      // third click of a two-entity dimension: place it, then type its value
      var rd = st.relDim;
      st.relDim = null; st.dim = null; App.tempRelDim = null;
      $('sketch-hint').innerHTML = TOOL_HINTS.dimension;
      if (UI.placeRelDim) UI.placeRelDim(f, rd, raw);
      return;
    }
    if (st.dim) {
      // a second entity or point clicked: distance / angle between the two, as SolidWorks' Smart Dimension does
      var ref2 = dimPickRef(mx, my) || modelRef(mx, my, st);
      if (ref2 && /\.mid$/.test(ref2) && (ref2 === st.dim.e + '.mid' || ref2 === st.ref1 + '.mid')) ref2 = null;   // rfIG: placing a line's dimension at its own middle (rfII: a polygon side's)
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
      UI.updateSketches();   // r5/sketch5: colours and Under / Fully / Over Defined follow at once, not on the next edit
      App.sel = { kind: 'dim', index: f.dims.length - 1 };
      // over-defining: ask whether to make it driven (ui-relations.js) instead of opening the Modify box
      if (UI.askDrivenIfOver && UI.askDrivenIfOver(f, 'dim', f.dims.length - 1)) { UI.updateSketches(); return; }
      App.dimsStale = false;
      var list = drawDims();
      var it = null;
      list.forEach(function (x) { if (x.d === d) it = x; });
      if (it) openDimEdit(it);
      if (UI.openDimensionPM) UI.openDimensionPM(App.sel);   // sketchdims: the Dimension PropertyManager beside the Modify box
      UI.setStatus('Dimension placed. Type a value and press Enter to drive the entity; Delete removes it.');
      return;
    }
    if (st.pt1) {
      // p9-sketch: a point clicked first (a circle's or a slot's centre, a sketch point): the second click names the
      // other point or entity of a distance dimension, as SolidWorks' Smart Dimension does
      var refB = dimPickRef(mx, my) || modelRef(mx, my, st), twoB = refB && UI.relDimFor ? UI.relDimFor(f, st.pt1, refB) : null;
      st.pt1 = null;
      if (!twoB) { $('sketch-hint').innerHTML = TOOL_HINTS.dimension; UI.setStatus('No distance between those two: click a point, then another point or a line.'); return; }
      st.relDim = twoB;
      App.tempRelDim = Object.assign({}, twoB, UI.relDimPlacement(f, twoB, raw));
      App.dimsStale = true;
      $('sketch-hint').innerHTML = 'Click where the ' + (twoB.type === 'angle' ? 'angle' : 'distance') + ' dimension should sit.';
      return;
    }
    var hit = UI.pickEntity(mx, my), t = hit ? K.dimForEntity(f.entities[hit.index], raw) : null;
    var cv = UI.dimCurvaturePick ? UI.dimCurvaturePick(f, mx, my) : null;   // lane DM: a spline's curvature control (ui-sketch-spline.js)
    if (cv) { hit = { index: cv.e }; t = { k: 'curv', i: cv.i }; }
    // p9-sketchfix: a sketch point (the virtual sharp on the origin after a fillet, a Point) has no dimension of its own:
    // it starts a distance too (it said "no dimension to place", and the circle clicked next got a second diameter)
    // rfIG: at a line's midpoint (or Select Midpoint): the midpoint starts a distance, as a point does
    var mid0 = cv ? null : dimPickRef(mx, my);
    if (mid0 && /\.mid$/.test(mid0)) {
      st.pt1 = mid0;
      $('sketch-hint').innerHTML = 'Click a second point or a line for the distance from this midpoint.';
      UI.setStatus('Midpoint of ' + (window.SketchSolver.refName ? SketchSolver.refName(f, mid0.replace(/\.mid$/, '')) : 'the line') + ' picked.');
      return;
    }
    if (!hit || !t) {
      // p9-sketch: a point that lies on no curve (a circle's or a slot's centre, a sketch point) starts a distance
      var pr = dimPickRef(mx, my), sp = pr && window.SketchSolver ? SketchSolver.parseRef(pr) : null;
      var hdl = !!(sp && sp.s === 'h');   // lane DE: a spline handle starts an angle to a line
      if (pr && (pr === 'O' || hdl || (sp && window.SketchSolver.refKind(f, pr) === 'point'))) {
        st.pt1 = pr;
        $('sketch-hint').innerHTML = hdl ? 'Click a line for the angle to this spline handle.' : 'Click a second point or a line for the distance from this point.';
        return;
      }
      // p9-sketchfix: a model edge or vertex (sketch on a face) first: the distance from it
      var mr = modelRef(mx, my, st);
      if (mr) { st.pt1 = mr; $('sketch-hint').innerHTML = 'Click a sketch point, line or circle for the distance from this model ' + (window.SketchSolver.refKind(f, mr) === 'point' ? 'vertex.' : 'edge.'); }
      else if (hit) UI.toast('That entity has no dimension to place.');
      return;
    }
    t.e = hit.index;
    st.dim = t;
    st.ref1 = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null;
    var pv = dimPlacement(f.entities[hit.index], t, raw);
    App.tempDim = Object.assign({}, t, pv);
    App.dimsStale = true;
    $('sketch-hint').innerHTML = 'Click where the dimension should sit, or click a second entity for the distance / angle between them.' + (f.entities[hit.index].t === 'line' ? ' Move above/below or beside a slanted line for its horizontal or vertical distance.' : '');
  }
  // p9-sketchfix: a model edge / vertex under the cursor as a sketch ref (ui-relations.js pickModelRef brings it in as
  // fixed construction geometry); remembered on the tool state so a dimension never placed takes it out again
  function modelRef(mx, my, st) {
    var m = UI.pickModelRef ? UI.pickModelRef(mx, my) : null;
    if (!m) return null;
    (st.modelRefs = st.modelRefs || []).push(m.entity);
    // rfIG: clicked at the middle of a straight model edge: the midpoint of the line it came in as
    if (m.entity && m.entity.t === 'line' && App.tool === 'dimension') {
      var pl = UI.activePlane(), e = m.entity, s = UI.worldToScreen(K.to3D(pl, (e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2));
      if (Math.hypot(s[0] - mx, s[1] - my) < MID_PX && midReady('M' + Math.round(s[0]) + ',' + Math.round(s[1]))) return m.ref + '.mid';
    }
    return m.ref;
  }
  // rfIG (user 2026-11-05: "make the smart dimension able to select center points of any line"): as in SolidWorks, the
  // Smart Dimension tool takes a line's midpoint as a dimension end. Within MID_PX of the middle of a line (any sketch
  // line: a rectangle's / polygon's side, construction lines, centerlines) the midpoint is highlighted and a click picks
  // it ('3.mid', a point: distances to points, lines, the origin, other midpoints, driven by the solver); elsewhere on
  // the line the click still picks the line. Ends, centres and the origin (pickSketchRef's 7 px) come first. The marker
  // shows once the cursor has rested by the midpoint MID_DWELL ms (SolidWorks' hover): a quick click on the middle of a
  // line still picks the line, the commonest Smart Dimension pick (its length; the smoke groups click lines there).
  // Right-click
  // on a line ▸ Select Midpoint picks it too (dimMidMenu). pickSketchRef (ui-relations.js) leaves '.mid' out for every
  // other tool (Add Relations picks the line itself, Angular Running Dimension wants the corners: its lineEnds skip
  // '.mid' because a line's own pointRefs include it).
  var MID_PX = 6, MID_DWELL = 150, forcedDimRef = null, midKey = null, midHover = { key: null, since: 0, timer: 0 };
  // the cursor is by midpoint `key` (null: by none): true once it has stayed there MID_DWELL ms; arriving at a new one
  // starts its clock and a timer that draws the marker when it is up (the cursor may not move again)
  function midReady(key) {
    var now = performance.now();
    if (key !== midHover.key) {
      if (midHover.timer) clearTimeout(midHover.timer);
      midHover = { key: key, since: now, timer: 0 };
      if (key && MID_DWELL > 0) midHover.timer = setTimeout(function () { midHover.timer = 0; if (midHover.key === key && App.tool === 'dimension' && lastMove) redrawDimHover(lastMove[0], lastMove[1]); }, MID_DWELL + 15);
    }
    return !!key && now - midHover.since >= MID_DWELL;
  }
  function redrawDimHover(mx, my) {
    hoverFeedback(UI.activePlane(), dimPickRef(mx, my), mx, my);
  }
  function dimMidpointAt(mx, my) {
    var f = UI.activeSketchFeature(), S = window.SketchSolver;
    if (!f || !S) return null;
    var pl = UI.activePlane(), best = null, bd = MID_PX;
    midKey = null;
    f.entities.forEach(function (e, i) {
      if (!e || (UI.entityLayerHidden && UI.entityLayerHidden(f, e))) return;
      sideMids(f, i).forEach(function (pr) {
        var s = UI.worldToScreen(K.to3D(pl, pr.pt[0], pr.pt[1])), d = Math.hypot(s[0] - mx, s[1] - my);
        if (d < bd) { bd = d; best = pr.ref; midKey = f.id + ':' + pr.ref + '@' + Math.round(s[0]) + ',' + Math.round(s[1]); }
      });
    });
    return best;
  }
  // the midpoint refs of entity i's straight sides with their points: a line's '3.mid' (an infinite line or a ray has
  // none), rfII: a rectangle's / polygon's / polyline's / straight slot's '3.e0.mid' … (SketchSolver.sideMid)
  function sideMids(f, i) {
    var S = window.SketchSolver, e = f.entities[i], out = [];
    if (!e || !S) return out;
    if (e.t === 'line') return S.pointRefs(f, i).filter(function (pr) { return /\.mid$/.test(pr.ref); });
    if (!/^(rect|crect|poly|polyline|slot)$/.test(e.t)) return out;
    for (var k = 0; ; k++) {
      var r = i + '.e' + k + '.mid', q = S.refPoint(f, r);
      if (!q) break;
      out.push({ ref: r, pt: q });
    }
    return out;
  }
  // the ref Smart Dimension picks at (mx, my): pickSketchRef's, or a line's midpoint when the cursor is at one
  function dimPickRef(mx, my) {
    if (forcedDimRef) return forcedDimRef;
    var ref = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null;
    if (App.tool !== 'dimension') return ref;
    var f = UI.activeSketchFeature(), S = window.SketchSolver, p = ref && S ? S.parseRef(ref) : null;
    if (ref === 'O' || (p && p.s === 'h') || (ref && f && S.refKind(f, ref) === 'point')) { midReady(null); return ref; }
    var mid = dimMidpointAt(mx, my);
    var key = mid ? midKey : null;   // (the sketch, the ref and where it is: a new sketch's '0.mid' starts afresh)
    if (mid || ref) midReady(key);   // (nothing of the sketch here: modelMidAt tracks a model edge's midpoint)
    return mid && midReady(key) ? mid : ref;
  }
  // the middle of a straight model edge under the cursor (sketch on a face), for the hover marker: { s: screen point }
  function modelMidAt(mx, my) {
    if (!App.edges || !App.edges.length || !UI.pickEdge || !UI.activeSketchFeature()) return null;
    if (UI.pickVertex && UI.pickVertex(mx, my)) return null;
    var ed = UI.pickEdge(mx, my), E = ed && ed.edge;
    if (!E || !E.a || !E.b) return null;
    var cv = E.curve != null && App.curves ? App.curves[E.curve] : null;
    if (cv && cv.curve && cv.curve.radius > 0) return null;   // a circle / arc edge: no midpoint
    var s = UI.worldToScreen([(E.a[0] + E.b[0]) / 2, (E.a[1] + E.b[1]) / 2, (E.a[2] + E.b[2]) / 2]);
    var key = Math.hypot(s[0] - mx, s[1] - my) < MID_PX ? 'M' + Math.round(s[0]) + ',' + Math.round(s[1]) : null;
    return midReady(key) ? { s: s } : null;
  }
  // right-click on a line while Smart Dimension runs: Select Midpoint (SolidWorks), Select, Exit Sketch
  function dimMidLine(mx, my) {
    var f = UI.activeSketchFeature(), S = window.SketchSolver;
    if (!f || !S || App.tool !== 'dimension') return null;
    var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
    if (e && e.t !== 'line') {   // rfII: a rectangle / polygon / polyline / slot side: its '3.e0.mid'
      var er = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null, eq = er && /^\d+\.e\d+$/.test(er) ? S.refPoint(f, er + '.mid') : null;
      if (!eq && e.t === 'slot') { var sm = sideMids(f, hit.index), pl = UI.activePlane(), sb = null, sd = Infinity; sm.forEach(function (m) { var q = UI.worldToScreen(K.to3D(pl, m.pt[0], m.pt[1])), d = Math.hypot(q[0] - mx, q[1] - my); if (d < sd) { sd = d; sb = m; } }); return sb; }
      return eq ? { ref: er + '.mid', pt: eq } : null;
    }
    if (!e || e.t !== 'line') return null;
    var mid = null;
    S.pointRefs(f, hit.index).forEach(function (pr) { if (/\.mid$/.test(pr.ref)) mid = pr; });
    return mid;
  }
  function dimMidMenu(mx, my, ev) {
    var mid = dimMidLine(mx, my);
    // rfIT: on a member of a Make Path path, Smart Dimension offers the path's length (the path dimensioned as one)
    var ph = UI.pickEntity(mx, my), pm = ph && UI.sketchPathMembers ? UI.sketchPathMembers(ph.index) : null;
    if (!mid && !pm) return false;
    var items = [];
    if (mid) items.push({ label: 'Select Midpoint', icon: 'dim', action: function () { if (App.mode === 'sketch' && App.tool === 'dimension') pickDimMidpoint(mid.ref); } });
    if (pm) items.push({ label: 'Path Length Dimension', icon: 'pathLengthDim', action: function () { if (App.mode === 'sketch' && UI.pathLengthDimForPath) UI.pathLengthDimForPath(ph.index); } });
    items.push(
      { sep: true },
      { label: 'Select', action: function () { if (App.mode === 'sketch') cancelTool(); } },
      { label: 'Exit Sketch', icon: 'exitSketch', action: function () { if (App.mode === 'sketch') exitSketch(); } }
    );
    UI.showMenu(ev.clientX, ev.clientY, items);
    return true;
  }
  // the click Smart Dimension would get at midpoint ref (the menu's Select Midpoint)
  function pickDimMidpoint(ref) {
    var f = UI.activeSketchFeature(), p = f && window.SketchSolver ? SketchSolver.refPoint(f, ref) : null;
    if (!p) return false;
    var s = UI.worldToScreen(K.to3D(UI.activePlane(), p[0], p[1]));
    forcedDimRef = ref;
    try { dimToolClick(p.slice(), s[0], s[1]); } finally { forcedDimRef = null; }
    App.dimsStale = true;
    return true;
  }
  UI.dimMidpointAt = dimMidpointAt;
  UI.dimMidDwell = function (ms) { if (ms != null) MID_DWELL = +ms; return MID_DWELL; };
  UI.dimPickRef = dimPickRef;
  UI.dimMidMenu = function (mx, my) { var r = viewport.getBoundingClientRect(); return dimMidMenu(mx, my, { clientX: r.left + mx, clientY: r.top + my }); };
  UI.pickDimMidpoint = pickDimMidpoint;
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
  // rfE (finding 9): Smart Dimension started with a preselection. dimPreselection() reads one or two selected sketch
  // entities (nothing else selected) as [index]; startDimFrom(list) puts the tool where the clicks on them would
  // have: one entity -> its own dimension on the cursor, two -> the distance / angle between them on the cursor. The
  // selection is used up, as a click would.
  function dimPreselection() {
    var f = UI.activeSketchFeature();
    if (!f) return null;
    var list = UI.selection ? UI.selection() : [App.sel, App.sel2].filter(Boolean), idx = [];
    if (!list.length || list.length > 2) return null;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || s.kind !== 'entity' || !f.entities[s.index]) return null;
      if (idx.indexOf(s.index) < 0) idx.push(s.index);
    }
    return idx;
  }
  function entityRef(f, i) {
    var S = window.SketchSolver, cs = S && S.curveRefs ? S.curveRefs(f, i) : [];
    return cs.length === 1 ? cs[0] : !cs.length ? String(i) : null;
  }
  function entityAnchor(e) {
    if (lastMove) { var q = UI.screenToPlane(lastMove[0], lastMove[1], UI.activePlane()); if (q) return q; }
    var pls = (UI.screenPolylines || K.entityPolylines)(e), pts = pls && pls[0] ? pls[0].pts : null;
    return pts && pts.length ? pts[Math.floor(pts.length / 2)].slice() : [+e.cx || +e.x || 0, +e.cy || +e.y || 0];
  }
  function startDimFrom(idx) {
    var f = UI.activeSketchFeature(), st = App.toolState;
    if (!f || App.tool !== 'dimension' || !st) return false;
    var e0 = f.entities[idx[0]], at = entityAnchor(e0);
    function useSel() { if (UI.setSelection) UI.setSelection([]); else { App.sel = null; App.sel2 = null; } }
    if (idx.length === 2) {
      var r1 = entityRef(f, idx[0]), r2 = entityRef(f, idx[1]), two = r1 && r2 && UI.relDimFor ? UI.relDimFor(f, r1, r2) : null;
      if (two) {
        useSel();
        st.relDim = two;
        App.tempRelDim = Object.assign({}, two, UI.relDimPlacement(f, two, at));
        App.dimsStale = true;
        $('sketch-hint').innerHTML = 'Click where the ' + (two.type === 'angle' ? 'angle' : 'distance') + ' dimension should sit.';
        UI.updateSketches();
        return true;
      }
    }
    // one entity with no dimension of its own (a sketch point, a text): the tool starts empty, as before
    var t = idx.length === 1 ? K.dimForEntity(e0, null) : null;
    if (!t) return false;
    useSel();
    t.e = idx[0];
    st.dim = t;
    st.ref1 = entityRef(f, idx[0]);
    App.tempDim = Object.assign({}, t, dimPlacement(e0, t, at));
    App.dimsStale = true;
    $('sketch-hint').innerHTML = 'Click where the dimension should sit, or click a second entity for the distance / angle between them.' + (e0.t === 'line' ? ' Move above/below or beside a slanted line for its horizontal or vertical distance.' : '');
    UI.updateSketches();
    return true;
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
  // sketch-text-ref: a Sketch Text that stands on its own is a point to the solver (its insertion point): pressed on its
  // letters with the Select tool it is dragged as a point is (ui-relations.js: the solver holds its relations, the
  // insertion point snaps onto sketch points and curves and gets the Coincident); text along a curve is placed by the
  // curve and keeps the Sketch Text drag (ui-sketch-text.js)
  function freeTextDrag(p) {
    if (App.mode !== 'sketch' || App.tool !== 'select' || App.command || !UI.sketchPointDragHook) return null;
    var f = UI.activeSketchFeature(), hit = f ? UI.pickEntity(p[0], p[1]) : null, e = hit && f.entities[hit.index];
    return e && e.t === 'text' && !e.path ? UI.sketchPointDragHook(p, null, String(hit.index)) : null;
  }
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
    // (user 2026-11-04: "i click empty space and this prompt doesnt disappear") the Select tool's help line goes away at the
    // first press in the graphics area; a drawing tool or a command's message brings its own line back (setTool, pmHint)
    if (App.mode === 'sketch' && App.tool === 'select' && !(UI.hasPM && UI.hasPM())) $('sketch-hint').classList.add('dismissed');
    var p = pos(ev);
    downPos = p;
    // r4/asm4: Alt + drag on a floating component is SmartMates (ui-assembly.js); elsewhere Alt + drag rotates the view
    var smart = ev.button === 0 && ev.altKey && !App.zoomAreaMode && UI.smartMateHook ? UI.smartMateHook(p, ev) : null;
    if (smart) { drag = { kind: 'maybe-hook', hook: smart, last: p, moved: false }; ev.preventDefault(); return; }
    if (App.zoomAreaMode && ev.button === 0) { zoomBox = { start: p }; $('zoom-box').hidden = false; return; }
    // lane profnav: which button + modifiers rotate, pan or zoom comes from the navigation map (ui-core.js navActionFor;
    // SolidWorks by default: middle drag rotates, Ctrl + middle pans, Shift + middle zooms about the press point, Alt +
    // left rotates). A middle press the map leaves unbound does nothing; an unbound Alt + left press selects as usual.
    var nav = UI.navActionFor ? UI.navActionFor(ev) : (ev.ctrlKey ? 'pan' : ev.shiftKey ? 'zoom' : 'rotate');
    if (ev.button === 1 || (ev.button === 0 && ev.altKey && nav)) {
      if (nav) drag = { kind: nav, last: p, button: ev.button };
      ev.preventDefault();
      return;
    }
    // r5/asm5: in an assembly a right-mouse drag on a floating component rotates it (SolidWorks); elsewhere it pans
    // (lane profnav: the right drag does what the map's 'right' says; a right click with no drag still opens the menus)
    var rot = ev.button === 2 && App.mode !== 'sketch' && !App.zoomAreaMode && UI.componentDragHook ? UI.componentDragHook(p, ev, 'rotate') : null;
    if (rot) { drag = { kind: 'maybe-hook', hook: rot, last: p, moved: false }; ev.preventDefault(); return; }
    if (ev.button === 2) { drag = { kind: nav || 'none', last: p, moved: false, button: 2 }; return; }
    // assemblies: pressing on a floating component drags it (Move / Rotate Component) instead of rotating the view
    // (r13/trim13: a sketch command may take the drag itself, as Power trim does)
    var hook = ev.button !== 0 ? null : (App.mode === 'sketch' && App.command && App.command.onSketchDrag && !App.zoomAreaMode ? App.command.onSketchDrag(p, ev) : null) ||
      ghostWrap(freeTextDrag(p) || (App.mode === 'sketch' && UI.sketchDragHook ? UI.sketchDragHook(p, ev) : null)) || sketchDrawHook(p) || (UI.componentDragHook ? UI.componentDragHook(p, ev) : null);
    // a press on empty space starts a box selection (ui-select.js); on the model it still rotates the view
    if (!hook && ev.button === 0 && UI.boxSelectHook) hook = UI.boxSelectHook(p, ev);
    if (hook) { drag = { kind: 'maybe-hook', hook: hook, last: p, moved: false }; ev.preventDefault(); return; }
    if (ev.button === 0) drag = { kind: 'maybe-rotate', nav: nav || 'none', last: p, moved: false };   // lane profnav: the map's 'left'
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
        if (Math.hypot(p[0] - downPos[0], p[1] - downPos[1]) > 4) { drag.kind = drag.nav || 'rotate'; drag.moved = true; viewport.classList.add('tool-grab'); }
        else return;
      }
      if (drag.kind === 'maybe-hook') {
        if (Math.hypot(p[0] - downPos[0], p[1] - downPos[1]) > 4) { drag.kind = 'hook'; drag.moved = true; viewport.classList.add('tool-grab'); drag.hook.start(); }
        else return;
      }
      if (drag.kind === 'hook') { drag.hook.move(p); drag.last = p; return; }
      if (drag.kind === 'rotate') UI.rotateView(dx, dy);
      else if (drag.kind === 'zoom') UI.zoomView(Math.exp(dy * 0.006), downPos[0], downPos[1]);   // drag up zooms in
      else if (drag.kind === 'pan') UI.panView(dx, dy);
      drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 0;
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
    } else if (hover && hover.kind === 'edge') $('status-coords').textContent = 'Edge  length ' + fmtLen(hover.edge.len) + (hover.edge.convex ? '' : '  (concave)');
    else if (hover && hover.kind === 'plane') $('status-coords').textContent = hover.name;
    else if (hover && hover.kind === 'vertex') $('status-coords').textContent = 'Vertex  ' + hover.point.map(fmtDim).join(', ') + ' ' + UI.unitLabel();
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
    // a navigation drag is not a click; a right press that did not move is (its menus), whatever the map binds to it
    if (d.button === 2 ? d.moved : (d.kind === 'rotate' || d.kind === 'zoom' || d.kind === 'none' || (d.kind === 'pan' && d.moved))) return;
    if (ev.button === 2) { if (App.mode === 'sketch') { if (App.tool === 'select' && !(App.command && App.command.onSketchPoint) && !(ev.target.closest && ev.target.closest('#dim-layer, #dim-edit, #sk-num, #hud, #exit-sketch'))) sketchMenu(p[0], p[1], ev); else if (chainMenuWanted(ev)) chainMenu(ev); else if (App.tool === 'dimension' && !(ev.target.closest && ev.target.closest('#dim-layer, #dim-edit, #sk-num, #hud, #exit-sketch')) && dimMidMenu(p[0], p[1], ev)) { /* rfIG: Select Midpoint */ } else finishChain(); } return; }
    if (ev.button !== 0) return;
    if (p[0] < 0 || p[1] < 0 || p[0] > UI.size.w || p[1] > UI.size.h) return;
    if (ev.target.closest && ev.target.closest('#hud, #exit-sketch, #sketch-hint, #dim-layer, #dim-edit, #sk-num')) return;
    if (App.mode === 'sketch') { sketchClick(p[0], p[1], ev); return; }
    partClick(p[0], p[1], ev);
  });

  viewport.addEventListener('dblclick', function (ev) {
    if (App.mode === 'sketch') {
      // rfCF (user, 2026-10-14: "double clicking when sketching lines should delete the current line being pulled"): a
      // double-click ends the Line chain (Centerline, Midpoint Line, a tangent arc pulled from it too) and discards
      // the segment being pulled. The double-click is made of two clicks the tool already took (sketchClick's log):
      // the first placed a segment to the double-click point, the second a stub or nothing (r15/dblclick15 took back
      // the stub alone). Both are taken back, each with its relations, dimensions and undo snapshot, so the segments
      // placed before stay as they were, with theirs, and the tool stays for the next chain. A deliberate click at
      // that spot, then a double-click on it, keeps its segment: the double-click's own two clicks made nothing.
      var stD = App.toolState, fD = UI.activeSketchFeature(), pD = pos(ev), logD = (stD && stD.clicks) || [];
      if (App.tool === 'line' && fD && stD.pts && stD.pts.length && logD.length >= 2) {
        var two = logD.slice(-2), took = 0;
        if (two.every(function (c) { return Math.hypot(c.sx - pD[0], c.sy - pD[1]) <= 6; })) {
          for (var cD = 1; cD >= 0; cD--) {
            var made = two[cD].made;
            if (!made.length) continue;
            if (made[made.length - 1] !== fD.entities.length - 1) break;   // something placed after it (a typed segment): leave the rest
            for (var iD = made.length - 1; iD >= 0; iD--) {
              fD.entities.pop();
              if (window.SketchSolver) SketchSolver.removeEntity(fD, made[iD]);
              if (fD.dims) fD.dims = fD.dims.filter(function (d) { return d.e !== made[iD]; });
              took++;
            }
            if (two[cD].pushed) { App.undo.pop(); App.sketchDirty = false; }
          }
        }
        if (took) { App.sel = null; App.sel2 = null; App.dimsStale = true; UI.updateSketches(); UI.refreshTree(); }
      }
      finishChain(); return;
    }
    var p = pos(ev), hit = UI.pickFace(p[0], p[1]);
    // user 2026-11-03: in a part with no command taking picks, a double-click on a solid selects that whole body (as its
    // Solid Bodies row does); the single clicks before it selected (and with Ctrl toggled) only the face. Ctrl adds the
    // body to the selection. The FeatureManager row still opens Edit Feature on a double-click. With a command open the
    // double-click is only that command's two picks: it never opens another feature (that would drop the command).
    var inPart = !(UI.isAssembly && UI.isAssembly()) && !(UI.drawingActive && UI.drawingActive());
    if (hit && inPart && (App.command || (UI.hasPM && UI.hasPM()))) return;
    if (hit && inPart) {
      var bf = App.mesh.faces[hit.index], bi = bf && bf.body ? bf.body : 0;
      if (ev.ctrlKey || ev.metaKey) {
        var cur = (UI.selection ? UI.selection() : []).filter(function (s) { return !(s.kind === 'face' && s.index === hit.index) && !(s.kind === 'body' && s.index === bi); });
        if (UI.setSelection) { UI.setSelection(cur.concat([{ kind: 'body', index: bi }])); return; }
      }
      if (UI.selectBody) UI.selectBody(bi);
      return;
    }
    if (hit) {
      // double-clicking a face opens its owning feature for editing (assemblies only)
      var id = App.triShared[App.mesh.faces[hit.index].start];
      var f = K.findFeature(App.model, id);
      if (f) UI.editFeature(f);
    }
  });

  // r5/sketch5: right-click with the Select tool opens the sketch's shortcut menu, as in SolidWorks: on an entity
  // (selected first if it is not) Construction Geometry, Add Relation, Display/Delete Relations, Smart Dimension and
  // Delete; anywhere Exit Sketch and Discard Changes.
  function sketchMenu(mx, my, ev) {
    var f = UI.activeSketchFeature();
    if (!f) return;
    var hit = UI.pickEntity(mx, my), items = [];
    if (hit && !(UI.entitySelected ? UI.entitySelected(hit.index) : App.sel && App.sel.kind === 'entity' && App.sel.index === hit.index)) {
      if (UI.setSelection) UI.setSelection([hit]); else { App.sel = hit; App.sel2 = null; UI.updateSketches(); }
    }
    var sel = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && sel.indexOf(s.index) < 0) sel.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && sel.indexOf(App.sel.index) < 0) sel.push(App.sel.index);
    sel = sel.filter(function (i) { return f.entities[i]; });
    if (sel.length) {
      var allCon = sel.every(function (i) { return f.entities[i].construction; });
      items.push({ label: 'Construction Geometry', checked: allCon, action: function () { if (UI.toggleConstruction) UI.toggleConstruction(sel); } });
      items.push({ label: 'Add Relation…', action: function () { if (UI.cmdAddRelations) UI.cmdAddRelations(); } });
      items.push({ label: 'Display/Delete Relations…', action: function () { if (UI.cmdDisplayRelations) UI.cmdDisplayRelations('selected'); } });
      items.push({ label: 'Smart Dimension', key: 'D', action: function () { setTool('dimension'); } });
      items.push({ sep: true });
      items.push({ label: 'Delete', key: 'Del', action: function () { UI.deleteSelection(); } });
    } else {
      items.push({ label: 'Smart Dimension', key: 'D', action: function () { setTool('dimension'); } });
      items.push({ label: 'Line', key: 'L', action: function () { setTool('line'); } });
      items.push({ label: 'Display/Delete Relations…', action: function () { if (UI.cmdDisplayRelations) UI.cmdDisplayRelations(); } });
      items.push({ label: 'Zoom to Fit', key: 'F', action: function () { UI.zoomToFit(); } });
    }
    items.push({ sep: true });
    items.push({ label: 'Exit Sketch', action: function () { exitSketch(); } });
    items.push({ label: 'Discard Changes and Exit', action: function () { confirmCancelSketch(); } });
    // rfCR: Replace Entity… with the entity commands, after Mirror Entities… (SolidWorks' Sketch Tools ▸ Replace
    // Entity). The full list (ui-panels.js sketchMenuItems) is built here so the row has a place in it: showMenu shows
    // a list already built as it is.
    if (sel.length && UI.sketchMenuItems && UI.cmdReplaceEntity) {
      items = UI.sketchMenuItems(items);
      var rk = -1;
      items.forEach(function (it, k) { if (it && it.label === 'Mirror Entities…') rk = k; });
      var rep = { label: 'Replace Entity…', icon: 'moveEnt', action: function () { if (App.mode === 'sketch') UI.cmdReplaceEntity(); } };
      if (rk < 0) items.push(rep); else items.splice(rk + 1, 0, rep);
    }
    // rfL: Edit Polygon on a polygon's side or circle (SolidWorks puts it with the entity's commands)
    if (sel.length === 1 && UI.polygonOf && UI.polygonOf(sel[0], f) && UI.editPolygon) {
      if (UI.sketchMenuItems && !items.sketchMenu) items = UI.sketchMenuItems(items);
      var pk = -1;
      items.forEach(function (it, k) { if (it && it.label === 'Properties…') pk = k; });
      if (pk < 0) items.forEach(function (it, k) { if (pk < 0 && it && it.label === 'Delete') pk = k; });
      var edit = { label: 'Edit Polygon', icon: 'polygon', action: function () { if (App.mode === 'sketch') UI.editPolygon(sel[0]); } };
      if (pk < 0) items.unshift(edit); else items.splice(pk, 0, edit);
    }
    // rfIG: Select Chain on a curve (SolidWorks' entity menu has it at the top): the entity's chain end to end
    // (ui-select.js sketchChain; Shift+click does the same)
    var chainFrom = hit && f.entities[hit.index] && /^(line|arc|spline|pellipse)$/.test(f.entities[hit.index].t) ? hit.index : -1;
    if (chainFrom >= 0 && UI.selectSketchChain) {
      if (UI.sketchMenuItems && !items.sketchMenu) items = UI.sketchMenuItems(items);
      items.unshift({ label: 'Select Chain', icon: 'select', action: function () { if (App.mode === 'sketch') UI.selectSketchChain(chainFrom, 'replace'); } }, { sep: true });
    }
    // lane CV: Dissolve Sketch Text on a sketch text (SolidWorks puts it above Properties…)
    if (sel.length === 1 && f.entities[sel[0]].t === 'text' && UI.dissolveSketchText) {
      if (UI.sketchMenuItems && !items.sketchMenu) items = UI.sketchMenuItems(items);
      var tk = -1;
      items.forEach(function (it, k) { if (it && it.label === 'Properties…') tk = k; });
      var dis = { label: 'Dissolve Sketch Text', icon: 'text', action: function () { if (App.mode === 'sketch') UI.dissolveSketchText(sel[0]); } };
      if (tk < 0) items.push(dis); else items.splice(tk, 0, dis);
    }
    UI.showMenu(ev.clientX, ev.clientY, items);
  }
  UI.sketchMenu = function (mx, my) { var r = viewport.getBoundingClientRect(); sketchMenu(mx, my, { clientX: r.left + mx, clientY: r.top + my }); };
  // rfE (fidelity finding 10): right-click while a Line chain is being drawn opens SolidWorks' short menu (End Chain,
  // Select, Smart Dimension, Exit Sketch) instead of ending the chain at once; double-click and Esc still end it
  function chainMenuWanted(ev) {
    var st = App.toolState;
    if (App.tool !== 'line' || !st || !st.pts || !st.pts.length || (App.command && App.command.onSketchPoint)) return false;
    return !(ev && ev.target && ev.target.closest && ev.target.closest('#dim-layer, #dim-edit, #sk-num, #hud, #exit-sketch'));
  }
  function chainMenu(ev) {
    var items = [
      { label: 'End Chain (double-click)', icon: 'line', action: function () { if (App.mode === 'sketch' && App.tool === 'line') finishChain(); } },
      { label: 'Select', action: function () { if (App.mode === 'sketch') cancelTool(); } },
      { label: 'Smart Dimension', key: 'D', icon: 'dim', action: function () { if (App.mode === 'sketch') setTool('dimension'); } },
      { sep: true }
    ].concat(quickSnapMenuItems(), [
      { sep: true },
      { label: 'Exit Sketch', icon: 'exitSketch', action: function () { if (App.mode === 'sketch') exitSketch(); } }
    ]);
    UI.showMenu(ev.clientX, ev.clientY, items);
  }
  // rfAR: the Quick Snaps rows of the right-click menu (and of Tools ▸ Sketch Tools ▸ Quick Snaps)
  function quickSnapMenuItems() {
    return QUICK_SNAPS.map(function (q) {
      return { label: 'Quick Snaps ▸ ' + q[1], icon: 'quickSnaps', checked: App.quickSnap === q[0], action: function () { if (App.mode === 'sketch') UI.quickSnap(App.quickSnap === q[0] ? null : q[0]); } };
    });
  }
  UI.quickSnapMenuItems = quickSnapMenuItems;
  UI.chainMenu = function (mx, my) { var r = viewport.getBoundingClientRect(); if (!chainMenuWanted(null)) return false; chainMenu({ clientX: r.left + mx, clientY: r.top + my }); return true; };

  // Double-click or right-click: as in SolidWorks, a chain (or a half-drawn entity) ends and the tool stays active
  // for the next one; with nothing in progress the tool is put down.
  function finishChain() {
    if (App.tool === 'select') return;
    var st = App.toolState || {};
    if (UI.sketchFreeHooks[App.tool] && UI.sketchFreeHooks[App.tool].finish && st.pts && st.pts.length) { UI.sketchFreeHooks[App.tool].finish(st); cancelTool(true); return; }   // ui-sketch-spline: the tool stays
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
    if (App.mode === 'sketch') {
      clearFeedback();   // screen-space cursor feedback is redrawn on the next move
      // r9/sketch9: relation icons hold their places while the zoom glides; once it has rested they are placed again
      lastWheelAt = performance.now();
      if (wheelRest) clearTimeout(wheelRest);
      wheelRest = setTimeout(function () { wheelRest = 0; App.dimsStale = true; }, ZOOM_REST_MS + 20);
    }
  }, { passive: false });
  var lastWheelAt = -1e9, wheelRest = 0, ZOOM_REST_MS = 250;
  UI.sketchZooming = function () { return performance.now() - lastWheelAt < ZOOM_REST_MS || !!(UI.viewAnimating && UI.viewAnimating()); };

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

  // lane CG: Esc (ui-commands.js escapeCommand) closes the sketch's value boxes without applying them before the tool
  // is put down: the on-screen / unit request box (no onFinish: Parallel Line makes no line) and the Modify box
  UI.escapeBoxes = UI.escapeBoxes || [];
  UI.escapeBoxes.push(function () {
    var did = false;
    if (numBox) { closeNumBox(); did = true; }
    if (dimEditing) { closeDimEdit(false); did = true; }
    return did;
  });

  UI.enterSketch = enterSketch;
  UI.exitSketch = exitSketch;
  UI.cancelSketch = cancelSketch;
  UI.setTool = setTool;
  UI.cancelTool = cancelTool;
  UI.addEntity = function (e) { addEntity(e); };   // (Spline, Text: the points their tool placed)
})(UI);
