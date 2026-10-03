// ui-relations.js — sketch relations in the UI: relation icons next to entities, yellow inference icons while
// sketching, distance / angle Smart Dimensions between two entities, the Add Relations and Display/Delete Relations
// PropertyManagers, and dragging an under-defined sketch (every relation holds). The maths is in sketch-solver.js.
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el, S = window.SketchSolver;
  if (!S) return;
  if (App.view.showRelations == null) App.view.showRelations = true;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function scr(pl, uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
  function iconName(type) { return type === 'distance' || type === 'angle' ? type : 'rel' + type.charAt(0).toUpperCase() + type.slice(1); }
  var CENTERLESS = /^(rect|crect|slot|poly)$/;   // their centre is not offered as a pick (it is not a sketch point in SolidWorks)
  function markDirty() { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } }
  function refresh() { App.gridStale = true; UI.updateSketches(); UI.refreshTree(); }

  // ------------------------------------------------------------------ picking a ref under the mouse
  // A point (end, centre, corner) within 7 px wins, then the origin, then the entity / rectangle edge under the mouse.
  function pickSketchRef(mx, my) {
    var f = UI.activeSketchFeature();
    if (!f) return null;
    var pl = UI.activePlane(), best = null, bd = 7;
    f.entities.forEach(function (e, i) {
      S.pointRefs(f, i).forEach(function (pr) {
        if (/\.(c|mid)$/.test(pr.ref) && (CENTERLESS.test(e.t) || /\.mid$/.test(pr.ref))) return;
        var s = scr(pl, pr.pt), d = Math.hypot(s[0] - mx, s[1] - my);
        if (d < bd) { bd = d; best = pr.ref; }
      });
    });
    var o = scr(pl, [0, 0]);
    if (Math.hypot(o[0] - mx, o[1] - my) < Math.min(bd, 7)) best = 'O';
    if (best) return best;
    var hit = UI.pickEntity(mx, my);
    if (!hit) return null;
    var curves = S.curveRefs(f, hit.index);
    if (!curves.length) return String(hit.index);
    if (curves.length === 1) return curves[0];
    var bestC = curves[0], bdc = Infinity;
    curves.forEach(function (c) {
      var L = S.refCurve(f, c);
      if (!L || L.kind !== 'line') return;
      var a = scr(pl, L.a), b = scr(pl, L.b), d = segDist([mx, my], a, b);
      if (d < bdc) { bdc = d; bestC = c; }
    });
    return bestC;
  }
  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  function refEntity(ref) { var p = S.parseRef(ref); return p && !p.o ? p.e : -1; }

  // ------------------------------------------------------------------ distance / angle dimensions (two entities)
  // Which two-entity dimension a pair of picks means: two non-parallel lines -> angle, anything else that has a
  // distance -> distance. null when the pair has none (or is one entity picked twice).
  function relDimFor(f, r1, r2) {
    if (!r1 || !r2 || r1 === r2) return null;
    var p1 = S.parseRef(r1), p2 = S.parseRef(r2);
    if (p1 && p2 && !p1.o && !p2.o && p1.e === p2.e && (p1.s === null || p2.s === null)) return null;
    var k1 = S.refKind(f, r1), k2 = S.refKind(f, r2);
    if (k1 === 'line' && k2 === 'line') {
      var a = S.refCurve(f, r1), b = S.refCurve(f, r2);
      var d1 = [a.b[0] - a.a[0], a.b[1] - a.a[1]], d2 = [b.b[0] - b.a[0], b.b[1] - b.a[1]];
      var sn = Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) / ((Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1])) || 1);
      if (sn > 1e-6) return { type: 'angle', refs: [r1, r2] };
    }
    if (S.measure(f, 'distance', [r1, r2]) != null) return { type: 'distance', refs: [r1, r2] };
    return null;
  }
  // The two sketch points a distance dimension runs between, and the angle construction of an angle dimension.
  function relDimGeometry(f, rel) {
    var ents = f.entities, R = rel.refs, k0 = S.refKind(f, R[0]), k1 = S.refKind(f, R[1]);
    function ctr(r, k) { if (k === 'point') return S.refPoint(f, r); if (k === 'circle') return S.refCurve(f, r).c; var l = S.refCurve(f, r); return [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]; }
    if (!k0 || !k1 || !ents) return null;
    if (rel.type === 'angle') {
      var A = S.refCurve(f, R[0]), B = S.refCurve(f, R[1]);
      if (!A || !B || A.kind !== 'line' || B.kind !== 'line') return null;
      var d1 = [A.b[0] - A.a[0], A.b[1] - A.a[1]], d2 = [B.b[0] - B.a[0], B.b[1] - B.a[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-12) return null;
      var t = ((B.a[0] - A.a[0]) * d2[1] - (B.a[1] - A.a[1]) * d2[0]) / den;
      var X = [A.a[0] + d1[0] * t, A.a[1] + d1[1] * t];
      return { type: 'angle', X: X, d1: d1, d2: d2 };
    }
    var P, Q;
    if (k0 !== 'line' && k1 !== 'line') { P = ctr(R[0], k0); Q = ctr(R[1], k1); }
    else {
      var li = k1 === 'line' ? 1 : 0, L = S.refCurve(f, R[li]);
      P = ctr(R[1 - li], li ? k0 : k1);
      var dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1], L2 = dx * dx + dy * dy || 1, u = ((P[0] - L.a[0]) * dx + (P[1] - L.a[1]) * dy) / L2;
      Q = [L.a[0] + dx * u, L.a[1] + dy * u];
    }
    // the direction the distance is measured along: horizontal / vertical (rel.dir 'h' / 'v', two points or centres)
    // or aligned with P -> Q; flipped so the value reads positive (the placement offset is along its left normal)
    var L0 = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    var dir = rel.dir === 'h' && k0 !== 'line' && k1 !== 'line' ? [1, 0] : rel.dir === 'v' && k0 !== 'line' && k1 !== 'line' ? [0, 1] : L0 < 1e-12 ? [1, 0] : [(Q[0] - P[0]) / L0, (Q[1] - P[1]) / L0];
    if ((Q[0] - P[0]) * dir[0] + (Q[1] - P[1]) * dir[1] < 0) dir = [-dir[0], -dir[1]];
    return { type: 'distance', P: P, Q: Q, dir: dir };
  }
  // Placement from the cursor: distance -> signed offset from P-Q; angle -> arc radius and which quadrant. A distance
  // being placed between two points (no value yet) also takes its direction from where the cursor is, as SolidWorks'
  // Smart Dimension does: above / below the two points -> horizontal, beside them -> vertical, otherwise aligned.
  function relDimPlacement(f, rel, uv) {
    var out = {};
    if (rel.type === 'distance' && rel.v == null && !rel.driven) {
      var k0 = S.refKind(f, rel.refs[0]), k1 = S.refKind(f, rel.refs[1]);
      if (k0 && k1 && k0 !== 'line' && k1 !== 'line') {
        var g0 = relDimGeometry(f, { type: 'distance', refs: rel.refs });
        var tol = 1e-9 * Math.max(1, Math.abs(g0.P[0]), Math.abs(g0.P[1]));
        var inX = uv[0] > Math.min(g0.P[0], g0.Q[0]) && uv[0] < Math.max(g0.P[0], g0.Q[0]);
        var inY = uv[1] > Math.min(g0.P[1], g0.Q[1]) && uv[1] < Math.max(g0.P[1], g0.Q[1]);
        var slanted = Math.abs(g0.P[0] - g0.Q[0]) > tol && Math.abs(g0.P[1] - g0.Q[1]) > tol;
        out.dir = slanted && inX && !inY ? 'h' : slanted && inY && !inX ? 'v' : undefined;
        rel = Object.assign({}, rel, { dir: out.dir });
      }
    }
    var g = relDimGeometry(f, rel);
    if (!g) return out;
    if (g.type === 'angle') { out.off = Math.round(Math.hypot(uv[0] - g.X[0], uv[1] - g.X[1]) * 1e4) / 1e4; return out; }
    var n = [-g.dir[1], g.dir[0]];
    out.off = Math.round(((uv[0] - g.P[0]) * n[0] + (uv[1] - g.P[1]) * n[1]) * 1e4) / 1e4;
    var tx = UI.dimTextAlong ? UI.dimTextAlong(uv, g.P, g.dir, (g.Q[0] - g.P[0]) * g.dir[0] + (g.Q[1] - g.P[1]) * g.dir[1]) : null;
    if (tx != null) out.tx = tx;
    return out;
  }
  // Screen drawing data in the shape ui-sketch.js's drawOne takes: { lines, arrows, label, text }.
  function relDimScreenData(f, pl, rel) {
    var g = relDimGeometry(f, rel);
    if (!g) return null;
    var s = UI.cam.scale;
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
    var value = rel.v != null && !rel.driven ? rel.v : S.measure(f, rel.type, rel.refs, rel.dir);
    var label = UI.fmtNum(value, 2) + (rel.type === 'angle' ? '°' : '');
    if (rel.driven) label = '(' + label + ')';
    if (g.type === 'distance') {
      var ld = UI.linearDimScreen(pl, g.P, g.Q, g.dir, rel.off, rel.tx);
      ld.label = label;
      return ld;
    }
    var out = { lines: [], arrows: [], label: label };
    // angle: an arc of radius `off` around the intersection, from line 1's direction to line 2's (the angle the value is)
    var R = rel.off != null ? rel.off : 30 * s;
    var a1 = Math.atan2(g.d1[1], g.d1[0]), a2 = Math.atan2(g.d2[1], g.d2[0]), sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    var N = 24, pts = [];
    for (var i = 0; i <= N; i++) { var a = a1 + sweep * i / N; pts.push(scr(pl, [g.X[0] + R * Math.cos(a), g.X[1] + R * Math.sin(a)])); }
    for (var j = 0; j < N; j++) out.lines.push([pts[j], pts[j + 1]]);
    out.arrows.push({ tip: pts[0], dir: unit(pts[1], pts[0]) }, { tip: pts[N], dir: unit(pts[N - 1], pts[N]) });
    var mid = pts[N / 2], c = scr(pl, g.X), um = unit(c, mid);
    out.text = { x: mid[0] + um[0] * 10, y: mid[1] + um[1] * 10 + 4, anchor: um[0] >= -0.2 ? 'start' : 'end' };
    return out;
  }
  // Place a two-entity dimension: adds the relation (value = what it measures now) and opens the Modify box.
  function placeRelDim(f, rd, uv) {
    var pl = relDimPlacement(f, rd, uv);
    markDirty();
    var r = S.addRelation(f, rd.type, rd.refs, { off: pl.off, dir: pl.dir, tx: pl.tx });
    if (!r.ok) { UI.toast(r.error); return; }
    var idx = r.rels[0];
    App.sel = { kind: 'rel', index: idx };
    refresh();
    App.dimsStale = false;
    if (UI.drawDims) UI.drawDims();
    if (r.status !== 'ok') { askDriven(f, 'rel', idx); return; }
    UI.setStatus((rd.type === 'angle' ? 'Angle' : 'Distance') + ' dimension placed. Type a value and press Enter to drive the sketch.');
    UI.openRelDimEdit(idx);
  }

  // ------------------------------------------------------------------ driven (reference) dimensions
  // A new dimension that would over-define the sketch: ask, as SolidWorks does, whether to make it driven. The answer
  // is a page modal (#drv-driven / #drv-driving), never a browser dialog.
  function askDriven(f, kind, index) {
    var sketchId = f.id;
    function item() { var g = UI.activeSketchFeature(); return g && g.id === sketchId ? g : null; }
    UI.showModal({
      title: 'Make Dimension Driven?',
      body: '<p>Adding this dimension will make the sketch over defined or unable to solve.</p><p>Do you want to add this dimension as a driven (reference) dimension instead? A driven dimension shows the value the geometry has, in grey and in parentheses, and does not drive anything.</p>',
      buttons: [
        { id: 'drv-driven', label: 'Make this dimension driven', primary: true, action: function () { UI.closeModal(); var g = item(); if (g) setDriven(g, kind, index, true); } },
        { id: 'drv-driving', label: 'Leave this dimension driving', action: function () { UI.closeModal(); UI.setStatus('The dimension is driving and over-defines the sketch (shown yellow). Delete it, or make it driven.'); App.dimsStale = true; } }
      ]
    });
    App.drivenPrompt = { kind: kind, index: index };
  }
  // Placed dimension check (ui-sketch.js calls this after a single-entity Smart Dimension is placed): true when the
  // question was asked (the caller then does not open the Modify box).
  function askDrivenIfOver(f, kind, index) {
    if (!S.overDefines(f, kind, index)) return false;
    askDriven(f, kind, index);
    return true;
  }
  function setDriven(f, kind, index, on) {
    markDirty();
    var r = S.setDriven(f, kind, index, on);
    App.drivenPrompt = null;
    if (!r.ok) { UI.toast(r.error); return r; }
    refresh();
    App.dimsStale = true;
    UI.setStatus(on ? 'Driven dimension: its value follows the geometry. ' + S.STATUS_TEXT[r.analysis.status] + '.' : 'The dimension drives the sketch again' + (r.state !== 'ok' ? ', and over-defines it (shown yellow).' : '.'));
    return r;
  }
  // Clicking a driven dimension: it has no value to type, so offer to make it driving.
  function drivenDimClick(it) {
    var f = UI.activeSketchFeature();
    if (!f) return;
    var kind = it.rel != null ? 'rel' : 'dim', index = it.rel != null ? it.rel : it.index;
    UI.showModal({
      title: 'Driven Dimension',
      body: '<p>This is a driven (reference) dimension: it shows what the geometry measures and cannot be changed.</p>',
      buttons: [
        { id: 'drv-make-driving', label: 'Make driving', primary: true, action: function () { UI.closeModal(); setDriven(f, kind, index, false); } },
        { label: 'Close', action: UI.closeModal }
      ]
    });
  }

  // ------------------------------------------------------------------ construction geometry
  // Construction Geometry (Sketch tab): toggles `construction` on the selected sketch entities (all become
  // construction unless all already are). Construction entities are drawn dashed and are not part of any profile.
  function selectedEntities() {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out;
  }
  function toggleConstruction(list) {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    list = (list || selectedEntities()).filter(function (i) { return f.entities[i]; });
    if (!list.length) { UI.setStatus('Select sketch entities first, then click Construction Geometry.'); return null; }
    var on = list.some(function (i) { return !f.entities[i].construction; });
    markDirty();
    list.forEach(function (i) { if (on) f.entities[i].construction = true; else delete f.entities[i].construction; });
    refresh();
    UI.setStatus((list.length === 1 ? 'Entity' : list.length + ' entities') + (on ? ' changed to construction geometry.' : ' changed back to sketch geometry.'));
    return on;
  }
  function cmdCenterline() {
    if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; }
    UI.setTool('line');
    App.drawConstruction = true;
    $('sketch-hint').innerHTML = 'Centerline: click the start and end points. Centerlines are construction geometry: axes for Symmetric relations, not part of the profile.';
    UI.refreshRibbon();
  }

  // ------------------------------------------------------------------ relation icons in the #dim-layer
  function anchorOf(f, pl, ref) {
    var p = S.refPoint(f, ref);
    if (p) return scr(pl, p);
    var c = S.refCurve(f, ref);
    if (!c) return null;
    if (c.kind === 'line') return scr(pl, [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2]);
    return scr(pl, [c.c[0] + c.r * Math.SQRT1_2, c.c[1] + c.r * Math.SQRT1_2]);
  }
  function badge(layer, h, x, y, type, cls, title) {
    var g = h.svg('g', { 'class': 'rel-badge ' + (cls || ''), transform: 'translate(' + Math.round(x) + ',' + Math.round(y) + ')' }, layer);
    h.svg('rect', { x: 0, y: 0, width: 16, height: 16, rx: 2 }, g);
    var inner = h.svg('g', { transform: 'translate(1,1) scale(0.875)' }, g);
    inner.innerHTML = Icons(iconName(type), 16).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    if (title) { var t = h.svg('title', {}, g); t.textContent = title; }
    return g;
  }
  function drawRelations(f, pl, layer, h) {
    var an = App.sketchState, slots = {};
    function place(key, a) { var k = slots[key] = (slots[key] || 0) + 1; return [a[0] + 8 + (k - 1) * 18, a[1] + 6]; }
    if (f.rels) f.rels.forEach(function (rel, i) {
      var t = S.TYPES[rel.type];
      if (!t) return;
      var state = an && an.rels ? an.rels[i] : 'ok';
      if (t.dim) {
        var sc = relDimScreenData(f, pl, rel);
        if (sc) { var it = { d: rel, rel: i, state: rel.driven ? 'driven' : state }; h.drawOne(sc, it); h.list.push(it); }
        return;
      }
      // a virtual sharp (SketchSolver.filletCorner) on the lines it joins: thin extension lines to their ends, no icons
      var sh = rel.type === 'coincident' && rel.refs.length === 2 ? rel.refs.map(function (r) { var e = f.entities[refEntity(r)]; return e && e.sharp && String(r) === String(refEntity(r)); }) : null;
      if (sh && (sh[0] || sh[1])) {
        var P = S.refPoint(f, rel.refs[sh[0] ? 0 : 1]), L = S.refCurve(f, rel.refs[sh[0] ? 1 : 0]);
        if (P && L && L.kind === 'line') {
          var end = Math.hypot(L.a[0] - P[0], L.a[1] - P[1]) < Math.hypot(L.b[0] - P[0], L.b[1] - P[1]) ? L.a : L.b, s1 = scr(pl, P), s2 = scr(pl, end);
          h.svg('line', { 'class': 'sk-sharp', x1: s1[0], y1: s1[1], x2: s2[0], y2: s2[1], style: 'stroke:var(--muted);stroke-width:1;stroke-dasharray:3 2;pointer-events:none' }, layer);
          return;
        }
      }
      if (App.view.showRelations === false) return;
      var selected = App.sel && App.sel.kind === 'rel' && App.sel.index === i;
      var drawn = [];
      rel.refs.forEach(function (ref) {
        if (ref === 'O') return;
        var a = anchorOf(f, pl, ref);
        // one icon where both ends of the relation meet (a Coincident between two end points)
        if (!a || drawn.some(function (q) { return Math.hypot(q[0] - a[0], q[1] - a[1]) < 4; })) return;
        drawn.push(a);
        var p = place(Math.round(a[0] / 6) + ',' + Math.round(a[1] / 6), a);
        var g = badge(layer, h, p[0], p[1], rel.type, (state !== 'ok' ? state : '') + (selected ? ' sel' : ''), S.describe(f, rel) + (state !== 'ok' ? ' (' + stateText(state) + ')' : ''));
        g.setAttribute('data-rel', i);
        g.addEventListener('click', function (ev) { ev.stopPropagation(); App.sel = { kind: 'rel', index: i }; App.dimsStale = true; UI.updateSketches(); UI.setStatus(S.describe(f, rel) + ' — ' + stateText(state) + '. Delete removes it.'); });
      });
    });
    if (App.tempRelDim) { var tsc = relDimScreenData(f, pl, App.tempRelDim); if (tsc) h.drawOne(tsc, { d: App.tempRelDim, temp: true }); }
    // (the yellow inference icons of what is being drawn sit by the cursor: ui-sketch.js drawFeedback)
    // Add Relations selection
    (App.relPick || []).forEach(function (ref) {
      var p = S.refPoint(f, ref), c = !p && S.refCurve(f, ref);
      if (p) { var s = scr(pl, p); h.svg('circle', { 'class': 'rel-pick', cx: s[0], cy: s[1], r: 5 }, layer); }
      else if (c && c.kind === 'line') { var a = scr(pl, c.a), b = scr(pl, c.b); h.svg('line', { 'class': 'rel-pick', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, layer); }
      else if (c) {
        var pts = [];
        for (var i = 0; i <= 48; i++) { var t = i / 48 * Math.PI * 2; pts.push(scr(pl, [c.c[0] + c.r * Math.cos(t), c.c[1] + c.r * Math.sin(t)]).join(',')); }
        h.svg('polyline', { 'class': 'rel-pick', points: pts.join(' ') }, layer);
      }
    });
  }
  function stateText(s) { return { ok: 'Satisfied', redundant: 'Over Defining (redundant)', conflict: 'Not Solved (conflict)', invalid: 'Dangling' }[s] || s; }

  // ------------------------------------------------------------------ delete a relation
  function deleteRelation(index) {
    var f = UI.activeSketchFeature();
    if (!f || !f.rels || !f.rels[index]) return false;
    markDirty();
    var d = S.describe(f, f.rels[index]);
    S.deleteRelation(f, index);
    App.sel = null;
    refresh();
    UI.setStatus('Deleted ' + d + '.');
    return true;
  }

  // ------------------------------------------------------------------ Add Relations PropertyManager
  function cmdAddRelations() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    App.relPick = [];
    if (App.sel && App.sel.kind === 'entity' && f.entities[App.sel.index]) {
      var c = S.curveRefs(f, App.sel.index);
      App.relPick.push(c.length === 1 ? c[0] : String(App.sel.index));
      if (!S.refKind(f, App.relPick[0])) App.relPick = [];
    }
    UI.setTool('select');
    var spec = {
      title: 'Add Relations', icon: 'addRelation',
      message: 'Select sketch entities or points in the graphics area (click again to deselect), then click a relation to add.',
      command: { onSketchPoint: function (uv, mx, my) {
        var r = pickSketchRef(mx, my);
        if (!r) { UI.setStatus('Nothing there to select.'); return; }
        var i = App.relPick.indexOf(r);
        if (i >= 0) App.relPick.splice(i, 1); else App.relPick.push(r);
        render();
      } },
      groups: [],
      onOK: function () { App.relPick = null; App.dimsStale = true; },
      onCancel: function () { App.relPick = null; App.dimsStale = true; }
    };
    function render() {
      var picks = App.relPick || [], types = S.applicable(f, picks);
      var existing = (f.rels || []).map(function (rel, i) { return { rel: rel, i: i }; }).filter(function (x) {
        return picks.length && x.rel.refs.some(function (r) { return picks.some(function (p) { return refEntity(p) === refEntity(r) && refEntity(r) >= 0; }); });
      });
      spec.groups = [
        { title: 'Selected Entities', fields: [
          { type: 'html', html: '<div class="rel-list" id="rel-picks">' + (picks.length ? picks.map(function (r) { return '<div class="rel-row">' + S.refName(f, r) + '</div>'; }).join('') : '<div class="rel-empty">Nothing selected</div>') + '</div>' },
          { type: 'buttons', buttons: [{ label: 'Clear Selections', onclick: function () { App.relPick = []; render(); } }] }
        ] },
        { title: 'Existing Relations', fields: [{ type: 'html', html: '<div class="rel-list">' + (existing.length ? existing.map(function (x) { return '<div class="rel-row">' + Icons(iconName(x.rel.type), 14) + ' ' + S.describe(f, x.rel) + '</div>'; }).join('') : '<div class="rel-empty">None</div>') + '</div>' }] },
        { title: 'Add Relations', fields: types.length ? [{ type: 'buttons', buttons: types.map(function (t) { return { label: S.TYPES[t].name, onclick: function () { add(t); } }; }) }] : [{ type: 'static', label: '', value: picks.length ? 'No relation applies to this selection.' : 'Select entities first.' }] }
      ];
      UI.openPM(spec);
      App.dimsStale = true;
    }
    function add(type) {
      var picks = (App.relPick || []).slice();
      markDirty();
      var r = S.addRelation(f, type, picks);
      if (!r.ok) { UI.toast(r.error); return; }
      App.relPick = [];
      refresh();
      if (r.status === 'conflict') UI.setStatus(S.TYPES[type].name + ' added, but the sketch cannot satisfy it' + (r.conflicts && r.conflicts.length ? ' (it conflicts with ' + r.conflicts.join('; ') + ')' : '') + ': Over Defined (red). Delete it in Display/Delete Relations.');
      else if (r.status === 'redundant') UI.setStatus(S.TYPES[type].name + ' added; it repeats what other relations already say: Over Defined (yellow).');
      else UI.setStatus(S.TYPES[type].name + ' added. ' + S.STATUS_TEXT[r.analysis.status] + (r.analysis.dof ? ' (' + r.analysis.dof + ' degrees of freedom left).' : '.'));
      render();
    }
    render();
    return spec;
  }

  // ------------------------------------------------------------------ Display/Delete Relations PropertyManager
  function cmdDisplayRelations() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first: relations belong to a sketch.'); return; }
    var v = { filter: 'all' };
    var spec = {
      title: 'Display/Delete Relations', icon: 'relations', values: v,
      groups: [],
      onChange: function () { if (!rendering) render(); },
      onOK: function () { }, onCancel: function () { }
    };
    function rows() {
      var an = App.sketchState || S.analyze(f), selEnt = App.sel && App.sel.kind === 'entity' ? App.sel.index : null;
      return (f.rels || []).map(function (rel, i) { return { rel: rel, i: i, state: an.rels[i] || 'ok' }; }).filter(function (x) {
        if (v.filter === 'over') return x.state !== 'ok';
        if (v.filter === 'selected') return selEnt != null && x.rel.refs.some(function (r) { return refEntity(r) === selEnt; });
        return true;
      });
    }
    var rendering = false;
    function render() {
      rendering = true;
      try { renderNow(); } finally { rendering = false; }
    }
    function renderNow() {
      var list = rows(), an = App.sketchState || S.analyze(f), selIdx = App.sel && App.sel.kind === 'rel' ? App.sel.index : -1;
      spec.message = S.STATUS_TEXT[an.status] + ': ' + (f.rels ? f.rels.length : 0) + ' relation' + ((f.rels || []).length === 1 ? '' : 's') + ', ' + an.dof + ' degree' + (an.dof === 1 ? '' : 's') + ' of freedom' + (an.conflicts ? ', ' + an.conflicts + ' not solved' : '') + (an.redundant ? ', ' + an.redundant + ' over defining' : '') + '.';
      spec.messageOk = an.status === 'full';
      spec.groups = [
        { title: 'Relations', fields: [
          { type: 'select', label: 'Filter', key: 'filter', options: [['all', 'All in this sketch'], ['over', 'Overdefining/Not Solved'], ['selected', 'Selected Entities']] },
          { type: 'html', html: '<div class="rel-list" id="rel-display">' + (list.length ? list.map(function (x) {
            return '<div class="rel-row ' + x.state + (x.i === selIdx ? ' sel' : '') + '" data-rel="' + x.i + '" tabindex="0">' + Icons(iconName(x.rel.type), 14) + '<span>' + S.describe(f, x.rel) + '</span><em>' + stateText(x.state) + '</em></div>';
          }).join('') : '<div class="rel-empty">No relations</div>') + '</div>' },
          { type: 'buttons', buttons: [
            { label: 'Delete', onclick: function () { if (App.sel && App.sel.kind === 'rel') { deleteRelation(App.sel.index); render(); } else UI.toast('Select a relation in the list first.'); } },
            { label: 'Delete All', onclick: function () { if (!f.rels || !f.rels.length) return; markDirty(); var n = f.rels.length; delete f.rels; App.sel = null; refresh(); UI.setStatus('Deleted all ' + n + ' relations.'); render(); } }
          ] }
        ] }
      ];
      UI.openPM(spec);
      var box = $('rel-display');
      if (box) Array.prototype.forEach.call(box.querySelectorAll('.rel-row'), function (row) {
        row.addEventListener('click', function () { App.sel = { kind: 'rel', index: +row.getAttribute('data-rel') }; App.dimsStale = true; UI.updateSketches(); render(); });
      });
    }
    render();
    return spec;
  }

  // ------------------------------------------------------------------ dragging sketch geometry
  // Pressing on an entity or point with the Select tool drags it; the solver keeps every relation and dimension, so
  // fully defined geometry stays put and under-defined geometry follows the mouse.
  function sketchDragHook(p) {
    if (App.mode !== 'sketch' || App.tool !== 'select' || App.command) return null;
    var f = UI.activeSketchFeature(), ref = pickSketchRef(p[0], p[1]);
    if (!f || !ref || ref === 'O') return null;
    var pl = UI.activePlane(), start = null, uv0 = null, point = !!S.refPoint(f, ref), moved = false;
    if (!point) ref = String(refEntity(ref));
    // grabbing a circle or an arc on its curve changes its radius (the centre point moves it), as in SolidWorks
    var ent = f.entities[refEntity(ref)], radius = !point && ent && (ent.t === 'circle' || ent.t === 'arc');
    // At most one solve per animation frame: the first move of a frame is solved at once (no added latency), later ones
    // in the same frame only replace the pending target, solved when the frame comes (or at once on release). While
    // dragging, the sketch is redrawn without re-analysing it (its degrees of freedom cannot change mid-drag).
    var pending = null, frame = 0, drop = null;
    // A dragged end point dropped on another sketch point (within 9 px) or on a line / circle / arc (within 7 px) snaps
    // there and gets a Coincident on release, as in SolidWorks. Points that sat with it when the drag began (already
    // coincident) move with it and are no targets.
    function dropTarget(q) {
      var e0 = refEntity(ref), P0 = S.refPoint({ entities: start }, ref), best = null, bd = 9;
      function excluded(i, pt0) { return i === e0 || (pt0 && P0 && Math.abs(pt0[0] - P0[0]) < 1e-9 && Math.abs(pt0[1] - P0[1]) < 1e-9); }
      f.entities.forEach(function (e, i) {
        S.pointRefs(f, i).forEach(function (pr) {
          if (/\.mid$/.test(pr.ref) || (/\.c$/.test(pr.ref) && CENTERLESS.test(e.t))) return;
          if (excluded(i, S.refPoint({ entities: start }, pr.ref))) return;
          var s = scr(pl, pr.pt), d = Math.hypot(s[0] - q[0], s[1] - q[1]);
          if (d < bd) { bd = d; best = { ref: pr.ref, pt: pr.pt }; }
        });
      });
      var o = scr(pl, [0, 0]);
      if (!(P0 && Math.abs(P0[0]) < 1e-9 && Math.abs(P0[1]) < 1e-9) && Math.hypot(o[0] - q[0], o[1] - q[1]) < bd) best = { ref: 'O', pt: [0, 0] };
      if (best) return best;
      var uv = UI.screenToPlane(q[0], q[1], pl), hit = UI.pickEntity(q[0], q[1]);
      if (!uv || !hit || hit.index === e0) return null;
      var bc = null, bdc = 7;
      S.curveRefs(f, hit.index).forEach(function (cr) {
        var c = S.refCurve(f, cr), pt;
        if (!c) return;
        if (c.kind === 'line') {
          var dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((uv[0] - c.a[0]) * dx + (uv[1] - c.a[1]) * dy) / L2));
          pt = [c.a[0] + dx * t, c.a[1] + dy * t];
        } else {
          var vx = uv[0] - c.c[0], vy = uv[1] - c.c[1], r = Math.hypot(vx, vy);
          if (r < 1e-12) return;
          pt = [c.c[0] + vx / r * c.r, c.c[1] + vy / r * c.r];
        }
        var s = scr(pl, pt), d = Math.hypot(s[0] - q[0], s[1] - q[1]);
        if (d < bdc) { bdc = d; bc = { ref: cr, pt: pt, curve: true }; }
      });
      return bc;
    }
    function solveTo(q) {
      var uv = UI.screenToPlane(q[0], q[1], pl);
      if (!uv || !uv0) return;
      drop = point && (/\.(p\d|v\d+)$|^\d+$/.test(ref) || (/\.c$/.test(ref) && ent && /^(circle|arc)$/.test(ent.t))) ? dropTarget(q) : null;
      if (drop) uv = drop.pt.slice();
      var to = point || radius ? uv : [uv[0] - uv0[0], uv[1] - uv0[1]];
      if (S.drag(f, ref, to, start, { radius: radius }).ok) { moved = true; UI.updateSketches(); }
      if (UI.sketchSnapMark) UI.sketchSnapMark(drop ? drop.pt : null, q, drop && drop.curve, drop && /\.c$/.test(ref) && /\.c$/.test(drop.ref) ? 'concentric' : 'coincident');
    }
    // the next frame, or 50 ms when animation frames are throttled (a background tab), whichever comes first
    var timer = 0;
    function schedule() { frame = requestAnimationFrame(tick); timer = setTimeout(tick, 50); }
    function unschedule() { if (frame) cancelAnimationFrame(frame); if (timer) clearTimeout(timer); frame = timer = 0; }
    function tick() { unschedule(); if (pending) { var q = pending; pending = null; solveTo(q); schedule(); } }
    return {
      start: function () { markDirty(); start = clone(f.entities); uv0 = UI.screenToPlane(p[0], p[1], pl); App.sketchDragging = true; },
      move: function (q) {
        if (frame) { pending = q; return; }
        solveTo(q);
        schedule();
      },
      end: function () {
        unschedule();
        if (pending) { var q = pending; pending = null; solveTo(q); }
        App.sketchDragging = false;
        if (UI.sketchSnapMark) UI.sketchSnapMark(null);
        var merged = null;
        if (drop && moved) {
          // a circle / arc centre dropped on another circle / arc centre: Concentric (as SolidWorks merges them)
          var dropEnt = !/^O$/.test(drop.ref) && f.entities[refEntity(drop.ref)];
          var conc = /\.c$/.test(ref) && /\.c$/.test(drop.ref) && dropEnt && /^(circle|arc)$/.test(dropEnt.t);
          var r = conc ? S.addRelation(f, 'concentric', [ref.replace(/\.c$/, ''), drop.ref.replace(/\.c$/, '')], { rejectOver: true })
            : S.addRelation(f, 'coincident', [ref, drop.ref], { rejectOver: true });
          merged = r.ok ? (conc ? 'Concentric' : 'Coincident') + ' with ' + S.refName(f, drop.ref) + ' added. ' : null;
        }
        drop = null;
        UI.updateSketches();
        UI.refreshTree();
        var an = App.sketchState;
        if (merged) { UI.setStatus('Dragged ' + S.refName(f, ref) + '. ' + merged + (an ? S.STATUS_TEXT[an.status] + '.' : '')); return; }
        UI.setStatus(moved ?'Dragged ' + S.refName(f, ref) + '. ' + (an ? S.STATUS_TEXT[an.status] + (an.dof ? ' (' + an.dof + ' degrees of freedom)' : '') : '') : S.refName(f, ref) + ' is fully defined: it cannot be dragged.');
      }
    };
  }

  // ------------------------------------------------------------------ script / test hooks
  function activeOrThrow() { var f = UI.activeSketchFeature(); if (!f) throw new Error('No active sketch.'); return f; }
  UI.pickSketchRef = pickSketchRef;
  UI.relDimFor = relDimFor;
  UI.relDimPlacement = relDimPlacement;
  UI.placeRelDim = placeRelDim;
  UI.relDimScreen = function (f, index) { var rel = f && f.rels && f.rels[index]; var sc = rel && relDimScreenData(f, UI.activePlane(), rel); return sc ? { text: sc.text } : null; };
  UI.drawRelations = drawRelations;
  UI.deleteRelation = deleteRelation;
  UI.cmdAddRelations = cmdAddRelations;
  UI.cmdDisplayRelations = cmdDisplayRelations;
  UI.sketchDragHook = sketchDragHook;
  UI.askDrivenIfOver = askDrivenIfOver;
  UI.setDimDriven = function (kind, index, on) { var f = UI.activeSketchFeature(); return f ? setDriven(f, kind, index, on !== false) : null; };
  UI.drivenDimClick = drivenDimClick;
  UI.toggleConstruction = toggleConstruction;
  UI.cmdCenterline = cmdCenterline;
  UI.sketchStatus = function () {
    var f = UI.activeSketchFeature();
    if (!f) return null;
    var an = S.analyze(f);
    return { status: an.status, text: S.STATUS_TEXT[an.status], dof: an.dof, entities: an.entities, rels: an.rels, dims: an.dims };
  };
  if (window.anvil) {
    // anvil.relations(): the active sketch's relations with their state; anvil.addRelation(type, refs, value?)
    window.anvil.relations = function () {
      var f = activeOrThrow(), an = S.analyze(f);
      return (f.rels || []).map(function (rel, i) { return { index: i, type: rel.type, refs: rel.refs.slice(), v: rel.v, state: an.rels[i], text: S.describe(f, rel) }; });
    };
    window.anvil.addRelation = function (type, refs, value) {
      var f = activeOrThrow();
      markDirty();
      var r = S.addRelation(f, type, refs, value != null ? { value: value } : {});
      refresh();
      if (!r.ok) throw new Error(r.error);
      return { rels: r.rels, status: r.status, sketch: S.STATUS_TEXT[r.analysis.status], dof: r.analysis.dof };
    };
    window.anvil.deleteRelation = function (i) { return deleteRelation(i); };
    window.anvil.sketchStatus = UI.sketchStatus;
    // anvil.construction(i | [i…]): toggle construction geometry; anvil.driven('dim' | 'rel', i, on?)
    window.anvil.construction = function (list) { activeOrThrow(); return toggleConstruction(Array.isArray(list) ? list : [list]); };
    window.anvil.driven = function (kind, index, on) { var f = activeOrThrow(), r = setDriven(f, kind, index, on !== false); if (!r.ok) throw new Error(r.error); return r.state; };
  }
})(UI);
