// ui-transform-layout.js — Mastercam's Transform tab, lane BL: Offset ▸ Entity, Offset ▸ Chains, Layout ▸ Rectangular
// Array and Distribute, on the sketch geometry of the open sketch (Anvil's Mastercam wireframe). Each command opens a
// PropertyManager (UI.cmdTOffsetEntity, UI.cmdTOffsetChains, UI.cmdTRectArray, UI.cmdTDistribute; the Transform tab's
// buttons call UI['cmdT' + Name]()). Common to all four, as in Mastercam's function panels: the selection when the
// command starts plus what is clicked or window-selected while it is open, a live preview, ✓ applies as one undo step
// and leaves the result selected, ✓+ (Apply) applies and keeps the PropertyManager open for the next selection.
// Offset Entity and Offset Chains have Mastercam's Move / Copy. The exact offset of a chain is
// SketchSolver.contourOffset (sketch-solver.js); single entities use SketchSolver.offsetEntity, copies and moves
// SketchSolver.transformEntities. See README *Transform tab*.
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.openPM) return;
  var App = UI.App, K = UI.K, S = window.SketchSolver;
  if (!S) return;
  var NO_SKETCH = 'Open a sketch: Transform acts on sketch geometry';
  var D2R = Math.PI / 180;
  function normDeg(a) { a = a % 360; if (a < 0) a += 360; return Math.abs(a - 360) < 1e-12 ? 0 : a; }
  function cosd(a) { var m = normDeg(+a); return m === 0 ? 1 : m === 90 || m === 270 ? 0 : m === 180 ? -1 : Math.cos(m * D2R); }
  function sind(a) { var m = normDeg(+a); return m === 0 || m === 180 ? 0 : m === 90 ? 1 : m === 270 ? -1 : Math.sin(m * D2R); }
  function tidy(v) { var r = +(+v).toPrecision(12); return Math.abs(r) < 1e-10 ? 0 : r; }

  // ------------------------------------------------------------------ shared helpers
  function sketch() {
    var f = App.mode === 'sketch' && UI.activeSketchFeature ? UI.activeSketchFeature() : null;
    if (!f) UI.toast(NO_SKETCH);
    return f;
  }
  // lane BY: a click right on a line's end, a corner or a centre selects that sketch point (the Select tool's SolidWorks
  // point pick), which the command ignored (0 entities); a Transform command acts on entities, so a selected point
  // counts as its entity, and the selection becomes that entity
  function selIdx(f) {
    var out = [], pts = false;
    function add(i) { if (f.entities[i] && out.indexOf(i) < 0) out.push(i); }
    (UI.selection ? UI.selection() : []).forEach(function (s) {
      if (s.kind === 'entity') add(s.index);
      else if (s.kind === 'sketchPoint' && s.ref != null) { add(parseInt(s.ref, 10)); pts = true; }
    });
    if (App.sel && App.sel.kind === 'entity') add(App.sel.index);
    out.sort(function (a, b) { return a - b; });
    if (pts && UI.setSelection) UI.setSelection(out.map(function (i) { return { kind: 'entity', index: i }; }), { quiet: true });
    return out;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function snapshot(f) { return { entities: clone(f.entities), rels: f.rels ? clone(f.rels) : null, dims: f.dims ? clone(f.dims) : null }; }
  function restore(f, s) {
    f.entities = s.entities;
    if (s.rels) f.rels = s.rels; else delete f.rels;
    if (s.dims) f.dims = s.dims; else delete f.dims;
  }
  // One Transform, one undo step: fn() returns { ok, added, error }; a failure puts the sketch back and takes the
  // undo step back.
  function step(f, fn) {
    var saved = snapshot(f);
    UI.pushUndo(); App.sketchDirty = true;
    var r;
    try { r = fn(); } catch (e) { r = { ok: false, error: e.message }; }
    if (!r || !r.ok) { restore(f, saved); App.undo.pop(); }
    return r || { ok: false, error: 'That could not be done.' };
  }
  function changed() { App.sel = null; App.sel2 = null; App.gridStale = true; App.dimsStale = true; UI.updateSketches(); UI.refreshTree(); }
  function setPreview(list) { App.tempEntities = list || []; UI.updateTemp(); }
  function clearPreview() { setPreview([]); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); }
  function selectEntities(list) { if (UI.setSelection) UI.setSelection(list.map(function (i) { return { kind: 'entity', index: i }; })); else UI.updateSketches(); }
  // entities `list` deleted (highest index first), their relations and dimensions with them; returns how an index
  // that stays is renumbered
  function removeEntities(f, list) {
    var gone = list.slice().sort(function (a, b) { return b - a; });
    gone.forEach(function (i) {
      f.entities.splice(i, 1);
      S.removeEntity(f, i);
      if (f.dims) f.dims = f.dims.filter(function (d) { return d.e !== i; }).map(function (d) { if (d.e > i) d.e--; return d; });
    });
    return function (k) { var n = 0; gone.forEach(function (g) { if (g < k) n++; }); return k - n; };
  }
  function addEntities(f, ents) {
    var added = [];
    ents.forEach(function (e) { var c = clone(e); delete c.corner; delete c.sharp; f.entities.push(c); added.push(f.entities.length - 1); });
    return added;
  }
  var NAMES = { line: 'Line', circle: 'Circle', arc: 'Arc', rect: 'Rectangle', crect: 'Rectangle', poly: 'Polygon', slot: 'Slot', point: 'Point', polyline: 'Polyline', spline: 'Spline', ellipse: 'Ellipse', pellipse: 'Partial Ellipse', aslot: 'Arc Slot', text: 'Text' };
  function entityLabel(e, i) { return (NAMES[e && e.t] || 'Entity') + (i + 1); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  // the distance from p to entity e as drawn
  function entDist(e, p) {
    var best = Infinity;
    if (e.t === 'point') return Math.hypot(p[0] - e.x, p[1] - e.y);
    K.entityPolylines(e).forEach(function (l) {
      var pts = l.closed && l.pts.length ? l.pts.concat([l.pts[0]]) : l.pts;
      for (var k = 0; k + 1 < pts.length; k++) {
        var a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
        best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
      }
    });
    return best;
  }
  // ✓+ (Mastercam's Apply): do it, keep the PropertyManager open for the next selection
  function applyAction(fn) { return [{ title: 'OK and keep open (✓+): apply, then the next one', icon: 'okPlus', onclick: fn }]; }
  // lane BO: the last-used values of each command (Mastercam keeps them) — ui-transform.js loads after this file
  function recall(name, v, keys) { if (UI.transformMemory) { var m = UI.transformMemory.get(name); if (m) keys.forEach(function (k) { if (m[k] !== undefined) v[k] = m[k]; }); } return v; }
  function keep(name, v, keys) { if (UI.transformMemory) { var o = {}; keys.forEach(function (k) { o[k] = v[k]; }); UI.transformMemory.keep(name, o); } }
  // the result selected and the result message shown after ✓ (selecting writes its own status line: the message wins)
  function done(added, msg) { selectEntities(added); UI.setStatus(msg); Promise.resolve().then(function () { if (App.mode === 'sketch') UI.setStatus(msg); }); }
  function cancelled(title) { clearPreview(); UI.setStatus(title + ' cancelled.'); }
  function moveCopyField() { return { type: 'radio', key: 'mode', options: [['move', 'Move'], ['copy', 'Copy']] }; }

  // ------------------------------------------------------------------ Offset ▸ Entity
  // Mastercam: Transform ▸ Offset ▸ Entity. Pick one entity, then click the side it goes to (the preview follows the
  // cursor until the click); Distance, Number of copies (each copy is the previous one offset again), Move / Copy.
  // Lines, arcs, circles, rectangles, slots and polygons stay true entities; ellipses and splines give splines.
  function cmdTOffsetEntity() {
    var f = sketch();
    if (!f) return;
    var s0 = selIdx(f);
    var v = recall('offsetEntity', { ent: s0.length ? s0[s0.length - 1] : null, side: 0, d: UI.lenDefault(5), count: 1, mode: 'copy', box: 'ent' }, ['d', 'count', 'mode']);
    var cmd = {};
    function copies(side) {
      var e = f.entities[v.ent], out = [], cur = e, d = Math.abs(+v.d), n = Math.max(1, v.count | 0);
      if (!e || !(d > 0)) return null;
      for (var k = 0; k < n; k++) {
        var o = S.offsetEntity(cur, side * d);
        if (!o) return k ? out : null;
        if (e.construction) o.construction = true;
        out.push(o); cur = o;
      }
      return out;
    }
    // the side the cursor is on: the copy nearer the cursor
    function sideAt(uv) {
      var e = f.entities[v.ent], d = Math.abs(+v.d) || 1;
      if (!e) return 0;
      var a = S.offsetEntity(e, d), b = S.offsetEntity(e, -d);
      if (!a) return b ? -1 : 0;
      if (!b) return 1;
      return entDist(a, uv) <= entDist(b, uv) ? 1 : -1;
    }
    function preview(side) {
      var s = side || v.side;
      setPreview(v.ent != null && s ? copies(s) || [] : []);
    }
    function setBox(b) {
      v.box = b;
      cmd.onSketchPoint = b === 'side' ? function (uv) { var s = sideAt(uv); if (!s) return; v.side = s; setBox('done'); preview(); } : null;
      cmd.onSketchMove = b === 'side' ? function (uv) { preview(sideAt(uv)); } : null;
      UI.renderPM();
      UI.setStatus(b === 'ent' ? 'Select the entity to offset.' : b === 'side' ? 'Click the side to offset ' + entityLabel(f.entities[v.ent], v.ent) + ' to.' : 'Set the distance and the number of copies, then ✓.');
    }
    function apply() {
      if (v.ent == null || !f.entities[v.ent]) { UI.toast('Select the entity to offset.'); return false; }
      if (!v.side) { UI.toast('Click the side to offset to.'); return false; }
      if (!(+v.d > 0)) { UI.toast('The offset distance must be a positive number.'); return false; }
      var r = step(f, function () {
        var list = copies(v.side);
        if (!list || !list.length) return { ok: false, error: 'The offset distance is too large for ' + entityLabel(f.entities[v.ent], v.ent) + '.' };
        var added = addEntities(f, list);
        if (v.mode === 'move') { var map = removeEntities(f, [v.ent]); added = added.map(map); }
        return { ok: true, added: added };
      });
      if (!r.ok) { UI.toast(r.error); return false; }
      clearPreview(); changed();
      keep('offsetEntity', v, ['d', 'count', 'mode']);
      r.msg = (v.mode === 'move' ? 'Moved: ' : 'Offset: ') + plural(r.added.length, 'copy', 'copies') + ' at ' + UI.fmtLen(+v.d) + '.';
      UI.setStatus(r.msg);
      return r;
    }
    UI.openPM({
      title: 'Offset Entity', icon: 'offset', values: v, command: cmd, keepSelection: true, transform: 'offsetEntity',
      message: 'Select an entity, then click the side to offset it to. Each copy is the one before offset again.',
      onSelection: function () {
        if (v.box === 'side') return;   // the click goes to the side; once it is set, a click on another entity starts again
        var s = selIdx(f);
        if (!s.length) return;
        var i = s.indexOf(v.ent) >= 0 && s.length > 1 ? s.filter(function (x) { return x !== v.ent; }).pop() : s[s.length - 1];
        if (f.entities[i].t === 'point' || f.entities[i].t === 'text') { UI.toast('Points and text are not offset.'); return; }
        v.ent = i; v.side = 0;
        setBox('side');
      },
      groups: [
        { title: 'Entity', fields: [{ type: 'pick', icon: 'offset', placeholder: 'Select the entity to offset…', value: function (x) { return x.ent != null && f.entities[x.ent] ? entityLabel(f.entities[x.ent], x.ent) + (x.side ? '' : ' — click the side') : ''; },
          active: function (x) { return x.box === 'ent' || x.box === 'side'; }, onActivate: function () { v.ent = null; v.side = 0; if (UI.setSelection) UI.setSelection([]); setBox('ent'); preview(); } }] },
        { title: 'Parameters', fields: [
          moveCopyField(),
          { type: 'number', label: 'Distance', key: 'd', unit: 'u', min: 0 },
          { type: 'number', label: 'Number of copies', key: 'count', step: 1, min: 1 },
          { type: 'buttons', buttons: [{ label: 'Flip side', onclick: function () { if (!v.side) { UI.toast('Click the side first.'); return; } v.side = -v.side; preview(); } }] }
        ] }
      ],
      onChange: function () { preview(); },
      okBlocked: function () { return v.ent == null ? 'Select the entity to offset.' : !v.side ? 'Click the side to offset to.' : ''; },
      onOK: function () { var r = apply(); if (!r) return false; done(r.added, r.msg); },
      extraActions: applyAction(function () { if (apply()) { v.ent = null; v.side = 0; if (UI.setSelection) UI.setSelection([]); setBox('ent'); } }),
      onCancel: function () { cancelled('Offset Entity'); },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    if (v.ent != null && f.entities[v.ent]) setBox('side'); else { v.ent = null; setBox('ent'); }
    preview();
  }

  // ------------------------------------------------------------------ Offset ▸ Chains (Mastercam Offset Contour)
  // Chaining as Mastercam does: a click on a line or an arc takes the whole chain joined to it end to end (a click on
  // a chain already taken drops it), a circle is a chain of its own, a window takes the chains among what it selects.
  // A closed chain runs counter-clockwise (Left is inside, Right outside); an open one runs the way the picked entity
  // is drawn; Reverse turns them all round. Distance, side (Left / Right / Both), Number of copies (at 1 ×, 2 × …
  // the distance), Corners (None: sharp, Sharp: arcs on corners sharper than the Max angle, All: arcs on every
  // outside corner), Move / Copy. Incremental depth is a 3D value: shown, ignored in a 2D sketch.
  function chainEnts(c) { return c.circle != null ? [c.circle] : c.items.map(function (it) { return it.i; }); }
  function chainArea(E, items) {
    var pts = [];
    items.forEach(function (it) {
      var e = E[it.i], p1 = e.t === 'line' ? [e.x1, e.y1] : [e.cx + e.r * Math.cos(e.a0 * D2R), e.cy + e.r * Math.sin(e.a0 * D2R)];
      var p2 = e.t === 'line' ? [e.x2, e.y2] : [e.cx + e.r * Math.cos(e.a1 * D2R), e.cy + e.r * Math.sin(e.a1 * D2R)];
      if (e.t === 'arc') {
        var mid = [], nS = 8;
        for (var k = 1; k < nS; k++) { var a = (e.a0 + (e.a1 - e.a0) * k / nS) * D2R; mid.push([e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]); }
        if (it.dir === -1) mid.reverse();
        pts.push(it.dir === -1 ? p2 : p1); pts = pts.concat(mid);
      } else pts.push(it.dir === -1 ? p2 : p1);
    });
    var A = 0;
    for (var q = 0; q < pts.length; q++) { var p = pts[q], r = pts[(q + 1) % pts.length]; A += p[0] * r[1] - r[0] * p[1]; }
    return A / 2;
  }
  function reverseChain(c) { if (c.items) { c.items = c.items.slice().reverse().map(function (it) { return { i: it.i, dir: -it.dir }; }); } c.rev = !c.rev; return c; }
  // the chains among entities idx (expand: each grows through the whole sketch, as a chaining click does)
  function chainsOf(f, idx, expand) {
    var out = [], E = f.entities;
    idx.forEach(function (i) { if (E[i] && E[i].t === 'circle') out.push({ circle: i, closed: true }); });
    var curves = idx.filter(function (i) { return E[i] && (E[i].t === 'line' || E[i].t === 'arc'); });
    if (curves.length) S.offsetChains(f, curves, expand).forEach(function (c) {
      var ch = { items: c.items, closed: c.closed };
      if (c.closed && chainArea(E, c.items) < 0) reverseChain(ch), ch.rev = false;
      out.push(ch);
    });
    return out;
  }
  function cmdTOffsetChains() {
    var f = sketch();
    if (!f) return;
    var CH = ['d', 'side', 'count', 'corners', 'maxAngle', 'mode', 'depth'];
    var v = recall('offsetChains', { chains: [], d: UI.lenDefault(5), side: 'left', count: 1, corners: 'none', maxAngle: 135, mode: 'copy', depth: 0, reversed: false }, CH);
    var syncing = false;
    function allEnts() { var out = []; v.chains.forEach(function (c) { out = out.concat(chainEnts(c)); }); return out.sort(function (a, b) { return a - b; }); }
    // lane BY: the chains' selection said "5 sketch entities selected." in the status bar; it says what was taken and what
    // is next
    function showSel() {
      syncing = true; try { selectEntities(allEnts()); } finally { syncing = false; }
      var n = allEnts().length;
      if (v.chains.length) UI.setStatus('Offset Chains: ' + plural(v.chains.length, 'chain', 'chains') + ' (' + plural(n, 'entity', 'entities') + '); type the Distance, pick Left / Right, Enter (✓) offsets.');
    }
    function take(list) { v.chains = list; if (v.reversed) v.chains.forEach(reverseChain); }
    var bad = selIdx(f).filter(function (i) { var t = f.entities[i].t; return t !== 'line' && t !== 'arc' && t !== 'circle'; });
    take(chainsOf(f, selIdx(f), false));
    function result() {
      var out = [], d = Math.abs(+v.d), n = Math.max(1, v.count | 0), sides = v.side === 'both' ? [1, -1] : v.side === 'right' ? [-1] : [1], err = null;
      if (!(d > 0)) return { ok: false, error: 'The offset distance must be a positive number.' };
      v.chains.forEach(function (c) {
        sides.forEach(function (s) {
          for (var k = 1; k <= n; k++) {
            if (c.circle != null) {
              var e = f.entities[c.circle], r = e.r - (c.rev ? -1 : 1) * s * k * d;
              if (r > 1e-9) out.push({ t: 'circle', cx: e.cx, cy: e.cy, r: r }); else err = err || 'The offset distance is too large for ' + entityLabel(e, c.circle) + '.';
              continue;
            }
            var res = S.contourOffset(f.entities, c.items, c.closed, s * k * d, { corners: v.corners, maxAngle: +v.maxAngle });
            if (res.ok) out = out.concat(res.entities); else err = err || res.error;
          }
        });
      });
      if (!out.length) return { ok: false, error: err || 'Select the chains to offset.' };
      return { ok: true, entities: out, warning: err };
    }
    function preview() { var r = v.chains.length ? result() : null; setPreview(r && r.ok ? r.entities : []); if (r && !r.ok) UI.setStatus(r.error); }
    function apply() {
      if (!v.chains.length) { UI.toast('Select the chains to offset.'); return false; }
      var r = step(f, function () {
        var g = result();
        if (!g.ok) return g;
        var added = addEntities(f, g.entities);
        if (v.mode === 'move') { var map = removeEntities(f, allEnts()); added = added.map(map); }
        return { ok: true, added: added, warning: g.warning };
      });
      if (!r.ok) { UI.toast(r.error); return false; }
      clearPreview(); changed();
      keep('offsetChains', v, CH);
      r.msg = 'Offset Chains: ' + plural(v.chains.length, 'chain', 'chains') + ', ' + plural(r.added.length, 'entity', 'entities') + (v.mode === 'move' ? ' (moved)' : '') + '.' + (r.warning ? ' ' + r.warning : '');
      UI.setStatus(r.msg);
      return r;
    }
    UI.openPM({
      title: 'Offset Chains', icon: 'offset', values: v, keepSelection: true, transform: 'offsetChains',
      message: 'Click a line or an arc to take its chain (a click on a taken chain drops it), or drag a window. Left / Right are seen along the chain: a closed chain runs counter-clockwise.',
      onSelection: function () {
        if (syncing) return;
        var s = selIdx(f);
        if (s.join() === allEnts().join()) return;
        take(chainsOf(f, s, false));
        UI.renderPM(); preview();
      },
      onEntityPick: function (hit) {
        var i = hit && hit.index, e = f.entities[i];
        if (!e) return true;
        if (e.t !== 'line' && e.t !== 'arc' && e.t !== 'circle') { UI.toast('Offset Chains takes lines, arcs and circles: use Offset Entity for ' + (NAMES[e.t] || 'that entity').toLowerCase() + 's.'); return true; }
        var at = -1;
        v.chains.forEach(function (c, k) { if (chainEnts(c).indexOf(i) >= 0) at = k; });
        if (at >= 0) v.chains.splice(at, 1);
        else { var c = chainsOf(f, [i], true)[0]; if (c) { if (v.reversed) reverseChain(c); v.chains.push(c); } }
        showSel(); UI.renderPM(); preview();
        return true;
      },
      groups: [
        { title: 'Chains', fields: [
          { type: 'pick', icon: 'offset', placeholder: 'Click a chain…', value: function (x) { return x.chains.length ? plural(x.chains.length, 'chain', 'chains') : ''; },
            items: function (x) { return x.chains.map(function (c) { return { label: c.circle != null ? entityLabel(f.entities[c.circle], c.circle) : (c.closed ? 'Closed' : 'Open') + ' chain: ' + plural(c.items.length, 'entity', 'entities') }; }); },
            onRemove: function (x, k) { x.chains.splice(k, 1); showSel(); UI.renderPM(); preview(); },
            onClear: function (x) { x.chains.length = 0; showSel(); UI.renderPM(); preview(); } },
          { type: 'buttons', buttons: [{ label: 'Reverse', onclick: function () { v.reversed = !v.reversed; v.chains.forEach(reverseChain); preview(); UI.setStatus('Chain direction reversed: Left and Right swap.'); } }] }
        ] },
        { title: 'Parameters', fields: [
          moveCopyField(),
          { type: 'number', label: 'Distance', key: 'd', unit: 'u', min: 0 },
          { type: 'radio', key: 'side', options: [['left', 'Left'], ['right', 'Right'], ['both', 'Both']] },
          { type: 'number', label: 'Number of copies', key: 'count', step: 1, min: 1 },
          { type: 'number', label: 'Incremental depth (2D: ignored)', key: 'depth', unit: 'u' }
        ] },
        { title: 'Corners', fields: [
          { type: 'radio', key: 'corners', rerender: true, options: [['none', 'None'], ['sharp', 'Sharp'], ['all', 'All']] },
          { type: 'number', label: 'Max angle', key: 'maxAngle', unit: '°', min: 0, show: function (x) { return x.corners === 'sharp'; } }
        ] }
      ],
      onChange: function () { preview(); },
      okBlocked: function () { return v.chains.length ? '' : 'Select the chains to offset.'; },
      onOK: function () { var r = apply(); if (!r) return false; done(r.added, r.msg); },
      extraActions: applyAction(function () { if (apply()) { v.chains = []; showSel(); UI.renderPM(); preview(); UI.setStatus('Select the next chains to offset.'); } }),
      onCancel: function () { cancelled('Offset Chains'); },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    if (bad.length) UI.setStatus('Offset Chains takes lines, arcs and circles: ' + plural(bad.length, 'entity was', 'entities were') + ' left out.');
    else if (!v.chains.length) UI.setStatus('Click a line or an arc of the chain to offset.');
    showSel();
    preview();
  }

  // ------------------------------------------------------------------ Layout ▸ Rectangular Array
  // Mastercam: Transform ▸ Rectangular Array. The selection is copied into a grid: Direction 1 (Number of instances,
  // Distance, Angle) and Direction 2 (Number of instances, Distance, Angle measured from direction 1), each one way,
  // the other way or both ways. The original is instance (1, 1); copies only. Relations among the copied entities
  // are copied with them.
  var ARRAY_DIRS = [['pos', 'One way'], ['neg', 'Reverse'], ['both', 'Both ways']];
  function arrayIndices(n, dir) {
    var out = [], k;
    n = Math.max(1, n | 0);
    if (dir === 'both') for (k = -(n - 1); k <= n - 1; k++) out.push(k);
    else for (k = 0; k < n; k++) out.push(dir === 'neg' ? -k : k);
    return out;
  }
  // the moves of the copies: [{ dx, dy, i, j }]
  function arrayOffsets(v) {
    var a1 = +v.a1 || 0, a2 = a1 + (v.a2 == null ? 90 : +v.a2), d1 = +v.d1 || 0, d2 = +v.d2 || 0;
    // lane BO: exact at the right angles (cos 90° is 0, not 6e-17) so a 90° array lands on round coordinates
    var u1 = [cosd(a1), sind(a1)], u2 = [cosd(a2), sind(a2)], out = [];
    arrayIndices(v.n1, v.dir1).forEach(function (i) {
      arrayIndices(v.n2, v.dir2).forEach(function (j) {
        if (!i && !j) return;
        out.push({ i: i, j: j, dx: tidy(i * d1 * u1[0] + j * d2 * u2[0]), dy: tidy(i * d1 * u1[1] + j * d2 * u2[1]) });
      });
    });
    return out;
  }
  function cmdTRectArray() {
    var f = sketch();
    if (!f) return;
    var RA = ['n1', 'd1', 'a1', 'dir1', 'n2', 'd2', 'a2', 'dir2'];
    var v = recall('rectArray', { entities: selIdx(f), n1: 3, d1: UI.lenDefault(25), a1: 0, dir1: 'pos', n2: 1, d2: UI.lenDefault(25), a2: 90, dir2: 'pos' }, RA);
    function check() {
      var offs = arrayOffsets(v);
      if (!offs.length) return 'Set more than one instance.';
      if ((Math.max(1, v.n1 | 0) > 1 && !(Math.abs(+v.d1) > 0)) || (Math.max(1, v.n2 | 0) > 1 && !(Math.abs(+v.d2) > 0))) return 'The distance must not be zero.';
      return '';
    }
    function preview() {
      var out = [];
      if (v.entities.length && !check()) arrayOffsets(v).forEach(function (o) { v.entities.forEach(function (i) { var c = f.entities[i] && S.xfEntity(f.entities[i], { dx: o.dx, dy: o.dy }); if (c) { delete c.sharp; out.push(c); } }); });
      setPreview(out);
    }
    function apply() {
      if (!v.entities.length) { UI.toast('Select the entities to array.'); return false; }
      var why = check();
      if (why) { UI.toast(why); return false; }
      var offs = arrayOffsets(v), sel = v.entities.slice();
      var r = step(f, function () {
        var added = [];
        for (var k = 0; k < offs.length; k++) {
          var q = S.transformEntities(f, sel, { dx: offs[k].dx, dy: offs[k].dy }, { copy: true, count: 1, keepRelations: true });
          if (!q.ok) return q;
          added = added.concat(q.added);
        }
        return { ok: true, added: added };
      });
      if (!r.ok) { UI.toast(r.error); return false; }
      clearPreview(); changed();
      keep('rectArray', v, RA);
      r.msg = 'Rectangular Array: ' + plural(offs.length + 1, 'instance', 'instances') + ' (' + plural(r.added.length, 'entity', 'entities') + ' added).';
      UI.setStatus(r.msg);
      return r;
    }
    var dirFields = function (k) {
      return [
        { type: 'number', label: 'Number of instances', key: 'n' + k, step: 1, min: 1 },
        { type: 'number', label: 'Distance', key: 'd' + k, unit: 'u' },
        { type: 'number', label: k === 1 ? 'Angle' : 'Angle from direction 1', key: 'a' + k, unit: '°' },
        { type: 'radio', key: 'dir' + k, options: ARRAY_DIRS }
      ];
    };
    UI.openPM({
      title: 'Rectangular Array', icon: 'sketchPattern', values: v, keepSelection: true, transform: 'rectArray',
      message: 'Select the entities (click or window), then set the instances and distances. The original is instance 1, 1.',
      onSelection: function () { var s = selIdx(f); if (s.join() === v.entities.join()) return; v.entities = s; UI.renderPM(); preview(); },
      groups: [
        { title: 'Entities', fields: [{ type: 'pick', icon: 'sketchPattern', placeholder: 'Select sketch entities…', value: function (x) { return x.entities.length ? plural(x.entities.length, 'entity', 'entities') : ''; },
          items: function (x) { return x.entities.map(function (i) { return { label: entityLabel(f.entities[i], i) }; }); },
          onRemove: function (x, k) { x.entities.splice(k, 1); selectEntities(x.entities); UI.renderPM(); preview(); },
          onClear: function (x) { x.entities.length = 0; selectEntities([]); UI.renderPM(); preview(); } }] },
        { title: 'Direction 1', fields: dirFields(1) },
        { title: 'Direction 2', fields: dirFields(2) }
      ],
      onChange: function () { preview(); },
      okBlocked: function () { return !v.entities.length ? 'Select the entities to array.' : check(); },
      onOK: function () { var r = apply(); if (!r) return false; done(r.added, r.msg); },
      extraActions: applyAction(function () { if (apply()) { v.entities = []; selectEntities([]); UI.renderPM(); preview(); UI.setStatus('Select the next entities to array.'); } }),
      onCancel: function () { cancelled('Rectangular Array'); },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    if (!v.entities.length) UI.setStatus('Select the entities to array in the graphics area.');
    preview();
  }

  // ------------------------------------------------------------------ Layout ▸ Distribute
  // Mastercam: Transform ▸ Distribute. The selected entities fall into groups (entities whose boxes touch or overlap
  // are one group: a part's outline with its holes), ordered along the direction (X, Y, or an angle, which a click on
  // a line can set). Evenly: the first and the last group stay and the others are spaced evenly between them; Fixed:
  // each group follows the one before at the Spacing. By Centers spaces the groups' box centres, By Gaps the gaps
  // between their boxes. Only the position along the direction changes.
  // the extent of entity e along unit direction u: [lo, hi] (exact for lines, arcs, circles, points)
  function extentAlong(e, u) {
    var vals = [];
    function pt(x, y) { vals.push(x * u[0] + y * u[1]); }
    if (e.t === 'line') { pt(e.x1, e.y1); pt(e.x2, e.y2); }
    else if (e.t === 'point') pt(e.x, e.y);
    else if (e.t === 'circle') { var c = e.cx * u[0] + e.cy * u[1]; vals.push(c - e.r, c + e.r); }
    else if (e.t === 'arc') {
      pt(e.cx + e.r * Math.cos(e.a0 * D2R), e.cy + e.r * Math.sin(e.a0 * D2R));
      pt(e.cx + e.r * Math.cos(e.a1 * D2R), e.cy + e.r * Math.sin(e.a1 * D2R));
      var au = Math.atan2(u[1], u[0]) / D2R;
      [au, au + 180].forEach(function (a) { var t = ((a - e.a0) % 360 + 360) % 360; if (t <= e.a1 - e.a0 + 1e-9) pt(e.cx + e.r * Math.cos(a * D2R), e.cy + e.r * Math.sin(a * D2R)); });
    } else K.entityPolylines(e).forEach(function (l) { l.pts.forEach(function (p) { pt(p[0], p[1]); }); });
    if (!vals.length) return null;
    return [Math.min.apply(null, vals), Math.max.apply(null, vals)];
  }
  // groups of entities idx whose boxes overlap or touch (union-find over their X / Y boxes)
  function distributeGroups(f, idx) {
    var box = {}, parent = {};
    idx.forEach(function (i) {
      var x = extentAlong(f.entities[i], [1, 0]), y = extentAlong(f.entities[i], [0, 1]);
      if (x && y) { box[i] = [x[0], y[0], x[1], y[1]]; parent[i] = i; }
    });
    var ids = Object.keys(box).map(Number), sc = 1;
    ids.forEach(function (i) { box[i].forEach(function (q) { sc = Math.max(sc, Math.abs(q)); }); });
    var tol = 1e-9 * sc;
    function root(i) { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; }
    for (var a = 0; a < ids.length; a++) for (var b = a + 1; b < ids.length; b++) {
      var A = box[ids[a]], B = box[ids[b]];
      if (A[0] <= B[2] + tol && B[0] <= A[2] + tol && A[1] <= B[3] + tol && B[1] <= A[3] + tol) parent[root(ids[a])] = root(ids[b]);
    }
    var groups = {};
    ids.forEach(function (i) { var r = root(i); (groups[r] = groups[r] || []).push(i); });
    return Object.keys(groups).map(function (k) { return groups[k].sort(function (p, q) { return p - q; }); });
  }
  function distributeDir(v) { var a = v.dir === 'x' ? 0 : v.dir === 'y' ? 90 : +v.angle || 0; return [Math.cos(a * D2R), Math.sin(a * D2R)]; }
  // the moves: [{ ents, dx, dy }] or { error }
  function distributeMoves(f, v) {
    var u = distributeDir(v), groups = distributeGroups(f, v.entities).map(function (g) {
      var lo = Infinity, hi = -Infinity;
      g.forEach(function (i) { var x = extentAlong(f.entities[i], u); if (x) { lo = Math.min(lo, x[0]); hi = Math.max(hi, x[1]); } });
      return { ents: g, lo: lo, hi: hi, c: (lo + hi) / 2 };
    });
    var fixed = v.method === 'fixed';
    if (groups.length < (fixed ? 2 : 3)) return { error: fixed ? 'Select at least two groups of entities to distribute.' : 'Select at least three groups of entities: the first and the last stay, the ones between are spaced evenly.' };
    groups.sort(function (p, q) { return p.c - q.c || p.lo - q.lo; });
    var n = groups.length, first = groups[0], last = groups[n - 1], s = +v.spacing || 0, out = [];
    if (fixed && !(v.by === 'gaps' ? s >= 0 : s > 0)) return { error: 'The spacing must be a positive number.' };
    var prevHi = first.hi, gap;
    if (!fixed && v.by === 'gaps') {
      var widths = 0;
      groups.forEach(function (g) { widths += g.hi - g.lo; });
      gap = (last.hi - first.lo - widths) / (n - 1);
    }
    groups.forEach(function (g, k) {
      if (!k) return;
      var t;
      if (v.by === 'gaps') {
        if (!fixed && k === n - 1) return;
        var lo = prevHi + (fixed ? s : gap);
        t = lo - g.lo;
        prevHi = g.hi + t;
      } else {
        if (!fixed && k === n - 1) return;
        t = (fixed ? first.c + k * s : first.c + k * (last.c - first.c) / (n - 1)) - g.c;
      }
      out.push({ ents: g.ents, t: t, dx: t * u[0], dy: t * u[1] });
    });
    return { moves: out, groups: groups.length };
  }
  function cmdTDistribute() {
    var f = sketch();
    if (!f) return;
    var DI = ['dir', 'angle', 'method', 'by', 'spacing'];
    var v = recall('distribute', { entities: selIdx(f), dir: 'x', angle: 0, method: 'even', by: 'centers', spacing: UI.lenDefault(10), box: 'entities' }, DI);
    function preview() {
      var out = [];
      if (v.entities.length) {
        var m = distributeMoves(f, v);
        if (m.moves) m.moves.forEach(function (mv) { if (Math.abs(mv.t) > 1e-12) mv.ents.forEach(function (i) { var c = S.xfEntity(f.entities[i], { dx: mv.dx, dy: mv.dy }); if (c) out.push(c); }); });
        else UI.setStatus(m.error);
      }
      setPreview(out);
    }
    function apply() {
      if (!v.entities.length) { UI.toast('Select the entities to distribute.'); return false; }
      var m = distributeMoves(f, v);
      if (m.error) { UI.toast(m.error); return false; }
      var sel = v.entities.slice();
      var r = step(f, function () {
        for (var k = 0; k < m.moves.length; k++) {
          var mv = m.moves[k];
          if (Math.abs(mv.t) <= 1e-12) continue;
          var q = S.transformEntities(f, mv.ents, { dx: mv.dx, dy: mv.dy }, { keepRelations: false });
          if (!q.ok) return q;
        }
        return { ok: true, added: sel };
      });
      if (!r.ok) { UI.toast(r.error); return false; }
      clearPreview(); changed();
      keep('distribute', v, DI);
      r.msg = 'Distribute: ' + plural(m.groups, 'group', 'groups') + ' spaced ' + (v.method === 'fixed' ? 'at ' + UI.fmtLen(+v.spacing) : 'evenly') + ' by ' + (v.by === 'gaps' ? 'gaps' : 'centers') + '.';
      UI.setStatus(r.msg);
      return r;
    }
    function setBox(b) { v.box = b; UI.renderPM(); UI.setStatus(b === 'line' ? 'Click a line: its angle sets the direction.' : 'Select the entities to distribute.'); }
    UI.openPM({
      title: 'Distribute', icon: 'lpattern', values: v, keepSelection: true, transform: 'distribute',
      message: 'Select the entities (click or window). Entities whose boxes touch are one group; the groups are spaced along the direction.',
      onSelection: function () { if (v.box !== 'entities') return; var s = selIdx(f); if (s.join() === v.entities.join()) return; v.entities = s; UI.renderPM(); preview(); },
      onEntityPick: function (hit) {
        if (v.box !== 'line') return false;
        var e = hit && f.entities[hit.index];
        if (!e || e.t !== 'line') { UI.toast('Click a line for the direction.'); return true; }
        v.angle = Math.round(Math.atan2(e.y2 - e.y1, e.x2 - e.x1) / D2R * 1e9) / 1e9;
        setBox('entities'); preview();
        return true;
      },
      groups: [
        { title: 'Entities', fields: [{ type: 'pick', icon: 'lpattern', placeholder: 'Select sketch entities…', value: function (x) { return x.entities.length ? plural(x.entities.length, 'entity', 'entities') : ''; },
          active: function (x) { return x.box === 'entities'; }, onActivate: function () { setBox('entities'); },
          items: function (x) { return x.entities.map(function (i) { return { label: entityLabel(f.entities[i], i) }; }); },
          onRemove: function (x, k) { x.entities.splice(k, 1); selectEntities(x.entities); UI.renderPM(); preview(); },
          onClear: function (x) { x.entities.length = 0; selectEntities([]); UI.renderPM(); preview(); } }] },
        { title: 'Direction', fields: [
          { type: 'radio', key: 'dir', rerender: true, options: [['x', 'Along X'], ['y', 'Along Y'], ['angle', 'At an angle']] },
          { type: 'number', label: 'Angle', key: 'angle', unit: '°', show: function (x) { return x.dir === 'angle'; } },
          { type: 'pick', icon: 'line', placeholder: 'Click a line for the angle…', show: function (x) { return x.dir === 'angle'; }, value: function (x) { return x.box === 'line' ? '' : ''; },
            active: function (x) { return x.box === 'line'; }, onActivate: function () { setBox(v.box === 'line' ? 'entities' : 'line'); } }
        ] },
        { title: 'Spacing', fields: [
          { type: 'radio', key: 'method', rerender: true, options: [['even', 'Evenly between the first and the last'], ['fixed', 'Fixed spacing']] },
          { type: 'number', label: 'Spacing', key: 'spacing', unit: 'u', show: function (x) { return x.method === 'fixed'; } },
          { type: 'radio', key: 'by', options: [['centers', 'By centers'], ['gaps', 'By gaps between boxes']] }
        ] }
      ],
      onChange: function () { preview(); },
      okBlocked: function () { return v.entities.length ? '' : 'Select the entities to distribute.'; },
      onOK: function () { var r = apply(); if (!r) return false; done(r.added, r.msg); },
      extraActions: applyAction(function () { if (apply()) { v.entities = []; selectEntities([]); UI.renderPM(); preview(); } }),
      onCancel: function () { cancelled('Distribute'); },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    if (!v.entities.length) UI.setStatus('Select the entities to distribute in the graphics area.');
    preview();
  }

  UI.cmdTOffsetEntity = cmdTOffsetEntity;
  UI.cmdTOffsetChains = cmdTOffsetChains;
  UI.cmdTRectArray = cmdTRectArray;
  UI.cmdTDistribute = cmdTDistribute;
  // for tests and scripts: the groups and moves Distribute makes
  UI.transformLayout = { distributeGroups: distributeGroups, distributeMoves: distributeMoves, arrayOffsets: arrayOffsets, chainsOf: chainsOf };
})();
