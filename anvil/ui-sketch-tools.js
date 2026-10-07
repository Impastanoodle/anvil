// ui-sketch-tools.js — Sketch Fillet / Chamfer, Offset, Trim / Extend, Convert, Intersection Curve, Move / Copy / Rotate / Scale / Stretch, Linear / Circular Sketch Pattern, Dynamic Mirror: their SolidWorks PropertyManagers.
// Registers tool PMs in UI.sketchToolPMs[tool] (opened by setTool in ui-sketch.js); see README *Sketch tab*.
// These are commands (each opens its PropertyManager at once, with SolidWorks 2024's groups, fields, names and
// defaults); the geometry is SketchSolver's (sketch-solver.js: filletPair, chamferPair, offsetSelection,
// transformEntities, linearPattern, circularPattern, trimAt …), which is all or nothing: a tool that fails leaves the
// sketch exactly as it was, and its undo step is taken back.
(function () {
  'use strict';
  if (typeof UI === 'undefined') return;
  UI.sketchToolPMs = UI.sketchToolPMs || {};
  var App = UI.App, K = UI.K, $ = UI.$, S = window.SketchSolver;
  if (!S || !UI.openPM) return;

  // ------------------------------------------------------------------ shared helpers
  var PICK_STYLE = 'stroke:#2d7dd2;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.75';
  var HOT_STYLE = 'stroke:#e8891c;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.9';
  function sketch() { var f = UI.activeSketchFeature(); if (!f) UI.toast('Open a sketch first.'); return f; }
  function toUV(mx, my) { return UI.screenToPlane(mx, my, UI.activePlane()); }
  function scr(q) { return UI.worldToScreen(K.to3D(UI.activePlane(), q[0], q[1])); }
  // sketch units per screen pixel at (mx, my)
  function pxWorld(mx, my) { var a = toUV(mx, my), b = toUV(mx + 1, my); return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 1; }
  function entPts(e) { return K.entityPolylines(e).map(function (l) { return l.closed && l.pts.length ? l.pts.concat([l.pts[0]]) : l.pts; }); }
  function ring(p, px) { var s = scr(p), out = []; for (var k = 0; k <= 16; k++) { var a = k * Math.PI / 8, q = toUV(s[0] + px * Math.cos(a), s[1] + px * Math.sin(a)); if (q) out.push(q); } return out; }
  // the sketch entities selected (in the graphics area or the PropertyManager), in index order
  function selIdx(f) {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out.filter(function (i) { return f.entities[i]; }).sort(function (a, b) { return a - b; });
  }
  var NAMES = { line: 'Line', circle: 'Circle', arc: 'Arc', rect: 'Rectangle', crect: 'Rectangle', poly: 'Polygon', slot: 'Slot', point: 'Point', polyline: 'Polyline' };
  function entityLabel(e, i) { return (e && e.sharp ? 'Sharp' : NAMES[e && e.t] || 'Entity') + (i + 1); }
  // One sketch action, one undo step: fn() returns { ok, error }; a failure takes the undo step back (the solver has
  // already put the sketch back). always: the step is pushed even inside one gesture (a PropertyManager's ✓).
  function step(fn, always) {
    var pushed = always || !App.sketchDirty;
    if (pushed) { UI.pushUndo(); App.sketchDirty = true; }
    var r;
    try { r = fn(); } catch (e) { r = { ok: false, error: e.message }; }
    if (!r || !r.ok) { if (pushed) { App.undo.pop(); App.sketchDirty = false; } }
    return r || { ok: false };
  }
  function changed() { App.sel = null; App.sel2 = null; App.gridStale = true; App.dimsStale = true; UI.updateSketches(); UI.refreshTree(); }
  function clearPreview() { App.tempEntities = []; UI.updateTemp(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); }
  // A selection box of sketch entities (Entities to Mirror / Pattern / Move …): the selection when the command starts
  // plus what is clicked while it is open (a click toggles); a row's Delete takes it out.
  function entityBox(f, v, icon, onChange, opts) {
    opts = opts || {};
    return { type: 'pick', icon: icon, placeholder: opts.placeholder || 'Select sketch entities…',
      value: function (x) { return x.entities.length ? x.entities.length + ' entit' + (x.entities.length > 1 ? 'ies' : 'y') : ''; },
      active: opts.box ? function (x) { return x.box === 'entities'; } : undefined, onActivate: opts.box ? function () { opts.box('entities'); } : undefined,
      items: function (x) { return x.entities.map(function (i) { return { label: entityLabel(f.entities[i], i) }; }); },
      onRemove: function (x, i) { x.entities.splice(i, 1); if (UI.setSelection) UI.setSelection(x.entities.map(function (k) { return { kind: 'entity', index: k }; })); UI.renderPM(); onChange(); },
      onClear: function (x) { x.entities.length = 0; if (UI.setSelection) UI.setSelection([]); UI.renderPM(); onChange(); } };
  }
  function syncSelection(f, v, onChange) {
    return function () {
      if (v.box && v.box !== 'entities') return;
      var s = selIdx(f);
      if (s.join() === v.entities.join()) return;
      v.entities = s;
      UI.renderPM(); onChange();
    };
  }
  // the sketch point (an end, a centre, the origin) within 9 px of the cursor, else the point under it
  // sketch-refine: where the drawing tools would put it (UI.sketchInferPoint: sketch and model points, curves,
  // alignment, and a free point rounded to the roundest value under the cursor, 10 not 10.125), as SolidWorks infers
  // the From / To points
  function snapPoint(f, uv, mx, my) {
    if (UI.sketchInferPoint) { var inf = UI.sketchInferPoint(uv, mx, my); if (inf && inf.p) return inf.p.slice(); }
    var best = null, bd = 9;
    f.entities.forEach(function (e, i) { S.pointRefs(f, i).forEach(function (pr) { if (/\.mid$/.test(pr.ref)) return; var s = scr(pr.pt), d = Math.hypot(s[0] - mx, s[1] - my); if (d < bd) { bd = d; best = pr.pt; } }); });
    var o = scr([0, 0]);
    if (Math.hypot(o[0] - mx, o[1] - my) < bd) best = [0, 0];
    return best ? best.slice() : uv.slice();
  }
  function fmtPt(p) { return '(' + UI.fmtNum(p[0], 3) + ', ' + UI.fmtNum(p[1], 3) + ')'; }

  // ------------------------------------------------------------------ Sketch Fillet / Sketch Chamfer
  // SolidWorks: Sketch tab ▸ Sketch Fillet (flyout: Sketch Chamfer). Pick a vertex (a corner where two lines / arcs
  // meet, a rectangle's, polygon's or polyline's corner) or two entities; the fillet (chamfer) is made at once and
  // listed in Entities to Fillet. ✓ closes; ✗ takes back every one made while the PropertyManager was open.
  function cornerTool(kind) {
    var f = sketch();
    if (!f) return;
    var chamfer = kind === 'chamfer';
    var v = chamfer ? { type: 'distance', equal: true, d1: UI.lenDefault(10), d2: UI.lenDefault(10), angle: 45, items: [] }
      : { r: UI.lenDefault(10), keepCorner: true, dimEach: false, chain: false, items: [] };
    var snap = JSON.stringify({ entities: f.entities, rels: f.rels || null, dims: f.dims || null }), undo0 = App.undo.length, first = null, picked = null;
    function fresh() { var g = UI.activeSketchFeature(); if (g) f = g; }
    function cornerTol(mx, my) { return 12 * pxWorld(mx, my); }
    // a rectangle's corner: the rectangle becomes four lines first (as SolidWorks draws it)
    function explode(i) {
      var n0 = f.entities.length;
      S.explodeRect(f, i);
      var shift = f.entities.length - n0;
      if (first != null && first > i) first += shift;
      if (picked && picked.i > i) picked.i += shift;
    }
    function make(spec) {
      return step(function () {
        if (spec.rect != null) { explode(spec.rect); var c = S.curveCorner(f, spec.at, 1e-6 * Math.max(1, Math.abs(spec.at[0]), Math.abs(spec.at[1]))); if (!c) return { ok: false, error: 'No corner there.' }; spec = c; }
        if (chamfer) return S.chamferPair(f, spec, { type: v.type, d1: +v.d1, d2: +v.d2, angle: +v.angle, equal: !!v.equal });
        var o = { keepCorner: v.keepCorner !== false };
        var eqTo = !v.dimEach && first != null && f.entities[first] && f.entities[first].t === 'arc' ? first : null;
        if (eqTo != null) { o.equalTo = eqTo; o.dimension = false; }
        // sketch-tools2: Fillet all corners of the chain — a vertex rounds every corner of its chain of lines / arcs
        if (v.chain && spec.ei) {
          var rc = S.filletChain(f, spec, +v.r, { keepCorner: o.keepCorner, dimEach: !!v.dimEach, equalTo: eqTo });
          if (rc.ok) { rc.arc = rc.arcs[0]; rc.count = rc.arcs.length; }
          return rc;
        }
        return S.filletPair(f, spec, +v.r, o);
      });
    }
    function done(r, label) {
      if (!r.ok) { UI.toast(r.error); UI.updateSketches(); return; }
      if (!chamfer && first == null) first = r.arc;
      var n = r.count || 1;
      for (var k = 0; k < n; k++) v.items.push(n > 1 ? label + ' — chain ' + (k + 1) + '/' + n : label);
      changed(); UI.renderPM();
      UI.setStatus((chamfer ? 'Chamfer' : 'Fillet R' + UI.fmtNum(+v.r, 4)) + ' made' + (n > 1 ? ' at ' + n + ' corners of the chain' : '') + '. Pick another vertex or two entities, or press ✓.');
    }
    // sketch-tools2: every corner of a polygon / closed polyline rounded in place (Fillet all corners of the chain): the
    // original corners from the last to the first, so the indices still to do do not move
    function roundAll(pts) {
      var out = pts.slice();
      for (var k = pts.length - 1; k >= 0; k--) out = K.filletPolyline(out, k, +v.r);
      return out;
    }
    // the nearest vertex of a rectangle, polygon or closed polyline: { e, ei, pts, pi, d }
    function shapeCorner(uv) {
      var best = null;
      f.entities.forEach(function (e, ei) {
        if (e.t !== 'rect' && e.t !== 'crect' && e.t !== 'poly' && !(e.t === 'polyline' && e.closed)) return;
        var pts = e.t === 'polyline' ? e.pts : K.entityPolylines(e)[0].pts;
        pts.forEach(function (p, pi) { var d = Math.hypot(p[0] - uv[0], p[1] - uv[1]); if (!best || d < best.d) best = { e: e, ei: ei, pts: pts, pi: pi, d: d }; });
      });
      return best;
    }
    function click(uv, mx, my) {
      fresh();
      var tol = cornerTol(mx, my), c = S.curveCorner(f, uv, tol), cd = c ? Math.hypot(c.at[0] - uv[0], c.at[1] - uv[1]) : Infinity, sc = shapeCorner(uv);
      if (chamfer && c && (f.entities[c.i].t !== 'line' || f.entities[c.j].t !== 'line')) { c = null; cd = Infinity; }
      if (sc && sc.d <= tol && sc.d < cd) {
        var at = sc.pts[sc.pi].slice();
        if (sc.e.t === 'rect' || sc.e.t === 'crect') { picked = null; done(make({ rect: sc.ei, at: at }), 'Vertex ' + fmtPt(at)); return; }
        if (chamfer) { UI.toast('Sketch Chamfer works on lines: a polygon\'s corner cannot be chamfered.'); return; }
        // a polygon / polyline corner: the outline is rounded in place (it stays one entity)
        var r = step(function () {
          var out = v.chain ? roundAll(sc.pts) : K.filletPolyline(sc.pts, sc.pi, +v.r);
          f.entities[sc.ei] = { t: 'polyline', pts: out.map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; }), closed: true };
          if (sc.e.construction) f.entities[sc.ei].construction = true;
          S.clean(f);
          return { ok: true, count: v.chain ? sc.pts.length : 1 };
        });
        done(r, 'Vertex ' + fmtPt(at));
        return;
      }
      if (c) { picked = null; done(make(c), 'Vertex ' + fmtPt(c.at)); return; }
      // two entities picked one after the other
      var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
      if (!e || !(e.t === 'line' || (!chamfer && e.t === 'arc'))) { UI.setStatus(chamfer ? 'Pick a corner, or two lines.' : 'Pick a corner, or two lines or arcs.'); return; }
      if (!picked || picked.i === hit.index) { picked = { i: hit.index, uv: uv }; UI.sketchFeedbackClear(); UI.sketchPreview(entPts(e), PICK_STYLE, 'sk-trim-pick'); UI.setStatus('Pick the second entity.'); return; }
      var spec = { i: picked.i, uvi: picked.uv, j: hit.index, uvj: uv }, li = entityLabel(f.entities[picked.i], picked.i) + ', ' + entityLabel(e, hit.index);
      picked = null;
      done(make(spec), li);
    }
    function hover(uv, mx, my) {
      fresh();
      UI.sketchFeedbackClear();
      if (picked && f.entities[picked.i]) UI.sketchPreview(entPts(f.entities[picked.i]), PICK_STYLE, 'sk-trim-pick');
      var tol = cornerTol(mx, my), c = S.curveCorner(f, uv, tol), sc = shapeCorner(uv);
      if (c) { UI.sketchPreview((!chamfer && v.chain ? S.chainCorners(f, c) : [c]).map(function (k) { return ring(k.at, 7); }), HOT_STYLE, 'sk-trim-end'); return; }
      if (sc && sc.d <= tol) { UI.sketchPreview([ring(sc.pts[sc.pi], 7)], HOT_STYLE, 'sk-trim-end'); return; }
      var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
      if (e && (e.t === 'line' || (!chamfer && e.t === 'arc'))) UI.sketchPreview(entPts(e), HOT_STYLE, 'sk-trim-span');
    }
    var groups = [{ title: chamfer ? 'Entities to Chamfer' : 'Entities to Fillet', fields: [{ type: 'pick', icon: chamfer ? 'skChamfer' : 'fillet', placeholder: 'Select sketch vertices or entities…', value: function (x) { return x.items.length ? x.items.length + (chamfer ? ' chamfer' : ' fillet') + (x.items.length > 1 ? 's' : '') : ''; }, items: function (x) { return x.items.map(function (t) { return { label: t }; }); } }] }];
    if (chamfer) groups.push({ title: 'Chamfer Parameters', fields: [
      { type: 'radio', key: 'type', options: [['angle', 'Angle-distance'], ['distance', 'Distance-distance']], rerender: true },
      { type: 'check', label: 'Equal distance', key: 'equal', rerender: true, show: function (x) { return x.type === 'distance'; } },
      { type: 'number', label: 'Distance 1', key: 'd1', unit: 'u', min: 0 },
      { type: 'number', label: 'Direction 1 Angle', key: 'angle', unit: '°', min: 0, show: function (x) { return x.type === 'angle'; } },
      { type: 'number', label: 'Distance 2', key: 'd2', unit: 'u', min: 0, show: function (x) { return x.type === 'distance' && !x.equal; } }
    ] });
    else groups.push({ title: 'Fillet Parameters', fields: [
      { type: 'number', label: 'Radius', key: 'r', unit: 'u', min: 0 },
      { type: 'check', label: 'Keep constrained corners', key: 'keepCorner' },
      { type: 'check', label: 'Dimension each fillet', key: 'dimEach' },
      { type: 'check', label: 'Fillet all corners of the chain', key: 'chain' }
    ] });
    UI.openPM({
      title: chamfer ? 'Sketch Chamfer' : 'Sketch Fillet', icon: chamfer ? 'skChamfer' : 'fillet', values: v,
      message: chamfer ? 'Select a sketch vertex or two sketch lines to chamfer.' : 'Select a sketch vertex or two sketch entities to fillet.',
      command: { ownHover: true, sketchFillet: true, onSketchPoint: click, onSketchMove: hover },
      groups: groups,
      onChange: function () { }, onOK: function () { },
      onCancel: function () {
        if (!v.items.length) return;
        fresh();
        var s0 = JSON.parse(snap);
        f.entities = s0.entities;
        if (s0.rels) f.rels = s0.rels; else delete f.rels;
        if (s0.dims) f.dims = s0.dims; else delete f.dims;
        if (App.undo.length > undo0) App.undo.length = undo0;
        changed();
      },
      onClose: function () { UI.sketchFeedbackClear(); }
    });
    // two entities selected when the command starts: they are filleted (chamfered) at once
    var pre = selIdx(f).filter(function (i) { var e = f.entities[i]; return e.t === 'line' || (!chamfer && e.t === 'arc'); });
    if (pre.length === 2) {
      var mid = function (e) { return e.t === 'line' ? [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2] : [e.cx + e.r * Math.cos((e.a0 + e.a1) / 2 * Math.PI / 180), e.cy + e.r * Math.sin((e.a0 + e.a1) / 2 * Math.PI / 180)]; };
      var spec0 = { i: pre[0], uvi: mid(f.entities[pre[0]]), j: pre[1], uvj: mid(f.entities[pre[1]]) }, lab = entityLabel(f.entities[pre[0]], pre[0]) + ', ' + entityLabel(f.entities[pre[1]], pre[1]);
      done(make(spec0), lab);
    }
  }
  function cmdSketchFillet() { cornerTool('fillet'); }
  function cmdSketchChamfer() { cornerTool('chamfer'); }

  // ------------------------------------------------------------------ Offset Entities
  // SolidWorks: Sketch tab ▸ Offset Entities. Parameters: Offset distance, Add dimensions, Reverse, Select chain,
  // Bi-directional, Cap ends (Arcs / Lines), Construction geometry (Base geometry / Offset geometry). The selection is
  // offset (a click in the graphics area adds or removes an entity); the preview follows every change. Lines and arcs
  // joined end to end go as a chain with sharp corners, one Offset relation and one offset dimension. With nothing
  // selected in a sketch on a face, the face's outline is offset (as polylines).
  function cmdOffsetEntities() {
    var f = sketch();
    if (!f) return;
    var v = { entities: selIdx(f), d: UI.lenDefault(10), dims: true, reverse: false, chain: true, bi: false, cap: false, capType: 'arc', baseCons: false, offCons: false };
    function faceMode() { return !v.entities.length && f.faceLoops && f.faceLoops.length; }
    function opts(extra) { var o = { d: +v.d, reverse: !!v.reverse, chain: !!v.chain, bi: !!v.bi, cap: v.bi && v.cap ? v.capType : '', dims: !!v.dims, base: !!v.baseCons, offset: !!v.offCons }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
    function faceLoopsOffset() {
      return f.faceLoops.map(function (loop) {
        var isCcw = K.signedArea(loop) >= 0, sign = (v.reverse ? -1 : 1) * (isCcw ? 1 : -1);
        var e = { t: 'polyline', pts: K.offsetLoop(loop, sign * Math.abs(+v.d || 0)).map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; }), closed: true };
        if (v.offCons) e.construction = true;
        return e;
      });
    }
    function preview() {
      var ents = [];
      try {
        if (faceMode()) ents = faceLoopsOffset();
        else if (v.entities.length) { var r = S.offsetSelection(f, v.entities, opts({ preview: true })); if (r.ok) ents = r.entities; else UI.setStatus(r.error); }
      } catch (e) { UI.setStatus(e.message); }
      App.tempEntities = ents; UI.updateTemp();
    }
    UI.openPM({
      title: 'Offset Entities', icon: 'offset', values: v,
      message: 'Select sketch entities to offset; set the distance. The preview shows where the offset goes.',
      onSelection: syncSelection(f, v, preview),
      groups: [{ title: 'Parameters', fields: [
        { type: 'number', label: 'Offset distance', key: 'd', unit: 'u', min: 0 },
        { type: 'check', label: 'Add dimensions', key: 'dims' },
        { type: 'check', label: 'Reverse', key: 'reverse' },
        { type: 'check', label: 'Select chain', key: 'chain' },
        { type: 'check', label: 'Bi-directional', key: 'bi', rerender: true },
        { type: 'check', label: 'Cap ends', key: 'cap', rerender: true, disabled: function (x) { return !x.bi; } },
        { type: 'radio', key: 'capType', options: [['arc', 'Arcs'], ['line', 'Lines']], show: function (x) { return x.bi && x.cap; } },
        { type: 'static', label: 'Construction geometry:', value: '' },
        { type: 'check', label: 'Base geometry', key: 'baseCons' },
        { type: 'check', label: 'Offset geometry', key: 'offCons' }
      ] }],
      onChange: preview,
      okBlocked: function () { return v.entities.length || faceMode() ? '' : 'Select the sketch entities to offset.'; },
      onOK: function () {
        if (!(+v.d > 0)) { UI.toast('The offset distance must be a positive number.'); return false; }
        if (faceMode()) {
          var loops = faceLoopsOffset();
          step(function () { loops.forEach(function (e) { f.entities.push(e); }); return { ok: true }; }, true);
          clearPreview(); changed();
          UI.setStatus('Offset ' + loops.length + ' face loop' + (loops.length === 1 ? '' : 's') + ' by ' + v.d + '.');
          return;
        }
        var r = step(function () { return S.offsetSelection(f, v.entities, opts()); }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        UI.setStatus('Offset ' + r.added.length + ' entit' + (r.added.length === 1 ? 'y' : 'ies') + ' by ' + v.d + (v.dims ? ', with the offset dimension.' : '.'));
      },
      onCancel: clearPreview
    });
    if (!v.entities.length && !faceMode()) UI.setStatus('Select the sketch entities to offset in the graphics area.');
    preview();
  }

  // ------------------------------------------------------------------ Trim Entities / Extend Entities
  // r13/trim13: Trim Entities as in SolidWorks, with its five options (the last one used stays for the next time) and
  // the two check boxes under them: Keep trimmed entities as construction geometry, Ignore trimming of construction
  // geometry (both remembered too). Power trim (the default): press and drag; a grey trail follows the cursor and every
  // entity segment it crosses goes at once (one undo step per drag). Pressed on the free end of a line or an arc, the
  // drag extends or shortens it along itself instead, snapping onto the entities in its way. Corner: two entities meet,
  // each keeping the side clicked. Trim away inside / outside: two bounding entities, then the entities to trim. Trim
  // to closest: a click removes the segment under the cursor (Power trim's click does too). In every mode the part that
  // would go is highlighted first.
  var trimMode = 'power', trimKeep = false, trimIgnore = false;
  var TRIM_MODES = [['power', 'Power trim'], ['corner', 'Corner'], ['inside', 'Trim away inside'], ['outside', 'Trim away outside'], ['closest', 'Trim to closest']];
  var TRIM_MSG = {
    power: '<b>Press and drag across the entities to trim.</b> Every segment the trail crosses goes. Drag from the free end of a line or an arc to extend or shorten it; a click trims the segment under the cursor.',
    corner: '<b>Select two entities.</b> They are extended or trimmed until they meet, each keeping the side you click.',
    inside: '<b>Select two bounding entities, then the entities to trim.</b> The part between the bounding entities goes.',
    outside: '<b>Select two bounding entities, then the entities to trim.</b> The parts outside the bounding entities go.',
    closest: '<b>Click the part of an entity to remove.</b> The segment between its neighbouring intersections goes away; an entity with nothing crossing it is deleted.'
  };
  var TRIM_HINT = { power: '<b>Power trim:</b> drag across entities to trim them; drag a free end to extend it.', corner: '<b>Corner:</b> click two entities to make them meet.', inside: '<b>Trim away inside:</b> click two bounding entities, then the entities to trim.', outside: '<b>Trim away outside:</b> click two bounding entities, then the entities to trim.', closest: '<b>Trim to closest:</b> click the segment to remove.' };
  var TRIM_SPAN = 'stroke:#e8891c;stroke-width:4;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.85';
  var TRIM_PICK = PICK_STYLE;
  var TRIM_TRAIL = 'stroke:#8c8c8c;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.9';
  UI.trimStats = UI.trimStats || { moves: 0, total: 0, max: 0 };   // per pointer move of a Power trim drag (ms), for the smoothness checks
  function cmdTrimEntities() {
    var f = sketch();
    if (!f) return;
    // the sketch as it is now (an undo or a rebuild may have replaced the feature object since the PM opened)
    function fresh() { var g = UI.activeSketchFeature(); if (g) f = g; }
    var count = 0, picks = [], vals = { mode: trimMode, keepCons: trimKeep, ignoreCons: trimIgnore };   // picks: { e: the entity object, uv: where it was clicked }
    var hint0 = $('sketch-hint') ? $('sketch-hint').innerHTML : null;
    function setHint() { var h = $('sketch-hint'); if (h && App.mode === 'sketch') h.innerHTML = TRIM_HINT[mode()] || ''; }
    function mode() { return vals.mode || 'power'; }
    function topts(o) { o = o || {}; o.keepConstruction = !!vals.keepCons; o.ignoreConstruction = !!vals.ignoreCons; return o; }
    function ignored(e) { return !!(vals.ignoreCons && e && e.construction); }
    function pickIdx() { picks = picks.filter(function (p) { return f.entities.indexOf(p.e) >= 0; }); return picks.map(function (p) { return f.entities.indexOf(p.e); }); }
    function pickNames() { var ix = pickIdx(); return ix.length ? ix.map(function (i) { return S.refName(f, String(i)); }).join(', ') : '(none)'; }
    function changedSketch(n) {
      count += n; App.sel = null; App.gridStale = true;
      UI.updateSketches(); UI.refreshTree();
      UI.setStatus((mode() === 'corner' ? 'Made ' + count + ' corner' : 'Trimmed ' + count + ' segment') + (count === 1 ? '' : 's') + '. Continue, or press ✓ to finish.');
    }
    // the free end of a line or an arc within 8 px of the cursor (Power trim drags it): { i, end, pt }
    function freeEndAt(mx, my) {
      var best = null, bd = 8;
      f.entities.forEach(function (e, i) {
        if ((e.t !== 'line' && e.t !== 'arc') || e.infinite || ignored(e)) return;
        ['p1', 'p2'].forEach(function (end) {
          var p = S.refPoint(f, i + '.' + end), s = p && scr(p), d = s ? Math.hypot(s[0] - mx, s[1] - my) : Infinity;
          if (d < bd && !S.endJoined(f, i + '.' + end)) { bd = d; best = { i: i, end: end, pt: p }; }
        });
      });
      return best;
    }
    function drawPicks() { pickIdx().forEach(function (i) { UI.sketchPreview(entPts(f.entities[i]), TRIM_PICK, 'sk-trim-pick'); }); }
    // the hover preview: what a click (or a crossing) would remove, or what would be picked
    function hover(uv, mx, my) {
      fresh();
      if (!uv) return;
      UI.sketchFeedbackClear();
      drawPicks();
      var m = mode(), hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
      if (m === 'power' || m === 'closest') {
        var fe = m === 'power' ? freeEndAt(mx, my) : null;
        if (fe) { UI.sketchPreview([ring(fe.pt, 6)], TRIM_SPAN.replace('stroke-width:4', 'stroke-width:2'), 'sk-trim-end'); return; }
        var sp = e && e.t !== 'point' && !ignored(e) ? S.trimSpan(f, hit.index, uv) : null;
        if (sp) UI.sketchPreview([sp.pts], TRIM_SPAN, 'sk-trim-span');
        return;
      }
      if (!e || e.t === 'point') return;
      var ix = pickIdx();
      if (m === 'corner') {
        UI.sketchPreview(entPts(e), TRIM_SPAN.replace('stroke-width:4', 'stroke-width:2.5'), 'sk-trim-span');
        if (ix.length === 1) {
          var pv = S.cornerPreview(f, ix[0], picks[0].uv, hit.index, uv);
          if (pv) UI.sketchPreview(pv.map(function (c) { return entPts(c)[0]; }));   // the dashed orange result
        }
        return;
      }
      if (ix.length < 2) { UI.sketchPreview(entPts(e), TRIM_SPAN.replace('stroke-width:4', 'stroke-width:2.5'), 'sk-trim-span'); return; }
      if (ignored(e)) return;
      var spans = S.betweenSpans(f, hit.index, uv, ix, m === 'outside');
      if (spans) UI.sketchPreview(spans, TRIM_SPAN, 'sk-trim-span');
    }
    // a rectangle is four lines in SolidWorks: the edge picked becomes a line of its own (relations kept)
    function explodeAt(hit, mx, my) {
      var e = f.entities[hit.index];
      if (!e || (e.t !== 'rect' && e.t !== 'crect')) return hit;
      if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
      S.explodeRect(f, hit.index);
      return UI.pickEntity(mx, my) || hit;
    }
    function click(uv, mx, my) {
      fresh();
      var m = mode(), hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index], pushed, r;
      if (!e || e.t === 'point') { UI.setStatus(m === 'corner' || ((m === 'inside' || m === 'outside') && picks.length < 2) ? 'Click a line or an arc.' : 'Click on an entity to trim it.'); return; }
      if (m === 'power' || m === 'closest') {
        if (ignored(e)) { UI.setStatus('Construction geometry is not trimmed (Ignore trimming of construction geometry).'); return; }
        r = step(function () { return S.trimAt(f, hit.index, uv, topts()); });
        if (!r.ok) { UI.toast(r.error); return; }
        changedSketch(1);
      } else if (m === 'corner' && pickIdx().length < 1) {
        hit = explodeAt(hit, mx, my);
        picks = [{ e: f.entities[hit.index], uv: uv }];
        UI.renderPM(); UI.updateSketches();
        UI.setStatus('Select the second entity.');
      } else if (m === 'corner') {
        hit = explodeAt(hit, mx, my);
        var i0 = pickIdx()[0];
        pushed = !App.sketchDirty;
        if (pushed) { UI.pushUndo(); App.sketchDirty = true; }
        r = S.cornerTrim(f, i0, picks[0].uv, hit.index, uv);
        picks = [];
        UI.renderPM();
        if (!r.ok) { if (pushed) { App.undo.pop(); App.sketchDirty = false; } UI.toast(r.error); UI.updateSketches(); }
        else changedSketch(1);
      } else if (pickIdx().length < 2) {
        if (picks.some(function (p) { return p.e === e; })) return;
        picks.push({ e: e, uv: uv });
        UI.renderPM();
        UI.setStatus(picks.length < 2 ? 'Select the second bounding entity.' : 'Now click the entities to trim.');
      } else {
        if (ignored(e)) { UI.setStatus('Construction geometry is not trimmed (Ignore trimming of construction geometry).'); return; }
        hit = explodeAt(hit, mx, my);
        pushed = !App.sketchDirty;
        if (pushed) { UI.pushUndo(); App.sketchDirty = true; }
        r = S.trimBetween(f, hit.index, uv, pickIdx(), m === 'outside', topts());
        if (!r.ok) { if (pushed) { App.undo.pop(); App.sketchDirty = false; } UI.toast(r.error); return; }
        changedSketch(1);
        UI.renderPM();
      }
      hover(uv, mx, my);   // the highlight follows the new geometry
    }
    // The sketch is redrawn once per animation frame, in the frame itself (a fast drag across many entities never
    // queues redraws, and nothing is drawn that the screen would not show). ctx.analysis, when a trim left one, is the
    // sketch's state already: the redraw reuses it instead of analysing the sketch again.
    function painter(ctx) {
      var frame = 0;
      function paint() {
        frame = 0; App.gridStale = true;
        var reuse = !!(ctx && ctx.analysis);
        if (reuse) { App.sketchState = ctx.analysis; App.sketchDragging = true; }
        try { UI.updateSketches(); } finally { if (reuse) App.sketchDragging = false; }
      }
      return {
        mark: function () { if (!frame) frame = requestAnimationFrame(paint); },
        flush: function () { if (frame) { cancelAnimationFrame(frame); paint(); } }
      };
    }
    function trailHook(p) {
      var uv0 = toUV(p[0], p[1]);
      if (!uv0) return null;
      var trail = [uv0], last = uv0, n0 = count, ctx = topts({ conflicts: App.sketchState ? App.sketchState.conflicts : null }), pt = painter(ctx);
      return {
        start: function () { },
        move: function (q) {
          var uv = toUV(q[0], q[1]);
          if (!uv) return;
          var t0 = performance.now();
          var n = S.powerTrim(f, last, uv, function () { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } }, ctx);
          trail.push(uv); last = uv;
          if (n) { count += n; App.sel = null; pt.mark(); }
          UI.sketchPreview([trail], TRAIL_STYLE(), 'sk-trim-trail');
          var dt = performance.now() - t0, st = UI.trimStats;
          st.moves++; st.total += dt; if (dt > st.max) st.max = dt;
        },
        end: function () {
          pt.flush();
          UI.sketchFeedbackClear();
          if (count > n0) changedSketch(0);
        }
      };
    }
    function TRAIL_STYLE() { return TRIM_TRAIL; }
    function extendHook(fe) {
      var st = null, landed = false, pushed = false, ctx = {}, pt = painter(ctx);
      return {
        start: function () {
          pushed = !App.sketchDirty;
          if (pushed) { UI.pushUndo(); App.sketchDirty = true; }
          st = S.extendBegin(f, fe.i, fe.end);
          ctx.analysis = st ? S.analyze(f) : null;   // the drag changes no relation: the state is drawn from this one
        },
        move: function (q) {
          var uv = st && toUV(q[0], q[1]);
          if (!uv) return;
          var t0 = performance.now(), p = S.extendMove(f, st, uv, null), sp = scr(p), snap = null, bd = 8;
          // it lands exactly on an entity its line (or circle) crosses when it comes within 8 px of the crossing
          st.hits.forEach(function (h) { var s = scr(h), d = Math.hypot(s[0] - sp[0], s[1] - sp[1]); if (d < bd) { bd = d; snap = h; } });
          if (snap) p = S.extendMove(f, st, uv, snap);
          landed = !!snap;
          pt.mark();
          if (snap) UI.sketchSnapMark(p, q, true, 'coincident');
          var dt = performance.now() - t0, s2 = UI.trimStats;
          s2.moves++; s2.total += dt; if (dt > s2.max) s2.max = dt;
        },
        end: function () {
          if (!st) return;
          pt.flush();
          UI.sketchFeedbackClear();
          var r = S.extendEnd(f, st, landed);
          if (!r.ok) { if (pushed) { App.undo.pop(); App.sketchDirty = false; } UI.toast(r.error); UI.updateSketches(); return; }
          App.sel = null; App.gridStale = true; UI.updateSketches(); UI.refreshTree();
          UI.setStatus(r.held ? 'Its relations or dimensions hold the entity where it was.' : landed ? 'Extended to the entity in its way.' : 'Extended. Drag another, or press ✓ to finish.');
        }
      };
    }
    function drag(p) {
      fresh();
      if (mode() !== 'power') return null;
      var fe = freeEndAt(p[0], p[1]);
      return fe ? extendHook(fe) : trailHook(p);
    }
    UI.openPM({
      title: 'Trim Entities', icon: 'trim', values: vals, message: TRIM_MSG[vals.mode],
      command: { ownHover: true, onSketchMove: hover, onSketchPoint: click, onSketchDrag: drag },
      groups: [
        { title: 'Options', fields: [{ type: 'radio', key: 'mode', options: TRIM_MODES },
          { type: 'check', label: 'Keep trimmed entities as construction geometry', key: 'keepCons' },
          { type: 'check', label: 'Ignore trimming of construction geometry', key: 'ignoreCons' }] },
        { title: 'Selections', show: function (v) { return v.mode !== 'power' && v.mode !== 'closest'; }, fields: [
          { type: 'static', label: 'Selected', value: pickNames },
          { type: 'buttons', buttons: [{ label: 'Clear Selections', onclick: function () { picks = []; UI.renderPM(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); } }] }
        ] }
      ],
      onChange: function (v, key) {
        trimKeep = !!v.keepCons; trimIgnore = !!v.ignoreCons;
        if (key !== 'mode') return;
        trimMode = v.mode; picks = [];
        var sp = UI.pmSpec();
        if (sp) sp.message = TRIM_MSG[v.mode] || TRIM_MSG.power;
        UI.renderPM();
        if (UI.sketchFeedbackClear) UI.sketchFeedbackClear();
        setHint();
      },
      onOK: function () { },
      onClose: function () { var h = $('sketch-hint'); if (h && hint0 != null) h.innerHTML = hint0; if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); }
    });
    setHint();
  }
  // Extend Entities (r3/sketch3; Trim flyout): the end of a line or an arc nearest the click grows to the first entity
  // in its way; hovering previews the extension (SketchSolver.extendTarget).
  function cmdExtendEntities() {
    var f = sketch();
    if (!f) return;
    var count = 0;
    function target(uv, mx, my) {
      var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
      if (!e || !(e.t === 'line' || e.t === 'arc' || e.t === 'pellipse' || (e.t === 'spline' && !e.closed))) return null;
      var tg = S.extendTarget(f, hit.index, uv);
      return tg ? { i: hit.index, e: e, tg: tg } : null;
    }
    UI.openPM({
      title: 'Extend Entities', icon: 'extend',
      message: '<b>Click a line, an arc, an open spline or a partial ellipse near the end to lengthen.</b> It grows to the first entity in its way; the orange preview shows where.',
      command: {
        onSketchMove: function (uv, mx, my) {
          var t = target(uv, mx, my);
          if (!t || !UI.sketchPreview) return;
          var pts = [t.tg.from, t.tg.to];
          // sketch-refine: a partial ellipse runs on round its ellipse, a spline along its end span
          var fc = (t.e.t === 'spline' || t.e.t === 'pellipse') && S.freeCurve ? S.freeCurve(t.e) : null;
          if (fc) pts = S.freePts(fc, t.tg.end === 'p2' ? fc.t1 : t.tg.t, t.tg.end === 'p2' ? t.tg.t : fc.t0);
          else if (t.e.t === 'arc') {
            var from = t.tg.end === 'p2' ? t.e.a1 : t.tg.a, to = t.tg.end === 'p2' ? t.tg.a : t.e.a0;
            pts = [];
            for (var k = 0; k <= 32; k++) { var a = (from + (to - from) * k / 32) * Math.PI / 180; pts.push([t.e.cx + t.e.r * Math.cos(a), t.e.cy + t.e.r * Math.sin(a)]); }
          }
          UI.sketchPreview([pts]);
        },
        onSketchPoint: function (uv, mx, my) {
          var hit = UI.pickEntity(mx, my);
          if (!hit) { UI.setStatus('Click a line or an arc near the end to extend.'); return; }
          var r = step(function () { return S.extendEntity(f, hit.index, uv); });
          if (!r.ok) { UI.toast(r.error); return; }
          count++;
          App.sel = null; App.gridStale = true;
          UI.updateSketches(); UI.refreshTree();
          UI.setStatus('Extended ' + count + ' entit' + (count === 1 ? 'y' : 'ies') + '. Click another, or press ✓ to finish.');
        }
      },
      groups: [{ title: 'Options', fields: [{ type: 'static', label: 'Mode', value: 'Extend to closest' }] }],
      onChange: function () { }, onOK: function () { }
    });
  }

  // ------------------------------------------------------------------ Convert Entities
  // SolidWorks: Sketch tab ▸ Convert Entities. Entities to Convert: model edges, loops or faces picked in the graphics
  // area (a face converts its edges; Inner loops off: its outer loop only); Select chain: an edge brings the rest of its
  // face's loop. Each edge comes in projected onto the sketch plane: straight edges as lines (collinear pieces joined),
  // circular ones as true circles / arcs when they lie square to the sketch, held by On Edge relations.
  function edgeList(items, v) {
    var out = [];
    function add(e) { if (out.indexOf(e) < 0) out.push(e); }
    var pl = UI.activePlane();
    items.forEach(function (it) {
      if (it.kind === 'face') { faceLoops(it.index).forEach(function (loop, k) { if (k === 0 || v.inner) loop.forEach(add); }); return; }
      if (!v.chain) { if (it.edge.curve != null && App.curves && App.curves[it.edge.curve]) App.curves[it.edge.curve].edges.forEach(add); else add(it.edge); return; }
      // the loop of the face most nearly in the sketch plane that holds the edge
      var best = null, bd = -1;
      it.edge.faces.forEach(function (fi) { var fc = App.mesh.faces[fi], d = fc && fc.normal ? Math.abs(K.vec.dot(fc.normal, pl.n)) : 0; if (d > bd) { bd = d; best = fi; } });
      var loops = best != null ? faceLoops(best) : [];
      var loop = loops.filter(function (l) { return l.indexOf(it.edge) >= 0; })[0];
      (loop || [it.edge]).forEach(add);
    });
    return out;
  }
  // the boundary edges of face fi grouped into loops, the outer (largest) first
  function faceLoops(fi) {
    var edges = (App.edges || []).filter(function (e) { return !e.smooth && e.faces.indexOf(fi) >= 0; }), loops = [], used = [];
    edges.forEach(function (e0) {
      if (used.indexOf(e0) >= 0) return;
      var loop = [], stack = [e0];
      while (stack.length) {
        var e = stack.pop();
        if (used.indexOf(e) >= 0) continue;
        used.push(e); loop.push(e);
        edges.forEach(function (o) { if (used.indexOf(o) < 0 && (o.ka === e.ka || o.ka === e.kb || o.kb === e.ka || o.kb === e.kb)) stack.push(o); });
      }
      loops.push(loop);
    });
    function size(l) { var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; l.forEach(function (e) { [e.a, e.b].forEach(function (p) { for (var k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } }); }); return Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]); }
    return loops.sort(function (a, b) { return size(b) - size(a); });
  }
  // sketch entities for model edges: one circle / arc per true curve that lies square to the sketch, else lines
  function convertGeometry(edges) {
    var pl = UI.activePlane(), V = K.vec, out = [], seenCurve = {};
    function r6(x) { return Math.round(x * 1e6) / 1e6; }
    function p2(p) { var q = K.to2D(pl, p); return [r6(q[0]), r6(q[1])]; }
    edges.forEach(function (e) {
      var c = e.curve != null && App.curves ? App.curves[e.curve] : null;
      if (c && c.curve && Math.abs(Math.abs(V.dot(c.curve.normal, pl.n)) - 1) < 1e-6) {
        if (seenCurve[e.curve]) return;
        seenCurve[e.curve] = true;
        var C = c.curve, yd = V.cross(C.normal, C.xdir), at = function (a) { return V.add(C.center, V.add(V.scale(C.xdir, Math.cos(a) * C.radius), V.scale(yd, Math.sin(a) * C.radius))); };
        var cen = p2(C.center), sweep = C.a1 - C.a0;
        if (sweep >= 2 * Math.PI - 1e-6) { out.push({ t: 'circle', cx: cen[0], cy: cen[1], r: r6(C.radius) }); return; }
        var s0 = p2(at(C.a0)), s1 = p2(at(C.a1)), b0 = Math.atan2(s0[1] - cen[1], s0[0] - cen[0]) * 180 / Math.PI, b1 = Math.atan2(s1[1] - cen[1], s1[0] - cen[0]) * 180 / Math.PI;
        var sw = sweep * 180 / Math.PI, a0 = V.dot(C.normal, pl.n) > 0 ? b0 : b1;
        while (a0 < 0) a0 += 360;
        while (a0 >= 360) a0 -= 360;
        out.push({ t: 'arc', cx: cen[0], cy: cen[1], r: r6(C.radius), a0: r6(a0), a1: r6(a0 + sw) });
        return;
      }
      var a = p2(e.a), b = p2(e.b);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) return;   // square to the sketch: a point, nothing to draw
      out.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    });
    // collinear pieces of one straight edge (a face outline split it) join into one line
    for (var again = true; again;) {
      again = false;
      for (var i = 0; i < out.length && !again; i++) for (var j = i + 1; j < out.length && !again; j++) {
        var L = out[i], M = out[j];
        if (L.t !== 'line' || M.t !== 'line') continue;
        var ends = [[L.x1, L.y1], [L.x2, L.y2]], mends = [[M.x1, M.y1], [M.x2, M.y2]];
        for (var p = 0; p < 2 && !again; p++) for (var q = 0; q < 2 && !again; q++) {
          if (Math.hypot(ends[p][0] - mends[q][0], ends[p][1] - mends[q][1]) > 1e-6) continue;
          var u = [ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]], w = [mends[1][0] - mends[0][0], mends[1][1] - mends[0][1]];
          if (Math.abs(u[0] * w[1] - u[1] * w[0]) > 1e-9 * Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1])) continue;
          var A = ends[1 - p], B = mends[1 - q];
          out[i] = { t: 'line', x1: A[0], y1: A[1], x2: B[0], y2: B[1] };
          out.splice(j, 1);
          again = true;
        }
      }
    }
    return out;
  }
  function cmdConvertEntities() {
    var f = sketch();
    if (!f) return;
    var v = { items: [], chain: false, inner: true };
    function itemLabel(it, k) { return it.kind === 'face' ? 'Face<' + (k + 1) + '>' : 'Edge<' + (k + 1) + '>'; }
    function same(a, b) { return a.kind === b.kind && (a.kind === 'face' ? a.index === b.index : a.edge === b.edge); }
    function pick(mx, my) { var ed = UI.pickEdge ? UI.pickEdge(mx, my) : null; if (ed && ed.edge) return { kind: 'edge', edge: ed.edge }; var fc = UI.pickFace ? UI.pickFace(mx, my) : null; return fc && fc.index != null ? { kind: 'face', index: fc.index } : null; }
    function preview() {
      UI.sketchFeedbackClear();
      try { App.tempEntities = v.items.length ? convertGeometry(edgeList(v.items, v)) : []; } catch (e) { App.tempEntities = []; }
      UI.updateTemp();
    }
    UI.openPM({
      title: 'Convert Entities', icon: 'convert', values: v,
      message: 'Select model edges, loops or faces to convert into the sketch.',
      command: {
        ownHover: true,
        onSketchMove: function (uv, mx, my) {
          UI.sketchFeedbackClear();
          var it = App.edges ? pick(mx, my) : null;
          if (!it) return;
          try { UI.sketchPreview(convertGeometry(edgeList([it], v)).map(function (e) { return entPts(e)[0]; }), HOT_STYLE, 'sk-trim-span'); } catch (e) { }
        },
        onSketchPoint: function (uv, mx, my) {
          var it = App.edges ? pick(mx, my) : null;
          if (!it) { UI.setStatus('Click a model edge or face.'); return; }
          var k = -1;
          v.items.forEach(function (x, i) { if (same(x, it)) k = i; });
          if (k >= 0) v.items.splice(k, 1); else v.items.push(it);
          UI.renderPM(); preview();
        }
      },
      groups: [{ title: 'Entities to Convert', fields: [
        { type: 'pick', icon: 'convert', placeholder: 'Select edges, loops or faces…', value: function (x) { return x.items.length ? x.items.length + ' item' + (x.items.length > 1 ? 's' : '') : ''; },
          items: function (x) { return x.items.map(function (it, k) { return { label: itemLabel(it, k) }; }); },
          onRemove: function (x, i) { x.items.splice(i, 1); UI.renderPM(); preview(); }, onClear: function (x) { x.items.length = 0; UI.renderPM(); preview(); } },
        { type: 'check', label: 'Select chain', key: 'chain' },
        { type: 'check', label: 'Inner loops', key: 'inner' }
      ] }],
      onChange: preview,
      okBlocked: function () { return v.items.length ? '' : 'Select the model edges or faces to convert.'; },
      onOK: function () {
        var geo = convertGeometry(edgeList(v.items, v)), n = 0;
        var r = step(function () {
          geo.forEach(function (g) {
            var keys = S.paramNames(g);
            var dup = f.entities.some(function (o) { return o.t === g.t && keys.every(function (k) { return Math.abs((+o[k] || 0) - g[k]) < 1e-6 * Math.max(1, Math.abs(g[k])); }); });
            if (dup) return;
            f.entities.push(g);
            var ar = S.addRelation(f, 'onEdge', [String(f.entities.length - 1)]);
            if (!ar.ok) throw new Error(ar.error);
            n++;
          });
          return n ? { ok: true } : { ok: false, error: 'Those edges are already in the sketch.' };
        }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        UI.setStatus('Converted ' + n + ' entit' + (n === 1 ? 'y' : 'ies') + ' (On Edge).');
      },
      onCancel: clearPreview
    });
    if (!App.edges || !App.edges.length) UI.setStatus('There is no model to convert yet: Convert Entities projects model edges into the sketch.');
  }

  // ------------------------------------------------------------------ Move / Copy / Rotate / Scale / Stretch Entities
  // SolidWorks: Sketch tab ▸ Move Entities flyout. Entities to Move (Copy, Rotate, Scale, Stretch): the selection plus
  // what is clicked while the box is active; Keep relations (Move, Copy, Rotate). Parameters: From/To (click the Start
  // point box, then the base point and the point it goes to: the second click finishes) or X/Y (ΔX, ΔY, Repeat);
  // Rotate: Center of rotation and Angle; Scale: Scale about, Scale Factor, Copy with Number of copies. Stretch moves
  // the selection and stretches what is joined to it.
  var XF = {
    move: { title: 'Move', icon: 'moveEnt', box: 'Entities to Move' }, copy: { title: 'Copy', icon: 'copyEnt', box: 'Entities to Copy' },
    rotate: { title: 'Rotate', icon: 'rotateEnt', box: 'Entities to Rotate' }, scale: { title: 'Scale', icon: 'scaleEnt', box: 'Entities to Scale' },
    stretch: { title: 'Stretch', icon: 'stretchEnt', box: 'Entities to Stretch' }
  };
  function transformTool(kind) {
    var f = sketch();
    if (!f) return;
    var K0 = XF[kind], linear = kind === 'move' || kind === 'copy' || kind === 'stretch';
    var v = { entities: selIdx(f), keep: false, mode: 'fromto', dx: 0, dy: 0, angle: 0, scale: 1, copy: true, count: 1, repeat: 1, base: null, to: null, box: 'entities' };
    var cmd = { ownHover: false };
    function xf(to) {
      if (linear) {
        if (v.mode === 'xy') return { dx: +v.dx || 0, dy: +v.dy || 0 };
        var t = to || v.to;
        return v.base && t ? { dx: t[0] - v.base[0], dy: t[1] - v.base[1] } : null;
      }
      if (!v.base) return null;
      return kind === 'rotate' ? { rot: +v.angle || 0, cx: v.base[0], cy: v.base[1] } : { s: +v.scale, cx: v.base[0], cy: v.base[1] };
    }
    function times() { return linear && v.mode === 'xy' ? Math.max(1, v.repeat | 0) : 1; }
    function isCopy() { return kind === 'copy' || (kind === 'scale' && v.copy); }
    function nCopies() { return kind === 'scale' ? Math.max(1, v.count | 0) : times(); }
    function previewWith(x) {
      var out = [];
      if (x && v.entities.length) {
        var nn = isCopy() ? nCopies() : 1;
        for (var c = 1; c <= nn; c++) {
          var xk = isCopy() ? power(x, c) : power(x, times());
          v.entities.forEach(function (i) { var o = f.entities[i] && S.xfEntity(f.entities[i], xk); if (!o && f.entities[i] && (f.entities[i].t === 'rect' || f.entities[i].t === 'crect')) { o = { t: 'polyline', pts: K.entityPolylines(f.entities[i])[0].pts.map(function (p) { return rotPt(p, xk); }), closed: true }; } if (o) out.push(o); });
        }
      }
      App.tempEntities = out; UI.updateTemp();
    }
    function rotPt(p, x) { var a = x.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = p[0] - x.cx, dy = p[1] - x.cy; return [x.cx + c * dx - s * dy, x.cy + s * dx + c * dy]; }
    function power(x, n) { if (x.rot != null) return { rot: x.rot * n, cx: x.cx, cy: x.cy }; if (x.s != null) return { s: Math.pow(x.s, n), cx: x.cx, cy: x.cy }; return { dx: x.dx * n, dy: x.dy * n }; }
    function preview() { previewWith(xf()); }
    function setBox(b) {
      v.box = b;
      cmd.onSketchPoint = b === 'base' || b === 'to' ? pointClick : null;
      cmd.onSketchMove = b === 'to' ? function (uv, mx, my) { previewWith(xf(snapPoint(f, uv, mx, my))); } : null;
      UI.renderPM();
      UI.setStatus(b === 'base' ? (linear ? 'Click the start point.' : kind === 'rotate' ? 'Click the center of rotation.' : 'Click the point to scale about.') : b === 'to' ? 'Click where the start point goes.' : 'Click sketch entities to add them (click again to remove).');
    }
    function pointClick(uv, mx, my) {
      var p = snapPoint(f, uv, mx, my);
      if (v.box === 'base') {
        v.base = p;
        if (linear && v.mode === 'fromto') { setBox('to'); return; }
        setBox('entities'); preview();
        return;
      }
      v.to = p;
      UI.pmOK();
    }
    function apply() {
      var x = xf();
      if (!x) { UI.toast(linear ? 'Click the start point and where it goes, or set ΔX / ΔY.' : 'Click the ' + (kind === 'rotate' ? 'center of rotation.' : 'point to scale about.')); return false; }
      var o = { keepRelations: kind === 'stretch' ? true : !!v.keep };
      if (isCopy()) { o.copy = true; o.count = nCopies(); }
      else if (times() > 1) x = power(x, times());
      var r = step(function () { return S.transformEntities(f, v.entities, x, o); }, true);
      if (!r.ok) { UI.toast(r.error); if (v.box === 'to') { v.to = null; } return false; }
      clearPreview(); changed();
      UI.setStatus((isCopy() ? 'Copied: ' + r.added.length : K0.title.replace(/e$/, '') + 'ed ' + r.entities.length) + ' entit' + ((isCopy() ? r.added.length : r.entities.length) === 1 ? 'y' : 'ies') + '.');
      return true;
    }
    var params = [];
    if (linear) params.push(
      { type: 'radio', key: 'mode', options: [['fromto', 'From/To'], ['xy', 'X/Y']], rerender: true },
      { type: 'pick', icon: 'point', placeholder: 'Start point', value: function (x) { return x.base ? 'Base defined ' + fmtPt(x.base) : ''; }, show: function (x) { return x.mode === 'fromto'; }, active: function (x) { return x.box === 'base' || x.box === 'to'; }, onActivate: function () { v.base = null; v.to = null; setBox('base'); } },
      { type: 'number', label: 'ΔX', key: 'dx', unit: 'u', show: function (x) { return x.mode === 'xy'; } },
      { type: 'number', label: 'ΔY', key: 'dy', unit: 'u', show: function (x) { return x.mode === 'xy'; } },
      { type: 'buttons', show: function (x) { return x.mode === 'xy'; }, buttons: [{ label: 'Repeat', onclick: function () { v.repeat = Math.max(1, v.repeat | 0) + 1; UI.renderPM(); preview(); UI.setStatus('Repeat: ' + v.repeat + ' × (ΔX, ΔY).'); } }] });
    else params.push({ type: 'pick', icon: 'point', placeholder: kind === 'rotate' ? 'Center of rotation' : 'Scale about', value: function (x) { return x.base ? 'Base defined ' + fmtPt(x.base) : ''; }, active: function (x) { return x.box === 'base'; }, onActivate: function () { setBox('base'); } });
    if (kind === 'rotate') params.push({ type: 'number', label: 'Angle', key: 'angle', unit: '°' });
    if (kind === 'scale') params.push({ type: 'number', label: 'Scale Factor', key: 'scale', min: 0, spin: 0.1 }, { type: 'check', label: 'Copy', key: 'copy', rerender: true }, { type: 'number', label: 'Number of copies', key: 'count', step: 1, min: 1, show: function (x) { return x.copy; } });
    var boxFields = [entityBox(f, v, K0.icon, preview, { box: setBox, placeholder: 'Sketch items or annotations' })];
    if (kind !== 'scale' && kind !== 'stretch') boxFields.push({ type: 'check', label: 'Keep relations', key: 'keep' });
    UI.openPM({
      title: K0.title, icon: K0.icon, values: v,
      message: kind === 'stretch' ? 'Select the entities to stretch: they move, and what is joined to them stretches.' : 'Select the sketch entities, then set where they go.',
      command: cmd,
      onSelection: syncSelection(f, v, preview),
      onEntityPick: function () { return v.box !== 'entities'; },
      groups: [{ title: K0.box, fields: boxFields }, { title: 'Parameters', fields: params }],
      onChange: function (x, key) { if (key === 'mode') { v.base = null; v.to = null; v.repeat = 1; if (v.box !== 'entities') setBox('entities'); } preview(); },
      okBlocked: function () { return !v.entities.length ? 'Select the entities first.' : !xf() && !(linear && v.mode === 'fromto' && v.base) ? (linear ? 'Click the start point, or use X/Y.' : kind === 'rotate' ? 'Click the center of rotation.' : 'Click the point to scale about.') : ''; },
      onOK: function () { return apply(); },
      onCancel: clearPreview,
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    if (!v.entities.length) UI.setStatus('Select the sketch entities in the graphics area.');
    else if (linear && v.mode === 'fromto') setBox('base');
    else if (!linear) setBox('base');
    preview();
  }

  // ------------------------------------------------------------------ Linear / Circular Sketch Pattern
  // SolidWorks: Sketch tab ▸ Linear Sketch Pattern (flyout: Circular Sketch Pattern). Entities to Pattern holds the
  // sketch selection when the command starts plus whatever is clicked while it is open (nothing selected: nothing is
  // patterned); Instances to Skip: click its box, then the instances (dots in the preview) to leave out. The copies stay
  // tied to their seeds (one Pattern relation), so editing the seed or a spacing dimension moves the whole pattern.
  function anchorPt(e) { var r = S.anchorRef(e, 0); return r ? S.refPoint({ entities: [e] }, r) : null; }
  function skipBox(v, onChange, setBox) {
    return { type: 'pick', icon: 'sketchPattern', placeholder: 'Click instances to skip…', value: function (x) { return x.skip.length ? x.skip.length + ' instance' + (x.skip.length > 1 ? 's' : '') : ''; },
      active: function (x) { return x.box === 'skip'; }, onActivate: function () { setBox(v.box === 'skip' ? 'entities' : 'skip'); },
      items: function (x) { return x.skip.map(function (k) { return { label: '(' + k.split(',').map(function (n) { return +n + 1; }).join(', ') + ')' }; }); },
      onRemove: function (x, i) { x.skip.splice(i, 1); UI.renderPM(); onChange(); }, onClear: function (x) { x.skip.length = 0; UI.renderPM(); onChange(); } };
  }
  function patternTool(circular) {
    var f = sketch();
    if (!f) return;
    if (!f.entities.length) { UI.toast('Draw something to pattern first.'); return; }
    var v = circular ? { entities: selIdx(f), rev: false, cx: 0, cy: 0, angle: 360, equal: true, dimRadius: true, dimAngle: true, count: 4, radius: 0, arcAngle: 0, skip: [], box: 'entities' }
      : { entities: selIdx(f), ref1: 'x', rev1: false, spacing: UI.lenDefault(20), dims: true, count: 3, angle: 0, ref2: 'y', rev2: false, spacing2: UI.lenDefault(20), dimY: false, count2: 1, angle2: 90, dimAngle: false, skip: [], box: 'entities' };
    var cmd = {};
    function seedPt() { var e = v.entities.length ? f.entities[v.entities[0]] : null; return e ? anchorPt(e) : null; }
    // circular: Radius / Arc angle are the seed's place round the centre
    function syncPolar() { var p = seedPt(); if (!p) return; v.radius = Math.round(Math.hypot(p[0] - v.cx, p[1] - v.cy) * 1e6) / 1e6; v.arcAngle = Math.round(Math.atan2(p[1] - v.cy, p[0] - v.cx) * 180 / Math.PI * 1e6) / 1e6; }
    function linSpec() { return { angle1: +v.angle + (v.rev1 ? 180 : 0), spacing1: +v.spacing, count1: v.count | 0, angle2: +v.angle2 + (v.rev2 ? 180 : 0), spacing2: +v.spacing2, count2: v.count2 | 0, skip: v.skip.slice(), dimX: !!v.dims, dimY: !!v.dimY, dimAngle: !!v.dimAngle }; }
    function circSpec() { return { cx: +v.cx, cy: +v.cy, count: v.count | 0, angle: (v.rev ? -1 : 1) * +v.angle, equal: !!v.equal, skip: v.skip.map(Number), dimRadius: !!v.dimRadius, dimAngle: !!v.dimAngle }; }
    // the instances and how far each moves: [{ key, xf }]
    function instances() {
      var out = [];
      if (circular) {
        var n = v.count | 0, tot = (v.rev ? -1 : 1) * +v.angle, st = !v.equal ? tot : Math.abs(tot) >= 360 - 1e-9 ? tot / n : tot / Math.max(1, n - 1);
        for (var k = 1; k < n; k++) out.push({ key: String(k), xf: { rot: k * st, cx: +v.cx, cy: +v.cy } });
        return out;
      }
      var s = linSpec(), a1 = s.angle1 * Math.PI / 180, a2 = s.angle2 * Math.PI / 180, n1 = Math.max(1, s.count1), n2 = Math.max(1, s.count2);
      for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) {
        if (!i && !j) continue;
        out.push({ key: i + ',' + j, xf: { dx: i * s.spacing1 * Math.cos(a1) + j * s.spacing2 * Math.cos(a2), dy: i * s.spacing1 * Math.sin(a1) + j * s.spacing2 * Math.sin(a2) } });
      }
      return out;
    }
    function preview() {
      var out = [];
      if (v.entities.length) instances().forEach(function (q) {
        if (v.skip.indexOf(q.key) >= 0) return;
        v.entities.forEach(function (i) { var e = f.entities[i], o = e && S.xfEntity(e, q.xf); if (!o && e && (e.t === 'rect' || e.t === 'crect')) o = { t: 'polyline', pts: K.entityPolylines(e)[0].pts.map(function (p) { var x = q.xf, a = x.rot * Math.PI / 180, dx = p[0] - x.cx, dy = p[1] - x.cy; return [x.cx + Math.cos(a) * dx - Math.sin(a) * dy, x.cy + Math.sin(a) * dx + Math.cos(a) * dy]; }), closed: true }; if (o) out.push(o); });
      });
      App.tempEntities = out; UI.updateTemp();
      UI.sketchFeedbackClear();
      // in the Instances to Skip box every instance shows a dot (an orange ring when skipped)
      var p0 = seedPt();
      if (v.box === 'skip' && p0) instances().forEach(function (q) {
        var at = S.xfEntity({ t: 'point', x: p0[0], y: p0[1] }, q.xf);
        UI.sketchPreview([ring([at.x, at.y], v.skip.indexOf(q.key) >= 0 ? 7 : 3)], v.skip.indexOf(q.key) >= 0 ? HOT_STYLE : PICK_STYLE, 'sk-skip');
      });
    }
    function setBox(b) {
      v.box = b;
      cmd.onSketchPoint = b === 'skip' ? skipClick : b === 'dir1' || b === 'dir2' ? dirClick : null;
      UI.renderPM(); preview();
      UI.setStatus(b === 'skip' ? 'Click the instances to skip (click again to keep).' : b === 'dir1' || b === 'dir2' ? 'Click a line for the direction, or the box again for the sketch axis.' : 'Click sketch entities to add them to Entities to Pattern (click again to remove).');
    }
    function skipClick(uv, mx, my) {
      var p0 = seedPt(), best = null, bd = 15;
      if (!p0) return;
      instances().forEach(function (q) { var at = S.xfEntity({ t: 'point', x: p0[0], y: p0[1] }, q.xf), s = scr([at.x, at.y]), d = Math.hypot(s[0] - mx, s[1] - my); if (d < bd) { bd = d; best = q.key; } });
      if (best == null) { UI.setStatus('Click an instance (its dot) to skip it.'); return; }
      var k = v.skip.indexOf(best);
      if (k >= 0) v.skip.splice(k, 1); else v.skip.push(best);
      UI.renderPM(); preview();
    }
    // a line clicked for Direction 1 / 2: the direction runs along it
    function dirClick(uv, mx, my) {
      var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
      if (!e || e.t !== 'line') { UI.setStatus('Click a line for the direction.'); return; }
      var a = Math.round(Math.atan2(e.y2 - e.y1, e.x2 - e.x1) * 180 / Math.PI * 1e6) / 1e6;
      if (v.box === 'dir1') { v.ref1 = String(hit.index); v.angle = a; } else { v.ref2 = String(hit.index); v.angle2 = a; }
      setBox('entities');
    }
    function refLabel(r) { return r === 'x' ? 'X-axis' : r === 'y' ? 'Y-axis' : 'Line' + (+r + 1); }
    function dirBox(n) {
      return { type: 'pick', icon: 'centerline', value: function (x) { return refLabel(n === 1 ? x.ref1 : x.ref2); }, active: function (x) { return x.box === 'dir' + n; },
        onActivate: function () { if (v.box === 'dir' + n) { if (n === 1) { v.ref1 = 'x'; v.angle = 0; } else { v.ref2 = 'y'; v.angle2 = 90; } setBox('entities'); } else setBox('dir' + n); } };
    }
    var groups;
    if (circular) groups = [
      { title: 'Parameters', fields: [
        { type: 'check', label: 'Reverse direction', key: 'rev' },
        { type: 'number', label: 'Center X', key: 'cx', unit: 'u' }, { type: 'number', label: 'Center Y', key: 'cy', unit: 'u' },
        { type: 'number', label: 'Spacing', key: 'angle', unit: '°' },
        { type: 'check', label: 'Equal spacing', key: 'equal' },
        { type: 'check', label: 'Dimension radius', key: 'dimRadius' },
        { type: 'check', label: 'Dimension angular spacing', key: 'dimAngle' },
        { type: 'number', label: 'Number of instances', key: 'count', step: 1, min: 2 },
        { type: 'number', label: 'Radius', key: 'radius', unit: 'u', min: 0 },
        { type: 'number', label: 'Arc angle', key: 'arcAngle', unit: '°' }
      ] },
      { title: 'Entities to Pattern', fields: [entityBox(f, v, 'cSketchPattern', preview, { box: setBox })] },
      { title: 'Instances to Skip', collapsed: true, fields: [skipBox(v, preview, setBox)] }
    ];
    else groups = [
      { title: 'Direction 1', fields: [dirBox(1), { type: 'check', label: 'Reverse direction', key: 'rev1' },
        { type: 'number', label: 'Spacing', key: 'spacing', unit: 'u' }, { type: 'check', label: 'Dimension X spacing', key: 'dims' },
        { type: 'number', label: 'Number of instances', key: 'count', step: 1, min: 1 }, { type: 'number', label: 'Angle', key: 'angle', unit: '°' }] },
      { title: 'Direction 2', fields: [dirBox(2), { type: 'check', label: 'Reverse direction', key: 'rev2' },
        { type: 'number', label: 'Spacing', key: 'spacing2', unit: 'u' }, { type: 'check', label: 'Dimension Y spacing', key: 'dimY' },
        { type: 'number', label: 'Number of instances', key: 'count2', step: 1, min: 1 }, { type: 'number', label: 'Angle', key: 'angle2', unit: '°' },
        { type: 'check', label: 'Dimension angle between axes', key: 'dimAngle' }] },
      { title: 'Entities to Pattern', fields: [entityBox(f, v, 'sketchPattern', preview, { box: setBox })] },
      { title: 'Instances to Skip', collapsed: true, fields: [skipBox(v, preview, setBox)] }
    ];
    var sync = syncSelection(f, v, function () { if (circular) syncPolar(); UI.renderPM(); preview(); });
    UI.openPM({
      title: circular ? 'Circular Pattern' : 'Linear Pattern', icon: circular ? 'cSketchPattern' : 'sketchPattern', values: v,
      command: cmd,
      onSelection: sync,
      onEntityPick: function () { return v.box !== 'entities'; },
      groups: groups,
      onChange: function (x, key) {
        if (circular && (key === 'radius' || key === 'arcAngle')) {
          // Radius / Arc angle move the centre (the seed stays)
          var p = seedPt();
          if (p) { var a = +v.arcAngle * Math.PI / 180; v.cx = Math.round((p[0] - +v.radius * Math.cos(a)) * 1e6) / 1e6; v.cy = Math.round((p[1] - +v.radius * Math.sin(a)) * 1e6) / 1e6; UI.renderPM(); }
        } else if (circular && (key === 'cx' || key === 'cy')) { syncPolar(); UI.renderPM(); }
        if (key === 'count' || key === 'count2') v.skip = v.skip.filter(function (k) { return instances().some(function (q) { return q.key === k; }); });
        preview();
      },
      okBlocked: function () { return v.entities.length ? '' : 'Select the entities to pattern first.'; },
      onOK: function () {
        if (!v.entities.length) { UI.toast('Select the entities to pattern first.'); return false; }
        var r = step(function () { return circular ? S.circularPattern(f, v.entities, circSpec()) : S.linearPattern(f, v.entities, linSpec()); }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        if (UI.setSelection) UI.setSelection([]);
        UI.setStatus('Added ' + r.copies.length + ' patterned entit' + (r.copies.length === 1 ? 'y' : 'ies') + '.');
      },
      onCancel: clearPreview,
      onClose: function () { App.tempEntities = []; UI.updateTemp(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); }
    });
    if (circular) { syncPolar(); UI.renderPM(); }
    if (!v.entities.length) UI.setStatus('Select the sketch entities to pattern in the graphics area.');
    preview();
  }
  function cmdSketchPattern() { patternTool(false); }
  function cmdCircularSketchPattern() { patternTool(true); }

  // ------------------------------------------------------------------ Intersection Curve (Convert Entities flyout)
  // SolidWorks: Sketch tab ▸ Convert Entities ▸ Intersection Curve. Selections: model faces (planar or curved) picked in
  // the graphics area (a click toggles; faces selected when the command starts come in too); ✓ adds sketch curves where
  // the sketch plane cuts them. The cut is taken from the face's mesh triangles (each triangle against the plane, the
  // pieces chained end to end); a planar face gives lines (collinear pieces joined), a cylinder or cone square to the
  // sketch, or a sphere, a true circle or arc (the analytic surface records the facets carry, as Convert Entities uses
  // App.curves), any other curved face a chain of lines. Like converted entities they are held by On Edge.
  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  // the faces a picked face stands for: every facet of its curved face (UI.faceGroup), a planar face alone
  function ixcGroup(fi) { var g = UI.faceGroup ? UI.faceGroup(fi) : [fi]; return g && g.length ? g.slice() : [fi]; }
  // the pieces of the faces' triangles in the sketch plane: [[a, b]] in sketch coordinates, each piece once
  function ixcSegments(group, pl) {
    var M = App.mesh, P = M.positions64 || M.positions, n = pl.n, o = pl.origin, out = [], seen = {};
    function key(p) { return Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6); }
    group.forEach(function (fi) {
      var fc = M.faces[fi];
      if (!fc) return;
      for (var t = fc.start; t < fc.start + fc.count; t++) {
        var v = [], d = [], big = 1, k;
        for (k = 0; k < 3; k++) {
          var b = (t * 3 + k) * 3, p = [P[b], P[b + 1], P[b + 2]];
          v.push(p); d.push((p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1] + (p[2] - o[2]) * n[2]);
          big = Math.max(big, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
        }
        var eps = 1e-9 * big, pts = [];
        for (k = 0; k < 3; k++) if (Math.abs(d[k]) <= eps) pts.push(v[k]);
        if (pts.length === 3) continue;   // the triangle lies in the plane: no curve
        for (k = 0; k < 3; k++) {
          var l = (k + 1) % 3;
          if ((d[k] > eps && d[l] < -eps) || (d[k] < -eps && d[l] > eps)) { var s = d[k] / (d[k] - d[l]); pts.push([v[k][0] + (v[l][0] - v[k][0]) * s, v[k][1] + (v[l][1] - v[k][1]) * s, v[k][2] + (v[l][2] - v[k][2]) * s]); }
        }
        if (pts.length !== 2) continue;   // touches the plane at a corner only
        var a = K.to2D(pl, pts[0]), c = K.to2D(pl, pts[1]);
        if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 1e-9 * big) continue;
        var ka = key(a), kc = key(c), kk = ka < kc ? ka + '|' + kc : kc + '|' + ka;
        if (seen[kk]) continue;   // an edge in the plane is in both triangles that share it
        seen[kk] = true;
        out.push([a, c]);
      }
    });
    return out;
  }
  // the pieces chained end to end: [{ pts, closed }] (open chains from their free ends first)
  function ixcChains(segs) {
    function key(p) { return Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5); }
    var adj = {}, used = [], chains = [];
    segs.forEach(function (s, i) { [0, 1].forEach(function (e) { var k = key(s[e]); (adj[k] = adj[k] || []).push({ i: i, e: e }); }); });
    function walk(i0, e0) {
      var pts = [segs[i0][e0], segs[i0][1 - e0]], cur = i0, end = 1 - e0;
      used[i0] = true;
      for (;;) {
        var nx = (adj[key(segs[cur][end])] || []).filter(function (a) { return !used[a.i]; })[0];
        if (!nx) break;
        used[nx.i] = true; cur = nx.i; end = 1 - nx.e;
        pts.push(segs[cur][end]);
      }
      var closed = pts.length > 3 && key(pts[0]) === key(pts[pts.length - 1]);
      if (closed) pts.pop();
      return { pts: pts, closed: closed };
    }
    segs.forEach(function (s, i) { [0, 1].forEach(function (e) { if (!used[i] && (adj[key(s[e])] || []).length === 1) chains.push(walk(i, e)); }); });
    segs.forEach(function (s, i) { if (!used[i]) chains.push(walk(i, 0)); });
    return chains;
  }
  // a chain with its collinear runs joined (the triangles of a planar face cut one straight line into pieces)
  function ixcSimplify(ch) {
    var p = ch.pts, n = p.length, out = [];
    function straight(a, b, c) {
      var u = [b[0] - a[0], b[1] - a[1]], w = [c[0] - b[0], c[1] - b[1]], lu = Math.hypot(u[0], u[1]), lw = Math.hypot(w[0], w[1]);
      return lu < 1e-9 || lw < 1e-9 || (Math.abs(u[0] * w[1] - u[1] * w[0]) <= 1e-7 * lu * lw && u[0] * w[0] + u[1] * w[1] > 0);
    }
    for (var i = 0; i < n; i++) {
      if (!ch.closed && (i === 0 || i === n - 1)) { out.push(p[i]); continue; }
      var prev = out.length ? out[out.length - 1] : p[(i - 1 + n) % n];
      if (!straight(prev, p[i], p[(i + 1) % n])) out.push(p[i]);
    }
    if (ch.closed) while (out.length > 3 && straight(out[out.length - 1], out[0], out[1])) out.shift();
    return { pts: out, closed: ch.closed };
  }
  // the circle a curved face's surface makes in the sketch plane: { c: [u, v], r } or null (not a circle there)
  function ixcCircle(group, pl) {
    var fc = App.mesh.faces[group[0]], p0 = fc && fc.polys && fc.polys[0], S0 = p0 && p0.surf && p0.surf.s, V = K.vec;
    if (!S0 || !S0.o || !S0.d) return null;
    var n = pl.n, c3, R;
    if (S0.t === 'cyl' || S0.t === 'cone') {
      var dn = V.dot(S0.d, n);
      if (Math.abs(Math.abs(dn) - 1) > 1e-9) return null;   // the axis is not square to the sketch
      var z = V.dot(V.sub(pl.origin, S0.o), n) / dn;
      c3 = V.add(S0.o, V.scale(S0.d, z)); R = S0.r + (S0.t === 'cone' ? (S0.k || 0) * z : 0);
    } else if (S0.t === 'sph') {
      var h = V.dot(V.sub(S0.o, pl.origin), n);
      if (!(S0.r > Math.abs(h))) return null;
      c3 = V.sub(S0.o, V.scale(n, h)); R = Math.sqrt(S0.r * S0.r - h * h);
    } else return null;
    return R > 1e-9 ? { c: K.to2D(pl, c3), r: R } : null;
  }
  // sketch entities where the sketch plane cuts the faces of one picked face: circles / arcs, else lines
  function ixcGeometry(fi) {
    var pl = UI.activePlane(), group = ixcGroup(fi), chains = ixcChains(ixcSegments(group, pl)), circ = chains.length ? ixcCircle(group, pl) : null, out = [];
    chains.forEach(function (ch) {
      if (circ && ch.pts.length >= 2) {
        var C = circ.c, R = circ.r, onIt = ch.pts.every(function (q) { return Math.abs(Math.hypot(q[0] - C[0], q[1] - C[1]) - R) <= 0.05 * R + 1e-6; });
        if (onIt) {
          if (ch.closed) { out.push({ t: 'circle', cx: r6(C[0]), cy: r6(C[1]), r: r6(R) }); return; }
          // an arc from the chain's first point to its last, the way the chain runs (stored counter-clockwise)
          var ang = function (q) { return Math.atan2(q[1] - C[1], q[0] - C[0]); }, sweep = 0;
          for (var k = 1; k < ch.pts.length; k++) { var dA = ang(ch.pts[k]) - ang(ch.pts[k - 1]); while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI; sweep += dA; }
          var a0 = (sweep >= 0 ? ang(ch.pts[0]) : ang(ch.pts[ch.pts.length - 1])) * 180 / Math.PI, sw = Math.abs(sweep) * 180 / Math.PI;
          if (sw >= 360 - 1e-6) { out.push({ t: 'circle', cx: r6(C[0]), cy: r6(C[1]), r: r6(R) }); return; }
          while (a0 < 0) a0 += 360;
          while (a0 >= 360) a0 -= 360;
          out.push({ t: 'arc', cx: r6(C[0]), cy: r6(C[1]), r: r6(R), a0: r6(a0), a1: r6(a0 + sw) });
          return;
        }
      }
      var s = ixcSimplify(ch), q = s.pts, m = s.closed ? q.length : q.length - 1;
      for (var i = 0; i < m; i++) {
        var a = q[i], b = q[(i + 1) % q.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) out.push({ t: 'line', x1: r6(a[0]), y1: r6(a[1]), x2: r6(b[0]), y2: r6(b[1]) });
      }
    });
    return out;
  }
  UI.intersectionCurveGeometry = function (faces) { var out = []; (faces || []).forEach(function (fi) { out = out.concat(ixcGeometry(fi)); }); return out; };
  UI.intersectionCurveOpen = function () { var sp = UI.pmSpec && UI.pmSpec(); return !!(sp && sp.intersectionCurve); };
  function cmdIntersectionCurve(faces) {
    var f = sketch();
    if (!f) return;
    if (!App.mesh || !App.mesh.faces || !App.mesh.faces.length) { UI.toast('There is no model yet: Intersection Curve cuts model faces with the sketch plane.'); return; }
    var v = { items: [] };   // picked faces: { index, group }
    function has(fi) { var k = -1; v.items.forEach(function (it, i) { if (it.group.indexOf(fi) >= 0) k = i; }); return k; }
    function addFace(fi) { if (fi == null || !App.mesh.faces[fi]) return; var k = has(fi); if (k >= 0) v.items.splice(k, 1); else v.items.push({ index: fi, group: ixcGroup(fi) }); }
    function geometry() { var out = []; v.items.forEach(function (it) { out = out.concat(ixcGeometry(it.index)); }); return out; }
    function preview() {
      var g = [];
      try { g = geometry(); } catch (e) { UI.setStatus(e.message); }
      App.tempEntities = g; UI.updateTemp();
      if (v.items.length && !g.length) UI.setStatus('The sketch plane does not cut the selected faces.');
    }
    // faces selected when the command starts (or passed in by a script) come in at once
    var pre = Array.isArray(faces) ? faces : (UI.selection ? UI.selection() : []).filter(function (s) { return s.kind === 'face'; }).map(function (s) { return s.index; });
    pre.forEach(function (fi) { if (has(fi) < 0) addFace(fi); });
    UI.openPM({
      title: 'Intersection Curve', icon: 'intersectCurve', values: v, intersectionCurve: true,
      message: 'Select faces to intersect with the sketch plane. The curves where the plane cuts them are added to the sketch.',
      command: {
        ownHover: true,
        onSketchMove: function (uv, mx, my) {
          UI.sketchFeedbackClear();
          var fc = UI.pickFace ? UI.pickFace(mx, my) : null;
          if (!fc || fc.index == null) return;
          try { UI.sketchPreview(ixcGeometry(fc.index).map(function (e) { return entPts(e)[0]; }), HOT_STYLE, 'sk-trim-span'); } catch (e) { }
        },
        onSketchPoint: function (uv, mx, my) {
          var fc = UI.pickFace ? UI.pickFace(mx, my) : null;
          if (!fc || fc.index == null) { UI.setStatus('Click a model face.'); return; }
          addFace(fc.index);
          UI.renderPM(); preview();
        }
      },
      groups: [{ title: 'Selections', fields: [
        { type: 'pick', icon: 'intersectCurve', placeholder: 'Select faces…', value: function (x) { return x.items.length ? x.items.length + ' face' + (x.items.length > 1 ? 's' : '') : ''; },
          items: function (x) { return x.items.map(function (it, k) { return { label: 'Face<' + (k + 1) + '>' }; }); },
          onRemove: function (x, i) { x.items.splice(i, 1); UI.renderPM(); preview(); }, onClear: function (x) { x.items.length = 0; UI.renderPM(); preview(); } }
      ] }],
      onChange: preview,
      okBlocked: function () { return v.items.length ? '' : 'Select the faces to intersect with the sketch plane.'; },
      onOK: function () {
        var geo = geometry(), n = 0;
        if (!geo.length) { UI.toast('The sketch plane does not cut the selected faces.'); return false; }
        var r = step(function () {
          geo.forEach(function (g) {
            var keys = S.paramNames(g);
            var dup = f.entities.some(function (o) { return o.t === g.t && keys.every(function (k) { return Math.abs((+o[k] || 0) - g[k]) < 1e-6 * Math.max(1, Math.abs(g[k])); }); });
            if (dup) return;
            f.entities.push(g);
            var ar = S.addRelation(f, 'onEdge', [String(f.entities.length - 1)]);
            if (!ar.ok) throw new Error(ar.error);
            n++;
          });
          return n ? { ok: true } : { ok: false, error: 'Those intersection curves are already in the sketch.' };
        }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        UI.setStatus('Intersection Curve: ' + n + ' entit' + (n === 1 ? 'y' : 'ies') + ' added where the sketch plane cuts the face' + (v.items.length === 1 ? '' : 's') + ' (On Edge).');
      },
      onCancel: clearPreview,
      onClose: function () { UI.sketchFeedbackClear(); }
    });
    preview();
    if (!v.items.length) UI.setStatus('Select model faces: the sketch plane cuts them in the curves added.');
  }

  // ------------------------------------------------------------------ Dynamic Mirror (Mirror Entities flyout)
  // SolidWorks: Tools ▸ Sketch Tools ▸ Dynamic Mirror. With a centerline (or any line) selected, the button turns it on:
  // the line shows "=" marks at its ends, and every entity drawn while it is on is mirrored about it — the mirror image
  // shows while drawing, and on placement both go into the sketch, the copy held Symmetric to its original as Mirror
  // Entities holds it (SketchSolver.mirrorRelations), in the same undo step. Nothing selected: the Mirror
  // PropertyManager asks for the line. Off: the button again, Esc with no tool (Esc twice while drawing), or leaving the
  // sketch. The drawing tools commit through ui-sketch.js placePoint / addEntity, which have no after-commit hook for
  // every tool, so this watches the sketch being redrawn (UI.updateSketches) and mirrors what a drawing tool added once
  // the click that added it is over (a microtask: the tool's own after() hooks, typed dimensions and the double-click
  // logic have run by then).
  var dyn = null;   // { sketch: id, axis: index, ax: [x1, y1, x2, y2], count, queued, last: { src, copies } }
  var DYN_TOOLS_OFF = { select: 1, dimension: 1 };
  function dynDrawing() { return App.mode === 'sketch' && !!App.tool && !DYN_TOOLS_OFF[App.tool] && !(App.command && App.command.onSketchPoint); }
  // the mirror line in sketch f: its index (it may have moved in the list), or -1 when it is gone
  function dynAxis(f) {
    if (!dyn || !f) return -1;
    var e = f.entities[dyn.axis];
    if (e && e.t === 'line') { dyn.ax = [e.x1, e.y1, e.x2, e.y2]; return dyn.axis; }
    for (var i = 0; i < f.entities.length; i++) {
      var o = f.entities[i];
      if (o && o.t === 'line' && Math.abs(o.x1 - dyn.ax[0]) < 1e-9 && Math.abs(o.y1 - dyn.ax[1]) < 1e-9 && Math.abs(o.x2 - dyn.ax[2]) < 1e-9 && Math.abs(o.y2 - dyn.ax[3]) < 1e-9) { dyn.axis = i; return i; }
    }
    return -1;
  }
  function tidy(e) { Object.keys(e).forEach(function (k) { if (typeof e[k] === 'number') e[k] = +e[k].toPrecision(12) + 0; }); if (e.pts) e.pts = e.pts.map(function (p) { return [+p[0].toPrecision(12) + 0, +p[1].toPrecision(12) + 0]; }); return e; }
  // e's mirror image is e itself (a line along the mirror line, a circle centred on it …)
  function selfMirror(e, m) {
    if (e.t !== m.t) return false;
    function near(a, b) { return Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b)); }
    if (e.t === 'line' && near(e.x1, m.x2) && near(e.y1, m.y2) && near(e.x2, m.x1) && near(e.y2, m.y1)) return true;
    if (e.pts || m.pts) return JSON.stringify(e.pts) === JSON.stringify(m.pts);
    return S.paramNames(e).every(function (k) { return typeof e[k] !== 'number' || near(e[k], m[k]); });
  }
  function dynMirrorOf(f, ai, list) {
    var ax = K.mirrorAxis(ai, f.entities), out = [];
    list.forEach(function (e) { var m = null; try { m = K.mirrorEntity(e, ax); } catch (x) { m = null; } out.push(m && !selfMirror(e, m) ? tidy(m) : null); });
    return out;
  }
  function dynOn(f, i) {
    var e = f.entities[i];
    dyn = { sketch: f.id, axis: i, ax: [e.x1, e.y1, e.x2, e.y2], count: f.entities.length, queued: false, last: null };
    dynMarksHook();
    UI.updateSketches(); UI.refreshRibbon();
    UI.setStatus('Dynamic Mirror on about ' + (e.construction ? 'Centerline' : 'Line') + (i + 1) + ': what you draw is mirrored about it. Click Dynamic Mirror again (or Esc with no tool) to turn it off.');
  }
  function dynOff(msg) {
    if (!dyn) return;
    dyn = null;
    if (App.tempEntities && App.tempEntities.length) UI.updateTemp();
    UI.updateSketches(); UI.refreshRibbon();
    if (msg) UI.setStatus(msg);
  }
  // after a redraw: entities a drawing tool just added are mirrored once its click is over; anything else that changed
  // the count (Undo, Delete, Redo, a command) is only noted
  function dynWatch() {
    if (!dyn) return;
    if (App.mode !== 'sketch' || App.activeSketch !== dyn.sketch) { dynOff(); return; }
    var f = UI.activeSketchFeature(), n = f ? f.entities.length : 0;
    if (!f || n === dyn.count) return;
    if (n > dyn.count && dynDrawing() && App.sketchDirty) {
      if (!dyn.queued) { dyn.queued = true; Promise.resolve().then(dynCommit); }
      return;
    }
    if (!dyn.queued) dyn.count = n;
  }
  function dynCommit() {
    if (!dyn) return;
    dyn.queued = false;
    var f = UI.activeSketchFeature();
    if (!f || f.id !== dyn.sketch) return;
    var n = f.entities.length;
    if (n <= dyn.count) { dyn.count = n; return; }
    var ai = dynAxis(f);
    if (ai < 0) { dyn.count = n; dynOff('Dynamic Mirror is off: its mirror line is gone.'); return; }
    var src = [], k;
    for (k = dyn.count; k < n; k++) if (k !== ai && f.entities[k]) src.push(k);
    var ms = dynMirrorOf(f, ai, src.map(function (i) { return f.entities[i]; })), pairs = [];
    src.forEach(function (i, j) { if (!ms[j]) return; f.entities.push(ms[j]); pairs.push([i, f.entities.length - 1]); });
    dyn.count = f.entities.length;
    if (!pairs.length) return;
    var nSym = 0;
    try { nSym = S.mirrorRelations(f, pairs, ai); } catch (x) { nSym = 0; }
    dyn.last = { src: pairs.map(function (p) { return p[0]; }), copies: pairs.map(function (p) { return p[1]; }) };
    App.gridStale = true; App.dimsStale = true;
    UI.updateSketches(); UI.refreshTree();
    UI.setStatus('Dynamic Mirror: ' + pairs.length + ' entit' + (pairs.length === 1 ? 'y' : 'ies') + ' mirrored' + (nSym ? ', held Symmetric about Line' + (ai + 1) : '') + '.');
  }
  // the "=" marks at the mirror line's ends (drawn with the sketch, through the sketch-regions hook of the redraw)
  var dynMat = null;
  function dynMarks(f, pl) {
    var ai = dynAxis(f);
    if (ai < 0 || typeof THREE === 'undefined') return [];
    var e = f.entities[ai], A = [e.x1, e.y1], B = [e.x2, e.y2], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1e-12) return [];
    var s = (UI.cam && UI.cam.scale) || 0.1, u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], nr = [-u[1], u[0]], half = 5 * s, pos = [];
    [[A, 1], [B, -1]].forEach(function (q) {
      [7, 11].forEach(function (px) {
        var c = [q[0][0] + u[0] * q[1] * Math.min(px * s, L / 3), q[0][1] + u[1] * q[1] * Math.min(px * s, L / 3)];
        pos.push.apply(pos, K.to3D(pl, c[0] - nr[0] * half, c[1] - nr[1] * half));
        pos.push.apply(pos, K.to3D(pl, c[0] + nr[0] * half, c[1] + nr[1] * half));
      });
    });
    if (!dynMat) dynMat = new THREE.LineBasicMaterial({ color: 0x1f8a3a, depthTest: false, transparent: true });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    var ls = new THREE.LineSegments(g, dynMat);
    ls.renderOrder = 12;
    ls.userData = { dynMirrorMarks: true };
    return [ls];
  }
  // (hooked when Dynamic Mirror is first turned on: ui-sketch-layers.js, which defines the hook, loads after this file)
  function dynMarksHook() {
    if (UI.sketchRegionObjects && UI.sketchRegionObjects._dyn) return;
    var base = UI.sketchRegionObjects;
    var hook = function (f, pl) {
      var out = base ? base.apply(this, arguments) || [] : [];
      if (dyn && f && f.id === dyn.sketch) { try { out = out.concat(dynMarks(f, pl)); } catch (x) { /* the marks are never worth a broken redraw */ } }
      return out;
    };
    hook._dyn = true;
    UI.sketchRegionObjects = hook;
  }
  if (UI.updateSketches && !UI.updateSketches._dyn) {
    var baseUpdateSketches = UI.updateSketches;
    UI.updateSketches = function () { var r = baseUpdateSketches.apply(this, arguments); if (dyn) { try { dynWatch(); } catch (x) { /* never break a redraw */ } } return r; };
    UI.updateSketches._dyn = true;
  }
  // the mirror image of the entity being drawn shows with it
  if (UI.updateTemp && !UI.updateTemp._dyn) {
    var baseUpdateTempDyn = UI.updateTemp;
    UI.updateTemp = function () {
      if (!dyn || !App.tempEntities || !App.tempEntities.length || !dynDrawing() || App.activeSketch !== dyn.sketch) return baseUpdateTempDyn.apply(this, arguments);
      var f = UI.activeSketchFeature(), ai = dynAxis(f);
      if (ai < 0) return baseUpdateTempDyn.apply(this, arguments);
      var saved = App.tempEntities;
      App.tempEntities = saved.concat(dynMirrorOf(f, ai, saved).filter(Boolean));
      try { return baseUpdateTempDyn.apply(this, arguments); } finally { App.tempEntities = saved; }
    };
    UI.updateTemp._dyn = true;
  }
  // Esc with no tool and no PropertyManager (the second Esc while drawing) turns it off
  document.addEventListener('keydown', function (ev) {
    if (!dyn || ev.key !== 'Escape' || App.mode !== 'sketch') return;
    var tag = (ev.target && ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (App.tool === 'select' && !(UI.hasPM && UI.hasPM())) dynOff('Dynamic Mirror off.');
  }, true);
  // A double-click ends a Line chain and ui-sketch.js takes back the stub its second click placed, when that stub is the
  // last entity: its mirror image (added after it) goes first, so the stub can go too.
  document.addEventListener('dblclick', function () {
    if (!dyn || !dyn.last || App.mode !== 'sketch' || App.tool !== 'line') return;
    var st = App.toolState, f = UI.activeSketchFeature(), L = dyn.last;
    if (!st || !st.lastSeg || !st.lastSeg.quick || !f || L.src.length !== 1 || L.src[0] !== st.lastSeg.index || L.copies[0] !== f.entities.length - 1 || st.lastSeg.index !== f.entities.length - 2) return;
    var e = f.entities[st.lastSeg.index], pl = UI.activePlane();
    if (!e || e.t !== 'line') return;
    var a = UI.worldToScreen(K.to3D(pl, e.x1, e.y1)), b = UI.worldToScreen(K.to3D(pl, e.x2, e.y2));
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) >= 6) return;
    var ci = f.entities.length - 1;
    f.entities.pop();
    S.removeEntity(f, ci);
    if (f.dims) f.dims = f.dims.filter(function (d) { return d.e !== ci; });
    dyn.count = f.entities.length; dyn.last = null;
  }, true);
  UI.dynamicMirrorOn = function () { return !!dyn && App.mode === 'sketch' && App.activeSketch === dyn.sketch; };
  UI.dynamicMirrorState = function () { return dyn ? { sketch: dyn.sketch, axis: dyn.axis, count: dyn.count } : null; };
  function cmdDynamicMirror() {
    if (dyn) { dynOff('Dynamic Mirror off.'); return; }
    var f = sketch();
    if (!f) return;
    var lines = selIdx(f).filter(function (i) { return f.entities[i].t === 'line'; });
    if (lines.length === 1) { dynOn(f, lines[0]); return; }
    // nothing (or more than one line) selected: the Mirror PropertyManager asks for the line to mirror about
    var v = { axis: null };
    UI.openPM({
      title: 'Mirror', icon: 'dynMirror', values: v,
      message: 'Select a centerline or a line to mirror about. Dynamic Mirror then mirrors every entity you draw about it.',
      onSelection: function () { },   // plain clicks come to this PM (UI.pmCollectsSelection), the line to onEntityPick
      onEntityPick: function (hit) {
        var e = f.entities[hit.index];
        if (!e || e.t !== 'line') { UI.setStatus('Dynamic Mirror needs a line or centerline to mirror about.'); return true; }
        v.axis = hit.index;
        UI.closePM();
        if (UI.setSelection) UI.setSelection([]);
        dynOn(UI.activeSketchFeature() || f, hit.index);
        return true;
      },
      groups: [{ title: 'Mirror about', fields: [{ type: 'pick', icon: 'centerline', placeholder: 'Select a line or centerline…', active: function () { return true; }, value: function () { return ''; } }] }],
      okBlocked: function () { return 'Select a line or centerline to mirror about.'; },
      onOK: function () { return false; }
    });
    UI.setStatus('Dynamic Mirror: click a centerline or a line to mirror about.');
  }

  UI.cmdSketchFillet = cmdSketchFillet; UI.cmdSketchChamfer = cmdSketchChamfer;
  UI.cmdOffsetEntities = cmdOffsetEntities; UI.cmdTrimEntities = cmdTrimEntities; UI.cmdExtendEntities = cmdExtendEntities;
  UI.cmdConvertEntities = cmdConvertEntities; UI.cmdIntersectionCurve = cmdIntersectionCurve; UI.cmdDynamicMirror = cmdDynamicMirror;
  UI.cmdSketchPattern = cmdSketchPattern; UI.cmdCircularSketchPattern = cmdCircularSketchPattern;
  UI.cmdMoveEntities = function () { transformTool('move'); }; UI.cmdCopyEntities = function () { transformTool('copy'); };
  UI.cmdRotateEntities = function () { transformTool('rotate'); }; UI.cmdScaleEntities = function () { transformTool('scale'); };
  UI.cmdStretchEntities = function () { transformTool('stretch'); };
})();
