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
//   - Fully Define Sketch (Tools ▸ Dimensions ▸ Fully Define Sketch) with its PropertyManager (Baseline / Chain /
//     Ordinate schemes).
//   - The Smart Dimension flyout's Horizontal / Vertical Dimension and Horizontal / Vertical Ordinate Dimension, and
//     the drawing of ordinate sets (a "0" at the zero, values on one line, jogged leaders; SketchSolver.addOrdinate).
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
  // rfIF: a dimension without its own precision follows the document's (docDimPrec); while that is the default for the
  // units (inch .123, mm and angles .12) the text is exactly what it was before (mm drops trailing zeros), else the
  // document's places are written like a dimension's own (.1234, 12.5000; a zero reads 0).
  function fmtVal(x, prec, angle) {
    if (!ownPrec(prec)) {
      var dp = docDimPrec(angle);
      if (dp === defaultDocPrec(angle)) return angle ? UI.fmtNum(x, 2) : (UI.fmtDim ? UI.fmtDim(x) : UI.fmtNum(x, 3));
      var s = fmtVal(x, dp, angle);
      return +s === 0 ? '0' : s;
    }
    var t = Math.abs(x).toFixed(Math.min(MAX_PREC, Math.round(+prec)));
    if (!angle && inch() && /^0\./.test(t)) t = t.slice(1);
    if (+t === 0) return angle ? '0' : t;
    return (x < 0 ? '-' : '') + t;
  }
  function ownPrec(prec) { return !(prec == null || prec === '' || prec === 'auto' || !(+prec >= 0)); }

  // ------------------------------------------------------------------ document precision (rfIF)
  // SolidWorks: Tools ▸ Options ▸ Document Properties ▸ Dimensions ▸ Primary precision. Stored in the model as
  // model.dimPrecision = { linear, angular } (decimal places 0 … 8; a missing field is the default for the document's
  // units: inch .123, mm .12, angles .12), saved with the part and written by generateScript (p.dimPrecision). Every
  // sketch dimension without its own precision (d.prec) follows it.
  var MAX_PREC = 8;
  function defaultDocPrec(angle) { return angle ? 2 : inch() ? 3 : 2; }
  function docDimPrec(angle) {
    var dp = App.model && App.model.dimPrecision, x = dp ? (angle ? dp.angular : dp.linear) : null;
    return x != null && x !== '' && +x >= 0 ? Math.min(MAX_PREC, Math.round(+x)) : defaultDocPrec(angle);
  }
  // the places a dimension shows: its own precision, else the document's
  function dimPlaces(d, angle) { return d && ownPrec(d.prec) ? Math.min(MAX_PREC, Math.round(+d.prec)) : docDimPrec(angle); }
  // the option text of a precision (SolidWorks' list): None, .1, .12 … .12345678
  function precText(n) { return +n > 0 ? '.' + '12345678'.slice(0, +n) : 'None'; }
  // the precision list of a Dimension PM: None … .12345678, then the document's value "(Document)" last (value 'auto')
  function precOptions(docPlaces) {
    var out = [];
    for (var i = 0; i <= MAX_PREC; i++) out.push([String(i), precText(i)]);
    out.push(['auto', precText(docPlaces) + ' (Document)']);
    return out;
  }
  // setDocDimPrecision({ linear?, angular? }): places 0 … 8, null / '' = the default; an undo step unless unchanged;
  // every dimension that follows the document redraws
  function setDocDimPrecision(o) {
    o = o || {};
    var m = App.model, cur = m.dimPrecision || {}, next = {};
    ['linear', 'angular'].forEach(function (k) {
      var x = k in o ? o[k] : cur[k];
      if (x != null && x !== '' && +x >= 0 && Math.min(MAX_PREC, Math.round(+x)) !== defaultDocPrec(k === 'angular')) next[k] = Math.min(MAX_PREC, Math.round(+x));   // (the default is not stored)
    });
    if (JSON.stringify(next) === JSON.stringify(m.dimPrecision || {})) return false;
    UI.pushUndo();
    if (Object.keys(next).length) m.dimPrecision = next; else delete m.dimPrecision;
    App.dimsStale = true;
    if (UI.refreshDimensionPM) UI.refreshDimensionPM();
    if (UI.autosave) UI.autosave();
    if (UI.requestRender) UI.requestRender();
    return true;
  }
  UI.docDimPrec = docDimPrec; UI.dimPlaces = dimPlaces; UI.dimPrecText = precText; UI.dimPrecOptions = precOptions;
  UI.setDocDimPrecision = setDocDimPrecision; UI.DIM_MAX_PREC = MAX_PREC;
  // (script: p.dimPrecision({ linear, angular }), Builder method and generateScript line in kernel-script.js)
  // UI.dimLabelText(d, value, kind): the label of a sketch dimension (a Smart Dimension in sketch.dims or a distance /
  // angle / arc length relation), kind 'len' | 'dia' | 'r' | 'angle' | 'arclen'. Radius shown as diameter or the other
  // way (d.show), precision (d.prec), tolerance (d.tol: { type: none | basic | bilateral | limit | symmetric | min | max,
  // plus, minus }) and the text before / after the value (d.prefix, d.suffix: "2X ", " TYP"). A driven dimension's
  // parentheses are added by the caller.
  // rfA: a length's unit after its value in a status message (' in', ' mm'; an angle has its degree sign already)
  function unitAfter(kind) { return kind === 'angle' ? '' : ' ' + UI.unitLabel(); }
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
    if (d.link != null && d.link !== '') main = '∞' + main;   // lane CV: a linked (shared) value, as SolidWorks marks it
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
      kt = d.type === 'angle' || d.type === 'runangle' ? 'angle' : d.type === 'arclength' ? 'arclen' : 'len';   // rfAQ: an angular running value is an angle
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
    else UI.setStatus('Dimension ' + fullName(f, info.d) + ' set to ' + dimLabelText(info.d, v, info.kindText) + unitAfter(info.kindText) + '.');   // rfA: with the unit
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
    if (rel.ord != null && rel.type === 'distance') return ordPlacement(f, rel, uv);   // sketch-ordinate: the whole set's text line
    if (rel.type !== 'arclength') return null;
    var p = S.parseRef(rel.refs[0]), e = p && !p.o && f.entities[p.e];
    if (!e || e.t !== 'arc') return {};
    return { off: Math.round(Math.hypot(uv[0] - e.cx, uv[1] - e.cy) * 1e4) / 1e4 };
  };
  // an arc length: a dimension arc concentric with the arc at radius off, extension lines out from its ends, arrows,
  // the ⌒ value at the middle
  UI.relDimScreenExt = function (f, pl, rel) {
    if (rel.ord != null && rel.type === 'distance') return ordScreen(f, pl, rel);   // sketch-ordinate: a member of an ordinate set
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
  var ARC_COND = [['c', 'Center'], ['min', 'Min'], ['max', 'Max']];
  var dimPM = null;   // { d, spec, rerender } while the Dimension PM is open
  // rfE: Primary Value as SolidWorks shows it: the dimension's own precision (d.prec decimal places), else the
  // document's (inch .123, mm and angles .12); a value that would round to 0 keeps 3 significant digits. A value
  // typed in the box is applied at full precision (apply('value')).
  function pmShown(x, prec, angle) {
    x = +x;
    if (!isFinite(x)) return x;
    var p = ownPrec(prec) ? Math.min(MAX_PREC, Math.round(+prec)) : docDimPrec(angle);   // rfIF: the document's precision
    var r = +x.toFixed(p);
    return r === 0 && x !== 0 ? +x.toPrecision(3) : r;
  }
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
      v.value = pmShown(it.shown, d.prec, it.kindText === 'angle');
      v.driven = !!d.driven;
      v.mark = d.mark != null ? !!d.mark : !d.driven;   // rfB: marked for drawing (Model Items); off by default for a driven one
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
          { type: 'select', key: 'tolType', label: 'Tolerance type', icon: 'dimTolType', options: TOL_TYPES, rerender: true },
          { type: 'number', key: 'plus', label: 'Maximum variation (+)', unit: unit, show: function (x) { return /^(bilateral|limit|symmetric)$/.test(x.tolType); } },
          { type: 'number', key: 'minus', label: 'Minimum variation (−)', unit: unit, show: function (x) { return /^(bilateral|limit)$/.test(x.tolType); } },
          // rfIF: SolidWorks' list: None, .1 … .12345678, then the document's precision "(Document)" last
          { type: 'select', key: 'prec', label: 'Primary unit precision', icon: 'dimPrecision', options: function () { return precOptions(docDimPrec(info.kindText === 'angle')); } }
        ] },
        { title: 'Primary Value', fields: [
          { type: 'text', key: 'name', label: 'Name' },
          { type: 'number', key: 'value', label: info.kind === 'rel' && d.type === 'angle' ? 'Angle' : 'Value', unit: unit },
          { type: 'check', key: 'driven', label: 'Driven (reference dimension)' },
          { type: 'check', key: 'mark', label: 'Mark for drawing' },
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
      } else if (key === 'mark') {
        // the default (on for a driving dimension, off for a driven one) is not stored
        if (!!v.mark === !d.driven) delete d.mark; else d.mark = !!v.mark;
      } else if (key === 'prec') {
        if (v.prec === 'auto') delete d.prec; else d.prec = +v.prec;
        App.dimsStale = true;
        rerender();   // rfIF: the Value box shows the new precision too
        return;
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
    dimPM = { d: d, spec: spec, rerender: rerender };
    var open = function () { UI.openPM(spec); };
    if (App.tool && App.tool !== 'select' && UI.withToolPM) UI.withToolPM(open); else open();
    return true;
  }
  UI.openDimensionPM = openDimensionPM;
  UI.dimensionPMOpen = function () { return !!(dimPM && UI.pmSpec && UI.pmSpec() === dimPM.spec); };
  // rfE: re-read the open Dimension PM (Primary Value, message) after its value changed elsewhere (the Modify box)
  UI.refreshDimensionPM = function () { if (UI.dimensionPMOpen()) dimPM.rerender(); };
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
    // a selected sketch point (an end or a centre picked with the Select tool) comes in as that point
    if (UI.selectedSketchRefs) UI.selectedSketchRefs().forEach(function (r) { if (App.relPick.indexOf(r) < 0) App.relPick.push(r); });
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
    function dimText(x) { var e = f.entities[x.dim.e], val = e ? K.dimValue(e, x.dim) : null; return 'Dimension ' + fullName(f, x.dim) + ' ' + (val != null ? fmtVal(val, x.dim.prec, false) : '') + ' on ' + S.refName(f, String(x.dim.e)); }   // sketch-units
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
  // dimension scheme (Baseline / Chain / Ordinate: SketchSolver's ordinate block) and datum of each direction (the origin unless a point is picked: click the
  // datum box, then a point), where the dimensions go (below / above, left / right), all entities or the selected
  // ones. Calculate applies it (one undo step) and reports; Cancel puts the sketch back as it was.
  // rfAQ: mode 'autodim' is Tools ▸ Dimensions ▸ Autodimension: the same engine with dimensions only (no relations
  // group), SolidWorks' Entities to Dimension / Horizontal Dimensions / Vertical Dimensions groups. A datum is a point,
  // the origin or a line square to its direction (a vertical line for the horizontal dimensions).
  function cmdFullyDefineSketch(mode) {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    UI.setTool('select');
    var auto = mode === 'autodim';
    var sel0 = selectedEntities();
    var v = { scope: sel0.length ? 'selected' : 'all', relations: !auto, horizontal: true, vertical: true, dims: true, hScheme: 'baseline', vScheme: 'baseline', hPlace: 'below', vPlace: 'left' };
    if (auto) { v.horizontalDims = true; v.verticalDims = true; }
    var datum = { h: 'O', v: 'O' }, active = null, snap = null, applied = null;
    function snapshot() { return { entities: clone(f.entities), rels: f.rels ? clone(f.rels) : null, dims: f.dims ? clone(f.dims) : null }; }
    function restore(s) { f.entities = clone(s.entities); if (s.rels) f.rels = clone(s.rels); else delete f.rels; if (s.dims) f.dims = clone(s.dims); else delete f.dims; }
    function datumName(r) { return r === 'O' ? 'Origin' : S.refName(f, r); }
    var spec = {
      title: auto ? 'Autodimension' : 'Fully Define Sketch', icon: auto ? 'autodim' : 'fullyDefine', values: v,
      command: { onSketchPoint: function (uv, mx, my) {
        if (!active) { UI.setStatus('Click the Horizontal or Vertical datum box first, then a point (or the origin).'); return; }
        var r = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null;
        var lineOk = r && S.ordKind(f, r, active === 'h' ? 'x' : 'y') === 'line';   // rfAQ: a datum line square to the direction
        if (!r || (r !== 'O' && S.refKind(f, r) !== 'point' && !lineOk)) { UI.setStatus('Pick a point (an end point, a centre), a ' + (active === 'h' ? 'vertical' : 'horizontal') + ' line or the origin as the datum.'); return; }
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
        relations: !auto && v.relations && (v.horizontal || v.vertical) ? { horizontal: !!v.horizontal, vertical: !!v.vertical } : false,
        dims: !!v.dims, hScheme: v.hScheme, vScheme: v.vScheme, hDatum: datum.h, vDatum: datum.v, hPlace: v.hPlace, vPlace: v.vPlace,
        entities: v.scope === 'selected' && sel0.length ? sel0 : null,
        skipH: auto && !v.horizontalDims, skipV: auto && !v.verticalDims,
        units: UI.unitLabel && UI.unitLabel() === 'in' ? 'in' : 'mm',   // lane HP: SolidWorks' 10 mm / 6 mm offset distances
        minGap: 34 * (UI.cam.scale || 0)   // stacked dimension lines at least 34 px apart at the current zoom: their labels clear of each other
      };
    }
    function calculate() {
      if (snap && applied) restore(snap);
      if (!snap) { UI.pushUndo(); App.sketchDirty = true; }   // its own Ctrl+Z step, even right after an import or a script
      snap = snap || snapshot();
      var r = S.fullyDefine(f, opts());
      applied = r;
      refresh();
      // rfHW: a row whose label lands on another dimension's lines or label (or on the sketch) steps further out,
      // the rows nearest the sketch first
      if (r && r.ok !== false && UI.clearDimPlacement) {
        var made = (r.dims || []).map(function (i) { return { dim: i, off: f.dims && f.dims[i] ? f.dims[i].off : 0 }; })
          .concat((r.rels || []).filter(function (i) { var x = f.rels[i]; return x && x.v != null && typeof x.off === 'number'; }).map(function (i) { return { rel: i, off: f.rels[i].off }; }));
        made.sort(function (a, b) { return Math.abs(a.off || 0) - Math.abs(b.off || 0); });
        try { if (UI.clearDimPlacement(f, made)) refresh(); } catch (err) { console.error('dimension placement: ' + (err && err.message)); }
      }
      var msg = r.ok === false && r.error ? r.error : 'Added ' + r.rels.filter(function (i) { return !(S.TYPES[f.rels[i].type] || {}).dim; }).length + ' relation(s) and ' + (r.dims.length + r.rels.filter(function (i) { return (S.TYPES[f.rels[i].type] || {}).dim; }).length) + ' dimension(s). ' + S.STATUS_TEXT[r.status] + (r.dof ? ' (' + r.dof + ' degrees of freedom left).' : '.');
      UI.setStatus(msg);
      spec.message = msg;
      spec.messageOk = r.status === 'full';
      if (UI.pmSpec && UI.pmSpec() === spec) render();
      return r;
    }
    function render() {
      var an = analysis(f);
      if (!applied) { spec.message = S.STATUS_TEXT[an.status] + ' (' + an.dof + ' degree' + (an.dof === 1 ? '' : 's') + ' of freedom). Set the options, then ' + (auto ? 'Apply' : 'Calculate') + '.'; spec.messageOk = an.status === 'full'; }
      if (auto) {
        var SCH = [['baseline', 'Baseline'], ['chain', 'Chain'], ['ordinate', 'Ordinate']];
        spec.groups = [
          { title: 'Entities to Dimension', fields: [
            { type: 'radio', key: 'scope', options: [['all', 'All entities in sketch'], ['selected', 'Selected entities']], disabledOption: function (o) { return o === 'selected' && !sel0.length ? 'Select entities before opening Autodimension.' : null; } },
            { type: 'buttons', buttons: [{ label: 'Apply', onclick: function () { calculate(); } }] }
          ] },
          { title: 'Horizontal Dimensions', fields: [
            { type: 'check', key: 'horizontalDims', label: 'Horizontal dimensions' },
            { type: 'select', key: 'hScheme', label: 'Scheme', options: SCH },
            { type: 'pick', label: 'Origin (datum)', icon: 'origin', value: function () { return datumName(datum.h); }, active: function () { return active === 'h'; }, onActivate: function () { active = active === 'h' ? null : 'h'; render(); } },
            { type: 'radio', key: 'hPlace', label: 'Dimension placement', options: [['above', 'Above sketch'], ['below', 'Below sketch']] }
          ] },
          { title: 'Vertical Dimensions', fields: [
            { type: 'check', key: 'verticalDims', label: 'Vertical dimensions' },
            { type: 'select', key: 'vScheme', label: 'Scheme', options: SCH },
            { type: 'pick', label: 'Origin (datum)', icon: 'origin', value: function () { return datumName(datum.v); }, active: function () { return active === 'v'; }, onActivate: function () { active = active === 'v' ? null : 'v'; render(); } },
            { type: 'radio', key: 'vPlace', label: 'Dimension placement', options: [['left', 'Left of sketch'], ['right', 'Right of sketch']] }
          ] }
        ];
        UI.openPM(spec);
        return;
      }
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
          { type: 'select', key: 'hScheme', label: 'Horizontal dimensions scheme', options: [['baseline', 'Baseline'], ['chain', 'Chain'], ['ordinate', 'Ordinate']] },
          { type: 'pick', label: 'Horizontal datum', icon: 'origin', value: function () { return datumName(datum.h); }, active: function () { return active === 'h'; }, onActivate: function () { active = active === 'h' ? null : 'h'; render(); } },
          { type: 'select', key: 'vScheme', label: 'Vertical dimensions scheme', options: [['baseline', 'Baseline'], ['chain', 'Chain'], ['ordinate', 'Ordinate']] },
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
  UI.cmdFullyDefineSketch = function () { return cmdFullyDefineSketch(); };
  UI.cmdAutodimension = function () { return cmdFullyDefineSketch('autodim'); };

  // ------------------------------------------------------------------ ordinate dimensions (sketch-ordinate)
  // Smart Dimension flyout ▸ Horizontal / Vertical Ordinate Dimension. Click the zero (a point, the origin, a circle's
  // centre or a line square to the axis), click where the values go, then every point, hole or edge to dimension; ✓
  // or Esc ends. Each member is a driving distance from the zero (SketchSolver.addOrdinate: rel.ord / ordAxis / ordAt),
  // drawn SolidWorks' way: a "0" at the zero, every value on one text line square to its leader, the leaders jogged
  // sideways where the values would overlap. Dragging any value moves the whole set's text line; a value edits (Modify
  // box, Dimension PM) and drives like any dimension; selecting the "0" and Delete deletes the set.
  var SVGNS = 'http://www.w3.org/2000/svg', ordLayer = null, ordStyle = false, ordPM = null;
  // the roundest number within h of x (as a free sketch coordinate is rounded: -36, not -36.0547)
  function niceRound(x, h) {
    if (!(h > 0) || !isFinite(x)) return x;
    for (var k = Math.ceil(Math.log10(2 * h)); k > -12; k--) {
      var s1 = Math.pow(10, k), q = Math.round(x / s1) * s1;
      if (Math.abs(q - x) <= h) return +q.toFixed(Math.max(0, -k));
      var s2 = s1 / 2;
      q = Math.round(x / s2) * s2;
      if (Math.abs(q - x) <= h) return +q.toFixed(Math.max(0, 1 - k));
    }
    return x;
  }
  // the screen layout of a set: every item (the zero first) with its leader lines, text spot and label
  function ordLayout(f, pl, set) {
    var axis = set.axis, ai = axis === 'x' ? 0 : 1, oi = 1 - ai, s = (UI.cam && UI.cam.scale) || 0.1, cap = UI.DIM_CAP || 9.4;
    var items = [{ idx: -1, ref: set.zero, label: '0' }];
    set.members.forEach(function (i) {
      var rel = f.rels[i], value = rel.v != null && !rel.driven ? rel.v : S.measure(f, rel.type, rel.refs, rel.dir, rel.sup, rel.ac), lab = dimLabelText(rel, value, 'len');
      items.push({ idx: i, ref: rel.refs[1], label: rel.driven ? '(' + lab + ')' : lab, rel: rel });
    });
    var at = set.at;
    items.forEach(function (it) { it.A = S.ordAnchor(f, it.ref, axis, at); });
    items = items.filter(function (it) { return it.A && isFinite(it.A[0]) && isFinite(it.A[1]); });
    if (!items.length) return null;
    if (at == null || !isFinite(at)) at = items[0].A[oi];
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
    // u: the screen direction of the measuring axis; n: from the geometry toward the text line
    var mean = 0;
    items.forEach(function (it) { mean += it.A[oi] / items.length; });
    var P = items[0].A, Pu = P.slice(), Pn = P.slice();
    Pu[ai] += 10 * s; Pn[oi] += (at >= mean ? 1 : -1) * 10 * s;
    var sP = scr(pl, P), u = unit(sP, scr(pl, Pu)), n = unit(sP, scr(pl, Pn));
    items.forEach(function (it) {
      var foot = it.A.slice(); foot[oi] = at;
      it.sA = scr(pl, it.A); it.sF = scr(pl, foot);
      it.t = (it.sF[0] - sP[0]) * u[0] + (it.sF[1] - sP[1]) * u[1];
      it.ext = Math.abs(u[0]) * (UI.dimTextWidth ? UI.dimTextWidth(it.label) : it.label.length * 7) + Math.abs(u[1]) * cap;
    });
    // the values along the text line: each at its own leader unless that crowds a neighbour; crowded ones form a group
    // spread evenly about where they would stand (SolidWorks jogs their leaders)
    var order = items.slice().sort(function (a, b) { return a.t - b.t; }), groups = order.map(function (it) { return [it]; });
    function gap(a, b) { return (a.ext + b.ext) / 2 + 6; }
    function place(g) {
      var offs = [0], c = 0;
      for (var k = 1; k < g.length; k++) offs.push(offs[k - 1] + gap(g[k - 1], g[k]));
      g.forEach(function (it, k) { c += (it.t - offs[k]) / g.length; });
      g.forEach(function (it, k) { it.p = c + offs[k]; });
    }
    groups.forEach(place);
    for (var guard = 0; guard < 200; guard++) {
      var merged = false;
      for (var gi = 1; gi < groups.length; gi++) {
        var A = groups[gi - 1], B = groups[gi];
        if (B[0].p - A[A.length - 1].p < gap(A[A.length - 1], B[0]) - 1e-6) { groups.splice(gi - 1, 2, A.concat(B)); place(groups[gi - 1]); merged = true; break; }
      }
      if (!merged) break;
    }
    items.forEach(function (it) {
      var sh = it.p - it.t, F = [it.sF[0] + u[0] * sh, it.sF[1] + u[1] * sh], lines = [];
      var toward = (it.sF[0] - it.sA[0]) * n[0] + (it.sF[1] - it.sA[1]) * n[1];
      var d = Math.abs(toward) > 1e-6 ? (toward > 0 ? n : [-n[0], -n[1]]) : n, S0 = [it.sA[0] + d[0] * 3, it.sA[1] + d[1] * 3];
      if (Math.abs(sh) > 0.5 && toward > 18) {
        // jogged: straight to just short of the text line, across to where the value stands, then into it
        var K1 = [it.sF[0] - n[0] * 12, it.sF[1] - n[1] * 12], K2 = [F[0] - n[0] * 5, F[1] - n[1] * 5];
        lines.push([S0, K1], [K1, K2], [K2, F]);
      } else lines.push([S0, F]);
      it.lines = lines; it.F = F;
      if (Math.abs(n[1]) >= Math.abs(n[0])) it.text = { x: F[0], y: n[1] > 0 ? F[1] + 3 + cap : F[1] - 3, anchor: 'middle' };
      else it.text = { x: F[0] + n[0] * 3, y: F[1] + cap / 2, anchor: n[0] > 0 ? 'start' : 'end' };
    });
    return { items: items, zero: items[0].idx === -1 ? items[0] : null };
  }
  function ordSetOf(f, rel) { var sets = S.ordinateSets(f); return sets[rel.ord] || null; }
  // a member's screen data for ui-sketch.js's drawOne; the first member also carries the zero's leader
  function ordScreen(f, pl, rel) {
    var set = ordSetOf(f, rel), i = (f.rels || []).indexOf(rel);
    if (!set || i < 0) return null;
    var L = ordLayout(f, pl, set);
    if (!L) return null;
    var it = L.items.filter(function (x) { return x.idx === i; })[0];
    if (!it) return null;
    var lines = it.lines.slice();
    if (L.zero && set.members[0] === i) lines = lines.concat(L.zero.lines);
    return { lines: lines, arrows: [], label: it.label, text: it.text, laid: true };
  }
  // a value dragged: the whole set's text line goes where it is dropped (nothing else of the dimension moves)
  function ordPlacement(f, rel, uv) {
    var set = ordSetOf(f, rel);
    if (!set || !uv) return {};
    var at = niceRound(uv[set.axis === 'x' ? 1 : 0], 0.5 * ((UI.cam && UI.cam.scale) || 0.01));
    set.members.forEach(function (i) { f.rels[i].ordAt = at; });
    return {};
  }
  // the zeros ("0") of the sets, and of the set being started, in a layer of their own over the dimensions (a click
  // selects the set's zero: Delete then deletes the set)
  function ordLayerEl() {
    if (ordLayer && ordLayer.parentNode) return ordLayer;
    var host = $('dim-layer');
    if (!host || !host.parentNode) return null;
    if (!ordStyle) {
      ordStyle = true;
      var css = document.createElement('style');
      css.textContent = '#ord-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; overflow: visible; }' +
        '#ord-layer text { font: 13px "Century Gothic", "URW Gothic", "URW Gothic L", "TeX Gyre Adventor", "Avant Garde", Futura, "Segoe UI", Arial, sans-serif; fill: var(--dim-text); paint-order: stroke; stroke: var(--dim-halo); stroke-width: 2.5px; stroke-linejoin: round; pointer-events: auto; cursor: pointer; user-select: none; }' +
        '#ord-layer text:hover { fill: var(--blue); } #ord-layer text.sel { fill: var(--green); } #ord-layer text.temp { fill: var(--blue); pointer-events: none; }' +
        '#ord-layer path { stroke: var(--blue); stroke-dasharray: 4 3; fill: none; stroke-width: 1; }';
      document.head.appendChild(css);
    }
    ordLayer = document.createElementNS(SVGNS, 'svg');
    ordLayer.setAttribute('id', 'ord-layer');
    ordLayer.setAttribute('aria-hidden', 'true');
    host.parentNode.insertBefore(ordLayer, host.nextSibling);
    return ordLayer;
  }
  function drawOrdZeros() {
    var layer = ordLayerEl();
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    var f = UI.activeSketchFeature();
    if (!f || App.mode !== 'sketch') return;
    var pl = UI.activePlane(), sets = S.ordinateSets(f), list = [];
    Object.keys(sets).forEach(function (id) { list.push({ set: sets[id] }); });
    var tmp = ordPM && UI.pmSpec && UI.pmSpec() === ordPM ? App.tempOrd : null;   // (only while its PropertyManager is open)
    if (tmp && tmp.zero && (!tmp.ord || !sets[tmp.ord])) list.push({ set: { id: tmp.ord || '', axis: tmp.axis, at: tmp.at, zero: tmp.zero, members: [] }, temp: true });
    list.forEach(function (x) {
      var L = ordLayout(f, pl, x.set);
      if (!L || !L.zero) return;
      var z = L.zero;
      if (x.temp) {
        // the zero of a set not started yet: its leader too (dashed, as a dimension being placed)
        var p = document.createElementNS(SVGNS, 'path');
        p.setAttribute('d', z.lines.map(function (ln) { return 'M' + ln[0][0].toFixed(1) + ' ' + ln[0][1].toFixed(1) + ' L' + ln[1][0].toFixed(1) + ' ' + ln[1][1].toFixed(1); }).join(' '));
        layer.appendChild(p);
      }
      var t = document.createElementNS(SVGNS, 'text'), sel = !x.temp && App.sel && App.sel.kind === 'rel' && App.sel.ordZero === x.set.id;
      t.setAttribute('x', z.text.x.toFixed(1)); t.setAttribute('y', z.text.y.toFixed(1)); t.setAttribute('text-anchor', z.text.anchor);
      t.setAttribute('class', 'ord-zero' + (x.temp ? ' temp' : '') + (sel ? ' sel' : ''));
      t.setAttribute('data-ord', x.set.id);
      t.textContent = '0';
      if (!x.temp) {
        t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0');
        t.setAttribute('aria-label', 'Ordinate zero of ' + x.set.members.length + ' dimension' + (x.set.members.length === 1 ? '' : 's') + ': click to select the set, Delete deletes it');
        var pick = function (ev) { ev.preventDefault(); ev.stopPropagation(); selectOrdZero(x.set.id); };
        t.addEventListener('mousedown', pick);
        t.addEventListener('click', function (ev) { ev.stopPropagation(); });
        t.addEventListener('keydown', function (ev) { if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); ev.stopPropagation(); deleteOrdinateSet(x.set.id); } });
      }
      layer.appendChild(t);
    });
  }
  if (UI.drawDims) {
    var baseDrawDimsOrd = UI.drawDims;
    UI.drawDims = function () { var r = baseDrawDimsOrd.apply(this, arguments); try { drawOrdZeros(); } catch (e) { /* the zeros are an overlay: never break the dimensions */ } return r; };
  }
  function selectOrdZero(id) {
    var f = UI.activeSketchFeature(), set = f && S.ordinateSets(f)[id];
    if (!set) return false;
    App.sel = { kind: 'rel', index: set.members[0], ordZero: id };
    App.dimsStale = true;
    if (UI.requestRender) UI.requestRender();
    UI.setStatus('Ordinate set from ' + S.refName(f, set.zero) + ' (' + set.members.length + ' dimension' + (set.members.length === 1 ? '' : 's') + ') selected. Delete deletes the whole set.');
    return true;
  }
  function deleteOrdinateSet(id) {
    var f = UI.activeSketchFeature();
    if (!f || !S.ordinateSets(f)[id]) return 0;
    markDirty();
    var n = S.deleteOrdinateSet(f, id);
    App.sel = null; App.relHover = null;
    refresh();
    closeDimPMIfGone();
    UI.setStatus('Ordinate set deleted (' + n + ' dimension' + (n === 1 ? '' : 's') + ').');
    return n;
  }
  // Delete with a set's zero selected deletes the set (a value alone deletes that value)
  var baseDeleteRelOrd = UI.deleteRelation;
  if (baseDeleteRelOrd) UI.deleteRelation = function (i) {
    var s = App.sel;
    if (s && s.kind === 'rel' && s.ordZero != null && s.index === i) return deleteOrdinateSet(s.ordZero) > 0;
    return baseDeleteRelOrd.apply(this, arguments);
  };
  UI.deleteOrdinateSet = deleteOrdinateSet;
  UI.selectOrdinateZero = selectOrdZero;
  // the PropertyManager command
  function cmdOrdinateDim(axis) {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    // rfAQ: axis 'auto' is SolidWorks' Ordinate Dimension: the direction follows where the values go (above / below the
    // zero: horizontal; beside it: vertical)
    var autoAxis = axis === 'auto';
    axis = axis === 'y' ? 'y' : 'x';
    UI.setTool('select');
    var name = autoAxis ? 'Ordinate Dimension' : axis === 'x' ? 'Horizontal Ordinate Dimension' : 'Vertical Ordinate Dimension', square = axis === 'x' ? 'vertical' : 'horizontal';
    function pickAxis(uv) {
      if (!autoAxis || !st.zero || !uv) return;
      var okX = !!S.ordKind(f, st.zero, 'x'), okY = !!S.ordKind(f, st.zero, 'y'), z = S.ordAnchor(f, st.zero, 'x', null) || [0, 0];
      axis = okX && okY ? (Math.abs(uv[1] - z[1]) >= Math.abs(uv[0] - z[0]) ? 'x' : 'y') : okX ? 'x' : 'y';
      square = axis === 'x' ? 'vertical' : 'horizontal';
    }
    var st = { zero: null, at: null, ord: null, n: 0 };
    function msg() {
      return !st.zero ? 'Click the zero: a point, a circle\'s centre, the origin or a ' + square + ' line.'
        : st.at == null ? 'Click where the ordinate dimensions go (the 0 follows the cursor).'
        : 'Click the points, holes and ' + square + ' edges to dimension from ' + S.refName(f, st.zero) + (st.n ? ' (' + st.n + ' so far)' : '') + '. ✓ or Esc when done.';
    }
    function end() { App.tempOrd = null; App.dimsStale = true; if (UI.requestRender) UI.requestRender(); }
    var spec = {
      title: name, icon: autoAxis ? 'ordinateDim' : axis === 'x' ? 'ordinateH' : 'ordinateV', values: {}, keepSelection: true,
      command: {
        onSketchPoint: function (uv, mx, my) { click(uv, UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null); },
        onSketchMove: function (uv) { if (st.zero && st.at == null && App.tempOrd) { pickAxis(uv); App.tempOrd.axis = axis; App.tempOrd.at = uv[axis === 'x' ? 1 : 0]; App.dimsStale = true; } }
      },
      groups: [],
      onOK: end, onCancel: end
    };
    function render() {
      spec.message = msg();
      spec.groups = [{ title: 'Ordinate', fields: [
        { type: 'static', label: 'Zero', value: st.zero ? S.refName(f, st.zero) : '—' },
        { type: 'static', label: 'Dimensions', value: String(st.n) }
      ] }];
      UI.openPM(spec);
      var h = $('sketch-hint');
      if (h) h.textContent = spec.message;
    }
    // one click: the zero, then the text line, then the members (ref: what was clicked; uv: where)
    function click(uv, ref) {
      if (!st.zero) {
        if (!ref) { UI.setStatus('Nothing there: ' + msg()); return; }
        if (autoAxis && !S.ordKind(f, ref, 'x') && S.ordKind(f, ref, 'y')) axis = 'y';
        if (!S.ordKind(f, ref, axis)) { UI.toast('The zero of a ' + (axis === 'x' ? 'horizontal' : 'vertical') + ' ordinate set is a point, a circle\'s centre or a ' + square + ' line.'); return; }
        st.zero = ref;
        App.tempOrd = { zero: ref, axis: axis, at: uv ? uv[axis === 'x' ? 1 : 0] : null };
      } else if (st.at == null) {
        pickAxis(uv);
        st.at = niceRound(uv[axis === 'x' ? 1 : 0], 0.5 * ((UI.cam && UI.cam.scale) || 0.01));
        st.ord = S.newOrdinateId(f);
        App.tempOrd = { zero: st.zero, axis: axis, at: st.at, ord: st.ord };
      } else {
        if (!ref) { UI.setStatus('Nothing there: ' + msg()); return; }
        markDirty();
        var r = S.addOrdinate(f, { zero: st.zero, target: ref, axis: axis, ord: st.ord, at: st.at });
        if (!r.ok) { UI.toast(r.error); return; }
        st.n++;
        refresh();
        var rel = f.rels[r.index];
        UI.setStatus('Ordinate dimension ' + dimLabelText(rel, rel.v, 'len') + unitAfter('len') + (r.driven ? ' added as driven (it would over-define the sketch).' : ' added.'));   // rfA: with the unit
      }
      App.dimsStale = true;
      render();
      return true;
    }
    spec.click = click;
    ordPM = spec;
    App.tempOrd = null;
    render();
    return spec;
  }
  UI.cmdOrdinateDim = cmdOrdinateDim;
  // Horizontal / Vertical Dimension (Smart Dimension flyout): Smart Dimension held to one direction — two points (or a
  // point and a line square to it, two such lines), then where the dimension goes; the Modify box opens as usual
  function cmdDirDim(axis) {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    axis = axis === 'y' ? 'y' : 'x';
    UI.setTool('select');
    var name = axis === 'x' ? 'Horizontal Dimension' : 'Vertical Dimension', dir = axis === 'x' ? 'h' : 'v', st = { a: null, rd: null };
    function hint() { return !st.a ? 'Click the first point or ' + (axis === 'x' ? 'vertical' : 'horizontal') + ' line.' : !st.rd ? 'Click the second one.' : 'Click where the dimension goes.'; }
    function end() { App.tempRelDim = null; App.dimsStale = true; }
    var spec = {
      title: name, icon: axis === 'x' ? 'horizDim' : 'vertDim', values: {}, keepSelection: true,
      command: {
        onSketchPoint: function (uv, mx, my) {
          var ref = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null;
          if (!st.a) {
            if (!ref || !S.ordKind(f, ref, axis)) { UI.setStatus(hint()); return; }
            st.a = ref;
          } else if (!st.rd) {
            if (!ref || ref === st.a || !S.ordKind(f, ref, axis)) { UI.setStatus(hint()); return; }
            var v = S.measure(f, 'distance', [st.a, ref], dir);
            if (v == null) { UI.toast('No ' + (axis === 'x' ? 'horizontal' : 'vertical') + ' distance between those two.'); st.a = null; render(); return; }
            st.rd = { type: 'distance', refs: [st.a, ref], dir: dir, v: v };
            App.tempRelDim = Object.assign({}, st.rd, UI.relDimPlacement(f, st.rd, uv));
          } else {
            var pl = UI.relDimPlacement(f, st.rd, uv);
            markDirty();
            var r = S.addRelation(f, 'distance', st.rd.refs, { dir: dir, off: pl.off, tx: pl.tx });
            st.a = null; st.rd = null; App.tempRelDim = null;
            if (!r.ok) { UI.toast(r.error); render(); return; }
            var idx = r.rels[0];
            App.sel = { kind: 'rel', index: idx };
            refresh();
            if (!(UI.askDrivenIfOver && UI.askDrivenIfOver(f, 'rel', idx)) && UI.openRelDimEdit) UI.openRelDimEdit(idx);
          }
          App.dimsStale = true;
          render();
        },
        onSketchMove: function (uv) { if (st.rd) { App.tempRelDim = Object.assign({}, st.rd, UI.relDimPlacement(f, st.rd, uv)); App.dimsStale = true; } }
      },
      groups: [], onOK: end, onCancel: end
    };
    function render() { spec.message = hint(); UI.openPM(spec); var h = $('sketch-hint'); if (h) h.textContent = spec.message; }
    render();
    return spec;
  }
  UI.cmdHorizontalDim = function () { return cmdDirDim('x'); };
  UI.cmdVerticalDim = function () { return cmdDirDim('y'); };

  if (window.anvil) {
    // anvil.ordinate(axis, zeroRef, [targetRefs], at?) -> { ord, members, values }: an ordinate set made in one call
    // on the active sketch (as the PropertyManager makes it); anvil.ordinateSets() lists the sets
    window.anvil.ordinate = function (axis, zero, targets, at) {
      var f = UI.activeSketchFeature();
      if (!f) throw new Error('No active sketch.');
      markDirty();
      var ord = null, members = [];
      (targets || []).forEach(function (t) {
        var r = S.addOrdinate(f, { zero: zero, target: t, axis: axis, ord: ord, at: at });
        if (!r.ok) throw new Error(r.error);
        ord = r.ord; members.push(r.index);
      });
      refresh();
      return { ord: ord, members: members, values: members.map(function (i) { return f.rels[i].v; }) };
    };
    window.anvil.ordinateSets = function () { var f = UI.activeSketchFeature(); return f ? JSON.parse(JSON.stringify(S.ordinateSets(f))) : {}; };
  }
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

  // ------------------------------------------------------------------ rfAQ: Chamfer, Path Length, Angular Running dimensions
  // SolidWorks' Smart Dimension flyout ▸ Chamfer Dimension (the chamfer line, the line next to it, then where the label
  // goes: "0.100 X 45°", both values drive: the Modify box takes the distance, the Dimension PM the angle too), Path
  // Length Dimension (pick the lines and arcs of a path or one and Select Chain, ✓, then the label; the total length
  // drives the chain) and Angular Running Dimension (the 0° line near its vertex end, where the arcs go, then every line or
  // point: each angle counter-clockwise from the datum, one set; the "0°" selects the set, Delete deletes it). The
  // solver side is SketchSolver.addChamferDim / addPathLength / addRunningAngle (sketch-solver.js, rfAQ).
  var RFAQ = { chamfer: 1, pathlength: 1, runangle: 1 };
  function lineMid(L) { return [(L.a[0] + L.b[0]) / 2, (L.a[1] + L.b[1]) / 2]; }
  function uvOf(f, ref) { return S.refPoint(f, ref) || (S.refCurve(f, ref) || {}).c || null; }
  // where a chamfer / path-length leader starts: the chamfer line's middle, the first path entity's middle
  function rfaqAnchor(f, rel) {
    var r0 = rel.refs[0], c = S.refCurve(f, r0);
    if (!c) return null;
    if (c.kind === 'line') return lineMid(c);
    var p = S.parseRef(r0), e = p && !p.o && f.entities[p.e], a = e && e.t === 'arc' ? (e.a0 + e.a1) / 2 * Math.PI / 180 : Math.PI / 4;
    return [c.c[0] + c.r * Math.cos(a), c.c[1] + c.r * Math.sin(a)];
  }
  // the default label place: 28 px off the anchor, square to the chamfer line, away from the line next to it
  function rfaqDefaultLo(f, rel) {
    var A = rfaqAnchor(f, rel), c = S.refCurve(f, rel.refs[0]), s = (UI.cam && UI.cam.scale) || 0.1;
    if (!A || !c) return [0, 0];
    var n = [0, 1];
    if (c.kind === 'line') {
      var dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L = Math.hypot(dx, dy) || 1;
      n = [-dy / L, dx / L];
      var o = rel.refs[1] ? S.refCurve(f, rel.refs[1]) : null;
      if (o && o.kind === 'line') { var m = lineMid(o); if ((m[0] - A[0]) * n[0] + (m[1] - A[1]) * n[1] > 0) n = [-n[0], -n[1]]; }
    } else n = [Math.SQRT1_2, Math.SQRT1_2];
    return [n[0] * 28 * s, n[1] * 28 * s];
  }
  function rfaqLabel(f, rel) {
    var value = rel.driven || rel.v == null ? S.measure(f, rel.type, rel.refs) : rel.v, lab;
    if (rel.type === 'runangle') lab = dimLabelText(rel, value, 'angle');
    else if (rel.type === 'chamfer') {
      // SolidWorks' "0.100 X 45°": the distance (with its tolerance), X, the angle; text before / after round the pair
      var ang = S.chamferShownAngle(f, rel), core = dimLabelText(Object.assign({}, rel, { prefix: '', suffix: '' }), value, 'len');
      var pre = rel.prefix ? String(rel.prefix).replace(/\s*$/, ' ') : '', suf = rel.suffix ? String(rel.suffix).replace(/^\s*/, ' ') : '';
      lab = pre + core + (ang != null ? ' X ' + fmtVal(ang, rel.prec, true) + '°' : '') + suf;
    } else lab = dimLabelText(rel, value, 'len');
    return rel.driven ? '(' + lab + ')' : lab;
  }
  function unit2(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
  // a leader from the anchor (arrow on the geometry) to the label, with a short shoulder; the text beside it
  function leaderScreen(f, pl, rel) {
    var A = rfaqAnchor(f, rel);
    if (!A) return null;
    var lo = Array.isArray(rel.lo) ? rel.lo : rfaqDefaultLo(f, rel), T = [A[0] + lo[0], A[1] + lo[1]];
    var sA = scr(pl, A), sT = scr(pl, T), right = sT[0] >= sA[0], sh = [sT[0] + (right ? 10 : -10), sT[1]];
    var out = { lines: [[sA, sT], [sT, sh]], arrows: [{ tip: sA, dir: unit2(sT, sA) }], label: rfaqLabel(f, rel) };
    out.text = { x: sh[0] + (right ? 3 : -3), y: sh[1] + (UI.DIM_CAP || 9.4) / 2, anchor: right ? 'start' : 'end' };
    out.laid = true;
    return out;
  }
  // an angular running member: the arc from the datum round to it at radius off, an arrow at its end, an extension line
  // out along it, the value past the arc's end
  function runScreen(f, pl, rel) {
    var V = uvOf(f, rel.refs[0]), Dp = uvOf(f, rel.refs[1]), T = uvOf(f, rel.refs[2]);
    if (!V || !Dp || !T) return null;
    var s = (UI.cam && UI.cam.scale) || 0.1, R = rel.off != null && rel.off > 1e-9 ? rel.off : 40 * s;
    var a0 = Math.atan2(Dp[1] - V[1], Dp[0] - V[0]), value = rel.driven || rel.v == null ? S.measure(f, 'runangle', rel.refs) : rel.v;
    var sw = (S.measure(f, 'runangle', rel.refs) || 0) * Math.PI / 180, aT = a0 + sw;
    function at(a, r) { return scr(pl, [V[0] + r * Math.cos(a), V[1] + r * Math.sin(a)]); }
    var n = Math.max(2, Math.ceil(sw / (Math.PI / 36))), pts = [], out = { lines: [], arrows: [] };
    for (var i = 0; i <= n; i++) pts.push(at(a0 + sw * i / n, R));
    for (var j = 0; j < n; j++) out.lines.push([pts[j], pts[j + 1]]);
    out.arrows.push({ tip: pts[n], dir: unit2(pts[n - 1], pts[n]) });
    var dT = Math.hypot(T[0] - V[0], T[1] - V[1]), gap = 2 * s, ext = 4 * s;
    if (R > dT + gap) out.lines.push([at(aT, dT + gap), at(aT, R + ext)]);
    else if (R < dT - gap) out.lines.push([at(aT, R - ext), at(aT, dT - gap)]);
    var tp = at(aT, R + 14 * s);
    out.label = dimLabelText(rel, value, 'angle');
    if (rel.driven) out.label = '(' + out.label + ')';
    out.text = { x: tp[0], y: tp[1] + (UI.DIM_CAP || 9.4) / 2, anchor: 'middle' };
    out.laid = true;
    return out;
  }
  var baseScreenAQ = UI.relDimScreenExt, basePlaceAQ = UI.relDimPlacementExt;
  UI.relDimScreenExt = function (f, pl, rel) {
    if (rel && RFAQ[rel.type]) return rel.type === 'runangle' ? runScreen(f, pl, rel) : leaderScreen(f, pl, rel);
    return baseScreenAQ ? baseScreenAQ.apply(this, arguments) : null;
  };
  // a label dragged: a chamfer / path length's label goes where it is dropped; a running set's arcs follow the cursor's
  // distance from the vertex (all the set's members)
  UI.relDimPlacementExt = function (f, rel, uv) {
    if (rel && RFAQ[rel.type]) {
      if (!uv) return {};
      var s = (UI.cam && UI.cam.scale) || 0.01;
      if (rel.type === 'runangle') {
        var V = uvOf(f, rel.refs[0]);
        if (!V) return {};
        var off = niceRound(Math.hypot(uv[0] - V[0], uv[1] - V[1]), 0.5 * s);
        if (rel.run != null) (f.rels || []).forEach(function (r) { if (r.type === 'runangle' && r.run === rel.run) r.off = off; });
        rel.off = off;
        return { off: off };
      }
      var A = rfaqAnchor(f, rel);
      if (!A) return {};
      rel.lo = [niceRound(uv[0] - A[0], 0.5 * s), niceRound(uv[1] - A[1], 0.5 * s)];
      return {};
    }
    return basePlaceAQ ? basePlaceAQ.apply(this, arguments) : null;
  };
  // the "0°" of each running set, in the ordinate zeros' layer (a click selects the set, Delete deletes it)
  function drawRunZeros() {
    var layer = ordLayerEl(), f = UI.activeSketchFeature();
    if (!layer || !f || App.mode !== 'sketch' || !S.runningSets) return;
    var pl = UI.activePlane(), sets = S.runningSets(f), s = (UI.cam && UI.cam.scale) || 0.1;
    var tmp = runPM && UI.pmSpec && UI.pmSpec() === runPM && App.tempRun ? App.tempRun : null, list = [];
    Object.keys(sets).forEach(function (id) { list.push(sets[id]); });
    if (tmp && tmp.vertex && tmp.datum && (!tmp.run || !sets[tmp.run])) list.push({ id: '', vertex: tmp.vertex, datum: tmp.datum, off: tmp.off, members: [], temp: true });
    list.forEach(function (set) {
      var V = uvOf(f, set.vertex), Dp = uvOf(f, set.datum);
      if (!V || !Dp) return;
      var R = set.off != null && set.off > 1e-9 ? set.off : 40 * s, a = Math.atan2(Dp[1] - V[1], Dp[0] - V[0]);
      var p = scr(pl, [V[0] + (R + 14 * s) * Math.cos(a), V[1] + (R + 14 * s) * Math.sin(a)]);
      var t = document.createElementNS(SVGNS, 'text'), sel = !set.temp && App.sel && App.sel.kind === 'rel' && App.sel.runZero === set.id;
      t.setAttribute('x', p[0].toFixed(1)); t.setAttribute('y', (p[1] + (UI.DIM_CAP || 9.4) / 2).toFixed(1)); t.setAttribute('text-anchor', 'middle');
      t.setAttribute('class', 'run-zero' + (set.temp ? ' temp' : '') + (sel ? ' sel' : ''));
      t.setAttribute('data-run', set.id);
      t.textContent = '0°';
      if (!set.temp) {
        t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0');
        t.setAttribute('aria-label', 'Angular running datum of ' + set.members.length + ' dimension' + (set.members.length === 1 ? '' : 's') + ': click to select the set, Delete deletes it');
        t.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); selectRunZero(set.id); });
        t.addEventListener('click', function (ev) { ev.stopPropagation(); });
        t.addEventListener('keydown', function (ev) { if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); ev.stopPropagation(); deleteRunningSet(set.id); } });
      }
      layer.appendChild(t);
    });
  }
  if (UI.drawDims) {
    var baseDrawDimsRun = UI.drawDims;
    UI.drawDims = function () { var r = baseDrawDimsRun.apply(this, arguments); try { drawRunZeros(); } catch (e) { /* an overlay: never break the dimensions */ } return r; };
  }
  function selectRunZero(id) {
    var f = UI.activeSketchFeature(), set = f && S.runningSets(f)[id];
    if (!set) return false;
    App.sel = { kind: 'rel', index: set.members[0], runZero: id };
    App.dimsStale = true;
    if (UI.requestRender) UI.requestRender();
    UI.setStatus('Angular running set from ' + S.refName(f, set.datum) + ' (' + set.members.length + ' dimension' + (set.members.length === 1 ? '' : 's') + ') selected. Delete deletes the whole set.');
    return true;
  }
  function deleteRunningSet(id) {
    var f = UI.activeSketchFeature();
    if (!f || !S.runningSets(f)[id]) return 0;
    markDirty();
    var n = S.deleteRunningSet(f, id);
    App.sel = null; App.relHover = null;
    refresh();
    closeDimPMIfGone();
    UI.setStatus('Angular running set deleted (' + n + ' dimension' + (n === 1 ? '' : 's') + ').');
    return n;
  }
  var baseDeleteRelRun = UI.deleteRelation;
  if (baseDeleteRelRun) UI.deleteRelation = function (i) {
    var s = App.sel;
    if (s && s.kind === 'rel' && s.runZero != null && s.index === i) return deleteRunningSet(s.runZero) > 0;
    return baseDeleteRelRun.apply(this, arguments);
  };
  UI.selectRunningZero = selectRunZero;
  UI.deleteRunningSet = deleteRunningSet;
  // (the Modify box knows an angular running value is in degrees: ui-sketch.js openDimEdit, rfAV)

  // one dimension placed by a command: selected, then the Modify box (or the driven note)
  function placed(f, r, what) {
    if (!r.ok) { UI.toast(r.error); return false; }
    App.sel = { kind: 'rel', index: r.index };
    refresh();
    App.dimsStale = false;
    if (UI.drawDims) UI.drawDims();
    var rel = f.rels[r.index];
    if (r.driven) UI.setStatus(what + ' ' + rfaqLabel(f, rel) + ' added as driven: it would over-define the sketch.');
    else {
      UI.setStatus(what + ' ' + rfaqLabel(f, rel) + ' placed. Type a value and press Enter to drive the sketch.');
      if (UI.openRelDimEdit) UI.openRelDimEdit(r.index);
    }
    return true;
  }
  function hintPM(spec, text) { spec.message = text; UI.openPM(spec); var h = $('sketch-hint'); if (h) h.textContent = text; }

  // Chamfer Dimension: the chamfer line, the line next to it, then where the label goes
  function cmdChamferDim() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    UI.setTool('select');
    var st = { c: null, a: null }, rd = null;
    function hint() { return !st.c ? 'Click the chamfer line.' : !st.a ? 'Click the line next to it, the one the distance is measured along.' : 'Click where the chamfer dimension goes.'; }
    function end() { App.tempRelDim = null; App.dimsStale = true; }
    var spec = {
      title: 'Chamfer Dimension', icon: 'chamferDim', values: {}, keepSelection: true, groups: [], onOK: end, onCancel: end,
      command: {
        onSketchPoint: function (uv, mx, my) {
          var ref = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null;
          if (!st.c) {
            if (!ref || S.refKind(f, ref) !== 'line') { UI.setStatus(hint()); return; }
            st.c = ref;
          } else if (!st.a) {
            if (!ref || ref === st.c || S.refKind(f, ref) !== 'line') { UI.setStatus(hint()); return; }
            var ang = S.chamferAngle(f, [st.c, ref]);
            if (!(ang > 1e-6 && ang < 90 - 1e-6)) { UI.toast('A chamfer meets the line next to it at an angle between 0° and 90°.'); return; }
            st.a = ref;
            rd = { type: 'chamfer', refs: [st.c, st.a], cang: ang };
            rd.v = S.measure(f, 'chamfer', rd.refs);
            App.tempRelDim = Object.assign({}, rd, { lo: loAt(rd, uv) });
          } else {
            markDirty();
            var r = S.addChamferDim(f, st.c, st.a, { lo: loAt(rd, uv) });
            st.c = st.a = null; rd = null; App.tempRelDim = null;
            placed(f, r, 'Chamfer dimension');
          }
          App.dimsStale = true;
          hintPM(spec, hint());
        },
        onSketchMove: function (uv) { if (rd) { App.tempRelDim = Object.assign({}, rd, { lo: loAt(rd, uv) }); App.dimsStale = true; } }
      }
    };
    function loAt(rel, uv) { var A = rfaqAnchor(f, rel), s = (UI.cam && UI.cam.scale) || 0.01; return A && uv ? [niceRound(uv[0] - A[0], 0.5 * s), niceRound(uv[1] - A[1], 0.5 * s)] : null; }
    hintPM(spec, hint());
    return spec;
  }
  UI.cmdChamferDim = cmdChamferDim;

  // Path Length Dimension: pick the lines and arcs (Select Chain grows the pick along joined ends), ✓, then the label
  function chainFrom(f, refs) {
    var ents = f.entities, have = {}, out = refs.slice();
    refs.forEach(function (r) { have[r] = true; });
    function ends(i) { return S.pointRefs(f, i).filter(function (pr) { return /\.p[12]$/.test(pr.ref); }).map(function (pr) { return pr.pt; }); }
    var tol = 1e-6 * Math.max(1, (UI.cam && UI.cam.scale) || 1);
    for (var grew = true, guard = 0; grew && guard < 500; guard++) {
      grew = false;
      ents.forEach(function (e, i) {
        if (have[String(i)] || e.construction || !/^(line|arc)$/.test(e.t)) return;
        var mine = ends(i);
        var touches = out.some(function (r) { var p = S.parseRef(r); return p && !p.o && ends(p.e).some(function (q) { return mine.some(function (m) { return Math.hypot(m[0] - q[0], m[1] - q[1]) <= tol; }); }); });
        if (touches) { have[String(i)] = true; out.push(String(i)); grew = true; }
      });
    }
    return out;
  }
  function cmdPathLengthDim() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    var refs = selectedEntities().map(String).filter(function (r) { return S.measure(f, 'pathlength', [r]) != null; });
    UI.setTool('select');
    var stage = 'pick', made = null;
    function hint() { return stage === 'pick' ? 'Click the lines and arcs of the path (or one, then Select Chain), then ✓.' : 'Click where the path length dimension goes.'; }
    function end() { App.tempRelDim = null; App.dimsStale = true; }
    var spec = {
      title: 'Path Length', icon: 'pathLengthDim', values: {}, keepSelection: true, groups: [],
      command: {
        onSketchPoint: function (uv, mx, my) {
          if (stage === 'place') {
            var rd = { type: 'pathlength', refs: refs };
            markDirty();
            var r = S.addPathLength(f, refs, { lo: loAt(rd, uv) });
            App.tempRelDim = null; stage = 'done'; made = r;
            placed(f, r, 'Path length');
            if (UI.closePM) UI.closePM();
            return;
          }
          var ref = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null, p = ref && S.parseRef(ref);
          if (!p || p.o) { UI.setStatus(hint()); return; }
          var whole = p.s === null ? ref : S.refKind(f, ref) === 'line' ? ref : String(p.e);
          if (S.measure(f, 'pathlength', [whole]) == null) { UI.setStatus('A path runs along lines, arcs and circles.'); return; }
          var k = refs.indexOf(whole);
          if (k >= 0) refs.splice(k, 1); else refs.push(whole);
          render();
        },
        onSketchMove: function (uv) { if (stage === 'place') { var rd = { type: 'pathlength', refs: refs, v: S.measure(f, 'pathlength', refs) }; rd.lo = loAt(rd, uv); App.tempRelDim = rd; App.dimsStale = true; } }
      },
      // ✓: the path is picked; the next click places the dimension (✓ again places it at the default spot)
      onOK: function () {
        if (stage === 'place') { markDirty(); var r = S.addPathLength(f, refs, {}); stage = 'done'; made = r; end(); placed(f, r, 'Path length'); return; }
        if (stage !== 'pick') { end(); return; }
        if (!refs.length) { UI.toast('Pick the lines and arcs of the path first.'); return false; }
        stage = 'place';
        render();
        return false;
      },
      onCancel: end
    };
    function loAt(rel, uv) { var A = rfaqAnchor(f, rel), s = (UI.cam && UI.cam.scale) || 0.01; return A && uv ? [niceRound(uv[0] - A[0], 0.5 * s), niceRound(uv[1] - A[1], 0.5 * s)] : null; }
    function render() {
      var total = refs.length ? S.measure(f, 'pathlength', refs) : 0;
      spec.groups = [{ title: 'Path Definition', fields: [
        { type: 'static', label: 'Entities', value: refs.length ? refs.map(function (r) { return S.refName(f, r); }).join(', ') : '—' },
        { type: 'static', label: 'Total length', value: total != null ? fmtVal(total, null, false) + ' ' + UI.unitLabel() : '—' },
        { type: 'buttons', buttons: [{ label: 'Select Chain', onclick: function () { if (!refs.length) { UI.toast('Pick one line or arc of the chain first.'); return; } refs = chainFrom(f, refs); render(); } }, { label: 'Clear', onclick: function () { refs = []; render(); } }] }
      ] }];
      App.sel = null;
      if (UI.selectSketchEntities) UI.selectSketchEntities(refs.map(function (r) { return S.parseRef(r).e; }));
      hintPM(spec, hint());
    }
    spec.result = function () { return made; };
    render();
    return spec;
  }
  UI.cmdPathLengthDim = cmdPathLengthDim;

  // Angular Running Dimension: the 0° line (clicked near the vertex end), where the arcs go, then lines and points
  var runPM = null;
  function cmdAngularRunningDim() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    UI.setTool('select');
    var st = { line: null, vertex: null, datum: null, off: null, run: null, n: 0 };
    function hint() {
      return !st.datum ? 'Click the 0° line, near the end the angles are measured at.' : st.off == null ? 'Click where the angle arcs go.'
        : 'Click the lines and points to dimension from ' + S.refName(f, st.line || st.datum) + (st.n ? ' (' + st.n + ' so far)' : '') + '. ✓ or Esc when done.';
    }
    function end() { App.tempRun = null; App.dimsStale = true; }
    function lineEnds(ref) {
      var p = S.parseRef(ref), e = p && !p.o && f.entities[p.e];
      if (e && e.t === 'line' && p.s === null) return [ref + '.p1', ref + '.p2'];
      var L = S.refCurve(f, ref), out = [];
      // an edge of a rectangle / polygon: its corner refs
      S.pointRefs(f, p.e).forEach(function (pr) { if (L && (Math.hypot(pr.pt[0] - L.a[0], pr.pt[1] - L.a[1]) < 1e-9 || Math.hypot(pr.pt[0] - L.b[0], pr.pt[1] - L.b[1]) < 1e-9) && out.length < 2 && !/\.mid$/.test(pr.ref)) out.push(pr.ref); });
      return out.length === 2 ? out : null;
    }
    function near(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-7 * Math.max(1, Math.abs(a[0]), Math.abs(a[1])); }
    var spec = {
      title: 'Angular Running Dimension', icon: 'angRunDim', values: {}, keepSelection: true, groups: [], onOK: end, onCancel: end,
      command: {
        onSketchPoint: function (uv, mx, my) {
          var ref = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null;
          if (!st.datum) {
            if (!ref || S.refKind(f, ref) !== 'line') { UI.setStatus(hint()); return; }
            var ends = lineEnds(ref);
            if (!ends) { UI.setStatus('Pick a line as the 0° datum.'); return; }
            var pa = uvOf(f, ends[0]), pb = uvOf(f, ends[1]), first = Math.hypot(uv[0] - pa[0], uv[1] - pa[1]) <= Math.hypot(uv[0] - pb[0], uv[1] - pb[1]);
            st.line = ref; st.vertex = first ? ends[0] : ends[1]; st.datum = first ? ends[1] : ends[0];
            App.tempRun = { vertex: st.vertex, datum: st.datum, off: null };
          } else if (st.off == null) {
            var V = uvOf(f, st.vertex), s = (UI.cam && UI.cam.scale) || 0.01;
            st.off = niceRound(Math.hypot(uv[0] - V[0], uv[1] - V[1]), 0.5 * s);
            App.tempRun = { vertex: st.vertex, datum: st.datum, off: st.off };
          } else {
            if (!ref) { UI.setStatus('Nothing there: ' + hint()); return; }
            var target = null, k = S.refKind(f, ref);
            if (k === 'line') {
              var me = lineEnds(ref), Vt = uvOf(f, st.vertex);
              if (!me) { UI.setStatus('Pick a line or a point.'); return; }
              var p1 = uvOf(f, me[0]), p2 = uvOf(f, me[1]);
              // the first line: when it meets the datum line at the datum's far end, that end is the vertex
              if (!st.n && !near(p1, Vt) && !near(p2, Vt)) {
                var Dd = uvOf(f, st.datum);
                if (near(p1, Dd) || near(p2, Dd)) { var sw = st.vertex; st.vertex = st.datum; st.datum = sw; Vt = Dd; }
              }
              target = Math.hypot(p1[0] - Vt[0], p1[1] - Vt[1]) >= Math.hypot(p2[0] - Vt[0], p2[1] - Vt[1]) ? me[0] : me[1];
            } else if (k === 'point' || k === 'circle') target = ref;
            if (!target) { UI.setStatus('Pick a line or a point.'); return; }
            markDirty();
            var r = S.addRunningAngle(f, st.run ? { run: st.run, target: target } : { vertex: st.vertex, datum: st.datum, target: target, off: st.off });
            if (!r.ok) { UI.toast(r.error); return; }
            st.run = r.run; st.n++;
            App.tempRun = { vertex: st.vertex, datum: st.datum, off: st.off, run: st.run };
            refresh();
            UI.setStatus('Angular running dimension ' + rfaqLabel(f, f.rels[r.index]) + (r.driven ? ' added as driven (it would over-define the sketch).' : ' added.'));
          }
          App.dimsStale = true;
          render();
        },
        onSketchMove: function (uv) {
          if (st.datum && st.off == null && App.tempRun) { var V = uvOf(f, st.vertex); App.tempRun.off = Math.hypot(uv[0] - V[0], uv[1] - V[1]); App.dimsStale = true; }
        }
      }
    };
    function render() {
      spec.groups = [{ title: 'Angular Running', fields: [
        { type: 'static', label: '0° datum', value: st.line ? S.refName(f, st.line) : '—' },
        { type: 'static', label: 'Vertex', value: st.vertex ? S.refName(f, st.vertex) : '—' },
        { type: 'static', label: 'Dimensions', value: String(st.n) }
      ] }];
      hintPM(spec, hint());
    }
    runPM = spec;
    App.tempRun = null;
    render();
    return spec;
  }
  UI.cmdAngularRunningDim = cmdAngularRunningDim;
  UI.cmdOrdinateFree = function () { return cmdOrdinateDim('auto'); };

  // the Dimension PM of a chamfer dimension: its angle under the distance
  var baseOpenDimPMAQ = openDimensionPM;
  UI.openDimensionPM = function (sel) {
    var ok = baseOpenDimPMAQ(sel);
    var info = ok && dimInfo(sel), d = info && info.d;
    if (!d || d.type !== 'chamfer' || !dimPM || !dimPM.spec) return ok;
    var spec = dimPM.spec, f = info.f, grp = spec.groups.filter(function (g) { return g.title === 'Primary Value'; })[0];
    if (!grp || grp.fields.some(function (x) { return x.key === 'cang'; })) return ok;
    spec.values.cang = +(+S.chamferShownAngle(f, d)).toFixed(2);
    grp.fields.splice(2, 0, { type: 'number', key: 'cang', label: 'Angle', unit: '°' });
    var baseChange = spec.onChange;
    spec.onChange = function (x, key) {
      if (key !== 'cang') return baseChange.apply(this, arguments);
      var it = dimInfo({ d: d });
      if (!it) return;
      if (d.driven) { UI.setStatus('A driven dimension follows the geometry: clear Driven to change its angle.'); return; }
      markDirty();
      var r = S.setChamferAngle(it.f, it.index, +spec.values.cang);
      refresh();
      if (!r.ok) UI.setStatus('Dimension not changed: ' + r.error);
      else UI.setStatus('Chamfer angle set to ' + fmtVal(+spec.values.cang, null, true) + '°.');
    };
    UI.openPM(spec);
    return ok;
  };

  if (window.anvil) {
    // anvil.chamferDim(chamferRef, adjacentRef, opts?), anvil.pathLength([refs], opts?), anvil.runningAngle(spec),
    // anvil.runningSets(): the rfAQ dimensions on the active sketch, as their commands make them
    var withSketch = function (fn) {
      return function () {
        var f = UI.activeSketchFeature();
        if (!f) throw new Error('No active sketch.');
        markDirty();
        var r = fn.apply(null, [f].concat(Array.prototype.slice.call(arguments)));
        refresh();
        if (r && r.ok === false) throw new Error(r.error);
        return r;
      };
    };
    window.anvil.chamferDim = withSketch(function (f, c, a, o) { return S.addChamferDim(f, c, a, o); });
    window.anvil.pathLength = withSketch(function (f, refs, o) { return S.addPathLength(f, refs, o); });
    window.anvil.runningAngle = withSketch(function (f, spec) { return S.addRunningAngle(f, spec); });
    window.anvil.runningSets = function () { var f = UI.activeSketchFeature(); return f ? JSON.parse(JSON.stringify(S.runningSets(f))) : {}; };
  }

  // ------------------------------------------------------------------ lane CV: Link Values (shared values)
  // SolidWorks' right-click a dimension ▸ Link Values: the Shared Values dialog (Value, read-only; Name, typed or picked
  // from the names already in the part). Every dimension with that name (d.link, on a Smart Dimension or a distance /
  // angle relation, written by the script as a dim / rel property) has one value: editing one changes them all (in its
  // sketch at once, SketchSolver.setDim / setRelValue; in the part's other sketches when the sketch is left, below).
  // Unlink Value takes the dimension out of its name and leaves its value. Linked dimensions show ∞ before the value.
  function sketchesOf(model) { return (model && model.features || []).filter(function (g) { return g && g.type === 'sketch'; }); }
  // { name: { value, kind: 'len' | 'angle', count } } over every sketch of the part (the active one first)
  function linkNames(f) {
    var out = {}, list = sketchesOf(App.model);
    if (f && list.indexOf(f) > 0) { list.splice(list.indexOf(f), 1); list.unshift(f); }
    list.forEach(function (g) {
      [['dim', g.dims], ['rel', g.rels]].forEach(function (pr) {
        (pr[1] || []).forEach(function (d, i) {
          if (d.link == null || d.link === '') return;
          var it = { kind: pr[0], index: i }, v = S.linkItemValue(g, it);
          if (!out[d.link]) out[d.link] = { value: v, kind: pr[0] === 'rel' && d.type === 'angle' ? 'angle' : 'len', count: 0 };
          out[d.link].count++;
        });
      });
    });
    return out;
  }
  UI.sketchLinkNames = function () { return linkNames(UI.activeSketchFeature()); };
  function dimItems(f) {
    var out = [];
    function add(s) { if (s && (s.kind === 'dim' || s.kind === 'rel') && !out.some(function (o) { return o.kind === s.kind && o.index === s.index; })) out.push({ kind: s.kind, index: s.index }); }
    if (UI.selection) UI.selection().forEach(add);
    add(App.sel);
    return out.filter(function (it) { var d = it.kind === 'rel' ? (f.rels || [])[it.index] : (f.dims || [])[it.index]; return d && (it.kind === 'dim' || (S.TYPES[d.type] && S.TYPES[d.type].dim)); });
  }
  // UI.linkValues(items | null, name) -> { ok, value } | { ok: false, error }: one undo step
  UI.linkValues = function (items, name) {
    var f = UI.activeSketchFeature();
    if (App.mode !== 'sketch' || !f) return { ok: false, error: 'Open a sketch first.' };
    items = items || dimItems(f);
    var nm = String(name == null ? '' : name).trim(), names = linkNames(f), here = S.linkedItems(f, nm).length > 0;
    var other = !here && names[nm] ? names[nm].value : null;   // the name's value in another sketch of the part
    markDirty();
    var r = S.linkValues(f, items, nm, other);
    refresh();
    if (!r.ok) { UI.toast('Link Values: ' + r.error); return r; }
    UI.setStatus(items.length + ' dimension' + (items.length === 1 ? '' : 's') + ' linked to "' + nm + '" (' + dimLabelText({}, r.value, names[nm] && names[nm].kind === 'angle' ? 'angle' : 'len') + ').');
    return r;
  };
  UI.unlinkValue = function (item) {
    var f = UI.activeSketchFeature();
    if (App.mode !== 'sketch' || !f) return { ok: false, error: 'Open a sketch first.' };
    var items = item ? [item] : dimItems(f), n = 0;
    markDirty();
    items.forEach(function (it) { if (S.unlinkValue(f, it).ok) n++; });
    refresh();
    UI.setStatus(n ? n + ' dimension' + (n === 1 ? '' : 's') + ' unlinked.' : 'No linked dimension selected.');
    return { ok: n > 0 };
  };
  // the Shared Values dialog
  UI.cmdLinkValues = function (items) {
    var f = UI.activeSketchFeature();
    if (App.mode !== 'sketch' || !f) { UI.toast('Open a sketch first.'); return; }
    items = items || dimItems(f);
    if (!items.length) { UI.toast('Select a dimension first, then Link Values.'); return; }
    var first = items[0], d0 = first.kind === 'rel' ? f.rels[first.index] : f.dims[first.index], names = linkNames(f);
    var kind0 = first.kind === 'rel' && d0.type === 'angle' ? 'angle' : 'len', v0 = S.linkItemValue(f, first);
    var opts = Object.keys(names).filter(function (n) { return names[n].kind === kind0; }).sort();
    var defName = d0.link || (opts[0] || (function () { var k = 1; while (names['Value' + k]) k++; return 'Value' + k; })());
    var body = '<div id="lv-dialog" class="lv-dialog"><p style="margin:0 0 8px">Every dimension linked to one name has the same value; changing one changes them all.</p>' +
      '<label style="display:block;margin:4px 0">Value: <input id="lv-value" type="text" readonly value="' + esc(dimLabelText({}, v0, kind0)) + '" style="width:9em"></label>' +
      '<label style="display:block;margin:4px 0">Name: <input id="lv-name" type="text" list="lv-names" value="' + esc(defName) + '" style="width:12em"></label>' +
      '<datalist id="lv-names">' + opts.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      '<div id="lv-msg" style="color:#c0392b;min-height:1.2em"></div></div>';
    function ok() {
      var nm = $('lv-name') ? $('lv-name').value : defName;
      var r = UI.linkValues(items, nm);
      if (!r.ok) { if ($('lv-msg')) $('lv-msg').textContent = r.error; return; }
      UI.closeModal();
    }
    UI.showModal({ title: 'Shared Values', body: body, buttons: [{ label: 'OK', primary: true, id: 'lv-ok', action: ok }, { label: 'Cancel', id: 'lv-cancel', action: UI.closeModal }] });
    setTimeout(function () { var inp = $('lv-name'); if (inp) { try { inp.focus(); inp.select(); } catch (e) { /* */ } inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); ok(); } else if (ev.key === 'Escape') UI.closeModal(); ev.stopPropagation(); }); } }, 0);
  };
  // the dimension's shortcut menu (right-click its value): Link Values… / Unlink Value, Properties…, Delete
  function dimMenu(ev, it) {
    var f = UI.activeSketchFeature();
    if (!f || it.temp || it.auto) return false;
    var sel = it.rel != null ? { kind: 'rel', index: it.rel } : { kind: 'dim', index: it.index };
    var d = sel.kind === 'rel' ? (f.rels || [])[sel.index] : (f.dims || [])[sel.index];
    if (!d) return false;
    var inSel = dimItems(f).some(function (o) { return o.kind === sel.kind && o.index === sel.index; });
    if (!inSel) { App.sel = sel; App.sel2 = null; if (UI.setSelection) UI.setSelection([sel]); UI.updateSketches(); }
    var items = [];
    items.push({ label: 'Link Values…', icon: 'dim', action: function () { UI.cmdLinkValues(); } });
    if (d.link != null && d.link !== '') items.push({ label: 'Unlink Value', icon: 'dim', action: function () { UI.unlinkValue(sel); } });
    items.push({ sep: true });
    if (UI.openDimensionPM) items.push({ label: 'Properties…', icon: 'props', action: function () { UI.openDimensionPM(sel); } });
    items.push({ label: 'Delete', key: 'Del', icon: 'cancel', action: function () { App.sel = sel; UI.deleteSelection(); } });
    UI.showMenu(ev.clientX, ev.clientY, items);
    return true;
  }
  UI.sketchDimMenu = function (index, isRel, ev) {   // test / script hook: the menu of placed dimension index (or relation index)
    var r = $('dim-layer') && $('dim-layer').getBoundingClientRect();
    return dimMenu(ev || { clientX: r ? r.left + 100 : 100, clientY: r ? r.top + 100 : 100 }, isRel ? { rel: index } : { index: index });
  };
  var dimLayerEl = $('dim-layer');
  if (dimLayerEl) {
    dimLayerEl.addEventListener('mousedown', function (ev) {
      if (ev.button !== 2 || App.mode !== 'sketch') return;
      var t = ev.target;
      while (t && t !== dimLayerEl && !t._d) t = t.parentNode;
      if (!t || !t._d) return;
      if (dimMenu(ev, t._d)) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
    dimLayerEl.addEventListener('contextmenu', function (ev) { if (App.mode === 'sketch') ev.preventDefault(); });
  }
  // leaving a sketch: its linked values go to the dimensions of the same names in the part's other sketches
  UI.sketchExitHooks = UI.sketchExitHooks || [];
  UI.sketchExitHooks.push(function (f) { try { pushLinks(f, linkBase && linkBase.f === f ? linkBase.vals : null); } catch (e) { /* never block leaving the sketch */ } linkBase = null; });
  // only the shared values this sketch changed (or newly linked) while open go out: a sketch merely opened and left
  // never pushes an older value over one set in another sketch
  var linkBase = null;
  UI.sketchEnterHooks = UI.sketchEnterHooks || [];
  UI.sketchEnterHooks.push(function (f) { linkBase = { f: f, vals: linkVals(f) }; });
  function linkVals(f) {
    var vals = {};
    [['dim', f.dims], ['rel', f.rels]].forEach(function (pr) {
      (pr[1] || []).forEach(function (d, i) { if (d.link != null && d.link !== '' && vals[d.link] == null) { var v = S.linkItemValue(f, { kind: pr[0], index: i }); if (v != null) vals[d.link] = v; } });
    });
    return vals;
  }
  function pushLinks(f, base) {
    if (!f) return 0;
    var vals = linkVals(f), n = 0;
    if (base) Object.keys(vals).forEach(function (nm) { if (base[nm] != null && Math.abs(base[nm] - vals[nm]) <= 1e-12 * Math.max(1, Math.abs(vals[nm]))) delete vals[nm]; });
    if (!Object.keys(vals).length) return 0;
    sketchesOf(App.model).forEach(function (g) {
      if (g === f) return;
      Object.keys(vals).forEach(function (nm) {
        var its = S.linkedItems(g, nm);
        if (!its.length) return;
        var v = vals[nm], cur = S.linkItemValue(g, its[0]);
        if (cur != null && Math.abs(cur - v) <= 1e-12 * Math.max(1, Math.abs(v))) return;
        var r = its[0].kind === 'rel' ? S.setRelValue(g, its[0].index, v) : S.setDim(g, its[0].index, v);
        if (r.ok) n++;
        else UI.toast('Linked value "' + nm + '" could not be applied in ' + (g.name || 'a sketch') + ': ' + r.error);
      });
    });
    return n;
  }
  UI.pushLinkedValues = pushLinks;
})();

// ------------------------------------------------------------------ rfAV: Instant2D (Sketch tab toggle, as SolidWorks)
// With Instant2D on, hovering a sketch dimension (its value or its lines) shows a ball handle at its moving arrow end:
// a linear dimension's second arrow, a radius / diameter's arrow on the curve, an angle's second arrow. Dragging the
// ball shows a ruler along the dimension (an arc for an angle) and changes the value live; the value snaps to the
// ruler's ticks, finer the nearer the pointer is to the ruler (never finer than the document's precision: .001 in,
// 0.01 mm, 0.01°). Releasing makes one undo step; Esc during the drag puts the value back. A driven dimension (and the
// grey driven values of View ▸ Sketch Dimensions) shows no handle. The live solve starts from the sketch as it was
// when the drag began on every step (as the Modify box's preview does), so a refused value never leaves a trace.
// Instant3D makes no dimension dots in a sketch (ui-select.js): in SolidWorks Instant3D acts on the part only.
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.App) return;
  var App = UI.App, K = UI.K, S = window.SketchSolver, SVGNS = 'http://www.w3.org/2000/svg';
  var viewport = UI.$ && UI.$('viewport');
  if (!viewport || !S || !K) return;
  var items = [], hover = null, drag = null, layer = null, lastUp = 0;
  function on() { return App.view.instant2D !== false; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function scr(pl, uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
  function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); return L < 1e-9 ? null : [dx / L, dy / L]; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }
  function inch() { return (UI.unitLabel ? UI.unitLabel() : 'mm') === 'in'; }
  function keyOf(it) { return UI.dimKey ? UI.dimKey(it) : String(it.index); }
  function el(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function layerEl() {
    if (layer && layer.parentNode) return layer;
    layer = el('svg', { id: 'i2d-layer', 'aria-hidden': 'true' });
    viewport.appendChild(layer);
    return layer;
  }
  // may the handles show now? (the Select tool in an open sketch, no command, no PropertyManager collecting picks)
  function idle() {
    return on() && App.mode === 'sketch' && !App.sketchDragging && (!App.tool || App.tool === 'select') && !App.command &&
      !(UI.pmCollectsSelection && UI.pmCollectsSelection()) && !(UI.isDimEditOpen && UI.isDimEditOpen()) && !!UI.activeSketchFeature();
  }
  // an item of the last dimension drawing that can take a handle
  function eligible(it, f) {
    if (!it || it.temp || it.auto || !it.sc || !it.d || it.d.driven || it.state === 'driven') return false;
    if (it.rel != null) { var rel = f.rels && f.rels[it.rel]; return !!rel && (rel.type === 'distance' || rel.type === 'angle') && !rel.driven; }
    return it.index != null;
  }
  // The handle of a drawn dimension: where the ball sits, its ruler, and how a pointer position reads as a value (in
  // the units the dimension shows; scale = shown / stored, a diameter shown as its radius: 0.5).
  function handleFor(it) {
    var f = UI.activeSketchFeature(), pl = UI.activePlane();
    if (!f || !pl || !eligible(it, f)) return null;
    var sc = it.sc, h = { key: keyOf(it), it: it, sketchId: f.id, prec: inch() ? 0.001 : 0.01 };
    if (it.rel != null && f.rels[it.rel].type === 'angle') {
      var rel = f.rels[it.rel], A = S.refCurve(f, rel.refs[0]), B = S.refCurve(f, rel.refs[1]);
      if (!A || !B || !A.a || !B.a || !sc.arrows || sc.arrows.length < 2) return null;
      var d1 = [A.b[0] - A.a[0], A.b[1] - A.a[1]], d2 = [B.b[0] - B.a[0], B.b[1] - B.a[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-12) return null;
      var t = ((B.a[0] - A.a[0]) * d2[1] - (B.a[1] - A.a[1]) * d2[0]) / den, X = scr(pl, [A.a[0] + d1[0] * t, A.a[1] + d1[1] * t]);
      var t0 = sc.arrows[0].tip, t1 = sc.arrows[1].tip, R = Math.hypot(t1[0] - X[0], t1[1] - X[1]);
      var th0 = Math.atan2(t0[1] - X[1], t0[0] - X[0]), sw = wrapPi(Math.atan2(t1[1] - X[1], t1[0] - X[0]) - th0), sg = sw < 0 ? -1 : 1;
      if (!(R > 4)) return null;
      h.kind = 'angle'; h.angle = true; h.prec = 0.01; h.value = rel.v; h.scale = 1; h.min = 0; h.max = 180;
      h.ppu = R * Math.PI / 180;
      h.at = function (v, off) { var a = th0 + sg * v * Math.PI / 180, r = R + (off || 0); return [X[0] + Math.cos(a) * r, X[1] + Math.sin(a) * r]; };
      h.normal = function (v) { var a = th0 + sg * v * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; };
      h.raw = function (m) { var a = sg * wrapPi(Math.atan2(m[1] - X[1], m[0] - X[0]) - th0) * 180 / Math.PI; return a < -90 ? a + 360 : a; };
      h.dist = function (m) { return Math.abs(Math.hypot(m[0] - X[0], m[1] - X[1]) - R); };
      h.set = function (g, v) { return S.setRelValue(g, it.rel, v); };
      h.ball = t1;
      return h;
    }
    var O, u, nn, ppu, val, scale = 1;
    if (it.rel == null) {
      var e = f.entities[it.d.e], g = e && K.dimGeometry(e, it.d);
      if (!g) return null;
      scale = UI.dimShowScale ? UI.dimShowScale(it.d) || 1 : 1;
      val = g.value * scale;
      if (g.type === 'radial') {
        // lane DS: a curvature-control dimension (g.curv: its arrow on the spline point, r 0) measures from the true
        // centre of curvature: the ball on the arrow, the ruler out from the centre through the point (dragging away
        // from the centre flattens the curve)
        var C = scr(pl, g.curv && g.centre ? g.centre : g.C), tip = sc.arrows && sc.arrows[0] && sc.arrows[0].tip, k = g.prefix === '⌀' ? 2 : 1;
        var rr = g.curv ? g.value : g.r;
        if (!tip || !(rr > 0)) return null;
        u = unit(C, tip);
        if (!u) return null;
        O = C; ppu = Math.hypot(tip[0] - C[0], tip[1] - C[1]) / (rr * k * scale); nn = [-u[1], u[0]];
        h.kind = 'radial';
      }
    } else val = f.rels[it.rel].v;
    if (!h.kind) {
      var ln = sc.lin;
      if (!ln || !(val > 0)) return null;
      O = ln.a; u = ln.u; ppu = ln.L / val;
      var ext = sc.lines && sc.lines[0] && unit(sc.lines[0][0], sc.lines[0][1]);
      nn = ext && Math.abs(ext[0] * u[1] - ext[1] * u[0]) > 0.5 ? ext : [-u[1], u[0]];
      h.kind = 'linear';
    }
    if (!(ppu > 0) || !isFinite(ppu)) return null;
    h.value = val; h.scale = scale; h.ppu = ppu; h.min = 0; h.max = Infinity;
    h.at = function (v, off) { return [O[0] + u[0] * v * ppu + nn[0] * (off || 0), O[1] + u[1] * v * ppu + nn[1] * (off || 0)]; };
    h.normal = function () { return nn; };
    h.raw = function (m) { return ((m[0] - O[0]) * u[0] + (m[1] - O[1]) * u[1]) / ppu; };
    h.dist = function (m) { return Math.abs((m[0] - O[0]) * nn[0] + (m[1] - O[1]) * nn[1]); };
    h.set = function (g2, v) { return it.rel != null ? S.setRelValue(g2, it.rel, v) : S.setDim(g2, it.index, v / scale); };
    h.ball = h.at(val);
    return h;
  }
  // the ruler step for a pointer distPx from the ruler: ticks about 5 px apart on it, 14 px near it, 40 px away
  function stepFor(h, distPx) {
    var minPx = distPx < 14 ? 5 : distPx < 45 ? 14 : 40;
    var st = window.BoxSelect && BoxSelect.rulerStep ? BoxSelect.rulerStep(h.ppu, minPx) : 1;
    if (h.angle && st > 5) st = st > 15 ? 45 : 15;   // whole turns of the protractor: 5°, 15°, 45°
    return Math.max(st, h.prec);
  }
  function snapValue(h, raw, step) {
    var v = +(Math.round(raw / step) * step).toPrecision(12);
    if (!(v > h.min)) v = step;
    if (v > h.max) v = h.max;
    return v;
  }
  function fmt(h, v) { return h.angle ? (Math.round(v * 100) / 100) + '°' : (UI.fmtDim ? UI.fmtDim(v) : String(v)); }

  // which dimension is under the pointer: its value, within 4 px of its lines, or 8 px of an arrow; the ball keeps
  // the hover
  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  }
  function itemByKey(k) { for (var i = 0; i < items.length; i++) if (items[i].sc && !items[i].temp && keyOf(items[i]) === k) return items[i]; return null; }
  function itemAt(m) {
    var f = UI.activeSketchFeature();
    if (!f) return null;
    if (hover && hover.ball && Math.hypot(m[0] - hover.ball[0], m[1] - hover.ball[1]) <= 11) { var still = itemByKey(hover.key); if (still) return still; }
    // lane BV (shop-user audit): a diameter's or radius's arrow sits on the circle itself, and a .266 hole at a working
    // zoom is 9 px across: hovering its edge grabbed the Instant2D ball, and the click meant to select the hole only
    // said "dimension unchanged". The arrow counts when nothing of the sketch is under the pointer (the value and the
    // dimension's own lines keep the hover, as in SolidWorks)
    var onEntity = UI.pickEntity ? !!UI.pickEntity(m[0], m[1]) : false;
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (!eligible(it, f)) continue;
      var b = it.sc.box;
      if (b && m[0] >= b[0] - 3 && m[0] <= b[2] + 3 && m[1] >= b[1] - 3 && m[1] <= b[3] + 3) return it;
      var ls = it.sc.lines || [];
      for (var k = 0; k < ls.length; k++) if (segDist(m, ls[k][0], ls[k][1]) <= 4) return it;
      if (onEntity) continue;
      var ar = it.sc.arrows || [];
      for (var j = 0; j < ar.length; j++) if (Math.hypot(m[0] - ar[j].tip[0], m[1] - ar[j].tip[1]) <= 8) return it;
    }
    return null;
  }

  // ---- drawing: the ball (hovered or dragged) and, while dragging, the ruler with its ticks
  function draw() {
    var L = layerEl();
    while (L.firstChild) L.removeChild(L.firstChild);
    if (drag) { drawRuler(L, drag.h, drag.v, drag.step, drag.onRuler); ball(L, drag.h.at(drag.v), drag.h, true); return; }
    if (!hover || !idle()) { hover = null; return; }
    var it = itemByKey(hover.key), h = it && handleFor(it);
    if (!h) { hover = null; return; }
    hover = h;
    ball(L, h.ball, h, false);
  }
  function ball(L, p, h, active) {
    var g = el('g', { 'class': 'i2d-handle' + (active ? ' active' : ''), 'data-key': h.key, 'data-kind': h.kind }, L);
    el('circle', { 'class': 'i2d-grip', cx: p[0].toFixed(2), cy: p[1].toFixed(2), r: 10 }, g);
    el('circle', { 'class': 'i2d-ball', cx: p[0].toFixed(2), cy: p[1].toFixed(2), r: 5 }, g);
    var t = el('title', {}, g);
    t.textContent = 'Instant2D: drag to change the dimension; onto the ruler for finer steps';
    g.addEventListener('mousedown', function (ev) { if (ev.button === 0 && !drag) startDrag(h, ev); });
    g.addEventListener('click', function (ev) { ev.stopPropagation(); });
    g.addEventListener('dblclick', function (ev) { ev.stopPropagation(); });
  }
  function drawRuler(L, h, v, step, onRuler) {
    var g = el('g', { 'class': 'i2d-rulerset' }, L);
    var hi = h.angle ? Math.min(h.max, 180) : Math.max(v, h.value) * 1.4 + 10 * step, n = Math.floor(hi / step + 1e-9);
    var kv = Math.round(v / step), k0 = Math.max(0, kv - 120), k1 = Math.min(n, kv + 120), pts = [];
    for (var k = k0; k <= k1; k++) pts.push(h.at(k * step));
    if (pts.length < 2) return;
    el('polyline', { 'class': 'i2d-ruler' + (onRuler ? ' snapping' : ''), points: pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') }, g);
    var major = h.angle && step >= 5 ? (step === 5 ? 3 : 2) : 5;
    for (var j = k0; j <= k1; j++) {
      var p = h.at(j * step), nn = h.normal(j * step), isMajor = j % major === 0, len = isMajor ? 9 : 5, hit = j === kv;
      el('line', { 'class': 'i2d-tick' + (isMajor ? ' major' : '') + (hit ? ' hit' : ''), x1: p[0].toFixed(1), y1: p[1].toFixed(1), x2: (p[0] + nn[0] * len).toFixed(1), y2: (p[1] + nn[1] * len).toFixed(1) }, g);
      if (isMajor && j && Math.abs(j - kv) <= 3 * major) {
        var tx = el('text', { x: (p[0] + nn[0] * 18).toFixed(1), y: (p[1] + nn[1] * 18 + 3.5).toFixed(1), 'text-anchor': 'middle' }, g);
        tx.textContent = fmt(h, j * step);
      }
    }
  }

  // ---- the drag: one undo step, the sketch re-solved from its start state on every new value
  function pos(ev) { var r = viewport.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function startDrag(h, ev) {
    ev.stopPropagation(); ev.preventDefault();
    var f = UI.activeSketchFeature();
    if (!f || f.id !== h.sketchId) return;
    drag = { h: h, f: f, v0: h.value, v: h.value, good: h.value, step: stepFor(h, 0), onRuler: true, pushed: false, frame: 0,
      snap: clone(f.entities), relV: h.it.rel != null ? f.rels[h.it.rel].v : null };
    hover = null;
    viewport.classList.add('tool-grab');
    UI.setStatus('Instant2D: drag the value; the nearer the ruler, the finer the steps. Esc puts it back.');
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
    window.addEventListener('keydown', key, true);
    draw();
  }
  function restore(d) {
    d.f.entities = clone(d.snap);
    if (d.h.it.rel != null && d.f.rels && d.f.rels[d.h.it.rel]) d.f.rels[d.h.it.rel].v = d.relV;
    if (S.updateDriven) S.updateDriven(d.f);
  }
  function apply() {
    var d = drag;
    if (!d) return;
    d.frame = 0;
    if (UI.activeSketchFeature() !== d.f || Math.abs(d.v - d.good) < 1e-12) { draw(); return; }
    if (!d.pushed) { d.pushed = true; if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; d.undo = true; } }
    restore(d);
    var r = Math.abs(d.v - d.v0) < 1e-12 ? { ok: true } : d.h.set(d.f, d.v);
    if (r && r.ok) d.good = d.v;
    else {
      restore(d);
      if (Math.abs(d.good - d.v0) > 1e-12) d.h.set(d.f, d.good);
      UI.setStatus('Instant2D: ' + fmt(d.h, d.v) + ' cannot be reached' + (r && r.error ? ' (' + r.error + ')' : '') + '.');
    }
    App.gridStale = true;
    UI.updateSketches();
  }
  function move(ev) {
    var d = drag;
    if (!d) return;
    ev.stopPropagation();
    var m = pos(ev), dist = d.h.dist(m), step = stepFor(d.h, dist), v = snapValue(d.h, d.h.raw(m), step);
    var redraw = step !== d.step || (dist < 45) !== d.onRuler;
    d.step = step; d.onRuler = dist < 45;
    if (Math.abs(v - d.v) > 1e-12) {
      d.v = v;
      UI.setStatus('Instant2D: ' + fmt(d.h, v) + (d.h.angle ? '' : ' ' + UI.unitLabel()) + ' (step ' + fmt(d.h, step) + '; release to set it)');
      if (!d.frame) d.frame = requestAnimationFrame(apply);
    } else if (redraw) draw();
  }
  function finish(cancel) {
    var d = drag;
    if (!d) return;
    window.removeEventListener('mousemove', move, true);
    window.removeEventListener('mouseup', up, true);
    window.removeEventListener('keydown', key, true);
    viewport.classList.remove('tool-grab');
    if (d.frame) { cancelAnimationFrame(d.frame); if (!cancel) apply(); d.frame = 0; }
    drag = null;
    var changed = Math.abs(d.good - d.v0) > 1e-12;
    if (cancel || !changed) {
      if (d.pushed) { restore(d); App.gridStale = true; UI.updateSketches(); }
      if (d.undo) { App.undo.pop(); App.sketchDirty = false; }
      UI.setStatus(cancel ? 'Instant2D: dimension put back.' : 'Instant2D: dimension unchanged.');
    } else {
      UI.updateSketches(); UI.refreshTree();
      if (UI.refreshDimensionPM) UI.refreshDimensionPM();
      UI.setStatus('Dimension set to ' + fmt(d.h, d.good) + (d.h.angle ? '' : ' ' + UI.unitLabel()) + ' (Instant2D).');
    }
    App.dimsStale = true;
    lastUp = performance.now();
    draw();
  }
  function up(ev) { ev.stopPropagation(); finish(false); }
  function key(ev) { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(true); } }
  // the click that ends a drag is not a click on the sketch (it would clear the selection)
  viewport.addEventListener('click', function (ev) { if (performance.now() - lastUp < 250) ev.stopPropagation(); }, true);

  viewport.addEventListener('mousemove', function (ev) {
    if (drag) return;
    if (!idle()) { if (hover) { hover = null; draw(); } return; }
    var it = itemAt(pos(ev)), k = it ? keyOf(it) : null;
    if ((hover ? hover.key : null) === k) return;
    hover = k ? { key: k } : null;
    draw();
  });
  viewport.addEventListener('mouseleave', function () { if (hover && !drag) { hover = null; draw(); } });

  if (UI.drawDims) {
    var baseDrawDimsI2D = UI.drawDims;
    UI.drawDims = function () {
      var r = baseDrawDimsI2D.apply(this, arguments);
      items = Array.isArray(r) ? r : [];
      try { if (hover || drag || (layer && layer.firstChild)) draw(); } catch (e) { /* an overlay: never break the dimensions */ }
      return r;
    };
  }
  function setOn(v) {
    App.view.instant2D = v == null ? !on() : !!v;
    hover = null;
    if (layer) draw();
    if (UI.refreshRibbon) UI.refreshRibbon();
    UI.setStatus('Instant2D ' + (on() ? 'on: hover a dimension and drag its ball to change it.' : 'off.'));
    return on();
  }
  UI.instant2DOn = on;
  UI.toggleInstant2D = setOn;
  // test / script hooks: hover the dimension drawn with key (UI.dimKey: 'd0', 'r3') and read its handle; the screen
  // point that reads value v with the pointer off px from the ruler; the drag's state; the step off px from the ruler
  function summary(h) { return h ? { key: h.key, kind: h.kind, value: h.value, ball: [+h.ball[0].toFixed(2), +h.ball[1].toFixed(2)], ppu: h.ppu } : null; }
  UI.instant2DHandle = function (k) {
    if (k != null) { hover = { key: k }; draw(); }
    return summary(hover && hover.ball ? hover : null);
  };
  UI.instant2DPoint = function (v, off) { var h = drag ? drag.h : hover && hover.ball ? hover : null; return h ? h.at(v, off) : null; };
  UI.instant2DDrag = function () { return drag ? { value: drag.v, good: drag.good, step: drag.step, onRuler: drag.onRuler } : null; };
  UI.instant2DStepAt = function (off) { var h = drag ? drag.h : hover && hover.ball ? hover : null; return h ? stepFor(h, off) : null; };
  if (window.anvil) window.anvil.instant2D = function (v) { if (v != null) setOn(v); return on(); };
})();
