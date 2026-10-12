// drawing-sheet.js — sheets and the drawing document for the drawing engine (Drawing, see drawing.js): sheet formats
// and standard scales, newDrawing / addView, the per-mesh projection cache with its lazy mode (LAZY: views still to be
// worked out in drawing-worker.js) and the section jobs, projected / section / detail views placed beside their parent
// or fitted onto the sheet, the title block with its $PRPSHEET / $PRP links, Standard 3 View and its layout, moving
// and deleting views, automatic model dimensions (overall sizes, diameters, radii, straight and arc slot callouts, the
// part's sketch ordinate sets and its sketch location dimensions, marked for drawing) and dimension text, and assembly
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
  // (rfT) inch drawings use the ANSI (ASME Y14.1) scale set: halving from 8:1 down to 1:64, no 1:5 / 1:10 / 1:25
  var ANSI_SCALES = [[8, 1], [4, 1], [2, 1], [1, 1], [1, 2], [1, 4], [1, 8], [1, 16], [1, 32], [1, 64]];
  // scalesFor(units | doc) -> the standard scales of the drawing's unit system, largest first
  function scalesFor(u) { var units = u && typeof u === 'object' ? u.units : u; return units === 'in' ? ANSI_SCALES : SCALES; }
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
    if (v.kind === 'detail' && v.detail) { var dh = _.detailHalf(v.detail); hw = dh[0] * s; hh = dh[1] * s; lab = 14 * k; }
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
    var rvb = revBox(doc, doc.units); if (rvb) obs.push(rvb);
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
    var smaller = scalesFor(doc).filter(function (s) { var q = scaleValue(s); return q < s0 - 1e-9 && q >= s0 / 4 - 1e-9 && q > lo + 1e-9; });
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
  // (rfV) opts.type 'half' | 'offset' | 'aligned' (+ c, side, jogs, angle …): the full section, then
  // Drawing.setSectionType (drawing-views.js); a refused type takes the new view off again
  // (rfZ) opts.partial [from, to] (a full section's cutting line stops at its ends) and opts.scaleWithModel (the line
  // keeps its place on the part as it changes size): Drawing.setSectionOptions
  function addSectionView(doc, mesh, parentId, opts) {
    var t = opts && opts.type, more = opts && (opts.partial || opts.scaleWithModel);
    if ((!t || t === 'full') && !more) return addFullSection(doc, mesh, parentId, opts);
    var nv = doc.views.length, nn = doc.nextView, v = addFullSection(doc, mesh, parentId, opts);
    try {
      if (t && t !== 'full') D.setSectionType(doc, v.id, opts);
      if (more) D.setSectionOptions(doc, mesh, v.id, { partial: opts.partial || undefined, scaleWithModel: opts.scaleWithModel ? true : undefined });
    } catch (err) { doc.views.splice(nv); doc.nextView = nn; throw err; }
    return v;
  }
  function addFullSection(doc, mesh, parentId, opts) {
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
    var all = SCALES.concat(ANSI_SCALES);
    for (var i = 0; i < all.length; i++) if (Math.abs(scaleValue(all[i]) - want) < 1e-9) return all[i].slice();
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
    // (rfZ) a Profile (opts.shape 'profile', a, b: a rectangle's corners) instead of the circle; opts.style (Per standard /
    // Broken / Leader / No leader / Connected) and opts.outline ('full' | 'jagged'): see drawing-views.js
    var prof = _.detailProfile(opts);
    if (!prof && !(opts.r > 0)) throw new Error('A detail circle needs a radius');
    var dt = prof || { c: [+opts.c[0], +opts.c[1]], r: +opts.r };
    _.detailOpts(dt, opts);
    var label = opts.label || nextLabel(doc), sc = opts.scale ? (Array.isArray(opts.scale) ? opts.scale : parseScale(opts.scale)) : detailScale(par.scale || doc.sheet.scale || [1, 1]);
    var s = scaleValue(sc), g = GAP * paperK(doc.units), pe = viewExtents(doc, mesh, par), ps = viewScale(doc, par);
    var v = addView(doc, par.orient, { kind: 'detail', name: 'Detail View ' + label + ' (' + scaleText(sc) + ')', label: label, parent: par.id, align: null,
      detail: dt, scale: sc, display: par.display,
      x: opts.x != null ? opts.x : par.x + pe.w * ps / 2 + g + _.detailHalf(dt)[0] * s, y: opts.y != null ? opts.y : par.y });
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
    { key: 'sheet', label: 'SHEET', row: 2, x0: 140, x1: 180, link: '$PRP:"SW-Sheet"' },
    // the sheet format's left blocks (rfM), in the strip left of the title block (it is kept clear of views already):
    // COMPANY, DRAWN / CHECKED with their dates (the drawing's own properties, SolidWorks' template names), and the
    // GENERAL TOLERANCES block (UNLESS OTHERWISE SPECIFIED, inch defaults .XX ±.01 .XXX ±.005 ANGLES ±1°). `block`
    // names the group: a sheet too narrow for a group leaves it out (tol first, then eng).
    { key: 'company', label: 'COMPANY', row: 0, x0: -60, x1: 0, link: '$PRP:"CompanyName"', block: 'eng', upper: true },
    { key: 'drawnBy', label: 'DRAWN', row: 1, x0: -60, x1: -25, link: '$PRP:"DrawnBy"', block: 'eng' },
    { key: 'drawnDate', label: 'DATE', row: 1, x0: -25, x1: 0, link: '$PRP:"DrawnDate"', block: 'eng' },
    { key: 'checkedBy', label: 'CHECKED', row: 2, x0: -60, x1: -25, link: '$PRP:"CheckedBy"', block: 'eng' },
    { key: 'checkedDate', label: 'DATE', row: 2, x0: -25, x1: 0, link: '$PRP:"CheckedDate"', block: 'eng' },
    { key: 'tolerances', label: 'UNLESS OTHERWISE SPECIFIED', row: 0, rows: 3, x0: -125, x1: -60, link: '$PRP:"GeneralTolerances"', block: 'tol', multi: true }
  ];
  // the sheet format blocks left of the title block: [name, x0 (paper mm from the title block's left edge)]
  var TB_BLOCKS = { eng: -60, tol: -125 };
  // tbBlocks(S, units) -> { eng: bool, tol: bool }: which left blocks fit inside the border on this sheet
  function tbBlocks(S, units) {
    var k = paperK(units), room = (S[0] - 2 * BORDER * k) / k - TB_W, out = {};
    Object.keys(TB_BLOCKS).forEach(function (b) { out[b] = room >= -TB_BLOCKS[b] - 1e-9; });
    return out;
  }
  // the inch general tolerances (ASME Y14.5 decimal-place tolerances, a sheet-metal shop's usual block) and mm ones
  function generalTolerances(units) {
    return units === 'in' ? 'DIMENSIONS ARE IN INCHES\nTOLERANCES:\n.XX \u00b1.01\n.XXX \u00b1.005\nANGLES \u00b11\u00b0' :
      'DIMENSIONS ARE IN MILLIMETERS\nTOLERANCES:\nX.X \u00b10.2\nX.XX \u00b10.1\nANGLES \u00b11\u00b0';
  }
  // fieldRect(f, S, units) -> the paper rectangle of title block field f
  function fieldRect(f, S, units) {
    var k = paperK(units), b1 = BORDER * k, tw = TB_W * k, th = TB_H * k, tx0 = S[0] - b1 - tw, ty0 = b1, row = th / 3;
    return { x0: tx0 + f.x0 * k, x1: tx0 + f.x1 * k, y1: ty0 + th - f.row * row, y0: ty0 + th - (f.row + (f.rows || 1)) * row };
  }
  function drawingProp(doc, name, units) {
    switch (String(name).trim().toLowerCase()) {
      case 'sw-file name': return doc.name;
      case 'sw-sheet name': return doc.sheet.name;
      case 'sw-sheet scale': return scaleText(doc.sheet.scale || [1, 1]);
      case 'sw-units': return String(units).toUpperCase();
      case 'sw-date': return doc.date;
      case 'sw-projection': return doc.sheet.projection === 'first' ? 'FIRST ANGLE' : 'THIRD ANGLE';
      case 'sw-sheet': return ((doc.activeSheet | 0) + 1) + ' OF ' + sheetCount(doc);
    }
    var own = doc.properties || {}, key = String(name).trim().toLowerCase();
    for (var k in own) if (k.toLowerCase() === key) return String(own[k]);
    // (rfM) the general tolerances block's default text; Revision: the latest row of the Revision Table
    if (key === 'generaltolerances') return generalTolerances(units);
    if (key === 'revision') return latestRev(doc) || '';
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
    var hit = null, on = tbBlocks(S, units);
    TB_FIELDS.forEach(function (f) {
      if (f.block && !on[f.block]) return;
      var r = fieldRect(f, S, units);
      if (!hit && p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1) hit = { field: f, rect: r };
    });
    return hit;
  }
  // tbRects(S, units) -> the paper boxes of the title block and the left blocks that fit (kept clear of annotations)
  function tbRects(S, units) {
    var k = paperK(units), b1 = BORDER * k, x1 = S[0] - b1, tx0 = x1 - TB_W * k, on = tbBlocks(S, units), out = [{ x0: tx0, y0: b1, x1: x1, y1: b1 + TB_H * k }];
    var lo = 0; Object.keys(TB_BLOCKS).forEach(function (b) { if (on[b]) lo = Math.min(lo, TB_BLOCKS[b]); });
    if (lo < 0) out.push({ x0: tx0 + lo * k, y0: b1, x1: tx0, y1: b1 + TB_H * k });
    return out;
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
      // (rfM) REV: a Revision Table's latest revision (SolidWorks' table drives REV), unless the field was edited
      if (f.key === 'rev' && own.rev == null && latestRev(doc)) v = latestRev(doc);
      // (rfT) an unset material prints an empty cell: 'Material <not specified>' is SolidWorks' tree text, never on a print
      if (f.key === 'material' && own.material == null && /<\s*not specified\s*>/i.test(v)) v = '';
      if (!v && f.fallback) v = String(model && model.name || 'Part');
      if (f.multi) v = v.replace(/\\n/g, '\n');   // (a block typed on one line: a backslash-n between its lines)
      out[f.key] = f.upper ? v.toUpperCase() : v;
    });
    return out;
  }
  // viewContent(doc, v, mesh, parentContent) -> { frame, proj, center: [u, v] (the model point at the view's x, y),
  // caps (section faces to hatch), clip (a detail circle), section }. Section and detail views are centred on the
  // whole part's extents in their frame (not on what is left of it), so they stay aligned with their parent.
  // (rfV) the view kinds of drawing-views.js, directly: a half / offset / aligned section is cut along its path
  // (_.pathContent), an auxiliary view stays square to its parent's edge (_.auxCenter), a crop keeps what lies inside
  // it (_.cropContent); plainContent is everything else
  function viewContent(doc, v, mesh, parentContent) {
    var ct = _.typedSection(doc, v, parentContent) ? _.pathContent(doc, v, mesh, parentContent) : plainContent(doc, v, mesh, parentContent);
    if (!ct || !ct.proj) return ct;
    _.auxCenter(doc, v, ct, parentContent);
    if (v.crop && v.kind !== 'detail' && v.kind !== 'flat') ct = _.cropContent(ct, v.crop);
    if (v.kind === 'section' && v.section && v.section.partial) ct = _.partialContent(v, ct);   // (rfZ) a partial section
    return ct;
  }
  function plainContent(doc, v, mesh, parentContent) {
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
      if (dt.shape === 'profile' && dt.a && dt.b) return _.detailProfileContent(pc, dt, s);   // (rfZ) a rectangle profile
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
  // layoutViews(doc, mesh, units): layout, then auxiliary views follow their parents (_.carryAux; Drawing.layout)
  function layoutViews(doc) {
    var before = _.viewPositions(doc), r = layout.apply(this, arguments);
    _.carryAux(doc, before);
    return r;
  }
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
    // (rfM) a Revision Table is one too
    var revK = revBox(doc, units);
    function hitsBox(K, b) { return K && b.x1 > K.x0 - g / 2 && b.x0 < K.x1 + g / 2 && b.y1 > K.y0 - g / 2 && b.y0 < K.y1 + g / 2; }
    function hitsBom(b) { return hitsBox(bomK, b) || hitsBox(revK, b); }
    // place(sv, packed): view centres for scale sv, the block centred in the usable area (or packed into the corner
    // away from the BOM); null when a view would cover the BOM
    // (rfT) the margin round the Front / Top / Right block: a full view gap on metric sheets; a quarter of one on inch
    // sheets, so a part fills the sheet at the largest ANSI scale that fits (a 6 x 4 bracket on ANSI B at 1:1)
    var m = units === 'in' ? g / 4 : g;
    function place(sv, packed) {
      var W = Wm * sv, H = Hm * sv, D = Dm * sv, blockW = W + g + D, blockH = H + g + D, P = {};
      var left = A.x0 + Math.max(m, (availW - blockW) / 2), bottom = A.y0 + Math.max(m, (availH - blockH) / 2);
      if (packed) {
        left = bomK && /left/.test(bomK.anchor) ? A.x1 - m - blockW : A.x0 + m;
        bottom = bomK && /bottom/.test(bomK.anchor) ? A.y1 - m - blockH : A.y0 + m;
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
    // (rfT) on an inch sheet the isometric must fit its corner at half the sheet scale or more (it may drop one step)
    var Iso = units === 'in' && byRole.iso ? extentsOf(mesh, byRole.iso.orient) : null;
    function isoFits(P, sv) {
      if (!Iso || !P) return !!P;
      var bw0 = P.isoBox.x1 - P.isoBox.x0 - g / 2, bh0 = P.isoBox.y1 - P.isoBox.y0 - g / 2;
      return Iso.w * sv / 2 <= bw0 + 1e-9 && Iso.h * sv / 2 <= bh0 + 1e-9;
    }
    function fits(sv) { return (Wm + Dm) * sv + g + 2 * m <= availW && (Hm + Dm) * sv + g + 2 * m <= availH && (isoFits(place(sv), sv) || isoFits(place(sv, true), sv)); }
    var SC = scalesFor(units);
    if (doc.sheet.autoScale || !doc.sheet.scale) {
      var s = SC[SC.length - 1];
      for (var i = 0; i < SC.length; i++) if (fits(scaleValue(SC[i]))) { s = SC[i]; break; }
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
      if (revK && revK.x1 > isoBox.x0 && revK.x0 < isoBox.x1 && revK.y1 > isoBox.y0 && revK.y0 < isoBox.y1) isoBox.y1 = Math.min(isoBox.y1, revK.y0 - g / 2);
      var I = extentsOf(mesh, byRole.iso.orient), bw = isoBox.x1 - isoBox.x0 - g / 2, bh = isoBox.y1 - isoBox.y0 - g / 2;
      byRole.iso.scale = null;
      if (I.w * sv2 > bw || I.h * sv2 > bh) {
        for (var j = 0; j < SC.length; j++) { var q = scaleValue(SC[j]); if (q < sv2 && I.w * q <= bw && I.h * q <= bh) { byRole.iso.scale = SC[j]; break; } }
        if (!byRole.iso.scale) byRole.iso.scale = SC[SC.length - 1];
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
  // (rfV) an auxiliary view slides along its axis only (_.auxSlide) and follows its parent (_.carryAux, drawing-views.js)
  function moveView(doc, id, x, y) {
    var at = _.auxSlide(doc, id, x, y), before = _.viewPositions(doc), r = moveOneView(doc, id, at[0], at[1]);
    _.carryAux(doc, before);
    return r;
  }
  function moveOneView(doc, id, x, y) {
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
  // (rfT) the dimension style's sizes (Document Properties > Dimensions), in the drawing's units: ANSI inch (ASME
  // Y14.2 / SolidWorks' ANSI template) .125 text, .125 x .042 arrows (3:1), a .0625 gap from the part and .125 beyond
  // the dimension line; ISO millimetre drawings keep 3.5 text, 3 x 1 arrows, 1.5 gap, 2 beyond. doc.options.dimText,
  // arrowLen, arrowWidth, extGap, extBeyond override them.
  var DIM_SIZES = { 'in': { dimText: 0.125, arrowLen: 0.125, arrowWidth: 0.042, extGap: 0.0625, extBeyond: 0.125 }, mm: { dimText: 3.5, arrowLen: 3, arrowWidth: 1, extGap: 1.5, extBeyond: 2 } };
  // dimSizes(doc) -> { units, dimText, arrowLen, arrowWidth, extGap, extBeyond } in the drawing's units
  function dimSizes(doc) {
    var u = doc && doc.units === 'in' ? 'in' : 'mm', o = doc && doc.options || {}, df = DIM_SIZES[u], out = { units: u };
    Object.keys(df).forEach(function (q) { out[q] = +o[q] > 0 ? +o[q] : df[q]; });
    return out;
  }
  // dimGeometry(doc) -> the same in paper mm: { text, arrow, arrowW (full width), gap, ext } (drawing-render.js)
  function dimGeometry(doc) {
    var z = dimSizes(doc), f = z.units === 'in' ? MM : 1;
    return { text: z.dimText * f, arrow: z.arrowLen * f, arrowW: z.arrowWidth * f, gap: z.extGap * f, ext: z.extBeyond * f };
  }
  // autoDims(doc, projections, units) -> [{ view, kind: 'h' | 'v' | 'dia', … model-space geometry, text }]
  // Overall width and height on the Front view (below and to the left), overall depth on the Top view (left side),
  // and every distinct circle diameter once, in the first ortho view that shows it as a visible circle ("4X Ø8").
  // (rfT) modelItems(doc) -> the Model Items PropertyManager's choices (doc.modelItems, written by its OK; absent on a
  // drawing made before it or never given Model Items: today's set, overall sizes / diameters / radii / slots / sketch
  // dimensions): source 'entire' | 'feature' (+ feature: the feature id: only that feature's dimensions), views null
  // (all) or [view ids] (Destination: the selected views), marked (Marked for drawing: the sketch / feature
  // dimensions, overall sizes, radii, slots, flange lengths), holeLocations (Hole Wizard locations: every hole centre
  // located from the view's left and bottom edges when no sketch dimension locates it), holeCallouts (the hole
  // diameters), annotations (centre marks and centrelines), dedupe (Options > Eliminate duplicates), pm (set by the PM)
  function modelItems(doc) {
    var m = doc && doc.modelItems || null;
    return { pm: !!m, source: m && m.source === 'feature' && m.feature != null ? 'feature' : 'entire', feature: m && m.source === 'feature' ? m.feature : null,
      views: m && Array.isArray(m.views) && m.views.length ? m.views.slice() : null, marked: !m || m.marked !== false, holeLocations: !!m && m.holeLocations !== false,
      holeCallouts: !m || m.holeCallouts !== false, annotations: !m || m.annotations !== false, dedupe: !m || m.dedupe !== false };
  }
  function autoDims(doc, projections, units) {
    var MI = modelItems(doc), dims = [];
    var order = doc.views.filter(function (v) { return ORTHO[v.orient] && (!v.kind || v.kind === 'projected') && projections[v.id] && (!MI.views || MI.views.indexOf(v.id) >= 0); });
    if (MI.source === 'feature') return featureItems(doc, order, projections, units, MI);
    var roleOrder = { front: 0, top: 1, right: 2 };
    order.sort(function (a, b) { return (roleOrder[a.role] != null ? roleOrder[a.role] : 5) - (roleOrder[b.role] != null ? roleOrder[b.role] : 5) || a.id - b.id; });
    var front = order.filter(function (v) { return v.role === 'front'; })[0] || order[0];
    var top = order.filter(function (v) { return v.role === 'top'; })[0];
    if (front && MI.marked) {
      var b = projections[front.id].bounds;
      dims.push({ view: front.id, kind: 'h', a: [b.umin, b.vmin], b: [b.umax, b.vmin], side: -1, value: b.umax - b.umin, auto: true });
      dims.push({ view: front.id, kind: 'v', a: [b.umin, b.vmin], b: [b.umin, b.vmax], side: -1, value: b.vmax - b.vmin, auto: true });
    }
    if (top && top !== front && MI.marked) {
      var bt = projections[top.id].bounds;
      dims.push({ view: top.id, kind: 'v', a: [bt.umin, bt.vmin], b: [bt.umin, bt.vmax], side: -1, value: bt.vmax - bt.vmin, auto: true });
    }
    perViews(order, false);
    // (rfAB) a flat-pattern view is a configuration of its own (SolidWorks' flat pattern): the Model Items PM brings it
    // the blank's items as well — the hole callouts, slots and radii it shows and the dimensions of the sketches that lie
    // on the base (the Base Flange's sketch: its dimensions and ordinates read true in the flat), plus the hole
    // locations. No bend radius or bend deduction: those are the bend notes' and the Bend Table's.
    if (MI.pm) doc.views.forEach(function (fv) {
      if (fv.kind === 'flat' && projections[fv.id] && !projections[fv.id].error && (!MI.views || MI.views.indexOf(fv.id) >= 0)) perViews([fv], true);
    });
    dims.forEach(function (d) { d.text = dimText(d, units); });
    return dims;
    // the items of the views of `order` (flat: one flat-pattern view)
    function perViews(order, flat) {
    var done = {};
    if (MI.holeCallouts) order.forEach(function (v) {
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
    var rdone = {}, T = sheetThickness();
    // (rfT) a sheet-metal bend's outside radius (R + T, concentric with the inside one) is no model dimension: only the
    // bend radius is inserted, as SolidWorks does
    function outsideBend(pr, a) {
      if (!(T > 0) || !(a.r > T)) return false;
      var tl = 1e-6 * (1 + a.r);
      return [pr.arcs.visible, pr.arcs.hidden || []].some(function (list) {
        return list.some(function (b) { return Math.abs(b.r - (a.r - T)) <= tl && Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]) <= tl; });
      });
    }
    if (MI.marked) order.forEach(function (v) {
      var pr = projections[v.id];
      if (!pr || !pr.arcs) return;
      var groups = {}, gk = [];
      pr.arcs.visible.forEach(function (a) {
        if (a.src !== 'arc' || slotEnd(v, a) || outsideBend(pr, a)) return;
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
    if (MI.marked) dims = dims.concat(slotDims);
    // the part's sketch ordinate sets (sketch-ordinate), as drawing ordinate dimensions in the first view that looks
    // square at their sketch
    if (MI.marked) dims = dims.concat(sketchOrdinates(doc, order, projections));
    // the sketches' location dimensions (distance relations), marked for drawing (sketch-text2 lane: Model Items ▸
    // Marked for drawing); pushed last, so the items above keep their style keys
    if (MI.marked) dims = dims.concat(sketchDistances(doc, order, projections, dims));
    // (rfT) from the Model Items PM only (drawings made before it keep their items and style keys): flange lengths
    // and the hole locations
    // (rfAB) the sketches' own Smart Dimensions (a line's length, a rectangle's width / height: the typed 10 x 6 of a
    // blank), from the Model Items PM only
    if (MI.pm && MI.marked) dims = dims.concat(sketchEntityDims(doc, order, projections, dims));
    if (MI.pm && MI.marked && !flat) dims = dims.concat(flangeLengths(doc, order, projections, dims, null, MI));
    if (MI.pm && MI.holeLocations) dims = dims.concat(holeLocations(doc, order, projections, dims, MI));
    }
  }
  // the sheet thickness of the part being drawn (0 when it is not sheet metal)
  function sheetThickness() {
    var ctx = _.CTX, model = ctx && ctx.model;
    if (!model || !model.sheet) return 0;
    var fl = ctx.build && ctx.build.flanges, T = 0;
    if (fl) Object.keys(fl).forEach(function (id) { (fl[id] || []).forEach(function (r) { if (!T && r && r.T > 0) T = r.T; }); });
    if (!T) { try { T = +K.resolvedModel(model).model.sheet.thickness; } catch (e) { T = +model.sheet.thickness; } }
    return T > 0 ? T : 0;
  }
  // sameSpan(x, d, tol): x shows the span d does (Options > Eliminate duplicates)
  function sameSpan(x, d, tol) {
    if (x.view !== d.view || x.kind !== d.kind || !x.a || !x.b || Math.abs(x.value - d.value) > tol) return false;
    var ix = d.kind === 'v' ? 1 : 0;
    if (d.kind === 'aligned') return Math.hypot(x.a[0] - d.a[0], x.a[1] - d.a[1]) <= tol && Math.hypot(x.b[0] - d.b[0], x.b[1] - d.b[1]) <= tol;
    return Math.abs(Math.min(x.a[ix], x.b[ix]) - Math.min(d.a[ix], d.b[ix])) <= tol;
  }
  // flangeLengths(doc, order, projections, dims, onlyId, MI) -> the Edge Flange lengths (rfT), as the shop dimensions
  // them: from the outside of the sheet the flange rises from to the flange's end (its outer virtual sharp at 90 deg),
  // in the first view of `order` that looks along the flange's edge (the flange seen edge-on, as an L); one per
  // distinct span, none where an item already shows it (an overall height). 90 deg flanges only; onlyId: one feature.
  function flangeLengths(doc, order, projections, dims, onlyId, MI) {
    var ctx = _.CTX, model = ctx && ctx.model, fl = ctx && ctx.build && ctx.build.flanges, mesh = ctx && ctx.mesh, out = [];
    if (!model || !model.features || !fl || !mesh) return out;
    var P = mesh.positions64 || mesh.positions;
    model.features.forEach(function (f) {
      if (f.type !== 'flange' || f.hem || f.suppressed || (onlyId != null && f.id !== onlyId)) return;
      (fl[f.id] || []).forEach(function (rec) {
        if (!rec || Math.abs(rec.angle - Math.PI / 2) > 1e-6 || !rec.u || !rec.o) return;
        var t3 = V.sub(rec.b, rec.a), Le = V.len(t3);
        if (!(Le > 0)) return;
        t3 = V.scale(t3, 1 / Le);
        var maxU = -Infinity, tl = 1e-6 * (1 + Le);
        for (var i = 0; i < P.length; i += 3) {
          var p = [P[i], P[i + 1], P[i + 2]], along = V.dot(V.sub(p, rec.a), t3);
          if (V.dot(V.sub(p, rec.mid), rec.o) < -tl || along < -tl || along > Le + tl) continue;
          var hu = V.dot(V.sub(p, rec.origin), rec.u);
          if (hu > maxU) maxU = hu;
        }
        if (!(maxU > 0)) return;
        var value = maxU + rec.T, v = null, F = null;
        for (var j = 0; j < order.length && !v; j++) { var Fj = viewFrame(doc, order[j]); if (Fj && Math.abs(Math.abs(V.dot(t3, Fj.e)) - 1) < 1e-9) { v = order[j]; F = Fj; } }
        if (!v) return;
        var kind = Math.abs(Math.abs(V.dot(rec.u, F.v)) - 1) < 1e-9 ? 'v' : Math.abs(Math.abs(V.dot(rec.u, F.u)) - 1) < 1e-9 ? 'h' : null;
        if (!kind) return;
        // the outer face of the sheet at the edge (T below the face the flange rises from) and the flange's outer end
        var m0 = V.add(rec.mid, V.scale(rec.u, -V.dot(V.sub(rec.mid, rec.origin), rec.u) - rec.T));
        var p1 = V.add(V.add(m0, V.scale(rec.u, value)), V.scale(rec.o, rec.R + rec.T));
        var a2 = [V.dot(m0, F.u), V.dot(m0, F.v)], b2 = [V.dot(p1, F.u), V.dot(p1, F.v)];
        var bd = projections[v.id].bounds, cu = (bd.umin + bd.umax) / 2, cv = (bd.vmin + bd.vmax) / 2;
        var d = { view: v.id, kind: kind, a: a2, b: b2, value: value, auto: true, flange: f.id };
        d.side = kind === 'v' ? (b2[0] > cu ? 1 : -1) : (b2[1] > cv ? 1 : -1);
        var tol = 1e-7 * (1 + Math.max(bd.umax - bd.umin, bd.vmax - bd.vmin));
        if (MI.dedupe !== false && (dims.some(function (x) { return sameSpan(x, d, tol); }) || out.some(function (x) { return sameSpan(x, d, tol); }))) return;
        out.push(d);
      });
    });
    return out;
  }
  // holeLocations(doc, order, projections, dims, MI) -> Model Items > Hole Wizard locations (rfT): every hole (a
  // visible circle) of a view that looks along it, located from the view's left edge (horizontal, above the view) and
  // bottom edge (vertical, right of the view) unless a sketch dimension already locates it that way; holes in line
  // share one (Eliminate duplicates). A hole axis is located in the first view of `order` that shows it.
  function holeLocations(doc, order, projections, dims, MI) {
    var out = [], axes = {};
    order.forEach(function (v) {
      var pr = projections[v.id], F = viewFrame(doc, v);
      if (!pr || !F) return;
      var ak = F.e.map(function (x) { return Math.round(Math.abs(x) * 1e6); }).join(',');
      if (axes[ak]) return;
      var bd = pr.bounds, span = Math.max(bd.umax - bd.umin, bd.vmax - bd.vmin, 1e-9), tol = 1e-6 * span, cs = [];
      pr.circles.visible.forEach(function (c) { if (!c.sil && !cs.some(function (q) { return Math.hypot(q[0] - c.c[0], q[1] - c.c[1]) <= tol; })) cs.push(c.c); });
      if (!cs.length) return;
      axes[ak] = 1;
      function located(c, kind) {
        return dims.some(function (x) {
          if (x.view !== v.id || x.kind !== kind || !x.a || !x.b) return false;
          return [x.a, x.b].some(function (p) { return Math.hypot(p[0] - c[0], p[1] - c[1]) <= tol; });
        });
      }
      [['h', 0], ['v', 1]].forEach(function (k2) {
        var kind = k2[0], ax = k2[1], lo = ax ? bd.vmin : bd.umin, seen = [];
        cs.slice().sort(function (p, q) { return p[ax] - q[ax]; }).forEach(function (c) {
          if (c[ax] - lo <= tol || located(c, kind)) return;
          if (MI.dedupe !== false && seen.some(function (x) { return Math.abs(x - c[ax]) <= tol; })) return;
          seen.push(c[ax]);
          var a = ax ? [bd.umax, lo] : [lo, bd.vmax];
          out.push({ view: v.id, kind: kind, a: a, b: c.slice(), value: c[ax] - lo, side: 1, auto: true, hole: true });
        });
      });
    });
    return out;
  }
  // featureItems(doc, order, projections, units, MI): Model Items > Source: Selected feature, the dimensions of that
  // feature only: its sketch's marked location dimensions (a sketch, or a feature made from one) and, for an Edge
  // Flange, its flange lengths
  function featureItems(doc, order, projections, units, MI) {
    var ctx = _.CTX, model = ctx && ctx.model, out = [];
    if (!model || !model.features) return out;
    var f = model.features.filter(function (x) { return x.id === MI.feature; })[0];
    if (!f) return out;
    var sk = f.type === 'sketch' ? f.id : f.sketch;
    if (MI.marked && sk != null) out = sketchDistances(doc, order, projections, [], sk);
    if (MI.marked && sk != null) out = out.concat(sketchEntityDims(doc, order, projections, out, sk));   // (rfAB)
    if (MI.marked && f.type === 'flange') out = out.concat(flangeLengths(doc, order, projections, out, f.id, MI));
    // (rfAB) and in each flat-pattern view, when the feature's sketch lies on the base
    if (MI.marked && sk != null) doc.views.forEach(function (fv) {
      if (fv.kind !== 'flat' || !projections[fv.id] || projections[fv.id].error || (MI.views && MI.views.indexOf(fv.id) < 0)) return;
      var fo = sketchDistances(doc, [fv], projections, out, sk);
      out = out.concat(fo, sketchEntityDims(doc, [fv], projections, out.concat(fo), sk));
    });
    out.forEach(function (d) { d.text = dimText(d, units); });
    return out;
  }
  // sketchDistances(doc, order, projections, dims) -> model items for the part's sketch location dimensions, as
  // SolidWorks' Insert Model Items ▸ Marked for drawing brings them: every distance relation of every unsuppressed
  // sketch — point to point (horizontal, vertical or aligned), point to line, between parallel lines; a circle or arc
  // by its centre — that is marked for drawing (rel.mark: on unless false; a driven one only when set true), not a
  // member of an ordinate set (those come as ordinate dimensions) and not radial, in the first ortho view of `order`
  // that looks square at its sketch: a linear dimension between the two points it measures (kind h / v as the
  // relation's direction lies in the view, else h / v / aligned as the points lie), on the side of the view nearer to
  // them, with sketchRel 'sketchId:relIndex' (its key) and relSrc { f, i } (Drawing.sketchDimProps then gives it the
  // relation's tolerance, precision, text and name). One that measures what an item in `dims` already shows (an
  // overall size) is not added again: that item takes the relation's relSrc instead.
  function sketchDistances(doc, order, projections, dims, onlySketch) {
    var ctx = _.CTX, model = ctx && ctx.model, S = typeof SketchSolver !== 'undefined' ? SketchSolver : null, out = [];
    if (!model || model.type === 'assembly' || !model.features || !S || !S.refKind) return out;
    var rm;
    try { rm = K.resolvedModel(model).model; } catch (e) { rm = model; }
    var planes = ctx.build && ctx.build.planes || {};
    function sub2(p, q) { return [p[0] - q[0], p[1] - q[1]]; }
    // the sketch point a ref stands for (a circle / arc: its centre), or a line { a, b }
    function refGeo(f, r) {
      var k = S.refKind(f, r);
      if (k === 'point') return { p: S.refPoint(f, r) };
      if (k === 'circle') return { p: S.refCurve(f, r).c };
      if (k === 'line') { var L = S.refCurve(f, r); return { a: L.a, b: L.b }; }
      return null;
    }
    // the foot of p on the infinite line a–b; along an axis (ax 0 / 1) instead: where the line through p along it meets a–b
    function onLine(p, L, ax) {
      var d = sub2(L.b, L.a), dd = d[0] * d[0] + d[1] * d[1];
      if (!(dd > 0)) return null;
      if (ax == null) { var t = ((p[0] - L.a[0]) * d[0] + (p[1] - L.a[1]) * d[1]) / dd; return [L.a[0] + d[0] * t, L.a[1] + d[1] * t]; }
      var o = 1 - ax;
      if (Math.abs(d[o]) < 1e-12 * Math.sqrt(dd)) return null;
      var q = [0, 0]; q[o] = p[o]; q[ax] = L.a[ax] + d[ax] * (p[o] - L.a[o]) / d[o];
      return q;
    }
    (rm.features || []).forEach(function (f) {
      if (f.type !== 'sketch' || f.suppressed || !f.rels || (onlySketch != null && f.id !== onlySketch)) return;
      var list = [];
      f.rels.forEach(function (rel, i) {
        if (!rel || rel.type !== 'distance' || rel.ord != null || rel.suppressed || rel.dir === 'r' || !rel.refs || rel.refs.length !== 2) return;
        if (rel.mark === false || (rel.driven && rel.mark !== true)) return;
        list.push(i);
      });
      if (!list.length) return;
      var pl;
      try { pl = K.resolvePlane(f.plane, rm, planes); } catch (e) { return; }
      var tg = sketchTarget(doc, order, projections, pl);
      if (!tg) return;
      var v = tg.v, F = tg.F;
      var bd = projections[v.id].bounds, cu = (bd.umin + bd.umax) / 2, cv = (bd.vmin + bd.vmax) / 2, span = Math.max(bd.umax - bd.umin, bd.vmax - bd.vmin, 1e-9), tol = 1e-7 * span;
      function view2(p) { return tg.at(K.to3D(pl, p[0], p[1])); }
      var zones = slotZones(projections[v.id]);
      list.forEach(function (i) {
        var rel = f.rels[i], A = refGeo(f, rel.refs[0]), B = refGeo(f, rel.refs[1]);
        if (!A || !B) return;
        var ax = rel.dir === 'h' ? 0 : rel.dir === 'v' ? 1 : null, a, b;
        if (A.p && B.p) { a = A.p; b = B.p; }
        else if (A.p || B.p) { a = A.p || B.p; b = onLine(a, A.p ? B : A, ax); }
        else { a = [(A.a[0] + A.b[0]) / 2, (A.a[1] + A.b[1]) / 2]; b = onLine(a, B, ax); }   // two (parallel) lines
        if (!a || !b) return;
        var a2 = view2(a), b2 = view2(b), kind;
        if (ax != null) {
          var d3 = ax === 0 ? pl.x : pl.y;
          kind = Math.abs(Math.abs(V.dot(d3, F.u)) - 1) < 1e-9 ? 'h' : Math.abs(Math.abs(V.dot(d3, F.v)) - 1) < 1e-9 ? 'v' : null;
        } else {
          var dx = b2[0] - a2[0], dy = b2[1] - a2[1], ln = Math.hypot(dx, dy);
          kind = Math.abs(dy) <= 1e-9 * ln ? 'h' : Math.abs(dx) <= 1e-9 * ln ? 'v' : 'aligned';
        }
        if (!kind) return;
        var value = kind === 'h' ? Math.abs(b2[0] - a2[0]) : kind === 'v' ? Math.abs(b2[1] - a2[1]) : Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
        if (!(value > tol) || inSlot(zones, a2, b2, 10 * tol)) return;   // (rfAB) a slot's own size: its callout says it
        var d = { view: v.id, kind: kind, a: a2, b: b2, value: value, auto: true, sketchRel: f.id + ':' + i, relSrc: { f: f.id, i: i } };
        if (kind === 'h') d.side = (a2[1] + b2[1]) / 2 > cv ? 1 : -1;
        else if (kind === 'v') d.side = (a2[0] + b2[0]) / 2 > cu ? 1 : -1;
        // the same span as an item already there: that item carries the relation
        var ix = kind === 'v' ? 1 : 0;
        function same(x) {
          if (x.view !== d.view || x.kind !== kind || !x.a || !x.b || Math.abs(x.value - value) > tol) return false;
          if (kind === 'aligned') return (Math.hypot(x.a[0] - a2[0], x.a[1] - a2[1]) <= tol && Math.hypot(x.b[0] - b2[0], x.b[1] - b2[1]) <= tol) || (Math.hypot(x.a[0] - b2[0], x.a[1] - b2[1]) <= tol && Math.hypot(x.b[0] - a2[0], x.b[1] - a2[1]) <= tol);
          return Math.abs(Math.min(x.a[ix], x.b[ix]) - Math.min(a2[ix], b2[ix])) <= tol;
        }
        var dup = dims.filter(same)[0] || out.filter(same)[0];
        if (dup) { if (!dup.relSrc) dup.relSrc = d.relSrc; return; }
        out.push(d);
      });
    });
    return out;
  }
  // (rfAB) sketchTarget(doc, order, projections, pl) -> { v, F: { e, u, v }, at(p3) -> [u, v] } or null: the first view
  // of `order` that looks square at sketch plane pl — an orthographic view (its frame), or a flat-pattern view when the
  // sketch lies on the base (parallel to the flat, within a sheet thickness of the Base Flange's sketch plane): a point
  // of the base sits in the flat where it lies on its sketch plane (the flat is that plane's to2D)
  function sketchTarget(doc, order, projections, pl) {
    for (var j = 0; j < order.length; j++) {
      var v = order[j];
      if (!projections[v.id]) continue;
      if (v.kind === 'flat') {
        var fd = D.flatData(_.CTX && _.CTX.mesh);
        if (!fd || fd.error || !fd.origin) continue;
        var fe = fd.frame.e, fo = fd.origin, T = sheetThickness();
        if (Math.abs(Math.abs(V.dot(pl.n, fe)) - 1) > 1e-9 || Math.abs(V.dot(V.sub(pl.origin, fo), fe)) > T * (1 + 1e-6) + 1e-9) continue;
        return flatTarget(v, fd);
      }
      var F = viewFrame(doc, v);
      if (F && Math.abs(Math.abs(V.dot(pl.n, F.e)) - 1) < 1e-9) return orthoTarget(v, F);
    }
    return null;
  }
  function orthoTarget(v, F) { return { v: v, F: F, at: function (q) { return [V.dot(q, F.u), V.dot(q, F.v)]; } }; }
  function flatTarget(v, fd) {
    var F = { e: fd.frame.e, u: fd.frame.u, v: fd.frame.v }, o = fd.origin;
    return { v: v, F: F, at: function (q) { var d = V.sub(q, o); return [V.dot(d, F.u), V.dot(d, F.v)]; } };
  }
  // (rfAB) the slots a projection shows, as zones: a straight slot's stadium (centre segment a–b, half width r), an arc
  // slot's band (centre C, centre-line radius R, half width r). A sketch dimension with both ends in one zone measures
  // the slot (its width, centre distance or overall length, of a slot drawn as lines and arcs): the slot callout says it.
  function slotZones(pr) {
    if (!pr || !pr.arcs) return [];
    var z = slotsIn(pr).map(function (s) { return { a: s.ends[0].c, b: s.ends[1].c, r: s.w / 2 }; });
    return z.concat(arcSlotsIn(pr).map(function (s) { return { C: s.center, R: s.R, r: s.w / 2 }; }));
  }
  function inSlot(zones, p, q, tol) {
    function inZ(z, x) {
      if (z.C) return Math.abs(Math.hypot(x[0] - z.C[0], x[1] - z.C[1]) - z.R) <= z.r + tol;
      var d = [z.b[0] - z.a[0], z.b[1] - z.a[1]], dd = d[0] * d[0] + d[1] * d[1];
      var t = dd > 0 ? Math.max(0, Math.min(1, ((x[0] - z.a[0]) * d[0] + (x[1] - z.a[1]) * d[1]) / dd)) : 0;
      return Math.hypot(x[0] - z.a[0] - d[0] * t, x[1] - z.a[1] - d[1] * t) <= z.r + tol;
    }
    return zones.some(function (z) { return inZ(z, p) && inZ(z, q); });
  }
  // (rfAB) sketchEntityDims(doc, order, projections, dims, onlySketch) -> model items for the sketches' Smart Dimensions
  // on entities (sketch.dims: a line's length, dx / dy, a rectangle's width / height, a polyline segment), as
  // SolidWorks' Insert Model Items > Marked for drawing brings them: every one that is marked (x.mark: on unless false;
  // a driven one only when set true), in the first view of `order` that looks square at its sketch (sketchTarget: the
  // Top view of a blank sketched on Top, a flat-pattern view for the Base Flange's sketch), between the points it
  // measures, on the side of the view nearer to them, with sketchDim 'sketchId:dimIndex' (its key). Diameters and radii
  // come as hole callouts and radii, slot sizes as slot callouts; one that shows what an item in `dims` already shows
  // (an overall size) is not added again.
  function sketchEntityDims(doc, order, projections, dims, onlySketch) {
    var ctx = _.CTX, model = ctx && ctx.model, out = [];
    if (!model || model.type === 'assembly' || !model.features) return out;
    var rm;
    try { rm = K.resolvedModel(model).model; } catch (e) { rm = model; }
    var planes = ctx.build && ctx.build.planes || {};
    (rm.features || []).forEach(function (f) {
      if (f.type !== 'sketch' || f.suppressed || !f.dims || !f.dims.length || (onlySketch != null && f.id !== onlySketch)) return;
      var pl;
      try { pl = K.resolvePlane(f.plane, rm, planes); } catch (e) { return; }
      var tg = sketchTarget(doc, order, projections, pl);
      if (!tg) return;
      var v = tg.v, F = tg.F, pr = projections[v.id], bd = pr.bounds, cu = (bd.umin + bd.umax) / 2, cv = (bd.vmin + bd.vmax) / 2;
      var span = Math.max(bd.umax - bd.umin, bd.vmax - bd.vmin, 1e-9), tol = 1e-7 * span, zones = slotZones(pr);
      f.dims.forEach(function (x, i) {
        if (!x || x.mark === false || (x.driven && x.mark !== true)) return;
        var e = f.entities && f.entities[x.e];
        if (!e || e.t === 'slot' || e.t === 'aslot') return;
        var g = K.dimGeometry(e, x);
        if (!g || g.type !== 'linear' || !g.dir) return;
        var a2 = tg.at(K.to3D(pl, g.P[0], g.P[1])), b2 = tg.at(K.to3D(pl, g.Q[0], g.Q[1]));
        var d3 = V.add(V.scale(pl.x, g.dir[0]), V.scale(pl.y, g.dir[1]));
        var kind = Math.abs(Math.abs(V.dot(d3, F.u)) - 1) < 1e-9 ? 'h' : Math.abs(Math.abs(V.dot(d3, F.v)) - 1) < 1e-9 ? 'v' : 'aligned';
        var value = kind === 'h' ? Math.abs(b2[0] - a2[0]) : kind === 'v' ? Math.abs(b2[1] - a2[1]) : Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
        if (!(value > tol) || Math.abs(value - g.value) > 1e-6 * (1 + g.value) || inSlot(zones, a2, b2, 1e-6 * span)) return;
        var d = { view: v.id, kind: kind, a: a2, b: b2, value: value, auto: true, sketchDim: f.id + ':' + i };
        if (kind === 'h') d.side = (a2[1] + b2[1]) / 2 > cv ? 1 : -1;
        else if (kind === 'v') d.side = (a2[0] + b2[0]) / 2 > cu ? 1 : -1;
        if (dims.some(function (y) { return sameSpan(y, d, tol); }) || out.some(function (y) { return sameSpan(y, d, tol); })) return;
        out.push(d);
      });
    });
    return out;
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
      var tg = sketchTarget(doc, order, projections, pl);
      if (!tg) return;
      var v = tg.v, F = tg.F;
      function view2(x, y) { return tg.at(K.to3D(pl, x, y)); }
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
  // (rfJ: d.slot.props { w, len | R }: a part's own sketch dimension's tolerance, precision and text, Drawing.slotDimProps;
  // the drawing's own precision still wins, and a "2X" in a part's text replaces the callout's count)
  function slotText(d, units, prec) {
    var pp = d.slot.props || {}, lead = null;
    var f = function (x, part) {
      var q = pp[part];
      if (!q || !(q.tol || q.prec != null || q.label != null)) return prec != null ? D.numText(x, units, prec) : fmtDim(x, units);
      var lab = q.label, m = lab != null && /^(\(?)\s*(\d+)\s*[xX]\s+/.exec(lab);
      if (m) { lead = lead || m[2] + 'X '; lab = m[1] + lab.slice(m[0].length); }   // "2X" leads the whole callout
      return D.dimLabel({ kind: 'h', value: x, prec: prec != null ? prec : q.prec, tol: q.tol, label: lab }, units).text;
    };
    var parts = d.slot.arc ? [f(d.slot.R, 'R'), f(d.slot.w, 'w')] : [f(d.slot.w, 'w'), f(d.slot.len, 'len')];
    var cnt = lead || (d.count > 1 ? d.count + 'X ' : '');
    if (d.slot.arc) return cnt + 'R' + parts[0] + ' ARC SLOT ' + parts[1] + ' WIDE ' + String(Math.round(d.slot.angle * 100) / 100) + '°';
    return cnt + parts[0] + ' X ' + parts[1] + ' SLOT';
  }
  function autoDimKey(d) {
    if (d.kind === 'ordinate' && d.sketchOrd) return d.view + ':ord:' + d.sketchOrd;
    if (d.sketchRel) return d.view + ':rel:' + d.sketchRel;
    if (d.sketchDim) return d.view + ':dim:' + d.sketchDim;
    if (d.slot && d.slot.arc) return d.view + ':arcslot:' + d.slot.R.toFixed(4) + 'x' + d.slot.w.toFixed(4) + 'x' + d.slot.angle.toFixed(2);
    if (d.slot) return d.view + ':slot:' + d.slot.w.toFixed(4) + 'x' + d.slot.len.toFixed(4);
    return d.view + ':' + d.kind + ':' + (d.kind === 'dia' || d.kind === 'rad' ? d.value.toFixed(4) : d.a.concat(d.b).map(function (x) { return x.toFixed(4); }).join(','));
  }
  function dimText(d, units) {
    if (d.kind === 'ordinate' || d.kind === 'baseline') {
      var p = d.prec != null && d.prec !== '' ? +d.prec : null;
      return (d.kind === 'ordinate' ? ['0'] : []).concat((d.values || []).map(function (x, i) {
        var vp = d.valueProps && d.valueProps[i];
        return vp && D.ordinateValueText ? D.ordinateValueText(Math.abs(x), vp, units, p) : D.numText(Math.abs(x), units, p);
      })).join(', ');
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
      // (rfM) a Revision Table owns its top corner: a BOM anchored there goes under it
      var rv = /top/.test(anchor) ? revBox(doc, units) : null;
      if (rv && rv.x0 < x0 + W && rv.x1 > x0) y1 = rv.y0 - 2 * k;
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

  // ------------------------------------------------------------------ Revision Table (rfM)
  // doc.revisions = { rows: [{ zone, rev, description, date, approved }], anchor: 'top-right' | 'top-left' }: SolidWorks'
  // Insert ▸ Tables ▸ Revision Table — ZONE / REV / DESCRIPTION / DATE / APPROVED under a REVISIONS title row, anchored
  // to the top corner of the border. Add Revision bumps the letter A, B, C … skipping I, O, Q, S, X, Z (ASME Y14.35,
  // SolidWorks' default list), after Y AA, AB …; the latest revision fills the title block's REV ($PRP:"Revision").
  var REV_LETTERS = 'ABCDEFGHJKLMNPRTUVWY', REV_COLS = [['ZONE', 15, 'zone'], ['REV', 12, 'rev'], ['DESCRIPTION', 75, 'description'], ['DATE', 25, 'date'], ['APPROVED', 25, 'approved']];
  var REV_ROW = 6, REV_TEXT = 2.5;
  // revLetter(i) -> the i-th revision (0: A … 19: Y, 20: AA)
  function revLetter(i) {
    var n = REV_LETTERS.length;
    i = Math.max(0, i | 0);
    if (i < n) return REV_LETTERS[i];
    i -= n;
    return REV_LETTERS[Math.floor(i / n) % n] + REV_LETTERS[i % n];
  }
  function revIndex(r) {
    r = String(r || '').trim().toUpperCase();
    for (var i = 0; i < 420; i++) if (revLetter(i) === r) return i;
    return -1;
  }
  // nextRev(prev) -> the revision after prev ('' / null: A); a letter outside the list (I, O …) goes on from the one
  // before it in the alphabet; a number counts up
  function nextRev(prev) {
    var r = String(prev || '').trim().toUpperCase();
    if (!r) return 'A';
    var i = revIndex(r);
    if (i >= 0) return revLetter(i + 1);
    if (/^[A-Z]$/.test(r)) { for (var j = REV_LETTERS.length - 1; j >= 0; j--) if (REV_LETTERS[j] < r) return revLetter(j + 1); return 'A'; }
    if (/^\d+$/.test(r)) return String(+r + 1);
    return 'A';
  }
  function latestRev(doc) { var rv = doc && doc.revisions, l = rv && rv.show !== false && rv.rows || []; return l.length ? String(l[l.length - 1].rev || '') : null; }
  // insertRevisionTable(doc, { anchor }) -> the table (kept when there is one)
  function insertRevisionTable(doc, opts) {
    opts = opts || {};
    var t = doc.revisions || (doc.revisions = { rows: [] });
    t.anchor = opts.anchor === 'top-left' ? 'top-left' : 'top-right';
    delete t.show;
    return t;
  }
  // addRevision(doc, { description, date, approved, zone, rev }) -> the new row (the table is inserted if missing)
  function addRevision(doc, spec) {
    spec = spec || {};
    var t = doc.revisions && doc.revisions.show !== false ? doc.revisions : insertRevisionTable(doc, {});
    var prev = t.rows.length ? t.rows[t.rows.length - 1].rev : null;
    var row = { zone: String(spec.zone || ''), rev: spec.rev ? String(spec.rev).toUpperCase() : nextRev(prev), description: String(spec.description == null ? '' : spec.description), date: spec.date != null ? String(spec.date) : todayISO(), approved: String(spec.approved || '') };
    t.rows.push(row);
    return row;
  }
  // editRevision(doc, i, props) / deleteRevision(doc, i) / deleteRevisionTable(doc)
  function editRevision(doc, i, props) {
    var r = doc.revisions && doc.revisions.rows[i];
    if (!r) throw new Error('No revision row ' + i);
    REV_COLS.forEach(function (c) { if (props[c[2]] != null) r[c[2]] = c[2] === 'rev' ? String(props[c[2]]).toUpperCase() : String(props[c[2]]); });
    return r;
  }
  function deleteRevision(doc, i) { var t = doc.revisions; if (!t || !t.rows[i]) return false; t.rows.splice(i, 1); return true; }
  function deleteRevisionTable(doc) { var had = !!doc.revisions; delete doc.revisions; return had; }
  // revBox(doc, units) -> { x0, y0, x1, y1, rowH, cols: [x…], anchor } of the Revision Table (title row, header row and
  // one row per revision), or null without one
  function revBox(doc, units) {
    var t = doc && doc.revisions;
    if (!t || t.show === false) return null;
    var k = paperK(units), S = sheetSize(doc, units), b = BORDER * k, W = 0;
    REV_COLS.forEach(function (c) { W += c[1]; });
    W *= k;
    var H = (t.rows.length + 2) * REV_ROW * k, x0 = t.anchor === 'top-left' ? b : S[0] - b - W, y1 = S[1] - b;
    var cols = [x0]; REV_COLS.forEach(function (c) { cols.push(cols[cols.length - 1] + c[1] * k); });
    return { x0: x0, y0: y1 - H, x1: x0 + W, y1: y1, rowH: REV_ROW * k, cols: cols, anchor: t.anchor || 'top-right' };
  }
  // revRowAt(doc, units, p) -> the index of the revision row under paper point p (-1: the title / header rows), or null
  function revRowAt(doc, units, p) {
    var bx = revBox(doc, units);
    if (!bx || p[0] < bx.x0 || p[0] > bx.x1 || p[1] < bx.y0 || p[1] > bx.y1) return null;
    var r = Math.floor((bx.y1 - p[1]) / bx.rowH) - 2;
    return r < 0 ? -1 : Math.min(r, doc.revisions.rows.length - 1);
  }

  // ------------------------------------------------------------------ several sheets (rfQ)
  // A drawing has one or more sheets (SolidWorks: the tabs under the sheet, right-click ▸ Add Sheet / Delete / Rename /
  // Properties). The active sheet's contents stay where a one-sheet document keeps them (doc.sheet, doc.views,
  // doc.notes, doc.symbols, doc.bom, doc.bomRows, doc.layout), so everything that works out, edits or writes a sheet
  // reads the active one unchanged; doc.sheets lists every sheet, the active one as null (its contents are the
  // document's own) and the others as { sheet, views, notes, symbols, bom, bomRows, layout }; doc.activeSheet is its
  // index. A document without doc.sheets (saved before rfQ) is one sheet. View and annotation ids stay unique across
  // the sheets (doc.nextView, doc.nextAnnot); the revisions, title block texts, properties and options are the drawing's.
  var SHEET_KEYS = ['sheet', 'views', 'notes', 'symbols', 'bom', 'bomRows', 'layout'];
  function sheetCount(doc) { return doc.sheets && doc.sheets.length ? doc.sheets.length : 1; }
  function sheetsOf(doc) {
    if (!doc.sheets || !doc.sheets.length) { doc.sheets = [null]; doc.activeSheet = 0; }
    if (!(doc.activeSheet >= 0 && doc.activeSheet < doc.sheets.length)) doc.activeSheet = 0;
    return doc.sheets;
  }
  function stash(doc) { var r = {}; SHEET_KEYS.forEach(function (q) { if (doc[q] !== undefined) r[q] = doc[q]; }); return r; }
  // sheetRecord(doc, i) -> sheet i's contents ({ sheet, views, … }; the active one's are the document's own)
  function sheetRecord(doc, i) {
    if (i == null || i === (doc.activeSheet | 0)) return stash(doc);
    return doc.sheets && doc.sheets[i] || null;
  }
  // sheetDoc(doc, i) -> a document whose active sheet is sheet i, to work out or write a sheet that is not the active
  // one (its views, notes and sheet are sheet i's own objects; the drawing's own fields are shared)
  function sheetDoc(doc, i) {
    if (i == null || i === (doc.activeSheet | 0)) return doc;
    var r = sheetRecord(doc, i), d = {};
    if (!r) throw new Error('No sheet ' + i);
    Object.keys(doc).forEach(function (q) { d[q] = doc[q]; });
    SHEET_KEYS.forEach(function (q) { if (q in r) d[q] = r[q]; else delete d[q]; });
    if (!d.views) d.views = r.views = [];
    d.activeSheet = i;
    return d;
  }
  // sheets(doc) -> [{ index, name, format, scale, autoScale, projection, views, active }]
  function sheets(doc) {
    var n = sheetCount(doc), out = [];
    for (var i = 0; i < n; i++) {
      var r = sheetRecord(doc, i) || {}, s = r.sheet || {};
      out.push({ index: i, name: s.name, format: s.format, scale: scaleText(s.scale || [1, 1]), autoScale: !!s.autoScale, projection: s.projection || 'third', views: (r.views || []).length, active: i === (doc.activeSheet | 0) });
    }
    return out;
  }
  // sheetIndex(doc, i | name) -> the sheet's index, or -1
  function sheetIndex(doc, which) {
    if (typeof which === 'number') return which >= 0 && which < sheetCount(doc) && which === Math.floor(which) ? which : -1;
    var l = sheets(doc);
    for (var i = 0; i < l.length; i++) if (String(l[i].name).toLowerCase() === String(which).trim().toLowerCase()) return i;
    return -1;
  }
  function freeSheetName(doc) {
    var used = {};
    sheets(doc).forEach(function (s) { used[String(s.name).toLowerCase()] = 1; });
    for (var k = sheetCount(doc) + 1; ; k++) if (!used['sheet' + k]) return 'Sheet' + k;
  }
  // activateSheet(doc, i | name) -> the index now active
  function activateSheet(doc, which) {
    var i = sheetIndex(doc, which);
    if (i < 0) throw new Error('No sheet ' + which);
    if (i === (doc.activeSheet | 0)) return i;
    var l = sheetsOf(doc), r = l[i];
    l[doc.activeSheet] = stash(doc);
    SHEET_KEYS.forEach(function (q) { if (q in r) doc[q] = r[q]; else delete doc[q]; });
    if (!doc.views) doc.views = [];
    l[i] = null; doc.activeSheet = i;
    return i;
  }
  // addSheet(doc, { name, format, scale, projection, activate }) -> the new sheet's index. It goes after the last sheet
  // with the active sheet's format, scale and projection (SolidWorks' Add Sheet copies the current sheet's
  // properties), and becomes the active sheet unless activate === false.
  function addSheet(doc, opts) {
    opts = opts || {};
    var nm = opts.name != null && String(opts.name).trim() ? String(opts.name).trim() : freeSheetName(doc);
    if (sheetIndex(doc, nm) >= 0) throw new Error('A sheet named ' + nm + ' already exists');
    if (opts.format && !FORMATS[opts.format]) throw new Error('No sheet format ' + opts.format);
    var l = sheetsOf(doc), cur = doc.sheet || {}, sc = opts.scale ? (Array.isArray(opts.scale) ? opts.scale : parseScale(opts.scale)) : null;
    l.push({ sheet: { name: nm, format: opts.format || cur.format || 'A3', scale: sc || (cur.scale || [1, 1]).slice(), autoScale: sc ? false : cur.autoScale !== false,
      projection: opts.projection === 'first' || opts.projection === 'third' ? opts.projection : cur.projection || 'third' },
      views: [], notes: [], symbols: [], bom: null, bomRows: 0, layout: 'auto' });
    var i = l.length - 1;
    if (opts.activate !== false) activateSheet(doc, i);
    return i;
  }
  // deleteSheet(doc, i | name): the last sheet cannot go; deleting the active sheet activates the one before it
  // (the first sheet's neighbour when it is the first). One sheet left: the document is a one-sheet document again.
  function deleteSheet(doc, which) {
    var i = sheetIndex(doc, which);
    if (i < 0) throw new Error('No sheet ' + which);
    if (sheetCount(doc) < 2) throw new Error('A drawing keeps at least one sheet');
    var l = sheetsOf(doc);
    if (i === doc.activeSheet) activateSheet(doc, i > 0 ? i - 1 : 1);
    l.splice(i, 1);
    if (doc.activeSheet > i) doc.activeSheet--;
    if (l.length === 1) { delete doc.sheets; delete doc.activeSheet; }
    return true;
  }
  // renameSheet(doc, i | name, newName) -> the new name (sheet names are unique, case-insensitive)
  function renameSheet(doc, which, name) {
    var i = sheetIndex(doc, which), nm = String(name == null ? '' : name).trim();
    if (i < 0) throw new Error('No sheet ' + which);
    if (!nm) throw new Error('A sheet needs a name');
    var j = sheetIndex(doc, nm);
    if (j >= 0 && j !== i) throw new Error('A sheet named ' + nm + ' already exists');
    if (i === (doc.activeSheet | 0)) doc.sheet.name = nm; else doc.sheets[i].sheet.name = nm;
    return nm;
  }

  D.FORMATS = FORMATS; D.SCALES = SCALES; D.ANSI_SCALES = ANSI_SCALES; D.scalesFor = scalesFor; D.scaleValue = scaleValue; D.scaleText = scaleText; D.scaleLabel = scaleLabel; D.parseScale = parseScale; D.sheetSize = sheetSize;
  D.newDrawing = newDrawing; D.addView = addView; D.projectionKey = projectionKey; D.putProjection = putProjection; D.sectionJob = sectionJob; D.putSection = putSection;
  // isSheetMetal(model): a part with sheet-metal parameters and a Base Flange (Model View offers Flat pattern)
  D.isSheetMetal = function (model) { return !!(model && model.type !== 'assembly' && model.sheet && (model.features || []).some(function (f) { return f.sheetBase && !f.suppressed; })); };
  D.addFlatView = addFlatView; D.flatExtents = flatExtents; D.viewExtents = viewExtents;
  D.viewFrame = viewFrame; D.nextLabel = nextLabel; D.addProjectedView = addProjectedView; D.addSectionView = addSectionView; D.detailScale = detailScale; D.addDetailView = addDetailView;
  D.TB_BLOCKS = TB_BLOCKS; D.tbBlocks = tbBlocks; D.tbRects = tbRects; D.fieldRect = fieldRect; D.generalTolerances = generalTolerances;
  D.todayISO = todayISO; D.REV_COLS = REV_COLS; D.revLetter = revLetter; D.nextRev = nextRev; D.latestRev = latestRev; D.insertRevisionTable = insertRevisionTable; D.addRevision = addRevision;
  D.editRevision = editRevision; D.deleteRevision = deleteRevision; D.deleteRevisionTable = deleteRevisionTable; D.revBox = revBox; D.revRowAt = revRowAt;
  _.REV_TEXT = REV_TEXT;
  D.SHEET_KEYS = SHEET_KEYS; D.sheetCount = sheetCount; D.sheets = sheets; D.sheetIndex = sheetIndex; D.sheetDoc = sheetDoc; D.activateSheet = activateSheet;
  D.addSheet = addSheet; D.deleteSheet = deleteSheet; D.renameSheet = renameSheet;
  D.TB_FIELDS = TB_FIELDS; D.titleText = titleText; D.titleFieldAt = titleFieldAt; D.titleBlock = titleBlock;
  D.standard3View = standard3View; D.extentsOf = extentsOf; D.layout = layoutViews; D.moveView = moveView; D.deleteView = deleteView; D.findView = findView;
  D.fmtDim = fmtDim; D.inchText = inchText; D.fracText = fracText; D.dimStyle = dimStyle; D.autoDims = autoDims; D.modelItems = modelItems; D.dimSizes = dimSizes; D.dimGeometry = dimGeometry; D.DIM_SIZES = DIM_SIZES; D.dimText = dimText; D.slotsIn = slotsIn; D.slotText = slotText;
  D.arcSlotsIn = arcSlotsIn; D.sketchOrdinates = sketchOrdinates; D.sketchDistances = sketchDistances;
  D.partInfo = partInfo; D.asmPartMaterials = asmPartMaterials; D.BOM_COLS = BOM_COLS; D.BOM_TYPES = BOM_TYPES; D.bomType = bomType; D.bomColumnSpecs = bomColumnSpecs; D.bomColumns = bomColumns;
  D.bomRows = bomRows; D.BOM_ANCHORS = BOM_ANCHORS; D.bomPropertyNames = bomPropertyNames; D.bomBox = bomBox; D.autoBalloon = autoBalloon; D.deleteBalloons = deleteBalloons; D.balloonSpots = balloonSpots;
  _.MM = MM; _.paperK = paperK; _.viewScale = viewScale; _.cachedProjection = cachedProjection; _.BORDER = BORDER; _.TB_W = TB_W; _.TB_H = TB_H; _.GAP = GAP; _.HATCH = HATCH;
  _.viewContent = viewContent; _.autoDimKey = autoDimKey; _.partInfoCache = partInfoCache; _.hasMaterials = hasMaterials; _.bomCell = bomCell; _.BOM_TEXT = BOM_TEXT;
})(Drawing, Drawing._);
