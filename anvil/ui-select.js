// ui-select.js — selection: the Selection Filter toolbar (F5), box selection (window / crossing) in parts, sketches and
// assemblies, multi-selection kept in step with the FeatureManager, and Instant3D drag handles on features and sketch
// dimensions. BoxSelect (no DOM, no UI) is the screen-space geometry; kernel-tests.html tests it on its own.
// Hooks: ui-core.js updateHighlights -> UI.drawSelectionExtras, updateSketches -> UI.entitySelected; ui-sketch.js
// mousedown -> UI.boxSelectHook, hover -> UI.pickHover, partClick -> UI.selectClick, sketch select -> UI.sketchSelectClick.

var BoxSelect = (function () {
  'use strict';
  // The box from the press point a to the release point b (screen pixels). Dragged left to right it is a window
  // (items fully inside), right to left a crossing box (items inside or touching), as in SolidWorks.
  function rect(a, b) {
    return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]), mode: b[0] >= a[0] ? 'window' : 'crossing' };
  }
  // rfFD: a lasso region (lasso() below) tests its bounding box first, then the loop
  function inside(p, r) { return p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1 && (!r.lasso || inLoop(p, r.lasso)); }
  // Liang–Barsky: does segment ab meet the box (boundary included)?
  function segHits(a, b, r) {
    var t0 = 0, t1 = 1, dx = b[0] - a[0], dy = b[1] - a[1];
    var p = [-dx, dx, -dy, dy], q = [a[0] - r.x0, r.x1 - a[0], a[1] - r.y0, r.y1 - a[1]];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      var t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  function pointInTri(p, a, b, c) {
    var d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  }
  function triHits(a, b, c, r) {
    if (inside(a, r) || inside(b, r) || inside(c, r)) return true;
    if (segHits(a, b, r) || segHits(b, c, r) || segHits(c, a, r)) return true;
    return pointInTri([r.x0, r.y0], a, b, c);   // the box lies inside the triangle
  }
  function segment(a, b, r, mode) { return mode === 'window' ? inside(a, r) && inside(b, r) && !(r.lasso && crossesLoop(a, b, r.lasso)) : segHits(a, b, r); }
  // A polyline [[x, y], …] (closed adds the last → first segment). Window: every point inside; crossing: any segment
  // meets the box (a single point: inside).
  function polyline(pts, closed, r, mode) {
    if (!pts.length) return false;
    var n = pts.length, cnt = closed ? n : n - 1;
    if (mode === 'window') {
      for (var k = 0; k < n; k++) if (!inside(pts[k], r)) return false;
      if (r.lasso) for (var j = 0; j < cnt; j++) if (crossesLoop(pts[j], pts[(j + 1) % n], r.lasso)) return false;   // rfFD: a concave loop
      return true;
    }
    if (pts.length === 1) return inside(pts[0], r);
    for (var i = 0; i < cnt; i++) if (segHits(pts[i], pts[(i + 1) % n], r)) return true;
    return false;
  }
  // Triangles as a flat screen array [x, y, x, y, x, y, …] (6 numbers each), from index `from` to `to` (exclusive).
  function triangles(t, r, mode, from, to) {
    from = from || 0; to = to == null ? t.length : to;
    if (to <= from) return false;
    var i;
    if (mode === 'window') {
      for (i = from; i < to; i += 2) if (!(t[i] >= r.x0 && t[i] <= r.x1 && t[i + 1] >= r.y0 && t[i + 1] <= r.y1)) return false;
      if (r.lasso) {   // rfFD: every corner inside the loop and no side leaving it
        for (i = from; i < to; i += 2) if (!inLoop([t[i], t[i + 1]], r.lasso)) return false;
        for (i = from; i < to; i += 6) {
          var A = [t[i], t[i + 1]], B = [t[i + 2], t[i + 3]], C = [t[i + 4], t[i + 5]];
          if (crossesLoop(A, B, r.lasso) || crossesLoop(B, C, r.lasso) || crossesLoop(C, A, r.lasso)) return false;
        }
      }
      return true;
    }
    // quick reject / accept on the bounding box first
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (i = from; i < to; i += 2) { if (t[i] < x0) x0 = t[i]; if (t[i] > x1) x1 = t[i]; if (t[i + 1] < y0) y0 = t[i + 1]; if (t[i + 1] > y1) y1 = t[i + 1]; }
    if (x1 < r.x0 || x0 > r.x1 || y1 < r.y0 || y0 > r.y1) return false;
    for (i = from; i < to; i += 6) if (triHits([t[i], t[i + 1]], [t[i + 2], t[i + 3]], [t[i + 4], t[i + 5]], r)) return true;
    return false;
  }
  // Merge `items` into `list`: 'replace' (items only), 'add' (union), 'toggle' (items already there are removed).
  // key(item) identifies an item; order is kept, new items go last.
  function combine(list, items, op, key) {
    if (op === 'replace') list = [];
    var out = list.slice(), keys = out.map(key);
    items.forEach(function (it) {
      var k = key(it), at = keys.indexOf(k);
      if (at >= 0) { if (op === 'toggle') { out.splice(at, 1); keys.splice(at, 1); } return; }
      out.push(it); keys.push(k);
    });
    return out;
  }
  // "Nice" ruler step (1, 2, 5 × 10ⁿ) so that ticks sit at least minPx pixels apart at pxPerUnit.
  function rulerStep(pxPerUnit, minPx) {
    if (!(pxPerUnit > 0)) return 1;
    var raw = (minPx || 8) / pxPerUnit, e = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var steps = [1, 2, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * e >= raw * (1 - 1e-12)) return +(steps[i] * e).toPrecision(12);
    return 10 * e;
  }
  function snap(v, step) { return +(Math.round(v / step) * step).toPrecision(12); }
  // rfFD: Lasso Selection (SolidWorks): a free-form loop of screen points, closed back to its first point. lasso(pts)
  // -> a region the functions above take in place of a box: { lasso, mode: 'window', x0, y0, x1, y1 } (bounding box).
  // A lasso always uses the window rule (items wholly inside); crossing tests only see its bounding box.
  function lasso(pts) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, loop = [];
    (pts || []).forEach(function (p) {
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;
      loop.push([p[0], p[1]]);
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    });
    return { lasso: loop, mode: 'window', x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  // even-odd point in polygon (a point on the loop itself may fall either way)
  function inLoop(p, poly) {
    var c = false, n = poly.length;
    if (n < 3) return false;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  // does segment ab properly cross a side of the closed loop (touching is not crossing)?
  function crossesLoop(a, b, poly) {
    var n = poly.length, mx0 = Math.min(a[0], b[0]), mx1 = Math.max(a[0], b[0]), my0 = Math.min(a[1], b[1]), my1 = Math.max(a[1], b[1]);
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var c = poly[j], d = poly[i];
      if (Math.max(c[0], d[0]) < mx0 || Math.min(c[0], d[0]) > mx1 || Math.max(c[1], d[1]) < my0 || Math.min(c[1], d[1]) > my1) continue;
      var d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    }
    return false;
  }
  return { lasso: lasso, inLoop: inLoop, crossesLoop: crossesLoop, rect: rect, inside: inside, segHits: segHits, pointInTri: pointInTri, triHits: triHits, segment: segment, polyline: polyline, triangles: triangles, combine: combine, rulerStep: rulerStep, snap: snap };
})();

if (typeof UI !== 'undefined') (function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, V = UI.V, $ = UI.$, el = UI.el;
  var viewport = UI.viewport;
  var SVGNS = 'http://www.w3.org/2000/svg';
  function isAsm() { return !!(UI.isAssembly && UI.isAssembly()); }
  function drawingOn() { return !!(UI.drawingActive && UI.drawingActive()); }
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }

  // ================================================================== selection list
  // App.sel / App.sel2 stay what the rest of the app reads (first and second item). App.multi holds the whole list
  // when it has more than one item; it is valid only while App.multi[0] === App.sel and the mesh is the one it was made
  // on, so any code that assigns App.sel directly (tree rows, commands, undo) simply replaces the multi-selection.
  App.multi = [];
  function round6(x) { return Math.round(x * 1e6) / 1e6; }
  function selKey(s) {
    if (!s) return '';
    switch (s.kind) {
      case 'face': return 'face:' + (UI.faceGroup && App.mode !== 'sketch' ? UI.faceGroup(s.index)[0] : s.index);   // any facet of a curved face is that face
      case 'body': case 'entity': case 'dim': case 'rel': return s.kind + ':' + s.index;
      case 'edge': return 'edge:' + (s.index != null && s.index >= 0 ? s.index : s.edge.mid.map(round6).join(','));
      case 'vertex': return 'vertex:' + s.point.map(round6).join(',');
      case 'feature': return 'feature:' + s.id;
      case 'plane': return 'plane:' + s.ref;
      case 'sketchPoint': return 'sketchPoint:' + s.ref;   // rfF: an end point / centre picked with the Select tool
      case 'sketchRef': return 'sketchRef:' + s.ref;   // rfAK: a style spline's control polygon leg
      case 'refgeo': return 'feature:' + s.id;   // lane CZ: a reference axis / point / csys is its feature
      case 'sketchEntity': return 'sketchEntity:' + s.sketch + '.' + s.index + (s.end ? '.' + s.end : '');
    }
    return s.kind + ':' + JSON.stringify(s);
  }
  // rfX (sketch fidelity 3, finding 1): a sketch selection (entities, points, dimensions, relations) does not depend on
  // the mesh, so a rebuild that finishes while the user is still Ctrl-clicking (the sketch's own feature, in the worker)
  // must not throw the list away: before, four preselected slot entities reached Linear Sketch Pattern as two.
  function sketchOnly(list) { return list.every(function (s) { return s && (s.kind === 'entity' || s.kind === 'sketchPoint' || s.kind === 'sketchRef' || s.kind === 'dim' || s.kind === 'rel'); }); }
  function selection() {
    if (App.multi.length && App.multi[0] === App.sel && (App.multiMesh === App.mesh || sketchOnly(App.multi)) && App.multiMode === App.mode) return App.multi.slice();
    App.multi = [];
    return [App.sel, App.sel2].filter(Boolean);
  }
  function describe(list) {
    var names = { face: 'face', edge: 'edge', vertex: 'vertex', body: isAsm() ? 'component' : 'body', entity: 'sketch entity', feature: 'feature', plane: 'plane', dim: 'dimension', rel: 'relation', sketchPoint: 'sketch point' };
    var plural = { vertex: 'vertices', entity: 'sketch entities', body: isAsm() ? 'components' : 'bodies' };
    var counts = {};
    list.forEach(function (s) { counts[s.kind] = (counts[s.kind] || 0) + 1; });
    return Object.keys(counts).map(function (k) { var n = counts[k]; return n + ' ' + (n === 1 ? names[k] || k : plural[k] || (names[k] || k) + 's'); }).join(', ');
  }
  // UI.setSelection(list): the whole selection in one go; highlights, sketch colours, tree and listeners follow.
  function setSelection(list, opts) {
    list = (list || []).filter(Boolean);
    App.multi = list.length > 1 ? list.slice() : [];
    App.multiMesh = App.mesh; App.multiMode = App.mode;
    App.sel = list[0] || null;
    App.sel2 = list[1] || null;
    if (list.some(function (s) { return s.kind === 'plane'; }) || (opts && opts.planes)) UI.updatePlanes();
    UI.updateHighlights();
    if (App.mode === 'sketch' || list.some(function (s) { return s.kind === 'feature'; })) UI.updateSketches();
    else App.dimsStale = true;
    UI.refreshTree();
    if (UI.onSelectionChanged) UI.onSelectionChanged();
    if (!(opts && opts.quiet) && UI.setStatus) UI.setStatus(list.length > 1 ? describe(list) + ' selected.' : list.length ? describe(list) + ' selected.' : 'Selection cleared.');
    return list;
  }
  function entitySelected(i) {
    return selection().some(function (s) { return s.kind === 'entity' && s.index === i; });
  }

  // ================================================================== Selection Filter
  // SolidWorks semantics: with no filter button pressed everything is selectable; pressing some limits picking, box
  // selection and every PropertyManager selection box to those kinds. Toggle Selection Filters (F6) suspends the set
  // without forgetting it; F5 shows or hides the toolbar (the filters stay in force while it is hidden).
  var FILTERS = [
    ['faces', 'Filter Faces', 'face'], ['edges', 'Filter Edges', 'edge'], ['vertices', 'Filter Vertices', 'vertex'],
    ['bodies', 'Filter Solid Bodies', 'body'], ['components', 'Filter Components', 'component'], ['sketch', 'Filter Sketch Entities', 'sketch']
  ];
  var filter = { faces: false, edges: false, vertices: false, bodies: false, components: false, sketch: false, suspended: false, bar: false };
  function filterSet() {
    if (filter.suspended) return null;
    var any = FILTERS.some(function (f) { return filter[f[0]]; });
    return any ? filter : null;
  }
  function bodyFilter(f) { return isAsm() ? !!(f.components || f.bodies) : !!f.bodies; }
  // allows(kind): kind as in a selection item ('face', 'edge', 'vertex', 'body', 'entity', 'feature' (sketch), 'plane')
  function allows(kind) {
    var f = filterSet();
    if (!f) return true;
    switch (kind) {
      case 'face': return !!f.faces;
      case 'edge': return !!f.edges;
      case 'vertex': return !!f.vertices;
      case 'body': return bodyFilter(f);
      case 'entity': case 'sketch': return !!f.sketch;
      case 'plane': return true;     // reference planes have no filter here
    }
    return true;
  }

  // Icons for the filter toolbar (inline, same 24-unit stroke style as icons.js). rfBU: no blue: grey solids with the
  // filtered item in the selection yellow (icons.js' feature-face yellow), sketch entities in the mid-grey ink.
  var FICON = {
    face: '<path d="M4 8l8-4 8 4-8 4z" fill="#ffe57a" stroke="#c08f00"/><path d="M4 8v8l8 4V12M20 8v8l-8 4" fill="none" stroke="#6d6d6d"/>',
    edge: '<path d="M4 8l8-4 8 4-8 4zM4 8v8l8 4V12M20 8v8l-8 4" fill="none" stroke="#a2a2a2"/><path d="M12 12v8" stroke="#c08f00" stroke-width="2.4"/>',
    vertex: '<path d="M4 8l8-4 8 4-8 4zM4 8v8l8 4V12M20 8v8l-8 4" fill="none" stroke="#a2a2a2"/><circle cx="12" cy="12" r="2.6" fill="#c08f00"/>',
    body: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z" fill="#ffe57a" stroke="#c08f00"/><path d="M4 8l8 4 8-4M12 12v8" fill="none" stroke="#c08f00"/>',
    component: '<path d="M3 9l6-3 6 3-6 3zM3 9v6l6 3v-6M15 9v6l-6 3" fill="#d6d6d6" stroke="#6d6d6d"/><path d="M13 13l4-2 4 2-4 2zM13 13v5l4 2v-5M21 13v5l-4 2" fill="#f2d98a" stroke="#a07800"/>',
    sketch: '<path d="M4 18L10 6l6 9 4-5" fill="none" stroke="#6d6d6d" stroke-width="1.8"/><circle cx="4" cy="18" r="1.6" fill="#6d6d6d"/><circle cx="20" cy="10" r="1.6" fill="#6d6d6d"/>',
    toggle: '<path d="M4 5h16l-6 7v6l-4 2v-8z" fill="#f2cf5b" stroke="#6b5200"/>',
    clear: '<path d="M4 5h16l-6 7v6l-4 2v-8z" fill="none" stroke="#6d6d6d"/><path d="M15 14l5 5M20 14l-5 5" stroke="#d9453b" stroke-width="1.8"/>',
    all: '<path d="M4 5h16l-6 7v6l-4 2v-8z" fill="#d6d6d6" stroke="#6d6d6d"/><path d="M14 17l2 2 4-5" fill="none" stroke="#1fa653" stroke-width="1.8"/>'
  };
  function ficon(name) { return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' + FICON[name] + '</svg>'; }
  var bar = el('div', { id: 'sel-filter', class: 'sel-filter', role: 'toolbar', 'aria-label': 'Selection Filter' });
  bar.hidden = true;
  viewport.appendChild(bar);
  function renderBar() {
    bar.innerHTML = '';
    bar.appendChild(el('span', { class: 'sf-title', text: 'Selection Filter' }));
    function btn(key, title, icon, pressed, fn) {
      var b = el('button', { class: 'sf-btn' + (pressed ? ' on' : ''), title: title, 'aria-label': title, 'aria-pressed': pressed ? 'true' : 'false', 'data-filter': key, html: ficon(icon) });
      b.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
      bar.appendChild(b);
    }
    btn('toggle', 'Toggle Selection Filters (F6)' + (filter.suspended ? ' — suspended' : ''), 'toggle', !filter.suspended && !!filterSet(), function () { setFilter({ suspended: !filter.suspended }); });
    btn('clear', 'Clear All Filters', 'clear', false, function () { var o = {}; FILTERS.forEach(function (f) { o[f[0]] = false; }); setFilter(o); });
    btn('all', 'Select All Filters', 'all', false, function () { var o = { suspended: false }; FILTERS.forEach(function (f) { o[f[0]] = true; }); setFilter(o); });
    bar.appendChild(el('span', { class: 'sf-sep' }));
    FILTERS.forEach(function (f) { btn(f[0], f[1], f[2], !!filter[f[0]], function () { var o = {}; o[f[0]] = !filter[f[0]]; setFilter(o); }); });
    bar.classList.toggle('suspended', !!filter.suspended);
  }
  // UI.selectionFilter(opts?) -> copy of the filter state; opts may set faces / edges / vertices / bodies / components /
  // sketch (booleans), suspended, bar (toolbar shown).
  function setFilter(opts) {
    opts = opts || {};
    Object.keys(opts).forEach(function (k) { if (k in filter) filter[k] = !!opts[k]; });
    // selected items the filter no longer allows are dropped, as SolidWorks does when a filter is switched on
    var list = selection(), keep = list.filter(function (s) { return allows(s.kind); });
    if (keep.length !== list.length) setSelection(keep, { quiet: true });
    bar.hidden = !filter.bar;
    renderBar();
    if (App.hover && !allows(App.hover.kind)) { App.hover = null; UI.updateHighlights(); }
    var f = filterSet();
    if (UI.setStatus && Object.keys(opts).some(function (k) { return k !== 'bar'; })) {
      UI.setStatus(f ? 'Selection Filter: ' + FILTERS.filter(function (x) { return f[x[0]]; }).map(function (x) { return x[1].replace('Filter ', ''); }).join(', ') + '.' : filter.suspended ? 'Selection filters suspended (F6 turns them back on).' : 'Selection Filter off: everything is selectable.');
    }
    return selectionFilter();
  }
  function selectionFilter(opts) {
    if (opts) return setFilter(opts);
    var o = {};
    Object.keys(filter).forEach(function (k) { o[k] = filter[k]; });
    o.active = !!filterSet();
    return o;
  }
  function toggleBar(on) { setFilter({ bar: on == null ? !filter.bar : !!on }); if (UI.refreshRibbon) UI.refreshRibbon(); return filter.bar; }   // the View tab's Selection Filter button shows it pressed
  renderBar();

  // ================================================================== picking with the filter
  // Vertices: the distinct end points of the sharp edges, computed once per mesh.
  var vtxCache = { mesh: null, list: [] };
  function faceVisible(i) { var f = App.mesh && App.mesh.faces[i]; return !!f && !(UI.isBodyHidden && UI.isBodyHidden(f.body || 0)); }
  function edgeShown(e) {
    if (e.smooth || e.faces.length !== 2) return false;
    return faceVisible(e.faces[0]) || faceVisible(e.faces[1]);
  }
  function vertices() {
    if (vtxCache.mesh === App.mesh) return vtxCache.list;
    var seen = {}, list = [];
    (App.edges || []).forEach(function (e) {
      if (e.smooth || e.faces.length !== 2) return;
      [e.a, e.b].forEach(function (p) {
        var k = p.map(function (x) { return Math.round(x * 1e5); }).join(',');
        if (seen[k] != null) { list[seen[k]].edges.push(e); return; }
        seen[k] = list.length;
        list.push({ point: [p[0], p[1], p[2]], edges: [e] });
      });
    });
    vtxCache = { mesh: App.mesh, list: list };
    return list;
  }
  function camDir() { return [UI.cam.dir.x, UI.cam.dir.y, UI.cam.dir.z]; }
  // Nearest visible vertex within 8 px (occluded when it sits clearly behind the face under the cursor).
  // lane DF: the reference points a sketch can use, as SolidWorks offers them: the shown reference Points, the ends of
  // the shown reference Axes and the shown Coordinate System origins of the features before sketch f (none after it,
  // nor rolled back) -> [{ p: [x, y, z], id, label }]
  function sketchRefPoints(f) {
    var planes = App.build && App.build.planes, feats = (App.model && App.model.features) || [], out = [];
    if (!planes) return out;
    var stop = f ? feats.indexOf(f) : feats.length;
    if (stop < 0) stop = feats.length;
    if (App.rollback != null) stop = Math.min(stop, App.rollback);
    for (var i = 0; i < stop; i++) {
      var g = feats[i], r = planes[g.id];
      if ((g.type !== 'refaxis' && g.type !== 'refpoint' && g.type !== 'csys') || !r || !r.refgeo || g.hidden) continue;
      if (App.view[{ axis: 'showAxes', point: 'showPoints', csys: 'showCsys' }[r.refgeo]] === false) continue;
      if (r.refgeo === 'point') out.push({ p: r.p.slice(), id: g.id, label: g.name });
      else if (r.refgeo === 'csys') out.push({ p: r.origin.slice(), id: g.id, label: g.name + ' origin' });
      else if (r.a && r.b) { out.push({ p: r.a.slice(), id: g.id, label: g.name + ' end' }); out.push({ p: r.b.slice(), id: g.id, label: g.name + ' end' }); }
    }
    return out;
  }
  UI.sketchRefPoints = sketchRefPoints;
  // in a sketch, a reference point (above) within 8 px is a vertex too, ahead of the model's: Smart Dimension and Add
  // Relations bring it in as a fixed construction point (ui-relations.js pickModelRef), as a model vertex
  function refVertex(mx, my) {
    if (App.mode !== 'sketch' || !UI.activeSketchFeature) return null;
    var best = null, bd = 8;
    sketchRefPoints(UI.activeSketchFeature()).forEach(function (q) {
      var s = UI.worldToScreen(q.p), d = Math.hypot(s[0] - mx, s[1] - my);
      if (d < bd) { bd = d; best = { kind: 'vertex', point: q.p.slice(), index: -1, refgeo: q.id, label: q.label }; }
    });
    return best;
  }
  function pickVertex(mx, my) {
    var rv = refVertex(mx, my);   // lane DF
    if (rv) return rv;
    var list = vertices(), best = null, bestD = 8;
    if (!list.length) return null;
    var hit = UI.pickFace(mx, my), cd = camDir(), hitDepth = hit ? V.dot(hit.point, cd) : -Infinity;
    list.forEach(function (v, i) {
      if (!v.edges.some(edgeShown)) return;
      var s = UI.worldToScreen(v.point), d = Math.hypot(s[0] - mx, s[1] - my);
      if (d >= bestD) return;
      if (hit && V.dot(v.point, cd) < hitDepth - Math.max(0.5, UI.cam.scale * 3)) return;
      bestD = d; best = { kind: 'vertex', point: v.point.slice(), index: i };
    });
    return best;
  }
  function faceBody(i) { var f = App.mesh.faces[i]; return f && f.body ? f.body : 0; }
  // A visible sketch (part mode) under the cursor, as its feature: Filter Sketch Entities in a part picks sketches.
  function pickSketchFeature(mx, my) {
    var best = null, bestD = 7;
    UI.groups.sketches.children.forEach(function (o) {
      var u = o.userData;
      if (!u || u.sketch == null || !o.geometry) return;
      var a = o.geometry.getAttribute('position');
      if (!a) return;
      for (var i = 0; i + 1 < a.count; i += 2) {
        var p = UI.worldToScreen([a.getX(i), a.getY(i), a.getZ(i)]), q = UI.worldToScreen([a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)]);
        var d = distSeg([mx, my], p, q);
        if (d < bestD) { bestD = d; best = { kind: 'feature', id: u.sketch }; }
      }
    });
    return best;
  }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  // What a plain click selects under the filter (part or assembly, no command).
  function pick(mx, my) {
    var f = filterSet();
    var rg = refFeaturePick(mx, my);   // lane CZ: a shown reference axis / point / csys is on top of the model
    if (rg) return rg;
    if (!f) return UI.pickEdge(mx, my) || UI.pickFace(mx, my) || (App.view.showPlanes ? UI.pickPlane(mx, my) : null);
    var hit = null;
    if (f.vertices) hit = pickVertex(mx, my);
    if (!hit && f.edges) hit = UI.pickEdge(mx, my);
    if (!hit && (f.faces || bodyFilter(f))) {
      var fc = UI.pickFace(mx, my);
      if (fc) hit = f.faces ? fc : { kind: 'body', index: faceBody(fc.index) };
    }
    if (!hit && f.sketch) hit = pickSketchFeature(mx, my);
    if (!hit && App.view.showPlanes) hit = UI.pickPlane(mx, my);
    return hit;
  }
  // ------------------------------------------------------------------ lane CZ: reference geometry picks
  // A plain click on a shown reference axis / point / coordinate system selects its feature ({ kind: 'feature', id,
  // refgeo }); a command with `pickRefGeo` (the Axis / Point / Coordinate System PropertyManagers, Revolve, Circular
  // Pattern) gets, in this order: the reference geometry under the cursor ({ kind: 'refgeo', id, refgeo, point }, kinds
  // limited by cmd.refKinds), with `pickVertices` a model vertex, with `pickSketchRefs` a sketch point / line end / arc
  // centre or a sketch line / arc of a shown sketch ({ kind: 'sketchEntity', sketch, index, end?, point }); then the
  // usual edge / face / plane picks.
  function refFeaturePick(mx, my) {
    if (!UI.pickRefGeo || App.mode === 'sketch') return null;
    var r = UI.pickRefGeo(mx, my);
    return r ? { kind: 'feature', id: r.id, refgeo: r.refgeo, point: r.point } : null;
  }
  function shownSketchIds() {
    var ids = {};
    UI.groups.sketches.children.forEach(function (o) { if (o.userData && o.userData.sketch != null) ids[o.userData.sketch] = true; });
    // only the sketches on screen (unconsumed ones, View ▸ All Sketches): a hidden sketch's lines must not steal a pick
    // meant for the model edge in front of them
    return ids;
  }
  function pickSketchRefs(mx, my) {
    if (App.mode === 'sketch') return null;
    var ids = shownSketchIds(), best = null, bd = 8, bestCurve = null, bc = 7;
    (App.model.features || []).forEach(function (sk) {
      if (sk.type !== 'sketch' || !ids[sk.id]) return;
      var pl = sketchPlane(sk);
      if (!pl) return;
      (sk.entities || []).forEach(function (e, i) {
        var pts = [];
        if (e.t === 'point') pts.push([null, e.x, e.y]);
        if (e.t === 'line') pts.push(['p1', e.x1, e.y1], ['p2', e.x2, e.y2]);
        if (e.cx != null && (e.t === 'circle' || e.t === 'arc')) pts.push(['c', e.cx, e.cy]);
        pts.forEach(function (q) {
          var P = K.to3D(pl, q[1], q[2]), S = UI.worldToScreen(P), d = Math.hypot(S[0] - mx, S[1] - my);
          if (d < bd) { bd = d; best = { kind: 'sketchEntity', sketch: sk.id, index: i, end: q[0], point: P, t: e.t }; }
        });
        // a rectangle / polygon / polyline: its corners (pt) and sides (seg), as SolidWorks' separate lines
        var PT = { rect: 1, crect: 1, poly: 1, polyline: 1 };
        if (PT[e.t]) {
          var epl = (K.entityPolylines(e) || [])[0];
          if (epl) {
            var n = epl.pts.length;
            epl.pts.forEach(function (q, k) {
              var P = K.to3D(pl, q[0], q[1]), S = UI.worldToScreen(P), d = Math.hypot(S[0] - mx, S[1] - my);
              if (d < bd) { bd = d; best = { kind: 'sketchEntity', sketch: sk.id, index: i, pt: k, point: P, t: e.t }; }
            });
            for (var sg = 0; sg < (epl.closed ? n : n - 1); sg++) {
              var A2 = K.to3D(pl, epl.pts[sg][0], epl.pts[sg][1]), B2 = K.to3D(pl, epl.pts[(sg + 1) % n][0], epl.pts[(sg + 1) % n][1]), d3 = distSeg([mx, my], UI.worldToScreen(A2), UI.worldToScreen(B2));
              if (d3 < bc) { bc = d3; bestCurve = { kind: 'sketchEntity', sketch: sk.id, index: i, seg: sg, point: V.scale(V.add(A2, B2), 0.5), t: e.t }; }
            }
          }
        }
        if (e.t === 'line' || e.t === 'arc' || e.t === 'circle') {
          var poly = [];
          if (e.t === 'line') poly = [[e.x1, e.y1], [e.x2, e.y2]];
          else { var a0 = e.t === 'circle' ? 0 : e.a0, a1 = e.t === 'circle' ? 360 : e.a1; if (a1 <= a0) a1 += 360; for (var k = 0; k <= 48; k++) { var an = (a0 + (a1 - a0) * k / 48) * Math.PI / 180; poly.push([e.cx + e.r * Math.cos(an), e.cy + e.r * Math.sin(an)]); } }
          for (var j = 0; j + 1 < poly.length; j++) {
            var A = K.to3D(pl, poly[j][0], poly[j][1]), B = K.to3D(pl, poly[j + 1][0], poly[j + 1][1]), d2 = distSeg([mx, my], UI.worldToScreen(A), UI.worldToScreen(B));
            if (d2 < bc) { bc = d2; bestCurve = { kind: 'sketchEntity', sketch: sk.id, index: i, end: null, point: V.scale(V.add(A, B), 0.5), t: e.t }; }
          }
        }
      });
    });
    return best || bestCurve;
  }
  function refCommandPick(mx, my, cmd) {
    var pk = UI.pickRefGeo ? UI.pickRefGeo(mx, my, cmd.refKinds) : null;
    if (!pk && (typeof cmd.pickVertices === 'function' ? cmd.pickVertices() : cmd.pickVertices) && allows('vertex')) pk = pickVertex(mx, my);
    if (!pk && cmd.pickSketchRefs) pk = pickSketchRefs(mx, my);
    return pk;
  }
  UI.pickSketchRefs = pickSketchRefs;

  // What a PropertyManager selection box receives (App.command.onPick), filtered. Commands that map a face to its
  // component (assembly selection boxes) still get the face when only Bodies / Components are on.
  function pickFor(mx, my, cmd) {
    var f = filterSet(), pk = null;
    if (cmd.pickRefGeo) { pk = refCommandPick(mx, my, cmd); if (pk) return pk; }   // lane CZ
    if (cmd.pickEdges && allows('edge')) pk = UI.pickEdge(mx, my);
    if (!pk && (!f || f.faces || bodyFilter(f))) pk = UI.pickFace(mx, my);
    if (!pk && cmd.pickPlane) pk = UI.pickPlane(mx, my);
    return pk;
  }
  // Hover under the filter (same rules as a click), so the pre-highlight tells what a click will select.
  function pickHover(mx, my) {
    // while a view transition glides, picking would use the view it lands on, not the one on screen: keep the hover
    if (UI.viewAnimating && UI.viewAnimating()) return App.hover;
    if (soMenu && soMenu.isConnected) return App.hover;   // r5/select5: the Select Other list (over the model) owns the hover
    var cmd = App.command, f = filterSet();
    if (cmd && cmd.regionsActive && cmd.regionsActive()) return cmd.pickRegions(mx, my);   // lane CO: Selected Contours box active: the sketch region under the pointer, nothing else
    if (cmd && cmd.pickRefGeo) { var rh = refCommandPick(mx, my, cmd); if (rh) return rh; }   // lane CZ
    if (cmd && cmd.pickPlane) return (!f || f.faces || bodyFilter(f) ? UI.pickFace(mx, my) : null) || UI.pickPlane(mx, my);
    if (cmd && cmd.pickEdges) return allows('edge') ? UI.pickEdge(mx, my) : null;
    return pick(mx, my);
  }
  // A click in the part / assembly viewport (ui-sketch.js partClick). Ctrl or Shift toggles the item in the selection.
  function selectClick(mx, my, ev) {
    if (App.command && App.command.onPick) {
      // lane CO: with the Selected Contours box active a click toggles the sketch region under the pointer and selects nothing else
      if (App.command.regionsActive && App.command.regionsActive()) { var rg = App.command.pickRegions(mx, my); if (rg) App.command.onPick(rg); return; }
      var pk = pickFor(mx, my, App.command);
      if (pk && App.command.onPick(pk) !== false) return;
    }
    var hit = pick(mx, my);
    if (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
      if (hit) setSelection(BoxSelect.combine(selection(), [hit], 'toggle', selKey));
      return;
    }
    setSelection(hit ? [hit] : [], { quiet: !hit });
  }
  // A click with the Select tool in a sketch (ui-sketch.js sketchClick hands every one here; true: handled).
  // A sketch PropertyManager with a selection box (Linear Sketch Pattern, Mirror Entities: UI.pmCollectsSelection)
  // takes plain clicks as SolidWorks does: a click toggles the entity in that box (or, with the PM's own entity pick,
  // e.g. Mirror about, goes there) and the PM stays open; the entity's own PropertyManager is not opened.
  // rfF: otherwise a plain click selects what is under the cursor (an end point / centre within a few pixels: the
  // point, else the entity) and shows its PropertyManager; Ctrl / Shift toggle it in the selection, and two or more
  // selected items show the Properties PM (Selected Entities, Existing Relations, Add Relations), as in SolidWorks.
  function isSketchItem(s) { return s.kind === 'entity' || s.kind === 'sketchPoint' || s.kind === 'sketchRef'; }
  function sketchSelectClick(mx, my, ev) {
    var collecting = !!(UI.pmCollectsSelection && UI.pmCollectsSelection());
    if (!allows('entity')) { if (collecting) return true; App.sel = null; App.sel2 = null; App.multi = []; UI.updateSketches(); UI.closePM(); return true; }
    var mod = !!(ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey));
    if (collecting) {
      var hitC = UI.pickEntity(mx, my);
      if (!hitC) return true;
      if (UI.pmEntityPick && UI.pmEntityPick(hitC)) return true;
      var pathC = hitC.kind === 'entity' ? pathMembers(UI.activeSketchFeature(), hitC.index) : null;   // rfIT: a path goes as one
      if (pathC) {
        var curC = selection().filter(function (s) { return s.kind === 'entity'; }), inC = pathC.every(function (p) { return curC.some(function (s) { return s.index === p.index; }); });
        setSelection(inC ? curC.filter(function (s) { return !pathC.some(function (p) { return p.index === s.index; }); }) : curC.concat(pathC.filter(function (p) { return !curC.some(function (s) { return s.index === p.index; }); })));
        return true;
      }
      setSelection(BoxSelect.combine(selection().filter(function (s) { return s.kind === 'entity'; }), [hitC], 'toggle', selKey));
      return true;
    }
    var item = sketchPickItem(mx, my);
    if (mod && !item) return true;
    // rfIG (user 2026-11-05: "when i shift click a line in sketch i want it to select the chain"): Shift+click on an
    // entity (Ctrl not held) adds its chain (SolidWorks' Select Chain); on a chain already all selected, takes it away
    if (item && item.kind === 'entity' && ev && ev.shiftKey && !(ev.ctrlKey || ev.metaKey)) { selectSketchChain(item.index, 'toggle'); return true; }
    // p9-sketchfix: the selection is read before anything replaces the PropertyManager (closing one consumes the
    // selection, ui-commands.js closePM)
    // rfIT: a member of a Make Path path selects the whole path (SolidWorks selects a path as one); Ctrl+click toggles
    // the whole path
    var pathItems = item && item.kind === 'entity' ? pathMembers(UI.activeSketchFeature(), item.index) : null;
    if (pathItems) {
      var curP = selection().filter(isSketchItem), allIn = pathItems.every(function (p) { return curP.some(function (s) { return selKey(s) === selKey(p); }); });
      var listP = !mod ? pathItems : allIn ? curP.filter(function (s) { return !pathItems.some(function (p) { return selKey(s) === selKey(p); }); }) : curP.concat(pathItems.filter(function (p) { return !curP.some(function (s) { return selKey(s) === selKey(p); }); }));
      setSelection(listP, { quiet: !mod });
      sketchSelectionPM(listP, true);
      UI.setStatus('Path' + f0PathId(item.index) + ' selected: ' + pathItems.length + ' entit' + (pathItems.length === 1 ? 'y' : 'ies') + '.');
      return true;
    }
    var list = mod ? BoxSelect.combine(selection().filter(isSketchItem), [item], 'toggle', selKey) : item ? [item] : [];
    setSelection(list, { quiet: !mod });
    sketchSelectionPM(list, true);
    return true;
  }
  // rfIT: the selection items of the Make Path path entity i belongs to (null: not in a path, or a path of one entity)
  function pathMembers(f, i) {
    var e = f && f.entities && f.entities[i];
    if (!e || e.pathId == null) return null;
    var out = [];
    f.entities.forEach(function (o, k) { if (o && o.pathId === e.pathId) out.push({ kind: 'entity', index: k }); });
    return out.length > 1 ? out : null;
  }
  function f0PathId(i) { var f = UI.activeSketchFeature(), e = f && f.entities[i]; return e ? e.pathId : ''; }
  UI.sketchPathMembers = function (i) { var m = pathMembers(UI.activeSketchFeature(), i); return m ? m.map(function (s) { return s.index; }) : null; };
  // rfIG: the chain of sketch entity i: the entities joined to it end to end (shared or coincident end points), followed
  // both ways; a branch point (three or more curves ending there) or a free end stops it, a closed loop is the loop (as
  // SolidWorks' Select Chain). Lines, arcs, open splines and partial ellipses chain; a closed curve (circle, ellipse,
  // closed spline, slot, rectangle / polygon entity) is a chain of its own. Hidden layers and sketch points take no part.
  function sketchChain(f, i) {
    var SS = window.SketchSolver, E = f && f.entities;
    if (!E || !E[i] || !SS) return [];
    function ends(k) {
      var e = E[k];
      if (!e || (UI.entityLayerHidden && UI.entityLayerHidden(f, e))) return null;
      if (!(e.t === 'line' || e.t === 'arc' || e.t === 'pellipse' || (e.t === 'spline' && !e.closed))) return null;
      var a = SS.refPoint(f, k + '.p1'), b = SS.refPoint(f, k + '.p2');
      return a && b ? [a, b] : null;
    }
    if (!ends(i)) return [i];
    var all = [], scale = 1;
    E.forEach(function (e, k) { var q = ends(k); if (q) { all.push({ k: k, q: q }); q.forEach(function (p) { scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1])); }); } });
    var tol = 1e-6 * scale;
    function near(a, b) { return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol; }
    // the entity ends at point p: [{ k, end }]
    function at(p) { var out = []; all.forEach(function (c) { c.q.forEach(function (q, j) { if (near(q, p)) out.push({ k: c.k, end: j }); }); }); return out; }
    var chain = [i], seen = {};
    seen[i] = true;
    var q0 = ends(i);
    [1, 0].forEach(function (side) {
      var k = i, p = q0[side];
      for (var guard = 0; guard < E.length; guard++) {
        var here = at(p);
        if (here.length !== 2) break;   // a free end or a branch point
        var nx = here[0].k === k && here.length === 2 ? here[1] : here[0];
        if (nx.k === k) break;   // (one entity's two ends together: a closed curve)
        if (seen[nx.k]) break;   // round a closed loop back to the start
        seen[nx.k] = true;
        if (side === 1) chain.push(nx.k); else chain.unshift(nx.k);
        k = nx.k; p = ends(k)[1 - nx.end];
      }
    });
    return chain;
  }
  // Select Chain on sketch entity i: mode 'toggle' (Shift+click: add, or remove a chain already all selected), 'add',
  // 'replace' (the right-click row)
  function selectSketchChain(i, mode) {
    var f = UI.activeSketchFeature();
    if (!f || !f.entities[i]) return [];
    var ids = sketchChain(f, i), cur = selection().filter(isSketchItem);
    function has(k) { return cur.some(function (s) { return s.kind === 'entity' && s.index === k; }); }
    var list;
    if (mode === 'replace') list = [];
    else if (mode === 'toggle' && ids.every(has)) list = cur.filter(function (s) { return !(s.kind === 'entity' && ids.indexOf(s.index) >= 0); });
    else list = cur.slice();
    if (!(mode === 'toggle' && ids.every(has))) ids.forEach(function (k) { if (!list.some(function (s) { return s.kind === 'entity' && s.index === k; })) list.push({ kind: 'entity', index: k }); });
    setSelection(list, { quiet: false });
    sketchSelectionPM(list, true);
    UI.setStatus(list.length ? ids.length + ' entit' + (ids.length === 1 ? 'y' : 'ies') + ' in the chain; ' + list.length + ' selected.' : 'Chain deselected.');
    return ids;
  }
  UI.sketchChain = function (i) { return sketchChain(UI.activeSketchFeature(), i); };
  UI.selectSketchChain = selectSketchChain;
  // What a Select-tool click at (mx, my) selects in the active sketch: { kind: 'sketchPoint', ref } for a line's or an
  // arc's end point or a circle's / arc's centre within 9 px (when it is no farther than the curve under the cursor, or
  // within 4 px of it: a small hole's edge still selects the circle), else { kind: 'entity', index }, or null.
  // rfH: the Rectangle / Polygon / Straight Slot tools draw lines and arcs, so their corners are line ends; the points
  // of the entities that stay whole select as points too, as SolidWorks' do: an ellipse's centre and axis ends (a
  // partial ellipse's ends), an arc slot's centre and arc ends, and the corners (a centre rectangle's / polygon's
  // centre) of a rectangle, polygon, slot or polyline a script or an import made. Not a corner rectangle's or a slot's
  // middle (no sketch point there in SolidWorks). Spline points stay with the Spline PM (it shows the point nearest the
  // click); a sketch point entity is the point itself.
  var POINT_PICK = { line: 1, arc: 1, circle: 1, ellipse: 1, pellipse: 1, aslot: 1, rect: 1, crect: 1, poly: 1, slot: 1, polyline: 1 };
  var NO_POINT_PICK = { rect: /\.c$/, slot: /\.c$/ };
  function pickSketchPoint(mx, my) {
    var f = UI.activeSketchFeature(), SS = window.SketchSolver;
    if (!f || !SS || !SS.pointRefs) return null;
    var pl = UI.activePlane(), best = null, bd = 9;
    f.entities.forEach(function (e, i) {
      if (!e || !POINT_PICK[e.t] || (UI.entityLayerHidden && UI.entityLayerHidden(f, e))) return;
      SS.pointRefs(f, i).forEach(function (pr) {
        if (/\.mid$/.test(pr.ref)) return;   // a line's midpoint is not a point of its own
        if (NO_POINT_PICK[e.t] && NO_POINT_PICK[e.t].test(pr.ref)) return;
        var q = UI.worldToScreen(K.to3D(pl, pr.pt[0], pr.pt[1])), d = Math.hypot(q[0] - mx, q[1] - my);
        if (d < bd) { bd = d; best = { ref: pr.ref, d: d }; }
      });
    });
    return best;
  }
  function sketchPickItem(mx, my) {
    var pe = UI.pickEntityDist ? UI.pickEntityDist(mx, my) : { hit: UI.pickEntity(mx, my), d: 0 };
    var f = UI.activeSketchFeature(), he = pe.hit && f && f.entities[pe.hit.index];
    if (he && he.t === 'point') return pe.hit;   // a sketch point entity is the point
    var pt = pickSketchPoint(mx, my);
    if (pt && (!pe.hit || pt.d <= 4 || pt.d <= pe.d + 1e-9)) return { kind: 'sketchPoint', ref: pt.ref };
    if (!pe.hit && f) { var sv = pickStyleVertex(f, mx, my); if (sv != null) return { kind: 'entity', index: sv }; }   // rfAH
    // rfAK: a style spline's control polygon leg (SolidWorks selects a control polygon line on its own: Horizontal,
    // Vertical, Tangent to a line or an arc, … in Add Relations): within 5 px of it, nearer than any curve
    var lg = f ? pickStyleLeg(f, mx, my) : null;
    if (lg && (!pe.hit || lg.d + 1e-9 < pe.d)) return { kind: 'sketchRef', ref: lg.ref };
    return pe.hit;
  }
  function pickStyleLeg(f, mx, my) {
    var pl = UI.activePlane(), best = null, bd = 5;
    f.entities.forEach(function (e, i) {
      if (!e || e.t !== 'spline' || !e.style || (UI.entityLayerHidden && UI.entityLayerHidden(f, e))) return;
      for (var k = 0; k + 1 < e.pts.length; k++) {
        var a = UI.worldToScreen(K.to3D(pl, e.pts[k][0], e.pts[k][1])), b = UI.worldToScreen(K.to3D(pl, e.pts[k + 1][0], e.pts[k + 1][1]));
        var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((mx - a[0]) * dx + (my - a[1]) * dy) / l2)) : 0;
        var dd = Math.hypot(a[0] + dx * t - mx, a[1] + dy * t - my);
        if (dd < bd) { bd = dd; best = { ref: i + '.e' + k, d: dd }; }
      }
    });
    return best;
  }
  UI.pickStyleLeg = function (mx, my) { var f = UI.activeSketchFeature(); var r = f && pickStyleLeg(f, mx, my); return r ? r.ref : null; };   // rfAK test hook
  // rfAH: a style spline's control vertices lie off its curve: a click within 9 px of one selects the style spline (its
  // PropertyManager shows that vertex, as the Spline PM shows the point nearest the click)
  function pickStyleVertex(f, mx, my) {
    var pl = UI.activePlane(), best = null, bd = 9;
    f.entities.forEach(function (e, i) {
      if (!e || e.t !== 'spline' || !e.style || (UI.entityLayerHidden && UI.entityLayerHidden(f, e))) return;
      e.pts.forEach(function (p) {
        var q = UI.worldToScreen(K.to3D(pl, p[0], p[1])), d = Math.hypot(q[0] - mx, q[1] - my);
        if (d < bd) { bd = d; best = i; }
      });
    });
    return best;
  }
  // The sketch refs of a selection (an entity: its curve, or the entity; a sketch point: its ref), in order. Smart
  // Dimension / Add Relations can take a preselection from here (UI.selectedSketchRefs()).
  function selectedSketchRefs(list) {
    var f = UI.activeSketchFeature(), SS = window.SketchSolver, out = [];
    if (!f || !SS) return out;
    (list || selection()).forEach(function (s) {
      var r = null;
      if (s.kind === 'sketchPoint' || s.kind === 'sketchRef') r = s.ref;
      else if (s.kind === 'entity' && f.entities[s.index]) { var c = SS.curveRefs(f, s.index); r = c.length === 1 ? c[0] : String(s.index); }
      if (r && SS.refKind(f, r) && out.indexOf(r) < 0) out.push(r);
    });
    return out;
  }
  // The PropertyManager that follows the sketch selection: one entity -> its own PM; one sketch point -> the Point PM
  // of that point; two or more -> Properties; nothing -> closed. byClick: from a Select-tool click (any PM gives way,
  // as a click always replaced it); else (a box) only a PM that shows the selection itself is replaced.
  var selPMSpec = null;
  function showsSelection(spec) {
    return !!(spec && (spec === selPMSpec || spec.selectionPM || spec.entityIndex != null || spec._skEntity || spec._txtEntity || (spec._curves && spec._curves.kind === 'entity')));
  }
  function sketchSelectionPM(list, byClick) {
    var spec = UI.pmSpec ? UI.pmSpec() : null;
    if (spec && !byClick && !showsSelection(spec)) return;
    var items = (list || selection()).filter(isSketchItem);
    if (!items.length) { if (spec) UI.closePM(); return; }
    if (items.length === 1 && items[0].kind === 'entity') {
      App.sel = items[0];
      UI.openEntityPM(items[0].index);
      selPMSpec = UI.pmSpec ? UI.pmSpec() : null;
      keyboardToGraphics();
      return;
    }
    openSelectionPM(items);
  }
  // rfF: a PropertyManager opened by a click in the graphics area leaves the keyboard there (Delete deletes, typed keys
  // go to the sketch), whichever entity PM it is
  function keyboardToGraphics() {
    var a = document.activeElement, pmEl = $('pm');
    if (a && pmEl && pmEl.contains(a) && /^(input|textarea|select)$/i.test(a.tagName)) { try { a.blur(); } catch (e) { } }
  }
  function sketchDirty() { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } }
  function clean10(x) { return Math.round(x * 1e10) / 1e10; }
  function escHtml(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // Properties (two or more items) or Point (one sketch point): Selected Entities, Existing Relations, Add Relations
  // (ui-sketch-dims.js UI.sketchRelationGroups), For construction for whole entities, X / Y for a point. It sets no
  // command, so clicks, Ctrl+clicks and boxes keep selecting (and the PM follows the selection).
  function openSelectionPM(items) {
    var f = UI.activeSketchFeature(), SS = window.SketchSolver;
    if (!f || !SS) return;
    var refs = selectedSketchRefs(items);
    var pointRef = items.length === 1 && items[0].kind === 'sketchPoint' ? items[0].ref : null;
    var ents = items.filter(function (s) { return s.kind === 'entity' && f.entities[s.index]; }).map(function (s) { return s.index; });
    var v = {};
    if (pointRef) { var P = SS.refPoint(f, pointRef); v.x = P ? clean10(P[0]) : 0; v.y = P ? clean10(P[1]) : 0; }
    if (ents.length) v.construction = ents.every(function (i) { return !!f.entities[i].construction; });
    var spec;
    function rerender() { if (UI.pmSpec && UI.pmSpec() === spec && App.mode === 'sketch') openSelectionPM(items); }
    function refreshSketch() { App.gridStale = true; UI.updateSketches(); UI.refreshTree(); }
    var groups = [];
    if (!pointRef) groups.push({ title: 'Selected Entities', fields: [{ type: 'html', html: '<div class="rel-list" id="sel-props-list">' + refs.map(function (r) { return '<div class="rel-row">' + escHtml(SS.refName(f, r)) + '</div>'; }).join('') + '</div>' }] });
    var rg = UI.sketchRelationGroups ? UI.sketchRelationGroups(f, refs, { onChange: rerender }) : null;
    if (!rg) {
      var types = SS.applicable(f, refs);
      rg = [{ title: 'Add Relations', fields: types.length ? [{ type: 'buttons', buttons: types.map(function (t) { return { label: SS.TYPES[t].name, onclick: function () { sketchDirty(); var r = SS.addRelation(f, t, refs); if (!r.ok) UI.toast(r.error); refreshSketch(); rerender(); } }; }) }] : [{ type: 'static', label: '', value: 'No relation applies to this selection.' }] }];
    }
    groups = groups.concat(rg);
    if (ents.length) groups.push({ title: 'Options', fields: [{ type: 'check', label: 'For construction', key: 'construction' }] });
    if (pointRef) groups.push({ title: 'Parameters', fields: [{ type: 'number', key: 'x', label: 'X', unit: 'u' }, { type: 'number', key: 'y', label: 'Y', unit: 'u' }] });
    function deselect() { setSelection([], { quiet: true }); }
    spec = {
      title: pointRef ? 'Point' : 'Properties', icon: pointRef ? 'point' : 'props', values: v, noFocus: true, selectionPM: true,
      message: pointRef ? SS.refName(f, pointRef) + ': type X / Y to move it, or add a relation.' : refs.length + ' items selected: add a relation, or Ctrl+click to change the selection.',
      groups: groups,
      onChange: function (vals, key) {
        if (key === 'construction') {
          sketchDirty();
          ents.forEach(function (i) { if (!f.entities[i]) return; if (vals.construction) f.entities[i].construction = true; else delete f.entities[i].construction; });
          refreshSketch();
          UI.setStatus((ents.length === 1 ? 'Entity' : ents.length + ' entities') + (vals.construction ? ' changed to construction geometry.' : ' changed back to sketch geometry.'));
          return;
        }
        if (!pointRef || (key !== 'x' && key !== 'y')) return;
        var val = +vals[key], k = key === 'x' ? 0 : 1, pr = SS.parseRef(pointRef);
        if (!pr || pr.o || !isFinite(val)) return;
        var Q0 = SS.refPoint(f, pointRef);
        if (Q0 && Math.abs(Q0[k] - val) < 1e-12) return;
        sketchDirty();
        var r = SS.driveEntity(f, pr.e, 1, function (E) { var Q = SS.refPoint({ entities: E }, pointRef); return [Q ? Q[k] - val : 0]; });
        if (!r.ok) { UI.setStatus(r.error); UI.toast(r.error); rerender(); return; }
        refreshSketch();
        UI.setStatus(SS.refName(f, pointRef) + ' moved to ' + (key === 'x' ? 'X ' : 'Y ') + (UI.fmtLen ? UI.fmtLen(val) : val) + '.');
      },
      onOK: deselect, onCancel: deselect
    };
    App.relPick = null;
    UI.openPM(spec);
    selPMSpec = spec;
    keyboardToGraphics();
    App.dimsStale = true;
  }

  // ================================================================== box selection
  var boxEl = el('div', { id: 'sel-box' });
  boxEl.hidden = true;
  viewport.appendChild(boxEl);
  var boxing = null;   // { start, end, mods, cancelled }

  // Screen projection of a whole mesh in one pass: 2 numbers per vertex, 6 per triangle.
  function projector() {
    var cam = UI.camera, m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse), e = m.elements;
    var w = UI.size.w, h = UI.size.h;
    return function (x, y, z, out, o) {
      var W = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
      out[o] = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / W + 1) / 2 * w;
      out[o + 1] = (1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / W) / 2 * h;
    };
  }
  function screenMesh() {
    var m = App.mesh, P = projector(), pos = m.positions64 || m.positions, n = m.triCount * 3, out = new Float64Array(n * 2);
    for (var i = 0; i < n; i++) P(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], out, i * 2);
    return out;
  }
  function S(p) { return UI.worldToScreen(p); }
  // Everything the box r selects, before the Ctrl / Shift merge. Parts select edges by default, assemblies
  // components, sketches entities; the Selection Filter picks the kinds instead.
  function boxItems(r) {
    var mode = r.mode, out = [];
    if (App.mode === 'sketch') {
      var sk = UI.activeSketchFeature();
      if (!sk || !allows('entity')) return out;
      var pl = UI.activePlane();
      // r15/snapaudit15: circles, arcs and slots are tested as drawn (UI.screenPolylines, a fraction of a pixel from the
      // true curve at any zoom), not as the model's chord-tolerance polygon, whose flats lie several pixels inside the
      // drawn curve once zoomed in, so a crossing box over the drawn arc missed it
      var plsOf = UI.screenPolylines || K.entityPolylines;
      sk.entities.forEach(function (e, i) {
        if (!e || (UI.entityLayerHidden && UI.entityLayerHidden(sk, e))) return;   // sketch-layers: a hidden layer is not drawn, so not boxed
        var pls = e.t === 'point' ? [{ pts: [[e.x, e.y]], closed: false }] : plsOf(e);
        if (!pls.length) return;
        var scr = pls.map(function (l) { return { pts: l.pts.map(function (q) { return S(K.to3D(pl, q[0], q[1])); }), closed: l.closed }; });
        var ok = mode === 'window' ? scr.every(function (l) { return BoxSelect.polyline(l.pts, l.closed, r, mode); }) : scr.some(function (l) { return BoxSelect.polyline(l.pts, l.closed, r, mode); });
        if (ok) out.push({ kind: 'entity', index: i });
      });
      return out;
    }
    if (!App.mesh) return out;
    var f = filterSet(), asm = isAsm();
    var want = f ? { faces: f.faces, edges: f.edges, vertices: f.vertices, bodies: bodyFilter(f), sketch: f.sketch } : asm ? { bodies: true } : { edges: true };
    var faces = App.mesh.faces, sp = (want.faces || want.bodies) ? screenMesh() : null;
    // rfFD: Select hidden entities off (the default) in a shaded view: only what can be seen (faces / bodies: a pixel of
    // theirs inside the box or lasso shows; edges / vertices: a point of theirs is not behind the part)
    var occ = occlusionWanted() && (want.faces || want.bodies || want.edges || want.vertices) ? occluder() : null, vis = occ && (want.faces || want.bodies) ? occ.shownIn(r) : null;
    function faceSeen(i, grp) {
      if (!vis || vis.faces[grp[0]]) return true;
      // a face seen edge-on owns no pixel: it counts when its middle is not behind the part (on the outline)
      var a = 0;
      grp.forEach(function (j) { var g = faces[j]; for (var t = g.start; t < g.start + g.count; t++) { var k = t * 6; a += Math.abs((sp[k + 2] - sp[k]) * (sp[k + 5] - sp[k + 1]) - (sp[k + 3] - sp[k + 1]) * (sp[k + 4] - sp[k])) / 2; } });
      return a < 1 && occ.seen(faces[i].centroid);
    }
    // a curved face (every facet of one cylinder, hole, cone...) is one face: a window box needs all of it inside, a
    // crossing box any part of it, and it is listed once
    if (want.faces) faces.forEach(function (fc, i) {
      var grp = UI.faceGroup ? UI.faceGroup(i) : [i];
      if (grp[0] !== i || !faceVisible(i)) return;
      var hit = function (j) { var g = faces[j]; return BoxSelect.triangles(sp, r, mode, g.start * 6, (g.start + g.count) * 6); };
      if ((mode === 'window' ? grp.every(hit) : grp.some(hit)) && faceSeen(i, grp)) out.push({ kind: 'face', index: i });
    });
    if (want.edges) (App.edges || []).forEach(function (e, i) {
      if (edgeShown(e) && BoxSelect.segment(S(e.a), S(e.b), r, mode) && (!occ || occ.edge(e))) out.push({ kind: 'edge', edge: e, index: i });
    });
    if (want.vertices) vertices().forEach(function (v, i) {
      if (v.edges.some(edgeShown) && BoxSelect.inside(S(v.point), r) && (!occ || occ.seen(v.point))) out.push({ kind: 'vertex', point: v.point.slice(), index: i });
    });
    if (want.bodies) {
      var n = Math.max(1, UI.bodyCount ? UI.bodyCount() : 1), state = [];
      for (var b = 0; b < n; b++) state.push(mode === 'window' ? null : false);
      faces.forEach(function (fc) {
        var bi = fc.body || 0;
        if (UI.isBodyHidden && UI.isBodyHidden(bi)) return;
        var hit = BoxSelect.triangles(sp, r, mode, fc.start * 6, (fc.start + fc.count) * 6);
        if (mode === 'window') state[bi] = (state[bi] == null ? true : state[bi]) && hit;
        else state[bi] = state[bi] || hit;
      });
      state.forEach(function (s, bi) { if (s && (!vis || vis.bodies[bi])) out.push({ kind: 'body', index: bi }); });
    }
    if (want.sketch) {
      var per = {};
      UI.groups.sketches.children.forEach(function (o) {
        var u = o.userData, a = o.geometry && o.geometry.getAttribute('position');
        if (!u || u.sketch == null || !a) return;
        var st = per[u.sketch] || (per[u.sketch] = { all: true, any: false });
        for (var i = 0; i + 1 < a.count; i += 2) {
          var hit = BoxSelect.segment(S([a.getX(i), a.getY(i), a.getZ(i)]), S([a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)]), r, mode);
          st.all = st.all && hit; st.any = st.any || hit;
        }
      });
      Object.keys(per).forEach(function (id) { if (mode === 'window' ? per[id].all : per[id].any) out.push({ kind: 'feature', id: +id }); });
    }
    return out;
  }
  // Apply a box: mods.ctrl adds, mods.shift toggles (Ctrl+Shift too), neither replaces. Inside an edge PropertyManager
  // (Fillet, Chamfer, flanges) the boxed edges go to its selection box instead. Returns the new selection.
  function applyBox(r, mods) {
    mods = mods || {};
    var items = boxItems(r);
    var cmd = App.command;
    if (cmd && cmd.onPick) {
      items.filter(function (it) { return it.kind === 'edge'; }).forEach(function (it) { cmd.onPick(it); });
      UI.updateHighlights();
      return selection();
    }
    var op = mods.shift ? 'toggle' : mods.ctrl ? 'add' : 'replace';
    var list = BoxSelect.combine(App.mode === 'sketch' ? selection().filter(isSketchItem) : selection(), items, op, selKey);
    setSelection(list, { quiet: true });
    // rfBC: the box in sketch coordinates, with what it left selected, for Stretch Entities (the points inside it move)
    if (App.mode === 'sketch') {
      var bsk = UI.activeSketchFeature(), bpl = UI.activePlane && UI.activePlane();
      var quad = bpl ? (r.lasso || [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]).map(function (q) { return UI.screenToPlane(q[0], q[1], bpl); }) : [];
      UI.lastSketchBox = bsk && quad.every(Boolean) ? { sketch: bsk.id, mode: r.mode, poly: quad,
        sel: list.filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; }).sort(function (a, b) { return a - b; }) } : null;
    }
    // rfF: a box in a sketch shows the selection's PropertyManager (Properties for two or more) unless another PM is open
    if (App.mode === 'sketch' && !(UI.pmCollectsSelection && UI.pmCollectsSelection())) sketchSelectionPM(list, false);
    if (UI.setStatus) UI.setStatus((r.lasso ? 'Lasso' : r.mode === 'window' ? 'Window' : 'Crossing') + ' selection: ' + (list.length ? describe(list) + ' selected.' : 'nothing selected.'));
    return list;
  }
  function showBox(a, b) {
    var r = BoxSelect.rect(a, b);
    boxEl.hidden = false;
    boxEl.className = r.mode;
    boxEl.style.left = r.x0 + 'px'; boxEl.style.top = r.y0 + 'px';
    boxEl.style.width = (r.x1 - r.x0) + 'px'; boxEl.style.height = (r.y1 - r.y0) + 'px';
  }
  // ui-sketch.js mousedown: a left press on empty space (no face, plane or sketch entity under it) starts a box; a
  // press on the model still rotates the view, as before. Returns a drag hook { start, move, end } or null.
  function boxSelectHook(p, ev) {
    if (ev.button !== 0 || ev.altKey || App.zoomAreaMode || drawingOn() || !App.mesh) return null;
    var cmd = App.command;
    if (App.mode === 'sketch') {
      if (App.tool !== 'select' || (cmd && (cmd.onSketchPoint || cmd.onPick))) return null;
      if (UI.pickEntity(p[0], p[1])) return null;
    } else {
      if (cmd && !(cmd.onPick && cmd.pickEdges)) return null;   // other PropertyManagers keep press-and-drag = rotate
      // rfFD: in Lasso Selection a left-drag on the model draws the loop too (middle-drag rotates, as in SolidWorks)
      if (selMode !== 'lasso' && UI.pickFace(p[0], p[1])) return null;
      if (selMode !== 'lasso' && App.view.showPlanes && UI.pickPlane(p[0], p[1])) return null;
    }
    var mods = { ctrl: ev.ctrlKey || ev.metaKey, shift: ev.shiftKey };
    if (selMode === 'lasso') return lassoHook(p, mods);
    return {
      box: true,
      start: function () { boxing = { start: p, end: p, mods: mods }; showBox(p, p); },
      move: function (q) { if (!boxing) return; boxing.end = q; showBox(p, q); },
      end: function (q) {
        var b = boxing; boxing = null; boxEl.hidden = true;
        if (!b || b.cancelled) return;
        var r = BoxSelect.rect(p, q);
        if (r.x1 - r.x0 < 2 && r.y1 - r.y0 < 2) return;
        applyBox(r, mods);
      }
    };
  }

  // ================================================================== highlights of the extra items
  var vtxMat = new THREE.PointsMaterial({ color: 0xffd400, size: 9, sizeAttenuation: false, depthTest: false });
  var vtxHoverMat = new THREE.PointsMaterial({ color: 0xff8c1a, size: 9, sizeAttenuation: false, depthTest: false });
  var throughMat = new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false, side: THREE.DoubleSide });   // r5/select5
  function pointsObject(pts, mat) {
    var arr = [];
    pts.forEach(function (p) { arr.push(p[0], p[1], p[2]); });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    var o = new THREE.Points(g, mat);
    o.renderOrder = 13;
    return o;
  }
  // ui-core.js updateHighlights calls this last: items 3… of a multi-selection (App.sel / App.sel2 are drawn by core),
  // selected and hovered vertices; then the Instant3D overlay is marked for redraw.
  UI.drawSelectionExtras = function (g, h) {
    var list = selection(), edges = [], verts = [];
    list.forEach(function (s, i) {
      if (s.kind === 'vertex') { verts.push(s.point); return; }
      if (i < 2) return;
      if (s.kind === 'edge') edges.push(s.edge);
      else { var r = h.selectionRanges(s); if (r) g.add(new THREE.Mesh(h.triRangeGeometry(r), UI.mats.sel)); }
    });
    if (edges.length) g.add(h.edgeLineObject(edges, h.edgeSelMat));
    if (verts.length) g.add(pointsObject(verts, vtxMat));
    if (App.hover && App.hover.kind === 'vertex') g.add(pointsObject([App.hover.point], vtxHoverMat));
    // r5/select5: a hidden face hovered in the Select Other list shows through the faces in front of it
    if (App.hover && App.hover.kind === 'face' && App.hover.through) { var tr = h.selectionRanges(App.hover); if (tr) { var tm = new THREE.Mesh(h.triRangeGeometry(tr), throughMat); tm.renderOrder = 11; g.add(tm); } }
    // r4/features4: the face of the PropertyManager list row under the pointer
    var hi = App.command && App.command.hoverItem;
    if (hi && hi.faces && hi.faces.length && UI.mats && UI.mats.hover) hi.faces.forEach(function (i) { var r = h.selectionRanges({ kind: 'face', index: i }); if (r) g.add(new THREE.Mesh(h.triRangeGeometry(r), UI.mats.hover)); });
    // lane CO: Selected Contours — the picked sketch regions (yellow) and the one under the pointer or listed row (orange)
    var cmd = App.command;
    if (cmd && cmd.pickedRegions) {
      cmd.pickedRegions().forEach(function (it) { var m = regionMesh(it.region, it.plane, UI.mats.sel); if (m) g.add(m); });
      var hv = App.hover && App.hover.kind === 'region' && cmd.regionsActive && cmd.regionsActive() ? App.hover : (hi && hi.region ? hi : null);
      if (hv && hv.region && hv.plane) { var hm = regionMesh(hv.region, hv.plane, UI.mats.hover); if (hm) g.add(hm); }
    }
    App.dimsStale = true;
  };
  // a translucent fill of a sketch region (Kernel.sketchRegions: outer loop + holes, sketch uv) on its plane
  function regionMesh(region, pl, mat) {
    if (!region || !pl || !THREE.ShapeUtils) return null;
    var contour = region.loops[0].pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var holes = region.loops.slice(1).map(function (l) { return l.pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }); });
    var tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { return null; }
    var pos = [], idx = [];
    contour.concat.apply(contour, holes).forEach(function (p) { var q = K.to3D(pl, p.x, p.y); pos.push(q[0], q[1], q[2]); });
    tris.forEach(function (t) { idx.push(t[0], t[1], t[2]); });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    var m = new THREE.Mesh(geo, mat);
    m.renderOrder = 10;
    m.raycast = function () { };
    m.userData = { sketchRegion: region.index };
    return m;
  }

  // ================================================================== FeatureManager sync
  // Rows of selected features, bodies and components are marked; the feature that owns a selected face or edge gets a
  // lighter "owner" mark. Ctrl / Shift + click on a row adds or removes it from the selection.
  function ownerOfFace(i) { var f = App.mesh && App.mesh.faces[i]; return f && App.triShared ? App.triShared[f.start] : -1; }
  function markTree() {
    var tree = $('tree');
    if (!tree || !App.model) return;
    var fids = {}, owners = {}, bodies = {};
    selection().forEach(function (s) {
      if (s.kind === 'feature') fids[s.id] = true;
      else if (s.kind === 'face') owners[ownerOfFace(s.index)] = true;
      else if (s.kind === 'edge' && s.edge) s.edge.faces.forEach(function (fi) { owners[ownerOfFace(fi)] = true; });
      else if (s.kind === 'body') bodies[s.index] = true;
    });
    Array.prototype.forEach.call(tree.querySelectorAll('.ti[data-fid]'), function (row) {
      var id = +row.getAttribute('data-fid');
      if (fids[id]) row.classList.add('selected');
      row.classList.toggle('sel-owner', !!owners[id] && !fids[id]);
    });
    Array.prototype.forEach.call(tree.querySelectorAll('.ti[data-body]'), function (row) { if (bodies[+row.getAttribute('data-body')]) row.classList.add('selected'); });
    Array.prototype.forEach.call(tree.querySelectorAll('.ti.component-row[data-comp]'), function (row) {
      var i = UI.componentIndex ? UI.componentIndex(+row.getAttribute('data-comp')) : -1;
      if (i >= 0 && bodies[i]) row.classList.add('selected');
    });
  }
  var baseRefreshTree = UI.refreshTree;
  UI.refreshTree = function () { var r = baseRefreshTree.apply(this, arguments); markTree(); return r; };
  $('tree').addEventListener('click', function (e) {
    if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
    var row = e.target.closest && e.target.closest('.ti[data-fid], .ti[data-body], .ti.component-row[data-comp]');
    if (!row || App.mode === 'sketch') return;
    e.stopPropagation(); e.preventDefault();
    var item = row.hasAttribute('data-fid') ? { kind: 'feature', id: +row.getAttribute('data-fid') }
      : row.hasAttribute('data-body') ? { kind: 'body', index: +row.getAttribute('data-body') }
      : { kind: 'body', index: UI.componentIndex(+row.getAttribute('data-comp')) };
    if (item.kind === 'body' && !(item.index >= 0)) return;
    setSelection(BoxSelect.combine(selection(), [item], 'toggle', selKey));
  }, true);

  // Delete with several sketch entities selected removes them all (one undo step, highest index first).
  // rfF: selected sketch points (an end point, a centre) are part of their entities: Delete leaves them (and the
  // Point / Properties PM) alone, as SolidWorks does; with entities selected too, only the entities go.
  var baseDelete = UI.deleteSelection;
  UI.deleteSelection = function () {
    var list = selection();
    if (App.mode === 'sketch' && list.length && list.every(isSketchItem) && (list.length > 1 || list[0].kind === 'sketchPoint')) {
      var ents = list.filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; });
      if (!ents.length) { UI.setStatus('A sketch point belongs to its entity: select the line, arc or circle to delete it.'); return; }
      if (UI.pmSpec && showsSelection(UI.pmSpec())) UI.closePM();
      ents.sort(function (a, b) { return b - a; }).forEach(function (i) {
        App.sel = { kind: 'entity', index: i }; App.sel2 = null; App.multi = [];
        baseDelete();
      });
      App.sel = null; App.sel2 = null; App.multi = []; UI.updateSketches();
      return;
    }
    return baseDelete.apply(this, arguments);
  };

  // ================================================================== Instant3D
  // Selecting a face of a Boss-Extrude / Cut-Extrude / Revolve (or the feature in the FeatureManager) shows a drag
  // arrow on its end face (depth / angle) and the feature's sketch dimensions in the viewport, each with a drag dot.
  // Dragging changes the value live, snapped to the ruler's ticks; the whole drag is one undo step and releasing opens
  // a box to type an exact value. In a sketch the same dots sit on the dimension arrows. Toggle: Features ▸ Instant3D.
  var i3d = { on: true, drag: null, edit: null, side: {} };
  // r4/features4: styles of the PropertyManager handles, callouts and selection lists (kept here so style.css is untouched)
  (function () {
    var css = [
      '#i3d-layer .i3d-callout { pointer-events: all; cursor: text; }',
      '#i3d-layer .i3d-callout rect { fill: #fffbe6; stroke: #c9a227; stroke-width: 1; }',
      '#i3d-layer .i3d-callout text { font: 600 11.5px "Segoe UI", sans-serif; fill: #1e1e1e; }',
      '#i3d-layer .i3d-callout:hover rect { stroke: #ff8c1a; }',
      '#i3d-layer .i3d-leader { stroke: #c9a227; stroke-width: 1; }',
      '#i3d-layer .i3d-anchor { fill: #c9a227; }',
      '#i3d-layer .i3d-flip { pointer-events: all; cursor: pointer; opacity: 0.55; }',
      '#i3d-layer .i3d-flip:hover { opacity: 1; }',
      '#i3d-layer .i3d-flip-shaft { stroke: #d8d8d8; stroke-width: 2; stroke-dasharray: 3 2; }',
      '#i3d-layer .i3d-flip-head { fill: #d8d8d8; }',
      '#i3d-layer .i3d-flip:hover .i3d-flip-shaft { stroke: #ff8c1a; } #i3d-layer .i3d-flip:hover .i3d-flip-head { fill: #ff8c1a; }',
      '#i3d-layer .i3d-hover-item polyline { fill: none; stroke: #ff8c1a; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; opacity: 0.9; }',
      '#i3d-layer .i3d-hover-item circle { fill: none; stroke: #ff8c1a; stroke-width: 2.5; }',
      '.pm-list { margin-top: 3px; border: 1px solid var(--blue-line); background: var(--input-bg, #fff); max-height: 132px; overflow-y: auto; }',
      '.pm-item { display: flex; align-items: center; gap: 5px; padding: 2px 6px; cursor: default; outline: none; white-space: nowrap; }',
      '.pm-item:hover { background: var(--pick-bg); }',
      '.pm-item.sel { background: var(--blue, #3a3a3a); color: #fff; }',
      // r9/polish9: a long name (Face@Arm<1>@Hinge<2>@Hinged Cover<1>) ends in … instead of widening the PropertyManager
      '.pm-pickwrap { min-width: 0; max-width: 100%; } .pm-list { overflow-x: hidden; } .pm-item > span { overflow: hidden; text-overflow: ellipsis; min-width: 0; }',
      'html[data-theme="dark"] #i3d-layer .i3d-callout rect { fill: #2b2a1f; } html[data-theme="dark"] #i3d-layer .i3d-callout text { fill: #f1e9c8; }',
      // r5/select5: the ruler while the pointer snaps to it, and the tick it snapped to
      'html #i3d-layer .i3d-ruler.snapping { stroke: #ffffff; stroke-width: 1.5; }',
      'html #i3d-layer .i3d-tick.hit { stroke: #ff8c1a; stroke-width: 3; }'
    ].join('\n');
    var st = document.createElement('style');
    st.id = 'r4-features4-style';
    st.textContent = css;
    document.head.appendChild(st);
  })();
  var layer = svg('svg', { id: 'i3d-layer', 'aria-hidden': 'true' });
  viewport.appendChild(layer);
  var editBox = el('div', { id: 'i3d-edit' });
  editBox.hidden = true;
  var editInput = el('input', { type: 'text', inputmode: 'decimal', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Instant3D value' });
  editBox.appendChild(editInput);
  viewport.appendChild(editBox);

  function numeric(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string' && /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i.test(v)) return parseFloat(v);
    return null;     // "=…" equations drive the value: no handle
  }
  function unitText() { return UI.unitLabel ? UI.unitLabel() : 'mm'; }
  // r4/features4: one value format on the model (Instant3D, PropertyManager handles, callouts): 2 decimals (3 in inches), unit
  function valueDecimals(h) { return h && h.angle ? 2 : unitText() === 'in' ? 3 : 2; }
  function fmtV(v, h) { return UI.fmtNum(v, valueDecimals(h)) + (h && h.angle ? '°' : ' ' + unitText()); }
  function sketchPlane(sk) { try { return K.resolvePlane(sk.plane, App.model, App.build && App.build.planes); } catch (e) { return null; } }
  function to3Ddir(pl, d) { return V.norm(V.add(V.scale(pl.x, d[0]), V.scale(pl.y, d[1]))); }
  function rotate(v, axis, ang) {    // Rodrigues, right-handed about the unit axis
    var c = Math.cos(ang), s = Math.sin(ang), k = axis, d = V.dot(k, v), cr = V.cross(k, v);
    return [v[0] * c + cr[0] * s + k[0] * d * (1 - c), v[1] * c + cr[1] * s + k[1] * d * (1 - c), v[2] * c + cr[2] * s + k[2] * d * (1 - c)];
  }

  // A linear handle: value v sits at O + dir·v/k (k = 2 for mid-plane depths and diameters).
  function linearHandle(h) {
    h.pos = function (v) { return V.add(h.O, V.scale(h.dir, v / h.k)); };
    h.arrow = function () { return h.dir; };
    h.rawAt = function (mx, my) {
      var s0 = S(h.O), s1 = S(V.add(h.O, h.dir)), ux = s1[0] - s0[0], uy = s1[1] - s0[1], L2 = ux * ux + uy * uy;
      if (L2 < 1e-6) return null;                       // seen end-on: the arrow cannot be dragged in this view
      return ((mx - s0[0]) * ux + (my - s0[1]) * uy) / L2 * h.k;
    };
    h.pxPerUnit = function () { var s0 = S(h.O), s1 = S(V.add(h.O, h.dir)); return Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) / h.k; };
    h.step = function () { return BoxSelect.rulerStep(h.pxPerUnit(), 8); };
    return h;
  }

  // Boss-Extrude / Cut-Extrude depth. faceIndex: the selected face (must be an end face) or null (the largest end face,
  // on the side dragged last).
  function extrudeHandle(f, sk, pl, faceIndex) {
    if (f.end === 'through' || f.dir2) return null;
    var depth = numeric(f.depth);
    if (depth == null || !(depth > 0)) return null;
    var n = pl.n, mid = f.end === 'mid', want = mid ? depth / 2 : depth, sign = f.reverse ? -1 : 1, faces = App.mesh.faces;
    var tol = 1e-4 * Math.max(1, depth);
    function endSide(i) {
      var fc = faces[i];
      if (!fc || App.triShared[fc.start] !== f.id || !fc.normal || !fc.centroid) return 0;
      if (Math.abs(V.dot(fc.normal, n)) < 0.9999) return 0;
      var d = V.dot(V.sub(fc.centroid, pl.origin), n);
      if (mid) return Math.abs(Math.abs(d) - want) < tol ? (d > 0 ? 1 : -1) : 0;
      return Math.abs(d - sign * want) < tol ? sign : 0;
    }
    var pickI = -1, side = 0;
    if (faceIndex != null) { side = endSide(faceIndex); if (!side) return null; pickI = faceIndex; }
    else {
      var prefer = i3d.side[f.id], bestA = -1;
      faces.forEach(function (fc, i) {
        var s = endSide(i);
        if (!s) return;
        var a = fc.area + (prefer && s === prefer ? 1e12 : 0);
        if (a > bestA) { bestA = a; pickI = i; side = s; }
      });
      if (pickI < 0) return null;
    }
    var c = faces[pickI].centroid, d0 = V.dot(V.sub(c, pl.origin), n);
    return linearHandle({ kind: 'depth', fid: f.id, side: side, O: V.sub(c, V.scale(n, d0)), dir: V.scale(n, side), k: mid ? 2 : 1, value: depth,
      label: (f.cut ? 'Cut-Extrude' : 'Boss-Extrude') + ' depth', min: 0,
      apply: function (v) { f.depth = v; return true; } });
  }

  function revolveAxisWorld(f, sk, pl) {
    var ax = f.axis, p, d;
    if (ax === 'y' || ax == null) { p = [0, 0]; d = [0, 1]; }
    else if (ax === 'x') { p = [0, 0]; d = [1, 0]; }
    else if (typeof ax === 'object' && ax.x1 != null) { p = [ax.x1, ax.y1]; d = [ax.x2 - ax.x1, ax.y2 - ax.y1]; }
    else { var e = sk.entities[ax]; if (!e || e.t !== 'line') return null; p = [e.x1, e.y1]; d = [e.x2 - e.x1, e.y2 - e.y1]; }
    if (Math.hypot(d[0], d[1]) < 1e-12) return null;
    return { A: K.to3D(pl, p[0], p[1]), D: to3Ddir(pl, d) };
  }
  // Revolve angle: the end cap is the planar face of the feature containing the axis at `angle` from the profile's side.
  function revolveHandle(f, sk, pl, faceIndex) {
    var ang = numeric(f.angle);
    if (ang == null || !(ang > 0) || ang >= 360 - 1e-6) return null;
    var ax = revolveAxisWorld(f, sk, pl);
    if (!ax) return null;
    var A = ax.A, D = ax.D, sum = [0, 0, 0], cnt = 0;
    sk.entities.forEach(function (e, i) {
      if (i === f.axis || e.construction) return;
      (K.entitySnapPoints ? K.entitySnapPoints(e) : []).forEach(function (q) { sum = V.add(sum, K.to3D(pl, q[0], q[1])); cnt++; });
    });
    if (!cnt) return null;
    function perp(p) { var w = V.sub(p, A); return V.sub(w, V.scale(D, V.dot(w, D))); }
    var w0 = perp(V.scale(sum, 1 / cnt));
    if (V.len(w0) < 1e-9) return null;
    var e1 = V.norm(w0), e2 = V.cross(D, e1);
    function angOf(p) { var w = perp(p), a = Math.atan2(V.dot(w, e2), V.dot(w, e1)) * 180 / Math.PI; return a < 0 ? a + 360 : a; }
    var faces = App.mesh.faces;
    function capSign(i) {
      var fc = faces[i];
      if (!fc || App.triShared[fc.start] !== f.id || !fc.normal || !fc.centroid) return 0;
      if (Math.abs(V.dot(fc.normal, D)) > 1e-3 || V.len(perp(fc.centroid)) < 1e-9) return 0;
      var a = angOf(fc.centroid);
      if (Math.abs(a - ang) < 0.05) return 1;
      if (Math.abs(360 - a - ang) < 0.05) return -1;
      return 0;
    }
    var pickI = -1, s = 0;
    if (faceIndex != null) { s = capSign(faceIndex); if (!s) return null; pickI = faceIndex; }
    else faces.forEach(function (fc, i) { if (pickI < 0) { var c = capSign(i); if (c) { pickI = i; s = c; } } });
    if (pickI < 0) return null;
    var c = faces[pickI].centroid, hgt = V.dot(V.sub(c, A), D), r = V.len(perp(c)), foot = V.add(A, V.scale(D, hgt));
    var h = { kind: 'angle', angle: true, fid: f.id, value: ang, label: (f.cut ? 'Cut-Revolve' : 'Revolve') + ' angle', min: 0, max: 360,
      apply: function (v) { f.angle = v; return true; } };
    h.pos = function (v) { return V.add(foot, V.scale(rotate(e1, D, s * v * Math.PI / 180), r)); };
    h.arrow = function (v) { return V.scale(rotate(e2, D, s * v * Math.PI / 180), s); };
    h.pxPerUnit = function () { return r * Math.PI / 180 / UI.cam.scale; };
    h.step = function () { var p = h.pxPerUnit(); return p >= 6 ? 1 : p >= 1.2 ? 5 : 15; };
    h.rawAt = function (mx, my) {    // the angle whose arc point is nearest the pointer (0.25° samples, then refined)
      var best = null, bestD = Infinity;
      for (var t = 0; t <= 360; t += 0.25) { var q = S(h.pos(t)), dd = Math.hypot(q[0] - mx, q[1] - my); if (dd < bestD) { bestD = dd; best = t; } }
      for (var b0 = best, t2 = b0 - 0.25; b0 != null && t2 <= b0 + 0.25 + 1e-9; t2 += 0.01) { var q2 = S(h.pos(t2)), d2 = Math.hypot(q2[0] - mx, q2[1] - my); if (d2 < bestD && t2 >= 0 && t2 <= 360) { bestD = d2; best = +t2.toFixed(2); } }   // r5/select5: refined for free drags
      return best;
    };
    h.ring = true;
    return h;
  }

  // Sketch dimensions of `sk` as handles (placed dimensions, plus the driven ones when View ▸ Sketch Dimensions is on).
  function sketchDimHandles(sk, pl) {
    var out = [], placed = sk.dims || [], list = [];
    placed.forEach(function (d, i) { list.push({ d: d, index: i }); });
    if (App.view.showDims && UI.autoDims) sk.entities.forEach(function (e, i) { UI.autoDims(e, i, placed).forEach(function (d) { list.push({ d: d, auto: true }); }); });
    var s = UI.cam.scale;
    list.forEach(function (it) {
      var e = sk.entities[it.d.e], g = e && K.dimGeometry(e, it.d);
      if (!g) return;
      var h;
      if (g.type === 'linear') {
        var n2 = [-g.dir[1], g.dir[0]], off = it.d.off != null ? it.d.off : 16 * s;
        if (Math.abs(off) < 6 * s) off = (off < 0 ? -6 : 6) * s;
        var A2 = [g.P[0] + n2[0] * off, g.P[1] + n2[1] * off];
        h = linearHandle({ O: K.to3D(pl, A2[0], A2[1]), dir: to3Ddir(pl, g.dir), k: 1, g: g, off: off, n2: n2 });
      } else {
        var a = (it.d.ang != null ? it.d.ang : 45) * Math.PI / 180, u = [Math.cos(a), Math.sin(a)];
        h = linearHandle({ O: K.to3D(pl, g.C[0], g.C[1]), dir: to3Ddir(pl, u), k: g.prefix === '⌀' ? 2 : 1, g: g });
      }
      h.kind = 'sdim'; h.sketch = sk.id; h.dim = it.d; h.dimIndex = it.index; h.auto = !!it.auto; h.value = g.value;
      h.label = sk.name + ' ' + (g.prefix === '⌀' ? 'Ø' : g.prefix || '') + dimText(g.value); h.prefix = g.prefix || ''; h.min = 0;
      h.apply = function (v) {
        var skNow = K.findFeature(App.model, sk.id), ent = skNow && skNow.entities[it.d.e];
        if (!ent) return false;
        if (window.SketchSolver) { var res = SketchSolver.setDim(skNow, it.auto ? it.d : it.index, v); return !!res.ok; }
        try { K.setDimValue(ent, it.d, v); return true; } catch (err) { return false; }
      };
      out.push(h);
    });
    return out;
  }

  // ---- r4/features4: the open PropertyManager's handles (UI.pmHandles, world coordinates) as drawable handles.
  // A drag sets the PM value (UI.pmSetValue: the field shows it and the command previews in the worker, newest wins);
  // nothing is rebuilt or put on the undo stack until ✓. A faded arrow behind a handle flips its direction (the PM's
  // Reverse check box); callouts show a value next to other picks and focus its field when clicked.
  function angleHandle(h, A, D, c, sign) {
    D = V.norm(D);
    var w = V.sub(c, A), hgt = V.dot(w, D), foot = V.add(A, V.scale(D, hgt)), w0 = V.sub(c, foot), r = V.len(w0);
    if (!(r > 1e-9)) return null;
    var e1 = V.scale(w0, 1 / r), e2 = V.cross(D, e1), s = sign || 1;
    h.angle = true; h.ring = true;
    h.pos = function (v) { return V.add(foot, V.scale(rotate(e1, D, s * v * Math.PI / 180), r)); };
    h.arrow = function (v) { return V.scale(rotate(e2, D, s * v * Math.PI / 180), s); };
    h.pxPerUnit = function () { return r * Math.PI / 180 / UI.cam.scale; };
    h.step = function () { var p = h.pxPerUnit(); return p >= 6 ? 1 : p >= 1.2 ? 5 : 15; };
    h.rawAt = function (mx, my) {
      var best = null, bestD = Infinity;
      for (var t = 0; t <= 360; t += 0.25) { var q = S(h.pos(t)), dd = Math.hypot(q[0] - mx, q[1] - my); if (dd < bestD) { bestD = dd; best = t; } }
      for (var b0 = best, t2 = b0 - 0.25; b0 != null && t2 <= b0 + 0.25 + 1e-9; t2 += 0.01) { var q2 = S(h.pos(t2)), d2 = Math.hypot(q2[0] - mx, q2[1] - my); if (d2 < bestD && t2 >= 0 && t2 <= 360) { bestD = d2; best = +t2.toFixed(2); } }   // r5/select5: refined for free drags
      return best;
    };
    return h;
  }
  function pmHandleObjects() {
    var list = UI.pmHandles ? UI.pmHandles() : [], out = [];
    list.forEach(function (d) {
      var h;
      if (d.type === 'callout') {
        h = { kind: 'callout', key: d.key, at: d.at, text: d.text, label: d.text, value: 0 };
        h.pos = function () { return d.at; }; h.arrow = function () { return [0, 0, 0]; }; h.pxPerUnit = function () { return 1; }; h.step = function () { return 1; };
      } else if (d.type === 'flip') {
        h = { kind: 'pmflip', flip: d.key, O: d.O, dir: V.norm(d.dir), label: 'Reverse direction', value: 0 };
        h.pos = function () { return h.O; }; h.arrow = function () { return h.dir; }; h.pxPerUnit = function () { return 1; }; h.step = function () { return 1; };
      } else {
        h = { kind: 'pm', pm: true, key: d.key, label: d.label, value: +d.value, min: d.min != null ? d.min : 0, max: d.max, flip: d.flip || null, tag: d.tag || '' };
        h.apply = function (v) { return UI.pmSetValue ? UI.pmSetValue(d.key, v) : false; };
        if (d.type === 'angle') { if (!angleHandle(h, d.A, d.D, d.c, d.sign)) return; }
        else { h.O = d.O; h.dir = V.norm(d.dir); h.k = d.k || 1; linearHandle(h); h.snapStep = function () { return BoxSelect.rulerStep(h.pxPerUnit(), 4); }; }
      }
      out.push(h);
    });
    return out;
  }
  function flipArrow(g, h, p, u) {
    // a faded arrow pointing the other way from the handle's base: click to reverse
    if (!u) return;
    var len = 26, tip = [p[0] - u[0] * len, p[1] - u[1] * len];
    var fg = svg('g', { 'class': 'i3d-flip', 'data-flip': h.flip }, g);
    svg('line', { 'class': 'i3d-grip', x1: p[0], y1: p[1], x2: tip[0], y2: tip[1] }, fg);
    svg('line', { 'class': 'i3d-flip-shaft', x1: p[0] - u[0] * 5, y1: p[1] - u[1] * 5, x2: tip[0] + u[0] * 7, y2: tip[1] + u[1] * 7 }, fg);
    arrowHead(fg, tip, [-u[0], -u[1]], 10, 'i3d-flip-head');
    var t = svg('title', {}, fg); t.textContent = 'Reverse direction';
    fg.addEventListener('mousedown', function (ev) { if (ev.button !== 0) return; ev.stopPropagation(); ev.preventDefault(); });
    fg.addEventListener('click', function (ev) { ev.stopPropagation(); if (UI.pmToggle) UI.pmToggle(h.flip); });
    h.flipAt = [(p[0] + tip[0]) / 2, (p[1] + tip[1]) / 2];
  }
  // a value box at `at` (u given: beyond `at` along the screen direction u, clear of the arrow head)
  function valueLabel(g, h, at, text, key, u) {
    var w = Math.max(24, text.length * 6.6 + 10);
    if (u) at = [at[0] + u[0] * (10 + Math.abs(u[0]) * w / 2 + Math.abs(u[1]) * 9), at[1] + u[1] * (10 + Math.abs(u[0]) * w / 2 + Math.abs(u[1]) * 9) + 4];
    var lg = svg('g', { 'class': 'i3d-callout', 'data-key': key || '' }, g);
    var tx = svg('text', { x: at[0], y: at[1], 'text-anchor': 'middle' }, lg);
    tx.textContent = text;
    var bg = svg('rect', { x: at[0] - w / 2, y: at[1] - 13, width: w, height: 18, rx: 3 }, null);
    lg.insertBefore(bg, tx);
    lg.addEventListener('mousedown', function (ev) { ev.stopPropagation(); ev.preventDefault(); if (UI.pmFocusField) UI.pmFocusField(key); });
    lg.addEventListener('dblclick', function (ev) { ev.stopPropagation(); });
    return lg;
  }
  function pmValueText(h, v) { return (h.tag || '') + fmtV(v, h); }

  // The handles for the current state: a feature's (part mode, one selected face or feature). rfBA: none in an open
  // sketch: in SolidWorks Instant3D acts on the part only and a sketch's dimensions are dragged with Instant2D
  // (ui-sketch-dims.js), so no dimension dots are made there (they used to be made and then hidden by style.css).
  function computeHandles() {
    if (!App.model || !App.build || !App.mesh || drawingOn() || isAsm()) return [];
    if (App.mode === 'part' && UI.hasPM && UI.hasPM()) return pmHandleObjects();   // r4/features4: PropertyManager handles, Instant3D on or off
    if (!i3d.on || App.mode === 'sketch') return [];
    if (App.mode !== 'part' || App.command || (UI.hasPM && UI.hasPM())) return [];
    var list = selection();
    if (list.length !== 1) return [];
    var s = list[0], f = null, face = null;
    if (s.kind === 'face') { var fc = App.mesh.faces[s.index]; if (!fc || !App.triShared) return []; f = K.findFeature(App.model, App.triShared[fc.start]); face = s.index; }
    else if (s.kind === 'feature') f = K.findFeature(App.model, s.id);
    if (!f || f.suppressed) return [];
    if (App.build.errors && App.build.errors[f.id]) return [];
    var pat = face != null ? patternOfInstance(f, face, s.point) : null;   // rfFD: a pattern copy's face is tagged with its seed
    if (pat) return otherFeatureHandles(pat, null);
    if (f.type !== 'extrude' && f.type !== 'revolve') return otherFeatureHandles(f, face);   // rfFD: fillet, shell, patterns
    var sk = K.findFeature(App.model, f.sketch), pl = sk && sketchPlane(sk);
    if (!sk || !pl) return [];
    var out = [], h = f.type === 'extrude' ? extrudeHandle(f, sk, pl, face) : revolveHandle(f, sk, pl, face);
    if (h) out.push(h);
    return out.concat(sketchDimHandles(sk, pl));
  }

  // ---- drawing
  // p9-sketchfix: a sketch dimension shown on the part reads as it does in the sketch (ui-sketch.js fmtDim: Ø.266 in an
  // inch part, not Ø0.27)
  function dimText(v) { return UI.fmtDim ? UI.fmtDim(v) : UI.fmtNum(v, 2); }
  function unit2(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); return L < 1e-9 ? null : [dx / L, dy / L]; }
  function arrowHead(g, tip, u, size, cls) {
    var px = -u[1] * size * 0.38, py = u[0] * size * 0.38;
    svg('polygon', { 'class': cls, points: tip[0] + ',' + tip[1] + ' ' + (tip[0] - u[0] * size + px) + ',' + (tip[1] - u[1] * size + py) + ' ' + (tip[0] - u[0] * size - px) + ',' + (tip[1] - u[1] * size - py) }, g);
  }
  function drawRuler(g, h, v) {
    var step = h.step(), maxV = h.angle ? 360 : Math.max(v * 1.35, v + 12 * step), minV = 0;
    // r5/select5: a value that may go negative (a plane offset) gets a ruler on both sides of 0
    if (!h.angle && h.min != null && h.min < 0) { maxV = Math.max(maxV, 6 * step); minV = Math.min(v * 1.35, v - 12 * step, -6 * step); }
    var k0 = Math.ceil(minV / step - 1e-9), n = Math.floor(maxV / step + 1e-9);
    if (n - k0 > 400) { if (v - k0 * step < 200 * step) n = k0 + 400; else k0 = n - 400; }
    var pts = [];
    for (var j = k0; j <= n; j++) pts.push(S(h.pos(j * step)));
    svg('polyline', { 'class': 'i3d-ruler' + (i3d.drag && i3d.drag.onRuler ? ' snapping' : ''), points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') }, g);
    var major = h.angle ? (step === 1 ? 15 : step === 5 ? 3 : 2) : 5, last = pts.length - 1;
    for (var i = 0; i <= last; i++) {
      var k = k0 + i, p = pts[i], q = pts[Math.min(last, i + 1)], o = pts[Math.max(0, i - 1)], u = unit2(o, q) || [1, 0], nn = [-u[1], u[0]];
      var isMajor = k % major === 0, L = isMajor ? 9 : 5, hit = i3d.drag && i3d.drag.onRuler && Math.abs(k * step - v) < step * 1e-6;
      svg('line', { 'class': 'i3d-tick' + (isMajor ? ' major' : '') + (hit ? ' hit' : ''), x1: p[0], y1: p[1], x2: p[0] + nn[0] * L, y2: p[1] + nn[1] * L }, g);
      if (isMajor && k !== 0) {
        var t = svg('text', { 'class': 'i3d-tick-label', x: p[0] + nn[0] * 17, y: p[1] + nn[1] * 17 + 4, 'text-anchor': 'middle' }, g);
        t.textContent = UI.fmtNum(k * step, 3);
      }
    }
  }
  function drawSketchDim(g, h, v) {
    var sk = K.findFeature(App.model, h.sketch), pl = sk && sketchPlane(sk), e = sk && sk.entities[h.dim.e], gg = e && K.dimGeometry(e, h.dim);
    if (!gg) return;
    var P = function (uv) { return S(K.to3D(pl, uv[0], uv[1])); };
    var dg = svg('g', { 'class': 'i3d-dim' }, g), label, at;
    var text = (gg.prefix === '⌀' ? 'Ø' : gg.prefix) + dimText(v != null ? v : gg.value);
    // r14/sketchui14: laid out exactly as the sketch's own dimensions (ui-sketch.js dimLayout): SolidWorks ANSI,
    // Century Gothic, the text horizontal in a break of the line, slim arrows, radius / diameter leaders with a shoulder
    var sc = UI.dimLayout && (gg.type === 'linear' ? UI.linearDimScreen(pl, gg.P, gg.Q, gg.dir, h.off, null) : UI.radialDimScreen(pl, gg.C, gg.r, h.dim.ang, null));
    if (sc) {
      sc.label = text;
      var lay = UI.dimLayout(sc);
      svg('path', { 'class': 'i3d-dim-line', d: lay.d }, dg);
      svg('path', { 'class': 'i3d-dim-arrow', d: lay.arrows }, dg);
      label = svg('text', { x: Math.round(lay.text.x * 100) / 100, y: Math.round(lay.text.y * 100) / 100, 'text-anchor': lay.text.anchor, 'class': 'i3d-dim-text' }, dg);
      label.textContent = text;
      label.addEventListener('mousedown', function (ev) { ev.stopPropagation(); ev.preventDefault(); openEdit(h); });
      label.addEventListener('dblclick', function (ev) { ev.stopPropagation(); });
      return;
    }
    if (gg.type === 'linear') {
      var n2 = [-gg.dir[1], gg.dir[0]], off = h.off;
      var A = [gg.P[0] + n2[0] * off, gg.P[1] + n2[1] * off], B = [A[0] + gg.dir[0] * gg.value, A[1] + gg.dir[1] * gg.value];
      var Q2 = [gg.Q[0] + n2[0] * off, gg.Q[1] + n2[1] * off];
      [[gg.P, A], [gg.Q, Q2]].forEach(function (l) { var a = P(l[0]), b = P(l[1]); svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, dg); });
      var sA = P(A), sB = P(B), u = unit2(sA, sB);
      svg('line', { x1: sA[0], y1: sA[1], x2: sB[0], y2: sB[1] }, dg);
      if (u) { arrowHead(dg, sA, [-u[0], -u[1]], 8, ''); arrowHead(dg, sB, u, 8, ''); }
      at = [(sA[0] + sB[0]) / 2, (sA[1] + sB[1]) / 2 - 6];
    } else {
      var a = (h.dim.ang != null ? h.dim.ang : 45) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
      var Pc = P([gg.C[0] + ux * gg.r, gg.C[1] + uy * gg.r]), T = P([gg.C[0] + ux * (gg.r + 18 * UI.cam.scale), gg.C[1] + uy * (gg.r + 18 * UI.cam.scale)]);
      svg('line', { x1: Pc[0], y1: Pc[1], x2: T[0], y2: T[1] }, dg);
      var ut = unit2(T, Pc);
      if (ut) arrowHead(dg, Pc, ut, 8, '');
      at = [T[0], T[1] - 4];
    }
    label = svg('text', { x: at[0], y: at[1], 'text-anchor': 'middle', 'class': 'i3d-dim-text' }, dg);
    label.textContent = (gg.prefix === '⌀' ? 'Ø' : gg.prefix) + dimText(v != null ? v : gg.value);
    label.addEventListener('mousedown', function (ev) { ev.stopPropagation(); ev.preventDefault(); openEdit(h); });
    label.addEventListener('dblclick', function (ev) { ev.stopPropagation(); });
  }
  // r4/features4: the PropertyManager list row under the pointer, drawn over the model (edges as wide lines, a pick
  // without resolved geometry as a ring at its point); faces are lit in 3D by drawSelectionExtras
  function drawHoverItem() {
    var it = App.command && App.command.hoverItem;
    if (!it || App.mode !== 'part') return;
    var g = svg('g', { 'class': 'i3d-hover-item' }, layer), edges = it.edges || [], faces = it.faces || [];
    edges.forEach(function (e) {
      var pts = e.curve != null && App.curves && App.curves[e.curve] && App.curves[e.curve].edges.indexOf(e) >= 0 ? App.curves[e.curve].pts : [e.a, e.b];
      svg('polyline', { points: pts.map(function (p) { var s = S(p); return s[0] + ',' + s[1]; }).join(' ') }, g);
    });
    if (!edges.length && !faces.length && it.at) { var s = S(it.at); svg('circle', { cx: s[0], cy: s[1], r: 7 }, g); }
  }
  var handleList = [];
  function drawI3D() {
    var d = i3d.drag;
    // r12/sketchui12: while sketch geometry is dragged the dimension grips are hidden (SolidWorks shows none then) and
    // not recomputed on every frame; they come back when the drag ends
    if (!d && App.mode === 'sketch' && App.sketchDragging) { if (layer.firstChild) layer.textContent = ''; handleList = []; return; }
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    // a handle whose direction is seen end-on cannot be dragged in this view and is left out
    handleList = d ? [d.h] : computeHandles().filter(function (h) { return h.pxPerUnit() > 0.02; });
    if (i3d.edit && !d && !handleList.some(function (h) { return hKey(h) === i3d.edit.key; })) closeEdit(false);
    drawHoverItem();
    handleList.forEach(function (h, idx) {
      var v = d ? d.v : h.value, g = svg('g', { 'class': 'i3d ' + h.kind, 'data-kind': h.kind, 'data-index': String(idx) }, layer);
      // r4/features4: PropertyManager callouts and flip-only arrows
      if (h.kind === 'callout') {
        var cp = S(h.at), lab = [cp[0] + 34, cp[1] - 24];
        svg('line', { 'class': 'i3d-leader', x1: cp[0], y1: cp[1], x2: lab[0] - 12, y2: lab[1] - 4 }, g);
        svg('circle', { 'class': 'i3d-anchor', cx: cp[0], cy: cp[1], r: 2.5 }, g);
        valueLabel(g, h, lab, h.text, h.key);
        return;
      }
      if (h.kind === 'pmflip') {
        var fp = S(h.O), fu = unit2(fp, S(V.add(h.O, h.dir)));
        if (fu) flipArrow(g, h, fp, [-fu[0], -fu[1]]);
        return;
      }
      if (d) drawRuler(g, h, v);
      if (h.kind === 'sdim') drawSketchDim(g, h, d ? v : null);
      var p = S(h.pos(v)), a = h.arrow(v), q = S(V.add(h.pos(v), a)), u = unit2(p, q);
      var hg = svg('g', { 'class': 'i3d-handle', 'data-kind': h.kind, 'data-index': String(idx) }, g);
      if (h.kind === 'sdim') {
        svg('circle', { 'class': 'i3d-grip', cx: p[0], cy: p[1], r: 9 }, hg);
        svg('circle', { 'class': 'i3d-dot', cx: p[0], cy: p[1], r: 4.5 }, hg);
        h.grab = p;
      } else {
        var len = 38, tip = u ? [p[0] + u[0] * len, p[1] + u[1] * len] : p;
        if (u) {
          svg('line', { 'class': 'i3d-grip', x1: p[0], y1: p[1], x2: tip[0], y2: tip[1] }, hg);
          svg('line', { 'class': 'i3d-shaft', x1: p[0], y1: p[1], x2: tip[0] - u[0] * 8, y2: tip[1] - u[1] * 8 }, hg);
          arrowHead(hg, tip, u, 12, 'i3d-head');
        }
        svg('circle', { 'class': 'i3d-base', cx: p[0], cy: p[1], r: 3.5 }, hg);
        h.grab = u ? [p[0] + u[0] * len * 0.55, p[1] + u[1] * len * 0.55] : p;
        if (h.pm) {
          // r4/features4: the value beside the arrow (click: type it in the PropertyManager), the flip arrow at its base
          valueLabel(g, h, tip, pmValueText(h, v), h.key, u || [1, 0]);
          if (h.flip && !d) {
            var b0 = h.angle ? h.pos(0) : h.O, bs = S(b0), bu = unit2(bs, S(V.add(b0, h.angle ? h.arrow(0) : h.dir)));
            flipArrow(g, h, bs, bu);
          }
        } else if (d) { var tx = svg('text', { 'class': 'i3d-value', x: tip[0] + (u ? u[0] * 10 : 0), y: tip[1] + (u ? u[1] * 10 : 0) - 6, 'text-anchor': 'middle' }, g); tx.textContent = fmtV(v, h); }
      }
      hg.setAttribute('aria-label', h.label + ' ' + fmtV(v, h) + ' — drag to change');
      hg.addEventListener('mousedown', function (ev) {
        if (ev.button !== 0) return;
        ev.stopPropagation(); ev.preventDefault(); startDrag(h, ev);
      });
      hg.addEventListener('dblclick', function (ev) { ev.stopPropagation(); });
    });
    if (i3d.edit && !i3d.drag) positionEdit();
  }
  function hKey(h) { return h.kind + ':' + (h.fid != null ? h.fid : h.sketch) + ':' + (h.dimIndex != null ? h.dimIndex : h.dim ? h.dim.e + h.dim.k + (h.dim.i || '') : ''); }

  // ---- dragging
  function pos(ev) { var r = viewport.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function pushUndoOnce(d) {
    if (d.pushed) return;
    d.pushed = true;
    if (App.mode === 'sketch') { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; d.undoPushed = true; } }
    else { UI.pushUndo(); d.undoPushed = true; }
  }
  var liveBusy = false, livePending = false;
  function liveRebuild(h) {
    if (App.mode === 'sketch') { App.gridStale = true; UI.updateSketches(); return; }
    // r3/engine3: a feature drag previews only that feature (built in the worker); the release rebuilds the part once
    if (i3d.drag && i3d.drag.fid != null && UI.featurePreview && UI.featurePreview(i3d.drag.fid)) { i3d.drag.previewed = true; schedulePause(i3d.drag); return; }
    if (liveBusy) { livePending = true; return; }
    liveBusy = true;
    UI.afterRebuild(UI.rebuild({ noSave: true }), function () {
      liveBusy = false;
      if (livePending) { livePending = false; liveRebuild(h); }
    }).catch(function () { liveBusy = false; });
  }
  // r4/features4: while a feature is dragged only it is previewed; once the drag rests PAUSE_MS on a value the whole
  // part is rebuilt in the background (not saved, no undo step), so its patterns, mirrors and the other features of
  // the sketch follow before the button is released. A move during that rebuild previews again on top of it.
  var PAUSE_MS = 180;
  function schedulePause(d) {
    clearTimeout(i3d.pauseT);
    i3d.pauseT = setTimeout(function () {
      if (i3d.drag !== d || d.pausedAt === d.v) return;
      if (liveBusy) { schedulePause(d); return; }
      liveBusy = true;
      d.pausedAt = d.v;
      var t0 = performance.now(), p = UI.rebuild({ noSave: true });
      if (UI.featurePreviewEnd) UI.featurePreviewEnd(p);
      UI.afterRebuild(p, function () { liveBusy = false; i3d.lastPauseMs = performance.now() - t0; i3d.pauses = (i3d.pauses || 0) + 1; }).catch(function () { liveBusy = false; });
    }, PAUSE_MS);
  }
  // r5/select5: a handle drags freely (to the displayed precision, as in SolidWorks); with the pointer over the ruler
  // (its tick side, RULER_PX[0]..[1] px off the drag line) the value snaps to the tick under the pointer.
  // (was: every handle snapped to ruler steps, so a value between two ticks could not be reached by dragging)
  var RULER_PX = [4, 34];
  function rulerSide(h, v) {   // the screen unit normal the ruler's ticks point along at value v (null: seen end-on)
    var st = h.step(), a = S(h.pos(v - st * 0.5)), b = S(h.pos(v + st * 0.5)), u = unit2(a, b);
    return u ? [-u[1], u[0]] : null;
  }
  function onRuler(h, raw, m) {
    if (raw == null || !m) return false;
    var p = S(h.pos(raw)), nn = rulerSide(h, raw);
    if (!nn) return false;
    var off = (m[0] - p[0]) * nn[0] + (m[1] - p[1]) * nn[1];
    return off >= RULER_PX[0] && off <= RULER_PX[1];
  }
  function clampValue(h, v, step) {
    var lo = h.min != null ? h.min : 0;
    if (lo >= 0 && v <= lo) v = step;
    else if (v < lo) v = lo;
    if (h.max != null && v > h.max) v = h.max;
    return v;
  }
  function valueFor(h, raw, m, rawAtPointer) {
    var d = i3d.drag;
    if (m && onRuler(h, rawAtPointer, m)) {   // over the ruler: the tick under the pointer
      var step = h.step();
      if (d) d.onRuler = true;
      return clampValue(h, BoxSelect.snap(rawAtPointer, step), step);
    }
    if (d) d.onRuler = false;
    var fine = Math.pow(10, -valueDecimals(h));
    return clampValue(h, BoxSelect.snap(raw, fine), fine);
  }
  // a point `px` pixels over the ruler at value v (tests / scripts: where a pointer snaps to v)
  function rulerPoint(h, v, px) {
    var p = S(h.pos(v)), nn = rulerSide(h, v);
    px = px == null ? 14 : px;
    return nn ? [p[0] + nn[0] * px, p[1] + nn[1] * px] : p;
  }
  function startDrag(h, ev) {
    closeEdit(false);
    var m = pos(ev), raw = h.rawAt(m[0], m[1]);
    // a feature handle is dragged with the feature selected (face indices change while it rebuilds)
    if (App.mode === 'part' && h.fid != null) { if (h.side) i3d.side[h.fid] = h.side; }
    var d = i3d.drag = { h: h, v0: h.value, v: h.value, grab: raw == null ? 0 : raw - h.value, moved: false, pushed: false, sel: App.sel };
    if (h.angle && raw != null && Math.abs(d.grab) > 180) d.grab = 0;   // a ring grabbed across 0° / 360°
    if (App.mode === 'part' && !h.pm) {
      var fid = h.fid != null ? h.fid : ownerFeature();
      if (fid != null) { App.sel = { kind: 'feature', id: fid }; App.sel2 = null; App.multi = []; UI.updateHighlights(); }
      d.fid = fid;
    }
    viewport.classList.add('tool-grab');
    function move(e) {
      var q = pos(e), r = h.rawAt(q[0], q[1]);
      if (r == null) return;
      d.moved = true;
      var wasOn = d.onRuler, v = valueFor(h, r - d.grab, q, r);
      if (wasOn !== d.onRuler) App.dimsStale = true;   // the ruler lights while it snaps
      if (Math.abs(v - d.v) < 1e-12) return;
      if (h.pm) {   // r4/features4: a PropertyManager value (its preview is built in the worker; ✓ commits)
        var t0 = performance.now();
        if (h.apply(v) === false) return;
        d.v = v; App.dimsStale = true;
        i3d.lastPmMoveMs = performance.now() - t0;
        if (UI.setStatus) UI.setStatus(h.label + ': ' + pmValueText(h, v) + ' (release, then Enter or ✓ to accept)');
        return;
      }
      pushUndoOnce(d);
      if (h.apply(v) === false) return;          // the sketch solver refused the value: keep the last good one
      d.v = v;
      liveRebuild(h);
      App.dimsStale = true;
      if (UI.setStatus) UI.setStatus(h.label.replace(/ [\d.]+$/, '') + ': ' + fmtV(v, h) + ' (Instant3D; release to type a value)');
    }
    function up() {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      viewport.classList.remove('tool-grab');
      endDrag();
    }
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  }
  function ownerFeature() {
    var s = App.sel;
    if (s && s.kind === 'face') return ownerOfFace(s.index);
    if (s && s.kind === 'feature') return s.id;
    return null;
  }
  // After the drag: the final (saved) rebuild, the end face selected again, and the value box.
  function endDrag() {
    var d = i3d.drag;
    if (!d) return Promise.resolve();
    i3d.drag = null;
    var h = d.h;
    clearTimeout(i3d.pauseT);
    if (h.pm) { App.dimsStale = true; if (d.moved && UI.pmFocusField) UI.pmFocusField(h.key); return Promise.resolve(); }   // r4/features4
    var session = { key: hKey(h), pushed: d.pushed, fid: d.fid, side: h.side, kind: h.kind, sketch: h.sketch, dimIndex: h.dimIndex, dim: h.dim };
    if (App.mode === 'sketch') { App.dimsStale = true; openEditFor(session); return Promise.resolve(); }
    var done = d.pushed ? UI.afterRebuild(UI.rebuild(), function () { return UI.whenIdle(); }) : Promise.resolve();
    if (d.previewed && UI.featurePreviewEnd) UI.featurePreviewEnd(done);   // r3/engine3: the feature preview goes once the part is rebuilt
    return done.then(function () { reselect(session); openEditFor(session); });
  }
  // Select the dragged feature's end face again (depth / angle handles), or keep the feature selected.
  function reselect(session) {
    if (session.fid == null || !App.mesh) return;
    var f = K.findFeature(App.model, session.fid);
    if (!f) return;
    App.sel = { kind: 'feature', id: f.id }; App.sel2 = null; App.multi = [];
    if (session.kind === 'depth' || session.kind === 'angle') {
      var hs = computeHandles().filter(function (x) { return x.kind === session.kind; })[0], sk = K.findFeature(App.model, f.sketch), pl = sk && sketchPlane(sk);
      if (hs && pl) {
        // the end face whose handle is this one
        for (var i = 0; i < App.mesh.faces.length; i++) {
          var h = f.type === 'extrude' ? extrudeHandle(f, sk, pl, i) : revolveHandle(f, sk, pl, i);
          if (h && (h.side == null || h.side === session.side)) { App.sel = { kind: 'face', index: i }; break; }
        }
      }
    }
    UI.updateHighlights(); UI.refreshTree();
  }
  function openEditFor(session) {
    var h = null;
    computeHandles().forEach(function (x) { if (!h && hKey(x) === session.key) h = x; });
    if (h) openEdit(h, session.pushed);
  }

  // ---- the value box (Enter applies, Esc or clicking elsewhere closes it; part of the drag's undo step)
  function openEdit(h, pushed) {
    i3d.edit = { key: hKey(h), h: h, pushed: !!pushed };
    editInput.value = String(Math.round(h.value * 1e6) / 1e6);
    editBox.hidden = false;
    editBox.setAttribute('data-kind', h.kind);
    editBox.title = h.label;
    positionEdit();
    try { editInput.focus(); editInput.select(); } catch (e) { }
  }
  function positionEdit() {
    var ed = i3d.edit;
    if (!ed) return;
    var p = S(ed.h.pos(ed.h.value));
    editBox.style.left = (p[0] + 14) + 'px';
    editBox.style.top = (p[1] + 10) + 'px';
  }
  // commit: apply the typed value -> Promise (resolves when the rebuild is applied)
  function closeEdit(commit) {
    var ed = i3d.edit;
    if (!ed) return Promise.resolve(false);
    i3d.edit = null;
    editBox.hidden = true;
    if (!commit) return Promise.resolve(false);
    var h = ed.h;
    // p9-sketch: shop input (3/8, 1-1/2, 25mm, 2*3/8; 45deg for an angle handle), "=…" equations as before
    var r = UI.evalInput ? UI.evalInput(editInput.value, { kind: h.angle ? 'angle' : 'length' }) : { value: parseFloat(editInput.value) };
    if (r.error != null || !(r.value > (h.min || 0)) || (h.max != null && r.value > h.max)) {
      if (UI.setStatus) UI.setStatus('Value not changed: ' + (r.error || 'must be greater than 0' + (h.max != null ? ' and at most ' + h.max : '')));
      return Promise.resolve(false);
    }
    if (Math.abs(r.value - h.value) < 1e-12) return Promise.resolve(true);
    var d = { pushed: ed.pushed };
    pushUndoOnce(d);
    if (h.apply(r.value) === false) { if (UI.setStatus) UI.setStatus('Value not changed: the sketch cannot reach ' + fmtV(r.value, h) + '.'); return Promise.resolve(false); }   // sketch-units
    if (UI.setStatus) UI.setStatus(h.label.replace(/ [\d.]+$/, '') + ' set to ' + fmtV(r.value, h) + '.');
    if (App.mode === 'sketch') { App.gridStale = true; UI.updateSketches(); return Promise.resolve(true); }
    var session = { fid: h.fid != null ? h.fid : ownerFeature(), side: h.side, kind: h.kind };
    return UI.afterRebuild(UI.rebuild(), function () { return UI.whenIdle(); }).then(function () { reselect(session); return true; });
  }
  editInput.addEventListener('keydown', function (ev) {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); closeEdit(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); UI.escapeCommand(); }   // lane CG: closes unapplied (escapeBoxes) and ends the command under it
  });
  editInput.addEventListener('blur', function () { if (i3d.edit && !i3d.committing) closeEdit(false); });
  editBox.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });

  // render loop: the overlay follows the camera and the selection (App.dimsStale -> UI.drawDims)
  var baseDrawDims = UI.drawDims;
  UI.drawDims = function () { var r = baseDrawDims ? baseDrawDims.apply(this, arguments) : []; drawI3D(); return r; };

  function setInstant3D(on) {
    i3d.on = on == null ? !i3d.on : !!on;
    if (!i3d.on) closeEdit(false);
    App.dimsStale = true;
    drawI3D();
    if (UI.refreshRibbon) UI.refreshRibbon();
    if (UI.setStatus) UI.setStatus('Instant3D ' + (i3d.on ? 'on: select a face of an extrude, revolve, fillet, shell or pattern and drag its arrow.' : 'off.'));
    return i3d.on;
  }

  // ================================================================== r5/select5: Select Other
  // Right-click on the model ▸ Select Other lists every face under the pointer, nearest first, hidden ones included (as
  // in SolidWorks); hovering a row pre-highlights its face, a click selects it (Ctrl / Shift: added; an open
  // PropertyManager's selection box takes it). A right-drag pans and shows no menu.
  var rDown = null, soMenu = null;
  viewport.addEventListener('mousedown', function (ev) { if (ev.button === 2) rDown = pos(ev); }, true);
  function faceLabel(i) {
    var f = App.mesh && App.mesh.faces[i];
    if (!f) return 'Face';
    var owner = '';
    if (isAsm()) owner = UI.bodyName ? UI.bodyName(f.body || 0) : '';
    else { var ft = App.triShared ? K.findFeature(App.model, App.triShared[f.start]) : null; owner = ft ? ft.name : ''; }
    return 'Face ' + i + (owner ? '@' + owner : '');   // the number the status bar shows on hover
  }
  function takeOther(fc, add) {
    if (App.command && App.command.onPick && App.command.onPick(fc) !== false) return;
    var f = filterSet(), hit = fc;
    if (f && !f.faces) hit = bodyFilter(f) ? { kind: 'body', index: faceBody(fc.index) } : null;
    if (!hit) return;
    if (add) setSelection(BoxSelect.combine(selection(), [hit], 'add', selKey));
    else setSelection([hit]);
  }
  function selectOther(faces, x, y, add) {
    UI.showMenu(x, y, faces.map(function (fc) { return { label: faceLabel(fc.index), action: function () { App.hover = null; takeOther(fc, add); UI.updateHighlights(); } }; }));
    var menus = document.querySelectorAll('body > .menu'), m = menus[menus.length - 1];
    if (!m) return;
    m.classList.add('select-other'); soMenu = m;
    Array.prototype.forEach.call(m.querySelectorAll('.mi'), function (row, k) {
      var hv = k ? { kind: 'face', index: faces[k].index, point: faces[k].point, through: true } : faces[k];   // hidden ones show through
      row.addEventListener('mouseenter', function () { App.hover = hv; UI.updateHighlights(); if (UI.requestRender) UI.requestRender(); });
      row.addEventListener('mouseleave', function () { if (App.hover === hv) { App.hover = null; UI.updateHighlights(); if (UI.requestRender) UI.requestRender(); } });
    });
  }
  viewport.addEventListener('contextmenu', function (ev) {
    if (App.mode !== 'part' || drawingOn() || !App.mesh || !UI.pickFacesAll || !UI.showMenu) return;
    var p = pos(ev);
    if (rDown && Math.hypot(p[0] - rDown[0], p[1] - rDown[1]) > 4) return;   // a right-drag panned the view
    if (ev.target.closest && ev.target.closest('#hud, #i3d-edit, #i3d-layer .i3d')) return;
    var faces = UI.pickFacesAll(p[0], p[1]), add = ev.ctrlKey || ev.shiftKey;
    if (!faces.length) return;
    var items = [{ label: 'Select Other', action: function () { selectOther(faces, ev.clientX, ev.clientY, add); } }];
    if (selection().length) items.push({ label: 'Clear Selection', action: function () { setSelection([], { quiet: true }); } });
    UI.showMenu(ev.clientX, ev.clientY, items);
  });
  UI.selectOtherAt = function (mx, my) { return UI.pickFacesAll ? UI.pickFacesAll(mx, my).map(function (fc) { return { index: fc.index, label: faceLabel(fc.index) }; }) : []; };

  // ================================================================== keys
  // rfY (fidelity 3 #3): Esc with a menu or ribbon flyout open only closes it (ui-app.js); the multi-selection stays.
  // ui-app.js closes the menu before this listener runs, so whether one was open is read in the capture phase.
  var escOnMenu = false;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') escOnMenu = !!(UI.menuOpen && UI.menuOpen()) || !!document.querySelector('.rb-fly.open, .rb-more.open, #menus > li.open'); }, true);
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'F5') { e.preventDefault(); toggleBar(); return; }
    if (e.key === 'F6') { e.preventDefault(); setFilter({ suspended: !filter.suspended }); return; }
    if (e.key === 'Escape') {
      if (!escOnMenu) App.multi = [];
      escOnMenu = false;
    }
  });
  // lane CG: Esc (ui-commands.js escapeCommand) drops a box selection being dragged and closes Instant3D's value box
  // unapplied
  UI.escapeBoxes = UI.escapeBoxes || [];
  UI.escapeBoxes.push(function () {
    var did = false;
    if (boxing) { boxing.cancelled = true; boxEl.hidden = true; did = true; }
    if (i3d.edit) { closeEdit(false); did = true; }
    return did;
  });

  // ================================================================== rfFD: lasso, Select hidden entities, Instant3D on other features
  // Instant3D on a selected face of a fillet / chamfer (radius / distance), a shell (wall thickness) or a linear /
  // circular pattern (spacing / angle): ui-commands.js UI.instant3DFeatureHandles gives the handles the feature's
  // PropertyManager shows; a drag or a typed value edits the feature itself (one undo step, rebuilt as an extrude drag).
  function otherFeatureHandles(f, faceIndex) {
    var specs = [];
    try { specs = UI.instant3DFeatureHandles ? UI.instant3DFeatureHandles(f, faceIndex) || [] : []; } catch (e) { specs = []; }
    var out = [];
    specs.forEach(function (d) {
      if (!d || d.type === 'callout' || d.type === 'flip') return;
      var val = numeric(f[d.key]);
      if (val == null) return;   // an equation drives it: no handle
      var h = { kind: 'fparam', fid: f.id, dimIndex: d.key, key: d.key, label: (f.name || f.type) + ' ' + String(d.label || d.key).toLowerCase(), value: val, min: d.min != null ? d.min : 0, max: d.max };
      h.apply = function (v) { f[d.key] = v; return true; };
      if (d.type === 'angle') { if (!angleHandle(h, d.A, d.D, d.c, d.sign)) return; }
      else { h.O = d.O; h.dir = V.norm(d.dir); h.k = d.k || 1; linearHandle(h); }
      out.push(h);
    });
    return out;
  }
  // A face of a linear / circular pattern's copy carries its seed feature's id (the copies are the seed's tool moved):
  // the face lies outside the seed's tool and inside the pattern's -> that pattern, else null.
  function toolBox(fid) {
    var t = App.build && App.build.tools && App.build.tools[fid], b = t && t.getBounds && t.getBounds();
    if (!b) return null;
    return { lo: b.min.x != null ? [b.min.x, b.min.y, b.min.z] : b.min, hi: b.max.x != null ? [b.max.x, b.max.y, b.max.z] : b.max };
  }
  function boxHas(b, p) {
    var tol = 1e-6 * Math.max(1, Math.abs(b.hi[0] - b.lo[0]) + Math.abs(b.hi[1] - b.lo[1]) + Math.abs(b.hi[2] - b.lo[2]));
    for (var k = 0; k < 3; k++) if (p[k] < b.lo[k] - tol || p[k] > b.hi[k] + tol) return false;
    return true;
  }
  function patternOfInstance(seed, faceIndex, at) {
    var fc = App.mesh.faces[faceIndex], seedBox = toolBox(seed.id), c = at || (fc && fc.centroid);   // a click's point (coplanar copies share one face)
    if (!c || !seedBox || boxHas(seedBox, c)) return null;
    var hit = null;
    App.model.features.forEach(function (p) {
      if (hit || p.suppressed || (p.type !== 'lpattern' && p.type !== 'cpattern')) return;
      var src = Array.isArray(p.feature) ? p.feature.map(Number) : [+p.feature];
      if (src.indexOf(seed.id) < 0) return;
      var pb = toolBox(p.id);
      if (pb && boxHas(pb, c)) hit = p;
    });
    return hit;
  }

  // Select hidden entities (Tools ▸ Options ▸ System Options ▸ Display/Selection), off by default as in SolidWorks: a
  // box or lasso in a shaded view then takes only the model edges, vertices, faces and bodies that can be seen. Hidden Lines Removed,
  // Hidden Lines Visible and Wireframe take hidden ones too, as SolidWorks does; on = through the part (the old way).
  // Faces and bodies count when a pixel of theirs inside the box / lasso shows (FD2). Saved in localStorage
  // anvil.selectHidden ('1' on).
  var selectHiddenOn = false;
  try { selectHiddenOn = localStorage.getItem('anvil.selectHidden') === '1'; } catch (e) { }
  function selectHidden(on) {
    if (on == null) return selectHiddenOn;
    selectHiddenOn = !!on;
    try { localStorage.setItem('anvil.selectHidden', selectHiddenOn ? '1' : '0'); } catch (e) { }
    return selectHiddenOn;
  }
  function occlusionWanted() {
    var st = App.view && App.view.style;
    return !selectHiddenOn && App.mode !== 'sketch' && (!st || st === 'shadedEdges' || st === 'shaded');
  }
  // A depth buffer of the shaded part at screen resolution (orthographic camera: depth is linear on screen), built
  // once per box / lasso. seen(p): the point is not behind the part: within the 3 × 3 pixels around it some pixel is
  // empty (the outline) or not clearly nearer than p. edge(e): any of a few points along it is seen.
  function occluder() {
    var m = App.mesh, w = Math.max(1, Math.ceil(UI.size.w)), h = Math.max(1, Math.ceil(UI.size.h));
    var zb = new Float32Array(w * h), ib = new Int32Array(w * h), pos = m.positions64 || m.positions, D = camDir(), sp = screenMesh();
    var sec = App.view.section && App.view.section.plane, tol = 3 * (UI.cam.scale || 0.01);
    zb.fill(-Infinity); ib.fill(-1);
    function dep(i) { return pos[i * 3] * D[0] + pos[i * 3 + 1] * D[1] + pos[i * 3 + 2] * D[2]; }
    function tri(t, fi) {
      var i = t * 3, ax = sp[i * 2], ay = sp[i * 2 + 1], bx = sp[i * 2 + 2], by = sp[i * 2 + 3], cx = sp[i * 2 + 4], cy = sp[i * 2 + 5];
      var area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (!(Math.abs(area) > 1e-9)) return;
      if (sec) {   // a section view: a triangle on the removed side does not hide anything
        var c = new THREE.Vector3((pos[i * 3] + pos[i * 3 + 3] + pos[i * 3 + 6]) / 3, (pos[i * 3 + 1] + pos[i * 3 + 4] + pos[i * 3 + 7]) / 3, (pos[i * 3 + 2] + pos[i * 3 + 5] + pos[i * 3 + 8]) / 3);
        if (sec.distanceToPoint(c) < 0) return;
      }
      var az = dep(i), bz = dep(i + 1), cz = dep(i + 2);
      var x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
      var y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
      for (var y = y0; y <= y1; y++) {
        var py = y + 0.5;
        for (var x = x0; x <= x1; x++) {
          var px = x + 0.5;
          var w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
          if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) continue;
          var z = w0 * az + w1 * bz + w2 * cz, k = y * w + x;
          if (z > zb[k]) { zb[k] = z; ib[k] = fi; }
        }
      }
    }
    m.faces.forEach(function (fc, fi) {
      if (!faceVisible(fi)) return;
      for (var t = fc.start; t < fc.start + fc.count; t++) tri(t, fi);
    });
    function seen(p) {
      var s = S(p), d = p[0] * D[0] + p[1] * D[1] + p[2] * D[2], px = Math.floor(s[0]), py = Math.floor(s[1]);
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var x = px + dx, y = py + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) return true;
        var zz = zb[y * w + x];
        if (zz === -Infinity || d >= zz - tol) return true;
      }
      return false;
    }
    function edge(e) {
      var a = S(e.a), b = S(e.b), n = Math.max(1, Math.min(8, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 20)));
      for (var k = 0; k < n; k++) {
        var t = (k + 0.5) / n;
        if (seen([e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t, e.a[2] + (e.b[2] - e.a[2]) * t])) return true;
      }
      return false;
    }
    // FD2: the faces (by face-group root) and bodies owning a pixel whose centre lies in the region r (box or lasso)
    function shownIn(r) {
      var out = { faces: {}, bodies: {} }, root = {};
      var x0 = Math.max(0, Math.floor(r.x0)), x1 = Math.min(w - 1, Math.ceil(r.x1)), y0 = Math.max(0, Math.floor(r.y0)), y1 = Math.min(h - 1, Math.ceil(r.y1));
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var fi = ib[y * w + x];
        if (fi < 0) continue;
        var g = root[fi];
        if (g == null) g = root[fi] = UI.faceGroup ? UI.faceGroup(fi)[0] : fi;
        var bi = m.faces[fi].body || 0;
        if (out.faces[g] && out.bodies[bi]) continue;
        if (!BoxSelect.inside([x + 0.5, y + 0.5], r)) continue;
        out.faces[g] = true; out.bodies[bi] = true;
      }
      return out;
    }
    return { seen: seen, edge: edge, shownIn: shownIn };
  }

  // Lasso Selection (SolidWorks: right-click the graphics area ▸ Lasso Selection; it stays until Box Selection): a
  // left-drag draws a free-form loop and, on release, what lies wholly inside it is selected (the window rule) under
  // the Selection Filter; Ctrl adds, Shift toggles, as a box does. Parts (edges by default; faces / vertices with the
  // filter), open sketches (entities and points) and assemblies (components). In a part the loop may start on the
  // model (a plain click still selects).
  var selMode = 'box';
  var lassoSvg = svg('svg', { id: 'sel-lasso' });
  lassoSvg.style.display = 'none';
  var lassoPath = svg('polyline', { points: '' }, lassoSvg);
  viewport.appendChild(lassoSvg);
  function selectionMode(mode) {
    if (mode === 'box' || mode === 'lasso') {
      selMode = mode;
      if (UI.setStatus) UI.setStatus(mode === 'lasso' ? 'Lasso Selection: drag a loop around the items to select (right-click ▸ Box Selection goes back).' : 'Box Selection.');
    }
    return selMode;
  }
  function showLasso(pts) {
    lassoSvg.style.display = pts ? '' : 'none';
    lassoPath.setAttribute('points', pts ? pts.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ') : '');
  }
  // the loop with points at least 3 px apart, at most 400 of them
  function lassoPoints(pts) {
    var out = [];
    (pts || []).forEach(function (q) { var l = out[out.length - 1]; if (q && (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) >= 3)) out.push([q[0], q[1]]); });
    if (out.length > 400) { var step = out.length / 400, d = []; for (var i = 0; i < 400; i++) d.push(out[Math.floor(i * step)]); out = d; }
    return out;
  }
  function applyLasso(pts, mods) {
    var loop = lassoPoints(pts), r = BoxSelect.lasso(loop);
    if (loop.length < 3 || r.x1 - r.x0 < 2 || r.y1 - r.y0 < 2) return selection();
    return applyBox(r, mods);
  }
  function lassoHook(p, mods) {
    return {
      box: true, lasso: true,
      start: function () { boxing = { start: p, end: p, mods: mods, pts: [p] }; showLasso(boxing.pts); },
      move: function (q) { if (!boxing) return; boxing.end = q; boxing.pts.push(q); showLasso(boxing.pts); },
      end: function (q) {
        var b = boxing; boxing = null; showLasso(null);
        if (!b || b.cancelled) return;
        b.pts.push(q);
        applyLasso(b.pts, mods);
      }
    };
  }
  UI.escapeBoxes.push(function () { if (lassoSvg.style.display !== 'none') { showLasso(null); return true; } return false; });
  // the right-click menu rows (an empty spot of the graphics area in a part or assembly; in a sketch ui-panels.js
  // sketchMenuItems adds them)
  function selectionModeMenuItems() {
    return [
      { label: 'Box Selection', checked: selMode === 'box', action: function () { selectionMode('box'); } },
      { label: 'Lasso Selection', checked: selMode === 'lasso', action: function () { selectionMode('lasso'); } }
    ];
  }
  viewport.addEventListener('contextmenu', function (ev) {
    if (App.mode !== 'part' || drawingOn() || !UI.showMenu) return;
    var p = pos(ev);
    if (rDown && Math.hypot(p[0] - rDown[0], p[1] - rDown[1]) > 4) return;   // a right-drag panned the view
    if (ev.target.closest && ev.target.closest('#hud, #i3d-edit, #i3d-layer .i3d')) return;
    if (App.mesh && UI.pickFacesAll && UI.pickFacesAll(p[0], p[1]).length) return;   // on the model: Select Other (above)
    var items = selectionModeMenuItems();
    if (selection().length) items.push({ sep: true }, { label: 'Clear Selection', action: function () { setSelection([], { quiet: true }); } });
    UI.showMenu(ev.clientX, ev.clientY, items);
  });

  // ================================================================== exports
  function summarize(s) {
    var o = { kind: s.kind };
    if (s.index != null) o.index = s.index;
    if (s.id != null) o.id = s.id;
    if (s.ref != null) o.ref = s.ref;
    if (s.kind === 'edge') o.mid = s.edge.mid.map(function (x) { return +x.toFixed(4); });
    if (s.kind === 'vertex') o.point = s.point.map(function (x) { return +x.toFixed(4); });
    if (s.kind === 'body' && UI.bodyName) o.name = UI.bodyName(s.index);
    if (s.kind === 'feature') { var f = K.findFeature(App.model, s.id); if (f) o.name = f.name; }
    return o;
  }
  function handleSummary(h) {
    var o = { kind: h.kind, label: h.label, value: h.value };
    if (h.fid != null) o.feature = h.fid;
    if (h.sketch != null) o.sketch = h.sketch;
    if (h.dimIndex != null) o.dim = h.dimIndex;
    var p = S(h.pos(h.value));
    o.at = [+p[0].toFixed(2), +p[1].toFixed(2)];
    if (h.grab) o.grab = [+h.grab[0].toFixed(2), +h.grab[1].toFixed(2)];
    o.step = h.step();
    return o;
  }
  UI.BoxSelect = BoxSelect;
  UI.selection = selection; UI.setSelection = setSelection; UI.selKey = selKey; UI.entitySelected = entitySelected;
  UI.selectionFilter = selectionFilter; UI.selectionFilterAllows = allows; UI.toggleSelectionFilterBar = toggleBar;
  UI.selectionFilterBarShown = function () { return filter.bar; };
  UI.pickVertex = pickVertex; UI.pickFiltered = pick; UI.pickHover = pickHover; UI.selectClick = selectClick; UI.sketchSelectClick = sketchSelectClick;
  UI.sketchPickItem = sketchPickItem; UI.selectedSketchRefs = selectedSketchRefs; UI.sketchSelectionPM = sketchSelectionPM;   // rfF
  UI.boxSelectHook = boxSelectHook; UI.boxItems = boxItems; UI.applyBox = applyBox;
  UI.selectionMode = selectionMode; UI.applyLasso = applyLasso; UI.selectionModeMenuItems = selectionModeMenuItems; UI.selectHidden = selectHidden;   // rfFD
  UI.instant3DOn = function () { return i3d.on; }; UI.toggleInstant3D = setInstant3D;
  UI.instant3DHandles = function () { drawI3D(); return handleList.slice(); };
  UI.instant3DEdit = function (text) {   // type into the open value box and press Enter (tests / scripts)
    if (!i3d.edit) return Promise.resolve(false);
    editInput.value = String(text);
    return closeEdit(true);
  };
  UI.instant3DEditOpen = function () { return i3d.edit ? { kind: i3d.edit.h.kind, value: +editInput.value, label: i3d.edit.h.label } : null; };
  UI.instant3DDragging = function () { return !!i3d.drag; };
  UI.instant3DRulerPoint = rulerPoint;   // r5/select5: (handle, value, px) -> the screen point over the ruler that snaps to value
  // r4/features4: drag timings (main-thread ms of the last PropertyManager handle move, rests rebuilt and the last one's ms)
  UI.fmtModelValue = fmtV;   // r4/features4: the value format of on-model handles and callouts
  UI.instant3DStats = function () { return { pmMoveMs: i3d.lastPmMoveMs || 0, pauses: i3d.pauses || 0, pauseRebuildMs: i3d.lastPauseMs || 0 }; };

  if (window.anvil) {
    // selection: [{ kind, index | id, … }] of the current selection
    window.anvil.selection = function () { return selection().map(summarize); };
    // selectionFilter({ faces, edges, vertices, bodies, components, sketch, suspended, bar }) -> the filter state
    window.anvil.selectionFilter = function (opts) { return selectionFilter(opts); };
    // boxSelect([x0, y0], [x1, y1], { ctrl, shift }) in viewport pixels: left to right = window, right to left = crossing
    window.anvil.boxSelect = function (a, b, mods) { applyBox(BoxSelect.rect(a, b), mods); return selection().map(summarize); };
    // rfFD: lassoSelect([[x, y], ...], { ctrl, shift }) in viewport pixels: a closed loop, items wholly inside it
    window.anvil.lassoSelect = function (points, mods) { applyLasso(points || [], mods); return selection().map(summarize); };
    // selectionMode('box' | 'lasso'?) -> the mode a left-drag uses; selectHidden(on?) -> the Select hidden entities option
    window.anvil.selectionMode = function (mode) { return selectionMode(mode); };
    window.anvil.selectHidden = function (on) { return selectHidden(on); };
    window.anvil.clearSelection = function () { setSelection([], { quiet: true }); return []; };
    // instant3D(on?) -> { on, handles: [{ kind: 'depth' | 'angle' | 'sdim', label, value, at, grab, step }] }
    window.anvil.instant3D = function (on) { if (on != null) setInstant3D(on); return { on: i3d.on, handles: UI.instant3DHandles().map(handleSummary) }; };
  }
})(UI);
