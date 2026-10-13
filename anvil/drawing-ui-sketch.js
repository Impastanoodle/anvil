// drawing-ui-sketch.js — the drawing's Sketch tab (rfAO; only when `UI` exists): Line, Centerline, Rectangle, Circle,
// centre-point Arc, Spline, Point and Text drawn on the sheet or in a view (a first click inside a view puts the entity
// in that view, so it moves with it), with inference while drawing (an end snaps onto another entity's point and is
// held Coincident; a line within 4° of level or plumb is made Horizontal / Vertical), Add Relation (Horizontal,
// Vertical, Coincident), Smart Dimension on sketch lines / circles / arcs (driving: double-click a dimension to change
// it), selection (Ctrl adds), dragging an entity or one of its ends, Delete, double-click for an entity's properties;
// Line Format (style / thickness / colour of sketch entities and of view edges) and Hide / Show Edges; Relative View
// (View Layout and Insert ▸ Drawing View: the first face picked in a view looks at the viewer, the second points
// Right / Left / Top / Bottom). The engine is drawing-views.js (Drawing.addSketchEntity …); drawing-ui.js calls the
// DW.sk* hooks below before its own mouse handling.
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.App || typeof document === 'undefined' || !UI.drawingInternal || !UI.drawingInternal.D) return;
  var App = UI.App, $ = UI.$, DW = UI.drawingInternal, D = DW.D;
  function doc() { return DW.doc(); }
  function px(n) { return DW.pxToPaper(n); }
  function drawOverlay() { DW.drawOverlay(); }
  function units() { return DW.units(); }
  var TOOL_NAMES = { line: 'Line', centerline: 'Centerline', rect: 'Corner Rectangle', circle: 'Circle', arc: 'Centerpoint Arc', spline: 'Spline', point: 'Point', text: 'Text',
    coin: 'Coincident', hideedges: 'Hide/Show Edges', relpick: 'Relative View', relplace: 'Relative View' };
  var TOOL_MSG = {
    line: 'Line: click its start, then each next point (the lines chain; an end on another point is held Coincident, a near-level line is made Horizontal). Esc ends.',
    centerline: 'Centerline: click its start, then its end. Esc ends.',
    rect: 'Corner Rectangle: click one corner, then the opposite one.',
    circle: 'Circle: click the centre, then a point on the circle.',
    arc: 'Centerpoint Arc: click the centre, the start, then the end (counter-clockwise).',
    spline: 'Spline: click its points; click the last point again to finish. Esc cancels.',
    point: 'Point: click where it goes.',
    text: 'Text: click where the text starts.',
    coin: 'Coincident: click a point of a sketch entity, then the point it should meet.',
    hideedges: 'Hide/Show Edges: click a view edge to hide it; hidden edges show grey, click one to show it again. Esc ends.'
  };

  // ------------------------------------------------------------------ icons (rfAO)
  var SI = {
    relVertical: '<path d="M8 2 v12" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="2.5" r="1.4" fill="#6d6d6d"/><circle cx="8" cy="13.5" r="1.4" fill="#6d6d6d"/><text x="12.5" y="10" font-size="6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#6d6d6d">|</text>',
    lineFormat: '<path d="M2 3.5 h12" stroke="currentColor" stroke-width="0.8"/><path d="M2 7.5 h12" stroke="currentColor" stroke-width="1.6"/><path d="M2 11.5 h12" stroke="#6d6d6d" stroke-width="1.1" stroke-dasharray="2.4 1.2"/><path d="M2 14.5 h12" stroke="#e0553c" stroke-width="1" stroke-dasharray="4 1 1 1"/>',
    hideShowEdges: '<path d="M2.5 12.5 h11 M2.5 12.5 v-9 h11 v9" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5 9.5 h6" stroke="#a4a4a4" stroke-width="1" stroke-dasharray="1.6 1"/><path d="M3 2 l10 12" stroke="#e0553c" stroke-width="1.2"/>',
    relativeView: '<path d="M2 2.5 h12 v11 H2 z" fill="none" stroke="#6d6d6d" stroke-width="1" stroke-dasharray="2 1.2"/><path d="M4.5 9 l4 -3 4 2 -4 3 z" fill="#c4c4c4" stroke="currentColor" stroke-width="0.9"/><path d="M8.5 11 v-2.5" stroke="#e0553c" stroke-width="1.2"/><circle cx="8.5" cy="8" r="0.9" fill="#e0553c"/>'
  };
  var baseIcons = Icons;
  var wrappedIcons = function (name, size, cls) {
    if (!SI[name]) return baseIcons(name, size, cls);
    size = size || 32;
    return '<svg class="ico ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 16 16" aria-hidden="true">' + SI[name] + '</svg>';
  };
  wrappedIcons.has = function (name) { return !!SI[name] || (baseIcons.has ? baseIcons.has(name) : false); };
  Icons = wrappedIcons;   // eslint-disable-line no-global-assign

  // ------------------------------------------------------------------ hit testing
  function items() { return D.sheet && doc() ? Drawing.sketchItems(doc()) : []; }
  function segDist(p, a, b) { return DW.segDist(p, a, b); }
  function inBox(p, b, m) { return p[0] >= b.x0 - m && p[0] <= b.x1 + m && p[1] >= b.y0 - m && p[1] <= b.y1 + m; }
  function textBox(e) {
    var CAP = 0.72, ls = String(e.text).split(/\r?\n/), w = 0;
    ls.forEach(function (s) { w = Math.max(w, s.length * e.h * CAP * 0.78); });
    return { x0: e.p[0], x1: e.p[0] + Math.max(w, e.h), y0: e.p[1] - (ls.length - 1) * e.h * 1.5, y1: e.p[1] + e.h * CAP };
  }
  function angIn(a, a0, a1) { for (var j = -2; j <= 2; j++) if (a + 360 * j >= a0 - 1e-9 && a + 360 * j <= a1 + 1e-9) return true; return false; }
  function distTo(it, p) {
    var e = it.e;
    if (e.t === 'line') return segDist(p, e.a, e.b);
    if (e.t === 'circle') return Math.abs(Math.hypot(p[0] - e.c[0], p[1] - e.c[1]) - e.r);
    if (e.t === 'arc') return angIn(Math.atan2(p[1] - e.c[1], p[0] - e.c[0]) * 180 / Math.PI, e.a0, e.a1) ? Math.abs(Math.hypot(p[0] - e.c[0], p[1] - e.c[1]) - e.r) : Infinity;
    if (e.t === 'spline') { var sp = Drawing.sketchSpline(e.pts), d = Infinity; for (var i = 1; i < sp.length; i++) d = Math.min(d, segDist(p, sp[i - 1], sp[i])); return d; }
    if (e.t === 'point') return Math.hypot(p[0] - e.p[0], p[1] - e.p[1]);
    if (e.t === 'text') return inBox(p, textBox(e), px(2)) ? 0 : Infinity;
    if (e.t === 'dim') return inBox(p, it.dim.box, px(2)) ? 0 : Math.min.apply(null, it.dim.lines.map(function (l) { return segDist(p, l[0], l[1]); }).concat([Infinity]));
    return Infinity;
  }
  // hit(p, opts) -> { id, it, end } of the sketch item under p (an end within 7 px wins), or null
  function hit(p, opts) {
    opts = opts || {};
    var best = null, bd = px(6), te = px(7);
    items().forEach(function (it) {
      if (opts.noDims && it.t === 'dim') return;
      if (opts.view !== undefined && it.view !== opts.view) return;
      if (it.t !== 'dim' && !opts.noEnds) Drawing.sketchEnds(it.e).forEach(function (end) {
        if (it.e.t === 'text') return;
        var q = Drawing.sketchPoint(it.e, end), d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < te && d * 0.5 < bd) { bd = d * 0.5; best = { id: it.id, it: it, end: end, at: q }; }
      });
      var d = distTo(it, p);
      if (d < bd) { bd = d; best = { id: it.id, it: it, end: null }; }
    });
    return best;
  }
  function selIds() { return D.sel && D.sel.kind === 'sk' ? (D.sel.ids || [D.sel.id]) : []; }

  // ------------------------------------------------------------------ inference while drawing
  // snap(p, P) -> { p, ref?: { id, end }, rel?: 'H' | 'V' }: onto a sketch point of the same sketch (sheet or view)
  // within 8 px; with a start point, a line within 4° of level / plumb is levelled
  function snap(p, P, from) {
    var out = { p: p.slice() }, tol = px(8), bd = tol;
    items().forEach(function (it) {
      if (it.t === 'dim' || it.e.t === 'text' || (P && P.view !== undefined && it.view !== P.view)) return;
      Drawing.sketchEnds(it.e).forEach(function (end) {
        var q = Drawing.sketchPoint(it.e, end), d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < bd) { bd = d; out = { p: q, ref: { id: it.id, end: end } }; }
      });
    });
    if (!out.ref && from) {
      var dx = p[0] - from[0], dy = p[1] - from[1], ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
      if (Math.hypot(dx, dy) > px(4)) {
        if (ang < 4 || ang > 176) { out.p = [p[0], from[1]]; out.rel = 'H'; }
        else if (Math.abs(ang - 90) < 4) { out.p = [from[0], p[1]]; out.rel = 'V'; }
      }
    }
    return out;
  }
  function ownerAt(p) { var w = DW.viewAt(p); return w ? w.view.id : null; }

  // ------------------------------------------------------------------ tools
  function startTool(name) {
    if (!D.active) return;
    if (D.formatEdit && DW.setFormatEdit) DW.setFormatEdit(false);
    var t = 'sk:' + name;
    if (D.tool === t && name !== 'relpick') { endTool(); return; }
    D.tool = t; D.pending = { view: undefined, pts: [] }; D.hover = null;
    if (name !== 'relpick' && name !== 'relplace') D.sel = null;
    drawOverlay(); UI.refreshRibbon(); DW.renderTree();
    UI.setStatus(TOOL_MSG[name] || TOOL_NAMES[name]);
  }
  function endTool() { D.tool = null; D.pending = null; D.hover = null; drawOverlay(); UI.refreshRibbon(); UI.setStatus('Ready'); }
  function toolOn(name) { return D.tool === 'sk:' + name; }
  function edit(fn) { var r; DW.edit(function (dc) { r = fn(dc); }); return r; }
  function addEnt(spec, view, refs) {
    return edit(function (dc) {
      var e = Drawing.addSketchEntity(dc, spec, view);
      (refs || []).forEach(function (r) { if (r.ref) try { Drawing.addSketchRelation(dc, 'coincident', [{ id: e.id, end: r.end }, r.ref]); } catch (err) { } });
      return e;
    });
  }
  function toolClick(name, p, e) {
    var P = D.pending || (D.pending = { pts: [] });
    if (name === 'hideedges') { hideShowClick(p); return; }
    if (name === 'relpick') { relPick(p); return; }
    if (name === 'relplace') { relPlace(p); return; }
    if (name === 'coin') {
      var h = hit(p, { noDims: true });
      if (!h || !h.end) { UI.setStatus('Coincident: click an end point (or a centre) of a sketch entity.'); return; }
      if (!P.first) { P.first = { id: h.id, end: h.end }; P.view = h.it.view; drawOverlay(); UI.setStatus('Coincident: click the point it should meet.'); return; }
      if (h.id === P.first.id || h.it.view !== P.view) { UI.setStatus('Coincident: pick a point of another entity in the same sketch.'); return; }
      var a = P.first;
      try { edit(function (dc) { Drawing.addSketchRelation(dc, 'coincident', [{ id: h.id, end: h.end }, a]); }); UI.setStatus('Coincident added.'); }
      catch (err) { UI.toast(err.message); }
      endTool();
      return;
    }
    if (P.view === undefined) P.view = ownerAt(p);
    var s = snap(p, P, name === 'line' || name === 'centerline' ? P.last : null);
    if (name === 'point') { addEnt({ t: 'point', p: s.p }, P.view); D.pending = { pts: [] }; UI.setStatus('Point added. Click the next one, Esc ends.'); return; }
    if (name === 'text') {
      var at = s.p, vw = P.view;
      D.pending = { pts: [] };
      UI.promptDialog('Text', 'Text (\\n starts a new line):', '', function (txt) {
        if (!txt || !String(txt).trim()) return;
        var t = addEnt({ t: 'text', p: at, text: String(txt).replace(/\\n/g, '\n') }, vw);
        D.sel = { kind: 'sk', id: t.id, ids: [t.id] }; drawOverlay();
      });
      return;
    }
    if (name === 'line' || name === 'centerline') {
      if (!P.last) { P.last = s.p; P.lastRef = s.ref || null; P.prev = null; drawOverlay(); return; }
      if (Math.hypot(s.p[0] - P.last[0], s.p[1] - P.last[1]) < px(2)) { if (name === 'line') { endChain(); } return; }
      var spec = { t: 'line', a: P.last, b: s.p };
      if (name === 'centerline') spec.cons = true;
      if (s.rel) spec.rel = s.rel;
      var refs = [{ end: 'a', ref: P.prev ? { id: P.prev, end: 'b' } : P.lastRef }, { end: 'b', ref: s.ref }];
      var ln = addEnt(spec, P.view, refs);
      D.pending = { view: P.view, last: ln.b, prev: ln.id, lastRef: null, pts: [] };
      if (name === 'centerline') D.pending = { pts: [] };   // a centerline is one segment; a line chains on
      drawOverlay();
      UI.setStatus(name === 'line' ? 'Line ' + ln.id + ' added' + (s.rel ? ' (' + (s.rel === 'H' ? 'Horizontal' : 'Vertical') + ')' : '') + '. Click the next point, Esc ends the chain.' : 'Centerline added. Click the next one, Esc ends.');
      return;
    }
    if (name === 'rect') {
      if (!P.a) { P.a = s.p; drawOverlay(); UI.setStatus('Corner Rectangle: click the opposite corner.'); return; }
      if (Math.abs(s.p[0] - P.a[0]) < px(2) || Math.abs(s.p[1] - P.a[1]) < px(2)) return;
      var a0 = P.a, vv = P.view, ids = edit(function (dc) { return Drawing.addSketchRect(dc, a0, s.p, vv); });
      D.pending = { pts: [] }; D.sel = { kind: 'sk', id: ids[0], ids: ids }; drawOverlay();
      UI.setStatus('Rectangle added (four lines: Coincident corners, Horizontal and Vertical sides).');
      return;
    }
    if (name === 'circle') {
      if (!P.c) { P.c = s.p; P.cRef = s.ref; drawOverlay(); UI.setStatus('Circle: click a point on the circle.'); return; }
      var r = Math.hypot(s.p[0] - P.c[0], s.p[1] - P.c[1]);
      if (r < px(2)) return;
      addEnt({ t: 'circle', c: P.c, r: r }, P.view, [{ end: 'c', ref: P.cRef }]);
      D.pending = { pts: [] }; drawOverlay(); UI.setStatus('Circle added. Click the next centre, Esc ends.');
      return;
    }
    if (name === 'arc') {
      if (!P.c) { P.c = s.p; P.cRef = s.ref; drawOverlay(); UI.setStatus('Centerpoint Arc: click the start.'); return; }
      if (!P.s) { if (Math.hypot(s.p[0] - P.c[0], s.p[1] - P.c[1]) < px(2)) return; P.s = s.p; P.sRef = s.ref; drawOverlay(); UI.setStatus('Centerpoint Arc: click the end (counter-clockwise from the start).'); return; }
      var rr = Math.hypot(P.s[0] - P.c[0], P.s[1] - P.c[1]), a0d = Math.atan2(P.s[1] - P.c[1], P.s[0] - P.c[0]) * 180 / Math.PI, a1d = Math.atan2(s.p[1] - P.c[1], s.p[0] - P.c[0]) * 180 / Math.PI;
      addEnt({ t: 'arc', c: P.c, r: rr, a0: a0d, a1: a1d }, P.view, [{ end: 'c', ref: P.cRef }, { end: 'start', ref: P.sRef }, { end: 'end', ref: s.ref }]);
      D.pending = { pts: [] }; drawOverlay(); UI.setStatus('Arc added. Click the next centre, Esc ends.');
      return;
    }
    if (name === 'spline') {
      var last = P.pts[P.pts.length - 1];
      if (last && Math.hypot(s.p[0] - last[0], s.p[1] - last[1]) < px(3)) {
        if (P.pts.length >= 2) { addEnt({ t: 'spline', pts: P.pts.slice() }, P.view, [{ end: 'start', ref: P.firstRef }, { end: 'end', ref: P.lastRef }]); UI.setStatus('Spline added.'); }
        D.pending = { pts: [] }; drawOverlay();
        return;
      }
      if (!P.pts.length) P.firstRef = s.ref;
      P.lastRef = s.ref;
      P.pts.push(s.p); drawOverlay();
      UI.setStatus('Spline: ' + P.pts.length + ' point' + (P.pts.length > 1 ? 's' : '') + '; click the last one again to finish.');
    }
  }
  function endChain() { D.pending = { pts: [] }; drawOverlay(); }

  // ------------------------------------------------------------------ Hide / Show Edges
  function hiddenAt(p) {
    var best = null, bd = px(6);
    ((D.sheet && D.sheet.hiddenEdges) || []).forEach(function (h) {
      var q = h.prim, d = q.k === 'line' ? segDist(p, q.a, q.b) : Math.abs(Math.hypot(p[0] - q.c[0], p[1] - q.c[1]) - q.r);
      if (d < bd) { bd = d; best = h; }
    });
    return best;
  }
  function edgeAt(p) {
    var ent = DW.entityAt(p, true);
    if (!ent || !(ent.la || ent.mc || ent.ma)) return null;
    try { return { view: ent.view, key: Drawing.edgeKey(ent), ent: ent }; } catch (err) { return null; }
  }
  function hideShowClick(p) {
    var h = hiddenAt(p);
    if (h) { edit(function (dc) { Drawing.hideEdge(dc, h.view, h.key, false); }); UI.setStatus('Edge shown again.'); return; }
    var g = edgeAt(p);
    if (!g) { UI.setStatus(TOOL_MSG.hideedges); return; }
    edit(function (dc) { Drawing.hideEdge(dc, g.view, g.key, true); });
    UI.setStatus('Edge hidden (click it again to show it). Esc ends.');
  }

  // ------------------------------------------------------------------ Line Format
  var STYLE_OPTS = [['solid', 'Solid'], ['hidden', 'Hidden (dashed)'], ['center', 'Center'], ['phantom', 'Phantom']];
  var WEIGHT_OPTS = [['thin', 'Thin (0.25 mm)'], ['normal', 'Normal (0.5 mm)'], ['thick', 'Thick (0.7 mm)']];
  function openPM(spec) {
    var onClose = spec.onClose;
    spec.onClose = function () { $('app').classList.remove('dw-pm'); if (onClose) onClose(); if (D.active) { UI.setFmTab('tree'); DW.render(); } };
    UI.openPM(spec);
    $('app').classList.add('dw-pm');
  }
  // Line Format for sketch entities (ids) or for one view edge ({ view, key })
  function cmdLineFormat(target) {
    if (!D.active) return;
    var ids = target && target.key ? null : (target && target.ids) || selIds(), edge = target && target.key ? target : null;
    if (!edge && !ids.length) { UI.toast('Line Format: select sketch entities first (Ctrl adds), or right-click a view edge ▸ Line Format.'); return; }
    var cur = { style: 'solid', weight: 'normal', color: '' };
    if (edge) { var v = Drawing.findView(doc(), edge.view), ef = v && v.edgeFormats && v.edgeFormats[edge.key] || {}; cur = { style: ef.style || 'solid', weight: ef.weight || 'normal', color: ef.color || '' }; }
    else { var e0 = Drawing.sketchEntity(doc(), ids[0]); if (e0) cur = { style: e0.style || (e0.cons ? 'center' : 'solid'), weight: e0.weight || (e0.cons ? 'thin' : 'normal'), color: e0.color || '' }; }
    openPM({ title: 'Line Format', icon: 'lineFormat', command: 'dwLineFormat',
      message: edge ? 'Line style, thickness and colour of this view edge (Hide Edge removes it from the sheet).' : 'Line style, thickness and colour of the ' + ids.length + ' selected sketch entit' + (ids.length > 1 ? 'ies' : 'y') + ' (drawn in SVG, PDF and on the DXF SKETCH layer).',
      values: cur,
      groups: [{ title: 'Line Format', fields: [{ type: 'select', key: 'style', label: 'Line style', options: STYLE_OPTS }, { type: 'select', key: 'weight', label: 'Line thickness', options: WEIGHT_OPTS }, { type: 'text', key: 'color', label: 'Line color (#rrggbb, empty: black)' }] }],
      onOK: function (vals) {
        var f = { style: vals.style, weight: vals.weight, color: vals.color && /^#[0-9a-f]{6}$/i.test(vals.color) ? vals.color : null };
        if (edge) edit(function (dc) { Drawing.setEdgeFormat(dc, edge.view, edge.key, { style: f.style === 'solid' ? null : f.style, weight: f.weight === 'normal' ? null : f.weight, color: f.color }); });
        else edit(function (dc) { Drawing.setLineFormat(dc, ids, f); });
        UI.setStatus('Line Format applied.');
      } });
  }

  // ------------------------------------------------------------------ properties (double-click)
  function relText(id) {
    var rs = Drawing.sketchRelations(doc(), id);
    return rs.length ? rs.map(function (r) { return r.kind === 'H' ? 'Horizontal' : r.kind === 'V' ? 'Vertical' : 'Coincident'; }).join(', ') : 'None';
  }
  function cmdEntityProps(id) {
    var e = Drawing.sketchEntity(doc(), id);
    if (!e) return;
    var k = units() === 'in' ? 'in' : 'mm', vals = { style: e.style || (e.cons ? 'center' : 'solid'), weight: e.weight || (e.cons ? 'thin' : 'normal'), color: e.color || '' }, geo = [];
    var title = { line: e.cons ? 'Centerline' : 'Line', circle: 'Circle', arc: 'Arc', spline: 'Spline', point: 'Point', text: 'Text' }[e.t] + ' Properties';
    if (e.t === 'line') { vals.length = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]); geo.push({ type: 'number', key: 'length', label: 'Length (paper ' + k + ')', unit: 'u', min: 1e-6 }); }
    if (e.t === 'circle' || e.t === 'arc') { vals.r = e.r; geo.push({ type: 'number', key: 'r', label: 'Radius (paper ' + k + ')', unit: 'u', min: 1e-6 }); }
    if (e.t === 'text') { vals.text = e.text.replace(/\n/g, '\\n'); vals.h = e.h; geo.push({ type: 'text', key: 'text', label: 'Text (\\n: new line)' }, { type: 'number', key: 'h', label: 'Height (' + k + ')', unit: 'u', min: 1e-6 }); }
    var groups = [{ title: 'Existing Relations', fields: [{ type: 'static', label: 'Relations', value: function () { return relText(id); } }] }];
    if (e.t === 'line') groups.push({ title: 'Add Relations', fields: [{ type: 'buttons', key: 'rel', buttons: [
      { label: 'Horizontal', onclick: function () { relate('H', [id]); UI.renderPM(); } },
      { label: 'Vertical', onclick: function () { relate('V', [id]); UI.renderPM(); } }] }] });
    if (geo.length) groups.push({ title: 'Parameters', fields: geo });
    if (e.t !== 'text' && e.t !== 'point') groups.push({ title: 'Line Format', fields: [{ type: 'select', key: 'style', label: 'Line style', options: STYLE_OPTS }, { type: 'select', key: 'weight', label: 'Line thickness', options: WEIGHT_OPTS }, { type: 'text', key: 'color', label: 'Line color (#rrggbb)' }] });
    D.sel = { kind: 'sk', id: id, ids: [id] }; drawOverlay();
    var orig = JSON.parse(JSON.stringify(vals));   // (the PM edits vals in place)
    openPM({ title: title, icon: e.t === 'arc' ? 'arc' : e.t === 'line' ? (e.cons ? 'centerline' : 'line') : e.t, command: 'dwSketchProps', message: 'Sketch ' + e.t + ' ' + id + (e.view != null ? ' in ' + (Drawing.findView(doc(), e.view) || {}).name : ' on the sheet') + '.', values: vals, groups: groups,
      onOK: function (v) {
        edit(function (dc) {
          var cur = Drawing.sketchEntity(dc, id);
          if (!cur) return;
          if (e.t === 'line' && Math.abs(v.length - orig.length) > 1e-9 && v.length > 0) { var L = Math.hypot(cur.b[0] - cur.a[0], cur.b[1] - cur.a[1]) || 1; Drawing.editSketchEntity(dc, id, { b: [cur.a[0] + (cur.b[0] - cur.a[0]) * v.length / L, cur.a[1] + (cur.b[1] - cur.a[1]) * v.length / L] }, {}); }
          if ((e.t === 'circle' || e.t === 'arc') && Math.abs(v.r - orig.r) > 1e-9 && v.r > 0) Drawing.editSketchEntity(dc, id, { r: v.r });
          if (e.t === 'text') Drawing.editSketchEntity(dc, id, { text: String(v.text || '').replace(/\\n/g, '\n'), h: v.h > 0 ? v.h : e.h });
          if (e.t !== 'text' && e.t !== 'point' && (v.style !== orig.style || v.weight !== orig.weight || v.color !== orig.color)) Drawing.setLineFormat(dc, [id], { style: v.style, weight: v.weight, color: v.color && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : null });
        });
      } });
  }
  function editDim(id) {
    var d = Drawing.sketchEntity(doc(), id);
    if (!d || d.t !== 'dim') return;
    D.sel = { kind: 'sk', id: id, ids: [id] }; drawOverlay();
    UI.promptDialog('Modify', 'Value (' + (d.kind === 'dia' ? 'diameter' : d.kind === 'rad' ? 'radius' : 'length') + ', ' + units() + (d.view != null ? ' on the part' : ' on paper') + '):', String(Math.round(d.val * 1e6) / 1e6), function (txt) {
      var v = parseFloat(txt);
      if (!(v > 0)) { UI.toast('A dimension must be above 0.'); return; }
      edit(function (dc) { Drawing.setSketchDim(dc, id, v); });
      UI.setStatus('Sketch dimension set to ' + v + '.');
    });
  }
  function relate(kind, ids) {
    var n = 0;
    edit(function (dc) { ids.forEach(function (id) { var e = Drawing.sketchEntity(dc, id); if (e && e.t === 'line') { Drawing.addSketchRelation(dc, kind, id); n++; } }); });
    UI.setStatus(n ? (kind === 'H' ? 'Horizontal' : 'Vertical') + ' added to ' + n + ' line' + (n > 1 ? 's' : '') + '.' : 'Select sketch lines first.');
    return n;
  }
  function cmdRelation(kind) {
    if (!D.active) return;
    if (kind === 'coincident') { startTool('coin'); return; }
    var ids = selIds();
    if (!ids.length) { UI.toast((kind === 'H' ? 'Horizontal' : 'Vertical') + ': select sketch lines first.'); return; }
    relate(kind, ids);
  }

  // ------------------------------------------------------------------ Relative View
  var REL = null;
  function cmdRelativeView() {
    if (!D.active) return;
    if (!App.mesh || !App.mesh.triCount) { UI.toast('The part has no solid body to draw yet.'); return; }
    if (!D.sheet || !D.sheet.views.length) { UI.toast('Relative View: place a view first (an isometric shows the faces best), then pick the two faces in it.'); return; }
    REL = { second: 'Right', faces: [], pts: [] };
    openPM({ title: 'Relative View', icon: 'relativeView', command: 'relativeView',
      message: 'Click a face in a drawing view for the First orientation (it faces you: Front), then a second face for the Second orientation. Press OK, then click on the sheet to place the view.',
      values: { second: 'Right' },
      groups: [{ title: 'Orientation', fields: [
        { type: 'static', label: 'First (Front)', value: function () { return REL && REL.faces[0] != null ? 'Face ' + REL.faces[0] : 'pick a face'; } },
        { type: 'select', key: 'second', label: 'Second', options: [['Right', 'Right'], ['Left', 'Left'], ['Top', 'Top'], ['Bottom', 'Bottom']] },
        { type: 'static', label: 'Second face', value: function () { return REL && REL.faces[1] != null ? 'Face ' + REL.faces[1] : 'pick a face'; } }] }],
      onOK: function (v) {
        if (!REL || REL.faces.length < 2) { UI.toast('Relative View: pick two faces first.'); return false; }
        var F;
        try { F = Drawing.relativeFrame(App.mesh.faces[REL.faces[0]].normal, App.mesh.faces[REL.faces[1]].normal, v.second); } catch (err) { UI.toast(err.message); return false; }
        var ext = Drawing.extentsOf(App.mesh, F), s = Drawing.scaleValue(doc().sheet.scale || [1, 1]);
        var spec = { face1: REL.faces[0], face2: REL.faces[1], second: v.second };
        setTimeout(function () { D.tool = 'sk:relplace'; D.pending = { spec: spec, w: Math.max(ext.w * s, 1), h: Math.max(ext.h * s, 1), at: null }; drawOverlay(); UI.refreshRibbon(); UI.setStatus('Relative View (' + F.name + '): click on the sheet to place it. Esc cancels.'); }, 0);
      },
      onClose: function () { if (D.tool === 'sk:relpick') { D.tool = null; D.pending = null; } }
    });
    D.tool = 'sk:relpick'; D.pending = { pts: [] }; drawOverlay(); UI.refreshRibbon();
    UI.setStatus('Relative View: click the face that should face you (First: Front).');
  }
  function relPick(p) {
    var w = DW.viewAt(p);
    if (!w || !REL) return;
    var fi = Drawing.faceAt(App.mesh, w.frame, w.fromSheet(p));
    if (fi < 0) { UI.setStatus('Relative View: no face there; click inside the part in a view.'); return; }
    if (REL.faces.length >= 2) { REL.faces = []; REL.pts = []; }
    REL.faces.push(fi); REL.pts.push(p.slice());
    if (UI.renderPM) UI.renderPM();
    drawOverlay();
    UI.setStatus(REL.faces.length === 1 ? 'Relative View: First face picked; click the second face (Second: ' + ((UI.pmValues && UI.pmValues().second) || 'Right') + ').' : 'Relative View: both faces picked; press OK, then place the view.');
  }
  function relPlace(p) {
    var spec = D.pending && D.pending.spec;
    if (!spec) return;
    D.tool = null; D.pending = null;
    var v;
    try { v = DW.editView(function (dc) { return Drawing.addRelativeView(dc, App.mesh, Object.assign({ x: p[0], y: p[1] }, spec)); }); }
    catch (err) { UI.toast(err.message); return; }
    REL = null;
    D.sel = { kind: 'view', id: v.id };
    drawOverlay(); DW.renderTree(); UI.refreshRibbon();
    UI.setStatus(v.name + ' (Relative View, ' + v.orient + ') placed' + (v.dimType === 'true' ? '; its dimensions read true lengths' : '') + '.');
  }

  // ------------------------------------------------------------------ the sheet's mouse (drawing-ui.js calls these first)
  DW.skDown = function (p, e) {
    var T = D.tool;
    if (T && T.indexOf('sk:') === 0) { toolClick(T.slice(3), p, e); return true; }
    if (T === 'dim') {
      if (D.pending && D.pending.first) return false;
      var hd = hit(p, { noDims: true, noEnds: true });
      if (!hd || !/^(line|circle|arc)$/.test(hd.it.t)) return false;
      var dm = edit(function (dc) { return Drawing.addSketchDim(dc, hd.id); });
      D.sel = { kind: 'sk', id: dm.id, ids: [dm.id] }; D.hover = null; drawOverlay();
      UI.setStatus('Sketch dimension added (driving): drag it to place it, double-click to change its value.');
      return true;
    }
    if (T || D.formatEdit) return false;
    var h = hit(p);
    if (!h) return false;
    var ctrl = e && (e.ctrlKey || e.metaKey || e.shiftKey), ids = selIds();
    if (ctrl) { var i = ids.indexOf(h.id); if (i >= 0) ids.splice(i, 1); else ids.push(h.id); D.sel = ids.length ? { kind: 'sk', id: ids[ids.length - 1], ids: ids } : null; }
    else if (ids.indexOf(h.id) < 0 || ids.length < 2) D.sel = { kind: 'sk', id: h.id, ids: [h.id] };
    D.drag = { kind: 'sk', id: h.id, end: h.end, start: p, last: p, moved: false };
    drawOverlay(); DW.renderTree();
    var it = h.it;
    UI.setStatus(it.t === 'dim' ? 'Sketch dimension ' + it.dim.text + ' — drag to move it, double-click to change the value, Delete removes it.'
      : 'Sketch ' + (it.e.cons ? 'centerline' : it.t) + ' ' + h.id + (h.end ? ' (' + h.end + ' point)' : '') + ' — drag to move it, double-click for its properties, Delete removes it; Relations: ' + relText(h.id) + '.');
    return true;
  };
  DW.skDragMove = function (dg, p) {
    if (!dg || dg.kind !== 'sk') return false;
    if (!dg.moved && Math.hypot(p[0] - dg.start[0], p[1] - dg.start[1]) < px(3)) return true;
    if (!dg.moved) { UI.pushUndo(); dg.moved = true; D.host.classList.add('dw-dragging'); }
    var q = p;
    if (dg.end) { var it = Drawing.sketchEntity(doc(), dg.id), s = it && snap(p, { view: it.view }); if (s && s.ref && s.ref.id !== dg.id) q = s.p; }
    try { Drawing.moveSketchEntity(doc(), dg.id, q[0] - dg.last[0], q[1] - dg.last[1], dg.end || undefined); } catch (err) { return true; }
    dg.last = q;
    DW.queueRender(true);
    return true;
  };
  DW.skHover = function (q) {
    var T = D.tool, h;
    if (T && T.indexOf('sk:') === 0) {
      var P = D.pending || (D.pending = { pts: [] }), name = T.slice(3);
      if (name === 'hideedges') { var hh = hiddenAt(q), g = hh ? null : edgeAt(q); D.hover = hh ? { kind: 'skhidden', view: hh.view, key: hh.key } : g ? g.ent : null; drawOverlay(); return true; }
      if (name === 'relpick') { var w = DW.viewAt(q); D.hover = w ? { kind: 'view', id: w.view.id } : null; drawOverlay(); return true; }
      if (name === 'relplace') { P.at = q; drawOverlay(); return true; }
      if (name === 'coin') { var hc = hit(q, { noDims: true }); D.hover = hc && hc.end ? { kind: 'sk', id: hc.id, end: hc.end } : null; drawOverlay(); return true; }
      var from = name === 'line' || name === 'centerline' ? P.last : null, s =snap(q, P.view === undefined ? { view: ownerAt(q) } : P, from);
      P.at = s.p; P.atRef = s.ref || null; P.atRel = s.rel || null;
      drawOverlay();
      return true;
    }
    if (T === 'dim') {
      if (D.pending && D.pending.first) return false;
      h = hit(q, { noDims: true, noEnds: true });
      if (!h || !/^(line|circle|arc)$/.test(h.it.t)) { if (D.hover && D.hover.kind === 'sk') { D.hover = null; drawOverlay(); } return false; }
      D.hover = { kind: 'sk', id: h.id }; drawOverlay();
      return true;
    }
    if (T || D.formatEdit) return false;
    h = hit(q);
    if (!h) { if (D.hover && D.hover.kind === 'sk') { D.hover = null; drawOverlay(); } return false; }
    var nh = { kind: 'sk', id: h.id, end: h.end || null };
    if (JSON.stringify(nh) !== JSON.stringify(D.hover)) { D.hover = nh; drawOverlay(); }
    return true;
  };
  DW.skDblClick = function (p) {
    var h = hit(p);
    if (!h) return false;
    if (h.it.t === 'dim') editDim(h.id); else cmdEntityProps(h.id);
    return true;
  };
  DW.skContext = function (p, e) {
    D.ctxAt = p;
    if (D.tool && D.tool.indexOf('sk:') === 0) { if (D.tool === 'sk:line' || D.tool === 'sk:spline') { endTool(); return true; } return false; }
    var h = hit(p);
    if (!h || D.formatEdit) return false;
    var ids = selIds();
    if (ids.indexOf(h.id) < 0) { ids = [h.id]; D.sel = { kind: 'sk', id: h.id, ids: ids }; }
    drawOverlay(); DW.renderTree();
    var lines = ids.filter(function (id) { var x = Drawing.sketchEntity(doc(), id); return x && x.t === 'line'; });
    var menu = [];
    if (h.it.t === 'dim') menu.push({ label: 'Modify Value…', action: function () { editDim(h.id); } });
    else menu.push({ label: 'Properties…', action: function () { cmdEntityProps(h.id); } }, { label: 'Line Format…', action: function () { cmdLineFormat({ ids: ids.slice() }); } });
    if (lines.length) menu.push({ sep: true }, { label: 'Make Horizontal', action: function () { relate('H', lines); } }, { label: 'Make Vertical', action: function () { relate('V', lines); } });
    menu.push({ sep: true }, { label: 'Delete', key: 'Del', action: function () { DW.skDelete(); } });
    UI.showMenu(e.clientX, e.clientY, menu);
    return true;
  };
  DW.skDelete = function () {
    var ids = selIds();
    if (!ids.length) return false;
    edit(function (dc) { ids.forEach(function (id) { if (Drawing.sketchEntity(dc, id)) Drawing.deleteSketchEntity(dc, id); }); });
    D.sel = null; drawOverlay(); DW.renderTree();
    UI.setStatus(ids.length + ' sketch item' + (ids.length > 1 ? 's' : '') + ' deleted.');
    return true;
  };
  // the view's right-click menu: Hide Edge / Line Format… for the edge under the pointer, Show Hidden Edges
  var baseViewMenu = DW.viewMenu;
  DW.viewMenu = function (v) {
    var items0 = baseViewMenu.apply(this, arguments), at = D.ctxAt, extra = [];
    var g = at ? edgeAt(at) : null;
    if (g && g.view === v.id) extra.push({ label: 'Hide Edge', action: function () { edit(function (dc) { Drawing.hideEdge(dc, g.view, g.key, true); }); UI.setStatus('Edge hidden (Show Hidden Edges brings it back).'); } },
      { label: 'Line Format…', action: function () { cmdLineFormat({ view: g.view, key: g.key }); } });
    var nh = Drawing.hiddenEdges(doc(), v.id).length;
    extra.push({ label: 'Show Hidden Edges' + (nh ? ' (' + nh + ')' : ''), disabled: !nh, action: function () { edit(function (dc) { Drawing.showEdges(dc, v.id); }); UI.setStatus('Hidden edges shown.'); } });
    var at2 = items0.length;
    items0.forEach(function (it, i) { if (it.label === 'Delete' && at2 === items0.length) at2 = i; });
    var ins = extra.concat([{ sep: true }]);
    items0.splice.apply(items0, [Math.max(0, at2 - (items0[at2 - 1] && items0[at2 - 1].sep ? 1 : 0)), 0].concat(ins));
    return items0;
  };

  // ------------------------------------------------------------------ overlay
  DW.skOverlay = function (g, H, svgNode, sw, pad) {
    if (!D.sheet) return;
    var hotW = px(2.6), selW = px(3.2);
    function geo(e, cls, w) {
      var a = { class: cls, fill: 'none', 'stroke-width': w };
      if (e.t === 'line') svgNode('line', Object.assign(a, { x1: e.a[0], y1: H - e.a[1], x2: e.b[0], y2: H - e.b[1] }), g);
      else if (e.t === 'circle') svgNode('circle', Object.assign(a, { cx: e.c[0], cy: H - e.c[1], r: e.r }), g);
      else if (e.t === 'arc') { var n = 32, d = ''; for (var i = 0; i <= n; i++) { var t = (e.a0 + (e.a1 - e.a0) * i / n) * Math.PI / 180; d += (i ? 'L' : 'M') + (e.c[0] + e.r * Math.cos(t)) + ' ' + (H - e.c[1] - e.r * Math.sin(t)); } svgNode('path', Object.assign(a, { d: d }), g); }
      else if (e.t === 'spline') svgNode('path', Object.assign(a, { d: Drawing.sketchSpline(e.pts).map(function (q, i) { return (i ? 'L' : 'M') + q[0] + ' ' + (H - q[1]); }).join(' ') }), g);
      else if (e.t === 'point') svgNode('circle', Object.assign(a, { cx: e.p[0], cy: H - e.p[1], r: px(4) }), g);
      else if (e.t === 'text') { var b = textBox(e); svgNode('rect', { class: 'dw-dbox' + (cls.indexOf('pre') < 0 ? ' sel' : ''), x: b.x0 - pad / 2, y: H - b.y1 - pad / 2, width: b.x1 - b.x0 + pad, height: b.y1 - b.y0 + pad, 'stroke-width': sw }, g); }
    }
    var ids = selIds(), hov = D.hover && D.hover.kind === 'sk' ? D.hover : null;
    if (ids.length || hov) items().forEach(function (it) {
      var sel = ids.indexOf(it.id) >= 0, ho = hov && hov.id === it.id;
      if (!sel && !ho) return;
      if (it.t === 'dim') { var b = it.dim.box; svgNode('rect', { class: 'dw-dbox' + (sel ? ' sel' : ''), x: b.x0 - pad / 2, y: H - b.y1 - pad / 2, width: b.x1 - b.x0 + pad, height: b.y1 - b.y0 + pad, 'stroke-width': sw }, g); return; }
      geo(it.e, 'dw-hot' + (sel ? '' : ' pre') + ' dw-sk', sel ? selW : hotW);
      if (sel || ho) Drawing.sketchEnds(it.e).forEach(function (end) {
        if (it.e.t === 'text') return;
        var q = Drawing.sketchPoint(it.e, end), r = px(ho && hov.end === end ? 4 : 2.6);
        svgNode('rect', { class: 'dw-hot dw-sk-end', x: q[0] - r, y: H - q[1] - r, width: 2 * r, height: 2 * r, fill: '#fff', 'stroke-width': px(1.2) }, g);
      });
    });
    // hidden edges, grey, while Hide/Show Edges runs
    if (D.tool === 'sk:hideedges') ((D.sheet && D.sheet.hiddenEdges) || []).forEach(function (h) {
      var q = h.prim, on = D.hover && D.hover.kind === 'skhidden' && D.hover.key === h.key && D.hover.view === h.view;
      var a = { class: 'dw-ghost dw-sk-hidden', fill: 'none', 'stroke-width': px(on ? 2.6 : 1.4), 'stroke-dasharray': px(4) + ' ' + px(2), stroke: on ? '#1e1e1e' : '#a0a0a0' };   // rfBU: near-black / grey (was blue)
      if (q.k === 'line') svgNode('line', Object.assign(a, { x1: q.a[0], y1: H - q.a[1], x2: q.b[0], y2: H - q.b[1] }), g);
      else if (q.k === 'circle' || q.k === 'arc') svgNode('circle', Object.assign(a, { cx: q.c[0], cy: H - q.c[1], r: q.r }), g);
    });
    var P = D.pending, T = D.tool;
    if (!T || T.indexOf('sk:') !== 0 || !P) return;
    var gw = px(1.5);
    function rub(a, b) { svgNode('line', { class: 'dw-cut dw-sk-rubber', x1: a[0], y1: H - a[1], x2: b[0], y2: H - b[1], 'stroke-width': gw }, g); }
    var at = P.at;
    if (at && P.atRef) svgNode('circle', { class: 'dw-hot', cx: at[0], cy: H - at[1], r: px(5), fill: 'none', 'stroke-width': px(1.5) }, g);
    if ((T === 'sk:line' || T === 'sk:centerline') && P.last && at) {
      rub(P.last, at);
      if (P.atRel) svgNode('text', { x: at[0] + px(8), y: H - at[1] - px(8), 'font-size': px(11), fill: '#2a2a2a', class: 'dw-sk-infer' }, g).textContent = P.atRel === 'H' ? '—' : '|';
    }
    if (T === 'sk:rect' && P.a && at) { rub(P.a, [at[0], P.a[1]]); rub([at[0], P.a[1]], at); rub(at, [P.a[0], at[1]]); rub([P.a[0], at[1]], P.a); }
    if (T === 'sk:circle' && P.c && at) svgNode('circle', { class: 'dw-cut', cx: P.c[0], cy: H - P.c[1], r: Math.hypot(at[0] - P.c[0], at[1] - P.c[1]), fill: 'none', 'stroke-width': gw }, g);
    if (T === 'sk:arc' && P.c && at) {
      if (!P.s) rub(P.c, at);
      else geo({ t: 'arc', c: P.c, r: Math.hypot(P.s[0] - P.c[0], P.s[1] - P.c[1]), a0: Math.atan2(P.s[1] - P.c[1], P.s[0] - P.c[0]) * 180 / Math.PI, a1: (function () { var a0 = Math.atan2(P.s[1] - P.c[1], P.s[0] - P.c[0]) * 180 / Math.PI, a1 = Math.atan2(at[1] - P.c[1], at[0] - P.c[0]) * 180 / Math.PI; while (a1 <= a0) a1 += 360; return a1; })() }, 'dw-cut', gw);
    }
    if (T === 'sk:spline' && P.pts && P.pts.length) { var sp = P.pts.concat(at ? [at] : []); if (sp.length >= 2) geo({ t: 'spline', pts: sp }, 'dw-cut', gw); }
    if (T === 'sk:relpick' && REL) REL.pts.forEach(function (q, i) { svgNode('circle', { class: 'dw-hot dw-rel-pick', cx: q[0], cy: H - q[1], r: px(5), fill: i ? '#3ba776' : '#2a2a2a', 'stroke-width': px(1) }, g); });
    if (T === 'sk:relplace' && P.at && P.w) svgNode('rect', { class: 'dw-ghost', x: P.at[0] - P.w / 2, y: H - P.at[1] - P.h / 2, width: P.w, height: P.h, 'stroke-width': sw, 'stroke-dasharray': px(5) + ' ' + px(3) }, g);
  };

  // ------------------------------------------------------------------ the Sketch tab of a drawing (SolidWorks 2024's drawing CommandManager)
  var DRAWING_SKETCH = [
    { id: 'dim', label: 'Smart\nDimension', run: function () { DW.cmdSmartDimension(); }, active: function () { return D.tool === 'dim'; } },
    { sep: true },
    { stack: [
      { fly: 'line', items: [{ id: 'line', label: 'Line', run: function () { startTool('line'); }, active: function () { return toolOn('line'); } },
        { id: 'centerline', label: 'Centerline', run: function () { startTool('centerline'); }, active: function () { return toolOn('centerline'); } }] },
      { id: 'rect', label: 'Corner Rectangle', run: function () { startTool('rect'); }, active: function () { return toolOn('rect'); } },
      { id: 'circle', label: 'Circle', run: function () { startTool('circle'); }, active: function () { return toolOn('circle'); } },
      { id: 'arc', label: 'Centerpoint Arc', run: function () { startTool('arc'); }, active: function () { return toolOn('arc'); } },
      { id: 'spline', label: 'Spline', run: function () { startTool('spline'); }, active: function () { return toolOn('spline'); } },
      { id: 'point', label: 'Point', run: function () { startTool('point'); }, active: function () { return toolOn('point'); } },
      { id: 'text', label: 'Text', run: function () { startTool('text'); }, active: function () { return toolOn('text'); } }], grid: true },
    { sep: true },
    { fly: 'addRelation', label: 'Add\nRelation', items: [
      { id: 'relHorizontal', label: 'Horizontal', help: 'Make the selected sketch lines horizontal', run: function () { cmdRelation('H'); } },
      { id: 'relVertical', label: 'Vertical', help: 'Make the selected sketch lines vertical', run: function () { cmdRelation('V'); } },
      { id: 'relCoincident', label: 'Coincident', help: 'Join a point of one sketch entity to a point of another', run: function () { cmdRelation('coincident'); }, active: function () { return toolOn('coin'); } }] },
    { sep: true },
    { id: 'lineFormat', label: 'Line\nFormat', help: 'Line style, thickness and colour of the selected sketch entities', run: function () { cmdLineFormat(); } },
    { id: 'hideShowEdges', label: 'Hide/Show\nEdges', help: 'Click view edges to hide them; hidden ones show grey, click to show them again', run: function () { startTool('hideedges'); }, active: function () { return toolOn('hideedges'); } }
  ];
  // RIBBON.Sketch is the part's Sketch tab; in a drawing the same tab name shows the drawing's sketch tools
  function swapTab(R, keepPart) {
    if (!R) return;
    var part = R.Sketch, desc = Object.getOwnPropertyDescriptor(R, 'Sketch');
    if (desc && desc.get) return;
    Object.defineProperty(R, 'Sketch', { configurable: true, enumerable: !!keepPart,
      get: function () { return D.active ? DRAWING_SKETCH : part; },
      set: function (v) { part = v; } });
  }
  swapTab(UI.RIBBON, true);
  swapTab(UI.ASM_RIBBON, false);
  var baseTabsFor = UI.ribbonTabsFor;
  UI.ribbonTabsFor = function (names, extra) {
    if (D.active) return [['View Layout', 'Annotation', 'Sketch', 'Sheet Format'], ['Markup']];
    return baseTabsFor ? baseTabsFor(names, extra) : [names, extra];
  };
  // View Layout: Relative View after Model View
  (function () {
    var vl = UI.RIBBON['View Layout'];
    if (!vl) return;
    var at = -1;
    vl.forEach(function (it, i) { if (it.id === 'modelView' || (it.stack || []).some(function (s) { return s.id === 'modelView'; })) at = i; });
    vl.splice(at >= 0 ? at + 1 : vl.length, 0, { id: 'relativeView', label: 'Relative\nView', help: 'A view whose orientation two faces define: the first faces you, the second points right (or left, up, down)', run: cmdRelativeView, active: function () { return D.tool === 'sk:relpick' || D.tool === 'sk:relplace'; } });
  })();
  // Insert ▸ Drawing View ▸ Relative To Model, Tools ▸ Sketch Entities in a drawing
  var baseMenuHook = UI.menuHook;
  UI.menuHook = function (menus) {
    var out = baseMenuHook ? baseMenuHook(menus) : menus;
    if (!D.active) return out;
    var ins = out.filter(function (m) { return m.label === 'Insert'; })[0];
    if (ins && !ins.items.some(function (it) { return it && it.label === 'Drawing View ▸ Relative To Model…'; })) {
      var ri = -1;
      ins.items.forEach(function (it, i) { if (it && /^Drawing View ▸ Model/.test(it.label || '')) ri = i; });
      ins.items.splice(ri >= 0 ? ri + 1 : ins.items.length, 0, { label: 'Drawing View ▸ Relative To Model…', action: cmdRelativeView });
    }
    var tools = out.filter(function (m) { return m.label === 'Tools'; })[0];
    if (tools && !tools.items.some(function (it) { return it && it.label === 'Sketch Entities ▸ Line'; })) {
      tools.items.push({ sep: true },
        { label: 'Sketch Entities ▸ Line', action: function () { startTool('line'); } }, { label: 'Sketch Entities ▸ Centerline', action: function () { startTool('centerline'); } },
        { label: 'Sketch Entities ▸ Corner Rectangle', action: function () { startTool('rect'); } }, { label: 'Sketch Entities ▸ Circle', action: function () { startTool('circle'); } },
        { label: 'Sketch Entities ▸ Centerpoint Arc', action: function () { startTool('arc'); } }, { label: 'Sketch Entities ▸ Spline', action: function () { startTool('spline'); } },
        { label: 'Sketch Entities ▸ Point', action: function () { startTool('point'); } }, { label: 'Sketch Entities ▸ Text', action: function () { startTool('text'); } },
        { label: 'Relations ▸ Add Relation ▸ Horizontal', action: function () { cmdRelation('H'); } }, { label: 'Relations ▸ Add Relation ▸ Vertical', action: function () { cmdRelation('V'); } },
        { label: 'Relations ▸ Add Relation ▸ Coincident', action: function () { cmdRelation('coincident'); } },
        { label: 'Line Format…', action: function () { cmdLineFormat(); } }, { label: 'Hide/Show Edges', action: function () { startTool('hideedges'); } });
    }
    return out;
  };

  // ------------------------------------------------------------------ automation: anvil.drawing.sketch
  DW.sketchTool = startTool; DW.cmdLineFormat = cmdLineFormat; DW.cmdRelativeView = cmdRelativeView; DW.skHit = hit; DW.cmdSketchRelation = cmdRelation;
  function api() {
    return {
      // add(spec, viewId?) -> entity (sheet coordinates); rect(a, b, viewId?) -> line ids
      add: function (spec, viewId) { return edit(function (dc) { return Drawing.addSketchEntity(dc, spec, viewId); }); },
      rect: function (a, b, viewId) { return edit(function (dc) { return Drawing.addSketchRect(dc, a, b, viewId); }); },
      list: function (viewId) { return doc() ? Drawing.sketchEntities(doc(), viewId) : []; },
      get: function (id) { return doc() ? Drawing.sketchEntity(doc(), id) : null; },
      move: function (id, dx, dy, end) { return edit(function (dc) { return Drawing.moveSketchEntity(dc, id, dx, dy, end); }); },
      remove: function (id) { edit(function (dc) { Drawing.deleteSketchEntity(dc, id); }); },
      relate: function (kind, refs) { return edit(function (dc) { return Drawing.addSketchRelation(dc, kind, refs); }); },
      dim: function (id, opts) { return edit(function (dc) { return Drawing.addSketchDim(dc, id, opts); }); },
      setDim: function (id, v) { return edit(function (dc) { return Drawing.setSketchDim(dc, id, v); }); },
      lineFormat: function (ids, fmt) { return edit(function (dc) { return Drawing.setLineFormat(dc, ids, fmt); }); },
      hideEdge: function (viewId, key, hide) { return edit(function (dc) { return Drawing.hideEdge(dc, viewId, key, hide); }); },
      edgeFormat: function (viewId, key, fmt) { return edit(function (dc) { return Drawing.setEdgeFormat(dc, viewId, key, fmt); }); },
      showEdges: function (viewId) { edit(function (dc) { Drawing.showEdges(dc, viewId); }); },
      relativeView: function (o) { return DW.editView(function (dc) { return Drawing.addRelativeView(dc, App.mesh, o); }); },
      tool: startTool
    };
  }
  if (window.anvil && window.anvil.drawing) window.anvil.drawing.sketch = api();
  DW.sketchApi = api;
})();
