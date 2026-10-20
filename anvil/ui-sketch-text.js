// ui-sketch-text.js — Sketch Text (Sketch tab ▸ Text, SolidWorks' Sketch Text): its PropertyManager on the tool
// (UI.sketchToolPMs.text) and on a selected text entity (UI.sketchEntityPMs.text), placement with a preview that follows
// the cursor (sketch inference snaps it), text along a picked line or arc (the Curves box), drag to move, double-click to
// edit, and the hooks that keep a text on its curve when entities are deleted or renumbered. The letters and the
// geometry live in the engine: sketch-font.js (the single-stroke font), kernel-sketch.js (entity 'text':
// Kernel.textLayout, Etch / Cut outlines, text along a curve), kernel-script.js (DXF as LINE / ARC, .text() scripts).
//
//   Text          the text (several lines: Enter in the box starts a new line)
//   Curves        optional: a sketch line, arc, spline, ellipse or partial ellipse the baseline follows (Reverse
//                 direction reads it the other way: an arc or ellipse from inside)
//   Alignment     Left / Center / Right about the insertion point (on a curve: its start, middle or end); Vertical
//                 Baseline / Middle / Top
//   Height        the capital letter height (default 3 mm / 0.125 in); Width factor and Spacing in %; Line spacing %
//                 of the height; Rotation (free text); Flip horizontal (mirror) / Flip vertical
//   Mode          Etch (single stroke: laser marking, on layer ETCH, never a region) or Cut (each stroke offset into a
//                 closed outline Stroke width wide, which a Cut-Extrude cuts through; on the CUT or current layer);
//                 Cut ▸ Stencil keeps the islands of O, A, B, 0, 8 … attached by bridges Bridge width wide (default
//                 0.03 in / 0.8 mm), so a part number cut through the sheet does not drop its centres
//   Layer         the sketch layer the text goes on (ETCH is created from the shop preset when it is missing)
(function () {
  'use strict';
  if (typeof UI === 'undefined') return;
  var App = UI.App, K = typeof Kernel !== 'undefined' ? Kernel : UI.K;
  UI.sketchToolPMs = UI.sketchToolPMs || {};
  UI.sketchEntityPMs = UI.sketchEntityPMs || {};
  UI.sketchFreeHooks = UI.sketchFreeHooks || {};
  function $(id) { return document.getElementById(id); }
  function clean(x) { return +(+x).toPrecision(12); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function markDirty() { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } }
  function refresh() { App.gridStale = true; UI.updateSketches(); if (UI.refreshTree) UI.refreshTree(); }
  function inch() { return !!(App.model && App.model.units === 'in'); }
  var HINT = 'Type the text in the PropertyManager, then click in the graphics area to place it. To run it along a line, arc, spline or ellipse, click the <b>Curves</b> box and pick the curve.';
  var PICK_HINT = 'Click a sketch line, arc, spline or ellipse for the text to follow.';
  var PATH_TYPES = K.TEXT_PATH_TYPES || ['line', 'arc'];
  function bridgeDefault() { return inch() ? 0.03 : 0.8; }

  // ------------------------------------------------------------------ values <-> entity
  // PM values: { str, pathE, flip, align, valign, h, wf, sp, ls (%), rot, mirror, flipV, mode, sw, stencil, bw (bridge
  // width), layer, layerSet }
  var toolVals = null;   // the tool's values, kept for the next text (per session)
  var st = { picking: false, at: null, scr: null };   // Curves box picking; the last cursor point (sketch) and screen position
  function defaultLayer(f, mode) {
    if (mode !== 'outline') return 'ETCH';
    if (K.sketchLayer(f, { layer: 'CUT' })) return 'CUT';
    var cur = UI.sketchCurrentLayer ? UI.sketchCurrentLayer() : '0';
    return cur && !K.noProfileEntity(f, { layer: cur }) ? cur : '0';
  }
  function freshValues(f) {
    var h = inch() ? 0.125 : 3;
    return { str: '', pathE: null, flip: false, align: 'left', valign: 'baseline', h: h, wf: 100, sp: 100, ls: 160, rot: 0, mirror: false, flipV: false,
      mode: 'stroke', sw: clean(h * 0.12), stencil: false, bw: bridgeDefault(), layer: defaultLayer(f, 'stroke'), layerSet: false };
  }
  function valuesFrom(e, f) {
    return { str: e.str == null ? '' : String(e.str), pathE: e.path && e.path.e != null ? e.path.e : null, flip: !!(e.path && e.path.flip),
      align: e.align || 'left', valign: e.valign || 'baseline', h: clean(+e.h || 1),
      wf: clean((e.widthFactor > 0 ? +e.widthFactor : 1) * 100), sp: clean((e.spacing != null ? +e.spacing : 1) * 100), ls: clean((e.lineSpacing > 0 ? +e.lineSpacing : 1.6) * 100),
      rot: clean(+e.rot || 0), mirror: !!e.mirror, flipV: !!e.flipV, mode: e.mode === 'outline' ? 'outline' : 'stroke', sw: clean(K.textStrokeWidth(e)),
      stencil: !!e.stencil, bw: +e.bridge > 0 ? clean(+e.bridge) : bridgeDefault(),
      layer: e.layer != null && e.layer !== '' ? String(e.layer) : '0', keepG: e.path && e.path.e == null && e.path.g ? e.path : null,
      // a text on its mode's default layer (Etch on ETCH) moves with the mode (Cut goes to CUT / the current layer)
      layerSet: (e.layer || '0') !== defaultLayer(f, e.mode === 'outline' ? 'outline' : 'stroke') };
  }
  // why the values cannot make a text, or ''
  function invalid(v) {
    if (!(+v.h > 0)) return 'The text height must be greater than zero.';
    if (!(+v.wf > 0)) return 'The width factor must be greater than zero.';
    if (!(+v.sp >= 0)) return 'The spacing cannot be negative.';
    if (!(+v.ls > 0)) return 'The line spacing must be greater than zero.';
    if (!isFinite(+v.rot)) return 'The rotation must be a number.';
    if (v.mode === 'outline' && !(+v.sw > 0)) return 'The stroke width must be greater than zero.';
    if (v.mode === 'outline' && v.stencil && !(+v.bw > 0)) return 'The bridge width must be greater than zero.';
    return '';
  }
  // the entity the values describe, inserted at `at`
  function entityFrom(v, at, f) {
    var e = { t: 'text', x: clean(at[0]), y: clean(at[1]), str: String(v.str || ''), h: +v.h };
    if (+v.rot) e.rot = +v.rot;
    if (v.align && v.align !== 'left') e.align = v.align;
    if (v.valign && v.valign !== 'baseline') e.valign = v.valign;
    if (+v.wf !== 100) e.widthFactor = clean(v.wf / 100);
    if (+v.sp !== 100) e.spacing = clean(v.sp / 100);
    if (+v.ls !== 160) e.lineSpacing = clean(v.ls / 100);
    if (v.mode === 'outline') { e.mode = 'outline'; e.strokeWidth = +v.sw; }
    if (v.mode === 'outline' && v.stencil) { e.stencil = true; e.bridge = +v.bw; }
    if (v.mirror) e.mirror = true;
    if (v.flipV) e.flipV = true;
    var src = v.pathE != null && f ? f.entities[v.pathE] : null;
    if (src && PATH_TYPES.indexOf(src.t) >= 0) {
      e.path = { e: v.pathE, g: K.textPathOf ? K.textPathOf(src) : { t: 'line', x1: src.x1, y1: src.y1, x2: src.x2, y2: src.y2 } };
      if (v.flip) e.path.flip = true;
    } else if (v.keepG) { e.path = JSON.parse(JSON.stringify(v.keepG)); if (v.flip) e.path.flip = true; else delete e.path.flip; }
    e.layer = v.layer || '0';   // "0" too: the drawing tools would otherwise put it on the current layer
    return e;
  }
  // a missing shop layer (ETCH, CUT, BEND) is added from its preset
  function ensureLayer(f, name) {
    if (!name || name === '0' || K.sketchLayer(f, { layer: name })) return;
    var pre = (K.LAYER_PRESETS || []).filter(function (p) { return p.name === name; })[0];
    if (!pre) return;
    f.layers = (f.layers || []).concat([JSON.parse(JSON.stringify(pre))]);
  }
  function layerOptions(f, v) {
    var names = ['0'].concat((f && f.layers || []).map(function (l) { return l.name; }));
    ['ETCH', 'CUT'].forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    if (v.layer && names.indexOf(v.layer) < 0) names.push(v.layer);
    return names.map(function (n) { return [n, n === '0' ? '0 (default)' : n + (f && K.sketchLayer(f, { layer: n }) ? '' : ' (new)')]; });
  }
  var CURVE_NAMES = { line: 'Line', arc: 'Arc', spline: 'Spline', ellipse: 'Ellipse', pellipse: 'Partial Ellipse' };
  function curveName(f, i) {
    var e = f && f.entities[i];
    if (!e) return '';
    return (CURVE_NAMES[e.t] || 'Curve') + (i + 1);
  }

  // ------------------------------------------------------------------ the PropertyManager (tool and entity)
  // edit: { index, e, f, orig } for a placed text, null for the tool
  function pmGroups(v, f, edit) {
    var D = function () { return v.pathE == null && !v.keepG; };
    return [
      { title: 'Curves', fields: [
        { type: 'pick', icon: 'arc', key: 'pathE', placeholder: 'Select a curve (optional)', value: function (x) { return x.pathE != null ? curveName(f, x.pathE) : x.keepG ? 'Curve deleted (kept its place)' : ''; },
          active: function () { return st.picking; }, onActivate: function () { setPicking(!st.picking); } },
        { type: 'buttons', show: function (x) { return x.pathE != null || !!x.keepG; }, buttons: [{ label: 'Clear Curves', onclick: function (x) { x.pathE = null; x.keepG = null; x.flip = false; changed(x, 'pathE'); UI.renderPM(); } }] },
        { type: 'check', label: 'Reverse direction', key: 'flip', show: function (x) { return x.pathE != null || !!x.keepG; } }
      ] },
      { title: 'Text', fields: [
        { type: 'html', html: function (x) { return '<textarea class="txt-str" data-key="str" rows="3" spellcheck="false" aria-label="Text" style="width:100%;box-sizing:border-box;font:13px Consolas, monospace;resize:vertical">' + esc(x.str) + '</textarea>'; } },
        { type: 'buttons', buttons: ['left', 'center', 'right'].map(function (a) {
          return { label: a === 'left' ? 'Left' : a === 'center' ? 'Center' : 'Right', active: function (x) { return x.align === a; }, onclick: function (x) { x.align = a; changed(x, 'align'); UI.renderPM(); } };
        }) },
        { type: 'select', label: 'Vertical', key: 'valign', options: [['baseline', 'Baseline'], ['middle', 'Middle'], ['top', 'Top']] },
        { type: 'check', label: 'Flip horizontal (mirror)', key: 'mirror' },
        { type: 'check', label: 'Flip vertical', key: 'flipV' }
      ] },
      { title: 'Font', fields: [
        { type: 'number', label: 'Height', key: 'h', unit: 'u', min: 0 },
        { type: 'number', label: 'Width factor', key: 'wf', unit: '%', min: 1 },
        { type: 'number', label: 'Spacing', key: 'sp', unit: '%', min: 0 },
        { type: 'number', label: 'Line spacing', key: 'ls', unit: '%', min: 1 },
        { type: 'number', label: 'Rotation', key: 'rot', unit: '°', show: D }
      ] },
      { title: 'Mode', fields: [
        { type: 'radio', key: 'mode', rerender: true, options: [['stroke', 'Etch (single stroke)'], ['outline', 'Cut (outline)']] },
        { type: 'number', label: 'Stroke width', key: 'sw', unit: 'u', min: 0, show: function (x) { return x.mode === 'outline'; } },
        { type: 'check', label: 'Stencil (bridges keep the islands)', key: 'stencil', rerender: true, show: function (x) { return x.mode === 'outline'; } },
        { type: 'number', label: 'Bridge width', key: 'bw', unit: 'u', min: 0, show: function (x) { return x.mode === 'outline' && x.stencil; } },
        { type: 'select', label: 'Layer', key: 'layer', options: function (x) { return layerOptions(f, x); } }
      ] }
    ];
  }
  var cur = null;   // { v, f, edit } of the open Sketch Text PM
  function changed(v, key) {
    if (!cur || cur.v !== v) return;
    if (key === 'layer') v.layerSet = true;
    if (key === 'mode' && !v.layerSet) v.layer = defaultLayer(cur.f, v.mode);
    if (key === 'mode' && v.mode === 'outline' && !(+v.sw > 0)) v.sw = clean(+v.h * 0.12);
    if (!cur.edit) { toolVals = v; preview(); return; }
    var why = invalid(v);
    if (why) { UI.setStatus(why); return; }
    applyEdit(cur.edit, v);
  }
  // the placed text takes the values (one undo step per PM session; the curve link follows the Curves box)
  function applyEdit(ed, v) {
    var f = ed.f, e = ed.e;
    markDirty();
    if (v.layer && v.layer !== (e.layer || '0')) ensureLayer(f, v.layer);
    // taken off its curve, the text stays where its curve put it (its insertion point is the curve's anchor)
    var at = e.path && v.pathE == null && !v.keepG ? K.entitySnapPoints(e)[0] : [e.x, e.y];
    var n = entityFrom(v, at, f);
    Object.keys(e).forEach(function (k) { if (k !== 'construction') delete e[k]; });
    Object.keys(n).forEach(function (k) { e[k] = n[k]; });
    if (e.layer === '0' && ed.orig.layer == null) delete e.layer;
    refresh();
  }
  function setHint(html) { var h = $('sketch-hint'); if (h && App.mode === 'sketch') { h.hidden = false; h.innerHTML = html; } }
  function setPicking(on) {
    st.picking = !!on;
    // while picking, a graphics-area click goes to pickAt (sketchClick hands App.command.onSketchPoint every click);
    // set inside UI.withToolPM so the Text tool stays on
    UI.withToolPM(function () {
      if (on) App.command = { onSketchPoint: pickAt, txtPick: true };
      else if (App.command && App.command.txtPick) App.command = null;
    });
    setHint(on ? PICK_HINT : cur && cur.edit ? 'Edit the text in the PropertyManager; drag it in the graphics area to move it.' : HINT);
    if (UI.renderPM) UI.renderPM();
  }
  // a click in the graphics area while the Curves box is active: the line / arc / spline / ellipse under it
  function pickAt(raw, mx, my) {
    var f = UI.activeSketchFeature(), hit = UI.pickEntity(mx, my), e = hit && f && f.entities[hit.index];
    if (!e || PATH_TYPES.indexOf(e.t) < 0) { UI.setStatus('Sketch text can follow a line, an arc, a spline or an ellipse: click one.'); return; }
    if (!cur) return;
    cur.v.pathE = hit.index; cur.v.keepG = null;
    setPicking(false);
    changed(cur.v, 'pathE');
    UI.setStatus('The text follows ' + curveName(f, hit.index) + '.');
  }
  // the textarea (an html field): its input goes to the values like any other field
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (!t || !t.classList || !t.classList.contains('txt-str') || !cur) return;
    cur.v.str = t.value;
    changed(cur.v, 'str');
  }, true);
  function openTextPM(v, f, edit) {
    cur = { v: v, f: f, edit: edit };
    st.picking = false;
    var spec = {
      title: 'Sketch Text', icon: 'text', values: v, keepSelection: true, noFocus: true,
      message: edit ? null : HINT,
      groups: pmGroups(v, f, edit),
      onChange: function (vals, key) { if (key) changed(vals, key); },
      onOK: function () {
        if (edit) { App.sel = null; cur = null; UI.updateSketches(); return; }
        // with a curve picked, ✓ places the text on it (no click needed)
        if ((v.pathE != null) && String(v.str || '').trim()) { place([0, 0]); return false; }
        cur = null;
        if (App.tool === 'text') UI.cancelTool();
      },
      onCancel: function () {
        if (edit) {
          var e = edit.e;
          Object.keys(e).forEach(function (k) { delete e[k]; });
          Object.keys(edit.orig).forEach(function (k) { e[k] = JSON.parse(JSON.stringify(edit.orig[k])); });
          App.sel = null; refresh();
        } else if (App.tool === 'text') UI.cancelTool();
        cur = null;
      },
      onClose: function () { st.picking = false; if (cur && cur.v === v) cur = null; App.tempEntities = App.tool === 'text' ? App.tempEntities : []; }
    };
    if (edit) spec._txtEntity = { index: edit.index }; else { spec.sketchTool = 'text'; spec._txtTool = true; }
    UI.openPM(spec);
    setHint(edit ? 'Edit the text in the PropertyManager; drag it in the graphics area to move it.' : HINT);
    setTimeout(function () { var ta = document.querySelector('#pm textarea.txt-str'); if (ta && UI.pmSpec && UI.pmSpec() === spec) { try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (err) { } } }, 0);
  }

  // ------------------------------------------------------------------ the tool: preview and placement
  UI.sketchToolPMs.text = function () {
    var f = UI.activeSketchFeature();
    if (!toolVals) toolVals = freshValues(f);
    toolVals.pathE = null; toolVals.keepG = null; toolVals.flip = false;
    if (!toolVals.layerSet) toolVals.layer = defaultLayer(f, toolVals.mode);
    // a curve selected before the tool started is the one to follow (as SolidWorks takes it into Curves)
    var sel = App.sel && App.sel.kind === 'entity' ? App.sel.index : null, se = sel != null && f ? f.entities[sel] : null;
    if (se && PATH_TYPES.indexOf(se.t) >= 0) toolVals.pathE = sel;
    st.at = null;
    openTextPM(toolVals, f, null);
    preview();
  };
  // the text at the cursor (or on its curve) as the tool's preview
  function preview() {
    if (App.mode !== 'sketch' || App.tool !== 'text' || !cur || cur.edit) return;
    var v = cur.v, f = UI.activeSketchFeature();
    if (!String(v.str || '').trim() || invalid(v) || (v.pathE == null && !st.at)) { App.tempEntities = []; UI.updateTemp(); return; }
    var e = entityFrom(v, st.at || [0, 0], f);
    App.tempEntities = [e];
    UI.updateTemp();
  }
  function place(p) {
    var f = UI.activeSketchFeature();
    if (!f || !cur || cur.edit) return;
    var v = cur.v;
    if (!String(v.str || '').trim()) { UI.setStatus('Type the text in the PropertyManager first.'); return; }
    var why = invalid(v);
    if (why) { UI.setStatus(why); return; }
    markDirty();   // the undo step comes before the layer is added
    ensureLayer(f, v.layer);
    var e = entityFrom(v, p, f);
    UI.addEntity(e);
    var index = f.entities.indexOf(e);
    if (e.path) { K.syncTextPaths(f); var an = K.entitySnapPoints(e)[0]; e.x = clean(an[0]); e.y = clean(an[1]); }   // the curve's anchor, kept if the curve goes
    App.tempEntities = [];
    UI.cancelTool();   // the tool goes down (its PM closes); the Sketch Text PM of the new text opens, as in SolidWorks
    App.sel = { kind: 'entity', index: index };
    UI.updateSketches();
    if (UI.openEntityPM) UI.openEntityPM(index);
    UI.setStatus('Text' + (index + 1) + ' placed' + (e.path ? ' along ' + curveName(f, e.path.e) : '') + ' (' + (e.mode === 'outline' ? 'Cut outline' : 'Etch') + ', layer ' + (e.layer || '0') + '). Edit it here, or drag it to move it.');
  }
  UI.sketchFreeHooks.text = {
    steps: function () { return 1; },
    entities: function () { return []; },
    click: function (p) { place(p); return true; },
    readout: function () { return ''; }
  };
  // the cursor point (with the sketch's inference, as a drawing tool's next point) for the preview
  window.addEventListener('mousemove', function (ev) {
    if (App.mode !== 'sketch' || App.tool !== 'text' || !cur || cur.edit) return;
    var vp = UI.viewport, r = vp.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    if (mx < 0 || my < 0 || mx > r.width || my > r.height) return;
    st.scr = [mx, my];
    var raw = UI.screenToPlane(mx, my, UI.activePlane());
    if (!raw) return;
    var info = UI.sketchInferPoint ? UI.sketchInferPoint(raw, mx, my) : null;
    st.at = info && info.p ? info.p : raw;
    preview();
  });

  // ------------------------------------------------------------------ a placed text: its PM, drag, double-click
  UI.sketchEntityPMs.text = function (index, e, f) {
    openTextPM(valuesFrom(e, f), f, { index: index, e: e, f: f, orig: JSON.parse(JSON.stringify(e)) });
  };
  // drag a text by its letters: it moves with the cursor (its insertion point); text on a curve follows the curve
  var baseDragHook = UI.sketchDragHook;
  UI.sketchDragHook = function (p, ev) {
    if (App.mode === 'sketch' && App.tool === 'select' && !(App.command && App.command.onSketchPoint)) {
      var f = UI.activeSketchFeature(), hit = f ? UI.pickEntity(p[0], p[1]) : null, e = hit && f.entities[hit.index];
      if (e && e.t === 'text' && e.path) return textDrag(f, hit.index, e, p);   // a free text drags through the solver (ui-sketch.js)
    }
    return baseDragHook ? baseDragHook.apply(this, arguments) : null;
  };
  function textDrag(f, index, e, p) {
    var pl = UI.activePlane(), uv0 = null, x0 = e.x, y0 = e.y, onCurve = !!(e.path && e.path.e != null);
    return {
      start: function () {
        if (onCurve) { UI.setStatus('Text' + (index + 1) + ' follows ' + curveName(f, e.path.e) + ': drag the curve, or clear Curves in its PropertyManager.'); return; }
        markDirty(); uv0 = UI.screenToPlane(p[0], p[1], pl); App.sketchDragging = true;
        if (e.path) delete e.path;   // a text whose curve was deleted is free again once dragged
      },
      move: function (q) {
        if (onCurve || !uv0) return;
        var uv = UI.screenToPlane(q[0], q[1], pl);
        if (!uv) return;
        e.x = clean(x0 + uv[0] - uv0[0]); e.y = clean(y0 + uv[1] - uv0[1]);
        UI.updateSketches();
      },
      end: function () {
        if (onCurve || !uv0) return;
        App.sketchDragging = false;
        refresh();
        UI.setStatus('Moved Text' + (index + 1) + ' to (' + UI.fmtLen(e.x) + ', ' + UI.fmtLen(e.y) + ').');
      }
    };
  }
  // a double-click on a text opens its PM with the text box ready to type in
  if (UI.viewport) UI.viewport.addEventListener('dblclick', function (ev) {
    if (App.mode !== 'sketch' || App.tool !== 'select') return;
    var r = UI.viewport.getBoundingClientRect(), hit = UI.pickEntity(ev.clientX - r.left, ev.clientY - r.top), f = UI.activeSketchFeature();
    var e = hit && f && f.entities[hit.index];
    if (!e || e.t !== 'text') return;
    var spec = UI.pmSpec && UI.pmSpec();
    if (!(spec && spec._txtEntity && spec._txtEntity.index === hit.index)) { App.sel = hit; UI.openEntityPM(hit.index); }
    setTimeout(function () { var ta = document.querySelector('#pm textarea.txt-str'); if (ta) { try { ta.focus(); ta.select(); } catch (err) { } } }, 0);
  });

  // ------------------------------------------------------------------ keeping text on its curve
  // a deleted / renumbered entity: the text's curve index follows (Kernel.textEntityRemoved / remapTextPaths); every
  // redraw refreshes the curve geometry a text follows (Kernel.syncTextPaths), so editing the line / arc moves the text
  var S = window.SketchSolver;
  if (S) {
    var baseRemove = S.removeEntity, baseRemap = S.remap, baseAfterTrim = S.afterTrim;
    if (baseRemove) S.removeEntity = function (sketch, index) { var r = baseRemove.apply(this, arguments); K.textEntityRemoved(sketch, index); return r; };
    if (baseRemap) S.remap = function (sketch, before) { var r = baseRemap.apply(this, arguments); K.remapTextPaths(sketch, before); return r; };
    if (baseAfterTrim) S.afterTrim = function (sketch, before) { var r = baseAfterTrim.apply(this, arguments); K.remapTextPaths(sketch, before); return r; };
  }
  var baseUpdate = UI.updateSketches;
  UI.updateSketches = function () {
    try {
      (App.model && App.model.features || []).forEach(function (f) {
        if (f.type === 'sketch' && f.entities && f.entities.some(function (e) { return e && e.t === 'text' && e.path; })) K.syncTextPaths(f);
      });
    } catch (err) { /* never block a redraw */ }
    return baseUpdate.apply(this, arguments);
  };

  // ------------------------------------------------------------------ command search (Search Commands box)
  document.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if (ev.key !== 'Enter' || !t || t.id !== 'cmd-search') return;
    if (!/^\s*(sketch\s+)?text\s*$/i.test(String(t.value || ''))) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    t.value = ''; t.blur();
    if (App.mode !== 'sketch') { UI.toast('Open a sketch first: Text is a sketch tool.'); return; }
    UI.setTool('text');
  }, true);

  // ------------------------------------------------------------------ lane CV: Dissolve Sketch Text
  // Right-click a sketch text ▸ Dissolve Sketch Text (SolidWorks): the text becomes the ordinary entities it is drawn
  // with (Kernel.dissolveText: Etch strokes as lines / arcs / polylines on its layer, a Cut text's outline as lines and
  // arcs end to end), appended to the sketch; the text entity goes (its relations and dimensions with it). One undo
  // step. Returns the new entities' indices, or null.
  UI.dissolveSketchText = function (index) {
    var f = UI.activeSketchFeature ? UI.activeSketchFeature() : null;
    if (App.mode !== 'sketch' || !f) { UI.toast('Open a sketch first.'); return null; }
    if (index == null) {
      var s = (UI.selection ? UI.selection() : []).filter(function (x) { return x.kind === 'entity' && f.entities[x.index] && f.entities[x.index].t === 'text'; })[0];
      index = s ? s.index : App.sel && App.sel.kind === 'entity' ? App.sel.index : null;
    }
    var e = index != null ? f.entities[index] : null;
    if (!e || e.t !== 'text') { UI.toast('Select a sketch text first, then Dissolve Sketch Text.'); return null; }
    var made = K.dissolveText(e);
    if (!made.length) { UI.toast('The text has no geometry to dissolve (it is empty).'); return null; }
    if (UI.closePM && UI.pmSpec && UI.pmSpec() && UI.pmSpec()._txtEntity) UI.closePM();
    markDirty();
    made.forEach(function (x) { if (x.layer) ensureLayer(f, x.layer); });
    f.entities.splice(index, 1);
    if (S && S.removeEntity) S.removeEntity(f, index);
    if (f.dims) f.dims = f.dims.filter(function (d) { return d.e !== index; }).map(function (d) { if (d.e > index) d.e--; return d; });
    var first = f.entities.length;
    made.forEach(function (x) { f.entities.push(x); });
    var idx = made.map(function (x, k) { return first + k; });
    App.sel = null; App.sel2 = null;
    if (UI.setSelection) UI.setSelection(idx.map(function (i) { return { kind: 'entity', index: i }; }));
    App.dimsStale = true;
    refresh();
    UI.setStatus('Sketch text dissolved into ' + made.length + ' entit' + (made.length === 1 ? 'y' : 'ies') + '.');
    return idx;
  };

  // test / script hooks
  UI.sketchTextValues = function () { return cur ? cur.v : null; };
  UI.sketchTextPick = function (on) { setPicking(on !== false); };
})();
