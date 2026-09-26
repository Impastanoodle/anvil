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
    line: 'Click the start point, then each next point. <b>Esc</b> or right-click ends the chain.',
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
    if (App.tempDim) { App.tempDim = null; App.dimsStale = true; }
    if (App.tempRelDim) { App.tempRelDim = null; App.dimsStale = true; }
    UI.updateTemp();
    if (!keep) { App.tool = 'select'; viewport.classList.remove('tool-cross'); UI.refreshRibbon(); if (App.mode === 'sketch') { $('sketch-hint').innerHTML = TOOL_HINTS.select; } }
  }

  function snap(uv) {
    var step = UI.snapStep();
    var out = [Math.round(uv[0] / step) * step, Math.round(uv[1] / step) * step];
    var f = UI.activeSketchFeature();
    if (!f) return out;
    var pl = UI.activePlane(), scr = UI.worldToScreen(K.to3D(pl, uv[0], uv[1]));
    var best = null, bestD = 9;
    var cands = [];
    f.entities.forEach(function (e) { K.entitySnapPoints(e).forEach(function (p) { cands.push(p); }); });
    App.toolState.pts.forEach(function (p) { cands.push(p); });
    cands.push([0, 0]);
    cands.forEach(function (p) {
      var s = UI.worldToScreen(K.to3D(pl, p[0], p[1]));
      var d = Math.hypot(s[0] - scr[0], s[1] - scr[1]);
      if (d < bestD) { bestD = d; best = p; }
    });
    if (best) return [best[0], best[1]];
    // axis alignment with the previous point
    var prev = App.toolState.pts[App.toolState.pts.length - 1];
    if (prev) {
      var s0 = UI.worldToScreen(K.to3D(pl, prev[0], prev[1]));
      if (Math.abs(s0[0] - scr[0]) < 6) out[0] = prev[0];
      if (Math.abs(s0[1] - scr[1]) < 6) out[1] = prev[1];
    }
    return out;
  }

  function toolEntities(pts, cur) {
    var t = App.tool, all = pts.concat(cur ? [cur] : []);
    if (all.length < 2 && t !== 'point') return [];
    var a = all[0], b = all[1], c = all[2];
    switch (t) {
      case 'line': return [{ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }];
      case 'rect': return [{ t: 'rect', x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }];
      case 'crect': return [{ t: 'crect', cx: a[0], cy: a[1], w: Math.abs(b[0] - a[0]) * 2, h: Math.abs(b[1] - a[1]) * 2 }];
      case 'circle': return [{ t: 'circle', cx: a[0], cy: a[1], r: Math.hypot(b[0] - a[0], b[1] - a[1]) }];
      case 'polygon': {
        var n = (App.toolParams && App.toolParams.sides) || 6;
        return [{ t: 'poly', cx: a[0], cy: a[1], r: Math.hypot(b[0] - a[0], b[1] - a[1]), n: n, rot: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI }];
      }
      case 'arc': {
        var r = Math.hypot(b[0] - a[0], b[1] - a[1]);
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
    var p = snap(raw);
    var st = App.toolState;
    if (App.tool === 'line' && st.pts.length && Math.abs(p[0] - st.pts[0][0]) < 1e-9 && Math.abs(p[1] - st.pts[0][1]) < 1e-9 && st.chainStart) {
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
    var p = App.tool === 'select' || App.tool === 'dimension' ? raw : snap(raw);
    $('status-coords').textContent = 'X: ' + UI.fmtNum(p[0], 2).padStart(9) + '   Y: ' + UI.fmtNum(p[1], 2).padStart(9) + '  ' + UI.unitLabel();
    if (App.tool === 'dimension') { dimToolMove(raw); return; }
    if (App.tool !== 'select' && App.toolState.pts.length) {
      App.tempEntities = toolEntities(App.toolState.pts, p);
      UI.updateTemp();
      // yellow inference icons: the relations the entity being drawn would get
      var f = UI.activeSketchFeature(), prev = JSON.stringify(App.inferPreview || []);
      App.inferPreview = f && window.SketchSolver && App.tempEntities.length === 1 ? SketchSolver.inferPreview(f, App.tempEntities[0]) : [];
      if (JSON.stringify(App.inferPreview) !== prev) App.dimsStale = true;
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
    while (dimLayer.firstChild) dimLayer.removeChild(dimLayer.firstChild);
    var f = UI.activeSketchFeature();
    if (!f || App.mode !== 'sketch') { if (dimEditing) closeDimEdit(false); return []; }
    var pl = UI.activePlane(), placed = f.dims || [], list = [], stale = [];
    placed.forEach(function (d, i) { list.push({ d: d, index: i }); });
    if (App.view.showDims) f.entities.forEach(function (e, i) { autoDims(e, i, placed).forEach(function (d) { list.push({ d: d, auto: true }); }); });
    if (App.tempDim) list.push({ d: App.tempDim, temp: true });
    list.forEach(function (it) {
      var e = f.entities[it.d.e], sc = e && dimScreen(pl, e, it.d);
      if (!sc) { if (it.index != null) stale.push(it.index); return; }
      drawOne(sc, it);
    });
    // relation icons, inference icons and the two-entity (distance / angle) dimensions: ui-relations.js
    if (UI.drawRelations) UI.drawRelations(f, pl, dimLayer, { svg: svg, drawOne: drawOne, list: list });
    // placed dimensions whose entity vanished or changed type (delete, trim, mirror in place) are dropped
    if (stale.length) {
      f.dims = placed.filter(function (d, i) { return stale.indexOf(i) < 0; });
      if (App.sel && App.sel.kind === 'dim') App.sel = null;
    }
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

  viewport.addEventListener('mousedown', function (ev) {
    if (ev.target.closest && ev.target.closest('#hud, #exit-sketch, #sketch-hint, #dim-layer, #dim-edit')) return;
    UI.closeMenus();
    var p = pos(ev);
    downPos = p;
    if (ev.button === 1 || (ev.button === 0 && (ev.altKey)) || (ev.button === 0 && App.zoomAreaMode)) {
      if (App.zoomAreaMode && ev.button === 0) { zoomBox = { start: p }; $('zoom-box').hidden = false; return; }
      drag = { kind: ev.ctrlKey || ev.shiftKey ? 'pan' : 'rotate', last: p };
      ev.preventDefault();
      return;
    }
    if (ev.button === 2) { drag = { kind: 'pan', last: p, moved: false }; return; }
    // assemblies: pressing on a floating component drags it (Move / Rotate Component) instead of rotating the view
    var hook = ev.button !== 0 ? null : (App.mode === 'sketch' && UI.sketchDragHook ? UI.sketchDragHook(p, ev) : null) || (UI.componentDragHook ? UI.componentDragHook(p, ev) : null);
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
        UI.pushViewHistory();
        UI.panView(UI.size.w / 2 - cx, UI.size.h / 2 - cy);
        UI.zoomView(Math.max(fw, fh));
      }
      zoomBox = null; App.zoomAreaMode = false; UI.refreshHud();
      return;
    }
    if (!drag) return;
    var d = drag; drag = null;
    viewport.classList.remove('tool-grab');
    if (d.kind === 'hook') { d.hook.end(p); return; }
    if (d.kind === 'rotate' || (d.kind === 'pan' && d.moved)) return;
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

  function finishChain() {
    if (App.tool !== 'select') { cancelTool(); }
  }

  viewport.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    var p = pos(ev);
    UI.zoomView(ev.deltaY > 0 ? 1.12 : 1 / 1.12, p[0], p[1]);
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

  UI.enterSketch = enterSketch;
  UI.exitSketch = exitSketch;
  UI.cancelSketch = cancelSketch;
  UI.setTool = setTool;
  UI.cancelTool = cancelTool;
  UI.addEntity = addEntity;
})(UI);
