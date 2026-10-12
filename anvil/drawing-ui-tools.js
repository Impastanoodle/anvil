// drawing-ui-tools.js — the drawing document's commands and tools (drawing-ui.js holds the state and the sheet):
// Standard 3 View, Model View and placing a view, the Projected / Section / Detail View tools, view and sheet
// properties, Model Items, the SVG / DXF / PDF exports and the view and sheet menus; assembly drawings (Auto Balloon,
// the Bill of Materials PropertyManager, the title block fields); the annotation tools and their PropertyManagers
// (Center Mark, Centerline, Hole Callout, Ordinate / Baseline / Chamfer Dimension, Balloon and Stacked Balloon, the
// Dimension and Hole Callout PropertyManagers, Document Properties), SolidWorks-like dimension handling: arrow flipping,
// in-place editing of a dimension or a title block field, dragging with alignment snapping. Loads after drawing-ui.js
// and shares its state through UI.drawingInternal; the FeatureManager (drawing-ui-panels.js) is reached through DW.
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.App || typeof document === 'undefined') return;
  var App = UI.App, $ = UI.$, el = UI.el;
  var DW = UI.drawingInternal, D = DW.D, doc = DW.doc, cctx = DW.cctx, syncBom = DW.syncBom, relayout = DW.relayout, units = DW.units, mesh = DW.mesh, paperK = DW.paperK, edit = DW.edit, editView = DW.editView;
  var isAsm = DW.isAsm, render = DW.render, settle = DW.settle, queueRender = DW.queueRender, svgEl = DW.svgEl, fitSheet = DW.fitSheet, pxToPaper = DW.pxToPaper, drawOverlay = DW.drawOverlay;
  var dimMatches = DW.dimMatches, viewAt = DW.viewAt, entityAt = DW.entityAt, segDist = DW.segDist;

  // ------------------------------------------------------------------ commands
  function cmdStandard3View() {
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return; }
    edit(function (dc) { syncBom(dc); Drawing.standard3View(dc, mesh(), units()); });
    D.sel = null; fitSheet();
    UI.setStatus('Standard 3 View: Front, Top and Right (' + (doc().sheet.projection === 'first' ? 'first' : 'third') + '-angle) plus an Isometric, scale ' + Drawing.scaleText(doc().sheet.scale) + '.');
  }
  var ORTHO_NAMES = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom'];
  function scaleOptions() { return [['sheet', 'Use sheet scale']].concat(Drawing.SCALES.map(function (s) { return [Drawing.scaleText(s), Drawing.scaleText(s)]; })); }
  function openDrawingPM(spec) {
    var onClose = spec.onClose;
    spec.onClose = function () { $('app').classList.remove('dw-pm'); closeInlineEdit(false); if (onClose) onClose(); if (D.active) { UI.setFmTab('tree'); render(); } };
    UI.openPM(spec);
    $('app').classList.add('dw-pm');
  }
  // Model View: choose an orientation, display style and scale, then click the sheet to place the view.
  // (a sheet-metal part offers Flat pattern first, as SolidWorks' Model View does, with how its bends are noted)
  var FLAT = 'Flat pattern', BEND_NOTE_OPTIONS = [['notes', 'Bend notes on the lines'], ['table', 'Bend Table (tags A, B, C)'], ['none', 'None']];
  function sheetMetal() { return !isAsm() && Drawing.isSheetMetal(App.model); }
  function cmdModelView(preset) {
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return; }
    var pre = typeof preset === 'string' ? preset : null, sm = sheetMetal(), flatFirst = pre === FLAT || (sm && pre == null);
    openDrawingPM({
      title: 'Model View', icon: 'modelView', command: 'modelView',
      message: 'Pick the orientation, press OK, then click on the sheet to place the view.' + (sm ? ' Flat pattern draws the unfolded blank with its bend lines and notes.' : ''),
      values: { orient: flatFirst && sm ? FLAT : 'Isometric', display: 'hlr', scale: 'sheet', bendNotes: Drawing.docOptions(doc()).bendNotes },
      groups: [
        { title: 'Orientation', fields: [{ type: 'select', key: 'orient', label: 'View', options: (sm ? [[FLAT, 'Flat pattern']] : []).concat(Drawing.ORIENTS) }] },
        { title: 'Display Style', show: function (v) { return v.orient !== FLAT; }, fields: [{ type: 'select', key: 'display', label: 'Style', options: [['hlv', 'Hidden Lines Visible'], ['hlr', 'Hidden Lines Removed']] }] },
        { title: 'Bend Notes', show: function (v) { return v.orient === FLAT; }, fields: [{ type: 'select', key: 'bendNotes', label: 'Bends', options: BEND_NOTE_OPTIONS }] },
        { title: 'Scale', fields: [{ type: 'select', key: 'scale', label: 'Scale', options: scaleOptions() }] }
      ],
      onOK: function (v) { startPlacing({ orient: v.orient, flat: v.orient === FLAT, bendNotes: v.bendNotes, display: v.display, scale: v.scale === 'sheet' ? null : Drawing.parseScale(v.scale) }); }
    });
  }
  // the flat pattern of the open part, worked out now (null and a message when it does not unfold)
  function flatReady() {
    var fd = sheetMetal() ? Drawing.flatData(mesh(), App.model, App.build) : { error: 'Flat pattern: the part is not sheet metal (it needs a Base Flange).' };
    if (fd && !fd.error) return fd;
    var msg = fd && fd.error ? (/^Flat pattern/.test(fd.error) ? fd.error : 'Flat pattern: ' + fd.error) : 'Flat pattern: nothing to unfold.';
    UI.toast(msg); UI.setStatus(msg);
    return null;
  }
  function startPlacing(spec) {
    var dc = doc(), s = Drawing.scaleValue(spec.scale || dc.sheet.scale), ext;
    if (spec.flat) { if (!flatReady()) return; ext = Drawing.flatExtents(mesh()); } else ext = Drawing.extentsOf(mesh(), spec.orient);
    D.tool = 'place';
    D.pending = { spec: spec, w: Math.max(ext.w * s, 1), h: Math.max(ext.h * s, 1), at: null };
    UI.setStatus('Model View (' + spec.orient + '): click on the sheet to place it. Esc cancels.');
    UI.refreshRibbon();
  }
  function placePending(p) {
    var spec = D.pending.spec;
    D.tool = null; D.pending = null;
    var v = editView(function (dc) {
      dc.layout = 'manual';
      if (spec.flat) return Drawing.addFlatView(dc, mesh(), { model: App.model, build: App.build, x: p[0], y: p[1], scale: spec.scale || null, bendNotes: spec.bendNotes });
      return Drawing.addView(dc, spec.orient, { display: spec.display || (ORTHO_NAMES.indexOf(spec.orient) >= 0 ? 'hlv' : 'hlr'), scale: spec.scale || null, x: p[0], y: p[1] });
    });
    D.sel = { kind: 'view', id: v.id };
    drawOverlay(); DW.renderTree(); UI.refreshRibbon();
    UI.setStatus(v.name + ' (' + v.orient + ') placed.' + (spec.flat ? ' Bend lines: UP solid, DOWN dashed; drag a bend note to move it.' : ''));
    return v;
  }
  // Insert ▸ Drawing View ▸ Flat Pattern: Model View with Flat pattern chosen
  function cmdFlatView() { if (!sheetMetal()) { flatReady(); return; } cmdModelView(FLAT); }
  // a flat view's bend notes: 'notes' | 'table' | 'none'; FLAT SIZE note on / off (view-level, over the Document
  // Properties); bendCols: the Bend Table's optional columns; showEtch: Show etch marks (the flat's Etch text and
  // ETCH-layer marks, thin green on layer ETCH; on unless set false)
  function setFlatViewProps(id, props) {
    edit(function (dc) {
      var v = Drawing.findView(dc, id);
      if (!v || v.kind !== 'flat') return;
      if (props.bendNotes !== undefined) { if (props.bendNotes) v.bendNotes = props.bendNotes; else delete v.bendNotes; }
      if (props.flatSize !== undefined) { if (props.flatSize == null) delete v.flatSize; else v.flatSize = !!props.flatSize; }
      if (props.showEtch !== undefined) { if (props.showEtch === false) v.showEtch = false; else delete v.showEtch; }
      if (props.bendCols !== undefined) setBendCols(v, props.bendCols);
    });
  }
  // a flat view's optional Bend Table columns: an array of 'bd' (BEND DED.), 'ba' (BEND ALLOW.), 'k' (K-FACTOR); null
  // goes back to the default (BEND DED. only)
  function setBendCols(v, cols) {
    if (cols == null) { delete v.bendCols; return; }
    v.bendCols = ['bd', 'ba', 'k'].filter(function (c) { return cols.indexOf(c) >= 0; });
  }
  function bendColsOf(v) { return Array.isArray(v.bendCols) ? v.bendCols : ['bd']; }
  // ------------------------------------------------------------------ Projected, Section and Detail View tools
  function startTool(tool, pending) { D.tool = tool; D.pending = pending; D.hover = null; drawOverlay(); UI.refreshRibbon(); }
  function endTool(msg) { D.tool = null; D.pending = null; D.hover = null; drawOverlay(); UI.refreshRibbon(); UI.setStatus(msg || 'Ready'); }
  function sheetView(id) { return D.sheet && D.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function parentAt(p) { var w = viewAt(p); return w && w.view.kind !== 'detail' && w.view.kind !== 'flat' ? w : null; }
  // Projected View: the parent is the selected view or the next one clicked; then the preview follows the pointer to
  // whichever side of the parent it is on (up / down / left / right), aligned with it, and a click places the view.
  function cmdProjectedView() {
    if (D.tool === 'project') { endTool(); return; }
    var w = D.sel && D.sel.kind === 'view' ? sheetView(D.sel.id) : null;
    startTool('project', { parent: w && w.view.kind !== 'detail' ? w.view.id : null, at: null });
    UI.setStatus(D.pending.parent != null ? 'Projected View from ' + w.view.name + ': move the pointer above, below, left or right of it and click to place. Esc cancels.' : 'Projected View: click the view to project from. Esc cancels.');
  }
  function projectPlacement(p) {
    var w = sheetView(D.pending.parent);
    if (!w) return null;
    var v = w.view, dx = p[0] - v.x, dy = p[1] - v.y;
    var dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'up' : 'down'), vert = dir === 'up' || dir === 'down';
    var F = Drawing.projectedFrame(w.frame, dir, doc().sheet.projection), ext = Drawing.extentsOf(mesh(), F);
    return { dir: dir, x: vert ? v.x : p[0], y: vert ? p[1] : v.y, w: ext.w * w.scale, h: ext.h * w.scale, name: F.name };
  }
  function projectClick(p) {
    if (D.pending.parent == null) {
      var w = parentAt(p);
      if (!w) { UI.setStatus('Projected View: click a model, projected or section view to project from.'); return; }
      D.pending.parent = w.view.id; D.sel = { kind: 'view', id: w.view.id }; D.pending.at = p;
      drawOverlay(); DW.renderTree();
      UI.setStatus('Projected View from ' + w.view.name + ': move the pointer to a side of it and click to place.');
      return;
    }
    var pl = projectPlacement(p), parent = D.pending.parent, v;
    if (!pl) { endTool(); return; }
    endTool();
    v = editView(function (dc) { return Drawing.addProjectedView(dc, mesh(), parent, pl.dir, { x: pl.x, y: pl.y }); });
    D.sel = { kind: 'view', id: v.id }; drawOverlay(); DW.renderTree();
    UI.setStatus(v.name + ' (' + v.orient + ') projected ' + pl.dir + ' from its parent, aligned with it.');
    return v;
  }
  // Section View: PropertyManager (cutting line Horizontal / Vertical, label), then click in a view to put the cutting
  // line there (it snaps to hole and boss centres within 8 px), then click on the side the section view goes.
  function cmdSectionView() {
    if (D.tool === 'section') { endTool(); return; }
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return; }
    openDrawingPM({
      title: 'Section View', icon: 'sectionView', command: 'sectionView',
      message: 'Pick the cutting line, press OK, click in a view to place it (it snaps to hole centres), then click on the side where the section view goes.',
      values: { axis: 'h', label: Drawing.nextLabel(doc()) },
      groups: [
        { title: 'Cutting Line', fields: [{ type: 'select', key: 'axis', label: 'Line', options: [['h', 'Horizontal'], ['v', 'Vertical']] }] },
        { title: 'Section View', fields: [{ type: 'text', key: 'label', label: 'Label' }] }
      ],
      onOK: function (val) {
        startTool('section', { axis: val.axis === 'v' ? 'v' : 'h', label: cleanLabel(val.label), parent: null, at: null });
        UI.setStatus('Section View: click in a view to place the ' + (val.axis === 'v' ? 'vertical' : 'horizontal') + ' cutting line. Esc cancels.');
      }
    });
  }
  function cleanLabel(t) { t = String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); return t || Drawing.nextLabel(doc()); }
  // the cutting line under the pointer: { w, at (model), a, b (paper) }, snapped to circle centres
  function sectionLineAt(p, w) {
    w = w || parentAt(p);
    if (!w) return null;
    var axis = D.pending.axis, mp = w.fromSheet(p), at = axis === 'h' ? mp[1] : mp[0], snap = pxToPaper(8), best = snap;
    w.proj.circles.visible.concat(w.proj.circles.hidden).forEach(function (c) {
      var cs = w.toSheet(c.c), d = axis === 'h' ? Math.abs(cs[1] - p[1]) : Math.abs(cs[0] - p[0]);
      if (d < best) { best = d; at = axis === 'h' ? c.c[1] : c.c[0]; }
    });
    var ext = 5 * paperK(), q = w.toSheet(axis === 'h' ? [0, at] : [at, 0]);
    return axis === 'h' ? { w: w, at: at, a: [w.box.x0 - ext, q[1]], b: [w.box.x1 + ext, q[1]] } : { w: w, at: at, a: [q[0], w.box.y0 - ext], b: [q[0], w.box.y1 + ext] };
  }
  // the pointer's side of the cutting line picks where the view goes; the viewer stands on that side in third angle
  function sectionPlacement(p) {
    var P = D.pending, w = sheetView(P.parent);
    if (!w) return null;
    var side = P.axis === 'h' ? (p[1] >= P.line.a[1] ? 1 : -1) : (p[0] >= P.line.a[0] ? 1 : -1);
    var sign = doc().sheet.projection === 'first' ? -side : side;
    var F = Drawing.sectionFrame(w.frame, P.axis, sign), ext = Drawing.extentsOf(mesh(), F);
    return { sign: sign, x: P.axis === 'h' ? w.view.x : p[0], y: P.axis === 'h' ? p[1] : w.view.y, w: ext.w * w.scale, h: ext.h * w.scale };
  }
  function sectionClick(p) {
    var P = D.pending;
    if (P.parent == null) {
      var sl = sectionLineAt(p);
      if (!sl) { UI.setStatus('Section View: click inside a model, projected or section view to place the cutting line.'); return; }
      P.parent = sl.w.view.id; P.at = p; P.cut = sl.at; P.line = sl;
      drawOverlay();
      UI.setStatus('Section View ' + P.label + '-' + P.label + ': click on the side of the cutting line where the view goes (the arrows point away from it).');
      return;
    }
    var pl = sectionPlacement(p), spec = { axis: P.axis, at: P.cut, sign: pl.sign, x: pl.x, y: pl.y, label: P.label }, parent = P.parent, v;
    endTool();
    v = editView(function (dc) { return Drawing.addSectionView(dc, mesh(), parent, spec); });
    D.sel = { kind: 'view', id: v.id }; drawOverlay(); DW.renderTree();
    UI.setStatus(v.name + ' placed, cut at ' + Drawing.fmtDim(spec.at, units()) + ' ' + units() + '.');
    return v;
  }
  // Detail View: click the centre of the detail circle in a view, click again to set its radius, then click where
  // the enlarged view goes (twice the parent's scale; change it in the view's properties).
  function cmdDetailView() {
    if (D.tool === 'detail') { endTool(); return; }
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return; }
    startTool('detail', { parent: null, at: null });
    UI.setStatus('Detail View: click the centre of the detail circle in a view. Esc cancels.');
  }
  function detailClick(p) {
    var P = D.pending;
    if (P.parent == null) {
      var w = parentAt(p);
      if (!w) { UI.setStatus('Detail View: click inside a model, projected or section view.'); return; }
      P.parent = w.view.id; P.c = w.fromSheet(p); P.cp = p;
      UI.setStatus('Detail View: click to set the radius of the detail circle.');
      return;
    }
    var w2 = sheetView(P.parent);
    if (P.r == null) {
      var r = Math.hypot(p[0] - P.cp[0], p[1] - P.cp[1]) / w2.scale;
      if (!(r > 0)) return;
      P.r = r; P.scale = Drawing.detailScale(w2.view.scale || doc().sheet.scale || [1, 1]);
      UI.setStatus('Detail View (' + Drawing.scaleText(P.scale) + '): click where the view goes.');
      return;
    }
    var spec = { c: P.c, r: P.r, scale: P.scale, x: p[0], y: p[1] }, parent = P.parent, v;
    endTool();
    v = editView(function (dc) { return Drawing.addDetailView(dc, mesh(), parent, spec); });
    D.sel = { kind: 'view', id: v.id }; drawOverlay(); DW.renderTree();
    UI.setStatus(v.name + ' placed.');
    return v;
  }
  function cmdViewProperties(id) {
    var v = Drawing.findView(doc(), id);
    if (!v) return;
    if (v.kind === 'flat') {
      var o = Drawing.docOptions(doc());
      openDrawingPM({
        title: v.name + ' (Flat pattern)', icon: 'flatView', command: 'viewProps',
        message: 'The unfolded blank of ' + (App.model.name || 'the part') + ': bend lines UP (solid) and DOWN (dashed); drag a bend note to move it, Delete hides it.',
        values: { bendNotes: v.bendNotes || o.bendNotes, flatSize: v.flatSize != null ? !!v.flatSize : o.flatSizeNote, scale: v.scale ? Drawing.scaleText(v.scale) : 'sheet', showAll: false,
          colBD: bendColsOf(v).indexOf('bd') >= 0, colBA: bendColsOf(v).indexOf('ba') >= 0, colK: bendColsOf(v).indexOf('k') >= 0, showEtch: v.showEtch !== false },
        groups: [
          { title: 'Bend Notes', fields: [{ type: 'select', key: 'bendNotes', label: 'Bends', options: BEND_NOTE_OPTIONS }, { type: 'check', key: 'showAll', label: 'Show hidden bend notes again' }] },
          // (SolidWorks' bend table template takes these columns besides TAG / DIRECTION / ANGLE / RADIUS)
          { title: 'Bend Table Columns', show: function (val) { return val.bendNotes === 'table'; }, fields: [{ type: 'check', key: 'colBD', label: 'Bend deduction (BEND DED.)' },
            { type: 'check', key: 'colBA', label: 'Bend allowance (BEND ALLOW.)' }, { type: 'check', key: 'colK', label: 'K-factor' }] },
          { title: 'Flat Pattern', fields: [{ type: 'check', key: 'flatSize', label: 'FLAT SIZE note' }, { type: 'check', key: 'showEtch', label: 'Show etch marks' }] },
          { title: 'Scale', fields: [{ type: 'select', key: 'scale', label: 'Scale', options: scaleOptions() }] }
        ],
        onOK: function (val) {
          edit(function (dc) {
            var w = Drawing.findView(dc, id);
            if (!w) return;
            w.bendNotes = val.bendNotes; w.flatSize = !!val.flatSize;
            if (val.showEtch === false) w.showEtch = false; else delete w.showEtch;
            setBendCols(w, [val.colBD && 'bd', val.colBA && 'ba', val.colK && 'k'].filter(Boolean));
            w.scale = val.scale === 'sheet' ? null : Drawing.parseScale(val.scale);
            if (val.showAll && w.flatAnn) Object.keys(w.flatAnn).forEach(function (k) { Drawing.flatAnnotation(dc, id, k, { hidden: false }); });
            dc.layout = 'manual';
          });
        }
      });
      return;
    }
    openDrawingPM({
      title: v.name, icon: 'drawingView', command: 'viewProps',
      values: { orient: v.orient, display: v.display, tangent: v.tangent || 'removed', scale: v.scale ? Drawing.scaleText(v.scale) : 'sheet' },
      // projected, section and detail views take their direction from the parent
      groups: (v.kind ? [] : [{ title: 'Orientation', fields: [{ type: 'select', key: 'orient', label: 'View', options: Drawing.ORIENTS }] }]).concat([
        { title: 'Display Style', fields: [{ type: 'select', key: 'display', label: 'Style', options: [['hlv', 'Hidden Lines Visible'], ['hlr', 'Hidden Lines Removed']] }].concat(v.kind === 'detail' ? [] : [
          { type: 'select', key: 'tangent', label: 'Tangent edges', options: [['visible', 'Tangent Edges Visible'], ['font', 'Tangent Edges With Font'], ['removed', 'Tangent Edges Removed']] }]) },
        { title: 'Scale', fields: [{ type: 'select', key: 'scale', label: 'Scale', options: v.kind === 'detail' ? scaleOptions().slice(1) : scaleOptions() }] }
      ]),
      onOK: function (val) {
        edit(function (dc) {
          var w = Drawing.findView(dc, id);
          if (!w) return;
          if (!w.kind && w.orient !== val.orient) {
            w.orient = val.orient; w.role = null; w.parent = null; w.align = null; w.dims = [];
            // projected views keep the frame they were made with: no longer aligned with the turned parent
            dc.views.forEach(function (c) { if (c.parent === w.id && c.kind === 'projected') { c.parent = null; c.align = null; } });
          }
          if (w.kind === 'detail' && val.scale !== 'sheet') w.name = 'Detail View ' + w.label + ' (' + val.scale + ')';
          w.display = val.display; w.scale = val.scale === 'sheet' ? null : Drawing.parseScale(val.scale);
          if (val.tangent === 'visible' || val.tangent === 'font') w.tangent = val.tangent; else if (val.tangent) delete w.tangent;
          if (w.role === 'iso') w.role = null;
          dc.layout = 'manual';
        });
      }
    });
  }
  function setViewDisplay(id, display) {
    edit(function (dc) { var v = Drawing.findView(dc, id); if (v) v.display = display; });
  }
  // Tangent Edges Visible / With Font / Removed (SolidWorks: view right-click ▸ Tangent Edge); 'removed' is the default
  function setViewTangent(id, mode) {
    edit(function (dc) { var v = Drawing.findView(dc, id); if (v) { if (mode === 'visible' || mode === 'font') v.tangent = mode; else delete v.tangent; } });
  }
  function deleteView(id) {
    edit(function (dc) { Drawing.deleteView(dc, id); });
    D.sel = null; render();
  }
  function deleteSelection() {
    var s = D.sel;
    if (!s) return false;
    if (s.kind === 'view') { deleteView(s.id); return true; }
    if (s.kind === 'bom') { setBom(null); D.sel = null; render(); return true; }
    if (s.kind === 'annot' && typeof s.id === 'string') {
      // a flat view's bend note / tag / Bend Table / FLAT SIZE note is generated from the part: Delete hides it
      // (view Properties ▸ Show hidden bend notes again brings it back)
      var fa = (D.sheet && D.sheet.annotations || []).filter(function (a) { return a.id === s.id; })[0];
      if (fa) edit(function (dc) { Drawing.flatAnnotation(dc, fa.view, fa.key, { hidden: true }); });
      D.sel = null; render(); return true;
    }
    if (s.kind === 'annot') { edit(function (dc) { Drawing.deleteAnnotation(dc, s.id); }); D.sel = null; render(); return true; }
    if (s.kind === 'note') { edit(function (dc) { Drawing.deleteNote(dc, s.id); }); D.sel = null; render(); return true; }
    if (s.kind === 'balloon') {
      edit(function (dc) {
        var v = Drawing.findView(dc, s.view);
        if (v && v.balloons && s.index != null) v.balloons.splice(s.index, 1);
        else if (v && v.balloons) v.balloons = v.balloons.filter(function (b) { return !(b.key === s.key && b.component === s.component); });
      });
      D.sel = null; render();
      return true;
    }
    if (s.kind === 'dim') {
      edit(function (dc) {
        if (s.key) { dc.suppressed = (dc.suppressed || []).concat([s.key]); return; }
        var v = Drawing.findView(dc, s.view);
        if (v && v.dims) v.dims.splice(s.index, 1);
      });
      D.sel = null; render();
      return true;
    }
    return false;
  }
  function addDimension(ent) {
    var dc = doc(), v = Drawing.findView(dc, ent.view);
    if (!v) return;
    var d;
    if (ent.circle) d = { kind: 'dia', c: ent.mc.c.slice(), r: ent.mc.r, count: 1, value: 2 * ent.mc.r };
    else if (ent.arc) d = { kind: 'rad', c: ent.ma.c.slice(), r: ent.ma.r, a0: ent.ma.a0, a1: ent.ma.a1, count: 1, value: ent.ma.r };
    else {
      var a = ent.la, b = ent.lb, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), w = D.sheet.views.filter(function (x) { return x.view.id === v.id; })[0];
      var cu = (w.proj.bounds.umin + w.proj.bounds.umax) / 2, cv = (w.proj.bounds.vmin + w.proj.bounds.vmax) / 2;
      if (Math.abs(dy) <= L * 1e-9) d = { kind: 'h', a: a.slice(), b: b.slice(), side: (a[1] + b[1]) / 2 >= cv ? 1 : -1, value: Math.abs(dx) };
      else if (Math.abs(dx) <= L * 1e-9) d = { kind: 'v', a: a.slice(), b: b.slice(), side: (a[0] + b[0]) / 2 >= cu ? 1 : -1, value: Math.abs(dy) };
      else d = { kind: 'aligned', a: a.slice(), b: b.slice(), value: L };
    }
    edit(function (dcc) { var vv = Drawing.findView(dcc, ent.view); vv.dims = (vv.dims || []).concat([d]); });
    UI.setStatus('Dimension ' + Drawing.dimText(d, units()) + ' added to ' + v.name + '.');
    return d;
  }
  function cmdSmartDimension() {
    D.tool = D.tool === 'dim' ? null : 'dim'; D.pending = null; D.hover = null;
    drawOverlay(); UI.refreshRibbon();
    UI.setStatus(D.tool === 'dim' ? 'Smart Dimension: click a visible edge (length) or circle (diameter) in an orthographic view. Esc ends.' : 'Ready');
  }
  function cmdModelItems() {
    edit(function (dc) { dc.autoDims = !dc.autoDims; if (dc.autoDims) dc.suppressed = []; });
    UI.refreshRibbon();
    UI.setStatus(doc().autoDims ? 'Model Items: overall sizes and diameters shown.' : 'Model Items hidden.');
  }
  function setSheet(props) {
    edit(function (dc) {
      if (props.format && Drawing.FORMATS[props.format]) dc.sheet.format = props.format;
      if (props.projection) dc.sheet.projection = props.projection === 'first' ? 'first' : 'third';
      if (props.scale === 'auto' || props.scale === null) dc.sheet.autoScale = true;
      else if (props.scale) { var sc = Array.isArray(props.scale) ? props.scale : Drawing.parseScale(props.scale); if (sc) { dc.sheet.scale = sc; dc.sheet.autoScale = false; } }
      if (props.name) dc.sheet.name = String(props.name);
      if (props.titleBlock) applyTitleBlock(dc, props.titleBlock);   // same undo step as the sheet change
      // re-place the standard views for the new sheet / scale / projection
      if (dc.views.some(function (v) { return v.role; })) { var manual = dc.layout === 'manual'; relayout(dc); if (manual) dc.layout = 'manual'; }
    });
    fitSheet();
  }
  function cmdSheetProperties() {
    var dc = doc(), s = dc.sheet;
    var fmt = el('select'), sc = el('select'), nm = el('input', { type: 'text', value: s.name }), proj = el('select');
    Object.keys(Drawing.FORMATS).forEach(function (f) { var o = el('option', { value: f, text: f + ' (' + Drawing.FORMATS[f].map(function (x) { return units() === 'in' ? (x / 25.4).toFixed(1) : Math.round(x); }).join(' \u00d7 ') + ' ' + units() + ')' }); if (f === s.format) o.selected = true; fmt.appendChild(o); });
    [['auto', 'Automatic (' + Drawing.scaleText(s.scale) + ')']].concat(Drawing.SCALES.map(function (x) { return [Drawing.scaleText(x), Drawing.scaleText(x)]; })).forEach(function (o) { var op = el('option', { value: o[0], text: o[1] }); if ((s.autoScale && o[0] === 'auto') || (!s.autoScale && o[0] === Drawing.scaleText(s.scale))) op.selected = true; sc.appendChild(op); });
    [['third', 'Third angle'], ['first', 'First angle']].forEach(function (o) { var op = el('option', { value: o[0], text: o[1] }); if (s.projection === o[0]) op.selected = true; proj.appendChild(op); });
    var body = el('div', { class: 'dw-props' }, [
      el('label', { text: 'Name' }), nm, el('label', { text: 'Sheet format / size' }), fmt,
      el('label', { text: 'Scale' }), sc, el('label', { text: 'Type of projection' }), proj
    ]);
    // title block: each field's text with its links ($PRPSHEET:"Material" reads the model's custom property)
    var own = dc.titleBlock || {}, shown = Drawing.titleBlock(dc, App.model, cctx()), tbInputs = {};
    body.appendChild(el('div', { class: 'dw-tb-head', text: 'Title block (links: $PRPSHEET:"property" from File \u25b8 Properties, $PRP:"SW-File Name" from the drawing)' }));
    Drawing.TB_FIELDS.forEach(function (f) {
      var inp = el('input', { type: 'text', value: own[f.key] != null ? own[f.key] : f.link, title: 'Shows: ' + (shown[f.key] || '(empty)'), 'data-tb': f.key });
      tbInputs[f.key] = inp;
      body.appendChild(el('label', { text: f.label })); body.appendChild(inp);
    });
    UI.showModal({ title: 'Sheet Properties', body: body, buttons: [
      { label: 'Apply Changes', primary: true, action: function () { UI.closeModal(); var tb = {}; Object.keys(tbInputs).forEach(function (k) { tb[k] = tbInputs[k].value; }); setSheet({ name: nm.value, format: fmt.value, scale: sc.value, projection: proj.value, titleBlock: tb }); } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  function safeName() { return (doc().name + '_' + (App.model.name || 'part')).replace(/[^\w\-]+/g, '_'); }
  // exportAs('dxf', { version }): the export dialog has a Version choice, R12 (AC1009) or R2000 (AC1015, true
  // ellipses and line weights; what AutoCAD 2000 and later, and the DWG converters, read natively); the choice is
  // remembered for the session (D.dxfVersion)
  function exportAs(kind, opts) {
    settle();
    if (!D.sheet) render();
    var sh = D.sheet;
    if (kind === 'svg') UI.exportDialog('Save Drawing as SVG', safeName() + '.svg', Drawing.toSVG(sh), 'image/svg+xml');
    else if (kind === 'dxf') {
      var ver = D.dxfVersion = opts && opts.version === 'R2000' ? 'R2000' : opts && opts.version ? 'R12' : D.dxfVersion || 'R12';
      UI.exportDialog('Save Drawing as DXF (one layer per view)', safeName() + '.dxf', Drawing.toDXF(sh, { version: ver }), 'application/dxf');
      var ta = document.querySelector('#modal textarea');
      if (ta) {
        var sel = el('select', { id: 'dw-dxf-version', title: 'DXF version' });
        [['R12', 'R12 (AC1009)'], ['R2000', 'R2000 (AC1015)']].forEach(function (x) { var op = el('option', { value: x[0], text: x[1] }); if (x[0] === ver) op.selected = true; sel.appendChild(op); });
        sel.onchange = function () { exportAs('dxf', { version: sel.value }); };
        ta.parentNode.insertBefore(el('p', {}, [el('label', { text: 'Version ' }), sel]), ta);
      }
    }
    else if (kind === 'pdf') UI.exportDialog('Save Drawing as PDF', safeName() + '.pdf', Drawing.toPDF(sh), 'application/pdf');
  }
  function viewMenu(v) {
    if (v.kind === 'flat') {
      var bn = v.bendNotes || Drawing.docOptions(doc()).bendNotes;
      return [
        { label: 'Properties…', action: function () { cmdViewProperties(v.id); } },
        { sep: true },
        { label: 'Bend Notes ▸ Notes on the Lines', checked: bn === 'notes', action: function () { setFlatViewProps(v.id, { bendNotes: 'notes' }); } },
        { label: 'Bend Notes ▸ Bend Table', checked: bn === 'table', action: function () { setFlatViewProps(v.id, { bendNotes: 'table' }); } },
        { label: 'Bend Notes ▸ None', checked: bn === 'none', action: function () { setFlatViewProps(v.id, { bendNotes: 'none' }); } },
        { label: 'FLAT SIZE Note', checked: v.flatSize != null ? !!v.flatSize : Drawing.docOptions(doc()).flatSizeNote, action: function () { setFlatViewProps(v.id, { flatSize: !(v.flatSize != null ? v.flatSize : Drawing.docOptions(doc()).flatSizeNote) }); } },
        { label: 'Show Etch Marks', checked: v.showEtch !== false, action: function () { setFlatViewProps(v.id, { showEtch: v.showEtch === false }); } },
        { sep: true },
        { label: 'Delete', key: 'Del', action: function () { deleteView(v.id); } }
      ];
    }
    return [
      { label: 'Properties\u2026', action: function () { cmdViewProperties(v.id); } },
      { sep: true },
      { label: 'Projected View', disabled: v.kind === 'detail', action: function () { D.sel = { kind: 'view', id: v.id }; cmdProjectedView(); } },
      { label: 'Auto Balloon', disabled: !isAsm() || v.kind === 'detail', action: function () { autoBalloonView(v.id); } },
      { sep: true },
      { label: 'Display \u25b8 Hidden Lines Visible', checked: v.display === 'hlv', action: function () { setViewDisplay(v.id, 'hlv'); } },
      { label: 'Display \u25b8 Hidden Lines Removed', checked: v.display === 'hlr', action: function () { setViewDisplay(v.id, 'hlr'); } },
      { sep: true },
      { label: 'Tangent Edge \u25b8 Tangent Edges Visible', disabled: v.kind === 'detail', checked: v.tangent === 'visible', action: function () { setViewTangent(v.id, 'visible'); } },
      { label: 'Tangent Edge \u25b8 Tangent Edges With Font', disabled: v.kind === 'detail', checked: v.tangent === 'font', action: function () { setViewTangent(v.id, 'font'); } },
      { label: 'Tangent Edge \u25b8 Tangent Edges Removed', disabled: v.kind === 'detail', checked: !v.tangent || v.tangent === 'removed', action: function () { setViewTangent(v.id, 'removed'); } },
      { sep: true },
      { label: 'Delete', key: 'Del', action: function () { deleteView(v.id); } }
    ];
  }
  function sheetMenu() {
    return [
      { label: 'Properties\u2026', action: cmdSheetProperties },
      { label: 'Standard 3 View', action: cmdStandard3View },
      { label: 'Model View\u2026', action: cmdModelView },
      { label: 'Model Items', checked: !!(doc() && doc().autoDims), action: cmdModelItems },
      { label: 'Document Properties\u2026', action: cmdDocProps },
      { sep: true },
      { label: 'Zoom to Fit', key: 'F', action: fitSheet }
    ];
  }


  // ------------------------------------------------------------------ assembly drawings: Auto Balloon, Bill of Materials
  function defaultBalloonView() {
    var dc = doc(), s = D.sel && D.sel.kind === 'view' ? Drawing.findView(dc, D.sel.id) : null;
    return s || dc.views.filter(function (v) { return v.role === 'iso'; })[0] || dc.views.filter(function (v) { return v.orient === 'Isometric'; })[0] || dc.views[0] || null;
  }
  function needAsm(what) {
    if (isAsm()) return true;
    UI.toast(what + ' numbers the components of an assembly: open the drawing of an assembly (File ▸ Make Drawing from Assembly).');
    return false;
  }
  function autoBalloonView(id, opts) {
    if (!needAsm('Auto Balloon')) return 0;
    edit(function (dc) { Drawing.autoBalloon(dc, App.model, id, opts); });
    var n = (D.sheet.balloons || []).filter(function (b) { return b.view === id; }).length, v = Drawing.findView(doc(), id);
    UI.setStatus('Auto Balloon: ' + n + ' balloon' + (n === 1 ? '' : 's') + ' on ' + (v ? v.name : 'the view') + ', numbered after the Bill of Materials.');
    return n;
  }
  // Auto Balloon PropertyManager: the view (default: the selected one, else the isometric) and Ignore multiple instances
  function cmdAutoBalloon() {
    if (!needAsm('Auto Balloon')) return;
    var dc = doc(), v0 = defaultBalloonView();
    if (!v0) { UI.toast('Add a drawing view first.'); return; }
    openDrawingPM({
      title: 'Auto Balloon', icon: 'autoBalloon', command: 'autoBalloon',
      message: 'Balloons every component in the view with its Bill of Materials item number, on a square around the view.',
      values: { view: v0.id, ignoreMultiple: true },
      groups: [
        { title: 'Drawing View', fields: [{ type: 'select', key: 'view', label: 'View', options: dc.views.map(function (v) { return [v.id, v.name + (v.kind ? '' : ' (' + v.orient + ')')]; }) }] },
        { title: 'Balloon Layout', fields: [{ type: 'static', label: 'Layout', value: 'Square' }, { type: 'check', key: 'ignoreMultiple', label: 'Ignore multiple instances' }] }
      ],
      onOK: function (val) { autoBalloonView(+val.view, { ignoreMultiple: !!val.ignoreMultiple }); }
    });
  }
  // Bill of Materials PropertyManager: Table Position (the corner of the sheet it is anchored to) or remove it
  var ANCHOR_NAMES = { 'top-right': 'Top Right', 'top-left': 'Top Left', 'bottom-right': 'Bottom Right (above the title block)', 'bottom-left': 'Bottom Left' };
  function setBom(props) {
    edit(function (dc) {
      if (props === null) { dc.bom = { show: false, anchor: (dc.bom && dc.bom.anchor) || 'top-right' }; return; }
      var b = dc.bom || { anchor: 'top-right' };
      b.show = true;
      if (props.anchor && ANCHOR_NAMES[props.anchor]) { b.anchor = props.anchor; delete b.x; delete b.y; }
      if (props.x != null && props.y != null) { b.x = +props.x; b.y = +props.y; }
      if (props.type) b.type = Drawing.bomType(props.type);
      if (props.columns !== undefined) { if (props.columns && props.columns.length) b.columns = JSON.parse(JSON.stringify(props.columns)); else delete b.columns; }
      dc.bom = b;
      syncBom(dc);
      if (dc.layout === 'auto') Drawing.layout(dc, mesh(), units());
    });
  }
  // Bill of Materials PropertyManager (part and assembly drawings): Table Position, BOM Type (Top-level only / Parts
  // only), Columns (show / hide each one) and Add Column (a column bound to a custom property: Material, Mass, Vendor…)
  function cmdBOM() {
    var b = doc().bom || { anchor: 'top-right' }, specs = Drawing.bomColumnSpecs(b);
    var values = { anchor: b.x != null ? 'moved' : b.anchor || 'top-right', type: Drawing.bomType(b.type), addProp: '', addTitle: '' };
    var colFields = specs.map(function (c, i) {
      values['col' + i] = !c.hidden;
      var t = c.title || (c.type === 'property' ? String(c.prop).toUpperCase() : { item: 'ITEM NO.', partNumber: 'PART NUMBER', description: 'DESCRIPTION', qty: 'QTY.' }[c.type]);
      return { type: 'check', key: 'col' + i, label: t + (c.type === 'property' ? '  (property "' + c.prop + '")' : '') };
    });
    var used = {}; specs.forEach(function (c) { if (c.type === 'property') used[String(c.prop).toLowerCase()] = 1; });
    var names = Drawing.bomPropertyNames(App.model).filter(function (n) { return !used[n.toLowerCase()]; });
    openDrawingPM({
      title: 'Bill of Materials', icon: 'bom', command: 'bom',
      message: (isAsm() ? 'One row per distinct part (identical components counted together)' : 'The part, or with Parts only each of its solid bodies') + '. Columns can show custom properties from File ▸ Properties (Material and Mass fall back to the part’s material and mass). Balloons use the item numbers.',
      values: values,
      groups: [
        { title: 'Table Position', fields: [{ type: 'select', key: 'anchor', label: 'Anchor', options: (b.x != null ? [['moved', 'Where it was dragged']] : []).concat(Drawing.BOM_ANCHORS.map(function (a) { return [a, ANCHOR_NAMES[a]]; })) }] },
        { title: 'BOM Type', fields: [{ type: 'select', key: 'type', label: 'Type', options: Drawing.BOM_TYPES }] },
        { title: 'Columns', fields: colFields },
        { title: 'Add Column', collapsed: false, fields: [
          { type: 'select', key: 'addProp', label: 'Property', options: [['', '(none)']].concat(names.map(function (n) { return [n, n]; })) },
          { type: 'text', key: 'addTitle', label: 'Title (optional)' }
        ] }
      ],
      onOK: function (val) {
        var cols = specs.map(function (c, i) { var o = JSON.parse(JSON.stringify(c)); if (val['col' + i]) delete o.hidden; else o.hidden = true; return o; });
        if (val.addProp) { var nc = { type: 'property', prop: val.addProp }; if (String(val.addTitle || '').trim()) nc.title = String(val.addTitle).trim(); cols.push(nc); }
        var props = { type: val.type, columns: cols };
        if (val.anchor !== 'moved') props.anchor = val.anchor;
        setBom(props);
        var n = D.sheet.bom ? D.sheet.bom.rows.length : 0;
        UI.setStatus('Bill of Materials (' + ({ parts: 'Parts only', indented: 'Indented' }[val.type] || 'Top-level only') + '): ' + n + ' item' + (n === 1 ? '' : 's') + ', ' + (doc().bom.x != null ? 'where it was dragged' : 'anchored ' + ANCHOR_NAMES[doc().bom.anchor]) + '.');
      }
    });
  }
  // setTitleBlock({ key: text | null }): a title block field's text (links included); null restores the default link
  function setTitleBlock(map) { edit(function (dc) { applyTitleBlock(dc, map); }); }
  function applyTitleBlock(dc, map) {
    var tb = dc.titleBlock || {};
    Object.keys(map || {}).forEach(function (k) {
      var f = Drawing.TB_FIELDS.filter(function (x) { return x.key === k; })[0];
      if (!f) return;
      if (map[k] == null || String(map[k]) === f.link) delete tb[k]; else tb[k] = String(map[k]);
    });
    if (Object.keys(tb).length) dc.titleBlock = tb; else delete dc.titleBlock;
  }
  function bomMenu() {
    return [
      { label: 'Properties…', action: cmdBOM },
      { label: 'Delete', key: 'Del', action: function () { setBom(null); D.sel = null; render(); } }
    ];
  }
  function bomAt(p) { var b = D.sheet && D.sheet.bom && D.sheet.bom.box; return b && p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1 ? D.sheet.bom : null; }
  function balloonAt(p) {
    var hit = null;
    (D.sheet && D.sheet.balloons || []).forEach(function (b) { if (Math.hypot(p[0] - b.c[0], p[1] - b.c[1]) <= b.r + pxToPaper(2)) hit = b; });
    return hit;
  }


  // ------------------------------------------------------------------ annotations: tools, PropertyManagers, dragging
  // Annotation ribbon tab (SolidWorks placement): Smart Dimension, Ordinate / Baseline / Chamfer Dimension, Model
  // Items, Balloon, Stacked Balloon, Auto Balloon, Hole Callout, Center Mark, Centerline. Every tool is picked from the
  // ribbon (or Insert ▸ Annotations), clicks go to the tool while it is active, Esc or the PropertyManager's ✓ / ✗ ends it.
  // Drag a dimension's text, a callout or a balloon to move it; double-click a dimension for the Dimension
  // PropertyManager (value, tolerance, precision, text, arrows: a model item's value drives the part) or a balloon for
  // the Balloon PropertyManager (quantity, stack direction).
  function sheetDim(ref) { return D.sheet && D.sheet.dims.filter(function (d) { return dimMatches(ref, d); })[0] || null; }
  function dimRef(d) { return { kind: 'dim', view: d.view, key: d.key || null, index: d.index, style: d.style || null }; }
  // where a dimension's properties live: a model item's in doc.dimProps[style], a Smart Dimension's on itself
  function dimTarget(dc, d) {
    if (d.auto) { dc.dimProps = dc.dimProps || {}; return dc.dimProps[d.style] || (dc.dimProps[d.style] = {}); }
    var v = Drawing.findView(dc, d.view);
    return v && v.dims ? v.dims[d.index] : null;
  }
  function cleanDimProps(dc) { if (dc.dimProps) Object.keys(dc.dimProps).forEach(function (k) { if (!Object.keys(dc.dimProps[k]).length) delete dc.dimProps[k]; }); }
  function setDimProps(d, props) {
    edit(function (dc) { var t = dimTarget(dc, d); if (t) Drawing.setDimProps(t, props); cleanDimProps(dc); });
  }
  function annotAt(p) {
    var t = pxToPaper(4), hit = null;
    (D.sheet && D.sheet.annotations || []).forEach(function (a) { var b = a.box; if (b && !a.hidden && p[0] >= b.x0 - t && p[0] <= b.x1 + t && p[1] >= b.y0 - t && p[1] <= b.y1 + t) hit = a; });
    return hit;
  }
  // the note under the paper point p (within 4 px of its text), or null
  function noteAt(p) {
    var t = pxToPaper(4), hit = null;
    (D.sheet && D.sheet.notes || []).forEach(function (n) { var b = n.box; if (b && p[0] >= b.x0 - t && p[0] <= b.x1 + t && p[1] >= b.y0 - t && p[1] <= b.y1 + t) hit = n; });
    return hit;
  }

  // ------------------------------------------------------------------ Note (Annotation ▸ Note)
  // Click on the sheet: a text box opens there; type the note (Enter starts a new line), ✓ or Ctrl+Enter places it,
  // clicking elsewhere places it too, Esc / ✗ drops it. The tool stays on for the next note until Esc. Double-click a
  // note to edit it in place (emptying it deletes it), drag it to move it, Delete removes it.
  function cmdNote() {
    startTool('note', {});
    UI.setStatus('Note: click on the sheet where the note goes, then type it (Enter: new line; Ctrl+Enter or ✓ places it). Esc ends.');
  }
  function noteClick(p) { openNoteEdit(null, p); }
  function openNoteEdit(note, p) {
    closeInlineEdit(false);
    var ta = el('textarea', { rows: '3', spellcheck: 'false', 'aria-label': 'Note text' });
    var ok = el('button', { class: 'dw-edit-btn ok', title: 'OK (Ctrl+Enter)', text: '✓' }), no = el('button', { class: 'dw-edit-btn', title: 'Cancel (Esc)', text: '✗' });
    var box = el('div', { id: 'dw-edit', class: 'note' }, [ta, el('div', { class: 'dw-edit-col' }, [ok, no])]);
    ta.value = note ? note.text : '';
    D.root.appendChild(box);
    D.inline = { box: box, inp: ta, note: { id: note ? note.id : null, p: note ? note.p.slice() : p.slice(), shown: note ? note.text : '' }, autoCommit: true };
    positionInlineEdit();
    ta.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); closeInlineEdit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); if (D.inline) D.inline.autoCommit = false; closeInlineEdit(false); }
    });
    [ok, no].forEach(function (b) { b.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); }); });
    ok.addEventListener('click', function () { closeInlineEdit(true); });
    no.addEventListener('click', function () { if (D.inline) D.inline.autoCommit = false; closeInlineEdit(false); });
    box.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    try { ta.focus({ preventScroll: true }); if (note) ta.select(); } catch (err) { }
    UI.setStatus(note ? 'Edit the note (an empty note is deleted); Ctrl+Enter or ✓ applies, Esc cancels.' : 'Type the note; Enter starts a new line, Ctrl+Enter or ✓ places it, Esc cancels.');
  }
  // where the note box goes: over the note's text, or centred on the click for a new one
  function noteRect(N) {
    var n = N.id != null && D.sheet ? (D.sheet.notes || []).filter(function (x) { return x.id === N.id; })[0] : null;
    return n ? n.box : { x0: N.p[0], x1: N.p[0], y0: N.p[1], y1: N.p[1] };
  }
  // places / changes the note an inline box was editing: one undo step
  function commitNote(I) {
    var txt = I.inp.value.replace(/\r/g, '').replace(/\s+$/, '');
    if (I.note.id == null) {
      if (!txt.trim()) return;
      var nt = null;
      edit(function (dc) { nt = Drawing.addNote(dc, { p: I.note.p, text: txt }); });
      D.sel = nt ? { kind: 'note', id: nt.id } : null;
      drawOverlay();
      UI.setStatus('Note placed' + (D.tool === 'note' ? ': click for the next one, Esc ends.' : '.'));
      return;
    }
    if (txt === I.note.shown) return;
    edit(function (dc) { Drawing.editNote(dc, I.note.id, { text: txt }); });
    if (!txt.trim()) D.sel = null;
    UI.setStatus(txt.trim() ? 'Note changed.' : 'Note deleted.');
  }
  // nearest visible edge or circle of any view (pictorial ones too) within 6 px, with the body it belongs to
  function edgeAt(p) {
    var tol = pxToPaper(6), best = null, bd = tol;
    D.sheet.views.forEach(function (w) {
      w.proj.lines.visible.forEach(function (l) {
        var a = w.toSheet([l[0], l[1]]), b = w.toSheet([l[2], l[3]]), d = segDist(p, a, b);
        if (d < bd) { bd = d; best = { view: w.view.id, w: w, body: l[4] || 0, at: w.fromSheet(p) }; }
      });
      w.proj.circles.visible.concat(w.proj.arcs ? w.proj.arcs.visible : []).forEach(function (c) {
        var cc = w.toSheet(c.c), d = Math.abs(Math.hypot(p[0] - cc[0], p[1] - cc[1]) - c.r * w.scale);
        if (d < bd) { bd = d; best = { view: w.view.id, w: w, body: c.body || 0, at: w.fromSheet(p) }; }
      });
      (w.proj.ellipses ? w.proj.ellipses.visible : []).forEach(function (el) {
        var n = 48, prev = null;
        for (var i = 0; i <= n; i++) {
          var t = el.t0 + (el.t1 - el.t0) * i / n, q = w.toSheet([el.c[0] + el.ax[0] * Math.cos(t) + el.ay[0] * Math.sin(t), el.c[1] + el.ax[1] * Math.cos(t) + el.ay[1] * Math.sin(t)]);
          if (prev) { var d = segDist(p, prev, q); if (d < bd) { bd = d; best = { view: w.view.id, w: w, body: el.body || 0, at: w.fromSheet(p) }; } }
          prev = q;
        }
      });
    });
    return best;
  }
  function entRef(ent) { return ent.circle ? { c: ent.mc.c.slice(), r: ent.mc.r } : ent.arc ? { c: ent.ma.c.slice(), r: ent.ma.r } : { a: ent.la.slice(), b: ent.lb.slice() }; }
  // the component (assembly) or body (part) under a clicked edge -> { key, component }
  function bodyItem(body) {
    if (isAsm()) { var c = App.model.components[body]; return c ? { component: c.id } : null; }
    return { key: 'part' };
  }
  function toolPM(spec, tool, pending) {
    var onClose = spec.onClose;
    spec.onClose = function () { if (D.tool === tool) { D.tool = null; D.pending = null; D.hover = null; UI.refreshRibbon(); } if (onClose) onClose(); };
    openDrawingPM(spec);
    D.tool = tool; D.pending = pending; D.hover = null;
    drawOverlay(); UI.refreshRibbon();
  }
  function endToolPM() { if (UI.hasPM && UI.hasPM()) UI.pmCancel(); else endTool(); }

  // Center Mark: Single (each circle clicked gets a mark), Linear or Circular (click the holes, then ✓)
  function cmdCenterMark() {
    if (D.tool === 'centermark') { endToolPM(); return; }
    var o = Drawing.docOptions(doc());
    toolPM({
      title: 'Center Mark', icon: 'centerMark', command: 'centerMark',
      message: 'Single: click a hole (circle) in a view to mark it. Linear / Circular: click the holes of the pattern, then ✓.',
      values: { style: 'single', ext: o.extLines, size: o.markSize },
      groups: [
        { title: 'Manual Insert Options', fields: [{ type: 'select', key: 'style', label: 'Style', options: [['single', 'Single Center Mark'], ['linear', 'Linear Center Mark'], ['circular', 'Circular Center Mark']] }] },
        { title: 'Display Attributes', fields: [{ type: 'check', key: 'ext', label: 'Extended lines' }, { type: 'number', key: 'size', label: 'Mark size', unit: 'mm', min: 0.5 }] }
      ],
      onChange: function (v) { if (D.pending) { D.pending.style = v.style; D.pending.ext = !!v.ext; D.pending.size = +v.size || o.markSize; } },
      onOK: function (v) {
        var P = D.pending;
        if (v.style !== 'single' && P && P.holes.length) {
          try { centerMarkFrom(P.view, v.style, P.holes, v); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return false; }
        }
      }
    }, 'centermark', { style: 'single', ext: o.extLines, size: o.markSize, view: null, holes: [] });
    UI.setStatus('Center Mark: click a hole in a view. Esc ends.');
  }
  function centerMarkFrom(viewId, style, holes, v) {
    var an;
    var probe = JSON.parse(JSON.stringify(doc()));
    Drawing.addCenterMark(probe, viewId, { style: style, holes: holes });   // refuses bad input before the undo step
    edit(function (dc) {
      var spec = { style: style, holes: holes };
      if (v && v.ext !== Drawing.docOptions(dc).extLines) spec.ext = !!v.ext;
      if (v && +v.size > 0 && +v.size !== Drawing.docOptions(dc).markSize) spec.size = +v.size;
      an = Drawing.addCenterMark(dc, viewId, spec);
    });
    UI.setStatus((style === 'single' ? 'Center mark' : style === 'linear' ? 'Linear center mark on ' + holes.length + ' holes' : 'Circular center mark on ' + holes.length + ' holes') + ' added.');
    return an;
  }
  function centerMarkClick(p) {
    var ent = entityAt(p), P = D.pending;
    if (!ent || !ent.circle) { UI.setStatus('Center Mark: click a circle (hole) of an orthographic view.'); return; }
    var h = { c: ent.mc.c.slice(), r: ent.mc.r };
    if (P.style === 'single') { centerMarkFrom(ent.view, 'single', [h], P); return; }
    if (P.view != null && P.view !== ent.view) { UI.setStatus('Center Mark: the holes of one mark must be in the same view.'); return; }
    P.view = ent.view;
    if (!P.holes.some(function (q) { return Math.hypot(q.c[0] - h.c[0], q.c[1] - h.c[1]) < 1e-9; })) P.holes.push(h);
    drawOverlay();
    UI.setStatus(P.holes.length + ' hole' + (P.holes.length === 1 ? '' : 's') + ' picked for the ' + P.style + ' center mark: pick more, then ✓.');
  }
  // Centerline: click near the axis of a cylinder seen from the side (or one of its silhouette edges), or two parallel
  // edges one after the other (the centreline runs midway between them)
  function cmdCenterline() {
    if (D.tool === 'centerline') { endTool(); return; }
    startTool('centerline', { first: null });
    UI.setStatus('Centerline: click a cylinder or hole seen from the side, or two parallel edges. Esc ends.');
  }
  function centerlineClick(p) {
    var w = viewAt(p);
    if (!w) { UI.setStatus('Centerline: click inside a view.'); return; }
    var m = w.section ? w.section.mesh : mesh(), best = null, bd = Infinity;
    if (w.ortho && m.faces.length) Drawing.cylAxes(m, w.frame).forEach(function (ax) {
      var a = w.toSheet(ax.a), b = w.toSheet(ax.b), d = segDist(p, a, b);
      if (d <= ax.r * w.scale + pxToPaper(6) && d < bd) { bd = d; best = ax; }
    });
    if (best) { addCenterlineUI(w.view.id, { a: best.a, b: best.b, r: best.r }); return; }
    var ent = entityAt(p);
    if (!ent || ent.circle || ent.arc) { UI.setStatus('Centerline: no cylinder axis there; click an edge to pair it with a parallel one.'); return; }
    var P = D.pending;
    if (!P.first || P.first.view !== ent.view) { P.first = ent; UI.setStatus('Centerline: now click the parallel edge.'); return; }
    var a = P.first.la, b = P.first.lb, c = ent.la, d2 = ent.lb, t = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(t[0], t[1]);
    t = [t[0] / L, t[1] / L];
    var u = [d2[0] - c[0], d2[1] - c[1]], Lu = Math.hypot(u[0], u[1]);
    if (Math.abs(t[0] * u[1] - t[1] * u[0]) > Lu * 1e-6) { P.first = ent; UI.setStatus('Centerline: the edges are not parallel; click the parallel edge.'); return; }
    var pc = function (q) { return (q[0] - a[0]) * t[0] + (q[1] - a[1]) * t[1]; }, off = t[0] * (c[1] - a[1]) - t[1] * (c[0] - a[0]);
    var s0 = Math.min(0, L, pc(c), pc(d2)), s1 = Math.max(0, L, pc(c), pc(d2)), n = [-t[1], t[0]];
    var mid = function (s) { return [a[0] + t[0] * s + n[0] * off / 2, a[1] + t[1] * s + n[1] * off / 2]; };
    P.first = null;
    addCenterlineUI(ent.view, { a: mid(s0), b: mid(s1) });
  }
  function addCenterlineUI(viewId, spec) {
    edit(function (dc) { Drawing.addCenterline(dc, viewId, spec); });
    UI.setStatus('Centerline added.');
  }
  // Hole Callout: click a hole; the callout reads the hole (diameter, THRU or depth, counterbore / countersink, 4X)
  function cmdHoleCallout() {
    if (D.tool === 'holecallout') { endTool(); return; }
    startTool('holecallout', {});
    UI.setStatus('Hole Callout: click the edge of a hole in a view. Esc ends.');
  }
  function holeCalloutClick(p) {
    var ent = entityAt(p);
    if (!ent || !ent.circle) { UI.setStatus('Hole Callout: click the edge of a hole (a circle) in an orthographic view.'); return; }
    var w = sheetView(ent.view);
    if (!Drawing.holeInfo(mesh(), w.frame, ent.mc.c, ent.mc.r)) { UI.setStatus('Hole Callout: that circle is not a hole.'); return; }
    var an;
    edit(function (dc) { an = Drawing.addHoleCallout(dc, ent.view, { c: ent.mc.c, r: ent.mc.r }); });
    var s = (D.sheet.annotations || []).filter(function (a) { return a.id === an.id; })[0];
    D.sel = { kind: 'annot', id: an.id }; drawOverlay();
    UI.setStatus('Hole Callout: ' + (s ? s.text : '') + ' — drag it to move it.');
  }
  // Ordinate / Baseline Dimension: pick the direction, click the base (an edge or a hole), then every feature to
  // dimension from it; ✓ ends. The first feature creates the dimension (one undo step), the next ones extend it.
  function cmdChainDim(kind) {
    var tool = kind === 'ordinate' ? 'ordinate' : 'baseline';
    if (D.tool === tool) { endToolPM(); return; }
    var name = kind === 'ordinate' ? 'Ordinate Dimension' : 'Baseline Dimension';
    toolPM({
      title: name, icon: kind === 'ordinate' ? 'ordinateDim' : 'baselineDim', command: tool,
      message: 'Click the base (an edge or hole) in an orthographic view, then each feature to dimension from it. ✓ ends.',
      values: { dir: 'h' },
      groups: [{ title: 'Direction', fields: [{ type: 'select', key: 'dir', label: 'Measure', options: [['h', 'Horizontal'], ['v', 'Vertical']] }] }],
      onChange: function (v) { if (D.pending && !D.pending.dim) D.pending.dir = v.dir === 'v' ? 'v' : 'h'; }
    }, tool, { kind: kind, dir: 'h', view: null, base: null, dim: null });
    UI.setStatus(name + ': click the base edge or hole. Esc ends.');
  }
  function chainDimClick(p) {
    var ent = entityAt(p), P = D.pending, name = P.kind === 'ordinate' ? 'Ordinate' : 'Baseline';
    if (!ent) { UI.setStatus(name + ': click an edge or hole of an orthographic view.'); return; }
    if (!P.base) { P.base = entRef(ent); P.view = ent.view; UI.setStatus(name + ': base picked; now click the features to dimension.'); return; }
    if (ent.view !== P.view) { UI.setStatus(name + ': stay in the view of the base.'); return; }
    var ref = entRef(ent);
    if (!P.dim) {
      var d;
      edit(function (dc) { d = (P.kind === 'ordinate' ? Drawing.addOrdinate : Drawing.addBaseline)(dc, P.view, { dir: P.dir, base: P.base, refs: [ref] }); });
      P.dim = { view: P.view, index: Drawing.findView(doc(), P.view).dims.length - 1 };
    } else {
      var v = Drawing.findView(doc(), P.dim.view), dd = v && v.dims[P.dim.index];
      if (dd) { dd.refs.push(Drawing.refFrom(ref)); UI.autosave(); render(); }
    }
    var sd = D.sheet.dims.filter(function (x) { return x.view === P.dim.view && x.index === P.dim.index; })[0];
    UI.setStatus(name + ' dimensions: ' + (sd ? sd.text : '') + ' — click more, ✓ ends.');
  }
  // Chamfer Dimension: click the chamfer edge, then the lead-in edge it makes the angle with ("1 X 45°")
  function cmdChamferDim() {
    if (D.tool === 'chamferdim') { endTool(); return; }
    startTool('chamferdim', { first: null });
    UI.setStatus('Chamfer Dimension: click the chamfer edge, then the lead-in edge. Esc ends.');
  }
  function chamferClick(p) {
    var ent = entityAt(p), P = D.pending;
    if (!ent || ent.circle || ent.arc) { UI.setStatus('Chamfer Dimension: click a straight edge of an orthographic view.'); return; }
    if (!P.first || P.first.view !== ent.view) { P.first = ent; UI.setStatus('Chamfer Dimension: now click the lead-in edge.'); return; }
    var spec = { a: P.first.la, b: P.first.lb, ref: { a: ent.la, b: ent.lb } }, viewId = ent.view, d;
    P.first = null;
    try { Drawing.addChamferDim(JSON.parse(JSON.stringify(doc())), viewId, spec); } catch (err) { UI.setStatus(err.message); UI.toast(err.message); return; }
    edit(function (dc) { d = Drawing.addChamferDim(dc, viewId, spec); });
    UI.setStatus('Chamfer dimension ' + Drawing.dimLabel(d, units()).text + ' added.');
  }
  // Balloon: click an edge of a component (or the part) in any view, then where the balloon goes. Stacked Balloon:
  // the same, then more edges add their items to the stack; ✓ ends.
  function cmdBalloon(stacked) {
    var tool = stacked ? 'stackballoon' : 'balloon';
    if (D.tool === tool) { endToolPM(); return; }
    var o = Drawing.docOptions(doc());
    toolPM({
      title: stacked ? 'Stacked Balloon' : 'Balloon', icon: stacked ? 'stackBalloon' : 'balloon', command: tool,
      message: stacked ? 'Click an edge of the first item, click where the stack goes, then click edges of the other items. ✓ ends.' : 'Click an edge of a ' + (isAsm() ? 'component' : 'part') + ' in a view, then click where the balloon goes.',
      values: { qty: o.balloonQty, qtyPos: 'right', stackDir: 'right' },
      groups: [
        { title: 'Quantity', fields: [{ type: 'check', key: 'qty', label: 'Show quantity (QTY)' }, { type: 'select', key: 'qtyPos', label: 'Placement', options: [['right', 'Right'], ['left', 'Left'], ['up', 'Top'], ['down', 'Bottom']] }] }
      ].concat(stacked ? [{ title: 'Stack', fields: [{ type: 'select', key: 'stackDir', label: 'Direction', options: [['right', 'Right'], ['left', 'Left'], ['up', 'Up'], ['down', 'Down']] }] }] : []),
      onChange: function (v) { if (D.pending) { D.pending.qty = !!v.qty; D.pending.qtyPos = v.qtyPos; D.pending.stackDir = v.stackDir; } }
    }, tool, { stacked: !!stacked, qty: o.balloonQty, qtyPos: 'right', stackDir: 'right', item: null, placed: null });
    UI.setStatus((stacked ? 'Stacked Balloon' : 'Balloon') + ': click an edge of a ' + (isAsm() ? 'component' : 'part') + '. Esc ends.');
  }
  function balloonClick(p) {
    var P = D.pending;
    if (P.placed) {
      // stacked: every further edge adds its item to the stack
      var e2 = edgeAt(p), it2 = e2 && bodyItem(e2.body);
      if (!it2) { UI.setStatus('Stacked Balloon: click an edge of another item, or ✓ to finish.'); return; }
      var v = Drawing.findView(doc(), P.placed.view), b = v && v.balloons[P.placed.index];
      if (!b) return;
      var key = it2.key || JSON.stringify((Assembly.findComponent(App.model, it2.component) || {}).source);
      if (key === b.key || (b.stack || []).some(function (s) { return s.key === key; })) { UI.setStatus('That item is already in the stack.'); return; }
      (b.stack || (b.stack = [])).push({ key: key, component: it2.component != null ? it2.component : null });
      UI.autosave(); render();
      UI.setStatus('Stacked Balloon: ' + (b.stack.length + 1) + ' items — click more, ✓ ends.');
      return;
    }
    if (!P.item) {
      var e = edgeAt(p), it = e && bodyItem(e.body);
      if (!it) { UI.setStatus('Balloon: click a visible edge of a ' + (isAsm() ? 'component' : 'part') + ' in a view.'); return; }
      P.item = it; P.view = e.view; P.attach = e.at; P.cp = p;
      UI.setStatus('Balloon: click where the balloon goes.');
      return;
    }
    var vw = Drawing.findView(doc(), P.view), spec = Object.assign({ attach: P.attach, pos: [p[0] - vw.x, p[1] - vw.y], qty: !!P.qty, qtyPos: P.qtyPos !== 'right' ? P.qtyPos : null }, P.item);
    if (P.stacked) spec.stackDir = P.stackDir;
    edit(function (dc) { Drawing.addBalloon(dc, App.model, P.view, spec); });
    var idx = Drawing.findView(doc(), P.view).balloons.length - 1, sb = (D.sheet.balloons || []).filter(function (x) { return x.view === P.view && x.index === idx; })[0];
    D.sel = { kind: 'balloon', view: P.view, index: idx, key: sb ? sb.key : null, component: sb ? sb.component : null };
    if (P.stacked) { P.placed = { view: P.view, index: idx }; UI.setStatus('Stacked Balloon placed: click edges of other items to stack them, ✓ ends.'); }
    else { P.item = null; P.placed = null; UI.setStatus('Balloon ' + (sb ? sb.item : '') + ' placed — click another edge for the next one, Esc ends.'); }
    drawOverlay();
  }
  // Balloon PropertyManager (double-click a balloon): quantity, its placement, stack direction
  function cmdBalloonProps(bl) {
    var v0 = Drawing.findView(doc(), bl.view), b0 = v0 && v0.balloons && v0.balloons[bl.index];
    if (!b0) return;
    openDrawingPM({
      title: 'Balloon', icon: 'balloon', command: 'balloonProps',
      message: 'Balloon ' + bl.item + (bl.stack && bl.stack.length ? ' (stacked with ' + bl.stack.map(function (s) { return s.item; }).join(', ') + ')' : '') + ': the number follows the Bill of Materials.',
      values: { qty: !!b0.qty, qtyPos: b0.qtyPos || 'right', stackDir: b0.stackDir || 'right' },
      groups: [
        { title: 'Quantity', fields: [{ type: 'check', key: 'qty', label: 'Show quantity (QTY)' }, { type: 'select', key: 'qtyPos', label: 'Placement', options: [['right', 'Right'], ['left', 'Left'], ['up', 'Top'], ['down', 'Bottom']] }] }
      ].concat(b0.stack && b0.stack.length ? [{ title: 'Stack', fields: [{ type: 'select', key: 'stackDir', label: 'Direction', options: [['right', 'Right'], ['left', 'Left'], ['up', 'Up'], ['down', 'Down']] }] }] : []),
      onOK: function (val) { setBalloonProps(bl.view, bl.index, val); }
    });
  }
  function setBalloonProps(viewId, index, props) {
    edit(function (dc) {
      var v = Drawing.findView(dc, viewId), b = v && v.balloons && v.balloons[index];
      if (!b) return;
      if ('qty' in props) { if (props.qty) b.qty = true; else delete b.qty; }
      if ('qtyPos' in props) { if (props.qtyPos && props.qtyPos !== 'right') b.qtyPos = props.qtyPos; else delete b.qtyPos; }
      if ('stackDir' in props) { if (props.stackDir && props.stackDir !== 'right') b.stackDir = props.stackDir; else delete b.stackDir; }
      if (props.pos) b.pos = [+props.pos[0], +props.pos[1]];
    });
  }
  // Dimension PropertyManager (double-click a dimension): Primary Value (a model item's value drives the part),
  // Tolerance/Precision (None, Bilateral, Limit, Symmetric; decimals), Dimension Text (<DIM> is the value), Leaders (flip)
  var PREC_OPTIONS = [['auto', 'Document default'], ['0', '1'], ['1', '.1'], ['2', '.12'], ['3', '.123'], ['4', '.1234']];
  function cmdDimensionPM(ref) {
    var d = sheetDim(ref);
    if (!d) return;
    var w = sheetView(d.view), src = d.auto && d.kind !== 'ordinate' && d.kind !== 'baseline' ? Drawing.dimSource(App.model, App.build, w, d) : null;
    var tol = d.tol || { type: 'none' }, u = units();
    var values = { value: d.value != null ? +d.value.toFixed(8) : 0, tolType: tol.type || 'none', plus: tol.plus != null ? tol.plus : 0, minus: tol.minus != null ? tol.minus : 0, prec: d.prec != null ? String(d.prec) : 'auto', label: d.label != null ? d.label : '<DIM>', flip: !!d.flip };
    var single = d.kind !== 'ordinate' && d.kind !== 'baseline';
    var primary = src ? [{ type: 'number', key: 'value', label: 'Value', unit: 'u' }, { type: 'static', label: 'Drives', value: src.featureName + ' (' + src.what + ')' + (src.expr ? ' — equation ' + src.expr : '') }]
      : [{ type: 'static', label: 'Value', value: single ? Drawing.numText(d.value, u) + ' ' + u + (d.auto ? ' (no model parameter found)' : ' (reference: driven by the model)') : d.text }];
    openDrawingPM({
      title: 'Dimension', icon: 'dim', command: 'dimension',
      message: src ? 'A model item: a new value changes ' + src.featureName + ' and rebuilds the part.' : d.auto ? 'A model item. Its text, tolerance and arrows can be edited here.' : 'A reference dimension: it follows the model; text, tolerance and arrows can be edited here.',
      values: values,
      groups: [
        { title: 'Primary Value', fields: primary },
        { title: 'Tolerance/Precision', fields: [
          { type: 'select', key: 'tolType', label: 'Tolerance', options: Drawing.TOL_TYPES, rerender: true },
          { type: 'number', key: 'plus', label: 'Maximum variation (+)', unit: 'u', show: function (v) { return v.tolType !== 'none'; } },
          { type: 'number', key: 'minus', label: 'Minimum variation (−)', unit: 'u', show: function (v) { return v.tolType === 'bilateral' || v.tolType === 'limit'; } },
          { type: 'select', key: 'prec', label: 'Unit precision', options: PREC_OPTIONS }
        ] },
        { title: 'Dimension Text', fields: [{ type: 'text', key: 'label', label: 'Text (<DIM> is the value)' }] },
        { title: 'Leaders', fields: [{ type: 'check', key: 'flip', label: 'Flip arrows (outside)' }] }
      ],
      onOK: function (v) { return applyDimensionPM(d, src, v); }
    });
  }
  function dimPropsFromPM(v) {
    var label = String(v.label == null ? '' : v.label);
    return { tol: v.tolType && v.tolType !== 'none' ? { type: v.tolType, plus: Math.abs(+v.plus || 0), minus: v.tolType === 'symmetric' ? Math.abs(+v.plus || 0) : Math.abs(+v.minus || 0) } : null,
      prec: v.prec === 'auto' || v.prec == null ? null : +v.prec, label: label.trim() === '' || label === '<DIM>' ? null : label, flip: !!v.flip };
  }
  function applyDimensionPM(d, src, v) {
    var props = dimPropsFromPM(v), val = +v.value;
    if (src && isFinite(val) && Math.abs(val - d.value) > 1e-9) {
      // drive the part: try it on a copy first, so a refused value leaves no undo step
      try { Drawing.driveDim(JSON.parse(JSON.stringify(App.model)), src, val); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return false; }
      UI.pushUndo();
      D.dirty = true;
      var t = dimTarget(doc(), d);
      if (t) Drawing.setDimProps(t, props);
      cleanDimProps(doc());
      Drawing.driveDim(App.model, src, val);
      UI.setStatus('Dimension ' + Drawing.numText(d.value, units()) + ' → ' + Drawing.numText(val, units()) + ': ' + src.featureName + ' ' + src.what + ' changed, rebuilding.');
      return UI.rebuild().then(function () { if (D.active) render(); });
    }
    setDimProps(d, props);
    var nd = sheetDim(dimRef(d));
    UI.setStatus('Dimension ' + (nd ? nd.text : '') + '.');
  }
  // Hole Callout PropertyManager (double-click a callout): the text (<HOLE> is the callout the hole reads) and precision
  function cmdCalloutProps(a) {
    var f = Drawing.findAnnotation(doc(), a.id);
    if (!f) return;
    openDrawingPM({
      title: 'Hole Callout', icon: 'holeCallout', command: 'holeCallout',
      message: 'Reads ' + a.text + '. Text: <HOLE> is the callout from the hole; a new line starts with \\n.',
      values: { text: f.annotation.text || '<HOLE>', prec: f.annotation.prec != null ? String(f.annotation.prec) : 'auto' },
      groups: [{ title: 'Dimension Text', fields: [{ type: 'text', key: 'text', label: 'Text' }, { type: 'select', key: 'prec', label: 'Unit precision', options: PREC_OPTIONS }] }],
      onOK: function (v) {
        edit(function (dc) {
          var g = Drawing.findAnnotation(dc, a.id);
          if (!g) return;
          var t = String(v.text || '').replace(/\\n/g, '\n');
          if (!t.trim() || t === '<HOLE>') delete g.annotation.text; else g.annotation.text = t;
          if (v.prec === 'auto') delete g.annotation.prec; else g.annotation.prec = +v.prec;
        });
      }
    });
  }
  // Tools ▸ Options ▸ Document Properties: Detailing (auto insert on view creation), centre marks, balloons
  function cmdDocProps() {
    var dc = doc(), o = Drawing.docOptions(dc);
    var cm = el('input', { type: 'checkbox' }), cl = el('input', { type: 'checkbox' }), ex = el('input', { type: 'checkbox' }), bq = el('input', { type: 'checkbox' });
    var sz = el('input', { type: 'number', step: '0.5', min: '0.5', value: String(o.markSize) });
    cm.checked = o.autoCenterMarks; cl.checked = o.autoCenterlines; ex.checked = o.extLines; bq.checked = o.balloonQty;
    cm.id = 'dw-opt-cm'; cl.id = 'dw-opt-cl'; ex.id = 'dw-opt-ext'; bq.id = 'dw-opt-qty'; sz.id = 'dw-opt-size';
    function chk(inp, text) { return el('label', { class: 'dw-opt' }, [inp, el('span', { text: text })]); }
    // (Phase 9) Units: decimal places and, in inches, fractions; Sheet Metal: the flat-pattern view's annotations
    var fd = el('input', { type: 'checkbox', id: 'dw-opt-flatdims' }), fs = el('input', { type: 'checkbox', id: 'dw-opt-flatsize' }), fr = el('input', { type: 'checkbox', id: 'dw-opt-frac' });
    var bn = el('select', { id: 'dw-opt-bend' }), pr = el('select', { id: 'dw-opt-prec' }), dn = el('select', { id: 'dw-opt-denom' }), inch = units() === 'in';
    fd.checked = o.flatDims; fs.checked = o.flatSizeNote; fr.checked = o.fractions;
    BEND_NOTE_OPTIONS.forEach(function (x) { var op = el('option', { value: x[0], text: x[1] }); if (x[0] === o.bendNotes) op.selected = true; bn.appendChild(op); });
    [['', 'Default (' + (inch ? '.123' : 'up to 0.12') + ')'], ['0', '0'], ['1', inch ? '.1' : '0.1'], ['2', inch ? '.12' : '0.12'], ['3', inch ? '.123' : '0.123'], ['4', inch ? '.1234' : '0.1234']].forEach(function (x) {
      var op = el('option', { value: x[0], text: x[1] }); if (String(o.dimPrec == null ? '' : o.dimPrec) === x[0]) op.selected = true; pr.appendChild(op);
    });
    [8, 16, 32, 64].forEach(function (d) { var op = el('option', { value: String(d), text: '1/' + d }); if (o.fracDenom === d) op.selected = true; dn.appendChild(op); });
    var body = el('div', { class: 'dw-props dw-docprops' }, [
      el('div', { class: 'dw-tb-head', text: 'Detailing ▸ Auto insert on view creation' }),
      chk(cm, 'Center marks-holes'), chk(cl, 'Centerlines'),
      el('div', { class: 'dw-tb-head', text: 'Centerlines/Center Marks' }),
      chk(ex, 'Extended lines'), el('label', { text: 'Mark size (mm)' }), sz,
      el('div', { class: 'dw-tb-head', text: 'Balloons' }),
      chk(bq, 'Show quantity (QTY) on new balloons'),
      el('div', { class: 'dw-tb-head', text: 'Units ▸ Dimensions (' + (inch ? 'inches, ANSI: .030' : 'millimetres') + ')' }),
      el('label', { text: 'Decimal places' }), pr
    ].concat(inch ? [chk(fr, 'Fractions'), el('label', { text: 'Finest fraction' }), dn] : []).concat([
      el('div', { class: 'dw-tb-head', text: 'Sheet Metal ▸ Flat-pattern views' }),
      chk(fd, 'Overall dimensions (blank width and height)'), chk(fs, 'FLAT SIZE note'),
      el('label', { text: 'Bend notes' }), bn
    ]));
    UI.showModal({ title: 'Document Properties - Detailing', body: body, buttons: [
      { label: 'OK', primary: true, id: 'dw-opt-ok', action: function () { UI.closeModal(); setDocOptions({ autoCenterMarks: cm.checked, autoCenterlines: cl.checked, extLines: ex.checked, markSize: +sz.value, balloonQty: bq.checked,
        flatDims: fd.checked, flatSizeNote: fs.checked, bendNotes: bn.value, dimPrec: pr.value === '' ? '' : +pr.value, fractions: inch ? fr.checked : o.fractions, fracDenom: +dn.value || 64 }); } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  function setDocOptions(props) {
    edit(function (dc) {
      var o = dc.options || (dc.options = {});
      Object.keys(props).forEach(function (k) {
        if (props[k] === '') { delete o[k]; return; }   // (back to the default: Decimal places ▸ Default)
        if (props[k] != null && !(k === 'markSize' && !(+props[k] > 0))) o[k] = props[k];
      });
    });
    return Drawing.docOptions(doc());
  }
  // the Document Properties of a drawing made in the app (SolidWorks' drawing template: centre marks on holes and
  // centrelines are inserted with every new view)
  function defaultDocOptions() { return { autoCenterMarks: true, autoCenterlines: true }; }
  // Auto insert for views made by the tools (Standard 3 View inserts inside the engine)
  function autoInsertViews(dc, ids) { Drawing.autoInsert(dc, mesh(), ids); }
  // dragging: a dimension's line / text, a callout's leader, a balloon
  function startDimDrag(dm, p) { D.drag = { kind: 'dim', ref: dimRef(dm), d: dm, start: p, moved: false }; }
  // ---- r4/drawings4: SolidWorks-like dimension handling
  // the arrow tip of the selected dimension under the cursor (5 px): that dimension, whose arrows can flip
  var FLIP_KINDS = { h: 1, v: 1, aligned: 1, dia: 1 };
  function arrowAt(p) {
    if (!D.sel || D.sel.kind !== 'dim') return null;
    var d = sheetDim(D.sel), t = pxToPaper(5);
    if (!d || !FLIP_KINDS[d.kind] || !d.arrows) return null;
    return d.arrows.some(function (a) { return Math.hypot(a[0] - p[0], a[1] - p[1]) <= t; }) ? d : null;
  }
  function flipArrows(d) {
    setDimProps(d, { flip: !d.flip });
    var nd = sheetDim(dimRef(d));
    UI.setStatus('Dimension ' + (nd ? nd.text : d.text) + ': arrows ' + (d.flip ? 'inside' : 'flipped outside') + ' (click an arrowhead again to flip them back).');
  }
  // In-place editing (double-click a dimension, as SolidWorks' Modify box): a box over the dimension text. A model
  // item that drives the part edits its value (Enter rebuilds the part); any other dimension edits its text, <DIM>
  // standing for the value. Esc or a click elsewhere cancels; the box follows the sheet's pan and zoom.
  function openInlineEdit(d) {
    closeInlineEdit(false);
    if (!d || !d.tbox || d.kind === 'ordinate' || d.kind === 'baseline') return;
    var w = sheetView(d.view), src = d.auto ? Drawing.dimSource(App.model, App.build, w, d) : null;
    var inp = el('input', { type: 'text', spellcheck: 'false', 'aria-label': src ? 'Dimension value' : 'Dimension text (<DIM> is the value)' });
    var ok = el('button', { class: 'dw-edit-btn ok', title: 'OK (Enter)', text: '✓' }), no = el('button', { class: 'dw-edit-btn', title: 'Cancel (Esc)', text: '✗' });
    var box = el('div', { id: 'dw-edit', class: src ? 'drives' : 'text' }, [inp, ok, no]);
    inp.value = src ? String(+(+d.value).toFixed(6)) : d.label != null ? String(d.label) : '<DIM>';
    D.root.appendChild(box);
    D.inline = { box: box, inp: inp, ref: dimRef(d), src: src };
    positionInlineEdit();
    inp.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); closeInlineEdit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closeInlineEdit(false); }
    });
    inp.addEventListener('blur', function () { setTimeout(function () { if (D.inline && D.inline.inp === inp && !box.contains(document.activeElement)) closeInlineEdit(false); }, 0); });
    [ok, no].forEach(function (b) { b.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); }); });
    ok.addEventListener('click', function () { closeInlineEdit(true); });
    no.addEventListener('click', function () { closeInlineEdit(false); });
    box.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    try { inp.focus({ preventScroll: true }); inp.select(); } catch (err) { }
    UI.setStatus(src ? 'Modify: a new value changes ' + src.featureName + ' (' + src.what + ') and rebuilds the part; Enter applies, Esc cancels.' : 'Dimension text: <DIM> is the value; Enter applies, Esc cancels.');
  }
  // the box over the dimension's text, in client pixels (the sheet may have been panned or zoomed since)
  function positionInlineEdit() {
    var I = D.inline, s = svgEl(), m = s && s.getScreenCTM();
    if (!I || !m || !D.sheet) return;
    var d = I.field || I.note ? null : sheetDim(I.ref), tb = I.field ? I.field.rect : I.note ? noteRect(I.note) : d && d.tbox;
    if (!tb) { closeInlineEdit(false); return; }
    var H = D.sheet.size[1], pt = s.createSVGPoint(), r = D.root.getBoundingClientRect();
    pt.x = (tb.x0 + tb.x1) / 2; pt.y = H - (tb.y0 + tb.y1) / 2;
    var q = pt.matrixTransform(m);
    I.box.style.left = (q.x - r.left) + 'px'; I.box.style.top = (q.y - r.top) + 'px';
  }
  // Double-click a title block field: its text is edited in place (SolidWorks title block fields). The box shows the
  // field's own text when it has one, else what its property link gives; an empty box puts the link back
  // (r5/drawings5)
  function openTitleEdit(tf) {
    closeInlineEdit(false);
    var dc = doc(), own = dc.titleBlock && dc.titleBlock[tf.field.key];
    var shown = own != null ? String(own) : Drawing.titleBlock(dc, App.model, { build: App.build || null, mesh: mesh() })[tf.field.key] || '';
    var inp = el('input', { type: 'text', spellcheck: 'false', 'aria-label': tf.field.label });
    var ok = el('button', { class: 'dw-edit-btn ok', title: 'OK (Enter)', text: '✓' }), no = el('button', { class: 'dw-edit-btn', title: 'Cancel (Esc)', text: '✗' });
    var box = el('div', { id: 'dw-edit', class: 'text tb' }, [inp, ok, no]);
    inp.value = shown;
    D.root.appendChild(box);
    D.inline = { box: box, inp: inp, field: { key: tf.field.key, rect: tf.rect, shown: shown } };
    positionInlineEdit();
    inp.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); closeInlineEdit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closeInlineEdit(false); }
    });
    inp.addEventListener('blur', function () { setTimeout(function () { if (D.inline && D.inline.inp === inp && !box.contains(document.activeElement)) closeInlineEdit(false); }, 0); });
    [ok, no].forEach(function (b) { b.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); }); });
    ok.addEventListener('click', function () { closeInlineEdit(true); });
    no.addEventListener('click', function () { closeInlineEdit(false); });
    box.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    try { inp.focus({ preventScroll: true }); inp.select(); } catch (err) { }
    UI.setStatus(tf.field.label + ': type the text ($PRP:"…" / $PRPSHEET:"…" link properties; empty restores the default); Enter applies, Esc cancels.');
  }
  function closeInlineEdit(commit) {
    var I = D.inline;
    if (!I) return;
    D.inline = null;
    if (I.box.parentNode) I.box.parentNode.removeChild(I.box);
    // a note is placed when the box is left by a click elsewhere too (as SolidWorks places a note), not after Esc / ✗
    if (I.note) { if (commit || I.autoCommit) commitNote(I); return; }
    if (!commit) return;
    if (I.field) {
      var tv = I.inp.value.trim(), fm = {};
      if (tv === I.field.shown.trim()) return;
      fm[I.field.key] = tv === '' ? null : tv;
      setTitleBlock(fm);
      UI.setStatus('Title block ' + I.field.key + ': ' + (tv === '' ? 'default' : tv) + '.');
      return;
    }
    var d = sheetDim(I.ref), txt = I.inp.value.trim();
    if (!d) return;
    if (I.src) {
      var v = UI.evalInput ? UI.evalInput(txt) : parseFloat(txt);
      if (v && typeof v === 'object') v = v.value;
      v = +v;
      if (!isFinite(v)) { UI.toast('Not a number: ' + txt); return; }
      if (Math.abs(v - d.value) < 1e-9) return;
      if (UI.hasPM && UI.hasPM()) UI.pmCancel();
      var tol = d.tol || { type: 'none' };
      applyDimensionPM(d, I.src, { value: v, tolType: tol.type || 'none', plus: tol.plus || 0, minus: tol.minus || 0, prec: d.prec != null ? String(d.prec) : 'auto', label: d.label != null ? d.label : '<DIM>', flip: !!d.flip });
      return;
    }
    var label = txt === '' || txt === '<DIM>' ? null : txt;
    if ((d.label == null ? null : String(d.label)) === label) return;
    if (UI.hasPM && UI.hasPM()) UI.pmCancel();
    setDimProps(d, { label: label });
    var nd = sheetDim(I.ref);
    UI.setStatus('Dimension text: ' + (nd ? nd.text : '') + '.');
  }
  // Dragging a dimension snaps it in line with the others (SolidWorks' alignment inference): a linear dimension's line
  // onto another's of the same direction, a radius / diameter shelf onto the height of another's, within 6 px; a dotted
  // guide shows the line it lines up with. -> the snapped props (D.snapGuide set, or null)
  function snapDim(d, w, props) {
    D.snapGuide = null;
    var tol = pxToPaper(6), best = null, bd = tol, me = dimRef(d);
    if ((d.kind === 'h' || d.kind === 'v') && props.at != null) {
      var ax = d.kind === 'h' ? 1 : 0, cur = w.toSheet(ax ? [0, props.at] : [props.at, 0])[ax];
      D.sheet.dims.forEach(function (o) {
        if (o.kind !== d.kind || o.lineAt == null || dimMatches(me, o) || !o.box) return;
        var ow = sheetView(o.view), oc = ow && ow.toSheet(ax ? [0, o.lineAt] : [o.lineAt, 0])[ax];
        if (oc != null && Math.abs(oc - cur) < bd) { bd = Math.abs(oc - cur); best = { o: o, at: oc }; }
      });
      if (!best) return props;
      props.at = w.fromSheet(ax ? [0, best.at] : [best.at, 0])[ax];
      var bx = d.box, ob = best.o.box, lo = Math.min(ax ? bx.x0 : bx.y0, ax ? ob.x0 : ob.y0), hi = Math.max(ax ? bx.x1 : bx.y1, ax ? ob.x1 : ob.y1);
      D.snapGuide = ax ? { a: [lo, best.at], b: [hi, best.at] } : { a: [best.at, lo], b: [best.at, hi] };
    } else if ((d.kind === 'dia' || d.kind === 'rad') && props.lead) {
      var c = w.toSheet(d.c), y = c[1] + props.lead[1];
      D.sheet.dims.forEach(function (o) {
        if ((o.kind !== 'dia' && o.kind !== 'rad') || !o.leadNow || dimMatches(me, o)) return;
        var ow = sheetView(o.view), oy = ow && ow.toSheet(o.c)[1] + o.leadNow[1];
        if (oy != null && Math.abs(oy - y) < bd) { bd = Math.abs(oy - y); best = { o: o, y: oy, x: ow.toSheet(o.c)[0] + o.leadNow[0] }; }
      });
      if (!best) return props;
      props.lead = [props.lead[0], best.y - c[1]];
      D.snapGuide = { a: [Math.min(c[0] + props.lead[0], best.x), best.y], b: [Math.max(c[0] + props.lead[0], best.x), best.y] };
    }
    return props;
  }
  function dragDim(p) {
    var dg = D.drag, d = dg.d, w = sheetView(d.view), dx = p[0] - dg.start[0], dy = p[1] - dg.start[1], props = {};
    if (!w) return;
    if (d.kind === 'h') { props.at = d.lineAt + dy / w.scale; props.tx = (d.txNow != null ? d.txNow : d.tx || 0) + dx; }
    else if (d.kind === 'v') { props.at = d.lineAt + dx / w.scale; props.tx = (d.txNow != null ? d.txNow : d.tx || 0) + dy; }
    else if (d.kind === 'aligned') {
      var a = w.toSheet(d.a), b = w.toSheet(d.b), t = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(t[0], t[1]) || 1; t = [t[0] / L, t[1] / L];
      var n0 = [-t[1], t[0]], ang = Math.atan2(t[1], t[0]) * 180 / Math.PI, tt = t;
      if (ang > 90 || ang <= -90) tt = [-t[0], -t[1]];
      props.off = (d.offNow || 0) + dx * n0[0] + dy * n0[1]; props.tx = (d.txNow != null ? d.txNow : d.tx || 0) + dx * tt[0] + dy * tt[1];
    } else if (d.kind === 'dia' || d.kind === 'rad' || d.kind === 'chamfer') props.lead = [d.leadNow[0] + dx, d.leadNow[1] + dy];
    else if (d.kind === 'ordinate' || d.kind === 'baseline') props.at = d.lineAt + (d.dir === 'v' ? dx : dy) / w.scale;
    if (Math.abs(props.tx || 0) < pxToPaper(4)) { if ('tx' in props) props.tx = null; }
    var hadGuide = !!D.snapGuide;
    if (!dg.noSnap) snapDim(d, w, props); else D.snapGuide = null;
    if (hadGuide || D.snapGuide) drawOverlay();
    var t2 = dimTarget(doc(), d);
    if (t2) Drawing.setDimProps(t2, props);
    queueRender(true);
  }
  // a balloon from the sheet list: its entry in the view's balloons (by position in the list)
  function balloonRef(b) { return { kind: 'balloon', view: b.view, index: b.index, key: b.key, component: b.component }; }

  DW.cmdNote = cmdNote; DW.noteClick = noteClick; DW.noteAt = noteAt; DW.openNoteEdit = openNoteEdit; DW.cmdFlatView = cmdFlatView; DW.setFlatViewProps = setFlatViewProps; DW.flatReady = flatReady; DW.sheetMetal = sheetMetal;
  DW.cmdStandard3View = cmdStandard3View; DW.cmdModelView = cmdModelView; DW.startPlacing = startPlacing; DW.placePending = placePending; DW.sheetView = sheetView;
  DW.cmdProjectedView = cmdProjectedView; DW.projectPlacement = projectPlacement; DW.projectClick = projectClick; DW.cmdSectionView = cmdSectionView; DW.sectionLineAt = sectionLineAt;
  DW.sectionPlacement = sectionPlacement; DW.sectionClick = sectionClick; DW.cmdDetailView = cmdDetailView; DW.detailClick = detailClick; DW.cmdViewProperties = cmdViewProperties;
  DW.setViewTangent = setViewTangent; DW.deleteView = deleteView; DW.deleteSelection = deleteSelection; DW.addDimension = addDimension; DW.cmdSmartDimension = cmdSmartDimension;
  DW.cmdModelItems = cmdModelItems; DW.setSheet = setSheet; DW.cmdSheetProperties = cmdSheetProperties; DW.exportAs = exportAs; DW.viewMenu = viewMenu; DW.sheetMenu = sheetMenu;
  DW.defaultBalloonView = defaultBalloonView; DW.autoBalloonView = autoBalloonView; DW.cmdAutoBalloon = cmdAutoBalloon; DW.setBom = setBom; DW.cmdBOM = cmdBOM; DW.setTitleBlock = setTitleBlock;
  DW.bomMenu = bomMenu; DW.bomAt = bomAt; DW.balloonAt = balloonAt; DW.dimRef = dimRef; DW.setDimProps = setDimProps; DW.annotAt = annotAt; DW.edgeAt = edgeAt;
  DW.cmdCenterMark = cmdCenterMark; DW.centerMarkClick = centerMarkClick; DW.cmdCenterline = cmdCenterline; DW.centerlineClick = centerlineClick; DW.cmdHoleCallout = cmdHoleCallout;
  DW.holeCalloutClick = holeCalloutClick; DW.cmdChainDim = cmdChainDim; DW.chainDimClick = chainDimClick; DW.cmdChamferDim = cmdChamferDim; DW.chamferClick = chamferClick;
  DW.cmdBalloon = cmdBalloon; DW.balloonClick = balloonClick; DW.cmdBalloonProps = cmdBalloonProps; DW.setBalloonProps = setBalloonProps; DW.cmdDimensionPM = cmdDimensionPM;
  DW.applyDimensionPM = applyDimensionPM; DW.cmdCalloutProps = cmdCalloutProps; DW.cmdDocProps = cmdDocProps; DW.setDocOptions = setDocOptions; DW.defaultDocOptions = defaultDocOptions;
  DW.autoInsertViews = autoInsertViews; DW.startDimDrag = startDimDrag; DW.FLIP_KINDS = FLIP_KINDS; DW.arrowAt = arrowAt; DW.flipArrows = flipArrows; DW.openInlineEdit = openInlineEdit;
  DW.positionInlineEdit = positionInlineEdit; DW.openTitleEdit = openTitleEdit; DW.closeInlineEdit = closeInlineEdit; DW.dragDim = dragDim; DW.balloonRef = balloonRef;
})();
