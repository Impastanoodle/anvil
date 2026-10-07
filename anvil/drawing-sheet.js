// drawing-sheet.js — sheets and the drawing document for the drawing engine (Drawing, see drawing.js): sheet formats
// and standard scales, newDrawing / addView, the per-mesh projection cache with its lazy mode (LAZY: views still to be
// worked out in drawing-worker.js) and the section jobs, projected / section / detail views placed beside their parent
// or fitted onto the sheet, the title block with its $PRPSHEET / $PRP links, Standard 3 View and its layout, moving
// and deleting views, automatic model dimensions (overall sizes, diameters, radii, straight and arc slot callouts, the
// part's sketch ordinate sets) and dimension text, and assembly
// drawings: part info, the Bill of Materials rows, columns and box, Auto Balloon and balloon placement. Loads after
// drawing-views.js; autoInsert, numText and dimLabel (drawing-annotations.js) and arcEnds (drawing-render.js) are late
// bound.
(function (D, _) {
  'use strict';
  var K = Kernel, V = K.vec;
  var orientation = D.orientation, frameOf = D.frameOf, isOrthoFrame = D.isOrthoFrame, projectedFrame = D.projectedFrame, sectionFrame = D.sectionFrame;
  var projectView = D.projectView, sectionOf = D.sectionOf, clipProjection = D.clipProjection;
  var ORTHO = _.ORTHO, DIRS = _.DIRS, frameKey = _.frameKey, sectionKey = _.sectionKey, capLoops = _.capLoops;

  // ------------------------------------------------------------------ sheets, scales, the drawing document
  var MM = 25.4;
  // [width, height] in mm, landscape
  var FORMATS = {
    'A4': [297, 210], 'A3': [420, 297], 'A2': [594, 420], 'A1': [841, 594],
    'ANSI A': [11 * MM, 8.5 * MM], 'ANSI B': [17 * MM, 11 * MM], 'ANSI C': [22 * MM, 17 * MM], 'ANSI D': [34 * MM, 22 * MM]
  };
  var SCALES = [[10, 1], [5, 1], [4, 1], [2, 1], [1, 1], [1, 2], [1, 4], [1, 5], [1, 10], [1, 20], [1, 25], [1, 50], [1, 100], [1, 200]];
  function scaleValue(s) { return s[0] / s[1]; }
  function scaleText(s) { return s[0] + ':' + s[1]; }
  // The scale as SolidWorks writes it under a view label: 'SCALE 2 : 1' (spaces round the colon).
  function scaleLabel(s) { return 'SCALE ' + s[0] + ' : ' + s[1]; }
  function parseScale(txt) {
    var m = /^\s*(\d+(?:\.\d+)?)\s*[:\/]\s*(\d+(?:\.\d+)?)\s*$/.exec(String(txt));
    return m && +m[1] > 0 && +m[2] > 0 ? [+m[1], +m[2]] : null;
  }
  function paperK(units) { return units === 'in' ? 1 / MM : 1; }   // paper mm -> paper units
  function sheetSize(doc, units) {
    // doc.sheet.paper = [w, h] in mm: a custom size (the 1:1 views DXF sizes its sheet to the part, ui-commands.js)
    if (doc.sheet.paper) return [doc.sheet.paper[0] * paperK(units), doc.sheet.paper[1] * paperK(units)];
    var f = FORMATS[doc.sheet.format] || FORMATS.A3, k = paperK(units);
    return [f[0] * k, f[1] * k];
  }
  function todayISO() {
    var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  // newDrawing(model, opts) -> a drawing document { name, sheet, views, date, autoDims, nextView } (no views yet)
  function newDrawing(model, opts) {
    opts = opts || {};
    var n = (model.drawings || []).length + 1, asm = model.type === 'assembly';
    return {
      bom: asm ? { show: opts.bom !== false, anchor: opts.bomAnchor || 'top-right' } : null, bomRows: asm ? bomRows(model).length : 0,
      name: opts.name || 'Draw' + n,
      sheet: { name: 'Sheet1', format: opts.format || (model.units === 'in' ? 'ANSI B' : 'A3'), scale: opts.scale || [1, 1], autoScale: !opts.scale, projection: opts.projection || 'third' },
      units: model.units === 'in' ? 'in' : 'mm', views: [], date: opts.date || todayISO(), autoDims: asm ? opts.autoDims === true : opts.autoDims !== false, suppressed: [], nextView: 1, layout: 'auto',
      options: opts.options ? JSON.parse(JSON.stringify(opts.options)) : {}
    };
  }
  function addView(doc, orient, props) {
    var v = { id: doc.nextView++, name: 'Drawing View' + (doc.nextView - 1), orient: orient, x: 0, y: 0, display: ORTHO[orient] ? 'hlv' : 'hlr', scale: null, parent: null, align: null, role: null, dims: [] };
    Object.keys(props || {}).forEach(function (k) { v[k] = props[k]; });
    doc.views.push(v);
    return v;
  }
  function viewScale(doc, view) { return scaleValue(view.scale || doc.sheet.scale || [1, 1]); }
  // Views are recomputed on every render; the projection of a mesh in one orientation is cached on the mesh
  // (meshes are immutable once built, so the cache dies with it).
  // While a lazy compute runs (compute(..., { lazy: true }), r12/drawui12) a projection of the main mesh that is not
  // cached yet is not worked out here: it is listed in LAZY.missing and the view gets an empty placeholder with the
  // view's true bounds (its extents), so the sheet shows at once, laid out where the views will be, while the UI has
  // the missing views worked out in drawing-worker.js.
  _.LAZY = null;
  function projectionKey(F, display, tangent) { return frameKey(F) + '|' + display + (tangent ? '|' + tangent : ''); }
  function cachedProjection(mesh, orient, display, tangent) {
    var F = frameOf(orient), c = mesh._drawingProj || (mesh._drawingProj = {}), key = projectionKey(F, display, tangent);
    if (c[key]) return c[key];
    if (_.LAZY && _.LAZY.mesh === mesh) {
      if (!_.LAZY.keys[key]) { _.LAZY.keys[key] = 1; _.LAZY.missing.push({ key: key, frame: { name: F.name, e: F.e, u: F.u, v: F.v }, display: display, tangent: tangent || null }); }
      var ex = extentsOf(mesh, F), ph = emptyProjection(F, ex);
      ph.bounds = { umin: ex.umin, umax: ex.umax, vmin: ex.vmin, vmax: ex.vmax };
      ph.pending = true;
      return ph;
    }
    return (c[key] = projectView(mesh, F, { display: display, tangent: tangent }));
  }
  // putProjection(mesh, key, proj): a projection worked out elsewhere (drawing-worker.js) goes into the mesh's cache
  function putProjection(mesh, key, proj) { (mesh._drawingProj || (mesh._drawingProj = {}))[key] = proj; }
  // Section views off the main thread (r13/drawings13), as round 12 did for projections: sectionJob does what a section
  // view needs from the part — the CSG cut (sectionOf), the cut part's hidden-line projection and its cap loops — in
  // drawing-worker.js, and putSection files the answer in the same caches the main thread reads, so the next compute
  // finds it. { section: { mesh, caps, area, e, w }, proj, loops }; the cut mesh goes without its _drawing caches.
  function sectionJob(mesh, sec, frame, display, tangent) {
    var S = sectionOf(mesh, sec.e, sec.w), F = frameOf(frame), proj = cachedProjection(S.mesh, F, display, tangent), loops = capLoops(S, F), sm = {};
    Object.keys(S.mesh).forEach(function (q) { if (q.indexOf('_drawing') !== 0) sm[q] = S.mesh[q]; });
    return { section: { mesh: S.mesh === mesh ? null : sm, caps: S.caps, area: S.area, e: S.e, w: S.w }, proj: proj, loops: loops };
  }
  function putSection(mesh, sec, frame, display, tangent, r) {
    var c = mesh._drawingSections || (mesh._drawingSections = {}), key = sectionKey(sec.e, sec.w), S = c[key];
    if (!S) { S = c[key] = r.section; if (!S.mesh) S.mesh = mesh; }
    var F = frameOf(frame);
    if (S.mesh !== mesh) putProjection(S.mesh, projectionKey(F, display, tangent), r.proj);
    (S._capLoops || (S._capLoops = {}))[frameKey(F)] = r.loops;
  }
  // viewFrame(doc, v): the frame a view looks along. Section views derive theirs from the parent and the cutting
  // line, detail views use the parent's, projected views keep the frame they were made with.
  function viewFrame(doc, v, depth) {
    var par = v.parent != null ? findView(doc, v.parent) : null;
    if ((depth || 0) < 20 && par && (v.kind === 'section' || v.kind === 'detail')) {
      var P = viewFrame(doc, par, (depth || 0) + 1);
      return v.kind === 'section' ? sectionFrame(P, v.section.axis, v.section.sign) : P;
    }
    return v.frame ? frameOf({ e: v.frame.e, u: v.frame.u, v: v.frame.v, name: v.orient }) : orientation(v.orient);
  }
  // A–Z without I, O and Q (ASME Y14.3), the first letter no section or detail view of the drawing uses yet
  function nextLabel(doc) {
    var used = {};
    doc.views.forEach(function (v) { if (v.label) used[v.label] = 1; });
    var abc = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    for (var i = 0; i < abc.length; i++) if (!used[abc[i]]) return abc[i];
    for (var n = 2; ; n++) for (var j = 0; j < abc.length; j++) if (!used[abc[j] + n]) return abc[j] + n;
  }
  function viewExtents(doc, mesh, v) {
    if (v.kind === 'flat') { var fe = flatExtents(mesh); if (fe) return fe; }
    return extentsOf(mesh, viewFrame(doc, v));
  }
  // the extents of the flat pattern (its blank's bounding box), or null when there is none to unfold
  function flatExtents(mesh) {
    var fd = D.flatData(mesh);
    if (!fd || fd.error) return null;
    var b = fd.bbox;
    return { umin: b.umin, umax: b.umax, vmin: b.vmin, vmax: b.vmax, w: b.umax - b.umin, h: b.vmax - b.vmin, cu: (b.umin + b.umax) / 2, cv: (b.vmin + b.vmax) / 2 };
  }
  // addFlatView(doc, mesh, { model, build, x, y, scale, fit }) -> the view: the sheet-metal part's flat pattern (Model
  // View ▸ Flat pattern), seen from the +n side of the Base Flange's sketch plane, with its bend lines and bend notes.
  // Throws on a part that is not sheet metal. Without x / y it goes to the nearest clear spot on the sheet.
  function addFlatView(doc, mesh, opts) {
    opts = opts || {};
    var fd = D.flatData(mesh, opts.model, opts.build);
    if (!fd) throw new Error('A flat-pattern view needs the part (its model and build).');
    if (fd.error) throw new Error(fd.error);
    var S = sheetSize(doc, doc.units), sc = opts.scale ? (Array.isArray(opts.scale) ? opts.scale : parseScale(opts.scale)) : null;
    var v = addView(doc, 'Flat pattern', { kind: 'flat', frame: { e: fd.frame.e.slice(), u: fd.frame.u.slice(), v: fd.frame.v.slice() }, display: 'hlv', scale: sc,
      x: opts.x != null ? +opts.x : S[0] / 2, y: opts.y != null ? +opts.y : S[1] / 2 });
    if (opts.bendNotes === 'notes' || opts.bendNotes === 'table' || opts.bendNotes === 'none') v.bendNotes = opts.bendNotes;
    if (opts.x == null && opts.y == null && mesh) (opts.fit ? fitOnSheet : clearSpot)(doc, mesh, v, null);
    delete v.offSheet;
    doc.layout = 'manual';
    return v;
  }
  // addProjectedView(doc, mesh, parentId, dir, { x, y, fit }): a view projected up / down / left / right from a parent,
  // aligned with it (same scale; dragging it slides along the projection direction only, the parent drags it along).
  // Without x / y it is placed one gap beyond the parent.
  function addProjectedView(doc, mesh, parentId, dir, opts) {
    opts = opts || {};
    var par = findView(doc, parentId);
    if (!par) throw new Error('No drawing view ' + parentId);
    if (par.kind === 'detail') throw new Error('A view cannot be projected from a detail view');
    if (par.kind === 'flat') throw new Error('A view cannot be projected from a flat-pattern view');
    var F = projectedFrame(viewFrame(doc, par), dir, doc.sheet.projection), vert = !DIRS[dir][0];
    var pos = besidePos(doc, mesh, par, F, dir);
    var v = addView(doc, F.name, { kind: 'projected', frame: { e: F.e, u: F.u, v: F.v }, parent: par.id, align: vert ? 'x' : 'y', dir: dir,
      scale: par.scale ? par.scale.slice() : null, display: isOrthoFrame(F) ? 'hlv' : 'hlr', x: pos[0], y: pos[1] });
    if (opts.x != null && !vert) v.x = opts.x;
    if (opts.y != null && vert) v.y = opts.y;
    if ((vert ? opts.y : opts.x) == null && mesh) (opts.fit ? fitOnSheet : clearSpot)(doc, mesh, v, vert ? 'y' : 'x');
    doc.layout = 'manual';
    return v;
  }
  // where a view in frame F goes when it is placed `dir` of its parent: the parent's centre line, one gap out
  function besidePos(doc, mesh, par, F, dir) {
    var s = viewScale(doc, par), g = GAP * paperK(doc.units), pe = viewExtents(doc, mesh, par), ce = extentsOf(mesh, F), d = DIRS[dir];
    if (!d[0]) return [par.x, par.y + d[1] * ((pe.h + ce.h) * s / 2 + g)];
    return [par.x + d[0] * ((pe.w + ce.w) * s / 2 + g), par.y];
  }
  // The paper a view takes (an estimate from its frame's extents, scale and label; enough to keep views apart):
  // { x0, y0, x1, y1 } in paper units
  function viewPaperBox(doc, mesh, v) {
    var k = paperK(doc.units), s = viewScale(doc, v), hw, hh, lab = 0;
    var left = 0;
    if (v.kind === 'detail' && v.detail) { hw = hh = v.detail.r * s; lab = 14 * k; }
    else { var ex = viewExtents(doc, mesh, v); hw = ex.w * s / 2; hh = ex.h * s / 2; if (v.kind === 'section' || v.scale) lab = 14 * k; }
    if (v.kind === 'flat') {
      // a flat view carries its overall dimensions (left and below), the FLAT SIZE note and the Bend Table under it
      var o = D.docOptions(doc), fd = D.flatData(mesh), nb = fd && fd.bends ? fd.bends.length : 0;
      lab = (o.flatDims ? 16 : 4) * k + ((v.flatSize != null ? v.flatSize : o.flatSizeNote) ? 9 * k : 0) + ((v.bendNotes || o.bendNotes) === 'table' && nb ? (nb + 1) * 6 * k + 4 * k : 0);
      if (o.flatDims) left = 16 * k;
    }
    return { x0: v.x - hw - left, x1: v.x + hw, y0: v.y - hh - lab, y1: v.y + hh };
  }
  // clearSpot(doc, mesh, v, free): moves a view just made by a script (no position given) to the nearest place on the
  // sheet where it covers no other view, the title block or the Bill of Materials, keeping a gap round it: an aligned
  // view slides along its alignment (outward first, then to the parent's other side), a detail view goes to the
  // nearest clear spot in any direction. When nothing on the sheet is clear it goes beyond the farthest view on its
  // side (r3/drawings3: section views added through the API used to land on the Right view).
  // Returns true when the spot is on the sheet (false: nothing on the sheet was clear, it went beside it).
  function clearSpot(doc, mesh, v, free) {
    var k = paperK(doc.units), S = sheetSize(doc, doc.units), g = GAP * k, sep = g * 0.6, b1 = BORDER * k;
    var obs = doc.views.filter(function (o) { return o !== v; }).map(function (o) { return viewPaperBox(doc, mesh, o); });
    obs.push({ x0: S[0] - b1 - TB_W * k, y0: b1, x1: S[0] - b1, y1: b1 + TB_H * k });
    if (doc.bom && doc.bom.show !== false && doc.bomRows) { var bb = bomBox(doc, doc.units, doc.bomRows); obs.push({ x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1 }); }
    var me = viewPaperBox(doc, mesh, v), ox = v.x, oy = v.y;
    function boxAt(x, y) { return { x0: me.x0 + x - ox, x1: me.x1 + x - ox, y0: me.y0 + y - oy, y1: me.y1 + y - oy }; }
    function clear(b) { return obs.every(function (o) { return b.x1 + sep <= o.x0 || o.x1 + sep <= b.x0 || b.y1 + sep <= o.y0 || o.y1 + sep <= b.y0; }); }
    function onSheet(b) { return b.x0 >= b1 + g / 4 && b.y0 >= b1 + g / 4 && b.x1 <= S[0] - b1 - g / 4 && b.y1 <= S[1] - b1 - g / 4; }
    if (clear(boxAt(ox, oy)) && onSheet(boxAt(ox, oy))) return true;
    var step = 2 * k, cands = [], par = v.parent != null ? findView(doc, v.parent) : null;
    if (free === 'x' || free === 'y') {
      var c0 = free === 'x' ? ox : oy, pc = par ? (free === 'x' ? par.x : par.y) : c0, dir = c0 >= pc ? 1 : -1, span = Math.max(S[0], S[1]) * 2;
      for (var t = 0; t <= span; t += step) cands.push(c0 + dir * t);
      var c1 = 2 * pc - c0;   // the parent's other side
      for (var t2 = 0; t2 <= span; t2 += step) cands.push(c1 - dir * t2);
      var pick = null, far = null;
      cands.forEach(function (c) {
        if (pick != null) return;
        var b = free === 'x' ? boxAt(c, oy) : boxAt(ox, c);
        if (!clear(b)) return;
        if (onSheet(b)) pick = c; else if (far == null && (c - pc) * dir > 0) far = c;
      });
      var cc = pick != null ? pick : far != null ? far : c0;
      if (free === 'x') v.x = cc; else v.y = cc;
      return pick != null;
    }
    // on the sheet if it fits anywhere, else the nearest clear spot beside it
    var best = null, bd = Infinity, pass, st2 = step * 2;
    for (pass = 0; pass < 2 && !best; pass++) {
      var lo = pass ? -S[0] / 2 : b1, hx = pass ? S[0] * 1.5 : S[0] - b1, hy = pass ? S[1] * 1.5 : S[1] - b1, ly = pass ? -S[1] / 2 : b1;
      for (var y = ly; y <= hy; y += st2) for (var x = lo; x <= hx; x += st2) {
        var bx = boxAt(x, y), d = Math.hypot(x - ox, y - oy);
        if (d < bd && (pass || onSheet(bx)) && clear(bx)) { bd = d; best = [x, y]; }
      }
    }
    if (best) { v.x = best[0]; v.y = best[1]; }
    return !!best && pass === 1;   // true: clear and on the sheet
  }
  // fitOnSheet(doc, mesh, v, free): where a section / projected / detail view added by the app's script API (opts.fit)
  // goes on a full sheet (r7/drawings7: projected and detail views too; a detail view has no alignment and never
  // shrinks to its parent's scale or below). Along its alignment at its own scale first; then the nearest free area of the sheet (alignment broken,
  // same scale); then the next smaller standard scales (down to a quarter), aligned and then anywhere. When nothing
  // fits it goes beside the sheet, aligned and clear of every view, marked v.offSheet (the UI warns and drops the
  // mark). It never overlaps a view.
  function fitOnSheet(doc, mesh, v, free) {
    var x0 = v.x, y0 = v.y, sc0 = v.scale, al0 = v.align, s0 = viewScale(doc, v);
    var par = v.kind === 'detail' && v.parent != null ? findView(doc, v.parent) : null, lo = par ? viewScale(doc, par) : 0;
    var smaller = SCALES.filter(function (s) { var q = scaleValue(s); return q < s0 - 1e-9 && q >= s0 / 4 - 1e-9 && q > lo + 1e-9; });
    function at(sc, align) { v.x = x0; v.y = y0; v.scale = sc; v.align = align; return clearSpot(doc, mesh, v, align ? free : null); }
    var tries = al0 ? [[sc0, al0], [sc0, null]] : [[sc0, null]];
    smaller.forEach(function (s) { if (al0) tries.push([s.slice(), al0]); tries.push([s.slice(), null]); });
    for (var i = 0; i < tries.length; i++) if (at(tries[i][0], tries[i][1])) return true;
    at(sc0, al0);
    v.offSheet = true;
    return false;
  }
  // addSectionView(doc, mesh, parentId, { axis: 'h' | 'v', at, sign, x, y, label, fit }): a full section on a cutting
  // line through the parent, horizontal at v = at or vertical at u = at (model units in the parent's view frame).
  // The viewer stands on the side sign points to (sign × the parent's v or u) and looks at the cut, so the arrows
  // point the other way. The view is aligned with the parent, placed on the viewer's side in third-angle projection
  // and on the arrows' side in first angle; cut faces are hatched ANSI31 and the view is labelled SECTION A-A.
  function addSectionView(doc, mesh, parentId, opts) {
    opts = opts || {};
    var par = findView(doc, parentId);
    if (!par) throw new Error('No drawing view ' + parentId);
    if (par.kind === 'detail') throw new Error('A section cannot be cut in a detail view');
    if (par.kind === 'flat') throw new Error('A section cannot be cut in a flat-pattern view');
    var axis = opts.axis === 'v' ? 'v' : 'h', sign = opts.sign < 0 ? -1 : 1, label = opts.label || nextLabel(doc);
    var F = sectionFrame(viewFrame(doc, par), axis, sign);
    var place = (axis === 'h' ? (sign > 0 ? 'up' : 'down') : (sign > 0 ? 'right' : 'left'));
    if (doc.sheet.projection === 'first') place = { up: 'down', down: 'up', left: 'right', right: 'left' }[place];
    var pos = besidePos(doc, mesh, par, F, place);
    var v = addView(doc, F.name, { kind: 'section', name: 'Section View ' + label + '-' + label, label: label, parent: par.id, align: axis === 'h' ? 'x' : 'y',
      section: { axis: axis, at: +opts.at || 0, sign: sign }, scale: par.scale ? par.scale.slice() : null, display: 'hlr', x: pos[0], y: pos[1] });
    if (opts.x != null && axis === 'v') v.x = opts.x;
    if (opts.y != null && axis === 'h') v.y = opts.y;
    if ((axis === 'h' ? opts.y : opts.x) == null && mesh) (opts.fit ? fitOnSheet : clearSpot)(doc, mesh, v, axis === 'h' ? 'y' : 'x');
    doc.layout = 'manual';
    return v;
  }
  // detail scale: twice the parent's, as a standard scale when there is one
  function detailScale(ps) {
    var want = 2 * scaleValue(ps);
    for (var i = 0; i < SCALES.length; i++) if (Math.abs(scaleValue(SCALES[i]) - want) < 1e-9) return SCALES[i].slice();
    return want >= 1 ? [Math.round(want * 1000) / 1000, 1] : [1, Math.round(1000 / want) / 1000];
  }
  // addDetailView(doc, mesh, parentId, { c: [u, v], r, scale, x, y, label, fit }): the parent inside the circle (c, r)
  // (model units in the parent's frame), enlarged to its own scale (default twice the parent's) and labelled
  // DETAIL B / SCALE 4 : 1; the circle and the letter are drawn on the parent. Not aligned: it goes anywhere.
  function addDetailView(doc, mesh, parentId, opts) {
    opts = opts || {};
    var par = findView(doc, parentId);
    if (!par) throw new Error('No drawing view ' + parentId);
    if (par.kind === 'detail') throw new Error('Detail views of detail views are not supported');
    if (par.kind === 'flat') throw new Error('Detail views of flat-pattern views are not supported');
    if (!(opts.r > 0)) throw new Error('A detail circle needs a radius');
    var label = opts.label || nextLabel(doc), sc = opts.scale ? (Array.isArray(opts.scale) ? opts.scale : parseScale(opts.scale)) : detailScale(par.scale || doc.sheet.scale || [1, 1]);
    var s = scaleValue(sc), g = GAP * paperK(doc.units), pe = viewExtents(doc, mesh, par), ps = viewScale(doc, par);
    var v = addView(doc, par.orient, { kind: 'detail', name: 'Detail View ' + label + ' (' + scaleText(sc) + ')', label: label, parent: par.id, align: null,
      detail: { c: [+opts.c[0], +opts.c[1]], r: +opts.r }, scale: sc, display: par.display,
      x: opts.x != null ? opts.x : par.x + pe.w * ps / 2 + g + opts.r * s, y: opts.y != null ? opts.y : par.y });
    if (opts.x == null && opts.y == null && mesh) (opts.fit ? fitOnSheet : clearSpot)(doc, mesh, v, null);
    if (v.scale !== sc) v.name = 'Detail View ' + label + ' (' + scaleText(v.scale) + ')';
    doc.layout = 'manual';
    return v;
  }
  // Title block and border sizes in paper mm (converted by paperK for inch sheets); HATCH is the ANSI31 line spacing
  var BORDER = 10, TB_W = 180, TB_H = 40, GAP = 22, HATCH = 2.5;
  // Title block (180 × 40 mm, three rows): each field is a text with links, SolidWorks style — $PRPSHEET:"name" is the
  // custom property of the model shown on the sheet (Materials.sheetProperty: File ▸ Properties, Configuration
  // Specific first; Material and Mass fall back to the part's material and mass), $PRP:"name" the drawing's own
  // (SW-File Name, SW-Sheet Name, SW-Sheet Scale, SW-Units, SW-Date, SW-Projection, SW-Sheet, or doc.properties[name]).
  // doc.titleBlock = { key: text } overrides a field; `fallback` fills an empty TITLE / PART NO. with the model name.
  var TB_FIELDS = [
    { key: 'title', label: 'TITLE', row: 0, x0: 0, x1: 105, big: true, upper: true, link: '$PRPSHEET:"Description"', fallback: true },
    { key: 'partNo', label: 'PART NO.', row: 0, x0: 105, x1: 150, link: '$PRPSHEET:"Part Number"', fallback: true },
    { key: 'rev', label: 'REV', row: 0, x0: 150, x1: 180, link: '$PRPSHEET:"Revision"' },
    { key: 'dwgNo', label: 'DWG. NO.', row: 1, x0: 0, x1: 45, link: '$PRP:"SW-File Name"' },
    { key: 'material', label: 'MATERIAL', row: 1, x0: 45, x1: 105, link: '$PRPSHEET:"Material"' },
    { key: 'scale', label: 'SCALE', row: 1, x0: 105, x1: 140, link: '$PRP:"SW-Sheet Scale"' },
    { key: 'units', label: 'UNITS', row: 1, x0: 140, x1: 180, link: '$PRP:"SW-Units"' },
    { key: 'date', label: 'DATE', row: 2, x0: 0, x1: 45, link: '$PRP:"SW-Date"' },
    { key: 'mass', label: 'MASS', row: 2, x0: 45, x1: 105, link: '$PRPSHEET:"Mass"' },
    { key: 'projection', label: 'PROJECTION', row: 2, x0: 105, x1: 140, link: '$PRP:"SW-Projection"' },
    { key: 'sheet', label: 'SHEET', row: 2, x0: 140, x1: 180, link: '$PRP:"SW-Sheet"' }
  ];
  function drawingProp(doc, name, units) {
    switch (String(name).trim().toLowerCase()) {
      case 'sw-file name': return doc.name;
      case 'sw-sheet name': return doc.sheet.name;
      case 'sw-sheet scale': return scaleText(doc.sheet.scale || [1, 1]);
      case 'sw-units': return String(units).toUpperCase();
      case 'sw-date': return doc.date;
      case 'sw-projection': return doc.sheet.projection === 'first' ? 'FIRST ANGLE' : 'THIRD ANGLE';
      case 'sw-sheet': return '1 OF 1';
    }
    var own = doc.properties || {};
    for (var k in own) if (k.toLowerCase() === String(name).trim().toLowerCase()) return String(own[k]);
    return '';
  }
  // titleText(text, doc, model, ctx?) -> the text with its $PRPSHEET / $PRP links replaced
  function titleText(t, doc, model, ctx) {
    ctx = ctx || {};
    var units = model && model.units === 'in' ? 'in' : 'mm', mctx = null;
    return String(t == null ? '' : t).replace(/\$PRPSHEET:\s*"([^"]*)"|\$PRP:\s*"([^"]*)"/g, function (all, sheetName, prpName) {
      if (sheetName != null) {
        if (typeof Materials === 'undefined' || !model) return '';
        mctx = mctx || ctx.props || Materials.context(model, { build: ctx.build, mesh: ctx.mesh });
        try { return Materials.sheetProperty(model, sheetName, mctx); } catch (e) { return ''; }
      }
      return drawingProp(doc, prpName, units);
    });
  }
  // titleFieldAt(sheetSize, units, p) -> { field (a TB_FIELDS entry), rect: { x0, y0, x1, y1 } } of the title block cell
  // under the paper point p, or null (r5/drawings5)
  function titleFieldAt(S, units, p) {
    var k = paperK(units), b1 = BORDER * k, tw = TB_W * k, th = TB_H * k, tx0 = S[0] - b1 - tw, ty0 = b1, row = th / 3, hit = null;
    TB_FIELDS.forEach(function (f) {
      var r = { x0: tx0 + f.x0 * k, x1: tx0 + f.x1 * k, y1: ty0 + th - f.row * row, y0: ty0 + th - (f.row + 1) * row };
      if (!hit && p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1) hit = { field: f, rect: r };
    });
    return hit;
  }
  // titleBlock(doc, model, ctx?) -> { key: evaluated text } for every TB_FIELDS entry
  function titleBlock(doc, model, ctx) {
    ctx = ctx || {};
    var out = {}, own = doc.titleBlock || {};
    if (typeof Materials !== 'undefined' && model && !ctx.props) {
      var asm = model.type === 'assembly', b = ctx.build && !!ctx.build.assembly === asm ? ctx.build : null;
      ctx = { build: b, mesh: ctx.mesh, props: Materials.context(model, { build: b, mesh: asm ? null : ctx.mesh }) };
      // the Mass field's mass properties are worked out once per build and material (r3/drawings3: every redraw of the
      // sheet used to rebuild the body mesh and integrate it again, 3-4 ms of each drag frame)
      var src = b || ctx.mesh;
      if (src && typeof src === 'object') {
        var mk = JSON.stringify([model.units, model.density, model.material, model.materialName, model.bodyMaterials, model.type]);
        var memo = src._drawingMass, base = ctx.props.mass;
        ctx.props.mass = function () {
          if (memo && memo.key === mk) return memo.mp;
          var mp = base();
          try { Object.defineProperty(src, '_drawingMass', { value: { key: mk, mp: mp }, configurable: true, writable: true, enumerable: false }); } catch (e) { }
          memo = src._drawingMass;
          return mp;
        };
      }
    }
    TB_FIELDS.forEach(function (f) {
      var v = titleText(own[f.key] != null ? own[f.key] : f.link, doc, model, ctx).trim();
      if (!v && f.fallback) v = String(model && model.name || 'Part');
      out[f.key] = f.upper ? v.toUpperCase() : v;
    });
    return out;
  }
  // viewContent(doc, v, mesh, parentContent) -> { frame, proj, center: [u, v] (the model point at the view's x, y),
  // caps (section faces to hatch), clip (a detail circle), section }. Section and detail views are centred on the
  // whole part's extents in their frame (not on what is left of it), so they stay aligned with their parent.
  function viewContent(doc, v, mesh, parentContent) {
    var par = v.parent != null ? findView(doc, v.parent) : null, s = viewScale(doc, v);
    if (v.kind === 'flat') {
      // the flat pattern, unfolded by the kernel (worked out here, not in the worker: it is a few ms of CSG)
      var fd = D.flatData(mesh) || { error: 'No flat pattern' }, fpr = D.flatProjection(fd), FF = viewFrame(doc, v), fb = fpr.bounds;
      return { frame: FF, proj: fpr, center: [(fb.umin + fb.umax) / 2, (fb.vmin + fb.vmax) / 2], caps: [], flat: fd, scale: s };
    }
    if (v.kind === 'section' && par && parentContent) {
      var P = parentContent(par).frame, sc = v.section, F = sectionFrame(P, sc.axis, sc.sign), full = extentsOf(mesh, F);
      // (lazy compute: a cut not worked out yet is a job for drawing-worker.js, and a placeholder the size of the
      // whole part in this frame meanwhile, r13/drawings13)
      if (_.LAZY && _.LAZY.mesh === mesh) {
        var S0 = mesh._drawingSections && mesh._drawingSections[sectionKey(F.e, sc.sign * sc.at)], pk = projectionKey(F, v.display, v.tangent);
        if (!S0 || (S0.mesh !== mesh && S0.mesh.faces.length && !(S0.mesh._drawingProj && S0.mesh._drawingProj[pk])) || !(S0._capLoops && S0._capLoops[frameKey(F)])) {
          var jk = 'S|' + sectionKey(F.e, sc.sign * sc.at) + '|' + pk;
          if (!_.LAZY.keys[jk]) { _.LAZY.keys[jk] = 1; _.LAZY.missing.push({ key: jk, section: { e: F.e.slice(), w: sc.sign * sc.at }, frame: { name: F.name, e: F.e, u: F.u, v: F.v }, display: v.display, tangent: v.tangent || null }); }
          var ph = emptyProjection(F, full);
          ph.bounds = { umin: full.umin, umax: full.umax, vmin: full.vmin, vmax: full.vmax };
          ph.pending = true;
          return { frame: F, proj: ph, center: [full.cu, full.cv], caps: [], section: null, scale: s };
        }
      }
      var S = sectionOf(mesh, F.e, sc.sign * sc.at), pr = cachedProjection(S.mesh, F, v.display, v.tangent);
      if (!S.mesh.faces.length) pr = emptyProjection(F, full);
      return { frame: F, proj: pr, center: [full.cu, full.cv], caps: capLoops(S, F), section: S, scale: s };
    }
    if (v.kind === 'detail' && par && parentContent) {
      var pc = parentContent(par), dt = v.detail;
      var dpr = clipProjection(pc.proj, dt.c, dt.r);
      if (pc.proj.pending) dpr.pending = true;   // (its parent still being worked out, r13/drawings13)
      return { frame: pc.frame, proj: dpr, center: dt.c.slice(), caps: pc.caps, clip: { c: dt.c.slice(), r: dt.r }, scale: s };
    }
    var F2 = viewFrame(doc, v), pr2 = cachedProjection(mesh, F2, v.display, v.tangent), b = pr2.bounds;
    return { frame: F2, proj: pr2, center: [(b.umin + b.umax) / 2, (b.vmin + b.vmax) / 2], caps: [], scale: s };
  }
  function emptyProjection(F, ext) {
    return { orient: F.name, u: F.u, v: F.v, e: F.e, lines: { visible: [], hidden: [] }, circles: { visible: [], hidden: [] }, arcs: { visible: [], hidden: [] }, ellipses: { visible: [], hidden: [] }, all: [], circlesAll: [], arcsAll: [],
      bounds: { umin: ext.cu, umax: ext.cu, vmin: ext.cv, vmax: ext.cv }, stats: { visibleLines: 0, hiddenLines: 0, visibleCircles: 0, hiddenCircles: 0 } };
  }
  function usableArea(doc, units) {
    var S = sheetSize(doc, units), k = paperK(units);
    return { x0: BORDER * k, x1: S[0] - BORDER * k, y0: (BORDER + TB_H) * k, y1: S[1] - BORDER * k };
  }
  // Standard 3 View (+ Isometric): replaces the doc's views with Front / Top / Right placed third- or first-angle and
  // an isometric in the free corner; picks the largest standard sheet scale that fits when doc.sheet.scale is null.
  function standard3View(doc, mesh, units, opts) {
    opts = opts || {};
    doc.views = []; doc.nextView = 1;
    var front = addView(doc, 'Front', { role: 'front' });
    var top = addView(doc, 'Top', { role: 'top', parent: front.id, align: 'x' });
    var right = addView(doc, 'Right', { role: 'right', parent: front.id, align: 'y' });
    if (opts.iso !== false) addView(doc, 'Isometric', { role: 'iso' });
    doc.layout = 'auto';
    layout(doc, mesh, units);
    // Document Properties ▸ Auto insert on view creation (centre marks, centrelines)
    if (opts.autoInsert !== false) D.autoInsert(doc, mesh);
    return doc;
  }
  function extentsOf(mesh, orient) {
    var O = frameOf(orient), P = mesh.positions64 || mesh.positions;
    var b = { umin: Infinity, umax: -Infinity, vmin: Infinity, vmax: -Infinity };
    for (var i = 0; i < P.length; i += 3) {
      var p = [P[i], P[i + 1], P[i + 2]], u = V.dot(p, O.u), v = V.dot(p, O.v);
      if (u < b.umin) b.umin = u; if (u > b.umax) b.umax = u; if (v < b.vmin) b.vmin = v; if (v > b.vmax) b.vmax = v;
    }
    if (!P.length) b = { umin: 0, umax: 0, vmin: 0, vmax: 0 };
    b.w = b.umax - b.umin; b.h = b.vmax - b.vmin; b.cu = (b.umin + b.umax) / 2; b.cv = (b.vmin + b.vmax) / 2;
    return b;
  }
  // layout(doc, mesh, units): positions the standard views (roles front / top / right / iso) and, when the sheet
  // scale is automatic, chooses it. A view's (x, y) is where the centre of its projected bounding box sits on the sheet.
  function layout(doc, mesh, units) {
    var k = paperK(units), A = usableArea(doc, units), g = GAP * k;
    var byRole = {}, before = {};
    doc.views.forEach(function (v) { before[v.id] = [v.x, v.y]; });
    doc.views.forEach(function (v) { if (v.role) byRole[v.role] = v; });
    var F = extentsOf(mesh, 'Front'), T = extentsOf(mesh, 'Top'), R = extentsOf(mesh, 'Right');
    var Wm = F.w, Hm = F.h, Dm = T.h;
    var availW = A.x1 - A.x0, availH = A.y1 - A.y0;
    // an assembly drawing's Bill of Materials is a keep-out box: the Front / Top / Right block must not cover it
    var bomK = doc.bom && doc.bom.show !== false && doc.bomRows ? bomBox(doc, units, doc.bomRows) : null;
    function hitsBom(b) { return bomK && b.x1 > bomK.x0 - g / 2 && b.x0 < bomK.x1 + g / 2 && b.y1 > bomK.y0 - g / 2 && b.y0 < bomK.y1 + g / 2; }
    // place(sv, packed): view centres for scale sv, the block centred in the usable area (or packed into the corner
    // away from the BOM); null when a view would cover the BOM
    function place(sv, packed) {
      var W = Wm * sv, H = Hm * sv, D = Dm * sv, blockW = W + g + D, blockH = H + g + D, P = {};
      var left = A.x0 + Math.max(g, (availW - blockW) / 2), bottom = A.y0 + Math.max(g, (availH - blockH) / 2);
      if (packed) {
        left = bomK && /left/.test(bomK.anchor) ? A.x1 - g - blockW : A.x0 + g;
        bottom = bomK && /bottom/.test(bomK.anchor) ? A.y1 - g - blockH : A.y0 + g;
      }
      if (doc.sheet.projection === 'first') {
        // first angle: Top below Front, Right to the left of Front
        P.rx = left + D / 2; P.fx = left + D + g + W / 2; P.tx = P.fx;
        P.ty = bottom + D / 2; P.fy = bottom + D + g + H / 2; P.ry = P.fy;
        P.isoBox = { x0: A.x0, x1: left + D + g / 2, y0: A.y0, y1: bottom + D + g / 2 };
      } else {
        P.fx = left + W / 2; P.tx = P.fx; P.rx = left + W + g + D / 2;
        P.fy = bottom + H / 2; P.ry = P.fy; P.ty = bottom + H + g + D / 2;
        P.isoBox = { x0: left + W + g / 2, x1: A.x1, y0: bottom + H + g / 2, y1: A.y1 };
      }
      var boxes = [[P.fx, P.fy, W, H], [P.tx, P.ty, W, D], [P.rx, P.ry, D, H]].map(function (q) { return { x0: q[0] - q[2] / 2, x1: q[0] + q[2] / 2, y0: q[1] - q[3] / 2, y1: q[1] + q[3] / 2 }; });
      if (boxes.some(hitsBom)) return null;
      return P;
    }
    function fits(sv) { return (Wm + Dm) * sv + 3 * g <= availW && (Hm + Dm) * sv + 3 * g <= availH && (place(sv) || place(sv, true)); }
    if (doc.sheet.autoScale || !doc.sheet.scale) {
      var s = SCALES[SCALES.length - 1];
      for (var i = 0; i < SCALES.length; i++) if (fits(scaleValue(SCALES[i]))) { s = SCALES[i]; break; }
      doc.sheet.scale = s;
    }
    var sv2 = scaleValue(doc.sheet.scale);
    var PL = place(sv2) || place(sv2, true) || (function () { var q = bomK; bomK = null; var r = place(sv2); bomK = q; return r; })();
    var fx = PL.fx, fy = PL.fy, tx = PL.tx, ty = PL.ty, rx = PL.rx, ry = PL.ry, isoBox = PL.isoBox;
    if (byRole.front) { byRole.front.x = fx; byRole.front.y = fy; }
    if (byRole.top) { byRole.top.x = tx; byRole.top.y = ty; }
    if (byRole.right) { byRole.right.x = rx; byRole.right.y = ry; }
    if (byRole.iso) {
      // a Bill of Materials in the isometric's corner takes its room (the iso then drops in scale if it must)
      if (bomK) {
        var ov = bomK.x1 > isoBox.x0 && bomK.x0 < isoBox.x1 && bomK.y1 > isoBox.y0 && bomK.y0 < isoBox.y1;
        if (ov) { if (/top/.test(bomK.anchor)) isoBox.y1 = Math.min(isoBox.y1, bomK.y0 - g / 2); else isoBox.y0 = Math.max(isoBox.y0, bomK.y1 + g / 2); }
      }
      var I = extentsOf(mesh, byRole.iso.orient), bw = isoBox.x1 - isoBox.x0 - g / 2, bh = isoBox.y1 - isoBox.y0 - g / 2;
      byRole.iso.scale = null;
      if (I.w * sv2 > bw || I.h * sv2 > bh) {
        for (var j = 0; j < SCALES.length; j++) { var q = scaleValue(SCALES[j]); if (q < sv2 && I.w * q <= bw && I.h * q <= bh) { byRole.iso.scale = SCALES[j]; break; } }
        if (!byRole.iso.scale) byRole.iso.scale = SCALES[SCALES.length - 1];
      }
      byRole.iso.x = (isoBox.x0 + isoBox.x1) / 2; byRole.iso.y = (isoBox.y0 + isoBox.y1) / 2;
    }
    void R;
    // projected and section views of the standard views move with their parent and stay aligned with it
    function follow(p, depth) {
      doc.views.forEach(function (c) {
        if (c.parent !== p.id || !c.align || c.role || depth > 20) return;
        c.x += p.x - before[p.id][0]; c.y += p.y - before[p.id][1];
        if (c.align === 'x') c.x = p.x; else c.y = p.y;
        follow(c, depth + 1);
      });
    }
    doc.views.forEach(function (v) { if (v.role) follow(v, 0); });
    return doc;
  }
  // moveView(doc, id, x, y): a parent view drags its projected children along; a projected view slides along its
  // alignment only (Top stays above Front, Right stays level with it).
  function moveView(doc, id, x, y) {
    var v = findView(doc, id);
    if (!v) return;
    if (v.parent != null && findView(doc, v.parent)) { if (v.align === 'x') x = v.x; else if (v.align === 'y') y = v.y; }
    var dx = x - v.x, dy = y - v.y;
    v.x = x; v.y = y;
    shiftAligned(doc, v.id, dx, dy, 0);
    doc.layout = 'manual';
  }
  // aligned children (projected and section views) follow their parent, and their own aligned children follow them;
  // detail views stay where they are
  function shiftAligned(doc, id, dx, dy, depth) {
    if (depth > 20) return;
    doc.views.forEach(function (c) { if (c.parent === id && c.align) { c.x += dx; c.y += dy; shiftAligned(doc, c.id, dx, dy, depth + 1); } });
  }
  // deleteView(doc, id): removes a view with the section and detail views cut from it (they cannot exist without
  // it); projected views keep their frame and become ordinary views
  function deleteView(doc, id) {
    var gone = {}; gone[id] = 1;
    for (var changed = true; changed;) {
      changed = false;
      doc.views.forEach(function (v) { if (!gone[v.id] && gone[v.parent] && (v.kind === 'section' || v.kind === 'detail')) { gone[v.id] = 1; changed = true; } });
    }
    doc.views = doc.views.filter(function (v) { return !gone[v.id]; });
    doc.views.forEach(function (v) { if (gone[v.parent]) { v.parent = null; v.align = null; } });
    return Object.keys(gone).length;
  }
  function findView(doc, id) { for (var i = 0; i < doc.views.length; i++) if (doc.views[i].id === id) return doc.views[i]; return null; }

  // ------------------------------------------------------------------ dimensions
  // fmtDim(x, units): a dimension value as the drawing's dimension standard writes it. Inches follow ANSI Y14.5
  // decimal-inch practice: a fixed number of places (3 by default, trailing zeros kept) and no zero before the point
  // (.030, 4.000, Ø.281), or with Document Properties ▸ Units ▸ Fractions the nearest 1/denom (2 1/4, 3/16).
  // Millimetres keep a leading zero and drop trailing zeros (up to 2 places: 0.76, 2, 120.5) unless a precision is
  // set. The style (precision, fractions) is the drawing's, set by compute for the sheet it works out (_.DIMSTYLE,
  // see dimStyle); with none the defaults apply.
  _.DIMSTYLE = null;
  function fmtDim(x, units) {
    var st = _.DIMSTYLE || {};
    if (units === 'in') {
      if (st.fractions) return fracText(x, st.denom || 64);
      return inchText(x, st.prec != null ? st.prec : 3);
    }
    if (st.prec != null) return (Math.round(x * Math.pow(10, st.prec)) / Math.pow(10, st.prec)).toFixed(st.prec);
    var d = 2, p = Math.pow(10, d);
    var s = String(Math.round(x * p) / p);
    return s;
  }
  // a decimal inch with `prec` places and no leading zero: .030, -.500, 12.250; a value that rounds to zero is '0'
  function inchText(x, prec) {
    prec = Math.max(0, Math.min(6, Math.round(+prec)));
    var p = Math.pow(10, prec), r = Math.round(Math.abs(+x) * p) / p;
    if (r === 0) return '0';
    var s = r.toFixed(prec);
    if (s.charAt(0) === '0' && s.length > 1) s = s.slice(1);
    return (+x < 0 ? '-' : '') + s;
  }
  // the nearest fraction of an inch with denominator `denom` (2 … 128), reduced: 2 1/4, 3/16, 5
  function fracText(x, denom) {
    denom = Math.max(2, Math.min(128, Math.round(+denom) || 64));
    var n = Math.round(Math.abs(+x) * denom);
    if (n === 0) return '0';
    var whole = Math.floor(n / denom), num = n - whole * denom, den = denom;
    while (num && num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
    var s = (whole ? String(whole) : '') + (num ? (whole ? ' ' : '') + num + '/' + den : '');
    return (+x < 0 ? '-' : '') + s;
  }
  // dimStyle(doc) -> { prec, fractions, denom }: the drawing's dimension style from its Document Properties
  // (doc.options.dimPrec, fractions, fracDenom); prec null is the default for the units
  function dimStyle(doc) {
    var o = (doc && doc.options) || {};
    return { prec: o.dimPrec != null && o.dimPrec !== '' && +o.dimPrec >= 0 ? Math.min(6, Math.round(+o.dimPrec)) : null, fractions: !!o.fractions, denom: +o.fracDenom > 0 ? +o.fracDenom : 64 };
  }
  // autoDims(doc, projections, units) -> [{ view, kind: 'h' | 'v' | 'dia', … model-space geometry, text }]
  // Overall width and height on the Front view (below and to the left), overall depth on the Top view (left side),
  // and every distinct circle diameter once, in the first ortho view that shows it as a visible circle ("4X Ø8").
  function autoDims(doc, projections, units) {
    var dims = [];
    var order = doc.views.filter(function (v) { return ORTHO[v.orient] && (!v.kind || v.kind === 'projected') && projections[v.id]; });
    var roleOrder = { front: 0, top: 1, right: 2 };
    order.sort(function (a, b) { return (roleOrder[a.role] != null ? roleOrder[a.role] : 5) - (roleOrder[b.role] != null ? roleOrder[b.role] : 5) || a.id - b.id; });
    var front = order.filter(function (v) { return v.role === 'front'; })[0] || order[0];
    var top = order.filter(function (v) { return v.role === 'top'; })[0];
    if (front) {
      var b = projections[front.id].bounds;
      dims.push({ view: front.id, kind: 'h', a: [b.umin, b.vmin], b: [b.umax, b.vmin], side: -1, value: b.umax - b.umin, auto: true });
      dims.push({ view: front.id, kind: 'v', a: [b.umin, b.vmin], b: [b.umin, b.vmax], side: -1, value: b.vmax - b.vmin, auto: true });
    }
    if (top) {
      var bt = projections[top.id].bounds;
      dims.push({ view: top.id, kind: 'v', a: [bt.umin, bt.vmin], b: [bt.umin, bt.vmax], side: -1, value: bt.vmax - bt.vmin, auto: true });
    }
    var done = {};
    order.forEach(function (v) {
      var pr = projections[v.id];
      if (!pr) return;
      var groups = {}, gk = [];
      pr.circles.visible.forEach(function (c) {
        var key = fmtDim(2 * c.r, units);
        if (done[key] || c.sil) return;   // a sphere's or torus's outline is no edge to dimension
        if (!groups[key]) { groups[key] = []; gk.push(key); }
        groups[key].push(c);
      });
      gk.forEach(function (key) {
        done[key] = true;
        var list = groups[key];
        // label the circle farthest from the view centre (its leader then points outward), up and right on a tie
        var cu = (pr.bounds.umin + pr.bounds.umax) / 2, cv = (pr.bounds.vmin + pr.bounds.vmax) / 2, tie = 1e-6 * (1 + pr.bounds.umax - pr.bounds.umin);
        var dist = function (c) { return Math.hypot(c.c[0] - cu, c.c[1] - cv); };
        var pick = list.slice().sort(function (p, q) { return (dist(q) - dist(p) > tie ? 1 : dist(p) - dist(q) > tie ? -1 : 0) || (q.c[0] + q.c[1]) - (p.c[0] + p.c[1]); })[0];
        dims.push({ view: v.id, kind: 'dia', c: pick.c, r: pick.r, count: list.length, value: 2 * pick.r, auto: true });
      });
    });
    // straight slots (slotsIn): every distinct size once, in the first ortho view that shows it, as SolidWorks' slot
    // callout ("2X .375 X 1.875 SLOT": width X overall length), with its leader on the end arc farthest from the view
    // centre; their end arcs get no radius of their own. (Pushed after the radii, so the radii keep their style keys.)
    var sdone = {}, slotDims = [], slotArcs = {};
    order.forEach(function (v) {
      var pr = projections[v.id];
      if (!pr || !pr.arcs) return;
      var groups = {}, gk = [], cu = (pr.bounds.umin + pr.bounds.umax) / 2, cv = (pr.bounds.vmin + pr.bounds.vmax) / 2;
      slotArcs[v.id] = [];
      slotsIn(pr).forEach(function (s) {
        slotArcs[v.id].push(s.ends[0], s.ends[1]);
        var key = fmtDim(s.w, units) + ' X ' + fmtDim(s.len, units);
        if (sdone[key]) return;
        if (!groups[key]) { groups[key] = []; gk.push(key); }
        groups[key].push(s);
      });
      gk.forEach(function (key) {
        sdone[key] = true;
        var ends = [];
        groups[key].forEach(function (s) { ends.push(s.ends[0], s.ends[1]); });
        var pick = ends.sort(function (p, q) { return Math.hypot(q.c[0] - cu, q.c[1] - cv) - Math.hypot(p.c[0] - cu, p.c[1] - cv) || (q.c[0] + q.c[1]) - (p.c[0] + p.c[1]); })[0];
        var s0 = groups[key][0];
        slotDims.push({ view: v.id, kind: 'rad', c: pick.c, r: pick.r, a0: pick.a0, a1: pick.a1, count: groups[key].length, value: pick.r, slot: { w: s0.w, len: s0.len }, auto: true });
      });
      // arc slots (arcSlotsIn): the same, as "R1.500 ARC SLOT .375 WIDE 60°" (centre-line radius, width, the angle
      // between the end caps' centres); their side arcs and caps get no radius of their own
      var agroups = {}, agk = [];
      arcSlotsIn(pr).forEach(function (s) {
        slotArcs[v.id].push(s.ends[0], s.ends[1]);
        s.sides.forEach(function (x) { slotArcs[v.id].push(x); });
        var key = 'arc ' + fmtDim(s.R, units) + ' X ' + fmtDim(s.w, units) + ' X ' + Math.round(s.angle * 100) / 100;
        if (sdone[key]) return;
        if (!agroups[key]) { agroups[key] = []; agk.push(key); }
        agroups[key].push(s);
      });
      agk.forEach(function (key) {
        sdone[key] = true;
        var ends = [];
        agroups[key].forEach(function (s) { ends.push(s.ends[0], s.ends[1]); });
        var pick = ends.sort(function (p, q) { return Math.hypot(q.c[0] - cu, q.c[1] - cv) - Math.hypot(p.c[0] - cu, p.c[1] - cv) || (q.c[0] + q.c[1]) - (p.c[0] + p.c[1]); })[0];
        var s0 = agroups[key][0];
        slotDims.push({ view: v.id, kind: 'rad', c: pick.c, r: pick.r, a0: pick.a0, a1: pick.a1, count: agroups[key].length, value: pick.r, slot: { arc: true, R: s0.R, w: s0.w, angle: s0.angle, center: s0.center }, auto: true });
      });
    });
    function slotEnd(v, a) {
      return (slotArcs[v.id] || []).some(function (e) { return Math.abs(e.r - a.r) <= 1e-9 * (1 + a.r) && Math.hypot(e.c[0] - a.c[0], e.c[1] - a.c[1]) <= 1e-9 * (1 + Math.abs(a.c[0]) + Math.abs(a.c[1])); });
    }
    // true arcs of the model (slot ends, rounded corners, partial revolves; not circles cut by hidden lines): every
    // distinct radius once, in the first ortho view that shows it ("4X R5"), on the arc farthest from the view centre
    var rdone = {};
    order.forEach(function (v) {
      var pr = projections[v.id];
      if (!pr || !pr.arcs) return;
      var groups = {}, gk = [];
      pr.arcs.visible.forEach(function (a) {
        if (a.src !== 'arc' || slotEnd(v, a)) return;
        var key = fmtDim(a.r, units);
        if (rdone[key]) return;
        if (!groups[key]) { groups[key] = []; gk.push(key); }
        if (!groups[key].some(function (b) { return Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]) < 1e-9 * (1 + Math.abs(a.c[0]) + Math.abs(a.c[1])); })) groups[key].push(a);
      });
      gk.forEach(function (key) {
        rdone[key] = true;
        var list = groups[key], cu = (pr.bounds.umin + pr.bounds.umax) / 2, cv = (pr.bounds.vmin + pr.bounds.vmax) / 2;
        var pick = list.slice().sort(function (p, q) { return Math.hypot(q.c[0] - cu, q.c[1] - cv) - Math.hypot(p.c[0] - cu, p.c[1] - cv) || (q.c[0] + q.c[1]) - (p.c[0] + p.c[1]); })[0];
        dims.push({ view: v.id, kind: 'rad', c: pick.c, r: pick.r, a0: pick.a0, a1: pick.a1, count: list.length, value: pick.r, auto: true });
      });
    });
    dims = dims.concat(slotDims);
    // the part's sketch ordinate sets (sketch-ordinate), as drawing ordinate dimensions in the first view that looks
    // square at their sketch
    dims = dims.concat(sketchOrdinates(doc, order, projections));
    dims.forEach(function (d) { d.text = dimText(d, units); });
    return dims;
  }
  // sketchOrdinates(doc, order, projections) -> ordinate model items: every ordinate set (SketchSolver.ordinateSets) of
  // every unsuppressed sketch of the part being drawn (_.CTX.model), in the first ortho view of `order` whose direction
  // is the sketch's normal; base and references are the zero's and the members' points (circle centres) or edges in
  // that view's frame, the values their distances from the zero (signed; drawn as they read), on the side of the
  // geometry the sketch set's values stand
  function sketchOrdinates(doc, order, projections) {
    var ctx = _.CTX, model = ctx && ctx.model, S = typeof SketchSolver !== 'undefined' ? SketchSolver : null, out = [];
    if (!model || model.type === 'assembly' || !model.features || !S || !S.ordinateSets) return out;
    var rm;
    try { rm = K.resolvedModel(model).model; } catch (e) { rm = model; }
    var planes = ctx.build && ctx.build.planes || {};
    (rm.features || []).forEach(function (f) {
      if (f.type !== 'sketch' || f.suppressed || !f.rels || !f.rels.some(function (r) { return r.ord != null; })) return;
      var pl, sets = S.ordinateSets(f);
      try { pl = K.resolvePlane(f.plane, rm, planes); } catch (e) { return; }
      var v = null, F = null;
      for (var i = 0; i < order.length && !v; i++) {
        var Fi = viewFrame(doc, order[i]);
        if (Fi && Math.abs(Math.abs(V.dot(pl.n, Fi.e)) - 1) < 1e-9 && projections[order[i].id]) { v = order[i]; F = Fi; }
      }
      if (!v) return;
      function view2(x, y) { var p = K.to3D(pl, x, y); return [V.dot(p, F.u), V.dot(p, F.v)]; }
      function viewRef(ref) {
        var k = S.refKind(f, ref);
        if (k === 'point') { var p = S.refPoint(f, ref); return p ? { kind: 'dia', c: view2(p[0], p[1]), r: 0, value: 0 } : null; }
        if (k === 'circle') { var c = S.refCurve(f, ref); return { kind: 'dia', c: view2(c.c[0], c.c[1]), r: c.r, value: 2 * c.r }; }
        if (k === 'line') {
          var L = S.refCurve(f, ref), a = view2(L.a[0], L.a[1]), b = view2(L.b[0], L.b[1]), dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
          return { kind: Math.abs(dy) <= len * 1e-9 ? 'h' : Math.abs(dx) <= len * 1e-9 ? 'v' : 'aligned', a: a, b: b, value: len };
        }
        return null;
      }
      Object.keys(sets).forEach(function (id) {
        var set = sets[id], base = viewRef(set.zero);
        if (!base) return;
        var refs = set.members.map(function (i) { return viewRef(f.rels[i].refs[1]); });
        if (refs.some(function (r) { return !r; })) return;
        var sx = set.axis === 'y' ? [0, 1] : [1, 0], d3 = V.add(V.scale(pl.x, sx[0]), V.scale(pl.y, sx[1]));
        var dir = Math.abs(V.dot(d3, F.u)) >= Math.abs(V.dot(d3, F.v)) ? 'h' : 'v', ax = dir === 'v' ? 1 : 0;
        var pos = function (r, a) { return r.kind === 'dia' ? r.c[a] : (r.a[a] + r.b[a]) / 2; };
        var d = { view: v.id, kind: 'ordinate', dir: dir, base: base, refs: refs, auto: true, sketchOrd: f.id + ':' + id };
        d.values = refs.map(function (r) { return pos(r, ax) - pos(base, ax); });
        // the side the values stand: where the sketch set has its text line, from the middle of its points
        if (set.at != null) {
          var mid = 0, all = [base].concat(refs);
          all.forEach(function (r) { mid += pos(r, 1 - ax) / all.length; });
          var lvl = (set.axis === 'y' ? view2(set.at, 0) : view2(0, set.at))[1 - ax];
          d.side = lvl - mid < 0 ? -1 : 1;
        }
        // below / left of the view the overall sizes stand 10 mm out: the values stand outside them
        if ((d.side || 1) < 0) d.outer = 10;
        out.push(d);
      });
    });
    return out;
  }
  // arcSlotsIn(pr) -> [{ ends: [arc, arc], sides: [outer arc, inner arc?], center, R, w, angle }]: the arc slots a
  // projection shows — two 180° true end arcs of one radius r whose centres lie on a circle of radius R about the
  // centre of a visible true side arc of radius R + r (and R - r, the inner side, when there is one), each cap facing
  // along that circle, lying inside the view's outline. w = 2r; angle = the angle between the caps' centres about the
  // slot's centre, the way the side arc runs (degrees).
  function arcSlotsIn(pr) {
    var b = pr.bounds, span = Math.max(b.umax - b.umin, b.vmax - b.vmin, 1e-9), tol = 1e-6 * span, caps = [], all = [], out = [], used = {};
    function sweepOf(a) { return ((a.a1 - a.a0) % 360 + 360) % 360 || 360; }
    (pr.arcs.visible || []).forEach(function (a) {
      if (a.src !== 'arc') return;
      all.push(a);
      if (Math.abs(sweepOf(a) - 180) <= 0.5 && !caps.some(function (x) { return Math.abs(x.r - a.r) <= tol && Math.hypot(x.c[0] - a.c[0], x.c[1] - a.c[1]) <= tol; })) caps.push(a);
    });
    function mid(a) { var m = (a.a0 + sweepOf(a) / 2) * Math.PI / 180; return [Math.cos(m), Math.sin(m)]; }
    function inside(x, y) { return x > b.umin + tol && x < b.umax - tol && y > b.vmin + tol && y < b.vmax - tol; }
    for (var i = 0; i < caps.length; i++) {
      if (used[i]) continue;
      for (var j = i + 1; j < caps.length; j++) {
        if (used[j]) continue;
        var A = caps[i], B = caps[j], r = A.r;
        if (Math.abs(A.r - B.r) > tol) continue;
        var found = null;
        for (var k = 0; k < all.length && !found; k++) {
          var X = all[k];
          if (X === A || X === B || X.r <= r + tol) continue;
          var R = X.r - r, C = X.c, dA = Math.hypot(A.c[0] - C[0], A.c[1] - C[1]), dB = Math.hypot(B.c[0] - C[0], B.c[1] - C[1]);
          if (Math.abs(dA - R) > tol * 10 || Math.abs(dB - R) > tol * 10 || R <= tol) continue;
          // each cap faces along the circle (square to its radius) and away from the other cap
          var ra = [(A.c[0] - C[0]) / dA, (A.c[1] - C[1]) / dA], rb = [(B.c[0] - C[0]) / dB, (B.c[1] - C[1]) / dB], ma = mid(A), mb = mid(B);
          if (Math.abs(ma[0] * ra[0] + ma[1] * ra[1]) > 0.01 || Math.abs(mb[0] * rb[0] + mb[1] * rb[1]) > 0.01) continue;
          var ab = [B.c[0] - A.c[0], B.c[1] - A.c[1]];
          if (ma[0] * ab[0] + ma[1] * ab[1] > 0 || mb[0] * ab[0] + mb[1] * ab[1] < 0) continue;
          var inner = R - r > tol ? all.filter(function (Y) { return Y !== X && Math.abs(Y.r - (R - r)) <= tol * 10 && Math.hypot(Y.c[0] - C[0], Y.c[1] - C[1]) <= tol * 10; })[0] : null;
          if (R - r > tol && !inner) continue;
          // inside the outline: the caps and points along the outer side
          var ok = [A, B].every(function (q) { return inside(q.c[0] - r, q.c[1] - r) && inside(q.c[0] + r, q.c[1] + r); });
          for (var t = 0; ok && t <= 16; t++) { var ang = (X.a0 + sweepOf(X) * t / 16) * Math.PI / 180; ok = inside(C[0] + X.r * Math.cos(ang), C[1] + X.r * Math.sin(ang)); }
          if (!ok) continue;
          var th = Math.acos(Math.max(-1, Math.min(1, ra[0] * rb[0] + ra[1] * rb[1]))) * 180 / Math.PI;
          if (sweepOf(X) > 180 + 0.5) th = 360 - th;
          found = { ends: [A, B], sides: inner ? [X, inner] : [X], center: C.slice(), R: R, w: 2 * r, angle: th };
        }
        if (!found) continue;
        used[i] = used[j] = true;
        out.push(found);
        break;
      }
    }
    return out;
  }
  // slotsIn(pr) -> [{ ends: [arc, arc], w, len }]: the straight slots a projection shows — two 180° true arcs of one
  // radius, each bulging away from the other, whose tangent sides are visible straight lines, lying inside the view's
  // outline (not on it: a bar with full round ends is no slot). w = 2r, len = the centre distance + 2r (overall).
  function slotsIn(pr) {
    var b = pr.bounds, span = Math.max(b.umax - b.umin, b.vmax - b.vmin, 1e-9), tol = 1e-6 * span, arcs = [], out = [], used = {};
    (pr.arcs.visible || []).forEach(function (a) {
      if (a.src !== 'arc') return;
      var sw = ((a.a1 - a.a0) % 360 + 360) % 360;
      if (Math.abs(sw - 180) > 0.5) return;
      if (arcs.some(function (x) { return Math.abs(x.r - a.r) <= tol && Math.hypot(x.c[0] - a.c[0], x.c[1] - a.c[1]) <= tol; })) return;
      arcs.push(a);
    });
    function mid(a) { var m = (a.a0 + (((a.a1 - a.a0) % 360 + 360) % 360) / 2) * Math.PI / 180; return [Math.cos(m), Math.sin(m)]; }
    function hasSide(P, Q) {
      var d = [Q[0] - P[0], Q[1] - P[1]], L = Math.hypot(d[0], d[1]), t = [d[0] / L, d[1] / L];
      return (pr.lines.visible || []).some(function (l) {
        var ends = [[l[0], l[1]], [l[2], l[3]]];
        return ends.every(function (e) {
          var x = e[0] - P[0], y = e[1] - P[1], s = x * t[0] + y * t[1];
          return Math.abs(x * t[1] - y * t[0]) <= tol && s >= -tol && s <= L + tol;
        }) && Math.hypot(l[2] - l[0], l[3] - l[1]) > tol;
      });
    }
    for (var i = 0; i < arcs.length; i++) {
      if (used[i]) continue;
      for (var j = i + 1; j < arcs.length; j++) {
        if (used[j]) continue;
        var A = arcs[i], B = arcs[j], r = A.r;
        if (Math.abs(A.r - B.r) > tol) continue;
        var d = [B.c[0] - A.c[0], B.c[1] - A.c[1]], L = Math.hypot(d[0], d[1]);
        if (L <= tol) continue;
        var u = [d[0] / L, d[1] / L], ma = mid(A), mb = mid(B);
        if (ma[0] * u[0] + ma[1] * u[1] > -0.999 || mb[0] * u[0] + mb[1] * u[1] < 0.999) continue;
        var n = [-u[1] * r, u[0] * r];
        if (!hasSide([A.c[0] + n[0], A.c[1] + n[1]], [B.c[0] + n[0], B.c[1] + n[1]]) || !hasSide([A.c[0] - n[0], A.c[1] - n[1]], [B.c[0] - n[0], B.c[1] - n[1]])) continue;
        var x0 = Math.min(A.c[0], B.c[0]) - r, x1 = Math.max(A.c[0], B.c[0]) + r, y0 = Math.min(A.c[1], B.c[1]) - r, y1 = Math.max(A.c[1], B.c[1]) + r;
        if (x0 <= b.umin + tol || x1 >= b.umax - tol || y0 <= b.vmin + tol || y1 >= b.vmax - tol) continue;
        used[i] = used[j] = true;
        out.push({ ends: [A, B], w: 2 * r, len: L + 2 * r });
        break;
      }
    }
    return out;
  }
  // a slot callout's text: [N X ]W X L SLOT; an arc slot's [N X ]R<centre-line radius> ARC SLOT <width> WIDE <angle>°
  function slotText(d, units, prec) {
    var f = function (x) { return prec != null ? D.numText(x, units, prec) : fmtDim(x, units); };
    if (d.slot.arc) return (d.count > 1 ? d.count + 'X ' : '') + 'R' + f(d.slot.R) + ' ARC SLOT ' + f(d.slot.w) + ' WIDE ' + String(Math.round(d.slot.angle * 100) / 100) + '°';
    return (d.count > 1 ? d.count + 'X ' : '') + f(d.slot.w) + ' X ' + f(d.slot.len) + ' SLOT';
  }
  function autoDimKey(d) {
    if (d.kind === 'ordinate' && d.sketchOrd) return d.view + ':ord:' + d.sketchOrd;
    if (d.slot && d.slot.arc) return d.view + ':arcslot:' + d.slot.R.toFixed(4) + 'x' + d.slot.w.toFixed(4) + 'x' + d.slot.angle.toFixed(2);
    if (d.slot) return d.view + ':slot:' + d.slot.w.toFixed(4) + 'x' + d.slot.len.toFixed(4);
    return d.view + ':' + d.kind + ':' + (d.kind === 'dia' || d.kind === 'rad' ? d.value.toFixed(4) : d.a.concat(d.b).map(function (x) { return x.toFixed(4); }).join(','));
  }
  function dimText(d, units) {
    if (d.kind === 'ordinate' || d.kind === 'baseline') {
      var p = d.prec != null && d.prec !== '' ? +d.prec : null;
      return (d.kind === 'ordinate' ? ['0'] : []).concat((d.values || []).map(function (x) { return D.numText(Math.abs(x), units, p); })).join(', ');
    }
    if (d.prec != null || d.tol || d.label != null || d.kind === 'chamfer') return D.dimLabel(d, units).text;
    if (d.kind === 'dia') return (d.count > 1 ? d.count + 'X ' : '') + '\u00d8' + fmtDim(d.value, units);
    if (d.kind === 'rad' && d.slot) return slotText(d, units, null);
    if (d.kind === 'rad') return (d.count > 1 ? d.count + 'X ' : '') + 'R' + fmtDim(d.value, units);
    return fmtDim(d.value, units);
  }


  // ------------------------------------------------------------------ assemblies: Bill of Materials and balloons
  // A drawing of an assembly draws the solved components (the assembly mesh, one body per component) exactly like a
  // multi-body part. On top of that it carries a Bill of Materials (identical components — same source — on one row,
  // ITEM NO. in insertion order) and balloons that name the BOM item of a component in a view.
  var partInfoCache = {};
  function hasMaterials() { return typeof Materials !== 'undefined'; }
  // partInfo(source, asmBuild?) -> { name, description, model, build() }: the part's name and its description (the
  // part model's own `description`, else the Design Library entry it came from; parts from scripts get their size in
  // bomRows), its model (custom properties, material) and, on demand, its build (mass, bodies)
  function partInfo(source, asmBuild) {
    var key = JSON.stringify(source);
    var info = partInfoCache[key];
    if (!info) {
      info = { name: 'Part', description: '', model: null, _build: null };
      try {
        if (typeof Assembly !== 'undefined') {
          var m = Assembly.partModel(source);
          info.model = m;
          info.name = m.name || 'Part';
          var ex = null;
          if (source && source.example != null && typeof AnvilExamples !== 'undefined') AnvilExamples.forEach(function (e) { if (!ex && e.name === source.example) ex = e; });
          info.description = m.description || (ex ? ex.name : '');
        }
      } catch (err) { info.description = err.message; }
      info.build = function () {
        if (info._build || !info.model) return info._build;
        try { info._build = K.rebuild(JSON.parse(JSON.stringify(info.model))); } catch (e) { info._build = null; }
        return info._build;
      };
      partInfoCache[key] = info;
    }
    // the assembly build already holds every part's build: reuse it instead of building the part again
    var e = asmBuild && asmBuild.cache && asmBuild.cache[key];
    if (e && e.build && !info._build) info._build = e.build;
    return info;
  }
  // asmPartMaterials(model, build) -> [material name | null] by assembly part tag (polygon.part), numbered as
  // Assembly.rebuild tags them: one per part, one per body of a multibody part (its body's own material, else the
  // part's), a sub-assembly's parts in its order; null without a build. Cached on the build. (r13/drawings13)
  function asmPartMaterials(model, build) {
    if (!build || !build.partBuilds || !hasMaterials()) return null;
    if (build._dwMats && build._dwMats.model === model) return build._dwMats.list;
    var out = [];
    function count(body) {   // as Assembly's partCount(partBody(body)): part tags, else bodies, else one
      var n = 0, tagged = false, ps = body.polygons || [];
      for (var i = 0; i < ps.length; i++) if (ps[i].part != null) { tagged = true; if (ps[i].part + 1 > n) n = ps[i].part + 1; }
      if (!tagged) for (var j = 0; j < ps.length; j++) if ((ps[j].body || 0) + 1 > n) n = (ps[j].body || 0) + 1;
      return Math.max(1, n);
    }
    function walk(m, b) {
      (m.components || []).forEach(function (c) {
        var pb = b.partBuilds && b.partBuilds[c.id];
        if (!pb || !pb.body) return;
        if (pb.assembly && pb.model) { walk(pb.model, pb); return; }
        var n = count(pb.body), pm = null;
        try { pm = partInfo(c.source, build).model; } catch (e) { pm = null; }
        for (var i = 0; i < n; i++) {
          var nm = null;
          try { nm = pm ? (Materials.bodyMaterial ? Materials.bodyMaterial(pm, pb, i).name : Materials.materialName(pm)) : null; } catch (e2) { nm = null; }
          out.push(nm);
        }
      });
    }
    walk(model, build);
    try { Object.defineProperty(build, '_dwMats', { value: { model: model, list: out }, enumerable: false, configurable: true, writable: true }); } catch (e3) { /* frozen: recomputed next time */ }
    return out;
  }
  // BOM columns. A column is { type: 'item' | 'partNumber' | 'description' | 'qty' | 'property', prop (property name,
  // for 'property'), title, width (paper mm), hidden }. doc.bom.columns holds them in order; without it the table has
  // the four SolidWorks default columns. A property column shows the part's custom property of that name, falling
  // back for Material / Mass to the part's material and mass (as a title block does).
  var BOM_COLS = [['ITEM NO.', 18, 'middle'], ['PART NUMBER', 45, 'start'], ['DESCRIPTION', 80, 'start'], ['QTY.', 14, 'middle']], BOM_ROW = 7, BOM_TEXT = 3;
  var BOM_DEFAULT = [{ type: 'item' }, { type: 'partNumber' }, { type: 'description' }, { type: 'qty' }];
  var BOM_TYPE_DEFAULTS = { item: BOM_COLS[0], partNumber: BOM_COLS[1], description: BOM_COLS[2], qty: BOM_COLS[3] };
  var PROP_WIDTH = { material: 40, mass: 26, vendor: 35, revision: 16, rev: 14, finish: 30, cost: 20 };
  var BOM_TYPES = [['top', 'Top-level only'], ['indented', 'Indented'], ['parts', 'Parts only']];
  function bomType(t) { return t === 'parts' || t === 'indented' ? t : 'top'; }
  function bomColumnSpecs(bom) { return (bom && Array.isArray(bom.columns) && bom.columns.length ? bom.columns : BOM_DEFAULT).map(function (c) { return typeof c === 'string' ? { type: 'property', prop: c } : c; }); }
  // bomColumns(bom) -> the visible columns [{ type, prop, title, width, align }]
  function bomColumns(bom) {
    return bomColumnSpecs(bom).filter(function (c) { return !c.hidden; }).map(function (c) {
      var d = BOM_TYPE_DEFAULTS[c.type], prop = d ? null : String(c.prop || '');
      return {
        type: d ? c.type : 'property', prop: prop,
        title: c.title || (d ? d[0] : prop.toUpperCase()),
        width: +c.width > 0 ? +c.width : d ? d[1] : (PROP_WIDTH[prop.toLowerCase()] || 32),
        align: d ? d[2] : 'start'
      };
    });
  }
  function bomCell(row, col) {
    switch (col.type) {
      case 'item': return row.item;
      case 'partNumber': return row.partNumber;
      case 'description': return row.description;
      case 'qty': return row.qty;
    }
    return row.prop ? row.prop(col.prop) : '';
  }
  function bboxText(mesh, units) {
    var P = mesh.positions64 || mesh.positions, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < mesh.triCount * 9; i += 3) for (var k = 0; k < 3; k++) { var x = P[i + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; }
    if (!(lo[0] <= hi[0])) return '';
    return [0, 1, 2].map(function (q) { return fmtDim(hi[q] - lo[q], units); }).join(' x ');
  }
  // the evaluator for one part: prop(name) through Materials (custom / configuration-specific properties, "SW-" links,
  // Material / Mass falling back to the part's own)
  function partProps(model, build, mesh, bodyOverride) {
    if (!hasMaterials() || !model) return function () { return ''; };
    var ctx = Materials.context(model, bodyOverride ? { massProps: bodyOverride.mp, material: bodyOverride.material } : { build: build, mesh: mesh });
    var memo = {};
    return function (name) {
      var k = String(name).toLowerCase();
      if (!(k in memo)) { try { memo[k] = Materials.sheetProperty(model, name, ctx); } catch (e) { memo[k] = ''; } }
      return memo[k];
    };
  }
  function nonEmpty(v) { return v != null && String(v).trim() !== '' ? String(v) : null; }
  // bodyRows(model, build, units) -> one entry per distinct solid body of a multi-body part (same material, size and
  // volume count together, as a weldment cut list does): { key, name, size, material, count, bodies, prop }; null for
  // a single-body part
  function bodyRows(model, build, units) {
    var bodies = build ? (build.bodies || (build.body ? [build.body] : [])) : [];
    if (bodies.length < 2) return null;
    var out = [], byKey = {};
    bodies.forEach(function (b, i) {
      var bm = hasMaterials() ? Materials.bodyMaterial(model, build, i) : { name: null, density: model.density || 7850 };
      var mesh = K.meshFromBody(b), mp = K.massProps(mesh, bm.density);
      var size = bboxText(mesh, units), key = (bm.name || '') + '|' + size + '|' + mp.volume.toFixed(3);
      var fid = build.bodyFeatures ? build.bodyFeatures[i] : null, f = fid != null ? K.findFeature(model, fid) : null;
      var r = byKey[key];
      if (!r) {
        var bmp = { volume: mp.volume, area: mp.area, density: bm.density, mass: mp.volume * bm.density, massKg: (hasMaterials() ? Materials.volumeToM3(mp.volume, units) : mp.volume * 1e-9) * bm.density };
        r = byKey[key] = { key: key, name: f ? f.name : 'Body' + (i + 1), size: size, material: bm.name, count: 0, bodies: [], prop: partProps(model, build, null, { mp: bmp, material: bm.name || null }) };
        out.push(r);
      }
      r.count++; r.bodies.push(i);
    });
    return out;
  }
  // bomRows(model, mesh?, bom?, opts?) -> [{ item, key, srcKey, partNumber, description, qty, components: [id…],
  // indices: [body index…], prop(name) }]. Assemblies: one row per distinct component source (identical components
  // counted together, items in tree order). bom.type 'parts' (Parts only) lists the solid bodies of a multi-body part
  // as rows of their own, each with its own material and mass; 'top' (Top-level only, the default) lists the part.
  // A part drawing has rows only when it has a BOM (bom given): the part, or its bodies for Parts only.
  // Sub-assemblies (cloud-2026-09-26r): 'indented' (Indented) lists each sub-assembly followed by its own rows one
  // level in (items 1, 1.1, 1.2 …, qty per one of its parent; row.level); 'parts' with sub-assemblies lists every part
  // at any depth with the quantities multiplied through the levels. Both come from Assembly.bom; 'top' keeps a
  // sub-assembly as one row.
  // PART NUMBER is the part's "Part Number" property, else its name; DESCRIPTION its "Description" property, else the
  // model's description / Design Library name / size "30 x 5 x 20" (when the mesh is given). opts.build: the
  // assembly (or part) build, to reuse its part builds.
  function bomRows(model, mesh, bom, opts) {
    opts = opts || {};
    if (!model) return [];
    var asm = model.type === 'assembly', parts = !!(bom && bom.type === 'parts'), units = model.units === 'in' ? 'in' : 'mm';
    var rows = [];
    function push(r) { r.item = rows.length + 1; rows.push(r); return r; }
    if (!asm) {
      if (!bom) return [];
      var build = opts.build && !opts.build.assembly ? opts.build : null;
      var needBuild = parts || (hasMaterials() && Materials.hasBodyMaterials(model));
      if (!build && needBuild) { try { build = K.rebuild(JSON.parse(JSON.stringify(model))); } catch (e) { build = null; } }
      var prop = partProps(model, build, mesh && mesh.triCount ? mesh : null);
      var pn = nonEmpty(prop('Part Number')) || model.name || 'Part';
      var brs = parts ? bodyRows(model, build, units) : null;
      if (brs) {
        brs.forEach(function (b) { push({ key: 'part#' + b.key, srcKey: 'part', partNumber: pn + ' - ' + b.name, description: b.size, qty: b.count, components: [], indices: b.bodies, prop: b.prop, body: true }); });
        return rows;
      }
      var desc = nonEmpty(prop('Description')) || model.description || (mesh && mesh.triCount ? bboxText(mesh, units) : '');
      var nb = build ? (build.bodies || [build.body]).length : 1, idx = [];
      for (var q = 0; q < nb; q++) idx.push(q);
      push({ key: 'part', srcKey: 'part', partNumber: pn, description: desc, qty: 1, components: [], indices: idx, prop: prop });
      return rows;
    }
    if (!model.components) return [];
    var groups = [], bySrc = {}, type = bomType(bom && bom.type), levels = null;
    if (type !== 'top' && typeof Assembly !== 'undefined' && Assembly.bom &&
        (type === 'indented' || model.components.some(function (c) { return Assembly.isSubAssemblySource(c.source); }))) {
      var ab = opts.build && opts.build.partBuilds ? opts.build : null, topIdx = {};
      model.components.forEach(function (c, i) { topIdx[c.id] = i; });
      levels = Assembly.bom(model, ab, { type: type });
      levels.forEach(function (r) {
        var idx = r.level === 0 ? r.components.map(function (id) { return topIdx[id]; }).filter(function (i) { return i != null; }) : [];
        var first = idx.length ? idx[0] : -1;
        groups.push({ key: r.key, source: JSON.parse(r.key), first: first, components: r.components.slice(), indices: idx, transform: first >= 0 ? model.components[first].transform : null, qty: r.qty, item: r.item, level: r.level, kind: r.kind });
      });
    } else {
      model.components.forEach(function (c, i) {
        var key = JSON.stringify(c.source), g = bySrc[key];
        if (!g) { g = bySrc[key] = { key: key, source: c.source, first: i, components: [], indices: [], transform: c.transform }; groups.push(g); }
        g.components.push(c.id); g.indices.push(i);
      });
    }
    groups.forEach(function (g) {
      var qty = g.qty != null ? g.qty : g.components.length;
      var info = partInfo(g.source, opts.build), pb = null;
      function pbuild() { return pb || (pb = info.build()); }
      var prop = partProps(info.model, null, null), full = null;
      // mass needs the part's build: a property column evaluates through a context that has it, built on first use
      var propFn = function (name) {
        if (!full) full = info.model ? partProps(info.model, pbuild(), null) : prop;
        return full(name);
      };
      var pn = nonEmpty(prop('Part Number')) || info.name;
      var brs = parts && info.model && g.kind !== 'assembly' ? bodyRows(info.model, pbuild(), info.model.units === 'in' ? 'in' : 'mm') : null;
      if (brs) {
        brs.forEach(function (b) { push({ key: g.key + '#' + b.key, srcKey: g.key, partNumber: pn + ' - ' + b.name, description: b.size, qty: b.count * qty, components: g.components.slice(), indices: g.indices.slice(), prop: b.prop, body: true }); });
        return;
      }
      var desc = nonEmpty(prop('Description')) || info.description;
      if (!desc && mesh && g.first >= 0) desc = envelopeText(mesh, g.first, g.transform, model.units);
      var r = push({ key: g.key, srcKey: g.key, partNumber: pn, description: desc, qty: qty, components: g.components.slice(), indices: g.indices.slice(), prop: propFn });
      if (type === 'indented' && g.item != null) { r.item = g.item; r.level = g.level; }
    });
    return rows;
  }
  function envelopeText(mesh, body, T, units) {
    var P = mesh.positions64 || mesh.positions, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    var R = T && T.rotation || [1, 0, 0, 0, 1, 0, 0, 0, 1], o = T && T.position || [0, 0, 0];
    mesh.faces.forEach(function (f) {
      if ((f.body || 0) !== body) return;
      for (var i = f.start * 9; i < (f.start + f.count) * 9; i += 3) {
        var d = [P[i] - o[0], P[i + 1] - o[1], P[i + 2] - o[2]];
        for (var k = 0; k < 3; k++) { var x = R[k] * d[0] + R[3 + k] * d[1] + R[6 + k] * d[2]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; }
      }
    });
    if (!(lo[0] <= hi[0])) return '';
    return [0, 1, 2].map(function (k) { return fmtDim(hi[k] - lo[k], units); }).join(' x ');
  }
  var BOM_ANCHORS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
  // bomPropertyNames(model) -> the property names a BOM column can show: Material, Mass, Vendor, Revision, Finish and
  // every custom property of the part (or of the assembly's parts)
  function bomPropertyNames(model) {
    var out = ['Material', 'Mass', 'Vendor', 'Revision', 'Finish'], seen = {};
    out.forEach(function (n) { seen[n.toLowerCase()] = 1; });
    function add(m) {
      if (!m || !hasMaterials()) return;
      Materials.effective(m).forEach(function (p) { var k = p.name.toLowerCase(); if (!seen[k] && k !== 'description' && k !== 'part number') { seen[k] = 1; out.push(p.name); } });
    }
    if (model && model.type === 'assembly') (model.components || []).forEach(function (c) { add(partInfo(c.source).model); });
    else add(model);
    return out;
  }
  // bomBox(doc, units, nRows) -> { x0, y0, x1, y1, rowH, cols: [x…], columns } anchored to a corner of the border (a
  // bottom anchor sits above the title block on the right), or at doc.bom.x / y (its top-left corner) when it was
  // dragged. Its width is the sum of the visible columns.
  function bomBox(doc, units, nRows) {
    var k = paperK(units), S = sheetSize(doc, units), b = BORDER * k, bm = doc.bom || {}, columns = bomColumns(bm);
    var W = columns.reduce(function (a, c) { return a + c.width; }, 0) * k, H = (nRows + 1) * BOM_ROW * k;
    var anchor = bm.anchor || 'top-right', x0, y1;
    if (bm.x != null && bm.y != null) { x0 = bm.x; y1 = bm.y; }
    else {
      x0 = /left/.test(anchor) ? b : S[0] - b - W;
      y1 = /top/.test(anchor) ? S[1] - b : b + (/right/.test(anchor) ? TB_H * k : 0) + H;
    }
    var cols = [x0]; columns.forEach(function (c) { cols.push(cols[cols.length - 1] + c.width * k); });
    return { x0: x0, y0: y1 - H, x1: x0 + W, y1: y1, rowH: BOM_ROW * k, cols: cols, anchor: anchor, columns: columns };
  }
  // autoBalloon(doc, model, viewId, { ignoreMultiple }) -> the view's balloons [{ key (the BOM row: the component
  // source), component (id), instance? }]. SolidWorks Auto Balloon: one balloon per BOM item that shows in the view
  // ("Ignore multiple instances", the default), or one per component instance with ignoreMultiple false. The item
  // number is looked up in the BOM at every render, so balloons renumber with it; a balloon whose item has no visible
  // or hidden edge in the view is not drawn. Replaces the view's earlier balloons.
  function autoBalloon(doc, model, viewId, opts) {
    opts = opts || {};
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    var rows = bomRows(model);
    if (!rows.length) throw new Error('Auto Balloon needs a drawing of an assembly');
    var list = [];
    rows.forEach(function (r) {
      if (opts.ignoreMultiple === false) r.components.forEach(function (id) { list.push({ key: r.key, component: id, instance: true }); });
      else list.push({ key: r.key, component: r.components[0] });
    });
    v.balloons = list;
    return v.balloons;
  }
  function deleteBalloons(doc, viewId) { var v = findView(doc, viewId); if (v) v.balloons = []; }
  // balloonSpots(w, rows, k) -> [{ item, key, component, attach (paper), c (paper), r, ok }]: attaches each balloon to
  // the component's visible geometry farthest from the view centre (so the leader runs outward) and places the
  // balloons on a rectangle 14 mm outside the view box, on the side the attach point faces, spread apart
  var BALLOON_R = 5, BALLOON_OUT = 14;
  function balloonSpots(w, rows, k) {
    var v = w.view, box = w.box, list = v.balloons || [], out = [];
    if (!list.length) return out;
    var cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, r = BALLOON_R * k, pr = w.proj;
    // a balloon names its component's source; in a Parts only BOM that part may be several rows (its bodies): the first
    var byKey = {}; rows.forEach(function (rw) { byKey[rw.key] = rw; if (rw.srcKey && !byKey[rw.srcKey]) byKey[rw.srcKey] = rw; });
    list.forEach(function (b) {
      var rw = byKey[b.key];
      if (!rw) return;
      var idx = b.instance ? rw.indices.filter(function (i, j) { return rw.components[j] === b.component; }) : rw.indices, best = null, bd = -1;
      var extra = { src: b, index: list.indexOf(b), stack: (b.stack || []).map(function (s) { var r2 = byKey[s.key]; return { item: r2 ? r2.item : '?', key: s.key, component: s.component }; }),
        stackDir: b.stackDir || null, qty: !!b.qty, qtyPos: b.qtyPos || null, qtyText: rw.qty + 'X', manual: !!b.manual };
      // a manual balloon keeps the point it was attached to (model units in the view)
      if (b.attach) { out.push(Object.assign({ item: rw.item, key: rw.key, component: b.component, attach: w.toSheet(b.attach), r: r, ok: true }, extra)); return; }
      if (!idx.length) return;
      function consider(p, bodyIndex, hidden) {
        if (idx.indexOf(bodyIndex) < 0) return;
        var q = w.toSheet(p), d = Math.hypot(q[0] - cx, q[1] - cy) - (hidden ? 1e6 : 0);
        if (d > bd) { bd = d; best = q; }
      }
      pr.lines.visible.forEach(function (l) { consider([(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], l[4] || 0, false); });
      pr.circles.visible.forEach(function (c) { consider([c.c[0] + c.r, c.c[1]], c.body || 0, false); });
      (pr.arcs ? pr.arcs.visible : []).forEach(function (a) { var e = _.arcEnds(a); consider([(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2], a.body || 0, false); });
      (pr.ellipses ? pr.ellipses.visible : []).forEach(function (el) { var t = (el.t0 + el.t1) / 2; consider([el.c[0] + el.ax[0] * Math.cos(t) + el.ay[0] * Math.sin(t), el.c[1] + el.ax[1] * Math.cos(t) + el.ay[1] * Math.sin(t)], el.body || 0, false); });
      if (!best) { pr.lines.hidden.forEach(function (l) { consider([(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], l[4] || 0, true); }); pr.circles.hidden.forEach(function (c) { consider([c.c[0] + c.r, c.c[1]], c.body || 0, true); }); }
      if (!best) return;
      out.push(Object.assign({ item: rw.item, key: rw.key, component: b.component, attach: best, r: r, ok: true }, extra));
    });
    // place: the ray from the view centre through the attach point meets the rectangle `out` mm outside the box
    var o = BALLOON_OUT * k, R = { x0: box.x0 - o, x1: box.x1 + o, y0: box.y0 - o, y1: box.y1 + o }, W = R.x1 - R.x0, H = R.y1 - R.y0, per = 2 * (W + H);
    function tOf(p) {   // perimeter parameter, counter-clockwise from the bottom-left corner
      if (Math.abs(p[1] - R.y0) < 1e-9) return p[0] - R.x0;
      if (Math.abs(p[0] - R.x1) < 1e-9) return W + p[1] - R.y0;
      if (Math.abs(p[1] - R.y1) < 1e-9) return W + H + (R.x1 - p[0]);
      return 2 * W + H + (R.y1 - p[1]);
    }
    function pOf(t) {
      t = ((t % per) + per) % per;
      if (t < W) return [R.x0 + t, R.y0]; t -= W;
      if (t < H) return [R.x1, R.y0 + t]; t -= H;
      if (t < W) return [R.x1 - t, R.y1]; t -= W;
      return [R.x0, R.y1 - t];
    }
    out.forEach(function (b) {
      var dx = b.attach[0] - cx, dy = b.attach[1] - cy, L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      var tx = Math.abs(dx) < 1e-12 ? Infinity : (dx > 0 ? R.x1 - cx : R.x0 - cx) / dx, ty = Math.abs(dy) < 1e-12 ? Infinity : (dy > 0 ? R.y1 - cy : R.y0 - cy) / dy;
      var t = Math.min(tx, ty), p = [cx + dx * t, cy + dy * t];
      p[0] = Math.max(R.x0, Math.min(R.x1, p[0])); p[1] = Math.max(R.y0, Math.min(R.y1, p[1]));
      b.t = tOf(p);
    });
    // spread balloons closer than 2.4 r apart along the perimeter (a few relaxation passes)
    var gap = 2.4 * r, sorted = out.filter(function (b) { return !b.src.pos; }).sort(function (a, b) { return a.t - b.t; });
    for (var pass = 0; pass < 8 && sorted.length > 1; pass++) {
      for (var i = 1; i < sorted.length; i++) if (sorted[i].t - sorted[i - 1].t < gap) { var m = (sorted[i].t + sorted[i - 1].t) / 2; sorted[i - 1].t = m - gap / 2; sorted[i].t = m + gap / 2; }
      if (sorted[sorted.length - 1].t - sorted[0].t > per - gap) { var m2 = (sorted[sorted.length - 1].t - per + sorted[0].t) / 2; sorted[0].t = m2 + gap / 2; sorted[sorted.length - 1].t = per + m2 - gap / 2; }
    }
    // a dragged (or placed) balloon sits where it was put, relative to the view centre
    out.forEach(function (b) { b.c = b.src.pos ? [v.x + b.src.pos[0], v.y + b.src.pos[1]] : pOf(b.t); });
    return out;
  }

  D.FORMATS = FORMATS; D.SCALES = SCALES; D.scaleValue = scaleValue; D.scaleText = scaleText; D.scaleLabel = scaleLabel; D.parseScale = parseScale; D.sheetSize = sheetSize;
  D.newDrawing = newDrawing; D.addView = addView; D.projectionKey = projectionKey; D.putProjection = putProjection; D.sectionJob = sectionJob; D.putSection = putSection;
  // isSheetMetal(model): a part with sheet-metal parameters and a Base Flange (Model View offers Flat pattern)
  D.isSheetMetal = function (model) { return !!(model && model.type !== 'assembly' && model.sheet && (model.features || []).some(function (f) { return f.sheetBase && !f.suppressed; })); };
  D.addFlatView = addFlatView; D.flatExtents = flatExtents; D.viewExtents = viewExtents;
  D.viewFrame = viewFrame; D.nextLabel = nextLabel; D.addProjectedView = addProjectedView; D.addSectionView = addSectionView; D.detailScale = detailScale; D.addDetailView = addDetailView;
  D.TB_FIELDS = TB_FIELDS; D.titleText = titleText; D.titleFieldAt = titleFieldAt; D.titleBlock = titleBlock;
  D.standard3View = standard3View; D.extentsOf = extentsOf; D.layout = layout; D.moveView = moveView; D.deleteView = deleteView; D.findView = findView;
  D.fmtDim = fmtDim; D.inchText = inchText; D.fracText = fracText; D.dimStyle = dimStyle; D.autoDims = autoDims; D.dimText = dimText; D.slotsIn = slotsIn; D.slotText = slotText;
  D.arcSlotsIn = arcSlotsIn; D.sketchOrdinates = sketchOrdinates;
  D.partInfo = partInfo; D.asmPartMaterials = asmPartMaterials; D.BOM_COLS = BOM_COLS; D.BOM_TYPES = BOM_TYPES; D.bomType = bomType; D.bomColumnSpecs = bomColumnSpecs; D.bomColumns = bomColumns;
  D.bomRows = bomRows; D.BOM_ANCHORS = BOM_ANCHORS; D.bomPropertyNames = bomPropertyNames; D.bomBox = bomBox; D.autoBalloon = autoBalloon; D.deleteBalloons = deleteBalloons; D.balloonSpots = balloonSpots;
  _.MM = MM; _.paperK = paperK; _.viewScale = viewScale; _.cachedProjection = cachedProjection; _.BORDER = BORDER; _.TB_W = TB_W; _.TB_H = TB_H; _.GAP = GAP; _.HATCH = HATCH;
  _.viewContent = viewContent; _.autoDimKey = autoDimKey; _.partInfoCache = partInfoCache; _.hasMaterials = hasMaterials; _.bomCell = bomCell; _.BOM_TEXT = BOM_TEXT;
})(Drawing, Drawing._);
