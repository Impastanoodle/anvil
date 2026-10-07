// ui-sketch-dims.js — Smart Dimension and its Dimension PropertyManager, the Modify box, Add / Display-Delete Relations, Fully Define Sketch, sketch status.
// Registers tool PMs in UI.sketchToolPMs[tool] (opened by setTool in ui-sketch.js); see README *Sketch tab*.
//
// What lives here (the maths is in sketch-solver.js; the drawing of dimensions in ui-sketch.js and ui-relations.js,
// which call the hooks below):
//   - UI.sketchRelationGroups(sketch, refs, opts): the *Existing Relations* and *Add Relations* groups of any sketch
//     PropertyManager (Add Relations itself, Line Properties, Circle, Point …).
//   - The Add Relations and Display/Delete Relations PropertyManagers (SolidWorks' layout: Selected Entities, Existing
//     Relations with their state, Add Relations with only the relations that apply, Options; filters, Suppressed,
//     Delete / Delete All, the entities of the selected relation).
//   - The Dimension PropertyManager of a selected sketch dimension: Tolerance/Precision, Primary Value (name D1@Sketch1,
//     value, Driven), Dimension Text (text before / after), Leaders (radius / diameter, arc conditions), and the label
//     text every sketch dimension is drawn with (UI.dimLabelText).
//   - Smart Dimension extras: arc length (the arc, then its end points), arc conditions on distances to circles and
//     arcs (Center / Min / Max), Reverse the sense of the dimension (Modify box and PM).
//   - Fully Define Sketch (Tools ▸ Dimensions ▸ Fully Define Sketch) with its PropertyManager.
(function () {
  'use strict';
  if (typeof UI === 'undefined') return;
  UI.sketchToolPMs = UI.sketchToolPMs || {};
  var App = UI.App, K = UI.K, $ = UI.$, S = window.SketchSolver;
  if (!S || !App) return;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function markDirty() { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } }
  function refresh() { App.gridStale = true; UI.updateSketches(); UI.refreshTree(); App.dimsStale = true; }
  function refEntity(ref) { var p = S.parseRef(ref); return p && !p.o ? p.e : -1; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function iconName(type) { return type === 'distance' || type === 'angle' || type === 'offset' || type === 'arclength' ? type : 'rel' + type.charAt(0).toUpperCase() + type.slice(1); }
  function scr(pl, uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
  function inch() { return (UI.unitLabel ? UI.unitLabel() : 'mm') === 'in'; }
  var STATE_TEXT = { ok: 'Satisfied', redundant: 'Over Defining (redundant)', conflict: 'Not Solved (conflict)', invalid: 'Dangling', suppressed: 'Suppressed', driven: 'Driven' };
  function stateText(s) { return STATE_TEXT[s] || s; }
  // the relation under the mouse lights its entities (ui-relations.js draws App.relHover)
  function hoverRel(i) { if (App.relHover === i) return; App.relHover = i; if (UI.drawDims) { App.dimsStale = false; UI.drawDims(); } else App.dimsStale = true; }
  function analysis(f) { return App.mode === 'sketch' && UI.activeSketchFeature() === f && App.sketchState ? App.sketchState : S.analyze(f); }

  // ------------------------------------------------------------------ dimension text
  // A value as the dimension shows it: the document's style (inch: .500, mm: 12.5) unless the dimension has its own
  // precision (decimal places), then exactly that many places (inch without the leading zero, as ANSI prints them).
  function fmtVal(x, prec, angle) {
    if (prec == null || prec === '' || prec === 'auto' || !(+prec >= 0)) return angle ? UI.fmtNum(x, 2) : (UI.fmtDim ? UI.fmtDim(x) : UI.fmtNum(x, 3));
    var t = Math.abs(x).toFixed(+prec);
    if (!angle && inch() && /^0\./.test(t)) t = t.slice(1);
    if (+t === 0) return angle ? '0' : t;
    return (x < 0 ? '-' : '') + t;
  }
  // UI.dimLabelText(d, value, kind): the label of a sketch dimension (a Smart Dimension in sketch.dims or a distance /
  // angle / arc length relation), kind 'len' | 'dia' | 'r' | 'angle' | 'arclen'. Radius shown as diameter or the other
  // way (d.show), precision (d.prec), tolerance (d.tol: { type: none | basic | bilateral | limit | symmetric | min | max,
  // plus, minus }) and the text before / after the value (d.prefix, d.suffix: "2X ", " TYP"). A driven dimension's
  // parentheses are added by the caller.
  function dimLabelText(d, value, kind) {
    if (value == null || !isFinite(value)) return '';
    d = d || {};
    var k = kind;
    if (k === 'dia' && d.show === 'r') { value /= 2; k = 'r'; }
    else if (k === 'r' && d.show === 'dia') { value *= 2; k = 'dia'; }
    var ang = k === 'angle', sym = k === 'dia' ? 'Ø' : k === 'r' ? 'R' : k === 'arclen' ? '⌒' : '', deg = ang ? '°' : '';
    var tol = d.tol && d.tol.type && d.tol.type !== 'none' ? d.tol : null;
    function num(x) { return fmtVal(x, d.prec, ang) + deg; }
    var main = sym + num(value);
    if (tol) {
      var p = Math.abs(+tol.plus || 0), m = Math.abs(+tol.minus || 0);
      if (tol.type === 'symmetric') main += ' ±' + num(p);
      else if (tol.type === 'bilateral') main += ' +' + num(p) + ' -' + num(m);
      else if (tol.type === 'limit') main = sym + num(value + p) + '/' + num(value - m);
      else if (tol.type === 'min') main += ' MIN';
      else if (tol.type === 'max') main += ' MAX';
    }
    var pre = d.prefix ? String(d.prefix) : '', suf = d.suffix ? String(d.suffix) : '';
    if (pre && !/\s$/.test(pre)) pre += ' ';
    if (suf && !/^\s/.test(suf)) suf = ' ' + suf;
    return pre + main + suf;
  }
  UI.dimLabelText = dimLabelText;
  // the factor between the value a dimension stores and the one it shows (a circle's diameter shown as its radius: 0.5)
  UI.dimShowScale = function (d) {
    if (!d || !d.show || d.e == null || d.type) return 1;
    var f = UI.activeSketchFeature(), e = f && f.entities[d.e];
    if (!e) return 1;
    if (d.k === 'dia' && d.show === 'r') return 0.5;
    if (d.k === 'r' && d.show === 'dia') return 2;
    return 1;
  };

  // ------------------------------------------------------------------ dimension names (D1@Sketch1)
  // Every dimension of the sketch in order: the Smart Dimensions, then the distance / angle / arc length relations.
  // A dimension is named D<n> by that order unless it was given a name in its PropertyManager (d.name).
  function dimList(f) {
    var out = [];
    (f.dims || []).forEach(function (d, i) { out.push({ kind: 'dim', index: i, d: d }); });
    (f.rels || []).forEach(function (r, i) { if (S.TYPES[r.type] && S.TYPES[r.type].dim) out.push({ kind: 'rel', index: i, d: r }); });
    return out;
  }
  function dimName(f, d) {
    if (d && d.name) return String(d.name);
    var list = dimList(f), k = -1;
    for (var i = 0; i < list.length; i++) if (list[i].d === d) k = i;
    return 'D' + (k + 1);
  }
  function fullName(f, d) { return dimName(f, d) + '@' + (f.name || 'Sketch'); }
  UI.sketchDimName = function (kind, index) {
    var f = UI.activeSketchFeature(), d = f && (kind === 'rel' ? (f.rels || [])[index] : (f.dims || [])[index]);
    return d ? fullName(f, d) : null;
  };

  // ------------------------------------------------------------------ the dimension a selection names
  // { f, kind: 'dim' | 'rel', index, d, kindText: 'len' | 'dia' | 'r' | 'angle' | 'arclen', value (stored), shown
  //   (as displayed), scale, unit } or null
  function dimInfo(sel) {
    var f = UI.activeSketchFeature();
    if (!f || !sel) return null;
    var d = sel.d || (sel.kind === 'rel' ? (f.rels || [])[sel.index] : sel.kind === 'dim' ? (f.dims || [])[sel.index] : null);
    if (!d) return null;
    var kind = (f.rels || []).indexOf(d) >= 0 ? 'rel' : (f.dims || []).indexOf(d) >= 0 ? 'dim' : null;
    if (!kind) return null;
    var index = kind === 'rel' ? f.rels.indexOf(d) : f.dims.indexOf(d), kt, value;
    if (kind === 'rel') {
      if (!S.TYPES[d.type] || !S.TYPES[d.type].dim) return null;
      kt = d.type === 'angle' ? 'angle' : d.type === 'arclength' ? 'arclen' : 'len';
      value = d.driven || d.v == null ? S.measure(f, d.type, d.refs, d.dir, d.sup, d.ac) : d.v;
    } else {
      var e = f.entities[d.e], g = e && K.dimGeometry(e, d);
      if (!g) return null;
      kt = g.prefix === '⌀' ? 'dia' : g.prefix === 'R' ? 'r' : 'len';
      value = g.value;
    }
    var scale = kind === 'dim' ? UI.dimShowScale(d) : 1;
    return { f: f, kind: kind, index: index, d: d, kindText: kt, value: value, shown: value * scale, scale: scale, unit: kt === 'angle' ? '°' : 'u' };
  }

  // ------------------------------------------------------------------ setting a value, driven, reverse
  function setValue(info, shown) {
    var f = info.f, v = +shown / info.scale;
    if (!(v >= 0) || !isFinite(v)) return { ok: false, error: 'Not a value.' };
    if (Math.abs(v - info.value) < 1e-12) return { ok: true };
    markDirty();
    var r = info.kind === 'rel' ? S.setRelValue(f, info.index, v) : S.setDim(f, info.index, v);
    refresh();
    if (!r.ok) UI.setStatus('Dimension not changed: ' + r.error);
    else UI.setStatus('Dimension ' + fullName(f, info.d) + ' set to ' + dimLabelText(info.d, v, info.kindText) + '.');
    return r;
  }
  // Reverse the sense of the dimension (SolidWorks' Modify box button): the free geometry goes to the other side of
  // what the dimension measures from, keeping the value. sel: { kind, index }. Returns { ok, error }.
  function reverseSense(sel) {
    var info = dimInfo(sel);
    if (!info) return { ok: false, error: 'Select a dimension first.' };
    var f = info.f, d = info.d, saved = clone(f.entities), r;
    if (d.driven) return { ok: false, error: 'A driven dimension follows the geometry: make it driving to reverse it.' };
    if (info.kind === 'rel') {
      var k0 = S.refKind(f, d.refs[0]), k1 = d.refs[1] != null ? S.refKind(f, d.refs[1]) : null;
      var signed = d.type === 'angle' || (d.type === 'distance' && d.dir !== 'r' && (k0 === 'line' || k1 === 'line' || d.dir === 'h' || d.dir === 'v'));
      if (!signed) return { ok: false, error: 'This dimension has no direction to reverse.' };
      markDirty();
      d.flip = true;
      var pe = d.refs.map(S.parseRef).filter(function (q) { return q && !q.o; })[0];
      r = S.solve(f, { part: pe ? pe.e : null });
      delete d.flip;
    } else {
      var e = f.entities[d.e];
      if (!e || e.t !== 'line' || !/^(len|dx|dy)$/.test(d.k)) return { ok: false, error: 'This dimension has no direction to reverse.' };
      markDirty();
      if (d.k !== 'dy') e.x2 = 2 * e.x1 - e.x2;
      if (d.k !== 'dx') e.y2 = 2 * e.y1 - e.y2;
      r = S.solve(f, { part: d.e });
    }
    var moved = f.entities.some(function (e2, i) { return JSON.stringify(e2) !== JSON.stringify(saved[i]); });
    if (!r.ok || !moved) {
      f.entities = saved;
      refresh();
      var msg = !r.ok ? 'The dimension cannot be reversed: the other relations and dimensions hold the geometry where it is.' : 'Nothing to reverse: the geometry is held where it is.';
      UI.setStatus(msg);
      return { ok: false, error: msg };
    }
    refresh();
    UI.setStatus('Dimension ' + fullName(f, d) + ' reversed.');
    return { ok: true };
  }
  UI.reverseDimSense = reverseSense;

  // ------------------------------------------------------------------ arc length and arc conditions (drawing hooks)
  // ui-relations.js relDimFor wrapped: an arc and one of its end points (either order) -> its arc length (SolidWorks:
  // the arc, then both end points; the other end point clicked next is taken, see UI.dimPickNeed)
  var baseRelDimFor = UI.relDimFor;
  if (baseRelDimFor) UI.relDimFor = function (f, r1, r2) {
    var a = arcEnd(f, r1, r2) || arcEnd(f, r2, r1);
    if (a) return a;
    return baseRelDimFor.apply(this, arguments);
  };
  function arcEnd(f, arcRef, endRef) {
    var pa = S.parseRef(arcRef), pe = S.parseRef(endRef);
    if (!pa || !pe || pa.o || pe.o || pa.s !== null || pe.e !== pa.e || pe.s !== 'p') return null;
    var e = f.entities[pa.e];
    if (!e || e.t !== 'arc') return null;
    return { type: 'arclength', refs: [String(pa.e)], need: pa.e + '.p' + (pe.k === 1 ? 2 : 1) };
  }
  // dimToolClick's placing click for a dimension that waits for one more pick (arc length: the arc's other end point):
  // true when the click was that pick (the next click places the dimension)
  UI.dimPickNeed = function (f, rd, mx, my) {
    if (!rd || !rd.need) return false;
    var ref = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null, need = rd.need;
    delete rd.need;
    if (ref !== need) return false;
    App.toolState.relDim = rd;
    $('sketch-hint').innerHTML = 'Click where the arc length dimension should sit.';
    return true;
  };
  UI.relDimPlacementExt = function (f, rel, uv) {
    if (rel.type !== 'arclength') return null;
    var p = S.parseRef(rel.refs[0]), e = p && !p.o && f.entities[p.e];
    if (!e || e.t !== 'arc') return {};
    return { off: Math.round(Math.hypot(uv[0] - e.cx, uv[1] - e.cy) * 1e4) / 1e4 };
  };
  // an arc length: a dimension arc concentric with the arc at radius off, extension lines out from its ends, arrows,
  // the ⌒ value at the middle
  UI.relDimScreenExt = function (f, pl, rel) {
    if (rel.type !== 'arclength') return null;
    var p = S.parseRef(rel.refs[0]), e = p && !p.o && f.entities[p.e];
    if (!e || e.t !== 'arc') return null;
    var s = UI.cam.scale || 0.1, R = rel.off != null && rel.off > 1e-9 ? rel.off : e.r + 18 * s;
    function at(adeg, r) { var a = adeg * Math.PI / 180; return scr(pl, [e.cx + r * Math.cos(a), e.cy + r * Math.sin(a)]); }
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
    var sw = e.a1 - e.a0, n = Math.max(4, Math.ceil(Math.abs(sw) / 4)), pts = [], out = { lines: [], arrows: [] };
    for (var i = 0; i <= n; i++) pts.push(at(e.a0 + sw * i / n, R));
    for (var j = 0; j < n; j++) out.lines.push([pts[j], pts[j + 1]]);
    out.arrows.push({ tip: pts[0], dir: unit(pts[1], pts[0]) }, { tip: pts[n], dir: unit(pts[n - 1], pts[n]) });
    var gap = 2 * s, ext = 4 * s;
    [e.a0, e.a1].forEach(function (a) {
      if (R > e.r + gap) out.lines.push([at(a, e.r + gap), at(a, R + ext)]);
      else if (R < e.r - gap) out.lines.push([at(a, R - ext), at(a, e.r - gap)]);
    });
    var value = rel.driven || rel.v == null ? S.measure(f, 'arclength', rel.refs) : rel.v;
    out.label = dimLabelText(rel, value, 'arclen');
    if (rel.driven) out.label = '(' + out.label + ')';
    var mid = at(e.a0 + sw / 2, R);
    out.text = { x: mid[0], y: mid[1] + (UI.DIM_CAP || 9.4) / 2, anchor: 'middle' };
    out.laid = true;
    return out;
  };
  // the ends of a distance to whole circles / arcs moved to their near (Min) or far (Max) side along the dimension
  // (rel.ac, SolidWorks' arc conditions); g = { type: 'distance', P, Q, dir } from ui-relations.js relDimGeometry
  UI.relDimArcCond = function (f, rel, g) {
    if (!g || g.type !== 'distance' || rel.type !== 'distance' || rel.dir === 'r' || !Array.isArray(rel.ac)) return g;
    var k0 = S.refKind(f, rel.refs[0]), k1 = S.refKind(f, rel.refs[1]), li = k1 === 'line' ? 1 : k0 === 'line' ? 0 : -1;
    function shift(i, pt, toward) {
      var c = rel.ac[i];
      if ((c !== 'min' && c !== 'max') || S.refKind(f, rel.refs[i]) !== 'circle') return pt;
      var r = S.refCurve(f, rel.refs[i]).r, k = (c === 'min' ? 1 : -1) * toward;
      return [pt[0] + g.dir[0] * r * k, pt[1] + g.dir[1] * r * k];
    }
    if (li < 0) { g.P = shift(0, g.P, 1); g.Q = shift(1, g.Q, -1); }
    else g.P = shift(1 - li, g.P, 1);
    return g;
  };
  // a placed dimension that has an arc condition needs whole circles: say which refs can take one
  function arcCondRefs(f, d) { return d && d.type === 'distance' && d.dir !== 'r' ? d.refs.map(function (r) { return S.refKind(f, r) === 'circle'; }) : [false, false]; }

  // place a two-entity dimension: then its Dimension PropertyManager opens (ui-relations.js placeRelDim, wrapped)
  var basePlaceRelDim = UI.placeRelDim;
  if (basePlaceRelDim) UI.placeRelDim = function (f, rd, uv) {
    var n0 = (f.rels || []).length, r = basePlaceRelDim.apply(this, arguments);
    var g = UI.activeSketchFeature();
    if (g === f && (f.rels || []).length > n0 && App.sel && App.sel.kind === 'rel' && $('modal') && $('modal').hidden) openDimensionPM(App.sel);
    return r;
  };

  // ------------------------------------------------------------------ the Dimension PropertyManager
  var TOL_TYPES = [['none', 'None'], ['basic', 'Basic'], ['bilateral', 'Bilateral'], ['limit', 'Limit'], ['symmetric', 'Symmetric'], ['min', 'MIN'], ['max', 'MAX']];
  var PREC = [['auto', 'Document (' + 'default)'], ['0', '0'], ['1', '.1'], ['2', '.12'], ['3', '.123'], ['4', '.1234'], ['5', '.12345'], ['6', '.123456']];
  var ARC_COND = [['c', 'Center'], ['min', 'Min'], ['max', 'Max']];
  var dimPM = null;   // { d, spec } while the Dimension PM is open
  function openDimensionPM(sel) {
    var info = dimInfo(sel);
    if (!info || App.mode !== 'sketch') return false;
    var f = info.f, d = info.d;
    var v = {};
    function load() {
      var it = dimInfo({ d: d });
      if (!it) return null;
      info = it;
      v.name = fullName(f, d);
      v.value = +(+it.shown).toPrecision(12);
      v.driven = !!d.driven;
      v.tolType = d.tol && d.tol.type ? d.tol.type : 'none';
      v.plus = d.tol && d.tol.plus != null ? d.tol.plus : 0;
      v.minus = d.tol && d.tol.minus != null ? d.tol.minus : 0;
      v.prec = d.prec != null ? String(d.prec) : 'auto';
      v.prefix = d.prefix || '';
      v.suffix = d.suffix || '';
      v.show = it.kindText === 'dia' || it.kindText === 'r' ? (d.show || (it.kindText === 'dia' ? 'dia' : 'r')) : '';
      var ac = Array.isArray(d.ac) ? d.ac : [];
      v.ac0 = ac[0] || 'c'; v.ac1 = ac[1] || 'c';
      return it;
    }
    load();
    var radial = info.kind === 'dim' && (info.kindText === 'dia' || info.kindText === 'r'), cond = arcCondRefs(f, d), unit = info.unit;
    var spec = {
      title: 'Dimension', icon: 'dim', values: v, noFocus: true, keepSelection: true,
      groups: [
        { title: 'Tolerance/Precision', fields: [
          { type: 'select', key: 'tolType', label: 'Tolerance type', options: TOL_TYPES, rerender: true },
          { type: 'number', key: 'plus', label: 'Maximum variation (+)', unit: unit, show: function (x) { return /^(bilateral|limit|symmetric)$/.test(x.tolType); } },
          { type: 'number', key: 'minus', label: 'Minimum variation (−)', unit: unit, show: function (x) { return /^(bilateral|limit)$/.test(x.tolType); } },
          { type: 'select', key: 'prec', label: 'Primary unit precision', options: PREC }
        ] },
        { title: 'Primary Value', fields: [
          { type: 'text', key: 'name', label: 'Name' },
          { type: 'number', key: 'value', label: info.kind === 'rel' && d.type === 'angle' ? 'Angle' : 'Value', unit: unit },
          { type: 'check', key: 'driven', label: 'Driven (reference dimension)' },
          { type: 'buttons', buttons: [{ label: 'Reverse direction', onclick: function () { var r = reverseSense({ d: d }); if (!r.ok) UI.toast(r.error); rerender(); } }] }
        ] },
        { title: 'Dimension Text', fields: [
          { type: 'text', key: 'prefix', label: 'Text before the value' },
          { type: 'text', key: 'suffix', label: 'Text after the value' },
          { type: 'buttons', buttons: [
            { label: '2X', onclick: function () { setText('prefix', '2X '); } },
            { label: 'TYP', onclick: function () { setText('suffix', ' TYP'); } },
            { label: 'REF', onclick: function () { setText('suffix', ' REF'); } },
            { label: 'Clear', onclick: function () { setText('prefix', ''); setText('suffix', ''); } }
          ] }
        ] }
      ],
      onChange: function (x, key) { if (key) apply(key); },
      onOK: function () { dimPM = null; App.dimsStale = true; },
      onCancel: function () { dimPM = null; App.dimsStale = true; },
      onClose: function () { if (dimPM && dimPM.spec === spec) dimPM = null; }
    };
    if (radial || cond[0] || cond[1]) {
      var lf = [];
      if (radial) lf.push({ type: 'radio', key: 'show', label: 'Display', options: [['r', 'Radius'], ['dia', 'Diameter']] });
      if (cond[0]) lf.push({ type: 'select', key: 'ac0', label: 'First arc condition', options: ARC_COND });
      if (cond[1]) lf.push({ type: 'select', key: 'ac1', label: 'Second arc condition', options: ARC_COND });
      spec.groups.push({ title: 'Leaders', fields: lf });
    }
    function message() {
      var it = dimInfo({ d: d }), an = analysis(f), st = it ? (it.kind === 'rel' ? an.rels[it.index] : an.dims && an.dims[it.index]) : null;
      spec.message = d.driven ? 'Driven (reference) dimension: it shows what the geometry measures.' : st && st !== 'ok' ? 'This dimension is ' + stateText(st).toLowerCase() + '.' : 'Driving dimension ' + v.name + '.';
      spec.messageOk = !d.driven && (!st || st === 'ok');
    }
    function rerender() { if (!load()) { UI.closePM(); return; } message(); if (UI.pmSpec && UI.pmSpec() === spec) UI.renderPM(); }
    function setText(key, text) { markDirty(); if (text) d[key] = text; else delete d[key]; App.dimsStale = true; rerender(); }
    function apply(key) {
      var it = dimInfo({ d: d });
      if (!it) { UI.closePM(); return; }
      if (key === 'value') {
        if (d.driven) { UI.setStatus('A driven dimension follows the geometry: clear Driven to change its value.'); return; }
        setValue(it, v.value);
        message();
        return;
      }
      if (key === 'driven') {
        var r = UI.setDimDriven ? UI.setDimDriven(it.kind, it.index, !!v.driven) : S.setDriven(f, it.kind, it.index, !!v.driven);
        if (r && r.ok === false) UI.toast(r.error);
        rerender();
        return;
      }
      markDirty();
      if (key === 'name') {
        // the name typed (D1@Sketch1 or just D1); the default name (D<n> by order) is not stored
        var nm = String(v.name || '').replace(/@.*$/, '').trim(), was = d.name;
        delete d.name;
        if (nm && nm !== dimName(f, d)) d.name = nm;
        else if (!nm && was) UI.setStatus('A dimension needs a name: it keeps ' + dimName(f, d) + '.');
      } else if (key === 'tolType' || key === 'plus' || key === 'minus') {
        if (v.tolType === 'none') delete d.tol;
        else d.tol = { type: v.tolType, plus: Math.abs(+v.plus || 0), minus: v.tolType === 'symmetric' ? Math.abs(+v.plus || 0) : Math.abs(+v.minus || 0) };
      } else if (key === 'prec') {
        if (v.prec === 'auto') delete d.prec; else d.prec = +v.prec;
      } else if (key === 'prefix' || key === 'suffix') {
        if (v[key]) d[key] = v[key]; else delete d[key];
      } else if (key === 'show') {
        var natural = it.kind === 'dim' && d.k === 'dia' ? 'dia' : 'r';
        if (v.show === natural) delete d.show; else d.show = v.show;
        App.dimsStale = true;
        rerender();
        return;
      } else if (key === 'ac0' || key === 'ac1') {
        var ac = [v.ac0, v.ac1];
        if (ac[0] === 'c' && ac[1] === 'c') delete d.ac; else d.ac = ac;
        // the geometry stays; the dimension now reads (and holds) what it measures with the new conditions
        var m = S.measure(f, d.type, d.refs, d.dir, d.sup, d.ac);
        if (m != null) d.v = m;
        refresh();
        rerender();
        return;
      }
      App.dimsStale = true;
      if (UI.requestRender) UI.requestRender();
    }
    message();
    dimPM = { d: d, spec: spec };
    var open = function () { UI.openPM(spec); };
    if (App.tool && App.tool !== 'select' && UI.withToolPM) UI.withToolPM(open); else open();
    return true;
  }
  UI.openDimensionPM = openDimensionPM;
  UI.dimensionPMOpen = function () { return !!(dimPM && UI.pmSpec && UI.pmSpec() === dimPM.spec); };
  // a dimension deleted while its PropertyManager is open closes it
  function closeDimPMIfGone() {
    if (!dimPM || !UI.pmSpec || UI.pmSpec() !== dimPM.spec) return;
    if (!dimInfo({ d: dimPM.d })) { dimPM = null; UI.closePM(); }
  }
  ['deleteDim', 'deleteRelation'].forEach(function (k) {
    var base = UI[k];
    if (base) UI[k] = function () { var r = base.apply(this, arguments); closeDimPMIfGone(); return r; };
  });

  // ------------------------------------------------------------------ relation groups (shared by the sketch PMs)
  // UI.sketchRelationGroups(sketch, refs, opts) -> [Existing Relations group, Add Relations group] for a PM spec.
  //   sketch: the sketch feature (the active one); refs: what the PM is about, as sketch refs ('3', '3.p1', '3.c', 'O',
  //   '3.e0') or entity indices (a number is the whole entity: its curve, or the point entity itself).
  //   opts: { onChange(result): called after a relation was added or deleted (default: the open PM is re-rendered),
  //   title: false to leave out Add Relations' "Select entities" note }.
  // Existing Relations lists every relation on those entities with its state icon (Satisfied / Over Defining / Not
  // Solved / Dangling / Suppressed); a row is selected by a click (then Delete removes it, as in SolidWorks), hovered it
  // lights its entities, its × deletes it. Add Relations offers only the relations that apply to the refs together
  // (two points: Merge for Coincident, as SolidWorks names it). One undo step per click.
  function normRefs(f, refs) {
    return (refs || []).map(function (r) {
      if (typeof r === 'number') { var c = S.curveRefs(f, r); return c.length === 1 ? c[0] : String(r); }
      return String(r);
    }).filter(function (r) { return !!S.refKind(f, r); });
  }
  function relsOn(f, refs) {
    var ents = refs.map(refEntity), origin = refs.indexOf('O') >= 0;
    return (f.rels || []).map(function (rel, i) { return { rel: rel, i: i }; }).filter(function (x) {
      return x.rel.refs.some(function (r) { var e = refEntity(r); return (e >= 0 && ents.indexOf(e) >= 0) || (origin && r === 'O'); });
    });
  }
  var STATE_ICON = {
    ok: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.4 L4.8 9 L10 3" fill="none" stroke="#1f9a4b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    redundant: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#d9302c"/><path d="M6 3 V6.6 M6 8.4 V8.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
    conflict: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#d9302c"/><path d="M4 4 L8 8 M8 4 L4 8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>',
    invalid: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 L11 10.5 H1 Z" fill="#a88300"/><path d="M6 4.5 V7.3 M6 8.8 V9" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>',
    suppressed: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="#80868e" stroke-width="1.4"/><path d="M3 9 L9 3" stroke="#80868e" stroke-width="1.4"/></svg>',
    driven: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="#80868e" stroke-width="1.4"/></svg>'
  };
  function relRowHtml(f, x, state, opts) {
    var sel = App.sel && App.sel.kind === 'rel' && App.sel.index === x.i;
    return '<div class="rel-row ' + state + (sel ? ' sel' : '') + '" role="option" tabindex="0" data-relrow="' + x.i + '" data-rel="' + x.i + '" title="' + esc(stateText(state)) + '">' +
      '<i class="rel-state">' + (STATE_ICON[state] || STATE_ICON.ok) + '</i>' + Icons(iconName(x.rel.type), 14) + '<span>' + esc(S.describe(f, x.rel)) + '</span>' +
      (opts && opts.noDelete ? '' : '<button type="button" class="rel-del" data-reldel="' + x.i + '" title="Delete this relation" aria-label="Delete relation">×</button>') + '</div>';
  }
  function existingHtml(f, refs, owner) {
    var list = relsOn(f, refs), an = analysis(f);
    return '<div class="rel-list rel-existing" role="listbox" aria-label="Existing Relations" data-owner="' + owner + '">' + (list.length ? list.map(function (x) { return relRowHtml(f, x, an.rels[x.i] || 'ok'); }).join('') : '<div class="rel-empty">' + (refs.length ? 'None' : 'Select entities') + '</div>') + '</div>';
  }
  function addRelationNow(f, type, refs, opts) {
    markDirty();
    var r = S.addRelation(f, type, refs);
    if (!r.ok) { UI.toast(r.error); return r; }
    refresh();
    var name = type === 'merge' ? 'Merge' : S.TYPES[type].name;
    if (r.status === 'conflict') UI.setStatus(name + ' added, but the sketch cannot satisfy it' + (r.conflicts && r.conflicts.length ? ' (it conflicts with ' + r.conflicts.join('; ') + ')' : '') + ': Over Defined. Delete it in Display/Delete Relations.');
    else if (r.status === 'redundant') UI.setStatus(name + ' added; it repeats what other relations already say: Over Defined.');
    else UI.setStatus(name + ' added. ' + S.STATUS_TEXT[r.analysis.status] + (r.analysis.dof ? ' (' + r.analysis.dof + ' degrees of freedom left).' : '.'));
    if (opts && opts.onChange) opts.onChange(r); else if (UI.renderPM) UI.renderPM();
    return r;
  }
  // the label of a relation button: two points merge (SolidWorks' Merge), anything else by its name
  function addLabel(f, type, refs) {
    if (type === 'coincident' && refs.length === 2 && refs.every(function (r) { return r !== 'O' && S.refKind(f, r) === 'point'; })) return 'Merge';
    return S.TYPES[type].name;
  }
  function sketchRelationGroups(f, refs, opts) {
    opts = opts || {};
    f = f || UI.activeSketchFeature();
    if (!f) return [];
    var R = normRefs(f, refs), types = R.length ? S.applicable(f, R) : [];
    var buttons = types.map(function (t) { return { label: addLabel(f, t, R), onclick: function () { addRelationNow(f, t, R, opts); } }; });
    var owner = 'rg' + (++ownerSeq);
    owners[owner] = opts;
    delete owners['rg' + (ownerSeq - 64)];
    return [
      { title: 'Existing Relations', fields: [{ type: 'html', html: function () { return existingHtml(f, R, owner); } }] },
      { title: 'Add Relations', fields: buttons.length ? [{ type: 'buttons', buttons: buttons }] : [{ type: 'static', label: '', value: R.length ? 'No relation applies to this selection.' : 'Select entities first.' }] }
    ];
  }
  UI.sketchRelationGroups = sketchRelationGroups;
  var owners = {}, ownerSeq = 0;
  // rows of Existing Relations (any PM): one delegated listener on the PM panel; each list names the call that made it
  var pmRoot = $('pm');
  function ownerOpts(node) { var l = node && node.closest && node.closest('[data-owner]'); return (l && owners[l.getAttribute('data-owner')]) || {}; }
  if (pmRoot) {
    pmRoot.addEventListener('click', function (ev) {
      var del = ev.target.closest && ev.target.closest('[data-reldel]');
      var f = UI.activeSketchFeature();
      if (del && f) {
        ev.preventDefault(); ev.stopPropagation();
        var i = +del.getAttribute('data-reldel');
        if (UI.deleteRelation) UI.deleteRelation(i);
        App.relHover = null;
        var o = ownerOpts(del);
        if (o.onChange) o.onChange({ deleted: i }); else if (UI.renderPM) UI.renderPM();
        return;
      }
      var row = ev.target.closest && ev.target.closest('.rel-existing [data-relrow]');
      if (row && f) {
        App.sel = { kind: 'rel', index: +row.getAttribute('data-relrow') };
        Array.prototype.forEach.call(row.parentNode.children, function (r) { r.classList.toggle('sel', r === row); });
        App.dimsStale = false; if (UI.drawDims) UI.drawDims();
        UI.setStatus(row.querySelector('span').textContent + ' — ' + row.getAttribute('title') + '. Delete removes it.');
      }
    });
    pmRoot.addEventListener('mouseover', function (ev) {
      var row = ev.target.closest && ev.target.closest('.rel-existing [data-relrow]');
      if (row) hoverRel(+row.getAttribute('data-relrow'));
    });
    pmRoot.addEventListener('mouseout', function (ev) {
      var row = ev.target.closest && ev.target.closest('.rel-existing [data-relrow]');
      if (row && !(ev.relatedTarget && row.contains(ev.relatedTarget))) hoverRel(null);
    });
    pmRoot.addEventListener('keydown', function (ev) {
      var row = ev.target.closest && ev.target.closest('.rel-existing [data-relrow]');
      if (!row || (ev.key !== 'Delete' && ev.key !== 'Backspace')) return;
      ev.preventDefault(); ev.stopPropagation();
      if (UI.deleteRelation) UI.deleteRelation(+row.getAttribute('data-relrow'));
      App.relHover = null;
      var o = ownerOpts(row);
      if (o.onChange) o.onChange({}); else if (UI.renderPM) UI.renderPM();
    });
  }

  // ------------------------------------------------------------------ Add Relations PropertyManager
  function selectedEntities() {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out;
  }
  function cmdAddRelations() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    App.relPick = [];
    // every pre-selected entity goes into Selected Entities
    selectedEntities().forEach(function (i) {
      if (!f.entities[i]) return;
      var c = S.curveRefs(f, i), r = c.length === 1 ? c[0] : String(i);
      if (S.refKind(f, r) && App.relPick.indexOf(r) < 0) App.relPick.push(r);
    });
    UI.setTool('select');
    var modelRefs = [], v = { construction: false };
    var spec = {
      title: 'Add Relations', icon: 'addRelation', values: v,
      message: 'Select sketch entities or points in the graphics area (click again to deselect), then click a relation to add.',
      command: { onSketchPoint: function (uv, mx, my) {
        var r = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null;
        // a model edge or vertex (sketch on a face) comes in as fixed reference geometry
        if (!r && UI.pickModelRef) { var m = UI.pickModelRef(mx, my); if (m) { r = m.ref; modelRefs.push(m.entity); } }
        if (!r) { UI.setStatus('Nothing there to select.'); return; }
        var i = App.relPick.indexOf(r);
        if (i >= 0) App.relPick.splice(i, 1); else App.relPick.push(r);
        render();
      } },
      groups: [],
      onChange: function (x, key) {
        if (key !== 'construction') return;
        var list = (App.relPick || []).map(function (r) { var p = S.parseRef(r); return p && !p.o && p.s === null ? p.e : -1; }).filter(function (i, k, a) { return i >= 0 && a.indexOf(i) === k; });
        if (!list.length) { UI.setStatus('For construction applies to whole entities: select lines, circles or arcs.'); return; }
        markDirty();
        list.forEach(function (i) { if (v.construction) f.entities[i].construction = true; else delete f.entities[i].construction; });
        refresh();
        UI.setStatus((list.length === 1 ? 'Entity' : list.length + ' entities') + (v.construction ? ' changed to construction geometry.' : ' changed back to sketch geometry.'));
      },
      onOK: function () { App.relPick = null; App.dimsStale = true; if (UI.dropUnusedModelRefs) UI.dropUnusedModelRefs(modelRefs); },
      onCancel: function () { App.relPick = null; App.dimsStale = true; if (UI.dropUnusedModelRefs) UI.dropUnusedModelRefs(modelRefs); }
    };
    function render() {
      var picks = App.relPick || [];
      var whole = picks.map(function (r) { var p = S.parseRef(r); return p && !p.o && p.s === null ? f.entities[p.e] : null; }).filter(function (e) { return e; });
      v.construction = whole.length > 0 && whole.every(function (e) { return e.construction; });
      spec.groups = [
        { title: 'Selected Entities', fields: [
          { type: 'html', html: '<div class="rel-list" id="rel-picks">' + (picks.length ? picks.map(function (r) { return '<div class="rel-row">' + esc(S.refName(f, r)) + '</div>'; }).join('') : '<div class="rel-empty">Nothing selected</div>') + '</div>' },
          { type: 'buttons', buttons: [{ label: 'Clear Selections', onclick: function () { App.relPick = []; render(); } }] }
        ] }
      ].concat(sketchRelationGroups(f, picks, { onChange: function () { App.relPick = []; render(); } }));
      if (whole.length) spec.groups.push({ title: 'Options', fields: [{ type: 'check', key: 'construction', label: 'For construction' }] });
      UI.openPM(spec);
      App.dimsStale = true;
    }
    render();
    return spec;
  }
  UI.cmdAddRelations = cmdAddRelations;

  // ------------------------------------------------------------------ Display/Delete Relations PropertyManager
  // Filters as SolidWorks': All in this sketch, Dangling, Overdefining/Not Solved, External (to model edges brought in
  // as fixed reference geometry), Defined in context, Locked, Broken (assembly-context relations: none in a part
  // sketch), Selected Entities. The selected relation's Suppressed box and its Entities (with their state and where
  // each is defined) follow the list.
  var FILTERS = [['all', 'All in this sketch'], ['dangling', 'Dangling'], ['over', 'Overdefining/Not Solved'], ['external', 'External'], ['context', 'Defined in context'], ['locked', 'Locked'], ['broken', 'Broken'], ['selected', 'Selected Entities']];
  function isExternal(f, i) {
    var e = f.entities[i];
    if (!e || !e.construction) return false;
    if (e.ext) return true;
    return (f.rels || []).some(function (r) { return r.type === 'fix' && r.refs.length === 1 && r.refs[0] === String(i); }) && !!(App.edges && App.edges.length);
  }
  // model edges brought into the sketch are tagged, so External finds them
  var basePickModelRef = UI.pickModelRef;
  if (basePickModelRef) UI.pickModelRef = function () { var m = basePickModelRef.apply(this, arguments); if (m && m.entity) m.entity.ext = true; return m; };
  function cmdDisplayRelations(filter) {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first: relations belong to a sketch.'); return; }
    var known = FILTERS.map(function (x) { return x[0]; });
    var v = { filter: known.indexOf(filter) >= 0 ? filter : 'all', suppressed: false };
    function done() { hoverRel(null); App.relHover = null; App.dimsStale = true; }
    var spec = {
      title: 'Display/Delete Relations', icon: 'relations', values: v,
      groups: [],
      command: { onSketchPoint: function (uv, mx, my) {
        var hit = UI.pickEntity(mx, my);
        App.sel = hit ? { kind: 'entity', index: hit.index } : null;
        v.filter = hit ? 'selected' : 'all';
        UI.updateSketches();
        render();
      } },
      onChange: function (x, key) {
        if (rendering) return;
        if (key === 'suppressed') { setSuppressed(!!v.suppressed); return; }
        render();
      },
      onOK: done, onCancel: done
    };
    function selRel() { return App.sel && App.sel.kind === 'rel' && f.rels && f.rels[App.sel.index] ? App.sel.index : null; }
    function setSuppressed(on) {
      var i = selRel();
      if (i == null) { UI.toast('Select a relation in the list first.'); v.suppressed = false; render(); return; }
      markDirty();
      var rel = f.rels[i];
      if (on) rel.suppressed = true; else delete rel.suppressed;
      // unsuppressed, it holds again: the sketch is solved with it (refused geometry stays where it is)
      if (!on) S.solve(f);
      refresh();
      UI.setStatus(S.describe(f, rel) + (on ? ' suppressed: it holds nothing until it is unsuppressed.' : ' unsuppressed.'));
      render();
    }
    function rows() {
      var an = analysis(f), selEnt = App.sel && App.sel.kind === 'entity' ? App.sel.index : null;
      var out = (f.rels || []).map(function (rel, i) { return { rel: rel, i: i, state: an.rels[i] || 'ok' }; });
      // over-defining / unsolved Smart Dimensions are listed too (they can be deleted here)
      (f.dims || []).forEach(function (d, i) { var st = an.dims && an.dims[i]; if (st && st !== 'ok' && !d.driven) out.push({ dim: d, i: i, state: st }); });
      out = out.filter(function (x) {
        switch (v.filter) {
          case 'over': return x.state === 'redundant' || x.state === 'conflict';
          case 'dangling': return x.state === 'invalid';
          case 'external': return !x.dim && x.rel.refs.some(function (r) { var e = refEntity(r); return e >= 0 && isExternal(f, e); });
          case 'context': case 'locked': case 'broken': return false;
          case 'selected': return selEnt != null && (x.dim ? x.dim.e === selEnt : x.rel.refs.some(function (r) { return refEntity(r) === selEnt; }));
        }
        return true;
      });
      function bad(x) { return x.state === 'redundant' || x.state === 'conflict' || x.state === 'invalid'; }
      return out.filter(bad).concat(out.filter(function (x) { return !bad(x); }));
    }
    function rowKey(x) { return (x.dim ? 'd' : 'r') + x.i; }
    function selKey() { return App.sel && App.sel.kind === 'rel' ? 'r' + App.sel.index : App.sel && App.sel.kind === 'dim' ? 'd' + App.sel.index : ''; }
    function dimText(x) { var e = f.entities[x.dim.e], val = e ? K.dimValue(e, x.dim) : null; return 'Dimension ' + fullName(f, x.dim) + ' ' + (val != null ? UI.fmtNum(val, 3) : '') + ' on ' + S.refName(f, String(x.dim.e)); }
    function selectRow(row) {
      var key = row.getAttribute('data-key');
      App.sel = { kind: key.charAt(0) === 'd' ? 'dim' : 'rel', index: +key.slice(1) };
      App.dimsStale = false; if (UI.drawDims) UI.drawDims();
      UI.setStatus(row.querySelector('span').textContent + ' — ' + row.querySelector('em').textContent + '. Delete removes it.');
      render();
      var again = $('rel-display') && $('rel-display').querySelector('[data-key="' + key + '"]');
      if (again) again.focus();
    }
    function deleteSelected() {
      if (App.sel && App.sel.kind === 'rel') { App.relHover = null; UI.deleteRelation(App.sel.index); }
      else if (App.sel && App.sel.kind === 'dim' && UI.deleteDim) { UI.deleteDim(App.sel.index); refresh(); }
      else { UI.toast('Select a relation in the list first.'); return; }
      render();
    }
    function entityRows() {
      var i = selRel();
      if (i == null) return '<div class="rel-empty">Select a relation to see its entities</div>';
      var an = analysis(f), ST = { under: 'Under Defined', full: 'Fully Defined', over: 'Over Defined', conflict: 'Not Solved' };
      return f.rels[i].refs.map(function (r) {
        var e = refEntity(r), st = r === 'O' ? 'Fully Defined' : ST[an.entities[e]] || '';
        return '<div class="rel-row"><span>' + esc(S.refName(f, r)) + '</span><em>' + esc(st) + '</em><em>' + (r === 'O' ? 'Origin' : e >= 0 && isExternal(f, e) ? 'Model edge' : 'Current Sketch') + '</em></div>';
      }).join('');
    }
    var rendering = false;
    function render() {
      rendering = true;
      try { renderNow(); } finally { rendering = false; }
    }
    function renderNow() {
      var list = rows(), an = analysis(f), sk = selKey(), si = selRel();
      v.suppressed = si != null && !!f.rels[si].suppressed;
      spec.message = S.STATUS_TEXT[an.status] + ': ' + (f.rels ? f.rels.length : 0) + ' relation' + ((f.rels || []).length === 1 ? '' : 's') + ', ' + an.dof + ' degree' + (an.dof === 1 ? '' : 's') + ' of freedom' + (an.conflicts ? ', ' + an.conflicts + ' not solved' : '') + (an.redundant ? ', ' + an.redundant + ' over defining' : '') + '.';
      spec.messageOk = an.status === 'full';
      var empty = v.filter === 'selected' && !(App.sel && App.sel.kind === 'entity') ? 'Click an entity in the graphics area' : /^(context|locked|broken)$/.test(v.filter) ? 'None: a part sketch has no in-context relations' : 'No relations';
      spec.groups = [
        { title: 'Relations', fields: [
          { type: 'select', label: 'Filter', key: 'filter', options: FILTERS },
          { type: 'html', html: '<div class="rel-list" id="rel-display" role="listbox" aria-label="Relations">' + (list.length ? list.map(function (x) {
            var key = rowKey(x), icon = x.dim ? Icons('dim', 14) : Icons(iconName(x.rel.type), 14);
            return '<div class="rel-row ' + x.state + (key === sk ? ' sel' : '') + '" role="option" data-key="' + key + '"' + (x.dim ? '' : ' data-rel="' + x.i + '"') + ' tabindex="0"><i class="rel-state">' + (STATE_ICON[x.state] || '') + '</i>' + icon + '<span>' + esc(x.dim ? dimText(x) : S.describe(f, x.rel)) + '</span><em>' + stateText(x.state) + '</em></div>';
          }).join('') : '<div class="rel-empty">' + empty + '</div>') + '</div>' },
          { type: 'check', key: 'suppressed', label: 'Suppressed', disabled: si == null },
          { type: 'buttons', buttons: [
            { label: 'Delete', onclick: deleteSelected },
            { label: 'Delete All', onclick: function () {
              var gone = rows().filter(function (x) { return !x.dim; }).map(function (x) { return x.i; });
              if (!gone.length) return;
              markDirty();
              var n = gone.length;
              if (v.filter === 'all') delete f.rels;
              else { gone.sort(function (a, b) { return b - a; }).forEach(function (i) { S.deleteRelation(f, i); }); }
              App.sel = null; App.relHover = null; refresh(); UI.setStatus('Deleted ' + (n === 1 ? 'the relation' : 'all ' + n + ' relations') + (v.filter === 'all' ? '.' : ' listed.')); render();
            } }
          ] }
        ] },
        { title: 'Entities', collapsed: false, fields: [{ type: 'html', html: '<div class="rel-list" id="rel-entities">' + entityRows() + '</div>' }] }
      ];
      UI.openPM(spec);
      var box = $('rel-display');
      if (box) Array.prototype.forEach.call(box.querySelectorAll('.rel-row'), function (row) {
        var key = row.getAttribute('data-key'), ri = key.charAt(0) === 'r' ? +key.slice(1) : null;
        row.addEventListener('click', function () { selectRow(row); });
        row.addEventListener('mouseenter', function () { if (ri != null) hoverRel(ri); });
        row.addEventListener('mouseleave', function () { if (ri != null && App.relHover === ri) hoverRel(null); });
        row.addEventListener('keydown', function (ev) {
          if (ev.key === 'Delete' || ev.key === 'Backspace') {
            ev.preventDefault(); ev.stopPropagation();
            App.sel = { kind: key.charAt(0) === 'd' ? 'dim' : 'rel', index: +key.slice(1) };
            deleteSelected();
            var first = $('rel-display') && $('rel-display').querySelector('.rel-row');
            if (first) first.focus();
          }
          else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            ev.preventDefault(); ev.stopPropagation();
            var nx = ev.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling;
            if (nx && nx.getAttribute('data-key')) selectRow(nx);
          }
          else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); selectRow(row); }
        });
        row.addEventListener('focus', function () { if (ri != null) hoverRel(ri); });
        row.addEventListener('blur', function () { if (ri != null && App.relHover === ri) hoverRel(null); });
      });
    }
    render();
    return spec;
  }
  UI.cmdDisplayRelations = cmdDisplayRelations;

  // ------------------------------------------------------------------ Fully Define Sketch
  // Tools ▸ Dimensions ▸ Fully Define Sketch (and the Sketch tab). Relations to apply (Horizontal, Vertical), the
  // dimension scheme (Baseline / Chain) and datum of each direction (the origin unless a point is picked: click the
  // datum box, then a point), where the dimensions go (below / above, left / right), all entities or the selected
  // ones. Calculate applies it (one undo step) and reports; Cancel puts the sketch back as it was.
  function cmdFullyDefineSketch() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    UI.setTool('select');
    var sel0 = selectedEntities();
    var v = { scope: sel0.length ? 'selected' : 'all', relations: true, horizontal: true, vertical: true, dims: true, hScheme: 'baseline', vScheme: 'baseline', hPlace: 'below', vPlace: 'left' };
    var datum = { h: 'O', v: 'O' }, active = null, snap = null, applied = null;
    function snapshot() { return { entities: clone(f.entities), rels: f.rels ? clone(f.rels) : null, dims: f.dims ? clone(f.dims) : null }; }
    function restore(s) { f.entities = clone(s.entities); if (s.rels) f.rels = clone(s.rels); else delete f.rels; if (s.dims) f.dims = clone(s.dims); else delete f.dims; }
    function datumName(r) { return r === 'O' ? 'Origin' : S.refName(f, r); }
    var spec = {
      title: 'Fully Define Sketch', icon: 'fullyDefine', values: v,
      command: { onSketchPoint: function (uv, mx, my) {
        if (!active) { UI.setStatus('Click the Horizontal or Vertical datum box first, then a point (or the origin).'); return; }
        var r = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null;
        if (!r || (r !== 'O' && S.refKind(f, r) !== 'point')) { UI.setStatus('Pick a point (an end point, a centre) or the origin as the datum.'); return; }
        datum[active] = r; active = null;
        render();
      } },
      groups: [],
      onChange: function (x, key) { if (!key) return; if (key === 'relations') { v.horizontal = v.vertical = !!v.relations; } render(); },
      onOK: function () { if (!applied) calculate(); },
      onCancel: function () { if (snap && applied) { restore(snap); refresh(); UI.setStatus('Fully Define Sketch cancelled: the sketch is as it was.'); } }
    };
    function opts() {
      return {
        relations: v.relations && (v.horizontal || v.vertical) ? { horizontal: !!v.horizontal, vertical: !!v.vertical } : false,
        dims: !!v.dims, hScheme: v.hScheme, vScheme: v.vScheme, hDatum: datum.h, vDatum: datum.v, hPlace: v.hPlace, vPlace: v.vPlace,
        entities: v.scope === 'selected' && sel0.length ? sel0 : null,
        minGap: 34 * (UI.cam.scale || 0)   // stacked dimension lines at least 34 px apart at the current zoom: their labels clear of each other
      };
    }
    function calculate() {
      if (snap && applied) restore(snap);
      markDirty();
      snap = snap || snapshot();
      var r = S.fullyDefine(f, opts());
      applied = r;
      refresh();
      var msg = r.ok === false && r.error ? r.error : 'Added ' + r.rels.filter(function (i) { return !(S.TYPES[f.rels[i].type] || {}).dim; }).length + ' relation(s) and ' + (r.dims.length + r.rels.filter(function (i) { return (S.TYPES[f.rels[i].type] || {}).dim; }).length) + ' dimension(s). ' + S.STATUS_TEXT[r.status] + (r.dof ? ' (' + r.dof + ' degrees of freedom left).' : '.');
      UI.setStatus(msg);
      spec.message = msg;
      spec.messageOk = r.status === 'full';
      if (UI.pmSpec && UI.pmSpec() === spec) render();
      return r;
    }
    function render() {
      var an = analysis(f);
      if (!applied) { spec.message = S.STATUS_TEXT[an.status] + ' (' + an.dof + ' degree' + (an.dof === 1 ? '' : 's') + ' of freedom). Set the options, then Calculate.'; spec.messageOk = an.status === 'full'; }
      spec.groups = [
        { title: 'Entities to Fully Define', fields: [
          { type: 'radio', key: 'scope', options: [['all', 'All entities in sketch'], ['selected', 'Selected entities']], disabledOption: function (o) { return o === 'selected' && !sel0.length ? 'Select entities before opening Fully Define Sketch.' : null; } },
          { type: 'buttons', buttons: [{ label: 'Calculate', onclick: function () { calculate(); } }] }
        ] },
        { title: 'Relations', fields: [
          { type: 'check', key: 'relations', label: 'Select all' },
          { type: 'check', key: 'horizontal', label: 'Horizontal' },
          { type: 'check', key: 'vertical', label: 'Vertical' }
        ] },
        { title: 'Dimensions', fields: [
          { type: 'check', key: 'dims', label: 'Apply dimensions' },
          { type: 'select', key: 'hScheme', label: 'Horizontal dimensions scheme', options: [['baseline', 'Baseline'], ['chain', 'Chain']] },
          { type: 'pick', label: 'Horizontal datum', icon: 'origin', value: function () { return datumName(datum.h); }, active: function () { return active === 'h'; }, onActivate: function () { active = active === 'h' ? null : 'h'; render(); } },
          { type: 'select', key: 'vScheme', label: 'Vertical dimensions scheme', options: [['baseline', 'Baseline'], ['chain', 'Chain']] },
          { type: 'pick', label: 'Vertical datum', icon: 'origin', value: function () { return datumName(datum.v); }, active: function () { return active === 'v'; }, onActivate: function () { active = active === 'v' ? null : 'v'; render(); } },
          { type: 'select', key: 'hPlace', label: 'Horizontal dimensions', options: [['below', 'Below sketch'], ['above', 'Above sketch']] },
          { type: 'select', key: 'vPlace', label: 'Vertical dimensions', options: [['left', 'Left of sketch'], ['right', 'Right of sketch']] }
        ] }
      ];
      UI.openPM(spec);
    }
    render();
    return spec;
  }
  UI.cmdFullyDefineSketch = cmdFullyDefineSketch;
  if (window.anvil) {
    // anvil.fullyDefine(opts?): Fully Define Sketch on the active sketch -> { status, dof, rels, dims }
    window.anvil.fullyDefine = function (o) {
      var f = UI.activeSketchFeature();
      if (!f) throw new Error('No active sketch.');
      markDirty();
      var r = S.fullyDefine(f, o || {});
      refresh();
      return { status: r.status, dof: r.dof, rels: r.rels, dims: r.dims };
    };
    // anvil.dimProps('dim' | 'rel', i, props?): read / set the Dimension PropertyManager's properties of a dimension
    window.anvil.dimProps = function (kind, index, props) {
      var info = dimInfo({ kind: kind, index: index });
      if (!info) throw new Error('No dimension ' + kind + ' ' + index + ' in the active sketch.');
      var d = info.d;
      if (props) {
        markDirty();
        ['name', 'tol', 'prec', 'prefix', 'suffix', 'show', 'ac'].forEach(function (k) { if (k in props) { if (props[k] == null || props[k] === '') delete d[k]; else d[k] = clone(props[k]); } });
        if ('ac' in props && d.type === 'distance') { var m = S.measure(info.f, d.type, d.refs, d.dir, d.sup, d.ac); if (m != null) d.v = m; }
        refresh();
      }
      var it = dimInfo({ d: d });
      return { name: fullName(info.f, d), value: it.value, shown: it.shown, label: dimLabelText(d, it.value, it.kindText), tol: d.tol || null, prec: d.prec != null ? d.prec : null, prefix: d.prefix || '', suffix: d.suffix || '', show: d.show || null, ac: d.ac || null, driven: !!d.driven };
    };
  }
})();
