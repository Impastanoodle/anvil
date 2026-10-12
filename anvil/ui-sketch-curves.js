// ui-sketch-curves.js — Circle / Perimeter Circle, Arcs (Centerpoint, Tangent, 3 Point), Polygon, Slots: their SolidWorks PropertyManagers (on the tool and for a selected entity).
// Registers tool PMs in UI.sketchToolPMs[tool] (opened by setTool in ui-sketch.js); see README *Sketch tab*.
//
// p9-sketch-curves. The tools themselves run in ui-sketch.js (inference, previews, on-screen numeric input, the click
// that places a point); the new ones (Perimeter Circle, Tangent Arc, Centerpoint Straight Slot, 3 Point Arc Slot,
// Centerpoint Arc Slot) and the Polygon's inscribed / circumscribed circle are defined here through its tool hooks,
// UI.sketchToolDefs[tool] = { steps, entities, accept, after, fields, live, typed, readout, refine }. Each tool opens
// its PropertyManager at once (SolidWorks' groups, names and order) and keeps it open while drawing: Parameters follow
// the entity being drawn, then show the one just placed, where they can be edited (as SolidWorks shows the last
// circle until the next one starts). A selected circle, arc, polygon or slot opens the same Parameters to edit.
// Entities: circle, arc, poly (`ins`: inscribed circle), slot, aslot (arc slot, kernel-sketch.js).
(function () {
  'use strict';
  if (typeof UI === 'undefined') return;
  UI.sketchToolPMs = UI.sketchToolPMs || {};
  UI.sketchEntityPMs = UI.sketchEntityPMs || {};
  UI.sketchToolDefs = UI.sketchToolDefs || {};
  var App = UI.App, K = window.Kernel, D2R = Math.PI / 180, R2D = 180 / Math.PI;
  function SS() { return window.SketchSolver; }
  function geom() { return UI.sketchGeom || {}; }
  function cleanLen(x) { return +(+x).toPrecision(12); }
  function sketch() { return UI.activeSketchFeature ? UI.activeSketchFeature() : null; }
  function deg360(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  function drawing() { var st = App.toolState; return !!(st && st.pts && st.pts.length); }
  function hint(html) { var h = document.getElementById('sketch-hint'); if (h && App.mode === 'sketch') h.innerHTML = html; }
  function cam() { return (UI.cam && UI.cam.scale) || 0.1; }
  function r4(x) { return Math.round(x * 1e4) / 1e4; }
  function numericOn() { return !!(UI.sketchNumericInput && UI.sketchNumericInput()); }

  // ------------------------------------------------------------------ remembered options
  // As SolidWorks keeps them between uses (per browser, localStorage 'anvil.sketchCurves'): the polygon's sides and
  // circle (Inscribed by default, as SolidWorks), the slot's Add dimensions and length type (Center to Center).
  var OPT_KEY = 'anvil.sketchCurves', opt = { sides: 6, ins: true, slotDims: false, overall: false };
  try { var saved = JSON.parse(window.localStorage.getItem(OPT_KEY) || 'null'); if (saved) Object.keys(opt).forEach(function (k) { if (saved[k] != null) opt[k] = saved[k]; }); } catch (e) { /* storage blocked */ }
  function saveOpt() {
    App.toolParams = Object.assign(App.toolParams || {}, { sides: opt.sides, ins: opt.ins });
    try { window.localStorage.setItem(OPT_KEY, JSON.stringify(opt)); } catch (e) { /* storage blocked */ }
  }
  App.toolParams = Object.assign(App.toolParams || {}, { sides: opt.sides, ins: opt.ins });

  // ------------------------------------------------------------------ the tools, by PropertyManager
  var FAM = { circle: 'circle', pcircle: 'circle', arc: 'arc', tarc: 'arc', arc3: 'arc', polygon: 'poly', slot: 'slot', cslot: 'slot', aslot3: 'slot', aslot: 'slot' };
  var FAM_TYPES = { circle: ['circle'], arc: ['arc'], poly: ['poly'], slot: ['slot', 'aslot'] };
  var TITLES = { circle: 'Circle', arc: 'Arc', poly: 'Polygon', slot: 'Slot' };
  var TYPE_OPTS = {
    circle: { title: 'Circle Type', label: 'Type', opts: [['circle', 'Circle', 'circle'], ['pcircle', 'Perimeter Circle', 'pcircle']] },
    arc: { title: 'Arc Type', label: 'Type', opts: [['arc', 'Centerpoint Arc', 'arc'], ['tarc', 'Tangent Arc', 'tarc'], ['arc3', '3 Point Arc', 'arc3']] },
    slot: { title: 'Slot Types', label: 'Type', opts: [['slot', 'Straight Slot', 'slot'], ['cslot', 'Centerpoint Straight Slot', 'cslot'], ['aslot3', '3 Point Arc Slot', 'aslot3'], ['aslot', 'Centerpoint Arc Slot', 'aslot']] }
  };
  var LEN_TYPES = [['cc', 'Center to Center', 'slotLenCC'], ['overall', 'Overall Length', 'slotLenAll']];
  // hints for the tools ui-sketch.js has none for (and the polygon's, which depend on the circle type)
  var HINTS = {
    pcircle: 'Click two points on the circle, then a third point it passes through.',
    tarc: 'Click the end of a line or arc, then the end of the arc. Leave the end point along the line for a tangent arc, back over it for the reverse tangent, square to it for a normal arc; move back onto the end point to choose again.',
    cslot: 'Click the slot center, then the center of one end, then a point to set the width.',
    aslot3: 'Click the start and end of the slot arc, then a point it passes through, then a point to set the width.',
    aslot: 'Click the arc center, the start of the slot arc, then its end (it runs the way you move), then a point to set the width.'
  };
  function polygonHint() { return opt.ins ? 'Click the center, then the middle of a side (Inscribed circle). Set the sides and the circle type in the PropertyManager.' : 'Click the center, then a corner (Circumscribed circle). Set the sides and the circle type in the PropertyManager.'; }

  // ------------------------------------------------------------------ parameters (the PM's Parameters group)
  var PARAM_FIELDS = {
    circle: [['cx', 'Center X', 'u'], ['cy', 'Center Y', 'u'], ['r', 'Radius', 'u']],
    arc: [['cx', 'Center X', 'u'], ['cy', 'Center Y', 'u'], ['sx', 'Start X', 'u'], ['sy', 'Start Y', 'u'], ['ex', 'End X', 'u'], ['ey', 'End Y', 'u'], ['r', 'Radius', 'u'], ['ang', 'Angle', '°']],
    poly: [['n', 'Number of sides'], ['cx', 'Center X', 'u'], ['cy', 'Center Y', 'u'], ['dia', 'Circle diameter', 'u'], ['ang', 'Angle', '°']],
    slot: [['cx', 'Center X', 'u'], ['cy', 'Center Y', 'u'], ['w', 'Slot width', 'u'], ['len', 'Slot length', 'u']],
    aslot: [['cx', 'Center X', 'u'], ['cy', 'Center Y', 'u'], ['r', 'Arc radius', 'u'], ['ang', 'Arc angle', '°'], ['w', 'Slot width', 'u']]
  };
  var NUM_KEYS = ['n', 'cx', 'cy', 'sx', 'sy', 'ex', 'ey', 'r', 'ang', 'dia', 'w', 'len'];
  function at(e, a) { return [e.cx + e.r * Math.cos(a * D2R), e.cy + e.r * Math.sin(a * D2R)]; }
  // The parameters of entity e as the PM shows them ({ key: value }), or null.
  function params(e) {
    if (!e) return null;
    switch (e.t) {
      case 'circle': return { cx: e.cx, cy: e.cy, r: e.r };
      case 'arc': { var s = at(e, e.a0), q = at(e, e.a1); return { cx: e.cx, cy: e.cy, sx: s[0], sy: s[1], ex: q[0], ey: q[1], r: e.r, ang: e.a1 - e.a0 }; }
      case 'poly': {
        var n = e.n | 0 || 6, k = e.ins ? Math.cos(Math.PI / n) : 1;
        return { n: n, ins: e.ins ? 'ins' : 'circ', cx: e.cx, cy: e.cy, dia: 2 * e.r * k, ang: deg360((e.rot || 0) - (e.ins ? 180 / n : 0)) };
      }
      case 'slot': { var L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1); return { cx: (e.x1 + e.x2) / 2, cy: (e.y1 + e.y2) / 2, w: e.w, len: L + (opt.overall ? e.w : 0) }; }
      case 'aslot': return { cx: e.cx, cy: e.cy, r: e.r, ang: e.a1 - e.a0, w: e.w };
    }
    return null;
  }
  // Set parameter `key` of entity e to v, in place; returns an error message, or '' when done.
  function setParam(e, key, v) {
    if (key !== 'ins') { v = +v; if (!isFinite(v)) return 'Not a number.'; }
    function ang() { if (!(v > 0 && v < 360)) return 'The angle must be more than 0° and less than 360°.'; return ''; }
    switch (e.t) {
      case 'circle':
        if (key === 'r') { if (!(v > 0)) return 'The radius must be greater than 0.'; e.r = v; }
        else if (key === 'cx' || key === 'cy') e[key] = v;
        return '';
      case 'arc': {
        if (key === 'cx' || key === 'cy') { e[key] = v; return ''; }
        if (key === 'r') { if (!(v > 0)) return 'The radius must be greater than 0.'; e.r = v; return ''; }
        if (key === 'ang') { var er = ang(); if (er) return er; e.a1 = e.a0 + v; return ''; }
        // an end point: the arc keeps its centre and its other end's angle; the radius goes to the new point
        var P = params(e), start = key === 'sx' || key === 'sy';
        var x = key === 'sx' || key === 'ex' ? v : (start ? P.sx : P.ex), y = key === 'sy' || key === 'ey' ? v : (start ? P.sy : P.ey);
        var r = Math.hypot(x - e.cx, y - e.cy);
        if (!(r > 1e-12)) return 'That point is the arc\'s center.';
        var a = Math.atan2(y - e.cy, x - e.cx) * R2D;
        if (start) e.a0 = a; else e.a1 = a;
        e.r = cleanLen(r);
        e.a0 = deg360(e.a0); e.a1 = deg360(e.a1);
        while (e.a1 <= e.a0) e.a1 += 360;
        return '';
      }
      case 'poly': {
        var p = params(e), n = p.n, ins = p.ins === 'ins';
        if (key === 'cx' || key === 'cy') { e[key] = v; return ''; }
        if (key === 'n') { v = Math.round(v); if (!(v >= 3 && v <= 40)) return 'A polygon has 3 to 40 sides.'; n = v; }
        else if (key === 'ins') ins = v === 'ins' || v === true;
        else if (key === 'dia') { if (!(v > 0)) return 'The circle diameter must be greater than 0.'; p.dia = v; }
        else if (key === 'ang') p.ang = v;
        else return '';
        // the circle keeps its diameter and the angle its direction: the corners follow (inscribed: the circle touches
        // the flats, so the corners lie 1 / cos(180° / n) further out)
        e.n = n;
        if (ins) e.ins = true; else delete e.ins;
        e.r = ins ? p.dia / 2 / Math.cos(Math.PI / n) : p.dia / 2;
        e.rot = deg360(p.ang + (ins ? 180 / n : 0));
        return '';
      }
      case 'slot': {
        var c = [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2], dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy), u = L > 1e-12 ? [dx / L, dy / L] : [1, 0];
        if (key === 'cx' || key === 'cy') { var dd = key === 'cx' ? [v - c[0], 0] : [0, v - c[1]]; e.x1 += dd[0]; e.x2 += dd[0]; e.y1 += dd[1]; e.y2 += dd[1]; return ''; }
        if (key === 'w') { if (!(v > 0)) return 'The slot width must be greater than 0.'; e.w = v; return ''; }
        if (key === 'len') {
          var cc = opt.overall ? v - e.w : v;
          if (!(cc > 0)) return opt.overall ? 'The overall length must be more than the slot width.' : 'The slot length must be greater than 0.';
          e.x1 = c[0] - u[0] * cc / 2; e.y1 = c[1] - u[1] * cc / 2; e.x2 = c[0] + u[0] * cc / 2; e.y2 = c[1] + u[1] * cc / 2;
        }
        return '';
      }
      case 'aslot': {
        if (key === 'cx' || key === 'cy') { e[key] = v; return ''; }
        if (key === 'r') { if (!(v > e.w / 2)) return 'The arc radius must be more than half the slot width.'; e.r = v; return ''; }
        if (key === 'w') { if (!(v > 0 && v < 2 * e.r)) return 'The slot width must be more than 0 and less than the arc\'s diameter.'; e.w = v; return ''; }
        if (key === 'ang') { var ea = ang(); if (ea) return ea; e.a1 = e.a0 + v; }
        return '';
      }
    }
    return '';
  }
  function shown(key, v) { return v == null || !isFinite(v) ? null : key === 'n' ? Math.round(v) : +(+v).toFixed(6); }
  // put entity e's parameters into the open PM (values and boxes) without re-rendering it; the box being typed in keeps
  // its text
  function showParams(spec, e) {
    var p = params(e) || {}, root = document.getElementById('pm'), act = document.activeElement;
    if (spec._curves.fam === 'poly' && p.n == null) { p.n = opt.sides; p.ins = opt.ins ? 'ins' : 'circ'; }   // the polygon tool's options with no polygon shown
    NUM_KEYS.forEach(function (k) {
      if (!(k in spec.values) && p[k] == null) return;
      var v = shown(k, p[k]);
      var inp = root && root.querySelector('input.pm-num[data-key="' + k + '"]');
      if (inp && inp === act) return;
      spec.values[k] = v;
      if (inp && String(inp.value) !== String(v == null ? '' : v)) { inp.type = 'number'; inp.value = v == null ? '' : v; }
    });
    if (p.ins && spec.values.ins !== p.ins) {
      spec.values.ins = p.ins;
      var rb = root && root.querySelector('input[type=radio][data-key="ins:' + p.ins + '"]');
      if (rb) rb.checked = true;
    }
    if (e && 'construction' in spec.values && !!spec.values.construction !== !!e.construction && !(App.tempEntities || []).length) {
      spec.values.construction = !!e.construction;
      var cb = root && root.querySelector('input[type=checkbox][data-key="construction"]');
      if (cb) cb.checked = !!e.construction;
    }
  }

  // Edit parameter `key` of entity i of sketch f: one undo step per edit, then the sketch is solved with the edited
  // entity moving least (as the entity PropertyManager does); a value a relation or dimension holds comes back.
  function applyParam(f, i, key, val) {
    var e = f && f.entities[i];
    if (!e) return false;
    var trial = JSON.parse(JSON.stringify(e)), err = setParam(trial, key, val);
    if (err) { UI.setStatus(err); refreshValues(); return false; }
    if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
    Object.keys(e).forEach(function (k) { if (!(k in trial)) delete e[k]; });
    Object.keys(trial).forEach(function (k) { e[k] = trial[k]; });
    var S = SS();
    if (S && (f.rels || f.dims)) {
      var mob = {}; mob[i] = 1e-4;
      S.solve(f, { mob: mob });
      var now = params(f.entities[i]) || {};
      if (key !== 'ins' && now[key] != null && Math.abs(now[key] - (+val)) > 1e-6 * Math.max(1, Math.abs(+val))) UI.setStatus('That value is held by a relation or a dimension: ' + (key === 'ang' || key === 'rot' ? UI.fmtNum(now[key], 2) + '°' : key === 'n' ? Math.round(now[key]) : UI.fmtLen(now[key])) + ' kept.');   // sketch-units
    }
    App.gridStale = true; App.dimsStale = true;
    UI.updateSketches();
    if (UI.refreshTree) UI.refreshTree();
    refreshValues();
    return true;
  }
  function setConstruction(f, i, on) {
    var e = f && f.entities[i];
    if (!e || !!e.construction === !!on) return;
    if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
    if (on) e.construction = true; else delete e.construction;
    App.gridStale = true;
    UI.updateSketches();
  }

  // ------------------------------------------------------------------ dimensions (Add dimensions, typed values)
  function addDim(f, d) {
    f.dims = f.dims || [];
    if (f.dims.some(function (x) { return x.e === d.e && x.k === d.k; })) return false;
    f.dims.push(d);
    var S = SS();
    if (S && S.overDefines(f, 'dim', f.dims.length - 1)) { f.dims.pop(); if (!f.dims.length) delete f.dims; return false; }
    App.dimsStale = true;
    return true;
  }
  function radDim(f, i, ang) { var e = f.entities[i]; addDim(f, { e: i, k: 'r', ang: Math.round(deg360(ang) * 10) / 10, off: r4(e.r + (e.w ? e.w / 2 : 0) + 14 * cam()) }); }
  // SolidWorks' Add dimensions: a straight slot's length (center to center or overall) and width, an arc slot's arc
  // radius and width
  function slotDims(f, i, which) {
    var e = f.entities[i], s = cam();
    if (!e) return;
    which = which || { len: 1, w: 1, r: 1 };
    if (e.t === 'slot') {
      if (which.len) addDim(f, { e: i, k: opt.overall ? 'olen' : 'len', off: r4(e.w / 2 + 14 * s) });
      if (which.w) addDim(f, { e: i, k: 'w', off: -r4(e.w / 2 + 14 * s) });
    } else if (e.t === 'aslot') {
      if (which.r) radDim(f, i, (e.a0 + e.a1) / 2);
      if (which.w) addDim(f, { e: i, k: 'w', off: r4(14 * s) });
    }
  }

  // ------------------------------------------------------------------ the tool PropertyManagers
  // tp: the open tool PM's state — last: the index of the entity this tool placed last in the active sketch (its
  // Parameters are shown and edited until the next one starts)
  var tp = { last: null, sketch: null }, carryConstruction = null;
  function lastEntity(fam) {
    var f = sketch(), e = f && tp.last != null && f.id === tp.sketch ? f.entities[tp.last] : null;
    return e && FAM_TYPES[fam].indexOf(e.t) >= 0 ? tp.last : null;
  }
  function isArcSlotTool(tool) { return tool === 'aslot' || tool === 'aslot3'; }
  function paramFields(fam, tool, entType) {
    var key = fam === 'slot' ? (entType ? (entType === 'aslot' ? 'aslot' : 'slot') : (isArcSlotTool(tool) ? 'aslot' : 'slot')) : fam;
    var out = [];
    PARAM_FIELDS[key].forEach(function (p) {
      out.push({ type: 'number', label: p[1], key: p[0], unit: p[2], step: p[0] === 'n' ? 1 : undefined, min: p[0] === 'n' ? 3 : undefined });
      if (p[0] === 'n') out.push({ type: 'radio', key: 'ins', options: [['ins', 'Inscribed circle'], ['circ', 'Circumscribed circle']] });
    });
    return out;
  }
  function relationGroups(f, i) {
    if (!UI.sketchRelationGroups || i == null || !f) return [];
    try { return UI.sketchRelationGroups(f, [String(i)]) || []; } catch (e) { return []; }
  }
  function toolGroups(spec) {
    var c = spec._curves, fam = c.fam, g = [], f = sketch(), li = lastEntity(fam), ty = TYPE_OPTS[fam];
    if (ty) {
      var tf = [{ type: 'iconRadio', label: ty.label, key: 'type', options: ty.opts }];
      if (fam === 'slot') tf.push({ type: 'check', label: 'Add dimensions', key: 'slotDims' }, { type: 'iconRadio', label: 'Length', key: 'lenType', options: LEN_TYPES });
      g.push({ title: ty.title, fields: tf });
    }
    g = g.concat(relationGroups(f, li));
    if (fam !== 'slot') g.push({ title: 'Options', fields: [{ type: 'check', label: 'For construction', key: 'construction' }] });
    var pf = paramFields(fam, c.tool);
    if (fam === 'poly') pf.push({ type: 'buttons', buttons: [{ label: 'New Polygon', onclick: newPolygon }] });
    g.push({ title: 'Parameters', fields: pf });
    return g;
  }
  function openToolPM(tool) {
    var fam = FAM[tool];
    if (!fam) return;
    tp = { last: null, sketch: null };
    if (carryConstruction != null) { App.drawConstruction = carryConstruction; carryConstruction = null; }
    var values = { type: tool, construction: !!App.drawConstruction };
    if (fam === 'slot') { values.slotDims = !!opt.slotDims; values.lenType = opt.overall ? 'overall' : 'cc'; }
    if (fam === 'poly') { values.n = opt.sides; values.ins = opt.ins ? 'ins' : 'circ'; }
    var spec = {
      title: TITLES[fam], icon: tool, values: values, noFocus: true,   // the keyboard stays with the sketch (typed values while drawing)
      _curves: { kind: 'tool', fam: fam, tool: tool },
      onChange: function (v, key) { toolChange(spec, v, key); },
      onOK: function () { },
      // ✓ / ✗ put the tool down too, as in SolidWorks
      onClose: function () { if (App.mode === 'sketch' && FAM[App.tool] === fam && UI.endSketchTool) UI.endSketchTool(); }
    };
    spec.groups = toolGroups(spec);
    UI.openPM(spec);
    if (HINTS[tool]) hint(HINTS[tool]);
    if (tool === 'polygon') hint(polygonHint());
    refreshValues();
  }
  function toolChange(spec, v, key) {
    var fam = spec._curves.fam, f = sketch(), li = lastEntity(fam);
    if (key === 'type') {
      if (v.type === App.tool) return;
      carryConstruction = !!App.drawConstruction;
      UI.withToolPM(function () { UI.setTool(v.type); });
      UI.refreshRibbon();
      return;
    }
    if (key === 'construction') {
      App.drawConstruction = !!v.construction;
      if (li != null && !drawing()) setConstruction(f, li, v.construction);
      return;
    }
    if (key === 'slotDims') { opt.slotDims = !!v.slotDims; saveOpt(); return; }
    if (key === 'lenType') { opt.overall = v.lenType === 'overall'; saveOpt(); refreshValues(); return; }
    if (fam === 'poly' && (key === 'n' || key === 'ins')) {
      var n = Math.round(+v.n);
      if (key === 'n' && !(n >= 3 && n <= 40)) { UI.setStatus('A polygon has 3 to 40 sides.'); return; }
      if (key === 'n') opt.sides = n; else opt.ins = v.ins === 'ins';
      saveOpt();
      hint(polygonHint());
      if (li != null && !drawing()) applyParam(f, li, key, key === 'n' ? n : v.ins);
      return;
    }
    if (NUM_KEYS.indexOf(key) < 0) return;   // (a relation group's own fields)
    if (li == null || drawing()) {
      UI.setStatus('Draw the ' + TITLES[fam].toLowerCase() + ' first: its parameters follow it while it is drawn and can be changed once it is placed.');
      refreshValues();
      return;
    }
    applyParam(f, li, key, v[key]);
  }
  function newPolygon() {
    tp.last = null;
    if (drawing() && UI.cancelTool) UI.cancelTool(true);
    var spec = UI.pmSpec && UI.pmSpec();
    if (spec && spec._curves) UI.withToolPM(function () { spec.groups = toolGroups(spec); UI.renderPM(); });
    refreshValues();
    UI.setStatus('New Polygon: click its center.');
  }
  // an entity placed by one of these tools: its Parameters (and relations) are shown and can be edited
  function placed(f, i) {
    var spec = UI.pmSpec && UI.pmSpec();
    tp.last = i; tp.sketch = f.id;
    if (spec && spec._curves && spec._curves.kind === 'tool') UI.withToolPM(function () { spec.groups = toolGroups(spec); UI.renderPM(); });
  }
  // The open PM's Parameters follow the entity being drawn (the tool PM), the entity placed last, or the selected one.
  function refreshValues() {
    var spec = UI.pmSpec && UI.pmSpec();
    if (!spec || !spec._curves) return;
    var c = spec._curves, e = null, f = sketch();
    if (c.kind === 'tool') {
      var tmp = (App.tempEntities || [])[0], li = lastEntity(c.fam);
      if (tmp && drawing() && FAM_TYPES[c.fam].indexOf(tmp.t) >= 0) e = tmp;
      else if (li != null && !drawing()) e = f.entities[li];
    } else {
      e = f && f.entities[c.index];
      if (!e || e.t !== c.type) return;
    }
    showParams(spec, e);
  }
  // the live values ride on ui-core's updateTemp (every preview of the tool, and after each placement); a tool PM whose
  // tool was put down (Esc, the ribbon button again, another tool) closes with it
  if (UI.updateTemp && !UI.updateTemp._curves) {
    var baseUpdateTemp = UI.updateTemp;
    UI.updateTemp = function () { var r = baseUpdateTemp.apply(this, arguments); try { refreshValues(); } catch (e) { /* the PM is never worth a broken preview */ } return r; };
    UI.updateTemp._curves = true;
  }
  if (UI.refreshRibbon && !UI.refreshRibbon._curves) {
    var baseRefreshRibbon = UI.refreshRibbon;
    UI.refreshRibbon = function () {
      var r = baseRefreshRibbon.apply(this, arguments), spec = UI.pmSpec && UI.pmSpec();
      if (spec && spec._curves && spec._curves.kind === 'tool' && (App.mode !== 'sketch' || FAM[App.tool] !== spec._curves.fam)) UI.closePM();
      return r;
    };
    UI.refreshRibbon._curves = true;
  }
  ['circle', 'pcircle', 'arc', 'tarc', 'arc3', 'polygon', 'slot', 'cslot', 'aslot3', 'aslot'].forEach(function (t) { UI.sketchToolPMs[t] = openToolPM; });

  // ------------------------------------------------------------------ entity PropertyManagers (a selected entity)
  function entityPM(index, e, f) {
    var fam = e.t === 'poly' ? 'poly' : e.t === 'aslot' ? 'slot' : e.t;
    var p = params(e) || {}, values = { construction: !!e.construction, lenType: opt.overall ? 'overall' : 'cc' };
    Object.keys(p).forEach(function (k) { values[k] = k === 'ins' ? p[k] : shown(k, p[k]); });
    var groups = relationGroups(f, index);
    if (e.t === 'slot') groups.push({ title: 'Slot', fields: [{ type: 'iconRadio', label: 'Length', key: 'lenType', options: LEN_TYPES }] });
    groups.push({ title: 'Options', fields: [{ type: 'check', label: 'For construction', key: 'construction' }] });
    groups.push({ title: 'Parameters', fields: paramFields(fam, null, e.t) });
    UI.openPM({
      // rfF: noFocus, as the Line / Rectangle / Point PMs: the keyboard stays with the graphics area, so Delete deletes the
      // selected circle / arc / slot / polygon (it blanked the focused Center X box instead)
      title: TITLES[fam], icon: e.t === 'poly' ? 'polygon' : e.t, values: values, groups: groups, noFocus: true,
      _curves: { kind: 'entity', index: index, type: e.t, fam: fam },
      onChange: function (v, key) {
        if (key === 'construction') { setConstruction(f, index, v.construction); return; }
        if (key === 'lenType') { opt.overall = v.lenType === 'overall'; saveOpt(); refreshValues(); return; }
        if (key !== 'ins' && NUM_KEYS.indexOf(key) < 0) return;
        applyParam(f, index, key, v[key]);
      },
      onOK: function () { App.sel = null; UI.updateSketches(); }
    });
  }
  ['circle', 'arc', 'poly', 'slot', 'aslot'].forEach(function (t) { UI.sketchEntityPMs[t] = entityPM; });

  // ------------------------------------------------------------------ tool definitions (ui-sketch.js hooks)
  function after(f, i) { placed(f, i); }
  // the built-in tools: only the PM follows what they place
  ['circle', 'arc', 'arc3'].forEach(function (t) {
    UI.sketchToolDefs[t] = { after: function (f, i0) { after(f, i0); } };
  });
  UI.sketchToolDefs.slot = {
    // slot-overall: a typed overall length must be more than the width (ui-sketch.js places the far centre at L - w)
    accept: function (st, p, typed) {
      if (st.pts.length !== 2) return true;
      var w = typed && typed.w != null ? typed.w : 2 * geom().distPointLine(p, st.pts[0], st.pts[1]);
      return overallTooShort(st, w) ? overallRefused(st, w) : true;
    },
    after: function (f, i0) { if (opt.slotDims) slotDims(f, i0); after(f, i0); }
  };

  // ---- shared helpers for the slot and arc tools
  function unit(v) { var L = Math.hypot(v[0], v[1]); return L > 1e-15 ? [v[0] / L, v[1] / L] : [1, 0]; }
  function polar(o, L, a) { return [cleanLen(o[0] + L * Math.cos(a)), cleanLen(o[1] + L * Math.sin(a))]; }
  // a slot width's point: the cursor's distance from the axis a-b rounded as a length (W 6, not 5.8)
  function refineSlotWidth(out, a, b, raw, h, grid) {
    if (grid) return;
    var ux = b[0] - a[0], uy = b[1] - a[1], La = Math.hypot(ux, uy);
    if (!(La > 1e-12)) return;
    ux /= La; uy /= La;
    var sd = (raw[0] - a[0]) * -uy + (raw[1] - a[1]) * ux, along = (raw[0] - a[0]) * ux + (raw[1] - a[1]) * uy;
    var hw = geom().niceRound(2 * Math.abs(sd), 2 * h) / 2 * (sd < 0 ? -1 : 1);
    out.p = [a[0] + ux * along - uy * hw, a[1] + uy * along + ux * hw];
    out.align = [];
  }
  // an arc slot's width point: the cursor's distance from the centre-line arc rounded as a length
  function refineArcWidth(out, arc, raw, h, grid) {
    if (grid || !arc) return;
    var vx = raw[0] - arc.cx, vy = raw[1] - arc.cy, d = Math.hypot(vx, vy);
    if (!(d > 1e-12)) return;
    var hw = geom().niceRound(2 * Math.abs(d - arc.r), 2 * h) / 2, rr = d >= arc.r ? arc.r + hw : arc.r - hw;
    out.p = [arc.cx + vx / d * rr, arc.cy + vy / d * rr];
    out.align = [];
  }
  function refineRadius(out, c, raw, h, grid) {
    if (grid || out.align.length) return;
    var vx = raw[0] - c[0], vy = raw[1] - c[1], r = Math.hypot(vx, vy);
    if (r > 1e-12) { var rr = geom().niceRound(r, h); out.p = [c[0] + vx / r * rr, c[1] + vy / r * rr]; }
  }
  // the width point for a typed slot width w: on the cursor's side of the arc (or of the axis a-b)
  function arcWidthPoint(arc, cur, w) {
    var v = [cur[0] - arc.cx, cur[1] - arc.cy], d = Math.hypot(v[0], v[1]), u = unit(v);
    return polar([arc.cx, arc.cy], d >= arc.r ? arc.r + w / 2 : arc.r - w / 2, Math.atan2(u[1], u[0]));
  }
  function slotWidthPoint(a, b, cur, w) {
    var u = unit([b[0] - a[0], b[1] - a[1]]), n = [-u[1], u[0]], side = (cur[0] - a[0]) * n[0] + (cur[1] - a[1]) * n[1] < 0 ? -1 : 1;
    return [cleanLen(a[0] + n[0] * side * w / 2), cleanLen(a[1] + n[1] * side * w / 2)];
  }
  function arcWidth(arc, p) { return 2 * Math.abs(Math.hypot(p[0] - arc.cx, p[1] - arc.cy) - arc.r); }
  function angOf(v) { var d = Math.atan2(v[1], v[0]) * R2D; return d < 0 ? d + 360 : d; }
  function isArc(e) { return e && e.t === 'arc'; }
  // 3 Point Arc with a typed radius r: the middle point of the arc from A to B of radius r on the cursor's side (as
  // ui-sketch.js does for the 3 Point Arc)
  function arc3Through(A, B, cur, r) {
    var mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, ux = B[0] - A[0], uy = B[1] - A[1], c = Math.hypot(ux, uy);
    if (c < 1e-12) return cur;
    var n = [-uy / c, ux / c], d = (cur[0] - mx) * n[0] + (cur[1] - my) * n[1], sg = d < 0 ? -1 : 1;
    r = Math.max(r, c / 2);
    var hh = Math.sqrt(Math.max(0, r * r - c * c / 4)), bulge = Math.abs(Math.abs(d) - (r + hh)) < Math.abs(Math.abs(d) - (r - hh)) ? r + hh : r - hh;
    return [cleanLen(mx + n[0] * sg * bulge), cleanLen(my + n[1] * sg * bulge)];
  }
  function typedR(st, k) { return st && st.typed && st.typed[k] != null ? st.typed[k] : null; }

  // ---- Perimeter Circle: three points on the circle (after two, the circle on them as a diameter follows the cursor)
  UI.sketchToolDefs.pcircle = {
    steps: 3,
    entities: function (pts, cur) {
      var all = pts.concat(cur ? [cur] : []);
      if (all.length === 2) {
        var a = all[0], b = all[1], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return d > 1e-12 ? [{ t: 'circle', cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, r: cleanLen(d / 2) }] : [];
      }
      var t = all.length >= 3 && geom().threePointArc(all[0], all[1], all[2]);
      return t ? [{ t: 'circle', cx: t.cx, cy: t.cy, r: t.r }] : [];
    },
    accept: function (st, p) {
      if (st.pts.length === 2 && !geom().threePointArc(st.pts[0], st.pts[1], p)) { UI.setStatus('The three points are in a line: click a point off the line through the first two.'); return false; }
      return true;
    },
    readout: function (pts, p, n) { var e = this.entities(pts, p)[0]; return e ? 'R ' + n(e.r, 2) : ''; },
    // each point placed on an existing sketch point holds it on the circle (Coincident), as SolidWorks infers
    after: function (f, i0, cnt, st) {
      var S = SS();
      if (S) (st.pts || []).forEach(function (q) {
        var ref = pointRefAt(f, q, i0);
        if (ref) S.addRelation(f, 'coincident', [ref, String(i0)], { rejectOver: true });
      });
      after(f, i0);
    }
  };
  // the ref of an existing sketch point (or the origin) at q, other than entity `skip`'s (not a midpoint), or null
  function pointRefAt(f, q, skip) {
    var tol = 1e-9 * Math.max(1, Math.abs(q[0]), Math.abs(q[1]));
    if (Math.abs(q[0]) < tol && Math.abs(q[1]) < tol) return 'O';
    var S = SS();
    for (var j = 0; j < f.entities.length; j++) {
      if (j === skip) continue;
      var prs = S.pointRefs(f, j);
      for (var k = 0; k < prs.length; k++) {
        if (/\.mid$/.test(prs[k].ref) || (/\.c$/.test(prs[k].ref) && /^(rect|slot)$/.test(f.entities[j].t))) continue;
        if (Math.abs(prs[k].pt[0] - q[0]) < tol && Math.abs(prs[k].pt[1] - q[1]) < tol) return prs[k].ref;
      }
    }
    return null;
  }

  // ---- Tangent Arc: from the end of a line or arc. SolidWorks' intent zones: the way the cursor leaves the end point
  // (more than 10 px away) picks the arc — along the line / arc: tangent; back over it: reverse tangent; square to it:
  // normal; back within 10 px of the end point lets the next way out choose again.
  function tarcZone(st, P, Q) {
    var pl = UI.activePlane(), sP = UI.worldToScreen(K.to3D(pl, P[0], P[1])), sQ = UI.worldToScreen(K.to3D(pl, Q[0], Q[1]));
    if (Math.hypot(sQ[0] - sP[0], sQ[1] - sP[1]) < 10) { st.tzone = null; return; }
    if (st.tzone) return;
    var t = st.tdir, v = [Q[0] - P[0], Q[1] - P[1]], L = Math.hypot(v[0], v[1]);
    if (!(L > 0)) return;
    var c = (v[0] * t[0] + v[1] * t[1]) / L, left = t[0] * v[1] - t[1] * v[0] >= 0;
    st.tzone = c > 0.5 ? { kind: 'tangent', u: t } : c < -0.5 ? { kind: 'reverse', u: [-t[0], -t[1]] } : { kind: 'normal', u: left ? [-t[1], t[0]] : [t[1], -t[0]] };
  }
  function tarcDir(st) { return st.tzone ? st.tzone.u : st.tdir; }
  function tarcArc(st, P, Q) { var a = st.tdir && geom().tangentArc(P, tarcDir(st), Q); if (a) a.r = cleanLen(a.r); return a; }
  UI.sketchToolDefs.tarc = {
    steps: 2,
    accept: function (st, p) {
      var f = sketch();
      if (!st.pts.length) {
        var fwd = f && geom().smoothDirs(f, p).fwd;
        if (!fwd) { UI.setStatus('A tangent arc starts at the end of a line or an arc: click an end point.'); return false; }
        st.tdir = fwd; st.tzone = null;
        return true;
      }
      if (!tarcArc(st, st.pts[0], p)) { UI.setStatus('That point is on the tangent line: move off it for an arc.'); return false; }
      return true;
    },
    entities: function (pts, cur, st) {
      var P = pts[0], Q = cur || pts[1];
      if (!P || !Q || !st.tdir) return [];
      if (cur && pts.length === 1) tarcZone(st, P, cur);
      var a = tarcArc(st, P, Q);
      return a ? [a] : [];
    },
    fields: function () { return [['R', 'r'], ['A', 'sweep']]; },
    live: function (pts, p, st) { var a = tarcArc(st, pts[0], p); return a ? { r: a.r, sweep: a.a1 - a.a0 } : {}; },
    typed: function (pts, cur, v, st) {
      var P = pts[0], u = tarcDir(st), a = tarcArc(st, P, cur);
      if (!u) return cur;
      var r = v.r != null ? v.r : a ? a.r : null, sw = v.sweep != null ? v.sweep : a ? a.a1 - a.a0 : null;
      if (!(r > 0) || !(sw > 0)) return cur;
      var left = u[0] * (cur[1] - P[1]) - u[1] * (cur[0] - P[0]) >= 0, n = left ? [-u[1], u[0]] : [u[1], -u[0]];
      var C = [P[0] + n[0] * r, P[1] + n[1] * r], a0 = Math.atan2(P[1] - C[1], P[0] - C[0]);
      return polar(C, r, a0 + (left ? 1 : -1) * sw * D2R);
    },
    readout: function (pts, p, n) { var a = tarcArc(App.toolState || {}, pts[0], p); return a ? 'R ' + n(a.r, 2) + '   A ' + n(a.a1 - a.a0, 1) + '°' : ''; },
    after: function (f, i0, cnt, st) {
      tarcRelations(f, i0, st);
      if (typedR(st, 'r') != null || numericOn()) radDim(f, i0, 45);
      after(f, i0);
    }
  };
  // The arc's end on the clicked line / arc end is Coincident with that end (not only with the origin when the end is
  // there: the solver writes a Tangent at a shared end as an angle condition, and it finds the shared end through the
  // Coincidents but not through the origin), then Tangent to it unless the arc leaves it square (normal).
  function tarcRelations(f, i, st) {
    var S = SS(), e = f.entities[i], P = st.pts && st.pts[0];
    if (!S || !e || !P) return;
    var src = null, ends = ['p1', 'p2'];
    for (var j = 0; j < f.entities.length && !src; j++) {
      var o = f.entities[j];
      if (j === i || !o || (o.t !== 'line' && o.t !== 'arc')) continue;
      ends.forEach(function (s) { var q = S.refPoint(f, j + '.' + s); if (!src && q && Math.hypot(q[0] - P[0], q[1] - P[1]) < 1e-9 * Math.max(1, Math.abs(P[0]), Math.abs(P[1]))) src = { e: j, ref: j + '.' + s }; });
    }
    if (!src) return;
    var mine = ends.map(function (s) { return i + '.' + s; }).filter(function (r) { var q = S.refPoint(f, r); return q && Math.hypot(q[0] - P[0], q[1] - P[1]) < 1e-7 * Math.max(1, Math.abs(P[0]), Math.abs(P[1])); })[0];
    if (!mine) return;
    (f.rels || []).forEach(function (r) {
      if (r.type === 'coincident' && r.refs.length === 2 && r.refs.indexOf(mine) >= 0 && r.refs.indexOf('O') >= 0) r.refs = [mine, src.ref];
    });
    if (st.tzone && st.tzone.kind === 'normal') return;
    var has = (f.rels || []).some(function (r) { return r.type === 'tangent' && r.refs.indexOf(String(i)) >= 0 && r.refs.indexOf(String(src.e)) >= 0; });
    if (!has) S.addRelation(f, 'tangent', [String(i), String(src.e)], { rejectOver: true });
  }

  // ---- Polygon: the click after the center is a corner (Circumscribed circle) or the middle of a side (Inscribed)
  function polyFrom(c, b, st, exact) {
    var n = opt.sides | 0 || 6, d = Math.hypot(b[0] - c[0], b[1] - c[1]), a = Math.atan2(b[1] - c[1], b[0] - c[0]) * R2D;
    if (exact && typedR(st, 'pr') != null) d = typedR(st, 'pr');
    if (!(d > 1e-12)) return null;
    var e = { t: 'poly', cx: c[0], cy: c[1], r: opt.ins ? d / Math.cos(Math.PI / n) : cleanLen(d), n: n, rot: opt.ins ? a + 180 / n : a };
    if (opt.ins) e.ins = true;
    return e;
  }
  UI.sketchToolDefs.polygon = {
    steps: 2,
    entities: function (pts, cur, st) { var e = polyFrom(pts[0], cur || pts[1], st, !cur); return e ? [e] : []; },
    fields: function () { return [['R', 'pr'], ['A', 'ang']]; },
    live: function (pts, p) { var c = pts[0]; return { pr: Math.hypot(p[0] - c[0], p[1] - c[1]), ang: angOf([p[0] - c[0], p[1] - c[1]]) }; },
    typed: function (pts, cur, v) {
      var c = pts[0], d = Math.hypot(cur[0] - c[0], cur[1] - c[1]), a = d > 1e-12 ? Math.atan2(cur[1] - c[1], cur[0] - c[0]) : 0;
      return polar(c, v.pr != null ? v.pr : d, v.ang != null ? v.ang * D2R : a);
    },
    readout: function (pts, p, n) { var c = pts[0]; return 'R ' + n(Math.hypot(p[0] - c[0], p[1] - c[1]), 2) + '   A ' + n(angOf([p[0] - c[0], p[1] - c[1]]), 1) + '°'; },
    after: function (f, i0, cnt, st) {
      if (typedR(st, 'pr') != null && !numericOn()) radDim(f, i0, 45);
      after(f, i0);
    }
  };

  // ---- Centerpoint Straight Slot: center, the center of one end (the other mirrors it), the width
  function cslotAxis(c, b) { return [[2 * c[0] - b[0], 2 * c[1] - b[1]], b]; }
  // slot-overall: a length typed with Overall Length is the slot's length cap to cap: once the width w is known the
  // ends come in to (L - w) / 2 from the center (the direction clicked holds); null when L is not more than w
  function cslotOverall(c, b, st, w) {
    var L = typedR(st, 'len'), d = Math.hypot(b[0] - c[0], b[1] - c[1]);
    if (L == null || !opt.overall || !(d > 1e-12)) return cslotAxis(c, b);
    if (!(L - w > 1e-9)) return null;
    var h = (L - w) / 2, u = [(b[0] - c[0]) / d, (b[1] - c[1]) / d];
    return [[cleanLen(c[0] - u[0] * h), cleanLen(c[1] - u[1] * h)], [cleanLen(c[0] + u[0] * h), cleanLen(c[1] + u[1] * h)]];
  }
  // the overall length typed is not more than the width: the width click is refused
  function overallTooShort(st, w) { var L = typedR(st, 'len'); return opt.overall && L != null && !(L - w > 1e-9); }
  function overallRefused(st, w) { UI.setStatus('The width click is not taken: the overall length ' + UI.fmtLen(typedR(st, 'len')) + ' must be more than the slot width ' + UI.fmtLen(w) + '.'); return false; }
  UI.sketchToolDefs.cslot = {
    steps: 3,
    entities: function (pts, cur, st) {
      var all = pts.concat(cur ? [cur] : []);
      if (all.length < 2) return [];
      var ax = cslotAxis(all[0], all[1]);
      if (all.length === 2) return [{ t: 'line', x1: ax[0][0], y1: ax[0][1], x2: ax[1][0], y2: ax[1][1] }];
      var w = !cur && typedR(st, 'w') != null ? typedR(st, 'w') : cleanLen(Math.max(2 * geom().distPointLine(all[2], ax[0], ax[1]), 0.01));
      ax = cslotOverall(all[0], all[1], st, w) || ax;
      return [{ t: 'slot', x1: ax[0][0], y1: ax[0][1], x2: ax[1][0], y2: ax[1][1], w: w }];
    },
    accept: function (st, p, typed) {
      if (st.pts.length !== 2) return true;
      var ax = cslotAxis(st.pts[0], st.pts[1]), w = typed && typed.w != null ? typed.w : 2 * geom().distPointLine(p, ax[0], ax[1]);
      return overallTooShort(st, w) ? overallRefused(st, w) : true;
    },
    fields: function (n) { return n === 1 ? [['L', 'len'], ['A', 'ang']] : [['W', 'w']]; },
    live: function (pts, p) {
      var c = pts[0];
      if (pts.length === 1) return { len: 2 * Math.hypot(p[0] - c[0], p[1] - c[1]), ang: angOf([p[0] - c[0], p[1] - c[1]]) };
      var ax = cslotAxis(c, pts[1]);
      return { w: 2 * geom().distPointLine(p, ax[0], ax[1]) };
    },
    typed: function (pts, cur, v) {
      var c = pts[0];
      if (pts.length === 1) {
        var d = Math.hypot(cur[0] - c[0], cur[1] - c[1]), a = d > 1e-12 ? Math.atan2(cur[1] - c[1], cur[0] - c[0]) : 0;
        return polar(c, v.len != null ? v.len / 2 : d, v.ang != null ? v.ang * D2R : a);
      }
      return v.w == null ? cur : slotWidthPoint(c, pts[1], cur, v.w);
    },
    refine: function (out, raw, st, h, grid) { if (st.pts.length === 2) { var ax = cslotAxis(st.pts[0], st.pts[1]); refineSlotWidth(out, ax[0], ax[1], raw, h, grid); } },
    readout: function (pts, p, n) {
      var c = pts[0];
      if (pts.length === 1) return 'L ' + n(2 * Math.hypot(p[0] - c[0], p[1] - c[1]), 2);
      var ax = cslotAxis(c, pts[1]), w = 2 * geom().distPointLine(p, ax[0], ax[1]), st = App.toolState || {}, tl = typedR(st, 'len');
      // slot-overall: the overall length while the width is picked (the typed one holds)
      var L = opt.overall ? (tl != null ? tl : 2 * Math.hypot(pts[1][0] - c[0], pts[1][1] - c[1]) + w) : 2 * Math.hypot(pts[1][0] - c[0], pts[1][1] - c[1]);
      return 'L ' + n(L, 2) + '   W ' + n(w, 2);
    },
    // SolidWorks' centerpoint slot has its center point: a sketch point held at the middle of the slot (Midpoint)
    after: function (f, i0, cnt, st) {
      var c = st.pts[0], S = SS();
      f.entities.push({ t: 'point', x: c[0], y: c[1] });
      var pi = f.entities.length - 1;
      if (S) { S.infer(f, pi); S.addRelation(f, 'midpoint', [String(pi), String(i0)], { rejectOver: true }); }
      if (opt.slotDims) slotDims(f, i0);
      after(f, i0);
    }
  };

  // ---- the arc slots: the centre-line arc (3 points, or centre / start / end), then the width
  function aslotOf(arc, w) { return { t: 'aslot', cx: arc.cx, cy: arc.cy, r: arc.r, a0: arc.a0, a1: arc.a1, w: w }; }
  function widthOk(st, arc, p) {
    if (!arc) { UI.setStatus('The slot\'s centre arc could not be made from those points: press Esc and draw it again.'); return false; }
    var w = arcWidth(arc, p);
    if (!(w > 1e-9)) { UI.setStatus('The width click is not taken: it lies on the slot\'s centre arc (width 0). Click beside the arc, at half the slot width from it.'); return false; }
    if (!(w < 2 * arc.r * (1 - 1e-9))) { UI.setStatus('The width click is not taken: the slot would be ' + UI.fmtLen(w) + ' wide, not less than the arc\'s diameter ' + UI.fmtLen(2 * arc.r) + '. Click nearer the arc.'); return false; }
    return true;
  }
  // sketch-tools2: the width step of an arc slot does not snap onto the slot's own points (its start, end, centre or
  // third point): a width click near the third point landed exactly on it, and ui-sketch.js refuses a point the tool
  // has already placed (sketch-hooks: UI.sketchToolDefs[tool].noOwnSnap, read by ui-sketch.js inferPoint)
  function widthStep(st) { return st.pts.length >= 3; }
  function slotAfter(f, i0, st) {
    var which = {};
    if (typedR(st, 'r') != null || numericOn()) which.r = 1;
    if (typedR(st, 'w') != null || numericOn()) which.w = 1;
    if (opt.slotDims) which = { r: 1, w: 1 };
    if (which.r || which.w) slotDims(f, i0, which);
    after(f, i0);
  }
  // 3 Point Arc Slot
  function arc3Of(pts) { var t = pts.length >= 3 && geom().threePointArc(pts[0], pts[1], pts[2]); return isArc(t) ? t : null; }
  UI.sketchToolDefs.aslot3 = {
    steps: 4,
    entities: function (pts, cur, st) {
      var all = pts.concat(cur ? [cur] : []);
      if (all.length < 2) return [];
      if (all.length === 2) return [{ t: 'line', x1: all[0][0], y1: all[0][1], x2: all[1][0], y2: all[1][1] }];
      var arc = arc3Of(all);
      if (all.length === 3) return arc ? [arc] : [{ t: 'line', x1: all[0][0], y1: all[0][1], x2: all[1][0], y2: all[1][1] }];
      if (!arc) return [];
      var w = !cur && typedR(st, 'w') != null ? typedR(st, 'w') : cleanLen(arcWidth(arc, all[3]));
      return w > 0 && w < 2 * arc.r ? [aslotOf(arc, w)] : [arc];
    },
    accept: function (st, p) {
      if (st.pts.length === 2 && !arc3Of(st.pts.concat([p]))) { UI.setStatus('The three points are in a line: click a point off the line from start to end.'); return false; }
      if (st.pts.length === 3) return widthOk(st, arc3Of(st.pts), p);
      return true;
    },
    noOwnSnap: widthStep,
    fields: function (n) { return n === 1 ? [['L', 'len'], ['A', 'ang']] : n === 2 ? [['R', 'r']] : [['W', 'w']]; },
    live: function (pts, p) {
      var a = pts[0];
      if (pts.length === 1) return { len: Math.hypot(p[0] - a[0], p[1] - a[1]), ang: angOf([p[0] - a[0], p[1] - a[1]]) };
      if (pts.length === 2) { var t = arc3Of(pts.concat([p])); return t ? { r: t.r } : {}; }
      var arc = arc3Of(pts);
      return arc ? { w: arcWidth(arc, p) } : {};
    },
    typed: function (pts, cur, v) {
      var a = pts[0];
      if (pts.length === 1) {
        var d = Math.hypot(cur[0] - a[0], cur[1] - a[1]);
        return polar(a, v.len != null ? v.len : d, v.ang != null ? v.ang * D2R : d > 1e-12 ? Math.atan2(cur[1] - a[1], cur[0] - a[0]) : 0);
      }
      if (pts.length === 2) return v.r == null ? cur : arc3Through(a, pts[1], cur, v.r);
      var arc = arc3Of(pts);
      return arc && v.w != null ? arcWidthPoint(arc, cur, v.w) : cur;
    },
    refine: function (out, raw, st, h, grid) { if (st.pts.length === 3) refineArcWidth(out, arc3Of(st.pts), raw, h, grid); },
    readout: function (pts, p, n) {
      var a = pts[0];
      if (pts.length === 1) return 'L ' + n(Math.hypot(p[0] - a[0], p[1] - a[1]), 2);
      if (pts.length === 2) { var t = arc3Of(pts.concat([p])); return t ? 'R ' + n(t.r, 2) + '   A ' + n(t.a1 - t.a0, 1) + '°' : ''; }
      var arc = arc3Of(pts);
      return arc ? 'R ' + n(arc.r, 2) + '   W ' + n(arcWidth(arc, p), 2) : '';
    },
    after: function (f, i0, cnt, st) { slotAfter(f, i0, st); }
  };
  // Centerpoint Arc Slot: the arc runs the way the cursor sweeps round the centre (as the Centerpoint Arc)
  function trackSweep(st, c, b, cur) {
    if (st.aFrom !== b) { st.aFrom = b; st.aSweep = 0; st.aLast = null; }
    if (!cur || Math.hypot(cur[0] - c[0], cur[1] - c[1]) < 1e-12) return;
    var now = Math.atan2(cur[1] - c[1], cur[0] - c[0]) * R2D;
    if (st.aLast == null) st.aLast = Math.atan2(b[1] - c[1], b[0] - c[0]) * R2D;
    st.aSweep = (st.aSweep || 0) + ((now - st.aLast) % 360 + 540) % 360 - 180;
    st.aLast = now;
  }
  function centerArc(st, c, b, e) {
    var r = Math.hypot(b[0] - c[0], b[1] - c[1]);
    if (!(r > 1e-12) || Math.hypot(e[0] - c[0], e[1] - c[1]) < 1e-12) return null;
    var a0 = Math.atan2(b[1] - c[1], b[0] - c[0]) * R2D, a1 = Math.atan2(e[1] - c[1], e[0] - c[0]) * R2D;
    if ((st.aSweep || 0) < 0) { var s = a0; a0 = a1; a1 = s; }   // clockwise: stored counter-clockwise from the end
    while (a1 <= a0) a1 += 360;
    if (a1 - a0 >= 360 - 1e-9) return null;
    return { t: 'arc', cx: c[0], cy: c[1], r: typedR(st, 'r') != null ? typedR(st, 'r') : cleanLen(r), a0: a0, a1: a1 };
  }
  function centerArcOf(st, pts, cur) {
    if (pts.length < 2) return null;
    if (pts.length === 2 && cur) trackSweep(st, pts[0], pts[1], cur);
    var e = pts.length >= 3 ? pts[2] : cur;
    return e ? centerArc(st, pts[0], pts[1], e) : null;
  }
  UI.sketchToolDefs.aslot = {
    steps: 4,
    entities: function (pts, cur, st) {
      var all = pts.concat(cur ? [cur] : []);
      if (all.length < 2) return [];
      if (all.length === 2) return [{ t: 'line', x1: all[0][0], y1: all[0][1], x2: all[1][0], y2: all[1][1] }];
      var arc = centerArcOf(st, pts, cur);
      if (all.length === 3) return arc ? [arc] : [];
      if (!arc) return [];
      var w = !cur && typedR(st, 'w') != null ? typedR(st, 'w') : cleanLen(arcWidth(arc, all[3]));
      return w > 0 && w < 2 * arc.r ? [aslotOf(arc, w)] : [arc];
    },
    accept: function (st, p) {
      if (st.pts.length === 1) { st.aFrom = null; st.aSweep = 0; st.aLast = null; }
      if (st.pts.length === 2 && !centerArc(st, st.pts[0], st.pts[1], p)) { UI.setStatus('Click the end of the arc away from its start and its center.'); return false; }
      if (st.pts.length === 3) return widthOk(st, centerArcOf(st, st.pts), p);
      return true;
    },
    noOwnSnap: widthStep,
    fields: function (n) { return n === 1 ? [['R', 'r']] : n === 2 ? [['A', 'sweep']] : [['W', 'w']]; },
    live: function (pts, p, st) {
      var c = pts[0];
      if (pts.length === 1) return { r: Math.hypot(p[0] - c[0], p[1] - c[1]) };
      var arc = pts.length === 2 ? centerArcOf(st, pts, p) : centerArcOf(st, pts);
      if (pts.length === 2) return arc ? { sweep: arc.a1 - arc.a0 } : {};
      return arc ? { w: arcWidth(arc, p) } : {};
    },
    typed: function (pts, cur, v, st) {
      var c = pts[0];
      if (pts.length === 1) { var d = Math.hypot(cur[0] - c[0], cur[1] - c[1]); return v.r == null ? cur : polar(c, v.r, d > 1e-12 ? Math.atan2(cur[1] - c[1], cur[0] - c[0]) : 0); }
      if (pts.length === 2) {
        if (v.sweep == null) return cur;
        var b = pts[1], a0 = Math.atan2(b[1] - c[1], b[0] - c[0]);
        return polar(c, Math.hypot(b[0] - c[0], b[1] - c[1]), a0 + ((st.aSweep || 0) < 0 ? -1 : 1) * v.sweep * D2R);
      }
      var arc = centerArcOf(st, pts);
      return arc && v.w != null ? arcWidthPoint(arc, cur, v.w) : cur;
    },
    refine: function (out, raw, st, h, grid) {
      if (st.pts.length === 1) refineRadius(out, st.pts[0], raw, h, grid);
      else if (st.pts.length === 3) refineArcWidth(out, centerArcOf(st, st.pts), raw, h, grid);
    },
    readout: function (pts, p, n) {
      var st = App.toolState || {}, c = pts[0];
      if (pts.length === 1) return 'R ' + n(Math.hypot(p[0] - c[0], p[1] - c[1]), 2);
      var arc = pts.length === 2 ? centerArcOf(st, pts, p) : centerArcOf(st, pts);
      if (!arc) return '';
      return 'R ' + n(arc.r, 2) + '   A ' + n(arc.a1 - arc.a0, 1) + '°' + (pts.length >= 3 ? '   W ' + n(arcWidth(arc, p), 2) : '');
    },
    after: function (f, i0, cnt, st) { slotAfter(f, i0, st); }
  };

  // ------------------------------------------------------------------ the ribbon (SolidWorks' flyouts)
  // Circle / Perimeter Circle; Centerpoint / Tangent / 3 Point Arc; the four slot types (UI.RIBBON is ui-panels.js')
  function patchRibbon() {
    var R = UI.RIBBON && UI.RIBBON.Sketch;
    if (!R) return;
    function find(pred) { for (var i = 0; i < R.length; i++) if (R[i] && pred(R[i])) return i; return -1; }
    var ci = find(function (it) { return it.tool === 'circle' && !it.fly; });
    if (ci >= 0) R[ci] = { fly: 'circle', items: [R[ci], { id: 'pcircle', label: 'Perimeter\nCircle', tool: 'pcircle', help: 'Circle through three points on it' }] };
    var ai = find(function (it) { return it.fly === 'arc'; });
    if (ai >= 0 && !R[ai].items.some(function (x) { return x.tool === 'tarc'; })) R[ai].items.splice(1, 0, { id: 'tarc', label: 'Tangent\nArc', tool: 'tarc', help: 'Arc tangent to the end of a line or arc' });
    var si = find(function (it) { return it.tool === 'slot' && !it.fly; });
    if (si >= 0) R[si] = { fly: 'slot', items: [R[si], { id: 'cslot', label: 'Centerpoint\nStraight Slot', tool: 'cslot', help: 'Slot from its center, an end and a width' },
      { id: 'aslot3', label: '3 Point\nArc Slot', tool: 'aslot3', help: 'Arc slot from three points on its arc and a width' },
      { id: 'aslot', label: 'Centerpoint\nArc Slot', tool: 'aslot', help: 'Arc slot from the arc center, its ends and a width' }] };
    try { if (UI.refreshRibbon) UI.refreshRibbon(); } catch (e) { /* not booted yet */ }
  }
  patchRibbon();

  // automation and tests: the remembered options ({ sides, ins, slotDims, overall }); set merges and returns them
  UI.sketchCurveOptions = function (set) {
    if (set) { Object.keys(set).forEach(function (k) { if (k in opt) opt[k] = k === 'sides' ? Math.max(3, Math.min(40, Math.round(+set[k]) || 6)) : !!set[k]; }); saveOpt(); }
    return JSON.parse(JSON.stringify(opt));
  };
})();
