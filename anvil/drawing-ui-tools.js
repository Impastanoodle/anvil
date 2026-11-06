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
    // (rfDR) the views' hidden-line removal goes to the worker; Auto insert runs when they have landed
    editView(function (dc) { syncBom(dc); Drawing.standard3View(dc, mesh(), units(), { autoInsert: false }); return dc.views[0]; }, { insert: true });
    D.sel = null; fitSheet();
    UI.setStatus('Standard 3 View: Front, Top and Right (' + (doc().sheet.projection === 'first' ? 'first' : 'third') + '-angle) plus an Isometric, scale ' + Drawing.scaleText(doc().sheet.scale) + '.');
  }
  var ORTHO_NAMES = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom'];
  function scaleOptions() { return [['sheet', 'Use sheet scale']].concat((Drawing.scalesFor ? Drawing.scalesFor(units()) : Drawing.SCALES).map(function (s) { return [Drawing.scaleText(s), Drawing.scaleText(s)]; })); }
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
    // (rfW, SolidWorks' groups) Orientation: the standard-view buttons and the named views (Flat pattern first on sheet
    // metal); Options: Auto-start projected view (on: the Projected View tool follows from the placed view); Display
    // Style; Scale: Use sheet scale / Use custom scale; Dimension Type (Projected, or True: rfZ, a pictorial view's lengths read true 3D lengths)
    var std = (sm ? [FLAT] : []).concat(['Front', 'Top', 'Right', 'Back', 'Bottom', 'Left', 'Isometric']);
    var custom = scaleOptions().slice(1), sheetSc = Drawing.scaleText(doc().sheet.scale || [1, 1]);
    openDrawingPM({
      title: 'Model View', icon: 'modelView', command: 'modelView',
      message: 'Pick the orientation, press OK, then click on the sheet to place the view.' + (sm ? ' Flat pattern draws the unfolded blank with its bend lines and notes.' : ''),
      values: { orient: flatFirst && sm ? FLAT : 'Isometric', display: 'hlr', scaleMode: 'sheet', scale: custom.some(function (o) { return o[0] === sheetSc; }) ? sheetSc : custom[0][0], bendNotes: Drawing.docOptions(doc()).bendNotes, autoProj: true, dimType: 'true', showLabel: false },   // (rfDD2: True, SolidWorks' default for a pictorial view)
      groups: [
        { title: 'Orientation', fields: [
          { type: 'buttons', key: 'stdViews', buttons: std.map(function (o) { return { label: o === FLAT ? '(A) Flat pattern' : o, active: function (v) { return v.orient === o; }, onclick: function (v) { v.orient = o; if (o !== FLAT && ORTHO_NAMES.indexOf(o) < 0 && v.display === 'hlv') v.display = 'hlr'; UI.renderPM(); } }; }) },
          { type: 'select', key: 'orient', label: 'View', rerender: true, options: (sm ? [[FLAT, 'Flat pattern']] : []).concat(Drawing.ORIENTS) }] },
        // (rfCQ) Display label: a model view has no label unless asked (SolidWorks), then its name and scale
        { title: 'Options', fields: [{ type: 'check', key: 'autoProj', label: 'Auto-start projected view', show: function (v) { return v.orient !== FLAT; } }, { type: 'check', key: 'showLabel', label: 'Display label' }] },
        { title: 'Display Style', show: function (v) { return v.orient !== FLAT; }, fields: [{ type: 'radio', key: 'display', label: 'Style', options: [['hlv', 'Hidden Lines Visible'], ['hlr', 'Hidden Lines Removed']] }] },
        { title: 'Bend Notes', show: function (v) { return v.orient === FLAT; }, fields: [{ type: 'select', key: 'bendNotes', label: 'Bends', options: BEND_NOTE_OPTIONS }] },
        { title: 'Scale', fields: [{ type: 'radio', key: 'scaleMode', label: 'Scale', rerender: true, options: [['sheet', 'Use sheet scale (' + sheetSc + ')'], ['custom', 'Use custom scale']] },
          { type: 'select', key: 'scale', label: 'Scale', show: function (v) { return v.scaleMode === 'custom'; }, options: custom }] },
        // (rfDD2) a pictorial model view: True by default (SolidWorks); an orthographic one has no choice (rfW: group hidden)
        { title: 'Dimension Type', show: function (v) { return v.orient !== FLAT && ORTHO_NAMES.indexOf(v.orient) < 0; }, fields: [{ type: 'radio', key: 'dimType', label: 'Dimension type', options: [['projected', 'Projected'], ['true', 'True']],
          disabledOption: function (o, v) { return o === 'true' && ORTHO_NAMES.indexOf(v.orient) >= 0 ? 'An orthographic view shows true lengths.' : null; } }] }
      ],
      onOK: function (v) {
        // (the API's old values: scale 'sheet' or a scale text in `scale` alone)
        var sc = v.scaleMode === 'custom' ? v.scale : v.scaleMode === 'sheet' ? 'sheet' : v.scale;
        startPlacing({ orient: v.orient, flat: v.orient === FLAT, bendNotes: v.bendNotes, display: v.display, scale: !sc || sc === 'sheet' ? null : Drawing.parseScale(sc), autoProj: !!v.autoProj && v.orient !== FLAT,
          dimType: v.orient === FLAT || ORTHO_NAMES.indexOf(v.orient) >= 0 ? 'projected' : v.dimType === 'projected' ? 'projected' : 'true', showLabel: !!v.showLabel });
      }
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
      if (spec.flat) return Drawing.addFlatView(dc, mesh(), { model: App.model, build: App.build, x: p[0], y: p[1], scale: spec.scale || null, bendNotes: spec.bendNotes, showLabel: spec.showLabel ? true : null });
      var nv = Drawing.addView(dc, spec.orient, { display: spec.display || (ORTHO_NAMES.indexOf(spec.orient) >= 0 ? 'hlv' : 'hlr'), scale: spec.scale || null, x: p[0], y: p[1] });
      if (spec.dimType === 'true') nv.dimType = 'true'; else if (spec.dimType === 'projected') delete nv.dimType;   // (rfZ, rfDD2: no choice: addView's default, True when pictorial)
      if (spec.showLabel) Drawing.setViewLabel(dc, nv.id, true);   // (rfCQ)
      return nv;
    });
    D.sel = { kind: 'view', id: v.id };
    drawOverlay(); DW.renderTree(); UI.refreshRibbon();
    UI.setStatus(v.name + ' (' + v.orient + ') placed.' + (spec.flat ? ' Bend lines: UP solid, DOWN dashed; drag a bend note to move it.' : ''));
    // (rfW) Options ▸ Auto-start projected view: the Projected View tool goes on from the new view until Esc
    if (spec.autoProj && !spec.flat) {
      startTool('project', { parent: v.id, at: null, chain: true });
      UI.setStatus(v.name + ' placed. Projected View from it: move the pointer to a side and click to place; Esc ends.');
    }
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
    var chain = !!D.pending.chain;
    endTool();
    v = editView(function (dc) { return Drawing.addProjectedView(dc, mesh(), parent, pl.dir, { x: pl.x, y: pl.y }); });
    D.sel = { kind: 'view', id: v.id }; drawOverlay(); DW.renderTree();
    UI.setStatus(v.name + ' (' + v.orient + ') projected ' + pl.dir + ' from its parent, aligned with it.' + (chain ? ' Click for another projection, Esc ends.' : ''));
    if (chain) startTool('project', { parent: parent, at: null, chain: true });   // (rfW) Auto-start projected view goes on
    return v;
  }
  // (rfDN) Excluded components (SolidWorks' Section View of an assembly drawing, for pins and fasteners): a selection
  // list in the Section View PM and a section view's Properties PM; a click on a component's edge in any view adds it
  // (again: removes it). The ids go on the view as section.excluded; those components are drawn whole, unhatched.
  function compName(id) { var c = isAsm() ? (App.model.components || []).filter(function (x) { return String(x.id) === String(id); })[0] : null; return c ? c.name : String(id); }
  function excludedGroup() {
    return { title: 'Excluded components', show: function (v) { return isAsm() && (!v.type || v.type === 'full'); }, fields: [{ type: 'pick', key: 'excluded', icon: 'component', placeholder: 'Click components in a view',
      value: function (v) { return v.excluded && v.excluded.length ? v.excluded.length + ' component' + (v.excluded.length > 1 ? 's' : '') + ' not sectioned' : ''; },
      items: function (v) { return (v.excluded || []).map(function (id) { return { label: compName(id), icon: 'component', id: id }; }); },
      onRemove: function (v, i) { v.excluded.splice(i, 1); UI.renderPM(); },
      onClear: function (v) { v.excluded = []; UI.renderPM(); } }] };
  }
  // the component under sheet point p (an edge of it in any view), or null
  function componentAt(p) {
    var e = D.sheet ? edgeAt(p) : null, comps = App.model && App.model.components;
    return e && comps && comps[e.body] ? comps[e.body] : null;
  }
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || !D.active || D.tool || !D.host || !D.host.contains(e.target) || !isAsm() || !(UI.hasPM && UI.hasPM())) return;
    var sp = UI.pmSpec && UI.pmSpec();
    if (!sp || !sp.values || !Array.isArray(sp.values.excluded) || !(sp.command === 'sectionView' || sp.command === 'viewProps')) return;
    if (sp.values.type && sp.values.type !== 'full') return;
    var c = componentAt(DW.toPaper(e));
    if (!c) return;
    e.preventDefault(); e.stopPropagation();
    var list = sp.values.excluded, i = list.indexOf(String(c.id));
    if (i >= 0) list.splice(i, 1); else list.push(String(c.id));
    UI.renderPM();
    UI.setStatus('Excluded components: ' + (list.length ? list.map(compName).join(', ') : 'none') + '.');
  }, true);
  // Section View: PropertyManager (cutting line Horizontal / Vertical, label), then click in a view to put the cutting
  // line there (it snaps to hole and boss centres within 8 px), then click on the side the section view goes.
  function cmdSectionView() {
    if (D.tool === 'section') { endTool(); return; }
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return; }
    openDrawingPM({
      title: 'Section View', icon: 'sectionView', command: 'sectionView',
      message: 'Pick the cutting line, press OK, click in a view to place it (it snaps to hole centres), then click on the side where the section view goes. Half: the click is the centre where the line turns. Offset: click each leg (2 or 3), then the side. Aligned: click the centre, then a point on the second leg, then the side.',
      // (rfW) SolidWorks' groups: Section Line (type, orientation, half), Section View (label, Flip direction),
      // Scale (Use parent scale / Use custom scale)
      values: { axis: 'h', type: 'full', side: '1', label: Drawing.nextLabel(doc()), flip: false, scaleMode: 'parent', scale: scaleOptions()[1][0], partial: false, swm: false, showLabel: true, excluded: [] },
      groups: [
        { title: 'Section Line', fields: [{ type: 'select', key: 'type', label: 'Type', rerender: true, options: [['full', 'Full Section'], ['half', 'Half Section'], ['offset', 'Offset Section'], ['aligned', 'Aligned Section']] },
          { type: 'select', key: 'axis', label: 'Line', options: [['h', 'Horizontal'], ['v', 'Vertical']] },
          { type: 'select', key: 'side', label: 'Cut half', show: function (v) { return v.type === 'half'; }, options: [['1', 'Right / Top'], ['-1', 'Left / Bottom']] },
          // (rfZ) Partial section: the cutting line runs between two clicks instead of across the part; Scale with model
          // changes: the line keeps its place on the part when the part changes size
          { type: 'check', key: 'partial', label: 'Partial section', show: function (v) { return v.type === 'full'; } },
          { type: 'check', key: 'swm', label: 'Scale with model changes' }] },
        { title: 'Section View', fields: [{ type: 'text', key: 'label', label: 'Label' }, { type: 'check', key: 'flip', label: 'Flip direction' }, { type: 'check', key: 'showLabel', label: 'Display label' }] },
        excludedGroup(),
        { title: 'Scale', fields: [{ type: 'radio', key: 'scaleMode', label: 'Scale', rerender: true, options: [['parent', 'Use parent scale'], ['custom', 'Use custom scale']] },
          { type: 'select', key: 'scale', label: 'Scale', show: function (v) { return v.scaleMode === 'custom'; }, options: scaleOptions().slice(1) }] }
      ],
      onOK: function (val) {
        var ty = /^(half|offset|aligned)$/.test(val.type) ? val.type : 'full';
        startTool('section', { axis: val.axis === 'v' ? 'v' : 'h', type: ty, side: +val.side < 0 ? -1 : 1, label: cleanLabel(val.label), parent: null, at: null, pts: [],
          flip: !!val.flip, scale: val.scaleMode === 'custom' && val.scale ? Drawing.parseScale(val.scale) : null, partial: ty === 'full' && !!val.partial, swm: !!val.swm, showLabel: val.showLabel !== false,
          excluded: ty === 'full' && val.excluded && val.excluded.length ? val.excluded.slice() : null });
        if (ty === 'full' && val.partial) { UI.setStatus('Section View (partial): click one end of the ' + (val.axis === 'v' ? 'vertical' : 'horizontal') + ' cutting line in a view. Esc cancels.'); return; }
        UI.setStatus('Section View: click in a view to place the ' + (ty === 'half' ? 'centre of the half section' : ty === 'aligned' ? 'centre of the aligned section' : (val.axis === 'v' ? 'vertical' : 'horizontal') + ' cutting line') + '. Esc cancels.');
      }
    });
  }
  // (rfZ) a partial cutting line while it is clicked: from its first end to the second (or the pointer), sheet units
  function partialLine(P) {
    var w = sheetView(P.parent), ti = P.axis === 'h' ? 0 : 1;
    if (!w) return P.line;
    var to = P.to != null ? P.to : P.at ? w.fromSheet(P.at)[ti] : P.from;
    function pt(t) { return w.toSheet(P.axis === 'h' ? [t, P.cut] : [P.cut, t]); }
    return { a: pt(P.from), b: pt(to) };
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
    var sign = (doc().sheet.projection === 'first' ? -side : side) * (P.flip ? -1 : 1);   // (rfW) Flip direction
    var F = Drawing.sectionFrame(w.frame, P.axis, sign), ext = Drawing.extentsOf(mesh(), F);
    return { sign: sign, x: P.axis === 'h' ? w.view.x : p[0], y: P.axis === 'h' ? p[1] : w.view.y, w: ext.w * w.scale, h: ext.h * w.scale };
  }
  // (rfP) a point of the parent in model units, each coordinate snapped to a hole centre within 8 px
  function snapCentre(w, p) {
    var mp = w.fromSheet(p), snap = pxToPaper(8), bu = snap, bv = snap, out = mp.slice();
    w.proj.circles.visible.concat(w.proj.circles.hidden).forEach(function (c) {
      var cs = w.toSheet(c.c), du = Math.abs(cs[0] - p[0]), dv = Math.abs(cs[1] - p[1]);
      if (du < bu) { bu = du; out[0] = c.c[0]; }
      if (dv < bv) { bv = dv; out[1] = c.c[1]; }
    });
    return out;
  }
  function inBox(w, p) { return w && p[0] >= w.box.x0 && p[0] <= w.box.x1 && p[1] >= w.box.y0 && p[1] <= w.box.y1; }
  function sectionClick(p) {
    var P = D.pending, ty = P.type || 'full', ti = P.axis === 'h' ? 0 : 1;
    if (P.parent == null) {
      var sl = sectionLineAt(p);
      if (!sl) { UI.setStatus('Section View: click inside a model, projected or section view to place the cutting line.'); return; }
      P.parent = sl.w.view.id; P.at = p; P.cut = sl.at; P.line = sl;
      if (ty !== 'full') { var m0 = snapCentre(sl.w, p); m0[1 - ti] = sl.at; P.c = m0[ti]; P.pts = [m0]; }
      if (P.partial) { P.from = snapCentre(sl.w, p)[ti]; P.to = null; drawOverlay(); UI.setStatus('Section View ' + P.label + '-' + P.label + ' (partial): click the other end of the cutting line. Esc cancels.'); return; }
      drawOverlay();
      UI.setStatus('Section View ' + P.label + '-' + P.label + ': ' + (ty === 'aligned' ? 'click a point on the second leg (it is turned about the centre into the first).' :
        (ty === 'offset' ? 'click the next leg of the cutting line inside the view, or ' : '') + 'click on the side of the cutting line where the view goes (the arrows point away from it).'));
      return;
    }
    var w0 = sheetView(P.parent);
    if (P.partial && P.to == null) {
      if (!w0) { endTool(); return; }
      var to = snapCentre(w0, p)[ti];
      if (Math.abs(to - P.from) < 1e-9) { UI.setStatus('Section View: click the other end of the cutting line, away from the first.'); return; }
      P.to = to; drawOverlay();
      UI.setStatus('Section View ' + P.label + '-' + P.label + ' (partial): click on the side of the cutting line where the view goes.');
      return;
    }
    if (ty === 'aligned' && P.angle == null) {
      if (!w0) { endTool(); return; }
      var q = snapCentre(w0, p), C = P.axis === 'h' ? [P.c, P.cut] : [P.cut, P.c], dx = q[0] - C[0], dy = q[1] - C[1];
      if (Math.hypot(dx, dy) < 1e-9) { UI.setStatus('Section View: click a point away from the centre for the second leg.'); return; }
      P.angle = Math.atan2(dy, dx) * 180 / Math.PI; if (P.angle < 0) P.angle += 360;
      P.side = (P.axis === 'h' ? dx : dy) > 0 ? -1 : 1;
      UI.setStatus('Section View ' + P.label + '-' + P.label + ': click on the side of the first leg where the view goes.');
      return;
    }
    if (ty === 'offset' && inBox(w0, p) && P.pts.length < 3) {
      P.pts.push(snapCentre(w0, p));
      UI.setStatus('Section View ' + P.label + '-' + P.label + ': ' + P.pts.length + ' legs; ' + (P.pts.length < 3 ? 'click another leg, or ' : '') + 'click outside the view on the side where the section view goes.');
      return;
    }
    var pl = sectionPlacement(p), spec = { axis: P.axis, at: P.cut, sign: pl.sign, x: pl.x, y: pl.y, label: P.label }, parent = P.parent, v;
    if (P.partial && P.to != null) spec.partial = [P.from, P.to];   // (rfZ)
    if (P.swm) spec.scaleWithModel = true;
    if (P.showLabel === false) spec.showLabel = false;   // (rfCQ) Display label off
    if (P.excluded) spec.excluded = P.excluded;   // (rfDN) Excluded components
    if (ty === 'half') { spec.type = 'half'; spec.c = P.c; spec.side = P.side; }
    else if (ty === 'aligned') { spec.type = 'aligned'; spec.c = P.c; spec.side = P.side; spec.angle = P.angle; }
    else if (ty === 'offset' && P.pts.length > 1) {
      var ni = 1 - ti, pts = P.pts.slice().sort(function (a, b) { return a[ti] - b[ti]; });
      spec.type = 'offset'; spec.at = pts[0][ni];
      spec.jogs = pts.slice(1).map(function (q2, i) { return { t: (pts[i][ti] + q2[ti]) / 2, at: q2[ni] }; });
    }
    endTool();
    if (spec.type) { try { Drawing.addSectionView(JSON.parse(JSON.stringify(doc())), mesh(), parent, spec); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; } }
    var vsc = P.scale;
    v = editView(function (dc) { var nv = Drawing.addSectionView(dc, mesh(), parent, spec); if (vsc) { nv.scale = vsc.slice(); delete nv.section.parentScale; } return nv; });   // (rfCX: a custom scale stays)
    D.sel = { kind: 'view', id: v.id }; drawOverlay(); DW.renderTree();
    UI.setStatus(v.name + ' placed, cut at ' + Drawing.fmtDim(spec.at, units()) + ' ' + units() + '.');
    return v;
  }
  // Detail View: click the centre of the detail circle in a view, click again to set its radius, then click where
  // the enlarged view goes (twice the parent's scale; change it in the view's properties).
  function cmdDetailView() {
    if (D.tool === 'detail') { endToolPM(); return; }
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return; }
    var vals = { label: Drawing.nextLabel(doc()), shape: 'circle', style: 'standard', fullOutline: false, jagged: false, scaleMode: 'default', scale: scaleOptions()[1][0], showLabel: true };
    // (rfCQ) a closed sketch profile selected in a view (a circle, or lines / arcs / splines end to end, drawn with the
    // drawing's Sketch tab) is the detail's boundary, as in SolidWorks: the tool starts at "click where the view goes"
    var prof = selectedProfile();
    startTool('detail', { parent: null, at: null, pm: vals });
    if (prof) {
      var P0 = D.pending, w0 = sheetView(prof.view);
      P0.parent = prof.view; P0.loopIds = prof.ids;
      if (prof.circle) { P0.c = w0.fromSheet(prof.circle.c); P0.cp = prof.circle.c; P0.r = prof.circle.r / w0.scale; }
      else { P0.pts = prof.pts.map(w0.fromSheet); vals.shape = 'profile'; }
      P0.scale = Drawing.detailScale(w0.view.scale || doc().sheet.scale || [1, 1]);
    }
    // (rfW) its PropertyManager opens with the tool (SolidWorks): Detail Circle (style, label, Circle / Profile: rfZ, a
    // rectangle by two corner clicks), Detail View (rfZ: Full outline / Jagged outline) and Scale (twice the parent's,
    // or a custom one); the keyboard stays on the sheet
    openDrawingPM({
      title: 'Detail View', icon: 'detailView', command: 'detailView', noFocus: true, values: vals,
      message: prof ? 'The selected sketch profile is the detail boundary: click where the view goes. Esc cancels.' :
        'Click the centre of the detail circle in a view, click again for its radius, then click where the view goes (Profile: click two opposite corners of the rectangle, or sketch a closed profile in the view, select it, then Detail View). Esc cancels.',
      groups: [
        { title: 'Detail Circle', fields: [{ type: 'select', key: 'style', label: 'Style', options: DETAIL_STYLE_OPTIONS }, { type: 'text', key: 'label', label: 'Label' },
          { type: 'radio', key: 'shape', label: 'Shape', options: [['circle', 'Circle'], ['profile', 'Profile']] }] },
        { title: 'Detail View', fields: [{ type: 'check', key: 'fullOutline', label: 'Full outline' }, { type: 'check', key: 'jagged', label: 'Jagged outline', show: function (v) { return !v.fullOutline; } },
          { type: 'check', key: 'showLabel', label: 'Display label' }] },
        { title: 'Scale', fields: [{ type: 'radio', key: 'scaleMode', label: 'Scale', rerender: true, options: [['default', 'Twice the parent\'s scale'], ['custom', 'Use custom scale']] },
          { type: 'select', key: 'scale', label: 'Scale', show: function (v) { return v.scaleMode === 'custom'; }, options: scaleOptions().slice(1) }] }
      ],
      onOK: function () { if (D.tool === 'detail') endTool(); },
      onClose: function () { if (D.tool === 'detail' && D.pending && D.pending.pm === vals) endTool(); }
    });
    UI.setStatus(prof ? 'Detail View (' + Drawing.scaleText(D.pending.scale) + ') of the selected profile: click where the view goes. Esc cancels.' : 'Detail View: click the centre of the detail circle in a view. Esc cancels.');
  }
  // (rfCQ) the closed profile the selected sketch entities make in a view that can have a detail: { view, ids, circle,
  // pts (sheet) } or null (nothing suitable selected; a message says why when the selection is sketch entities)
  function selectedProfile() {
    var ids = D.sel && D.sel.kind === 'sk' ? (D.sel.ids || [D.sel.id]) : [];
    if (!ids.length || !D.sheet) return null;
    var L = null;
    try { L = Drawing.sketchLoop(doc(), ids); } catch (err) { UI.toast('Detail View: ' + err.message + '. A detail circle is used instead.'); return null; }
    var w = L.view != null ? sheetView(L.view) : null;
    if (!w || w.view.kind === 'detail' || w.view.kind === 'flat') { UI.toast('Detail View: sketch the profile in a model, projected or section view. A detail circle is used instead.'); return null; }
    return L;
  }
  var DETAIL_STYLE_OPTIONS = [['standard', 'Per Standard'], ['broken', 'Broken Circle'], ['leader', 'With Leader'], ['noleader', 'Without Leader'], ['connected', 'Connected']];
  function detailClick(p) {
    var P = D.pending;
    if (P.parent == null) {
      var w = parentAt(p);
      if (!w) { UI.setStatus('Detail View: click inside a model, projected or section view.'); return; }
      P.parent = w.view.id; P.c = w.fromSheet(p); P.cp = p;
      P.profile = !!(P.pm && P.pm.shape === 'profile');   // (rfZ) a rectangle profile: two opposite corners
      UI.setStatus(P.profile ? 'Detail View: click the opposite corner of the profile rectangle.' : 'Detail View: click to set the radius of the detail circle.');
      return;
    }
    var w2 = sheetView(P.parent);
    if (!P.pts && P.profile && !P.cp2) {
      var c2 = w2.fromSheet(p);
      if (Math.abs(c2[0] - P.c[0]) < 1e-9 || Math.abs(c2[1] - P.c[1]) < 1e-9) { UI.setStatus('Detail View: click the opposite corner, away from the first in both directions.'); return; }
      P.cp2 = p; P.c2 = c2; P.r = Math.hypot(c2[0] - P.c[0], c2[1] - P.c[1]) / 2;
      P.scale = P.pm && P.pm.scaleMode === 'custom' && P.pm.scale ? Drawing.parseScale(P.pm.scale) : Drawing.detailScale(w2.view.scale || doc().sheet.scale || [1, 1]);
      UI.setStatus('Detail View (' + Drawing.scaleText(P.scale) + '): click where the view goes.');
      return;
    }
    if (!P.pts && P.r == null) {
      var r = Math.hypot(p[0] - P.cp[0], p[1] - P.cp[1]) / w2.scale;
      if (!(r > 0)) return;
      P.r = r; P.scale = P.pm && P.pm.scaleMode === 'custom' && P.pm.scale ? Drawing.parseScale(P.pm.scale) : Drawing.detailScale(w2.view.scale || doc().sheet.scale || [1, 1]);
      UI.setStatus('Detail View (' + Drawing.scaleText(P.scale) + '): click where the view goes.');
      return;
    }
    var spec = P.pts ? { pts: P.pts, scale: P.scale, x: p[0], y: p[1] } : P.profile ? { shape: 'profile', a: P.c, b: P.c2, scale: P.scale, x: p[0], y: p[1] } : { c: P.c, r: P.r, scale: P.scale, x: p[0], y: p[1] }, parent = P.parent, v;
    if (P.pm && P.pm.label) spec.label = cleanLabel(P.pm.label);
    if (P.pm) { spec.style = P.pm.style || null; spec.outline = P.pm.fullOutline ? 'full' : P.pm.jagged ? 'jagged' : null; if (P.pm.showLabel === false) spec.showLabel = false; }
    if (P.pm && P.pm.scaleMode === 'custom' && P.pm.scale) spec.scale = Drawing.parseScale(P.pm.scale);
    endTool();
    if (P.pm && UI.pmSpec && UI.pmSpec() && UI.pmSpec().values === P.pm) UI.pmCancel();
    // (rfCQ) a sketched profile becomes the detail's own boundary: its sketch entities go (one undo step)
    var loopIds = P.loopIds || null;
    v = editView(function (dc) { if (loopIds) loopIds.forEach(function (id) { try { Drawing.deleteSketchEntity(dc, id); } catch (e) { } }); return Drawing.addDetailView(dc, mesh(), parent, spec); });
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
          colBD: bendColsOf(v).indexOf('bd') >= 0, colBA: bendColsOf(v).indexOf('ba') >= 0, colK: bendColsOf(v).indexOf('k') >= 0, showEtch: v.showEtch !== false, showLabel: Drawing.viewLabelShown(v) },
        groups: [
          { title: 'Bend Notes', fields: [{ type: 'select', key: 'bendNotes', label: 'Bends', options: BEND_NOTE_OPTIONS }, { type: 'check', key: 'showAll', label: 'Show hidden bend notes again' }] },
          // (SolidWorks' bend table template takes these columns besides TAG / DIRECTION / ANGLE / RADIUS)
          { title: 'Bend Table Columns', show: function (val) { return val.bendNotes === 'table'; }, fields: [{ type: 'check', key: 'colBD', label: 'Bend deduction (BEND DED.)' },
            { type: 'check', key: 'colBA', label: 'Bend allowance (BEND ALLOW.)' }, { type: 'check', key: 'colK', label: 'K-factor' }] },
          { title: 'Flat Pattern', fields: [{ type: 'check', key: 'flatSize', label: 'FLAT SIZE note' }, { type: 'check', key: 'showEtch', label: 'Show etch marks' }, { type: 'check', key: 'showLabel', label: 'Display label' }] },
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
            Drawing.setViewLabel(dc, id, !!val.showLabel);   // (rfCQ)
            dc.layout = 'manual';
          });
        }
      });
      return;
    }
    openDrawingPM({
      title: v.name, icon: 'drawingView', command: 'viewProps',
      values: { orient: v.orient, display: v.display, tangent: v.tangent || 'removed', scale: v.section && v.section.parentScale ? 'parent' : v.scale ? Drawing.scaleText(v.scale) : 'sheet', dimType: v.dimType === 'true' ? 'true' : 'projected',
        swm: !!(v.section && v.section.scaleWithModel), partial: !!(v.section && v.section.partial), dstyle: (v.detail && v.detail.style) || 'standard', outline: (v.detail && v.detail.outline) || 'none',
        showLabel: Drawing.viewLabelShown(v), excluded: v.kind === 'section' && v.section && (!v.section.type || v.section.type === 'full') ? (v.section.excluded || []).slice() : undefined },
      // projected, section and detail views take their direction from the parent
      groups: (v.kind ? [] : [{ title: 'Orientation', fields: [{ type: 'select', key: 'orient', label: 'View', rerender: true, options: Drawing.ORIENTS }] }]).concat([
        { title: 'Display Style', fields: [{ type: 'select', key: 'display', label: 'Style', options: [['hlv', 'Hidden Lines Visible'], ['hlr', 'Hidden Lines Removed']] }].concat(v.kind === 'detail' ? [] : [
          { type: 'select', key: 'tangent', label: 'Tangent edges', options: [['visible', 'Tangent Edges Visible'], ['font', 'Tangent Edges With Font'], ['removed', 'Tangent Edges Removed']] }]) },
        { title: 'Scale', fields: [{ type: 'select', key: 'scale', label: 'Scale', options: v.kind === 'detail' ? scaleOptions().slice(1) : v.kind === 'section' ? [['parent', 'Use parent scale']].concat(scaleOptions()) : scaleOptions() }] }
      ]).concat(
        // (rfZ) a pictorial model view's Dimension Type; a section's Partial section (off only: a new line is clicked) and
        // Scale with model changes; a detail's circle style and outline
        // (rfDD2) a pictorial model view or an auxiliary view; True greyed when the orientation is changed to an orthographic one
        (!v.kind && ORTHO_NAMES.indexOf(v.orient) < 0) || v.kind === 'aux' ? [{ title: 'Dimension Type', fields: [{ type: 'radio', key: 'dimType', label: 'Dimension type', options: [['projected', 'Projected'], ['true', 'True']],
          disabledOption: function (o, val) { return o === 'true' && ORTHO_NAMES.indexOf(v.kind ? v.orient : val.orient) >= 0 ? 'An orthographic view shows true lengths.' : null; } }] }] : [],
        v.kind === 'section' ? [{ title: 'Section Line', fields: (v.section && v.section.partial && !v.section.removed ? [{ type: 'check', key: 'partial', label: 'Partial section' }] : []).concat([{ type: 'check', key: 'swm', label: 'Scale with model changes' }]) }] : [],
        v.kind === 'section' && v.section && (!v.section.type || v.section.type === 'full') && isAsm() ? [excludedGroup()] : [],   // (rfDN)
        v.kind === 'detail' ? [{ title: 'Detail Circle', fields: [{ type: 'select', key: 'dstyle', label: 'Circle style', options: DETAIL_STYLE_OPTIONS }, { type: 'select', key: 'outline', label: 'Outline', options: [['none', 'None'], ['full', 'Full outline'], ['jagged', 'Jagged outline']] }] }] : [],
        // (rfCQ) the view label: off by default on model and projected views, on for section, detail and auxiliary views
        [{ title: 'Label', fields: [{ type: 'check', key: 'showLabel', label: 'Display label' }] }]),
      onOK: function (val) {
        edit(function (dc) {
          var w = Drawing.findView(dc, id);
          if (!w) return;
          if (!w.kind && w.orient !== val.orient) {
            w.orient = val.orient; w.role = null; w.parent = null; w.align = null; w.dims = [];
            // projected views keep the frame they were made with: no longer aligned with the turned parent
            dc.views.forEach(function (c) { if (c.parent === w.id && c.kind === 'projected') { c.parent = null; c.align = null; } });
          }
          if (w.kind === 'detail' && val.scale !== 'sheet' && Drawing.parseScale(val.scale)) w.name = Drawing.detailName(w.label, Drawing.parseScale(val.scale));
          w.display = val.display; w.scale = val.scale === 'sheet' || val.scale === 'parent' ? null : Drawing.parseScale(val.scale);
          if (w.kind === 'section' && w.section) {   // (rfCX) Use parent scale: follows the parent
            var wp = val.scale === 'parent' ? Drawing.findView(dc, w.parent) : null;
            if (val.scale === 'parent') { w.section.parentScale = true; w.scale = wp && wp.scale ? wp.scale.slice() : null; } else delete w.section.parentScale;
          }
          if (val.tangent === 'visible' || val.tangent === 'font') w.tangent = val.tangent; else if (val.tangent) delete w.tangent;
          if (w.role === 'iso') w.role = null;
          if (!w.kind || w.kind === 'aux') { if (val.dimType === 'true' && ORTHO_NAMES.indexOf(w.orient) < 0) w.dimType = 'true'; else delete w.dimType; }
          if (w.kind === 'section' && w.section) Drawing.setSectionOptions(dc, mesh(), w.id, { partial: w.section.partial && !val.partial ? null : undefined, scaleWithModel: !!val.swm });
          if (w.kind === 'section' && w.section && Array.isArray(val.excluded)) Drawing.setSectionExcluded(dc, w.id, val.excluded);   // (rfDN)
          if (w.kind === 'detail' && w.detail) Drawing.setDetailOptions(dc, w.id, { style: val.dstyle, outline: val.outline });
          Drawing.setViewLabel(dc, w.id, !!val.showLabel);   // (rfCQ)
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
    closeClickPM(false);   // (its dimension is going)
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
    if (s.kind === 'magline') return DW.deleteMagLine ? DW.deleteMagLine(s.id) : false;   // (rfAG)
    if (s.kind === 'holetable') return deleteHoleTable(s.id);   // (rfAN)
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
  // ------------------------------------------------------------------ rfS: Smart Dimension, SolidWorks style
  // The first pick (an edge, a circle / arc, a vertex / end point, a circle's centre), an optional second pick in the
  // same view, then a placement click; a preview follows the pointer from the first pick on, and the kind follows the
  // picks and where the pointer is (Drawing.smartDim). The tool stays on after a placement (the Dimension
  // PropertyManager opens on the new dimension); Esc ends it. Shift held on a circle pick measures to its near (min) or
  // far (max) side, the side clicked.
  var SD_MSG = 'Smart Dimension: click an edge, a circle or arc, a vertex or a circle’s centre in an orthographic view. Esc ends.';
  function cmdSmartDimension() {
    D.tool = D.tool === 'dim' && !D.dimLock ? null : 'dim'; D.pending = null; D.hover = null; D.dimLock = null;   // (lane CT: from Horizontal / Vertical Dimension it turns into Smart Dimension)
    drawOverlay(); UI.refreshRibbon();
    UI.setStatus(D.tool === 'dim' ? SD_MSG : 'Ready');
  }
  // (lane CT) Horizontal / Vertical Dimension (the Smart Dimension flyout, Tools ▸ Dimensions): the Smart Dimension
  // tool with its dimension held horizontal / vertical (D.dimLock, Drawing.smartDim's lock); the same picks, preview,
  // PropertyManager and Esc. Again on the same button ends it.
  function sdName() { return D.dimLock === 'h' ? 'Horizontal Dimension' : D.dimLock === 'v' ? 'Vertical Dimension' : 'Smart Dimension'; }
  function cmdLockedDimension(lock) {
    lock = lock === 'v' ? 'v' : 'h';
    if (D.tool === 'dim' && D.dimLock === lock) { if (UI.hasPM && UI.hasPM() && D.sdPM) UI.pmCancel(); D.tool = null; D.pending = null; D.hover = null; D.dimLock = null; drawOverlay(); UI.refreshRibbon(); UI.setStatus('Ready'); return; }
    if (D.tool && D.tool !== 'dim' && UI.hasPM && UI.hasPM()) UI.pmCancel();
    D.tool = 'dim'; D.dimLock = lock; D.pending = null; D.hover = null;
    drawOverlay(); UI.refreshRibbon();
    UI.setStatus(sdName() + ': click two points, a point and a circle centre, an edge or a circle in an orthographic view; the dimension stays ' + (lock === 'h' ? 'horizontal' : 'vertical') + '. Esc ends.');
  }
  // pickAt(p, viewId?) -> { view, w, pick (model units), at (sheet), hl (what the overlay outlines) } or null: a
  // circle's / arc's centre or an edge's end within 6 px first, else the nearest visible edge, circle or arc
  function pickAt(p, viewId) {
    var tol = pxToPaper(6), best = null, bd = tol;
    (D.sheet ? D.sheet.views : []).forEach(function (w) {
      if (!(w.ortho || w.trueDims) || w.pending || (viewId != null && w.view.id !== viewId)) return;   // (rfZ: and a True pictorial view)
      var b = w.box;
      if (p[0] < b.x0 - tol || p[0] > b.x1 + tol || p[1] < b.y0 - tol || p[1] > b.y1 + tol) return;
      w.proj.circles.visible.concat(w.proj.arcs ? w.proj.arcs.visible : []).forEach(function (c) {
        var q = w.toSheet(c.c), dd = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (dd < bd) { bd = dd; best = { view: w.view.id, w: w, pick: { center: { c: c.c.slice(), r: c.r } }, hl: { pt: q } }; }
      });
      // (rfAL) an ellipse's centre (a circle seen obliquely: a hole in a True view)
      (w.proj.ellipses ? w.proj.ellipses.visible : []).forEach(function (el) {
        var q = w.toSheet(el.c), dd = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (dd < bd) { bd = dd; best = { view: w.view.id, w: w, pick: { center: { c: el.c.slice(), r: Drawing.ellipseRadius(el.ax, el.ay) } }, hl: { pt: q } }; }
      });
      w.proj.lines.visible.forEach(function (l) {
        [[l[0], l[1]], [l[2], l[3]]].forEach(function (m) {
          var q = w.toSheet(m), dd = Math.hypot(p[0] - q[0], p[1] - q[1]);
          if (dd < bd) { bd = dd; best = { view: w.view.id, w: w, pick: { point: m.slice() }, hl: { pt: q } }; }
        });
      });
    });
    var ent = entityAt(p, false, true);
    if (ent && viewId != null && ent.view !== viewId) ent = null;
    // (rfIG) Smart Dimension at the middle of a straight edge: its midpoint, once the pointer has rested there (the
    // sketch's rule, ui-sketch.js dimMidpointAt: a quick click on an edge's middle still picks the edge); an end or
    // centre nearer the pointer wins
    var midHit = null;
    if (D.tool === 'dim' && ent && !ent.circle && !ent.arc && !ent.ellipse && ent.la && ent.lb) {
      var wm = sheetView(ent.view), mm = wm && [(ent.la[0] + ent.lb[0]) / 2, (ent.la[1] + ent.lb[1]) / 2], mq = mm && wm.toSheet(mm), dmid = mq ? Math.hypot(p[0] - mq[0], p[1] - mq[1]) : Infinity;
      if (mq && dmid < tol && dmid < bd) midHit = { view: ent.view, w: wm, pick: { mid: [ent.la.slice(), ent.lb.slice()] }, hl: { pt: mq, mid: true }, key: ent.view + ':' + mq.map(function (v) { return Math.round(v * 1e4); }).join(',') };
    }
    if (!sdMidReady(midHit ? midHit.key : null)) midHit = null;
    if (midHit) { midHit.at = p; return midHit; }
    if (best) {
      // a point wins when the pointer is on it (within 4 px) and not clearly nearer the edge or circle itself: a small
      // hole clicked on its outline is the circle, its middle is the centre; an edge's end is the vertex
      var de = Infinity;
      if (ent && ent.circle) de = Math.abs(Math.hypot(p[0] - ent.circle.c[0], p[1] - ent.circle.c[1]) - ent.circle.r);
      else if (ent && ent.arc) de = Math.abs(Math.hypot(p[0] - ent.arc.c[0], p[1] - ent.arc.c[1]) - ent.arc.r);
      else if (ent && ent.ellipse) de = ent.ellipse.pts.reduce(function (m, q, i, A) { return i ? Math.min(m, segDist(p, A[i - 1], q)) : m; }, Infinity);
      else if (ent) de = segDist(p, ent.a, ent.b);
      if (!ent || (bd <= pxToPaper(4) && bd < de + pxToPaper(2))) { best.at = p; return best; }
    }
    if (!ent) return null;
    var w0 = sheetView(ent.view), pk;
    if (ent.circle) pk = { circle: { c: ent.mc.c.slice(), r: ent.mc.r } };
    else if (ent.arc) pk = { arc: { c: ent.ma.c.slice(), r: ent.ma.r, a0: ent.ma.a0, a1: ent.ma.a1 } };
    else if (ent.ellipse) { var me = ent.me; pk = { ellipse: { c: me.c.slice(), ax: me.ax.slice(), ay: me.ay.slice(), t0: me.t0, t1: me.t1, full: !!(me.full || me.whole) } }; }   // (rfAL)
    else pk = { edge: [ent.la.slice(), ent.lb.slice()] };
    return { view: ent.view, w: w0, pick: pk, at: p, hl: ent };
  }
  // (rfIG) the pointer has stayed by midpoint `key` (null: none) for the Smart Dimension dwell (UI.dimMidDwell, the
  // sketch's); arriving at a new one starts its clock and a timer that redraws the hover when it is up
  var sdMid = { key: null, since: 0, timer: 0 };
  function sdMidReady(key) {
    var now = performance.now(), dwell = UI.dimMidDwell ? UI.dimMidDwell() : 150;
    if (key !== sdMid.key) {
      if (sdMid.timer) clearTimeout(sdMid.timer);
      sdMid = { key: key, since: now, timer: 0 };
      if (key && dwell > 0) sdMid.timer = setTimeout(function () { sdMid.timer = 0; if (sdMid.key === key && D.tool === 'dim' && D.lastSdMove) smartDimMove(D.lastSdMove.q, D.lastSdMove.e); }, dwell + 15);
    }
    return !!key && now - sdMid.since >= dwell;
  }
  function samePick(a, b) { return a && b && a.view === b.view && JSON.stringify(a.pick) === JSON.stringify(b.pick); }
  // Shift on a circle pick: min when the side clicked is nearer the other pick than the centre is, else max
  function minmaxOf(P) {
    var cp = [P.first, P.second].filter(function (x) { return x && x.shift && (x.pick.circle || x.pick.arc); })[0];
    if (!cp || !P.second) return null;
    var other = cp === P.first ? P.second : P.first, w = cp.w, c = (cp.pick.circle || cp.pick.arc).c, clk = w.fromSheet(cp.at);
    var om = other.pick.mid, op = other.pick.edge ? null : other.pick.point || (om ? [(om[0][0] + om[1][0]) / 2, (om[0][1] + om[1][1]) / 2] : (other.pick.center || other.pick.circle || other.pick.arc || other.pick.ellipse).c);
    function dist(q) {
      if (op) return Math.hypot(q[0] - op[0], q[1] - op[1]);
      var e = other.pick.edge, t = [e[1][0] - e[0][0], e[1][1] - e[0][1]], L = Math.hypot(t[0], t[1]) || 1;
      return Math.abs((q[0] - e[0][0]) * t[1] - (q[1] - e[0][1]) * t[0]) / L;
    }
    return dist(clk) < dist(c) ? 'min' : 'max';
  }
  // the dimension the picks and the pointer make now (null: not enough picks)
  function smartSpec(P, p) {
    if (!P || !P.first) return null;
    var w = P.first.w;
    var d = Drawing.smartDim(P.first.pick, P.second ? P.second.pick : null, p ? w.fromSheet(p) : null, { scale: w.scale, minmax: minmaxOf(P), aligned: !!w.trueDims, lock: D.dimLock || null });
    if (d && p) sdFollow(d, w, p);
    return d;
  }
  // (rfDD) a linear dimension placed outside its extension lines: the text follows the pointer out along the dimension
  // line (SolidWorks), never nearer than the spot the render gives a click outside (d.tside, beyond the arrow); the
  // preview and the click make the same record (d.tx: the text's offset from the middle, paper)
  function sdFollow(d, w, at) {
    var DP = Drawing._ && Drawing._.dimPrims;
    if (!DP || !(d.tside === 1 || d.tside === -1) || !/^(h|v|aligned)$/.test(d.kind) || !d.a || !d.b || !w || !w.toSheet) return;
    var probe = JSON.parse(JSON.stringify(d));
    probe.view = w.view.id; probe.text = Drawing.dimText(probe, units());
    try { DP(probe, w, paperK(), []); } catch (e) { return; }
    var def = probe.txNow;
    if (def == null || !isFinite(def)) return;
    var A = w.toSheet(d.a), B = w.toSheet(d.b);
    if (d.kind === 'aligned') {
      var Ln = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (!(Ln > 0)) return;
      var t = [(B[0] - A[0]) / Ln, (B[1] - A[1]) / Ln], sAt = (at[0] - A[0]) * t[0] + (at[1] - A[1]) * t[1];
      var sd = (def >= 0 ? 1 : -1) * d.tside, sDef = Ln / 2 + def * sd;
      if ((sAt - sDef) * d.tside > 0) d.tx = (sAt - Ln / 2) * sd;
      return;
    }
    var i0 = d.kind === 'h' ? 0 : 1, mid = (A[i0] + B[i0]) / 2;
    if ((at[i0] - (mid + def)) * d.tside > 0) d.tx = at[i0] - mid;
  }
  function smartDimClick(p, e) {
    var P = D.pending, hit;
    if (!P || !P.first) {
      hit = pickAt(p);
      if (!hit) { UI.setStatus(sdName() + ': click a visible edge, circle, arc, vertex or circle centre of an orthographic view.'); return; }
      // the previous dimension's PropertyManager closes, keeping its edits, as the next one starts
      if (UI.hasPM && UI.hasPM() && $('app').classList.contains('dw-pm')) { D.sdNext = true; try { UI.pmOK(); } finally { D.sdNext = false; } D.tool = 'dim'; }
      hit.shift = !!(e && e.shiftKey);
      D.pending = { view: hit.view, first: hit, second: null, at: p };
      D.hover = null; drawOverlay(); UI.refreshRibbon();
      UI.setStatus(hit.pick.point || hit.pick.center || hit.pick.mid ? sdName() + ': click a second item (a point, a centre, a circle or an edge). Esc cancels.'
        : sdName() + ': click where the dimension goes, or a second item (distance' + (D.dimLock ? '' : ' or angle') + '). Esc cancels.');
      return;
    }
    if (!P.second) {
      hit = pickAt(p, P.view);
      if (hit && !samePick(hit, P.first)) {
        hit.shift = !!(e && e.shiftKey);
        var trial = Drawing.smartDim(P.first.pick, hit.pick, null, { lock: D.dimLock || null });
        if (trial) {
          P.second = hit; P.at = p; drawOverlay();
          UI.setStatus(sdName() + ': click where the dimension goes (' + (trial.kind === 'angle' ? 'angle' : 'distance') + '). Esc cancels.');
          return;
        }
      }
    }
    var w = P.first.w, spec = smartSpec(P, p);
    if (!spec) { UI.setStatus(sdName() + (D.dimLock && P.first && !P.first.pick.point && !P.first.pick.center && !P.first.pick.mid ? ': that item has no ' + (D.dimLock === 'h' ? 'horizontal' : 'vertical') + ' size; pick a second item. Esc cancels.' : ': a point needs a second item to measure to. Esc cancels.')); return; }
    var index = -1;
    edit(function (dc) {
      var v = Drawing.findView(dc, P.view);
      if (!v) return;
      v.dims = (v.dims || []).concat([spec]);
      index = v.dims.length - 1;
    });
    D.pending = null; D.hover = null;
    if (index < 0) return;
    var ref = { kind: 'dim', view: P.view, key: null, index: index };
    D.sel = ref;
    var sd = sheetDim(ref);
    UI.setStatus('Dimension ' + (sd ? sd.text : '') + ' added to ' + w.view.name + '. Pick the next item, or Esc to end.');
    // (✓ or Esc on it ends Smart Dimension, as SolidWorks; the next pick closes it with its edits and goes on)
    if (sd) {
      cmdDimensionPM(ref, function () { D.sdPM = false; if (!D.sdNext && D.tool === 'dim') { D.tool = null; D.pending = null; D.hover = null; D.dimLock = null; UI.refreshRibbon(); UI.setStatus('Ready'); } });
      D.sdPM = true;
    }
    D.tool = 'dim'; drawOverlay(); UI.refreshRibbon();
    return spec;
  }
  // lane CG: Esc with a PropertyManager open (the placed dimension's, a view's …) goes to ui-commands.js escapeCommand,
  // which cancels the PM and then ends the drawing's tool here (Smart Dimension, Note …), from the PM's boxes too; a
  // command's inline box (a note being typed, a dimension's value) closes unapplied first. With no PM the drawing's
  // own key handler (drawing-ui-panels.js) ends the tool. The window listener takes the PM case before that handler
  // (which leaves Esc to an open PropertyManager) for a key sent to the window itself, which no document listener sees.
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented || !D.active || !(UI.hasPM && UI.hasPM()) || !$('modal').hidden) return;
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;   // a PM box: the PM's own Esc (ui-commands.js)
    if ((UI.menuOpen && UI.menuOpen()) || document.querySelector('.rb-fly.open, .rb-more.open, #menus > li.open')) return;   // the menu first (ui-app.js)
    e.preventDefault(); e.stopImmediatePropagation();
    UI.escapeCommand();
  }, true);
  UI.escapeBoxes = UI.escapeBoxes || [];
  UI.escapeBoxes.push(function () {
    if (!D.active || !D.inline || D.inline.field || D.inline.cell) return false;
    D.inline.autoCommit = false; closeInlineEdit(false);
    return true;
  });
  UI.escapeTools = UI.escapeTools || [];
  UI.escapeTools.push(function () {
    if (!D.active || !D.tool) return false;
    D.tool = null; D.pending = null; D.hover = null; D.dimLock = null; UI.refreshRibbon(); drawOverlay();
    return true;
  });
  // the pointer over the sheet while the tool runs: what the next click picks, and the preview
  function smartDimMove(q, e) {
    var P = D.pending;
    D.lastSdMove = { q: q.slice(), e: e ? { shiftKey: !!e.shiftKey } : null };
    if (P && P.first) { P.at = q; P.shiftNow = !!(e && e.shiftKey); }
    var hit = pickAt(q, P && P.first ? P.view : null);
    D.hover = hit ? (hit.hl.pt ? { kind: 'dimpt', view: hit.view, pt: hit.hl.pt } : hit.hl) : null;
    // (rfIG) the descriptor by the pointer: what the next click picks (SolidWorks' names)
    var pk = hit && hit.pick;
    D.sdLabel = pk ? { at: q.slice(), text: pk.mid ? 'Midpoint' : pk.point ? 'Vertex' : pk.center ? 'Center' : pk.edge ? 'Edge' : pk.circle ? 'Circle' : pk.arc ? 'Arc' : pk.ellipse ? 'Ellipse' : '' } : null;
    drawOverlay();
  }
  // drawOverlay's part: the picked items, the point under the pointer, and the dimension as it would be placed
  function smartDimOverlay(g, H, svgNode) {
    var P = D.pending, col = { stroke: '#2a2a2a', fill: 'none' }, sw = pxToPaper(1.4);   // rfBU: near-black preview (was blue)
    function dot(q, r) { svgNode('circle', { class: 'dw-hot', cx: q[0], cy: H - q[1], r: r || pxToPaper(4), 'stroke-width': pxToPaper(2) }, g); }
    if (D.hover && D.hover.kind === 'dimpt') dot(D.hover.pt, pxToPaper(5));
    // (rfIG) the descriptor: a small box below-right of the pointer, never under it
    if (D.sdLabel && D.sdLabel.text && D.hover) {
      var la = D.sdLabel.at, fs = pxToPaper(11), lx = la[0] + pxToPaper(14), ly = la[1] - pxToPaper(12), lw = pxToPaper(D.sdLabel.text.length * 6.2 + 10);
      var lg = svgNode('g', { class: 'dw-snap-label' }, g);
      svgNode('rect', { x: lx, y: H - ly, width: lw, height: pxToPaper(16), rx: pxToPaper(3), style: 'fill:var(--menu-bg);stroke:#e8891c', 'stroke-width': pxToPaper(1) }, lg);
      var lt = svgNode('text', { x: lx + pxToPaper(5), y: H - ly + pxToPaper(12), 'font-size': fs, style: 'fill:var(--text)' }, lg);
      lt.textContent = D.sdLabel.text;
    }
    if (!P || !P.first) return;
    [P.first, P.second].forEach(function (x) {
      if (!x) return;
      var h = x.hl;
      if (h.pt) dot(h.pt);
      else if (h.circle) svgNode('circle', { class: 'dw-hot', cx: h.circle.c[0], cy: H - h.circle.c[1], r: h.circle.r, 'stroke-width': pxToPaper(3) }, g);
      else if (h.arc) svgNode('circle', { class: 'dw-hot', cx: h.arc.c[0], cy: H - h.arc.c[1], r: h.arc.r, 'stroke-width': pxToPaper(2) }, g);
      else if (h.ellipse) svgNode('path', { class: 'dw-hot', d: DW.ellipsePath(h.ellipse.pts, H), fill: 'none', 'stroke-width': pxToPaper(3) }, g);
      else if (h.a) svgNode('line', { class: 'dw-hot', x1: h.a[0], y1: H - h.a[1], x2: h.b[0], y2: H - h.b[1], 'stroke-width': pxToPaper(3) }, g);
    });
    if (!P.at) return;
    var d = smartSpec(P, P.at);
    if (!d) return;
    var w = P.first.w, k = paperK(), th = 3.5 * k, u = units(), text;
    if (d.kind === 'angle') text = Math.round(d.value * 100) / 100 + '°'; else text = Drawing.dimText(d, u);
    function ln(a, b) { svgNode('line', { x1: a[0], y1: H - a[1], x2: b[0], y2: H - b[1], stroke: col.stroke, 'stroke-width': sw, class: 'dw-sdprev' }, g); }
    function tx(q) { var t = svgNode('text', { x: q[0], y: H - q[1], 'font-size': th / 0.72, 'text-anchor': 'middle', fill: col.stroke, class: 'dw-sdprev' }, g); t.textContent = text; }
    var A, B;
    // (rfDD) a linear dimension: drawn as the click will place it (the render's own primitives): the text centred
    // between the extension lines while the pointer is between them, outside and following the pointer past them
    var DP = Drawing._ && Drawing._.dimPrims;
    if (DP && /^(h|v|aligned)$/.test(d.kind)) {
      var pd = JSON.parse(JSON.stringify(d)), prims = null;
      pd.view = w.view.id; pd.text = text;
      try { prims = DP(pd, w, k, []); } catch (err) { prims = null; }
      if (prims) {
        prims.forEach(function (x) {
          if (x.k === 'line') ln(x.a, x.b);
          else if (x.k === 'fill') svgNode('path', { d: x.pts.map(function (q, i) { return (i ? 'L' : 'M') + q[0] + ' ' + (H - q[1]); }).join(' ') + ' Z', fill: col.stroke, stroke: 'none', class: 'dw-sdprev' }, g);
          else if (x.k === 'text') {
            var ta = { x: x.p[0], y: H - x.p[1], 'font-size': x.h / (Drawing._.CAP_EM || 0.72), 'text-anchor': x.anchor || 'middle', fill: col.stroke, class: 'dw-sdprev dw-sdprev-text' };
            if (x.rot) ta.transform = 'rotate(' + (-x.rot) + ' ' + x.p[0] + ' ' + (H - x.p[1]) + ')';
            var tn = svgNode('text', ta, g);
            tn.textContent = x.text;
          }
        });
        return;
      }
    }
    if (d.kind === 'h' || d.kind === 'v') {
      A = w.toSheet(d.a); B = w.toSheet(d.b);
      var hz = d.kind === 'h', pos = hz ? P.at[1] : P.at[0];
      var A2 = hz ? [A[0], pos] : [pos, A[1]], B2 = hz ? [B[0], pos] : [pos, B[1]];
      ln(A, A2); ln(B, B2); ln(A2, B2);
      tx(hz ? [(A2[0] + B2[0]) / 2, pos + 1 * k] : [pos, (A2[1] + B2[1]) / 2 + 1 * k]);
    } else if (d.kind === 'aligned') {
      A = w.toSheet(d.a); B = w.toSheet(d.b);
      var t = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(t[0], t[1]) || 1, n = [-t[1] / L, t[0] / L], o = d.off || 0;
      var A3 = [A[0] + n[0] * o, A[1] + n[1] * o], B3 = [B[0] + n[0] * o, B[1] + n[1] * o];
      ln(A, A3); ln(B, B3); ln(A3, B3); tx([(A3[0] + B3[0]) / 2, (A3[1] + B3[1]) / 2 + 1 * k]);
    } else if (d.kind === 'dia' || d.kind === 'rad') {
      var c = w.toSheet(d.c), r = d.r * w.scale, v = [P.at[0] - c[0], P.at[1] - c[1]], vl = Math.hypot(v[0], v[1]) || 1;
      ln([c[0] + v[0] / vl * r, c[1] + v[1] / vl * r], P.at); tx([P.at[0], P.at[1] + 1 * k]);
    } else if (d.kind === 'angle') {
      d.text = text;
      Drawing._anglePrims(d, w, k, D.sheet && D.sheet.dimStyle ? D.sheet.dimStyle.paper : undefined).forEach(function (x) {
        if (x.k === 'line') ln(x.a, x.b);
        else if (x.k === 'arc') {
          var a0 = x.a0 * Math.PI / 180, a1 = x.a1 * Math.PI / 180, s = [x.c[0] + x.r * Math.cos(a0), x.c[1] + x.r * Math.sin(a0)], e2 = [x.c[0] + x.r * Math.cos(a1), x.c[1] + x.r * Math.sin(a1)];
          svgNode('path', { d: 'M' + s[0] + ' ' + (H - s[1]) + ' A' + x.r + ' ' + x.r + ' 0 0 0 ' + e2[0] + ' ' + (H - e2[1]), fill: 'none', stroke: col.stroke, 'stroke-width': sw, class: 'dw-sdprev' }, g);
        } else if (x.k === 'text') tx([x.p[0], x.p[1]]);
      });
    }
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
    if (D.tool === 'sk:hideann') { D.tool = null; D.pending = null; D.hover = null; D.sheetShowHidden = false; render(); }   // (lane drawing) hidden annotations stay off the export
    if (!D.sheet) render();
    var sh = D.sheet;
    if (kind === 'svg') UI.exportDialog('Save Drawing as SVG', safeName() + '.svg', Drawing.toSVG(sh), 'image/svg+xml');
    else if (kind === 'dxf') {
      var ver = D.dxfVersion = opts && opts.version === 'R2000' ? 'R2000' : opts && opts.version ? 'R12' : D.dxfVersion || 'R12';
      UI.exportDialog('Save Drawing as DXF (one layer per view)', safeName() + '.dxf', Drawing.toDXF(sh, { version: ver, hatch: true }), 'application/dxf');
      var ta = document.querySelector('#modal textarea');
      if (ta) {
        var sel = el('select', { id: 'dw-dxf-version', title: 'DXF version' });
        [['R12', 'R12 (AC1009)'], ['R2000', 'R2000 (AC1015)']].forEach(function (x) { var op = el('option', { value: x[0], text: x[1] }); if (x[0] === ver) op.selected = true; sel.appendChild(op); });
        sel.onchange = function () { exportAs('dxf', { version: sel.value }); };
        // (rfS) the same sheet as DWG (lane DG: written in the page by dwg-writer.js, AutoCAD 2000, no server)
        var dwgBtn = el('button', { id: 'dw-save-dwg', type: 'button', text: 'Save as DWG…', title: 'Saves this sheet as an AutoCAD 2000 DWG' });
        dwgBtn.onclick = function () { exportAs('dwg'); };
        ta.parentNode.insertBefore(el('p', {}, [el('label', { text: 'Version ' }), sel, el('span', { text: '  ' }), dwgBtn]), ta);
      }
    }
    else if (kind === 'dwg') return saveDWG(sh);
    else if (kind === 'pdf') UI.exportDialog('Save Drawing as PDF', safeName() + '.pdf', Drawing.toPDF(sh), 'application/pdf');
  }
  // (rfS) File ▸ Save Drawing as DWG: the active sheet's R2000 DXF made into an AutoCAD 2000 DWG by UI.dxfToDwg, as the
  // part's DXF/DWG Output does (lane DG: dwg-writer.js in the page, no server; the local server's converter only when
  // the writer throws or did not load). Returns a promise of { name, bytes } (null when nothing was saved).
  var DWG_NOTE = 'DWG needs the local server\'s converter (dwg-writer.js did not load)';
  function saveDWG(sh) {
    var text = Drawing.toDXF(sh, { version: 'R2000', hatch: true }), name = safeName() + '.dwg';
    if (document.getElementById('modal') && !$('modal').hidden) UI.closeModal();
    var probe = UI.dwgConverter ? UI.dwgConverter() : Promise.resolve(null);
    UI.setStatus('Save Drawing as DWG…');
    return probe.then(function (conv) {
      if (!conv || !UI.dxfToDwg) { UI.toast(DWG_NOTE); UI.setStatus('DWG: ' + DWG_NOTE + '. Save as DXF (R2000) instead.'); D.lastDwg = { ok: false, note: DWG_NOTE }; return null; }
      UI.setStatus('Writing ' + name + '…');
      return UI.dxfToDwg(text).then(function (bytes) {
        UI.download(name, bytes, 'application/acad');
        UI.setStatus('Saved ' + name + ' (' + (bytes.byteLength / 1024).toFixed(1) + ' KB).');
        D.lastDwg = { ok: true, name: name, size: bytes.byteLength };
        return { name: name, bytes: bytes };
      }, function (e) { var m = e && e.message || String(e); UI.toast(m); UI.setStatus('DWG: ' + m); D.lastDwg = { ok: false, note: m }; return null; });
    });
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
      { label: 'Crop View ▸ Remove Crop', disabled: !v.crop, action: function () { removeCrop(v.id); } },
      { label: 'Un-Break View', disabled: !(v.breaks && v.breaks.length), action: function () { unBreak(v.id); } },
      { label: 'Broken-out Section ▸ Remove', disabled: !(v.brokenOut && v.brokenOut.length), action: function () { removeBrokenOut(v.id); } },
      { label: 'Area Hatch/Fill…', disabled: !hatchUnder(v), action: function () { var h = hatchUnder(v); if (h) cmdAreaHatch(v.id, h.g); } },
      { sep: true },
      { label: 'Delete', key: 'Del', action: function () { deleteView(v.id); } }
    ];
  }
  function sheetMenu() {
    return [
      { label: 'Properties\u2026', action: cmdSheetProperties },
      { label: 'Standard 3 View', action: cmdStandard3View },
      { label: 'Model View\u2026', action: cmdModelView },
      { label: 'Model Items…', checked: !!(doc() && doc().autoDims), action: function () { if (DW.cmdModelItemsPM) DW.cmdModelItemsPM(); else cmdModelItems(); } },
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
      message: 'Balloons every component in the view with its Bill of Materials item number: on a square around the view, or in a row on one side (on a magnetic line you can drag).',
      values: { view: v0.id, ignoreMultiple: true, layout: 'square', magnetic: true },
      groups: [
        { title: 'Drawing View', fields: [{ type: 'select', key: 'view', label: 'View', options: dc.views.map(function (v) { return [v.id, v.name + (v.kind ? '' : ' (' + v.orient + ')')]; }) }] },
        { title: 'Balloon Layout', fields: [
          { type: 'select', key: 'layout', label: 'Layout', rerender: true, options: [['square', 'Square'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']] },   // (rfAG)
          { type: 'check', key: 'magnetic', label: 'Insert magnetic line(s)', show: function (v) { return v.layout !== 'square'; } },
          { type: 'check', key: 'ignoreMultiple', label: 'Ignore multiple instances' }] }
      ],
      onOK: function (val) { autoBalloonView(+val.view, { ignoreMultiple: !!val.ignoreMultiple, layout: val.layout || 'square', magnetic: val.layout !== 'square' && !!val.magnetic }); }
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
      else if (ev.key === 'Escape') { ev.preventDefault(); if (D.inline) D.inline.autoCommit = false; closeInlineEdit(false); UI.escapeCommand(); }   // lane CG: and the Note tool ends
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
        { title: 'Display Attributes', fields: [{ type: 'check', key: 'ext', label: 'Extended lines' }, { type: 'number', key: 'size', label: 'Mark size', unit: 'u', min: 0.01 }] }
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
    // (rfDD) a slot's end arc (or an arc slot's side): the slot callout, as SolidWorks' Hole Callout on a slot
    if (ent && ent.arc && ent.ma) {
      var sw = sheetView(ent.view), d = null;
      if (!sw || !sw.proj || !Drawing.slotAt(sw.proj, ent.ma.c, ent.ma.r)) { UI.setStatus('Hole Callout: that arc is not the end of a slot. Click a hole or the end of a slot.'); return; }
      edit(function (dc) { d = Drawing.addSlotCallout(dc, ent.view, sw.proj, { c: ent.ma.c, r: ent.ma.r }); });
      var vd = d && doc().views.filter(function (x) { return x.id === ent.view; })[0], ix = vd && vd.dims ? vd.dims.length - 1 : -1;
      var sd = (D.sheet.dims || []).filter(function (x) { return x.view === ent.view && x.index === ix; })[0];
      UI.setStatus('Hole Callout: ' + (sd ? sd.text : 'slot') + ' — drag it to move it.');
      return;
    }
    if (!ent || !ent.circle) { UI.setStatus('Hole Callout: click the edge of a hole or slot in an orthographic view.'); return; }
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
  // (lane CT) fixed 'h' | 'v': Horizontal / Vertical Ordinate Dimension, the direction preset (no Direction box)
  function cmdChainDim(kind, fixed) {
    var tool = kind === 'ordinate' ? 'ordinate' : 'baseline';
    fixed = kind === 'ordinate' && (fixed === 'h' || fixed === 'v') ? fixed : null;
    if (D.tool === tool && (D.pending && D.pending.fixed || null) === fixed) { endToolPM(); return; }
    if (D.tool === tool) endToolPM();
    var name = fixed ? (fixed === 'h' ? 'Horizontal' : 'Vertical') + ' Ordinate Dimension' : kind === 'ordinate' ? 'Ordinate Dimension' : 'Baseline Dimension';
    toolPM({
      title: name, icon: fixed ? (fixed === 'h' ? 'ordinateH' : 'ordinateV') : kind === 'ordinate' ? 'ordinateDim' : 'baselineDim', command: tool,
      message: 'Click the base (an edge or hole) in an orthographic view, then each feature to dimension from it' + (fixed ? ', ' + (fixed === 'h' ? 'horizontally' : 'vertically') : '') + '. ✓ ends.',
      values: { dir: fixed || 'h' },
      groups: fixed ? [] : [{ title: 'Direction', fields: [{ type: 'select', key: 'dir', label: 'Measure', options: [['h', 'Horizontal'], ['v', 'Vertical']] }] }],
      onChange: function (v) { if (D.pending && !D.pending.dim && !D.pending.fixed) D.pending.dir = v.dir === 'v' ? 'v' : 'h'; }
    }, tool, { kind: kind, dir: fixed || 'h', fixed: fixed, view: null, base: null, dim: null });
    UI.setStatus(name + ': click the base edge or hole. Esc ends.');
  }
  function chainDimClick(p) {
    var ent = entityAt(p), P = D.pending, name = P.fixed ? (P.fixed === 'h' ? 'Horizontal Ordinate' : 'Vertical Ordinate') : P.kind === 'ordinate' ? 'Ordinate' : 'Baseline';
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
      if (dd) {
        // (lane BX) a feature in line with one already in the chain (the second hole of a column) would repeat its
        // value, a duplicate dimension a checker red-lines: it is not added
        var had = [0].concat((dd.values || []).slice(0, dd.refs.length));
        dd.refs.push(Drawing.refFrom(ref)); render();
        var dn = Drawing.findView(doc(), P.dim.view).dims[P.dim.index], nv = dn && dn.values ? dn.values[dn.refs.length - 1] : null;
        if (nv != null && had.some(function (x) { return Math.abs(Math.abs(x) - Math.abs(nv)) <= 1e-6 * (1 + Math.abs(nv)); })) {
          dn.refs.pop(); render();
          UI.setStatus(name + ': ' + Drawing.numText(Math.abs(nv), units()) + ' is dimensioned already (that feature lines up with one picked before) — click another, ✓ ends.');
          return;
        }
        UI.autosave();
      }
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
  // rfIF: SolidWorks' precision list: None, .1 … .12345678, then the drawing's own precision "(Document)" last (value
  // 'auto': the dimension follows Document Properties ▸ Units ▸ Decimal places)
  var MAX_PREC = 8;
  function precText(n) { return +n > 0 ? '.' + '12345678'.slice(0, +n) : 'None'; }
  function docPrecText() {
    var o = Drawing.docOptions(doc());
    if (o.fractions && units() === 'in') return 'Fractions';
    return precText(o.dimPrec != null ? o.dimPrec : units() === 'in' ? 3 : 2);
  }
  function PREC_OPTIONS() {
    var out = [];
    for (var i = 0; i <= MAX_PREC; i++) out.push([String(i), precText(i)]);
    out.push(['auto', docPrecText() + ' (Document)']);
    return out;
  }
  // noFocus (a single click on a dimension, SolidWorks): the PM opens with the keyboard left on the sheet, so Delete
  // still deletes the selected dimension; it closes on a model change (D.clickPM, see closeClickPM)
  function cmdDimensionPM(ref, onClose, noFocus) {
    var d = sheetDim(ref);
    if (!d) return;
    var w = sheetView(d.view), src = d.auto && d.kind !== 'ordinate' && d.kind !== 'baseline' ? Drawing.dimSource(App.model, App.build, w, d) : null;
    var tol = d.tol || { type: 'none' }, u = units();
    var values = { value: d.value != null ? +d.value.toFixed(8) : 0, tolType: tol.type || 'none', plus: tol.plus != null ? tol.plus : 0, minus: tol.minus != null ? tol.minus : 0, prec: d.prec != null ? String(d.prec) : 'auto', label: d.label != null ? d.label : '<DIM>', flip: !!d.flip };
    var single = d.kind !== 'ordinate' && d.kind !== 'baseline' && d.kind !== 'angrun';
    var primary = src ? [{ type: 'number', key: 'value', label: 'Value', unit: 'u' }, { type: 'static', label: 'Drives', value: src.featureName + ' (' + src.what + ')' + (src.expr ? ' — equation ' + src.expr : '') }]
      : [{ type: 'static', label: 'Value', value: single ? (d.kind === 'angle' ? (Math.round(d.value * 1e4) / 1e4) + '°' : Drawing.numText(d.value, u) + ' ' + u) + (d.auto ? ' (no model parameter found)' : ' (reference: driven by the model)') : d.text }];
    // (lane BX) the two-Enter rule: text, tolerance, precision and arrows show on the sheet as they are typed or picked,
    // so the first Enter in a box commits what it holds and the dimension follows; the second Enter (✓) closes. The
    // whole PM is one undo step; ✗ puts the dimension back. (A model item's Value drives the part on ✓ only.)
    var live = { on: false }, values0 = JSON.parse(JSON.stringify(values));
    function liveApply(v) {
      var t = dimTarget(doc(), d);
      if (!t) return;
      Drawing.setDimProps(t, dimPropsFromPM(v)); cleanDimProps(doc());
      render();
    }
    openDrawingPM({
      title: 'Dimension', icon: 'dim', command: 'dimension', noFocus: !!noFocus, clickDim: !!noFocus, dimRef: dimRef(d),
      message: src ? 'A model item: a new value changes ' + src.featureName + ' and rebuilds the part.' : d.auto ? 'A model item. Its text, tolerance and arrows can be edited here.' : 'A reference dimension: it follows the model; text, tolerance and arrows can be edited here.',
      values: values,
      groups: [
        { title: 'Primary Value', fields: primary },
        { title: 'Tolerance/Precision', fields: [
          { type: 'select', key: 'tolType', label: 'Tolerance', icon: 'dimTolType', options: Drawing.TOL_TYPES, rerender: true, show: function () { return d.kind !== 'angrun'; } },   // (lane CT: an angular running set takes a precision only)
          { type: 'number', key: 'plus', label: 'Maximum variation (+)', unit: 'u', show: function (v) { return v.tolType !== 'none'; } },
          { type: 'number', key: 'minus', label: 'Minimum variation (−)', unit: 'u', show: function (v) { return v.tolType === 'bilateral' || v.tolType === 'limit'; } },
          { type: 'select', key: 'prec', label: 'Unit precision', icon: 'dimPrecision', options: PREC_OPTIONS }
        ] },
        { title: 'Dimension Text', show: function () { return d.kind !== 'angrun'; }, fields: [{ type: 'text', key: 'label', label: 'Text (<DIM> is the value)' }] },
        { title: 'Leaders', show: function () { return d.kind !== 'angrun' && d.kind !== 'pathlen'; }, fields: [{ type: 'check', key: 'flip', label: 'Flip arrows (outside)' }] }
      ],
      onChange: function (v, key) {
        // (the PM's opening call has no key; nothing changed yet: no undo step)
        if (key == null || key === 'value' || !doc()) return;
        if (!live.on && JSON.stringify(dimPropsFromPM(v)) === JSON.stringify(dimPropsFromPM(values0))) return;
        if (!live.on) { settle(); UI.pushUndo(); D.dirty = true; live.on = true; live.undo = App.undo.length; live.top = App.undo[App.undo.length - 1]; }
        liveApply(v);
      },
      // (lane CA) ✗ (or Ctrl+Z) puts the dimension back and takes back the undo step its live edits made, so the next
      // Ctrl+Z undoes the step before the PM, not a step that changes nothing
      onCancel: function () {
        if (live.on && doc()) {
          liveApply(values0); live.on = false;
          if (App.undo.length === live.undo && App.undo[App.undo.length - 1] === live.top) App.undo.pop();
        }
      },
      onOK: function (v) { return applyDimensionPM(d, src, v, live.on); }, onClose: onClose
    });
  }
  // The Dimension PM a single click opened (spec.clickDim), or null. It shows the dimension as it was when clicked, so a
  // model change (rebuild, undo / redo), a delete or a click elsewhere closes it (closeClickPM) before the sheet is
  // worked out again; an open PM never holds the sheet back.
  function clickPM() { var s = UI.pmSpec && UI.pmSpec(); return s && s.clickDim ? s : null; }
  function sameDimRef(a, b) { return !!a && !!b && a.view === b.view && (a.key || null) === (b.key || null) && a.index === b.index && (a.style || null) === (b.style || null); }
  // a single click on a dimension (no tool running): its PM, unless another command's PM is open or it already shows
  function openClickDimPM(ref) {
    var s = UI.pmSpec && UI.pmSpec(), d = sheetDim(ref);
    if (!d) return;
    if (s && s.command === 'dimension' && sameDimRef(s.dimRef, dimRef(d))) return;
    if (s && !s.clickDim) return;
    if (s) closeClickPM(true);
    d = sheetDim(ref);
    if (d) cmdDimensionPM(dimRef(d), null, true);
  }
  // apply: keep what was typed in it (a click elsewhere, as SolidWorks); else drop it (the model changed under it)
  function closeClickPM(apply) {
    if (!clickPM()) return false;
    if (apply) UI.pmOK(); else UI.pmCancel();
    return true;
  }
  function dimPropsFromPM(v) {
    var label = String(v.label == null ? '' : v.label);
    return { tol: v.tolType && v.tolType !== 'none' ? { type: v.tolType, plus: Math.abs(+v.plus || 0), minus: v.tolType === 'symmetric' ? Math.abs(+v.plus || 0) : Math.abs(+v.minus || 0) } : null,
      prec: v.prec === 'auto' || v.prec == null ? null : +v.prec, label: label.trim() === '' || label === '<DIM>' ? null : label, flip: !!v.flip };
  }
  function applyDimensionPM(d, src, v, live) {   // live: the PM already applied its props (one undo step taken)
    var props = dimPropsFromPM(v), val = +v.value;
    if (src && isFinite(val) && Math.abs(val - d.value) > 1e-9) {
      // drive the part: try it on a copy first, so a refused value leaves no undo step
      try { Drawing.driveDim(JSON.parse(JSON.stringify(App.model)), src, val); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return false; }
      if (!live) UI.pushUndo();
      D.dirty = true;
      var t = dimTarget(doc(), d);
      if (t) Drawing.setDimProps(t, props);
      cleanDimProps(doc());
      Drawing.driveDim(App.model, src, val);
      UI.setStatus('Dimension ' + Drawing.numText(d.value, units()) + ' → ' + Drawing.numText(val, units()) + ': ' + src.featureName + ' ' + src.what + ' changed, rebuilding.');
      return UI.rebuild().then(function () { if (D.active) render(); });
    }
    if (live) { var t2 = dimTarget(doc(), d); if (t2) Drawing.setDimProps(t2, props); cleanDimProps(doc()); UI.autosave(); render(); } else setDimProps(d, props);
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
      groups: [{ title: 'Dimension Text', fields: [{ type: 'text', key: 'text', label: 'Text' }, { type: 'select', key: 'prec', label: 'Unit precision', icon: 'dimPrecision', options: PREC_OPTIONS }] }],
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
    var sz = el('input', { type: 'number', step: units() === 'in' ? '0.01' : '0.5', min: '0.01', value: String(o.markSize) });
    cm.checked = o.autoCenterMarks; cl.checked = o.autoCenterlines; ex.checked = o.extLines; bq.checked = o.balloonQty;
    cm.id = 'dw-opt-cm'; cl.id = 'dw-opt-cl'; ex.id = 'dw-opt-ext'; bq.id = 'dw-opt-qty'; sz.id = 'dw-opt-size';
    function chk(inp, text) { return el('label', { class: 'dw-opt' }, [inp, el('span', { text: text })]); }
    // (Phase 9) Units: decimal places and, in inches, fractions; Sheet Metal: the flat-pattern view's annotations
    var fd = el('input', { type: 'checkbox', id: 'dw-opt-flatdims' }), fs = el('input', { type: 'checkbox', id: 'dw-opt-flatsize' }), fr = el('input', { type: 'checkbox', id: 'dw-opt-frac' });
    var bn = el('select', { id: 'dw-opt-bend' }), pr = el('select', { id: 'dw-opt-prec' }), dn = el('select', { id: 'dw-opt-denom' }), inch = units() === 'in';
    fd.checked = o.flatDims; fs.checked = o.flatSizeNote; fr.checked = o.fractions;
    BEND_NOTE_OPTIONS.forEach(function (x) { var op = el('option', { value: x[0], text: x[1] }); if (x[0] === o.bendNotes) op.selected = true; bn.appendChild(op); });
    // rfIF: None … .12345678 as SolidWorks lists them, after the default for the units
    [['', 'Default (' + (inch ? '.123' : 'up to .12') + ')']].concat([0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return [String(n), precText(n)]; })).forEach(function (x) {
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
      else if (ev.key === 'Escape') { ev.preventDefault(); closeInlineEdit(false); UI.escapeCommand(); }   // lane CG: unapplied, and the command under it ends
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
    // (rfP) in a broken view the pointer's move is taken back through the break, so the dimension keeps its model place
    // (anchored on the text as it was drawn, so the pointer's pixel rounding is not magnified inside a gap)
    if (w.breakMap) {
      var tb = d.tbox && isFinite(d.tbox.x0) ? [(d.tbox.x0 + d.tbox.x1) / 2, (d.tbox.y0 + d.tbox.y1) / 2] : dg.start;
      var u0 = w.breakMap.inv(tb), u1 = w.breakMap.inv([tb[0] + dx, tb[1] + dy]); dx = u1[0] - u0[0]; dy = u1[1] - u0[1];
    }
    if (d.kind === 'h') { props.at = d.lineAt + dy / w.scale; props.tx = (d.txNow != null ? d.txNow : d.tx || 0) + dx; }
    else if (d.kind === 'v') { props.at = d.lineAt + dx / w.scale; props.tx = (d.txNow != null ? d.txNow : d.tx || 0) + dy; }
    else if (d.kind === 'aligned') {
      var a = w.toSheet(d.a), b = w.toSheet(d.b), t = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(t[0], t[1]) || 1; t = [t[0] / L, t[1] / L];
      var n0 = [-t[1], t[0]], ang = Math.atan2(t[1], t[0]) * 180 / Math.PI, tt = t;
      if (ang > 90 || ang <= -90) tt = [-t[0], -t[1]];
      props.off = (d.offNow || 0) + dx * n0[0] + dy * n0[1]; props.tx = (d.txNow != null ? d.txNow : d.tx || 0) + dx * tt[0] + dy * tt[1];
    } else if (d.kind === 'dia' || d.kind === 'rad' || d.kind === 'chamfer') props.lead = [d.leadNow[0] + dx, d.leadNow[1] + dy];
    else if (d.kind === 'ordinate' || d.kind === 'baseline') props.at = d.lineAt + (d.dir === 'v' ? dx : dy) / w.scale;
    else if (d.kind === 'pathlen' && d.leadNow) props.lead = [d.leadNow[0] + dx, d.leadNow[1] + dy];   // (lane CT)
    else if ((d.kind === 'angle' || d.kind === 'angrun') && d.c) {
      // (rfS) the arc moves in or out with the pointer, along the line from the vertex to where the drag started
      var vc = w.toSheet(d.c), um = [dg.start[0] - vc[0], dg.start[1] - vc[1]], ul = Math.hypot(um[0], um[1]) || 1;
      props.rad = Math.max(1e-9, ((d.radNow || d.rad || 0) * w.scale + (dx * um[0] + dy * um[1]) / ul) / w.scale);
    }
    // (lane CA) text dragged back to the middle: centred between the extension lines when it fits there (tside 0)
    if (Math.abs(props.tx || 0) < pxToPaper(4)) { if ('tx' in props) { props.tx = null; props.tside = 0; } }
    var hadGuide = !!D.snapGuide;
    if (!dg.noSnap) snapDim(d, w, props); else D.snapGuide = null;
    if (hadGuide || D.snapGuide) drawOverlay();
    var t2 = dimTarget(doc(), d);
    if (t2) Drawing.setDimProps(t2, props);
    queueRender(true);
  }
  // a balloon from the sheet list: its entry in the view's balloons (by position in the list)
  function balloonRef(b) { return { kind: 'balloon', view: b.view, index: b.index, key: b.key, component: b.component }; }

  // ------------------------------------------------------------------ Auxiliary View, Crop View, Break (rfN)
  // SolidWorks: View Layout ▸ Auxiliary View (click a straight edge, then the side the view goes), Crop View (the
  // crop profile: a rectangle by two corners or a circle by centre and radius, clicked in the view), Break (Broken
  // View PropertyManager: break line orientation, gap, style; click the two break lines). Their clicks come through
  // a capture listener on the sheet; the ribbon buttons, the Insert ▸ Drawing View entries and the anvil.drawing calls
  // are added to what drawing-ui-panels.js defines when it defines them (see addRibbon / addMenus / addApi).
  function needPart() {
    if (App.mesh && App.mesh.triCount) return true;
    UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.');
    return false;
  }
  // runs a view change on a scratch copy first, so a refused one leaves no undo step; returns false when refused
  function tryEdit(fn) {
    try { fn(JSON.parse(JSON.stringify(doc()))); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return false; }
    edit(fn);
    return true;
  }
  function cmdAuxiliaryView() {
    if (D.tool === 'aux') { endToolPM(); return; }
    if (!needPart()) return;
    var vals = { label: Drawing.nextLabel(doc()), flip: false, showLabel: true };
    startTool('aux', { parent: null, edge: null, label: vals.label, pm: vals });
    // (rfW) its PropertyManager opens with the tool (SolidWorks): Arrow (label, Flip direction); (rfCQ) Display label
    openDrawingPM({
      title: 'Auxiliary View', icon: 'auxView', command: 'auxView', noFocus: true, values: vals,
      message: 'Click a straight edge in a view, then click where the view goes along its arrow. Esc cancels.',
      groups: [{ title: 'Arrow', fields: [{ type: 'text', key: 'label', label: 'Label' }, { type: 'check', key: 'flip', label: 'Flip direction' }, { type: 'check', key: 'showLabel', label: 'Display label' }] }],
      onChange: function (v) { var P = D.pending; if (D.tool === 'aux' && P && P.pm === vals) { P.label = cleanLabel(v.label); P.ghosts = null; drawOverlay(); } },
      onOK: function () { if (D.tool === 'aux') endTool(); },
      onClose: function () { if (D.tool === 'aux' && D.pending && D.pending.pm === vals) endTool(); }
    });
    UI.setStatus('Auxiliary View: click a straight edge in a view; the new view looks square onto it. Esc cancels.');
  }
  function auxClick(p) {
    var P = D.pending;
    if (P.parent == null) {
      var ent = entityAt(p), w = ent && ent.la ? sheetView(ent.view) : null;
      if (!w || w.view.kind === 'detail' || w.view.kind === 'flat') { UI.setStatus('Auxiliary View: click a straight visible edge of a model, projected, section or auxiliary view.'); return; }
      P.parent = w.view.id; P.edge = { a: ent.la, b: ent.lb, pa: ent.a, pb: ent.b };
      D.sel = { kind: 'view', id: w.view.id }; drawOverlay();
      UI.setStatus('Auxiliary View ' + P.label + '-' + P.label + ': click on the side of the edge where the view goes.');
      return;
    }
    var e = P.edge, n = [-(e.pb[1] - e.pa[1]), e.pb[0] - e.pa[0]], m = [(e.pa[0] + e.pb[0]) / 2, (e.pa[1] + e.pb[1]) / 2];
    var spec = { a: e.a, b: e.b, sign: ((p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1] >= 0 ? 1 : -1) * (P.pm && P.pm.flip ? -1 : 1), label: P.label, x: p[0], y: p[1] }, parent = P.parent, v;
    if (P.pm && P.pm.showLabel === false) spec.showLabel = false;   // (rfCQ)
    endTool();
    if (P.pm && UI.pmSpec && UI.pmSpec() && UI.pmSpec().values === P.pm) UI.pmCancel();
    try { Drawing.addAuxiliaryView(JSON.parse(JSON.stringify(doc())), mesh(), parent, spec); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
    v = editView(function (dc) { return Drawing.addAuxiliaryView(dc, mesh(), parent, spec); });
    D.sel = { kind: 'view', id: v.id }; drawOverlay(); DW.renderTree();
    UI.setStatus(v.name + ' placed: square to the edge; drag it along its arrow.');
    return v;
  }
  // (rfCX) Removed Section (SolidWorks: View Layout ▸ Removed Section): click an edge of a view, click the opposite
  // edge (each click lands on the edge under the pointer, or a hole centre within 8 px), then click anywhere on the
  // sheet for the section: the cross-section alone, hatched, SECTION A-A, the cutting line drawn on the parent.
  // Its PropertyManager opens with the tool (label, Flip direction, Display label, scale); Esc ends it.
  function cmdRemovedSection() {
    if (D.tool === 'rmsec') { endToolPM(); return; }
    if (!needPart()) return;
    var vals = { label: Drawing.nextLabel(doc()), flip: false, showLabel: true, scaleMode: 'parent', scale: scaleOptions()[1][0] };
    startTool('rmsec', { parent: null, a: null, b: null, at: null, label: vals.label, pm: vals });
    openDrawingPM({
      title: 'Removed Section', icon: 'removedSection', command: 'removedSection', noFocus: true, values: vals,
      message: 'Click an edge of a view, then the opposite edge: the cutting line runs between them. Then click where the section goes. Esc cancels.',
      groups: [{ title: 'Section View', fields: [{ type: 'text', key: 'label', label: 'Label' }, { type: 'check', key: 'flip', label: 'Flip direction' }, { type: 'check', key: 'showLabel', label: 'Display label' }] },
        { title: 'Scale', fields: [{ type: 'radio', key: 'scaleMode', label: 'Scale', rerender: true, options: [['parent', 'Use parent scale'], ['custom', 'Use custom scale']] },
          { type: 'select', key: 'scale', label: 'Scale', show: function (v) { return v.scaleMode === 'custom'; }, options: scaleOptions().slice(1) }] }],
      onChange: function (v) { var P = D.pending; if (D.tool === 'rmsec' && P && P.pm === vals) { P.label = cleanLabel(v.label); drawOverlay(); } },
      onOK: function () { if (D.tool === 'rmsec') endTool(); },
      onClose: function () { if (D.tool === 'rmsec' && D.pending && D.pending.pm === vals) endTool(); }
    });
    UI.setStatus('Removed Section: click an edge of a view where the cutting line starts. Esc cancels.');
  }
  // the parent point a click picks: on the straight edge under the pointer (the foot of the pointer on it), else the
  // pointer with each coordinate snapped to a hole centre
  function rmsecPoint(w, p) {
    var ent = entityAt(p);
    if (ent && ent.la && ent.view === w.view.id) {
      var q = w.fromSheet(p), a = ent.la, b = ent.lb, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      var t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
      return [a[0] + dx * t, a[1] + dy * t];
    }
    return snapCentre(w, p);
  }
  // the second end: square to the first (the line is horizontal or vertical, whichever is nearer)
  function rmsecSecond(P, q) {
    var a = P.a, h = Math.abs(q[0] - a[0]) >= Math.abs(q[1] - a[1]);
    return h ? [q[0], a[1]] : [a[0], q[1]];
  }
  function rmsecClick(p) {
    var P = D.pending;
    if (P.parent == null) {
      var ent = entityAt(p), w = ent && ent.la ? sheetView(ent.view) : parentAt(p);
      if (!w || w.view.kind === 'detail' || w.view.kind === 'flat' || Drawing.isRemovedSection(w.view)) { UI.setStatus('Removed Section: click an edge of a model, projected, section or auxiliary view.'); return; }
      P.parent = w.view.id; P.a = rmsecPoint(w, p);
      D.sel = { kind: 'view', id: w.view.id }; drawOverlay();
      UI.setStatus('Removed Section ' + P.label + '-' + P.label + ': click the opposite edge.');
      return;
    }
    var w0 = sheetView(P.parent);
    if (!w0) { endTool(); return; }
    if (!P.b) {
      var b = rmsecSecond(P, rmsecPoint(w0, p));
      if (Math.hypot(b[0] - P.a[0], b[1] - P.a[1]) < 1e-9) { UI.setStatus('Removed Section: click the opposite edge, away from the first.'); return; }
      P.b = b; drawOverlay();
      UI.setStatus('Removed Section ' + P.label + '-' + P.label + ': click where the section goes.');
      return;
    }
    var pm = P.pm || {}, spec = { a: P.a, b: P.b, x: p[0], y: p[1], label: P.label, flip: !!pm.flip }, parent = P.parent, v;
    if (pm.showLabel === false) spec.showLabel = false;
    if (pm.scaleMode === 'custom' && pm.scale) spec.scale = Drawing.parseScale(pm.scale);
    endTool();
    if (UI.pmSpec && UI.pmSpec() && UI.pmSpec().values === P.pm) UI.pmCancel();
    try { Drawing.addRemovedSection(JSON.parse(JSON.stringify(doc())), mesh(), parent, spec); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
    v = editView(function (dc) { return Drawing.addRemovedSection(dc, mesh(), parent, spec); });
    D.sel = { kind: 'view', id: v.id }; drawOverlay(); DW.renderTree();
    UI.setStatus(v.name + ' placed: the cross-section between the two edges.');
    return v;
  }
  // the preview: the cutting line from the first end to the pointer (square to it), then the section's box at the pointer
  function rmsecOverlay(g, H, node, ghost) {
    var P = D.pending, w = P && P.parent != null ? sheetView(P.parent) : null;
    if (!w || !P.a) return;
    var b = P.b || (P.at ? rmsecSecond(P, w.fromSheet(P.at)) : null);
    if (!b) return;
    var A = w.toSheet(P.a), Bs = w.toSheet(b), dash = pxToPaper(12) + ' ' + pxToPaper(3) + ' ' + pxToPaper(3) + ' ' + pxToPaper(3);
    node('line', { class: 'dw-cut dw-rmsec', x1: A[0], y1: H - A[1], x2: Bs[0], y2: H - Bs[1], 'stroke-width': pxToPaper(2), 'stroke-dasharray': dash }, g);
    D.preview = { kind: 'removedSection', a: A, b: Bs };
    if (P.b && P.at) {
      var h = Math.abs(b[0] - P.a[0]) >= Math.abs(b[1] - P.a[1]), ex = Drawing.extentsOf(mesh(), Drawing.sectionFrame(w.frame, h ? 'h' : 'v', 1));
      var sc = P.pm && P.pm.scaleMode === 'custom' && P.pm.scale ? Drawing.scaleValue(Drawing.parseScale(P.pm.scale)) : w.scale, len = Math.hypot(b[0] - P.a[0], b[1] - P.a[1]);
      var gw = (h ? len : ex.w) * sc, gh = (h ? ex.h : len) * sc;
      ghost(P.at[0], P.at[1], gw, gh);
      D.preview.ghost = { x: P.at[0], y: P.at[1], w: gw, h: gh };
    }
  }
  DW.cmdRemovedSection = cmdRemovedSection; DW.rmsecClick = rmsecClick; DW.rmsecOverlay = rmsecOverlay;
  function cmdCropView() {
    if (D.tool === 'crop') { endTool(); return; }
    if (!needPart()) return;
    openDrawingPM({
      title: 'Crop View', icon: 'cropView', command: 'cropView',
      message: 'Pick the crop profile, press OK, then click two points in a view: opposite corners of the rectangle, or the centre and a point on the circle. The view keeps what is inside.',
      values: { shape: 'rect' },
      groups: [{ title: 'Crop Profile', fields: [{ type: 'select', key: 'shape', label: 'Profile', options: [['rect', 'Rectangle'], ['circle', 'Circle']] }] }],
      onOK: function (val) {
        startTool('crop', { shape: val.shape === 'circle' ? 'circle' : 'rect', view: null, p0: null });
        UI.setStatus('Crop View: click ' + (val.shape === 'circle' ? 'the centre of the circle' : 'the first corner') + ' in a view. Esc cancels.');
      }
    });
  }
  function cropClick(p) {
    var P = D.pending;
    if (P.view == null) {
      var w = parentAt(p);
      if (!w) { UI.setStatus('Crop View: click inside a model, projected, section or auxiliary view.'); return; }
      P.view = w.view.id; P.p0 = w.fromSheet(p); P.s0 = p;
      UI.setStatus('Crop View: click ' + (P.shape === 'circle' ? 'a point on the circle.' : 'the opposite corner.'));
      return;
    }
    var w2 = sheetView(P.view), q = w2 ? w2.fromSheet(p) : null, id = P.view, region;
    endTool();
    if (!q) return;
    region = P.shape === 'circle' ? { type: 'circle', c: P.p0, r: Math.hypot(p[0] - P.s0[0], p[1] - P.s0[1]) / w2.scale } : { type: 'rect', a: P.p0, b: q };
    if (tryEdit(function (dc) { Drawing.setCrop(dc, id, region); })) { D.sel = { kind: 'view', id: id }; drawOverlay(); DW.renderTree(); UI.setStatus(w2.view.name + ' cropped (right-click ▸ Crop View ▸ Remove Crop takes it off).'); }
  }
  function removeCrop(id) { if (tryEdit(function (dc) { Drawing.setCrop(dc, id, null); })) UI.setStatus('Crop removed.'); }
  function cmdBreakView() {
    if (D.tool === 'brk') { endTool(); return; }
    if (!needPart()) return;
    var inch = units() === 'in';
    openDrawingPM({
      title: 'Broken View', icon: 'breakView', command: 'breakView',
      message: 'Pick the break line orientation, gap and style, press OK, then click in a view where the first and the second break line go. The geometry between them is removed; dimensions keep their true values.',
      values: { dir: 'vertical', gap: inch ? 0.4 : 10, style: 'zigzag' },
      groups: [{ title: 'Broken View Settings', fields: [
        { type: 'select', key: 'dir', label: 'Break lines', options: [['vertical', 'Add vertical break line'], ['horizontal', 'Add horizontal break line']] },
        { type: 'number', key: 'gap', label: 'Gap size', unit: 'u', min: 0 },
        { type: 'select', key: 'style', label: 'Break line style', options: [['zigzag', 'Zig Zag Cut'], ['straight', 'Straight Cut']] }
      ] }],
      onOK: function (val) {
        startTool('brk', { dir: val.dir === 'horizontal' ? 'horizontal' : 'vertical', gap: +val.gap >= 0 ? +val.gap : (inch ? 0.4 : 10), style: val.style === 'straight' ? 'straight' : 'zigzag', view: null, a: null });
        UI.setStatus('Break: click in a view where the first break line goes. Esc cancels.');
      }
    });
  }
  function breakClick(p) {
    var P = D.pending, ax = P.dir === 'horizontal' ? 1 : 0;
    if (P.view == null) {
      var w = parentAt(p);
      if (!w) { UI.setStatus('Break: click inside a model, projected, section or auxiliary view.'); return; }
      P.view = w.view.id; P.a = w.fromSheet(p)[ax];
      UI.setStatus('Break: click where the second break line goes.');
      return;
    }
    var w2 = sheetView(P.view), id = P.view, spec = { dir: P.dir, a: P.a, b: w2 ? w2.fromSheet(p)[ax] : P.a, gap: P.gap, style: P.style };
    endTool();
    if (tryEdit(function (dc) { Drawing.addBreak(dc, id, spec); })) { D.sel = { kind: 'view', id: id }; drawOverlay(); DW.renderTree(); UI.setStatus((w2 ? w2.view.name : 'View') + ' broken (right-click ▸ Un-Break View restores it).'); }
  }
  function unBreak(id) { if (tryEdit(function (dc) { Drawing.clearBreaks(dc, id); })) UI.setStatus('Break removed.'); }
  // ---- (rfW) live previews while placing, as SolidWorks draws them: every leg of a half / offset / aligned cutting line
  // as it is clicked (sectionPreview), the auxiliary view's outline sliding along its arrow, the crop rectangle or
  // circle as it is dragged out, the break lines as they are placed (liveOverlay, called from drawOverlay)
  // from sheet point p along unit d to just past view w's box
  function outOfBox(w, p, d) {
    var t = Infinity, box = w.box, ext = 5 * paperK();
    if (Math.abs(d[0]) > 1e-12) t = Math.min(t, ((d[0] > 0 ? box.x1 : box.x0) - p[0]) / d[0]);
    if (Math.abs(d[1]) > 1e-12) t = Math.min(t, ((d[1] > 0 ? box.y1 : box.y0) - p[1]) / d[1]);
    t = (isFinite(t) ? Math.max(0, t) : 0) + ext;
    return [p[0] + d[0] * t, p[1] + d[1] * t];
  }
  // -> { pts (sheet polyline), ghost (the view outline follows the pointer too) } for a typed section, or null (full)
  function sectionPreview(P) {
    var ty = P.type || 'full', w = sheetView(P.parent);
    if (ty === 'full' || !w || !P.at) return null;
    var ti = P.axis === 'h' ? 0 : 1, ni = 1 - ti, sT = P.axis === 'h' ? [1, 0] : [0, 1];
    function m2(t, n) { return P.axis === 'h' ? [t, n] : [n, t]; }
    function ts(t, n) { return w.toSheet(m2(t, n)); }
    if (ty === 'half') {
      var Cs = ts(P.c, P.cut), pl = sectionPlacement(P.at), sg = pl ? pl.sign : 1, side = P.side < 0 ? -1 : 1;
      return { pts: [outOfBox(w, Cs, [sT[0] * side, sT[1] * side]), Cs, outOfBox(w, Cs, P.axis === 'h' ? [0, sg] : [sg, 0])], ghost: true };
    }
    if (ty === 'offset') {
      var legs = P.pts.slice(), inside = inBox(w, P.at);
      if (inside && legs.length < 3) legs.push(snapCentre(w, P.at));
      legs.sort(function (a, b) { return a[ti] - b[ti]; });
      var pts = [outOfBox(w, ts(legs[0][ti], legs[0][ni]), [-sT[0], -sT[1]])];
      for (var i = 0; i + 1 < legs.length; i++) { var tb = (legs[i][ti] + legs[i + 1][ti]) / 2; pts.push(ts(tb, legs[i][ni]), ts(tb, legs[i + 1][ni])); }
      var L = legs[legs.length - 1];
      pts.push(outOfBox(w, ts(L[ti], L[ni]), sT));
      return { pts: pts, ghost: !inside };
    }
    // aligned: leg 1 along the line from the centre, leg 2 to the pointer until its angle is clicked
    var C = m2(P.c, P.cut), Cs2 = w.toSheet(C), d2, sd;
    if (P.angle == null) {
      var q = snapCentre(w, P.at), dx = q[0] - C[0], dy = q[1] - C[1], l = Math.hypot(dx, dy);
      if (l < 1e-9) return { pts: [Cs2, outOfBox(w, Cs2, sT)], ghost: false };
      d2 = [dx / l, dy / l]; sd = (P.axis === 'h' ? dx : dy) > 0 ? -1 : 1;
    } else { var a = P.angle * Math.PI / 180; d2 = [Math.cos(a), Math.sin(a)]; sd = P.side < 0 ? -1 : 1; }
    return { pts: [outOfBox(w, Cs2, [sT[0] * sd, sT[1] * sd]), Cs2, outOfBox(w, Cs2, d2)], ghost: P.angle != null };
  }
  // the auxiliary view the pointer would place: { x, y, w, h, d (its axis), m (the edge's midpoint) }, worked out once
  // per side of the edge on a scratch copy of the drawing and slid along the axis to the pointer
  function auxPreview(P, p) {
    var e = P.edge, n = [-(e.pb[1] - e.pa[1]), e.pb[0] - e.pa[0]], m = [(e.pa[0] + e.pb[0]) / 2, (e.pa[1] + e.pb[1]) / 2];
    var sign = ((p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1] >= 0 ? 1 : -1) * (P.pm && P.pm.flip ? -1 : 1);
    P.ghosts = P.ghosts || {};
    var c = P.ghosts[sign];
    if (c === undefined) {
      c = null;
      try {
        var dc = JSON.parse(JSON.stringify(doc())), v = Drawing.addAuxiliaryView(dc, mesh(), P.parent, { a: e.a, b: e.b, sign: sign, label: P.label, x: m[0], y: m[1] });
        var ext = Drawing.extentsOf(mesh(), Drawing.viewFrame(dc, v)), pw = sheetView(P.parent), sc = pw ? pw.scale : 1;
        c = { x: v.x, y: v.y, d: v.aux.dir.slice(), w: ext.w * sc, h: ext.h * sc };
      } catch (err) { c = null; }
      P.ghosts[sign] = c;
    }
    if (!c) return null;
    var t = (p[0] - c.x) * c.d[0] + (p[1] - c.y) * c.d[1];
    return { x: c.x + c.d[0] * t, y: c.y + c.d[1] * t, w: c.w, h: c.h, d: c.d, m: m };
  }
  // a break line across view w at sheet coordinate s (x for vertical breaks, y for horizontal), zig zag or straight
  function breakLinePts(w, dir, s, style) {
    var ext = 3 * paperK(), v = dir !== 'horizontal', lo = (v ? w.box.y0 : w.box.x0) - ext, hi = (v ? w.box.y1 : w.box.x1) + ext;
    var pts = [[lo, 0]];
    if (style !== 'straight') {
      var mid = (lo + hi) / 2, amp = 2 * paperK(), step = 2.5 * paperK();
      pts.push([mid - 2 * step, 0], [mid - step, amp], [mid + step, -amp], [mid + 2 * step, 0]);
    }
    pts.push([hi, 0]);
    return pts.map(function (q) { return v ? [s + q[1], q[0]] : [q[0], s + q[1]]; });
  }
  function liveOverlay(g, H, node, ghost) {
    var P = D.pending, sw = pxToPaper(2), dash = pxToPaper(12) + ' ' + pxToPaper(3) + ' ' + pxToPaper(3) + ' ' + pxToPaper(3);
    if (!P || !P.at) return;
    function poly(pts, cls, dashed) { var a = { class: cls || 'dw-cut', points: pts.map(function (q) { return q[0] + ',' + (H - q[1]); }).join(' '), fill: 'none', 'stroke-width': sw }; if (dashed) a['stroke-dasharray'] = dash; return node('polyline', a, g); }
    if (D.tool === 'magline') return;   // (rfAG) drawn by magOverlay
    if (D.tool === 'bko') {   // (rfAD) the broken-out profile as it is drawn
      var bp = boPreview(P);
      if (bp && bp.circle) node('circle', { class: 'dw-cut dw-bo', cx: bp.circle.c[0], cy: H - bp.circle.c[1], r: bp.circle.r, fill: 'none', 'stroke-width': sw }, g);
      else if (bp && bp.pts.length > 1) poly(bp.pts, 'dw-cut dw-bo', P.stage === 'ref');
      D.preview = bp ? { kind: 'brokenOut', pts: bp.pts, circle: bp.circle || null, stage: P.stage || 'profile' } : null;
      return;
    }
    if (D.tool === 'ahatch') return;
    if (D.tool === 'aux' && P.parent != null && P.edge) {
      var ag = auxPreview(P, P.at);
      if (!ag) return;
      poly([ag.m, [ag.x, ag.y]], 'dw-cut dw-aux-axis', true);
      ghost(ag.x, ag.y, ag.w, ag.h);
      D.preview = { kind: 'aux', x: ag.x, y: ag.y, w: ag.w, h: ag.h };
    } else if (D.tool === 'crop' && P.view != null && P.s0) {
      var a = P.s0, b = P.at;
      if (P.shape === 'circle') { var r = Math.hypot(b[0] - a[0], b[1] - a[1]); node('circle', { class: 'dw-cut dw-crop', cx: a[0], cy: H - a[1], r: r, fill: 'none', 'stroke-width': sw }, g); D.preview = { kind: 'crop', shape: 'circle', c: a.slice(), r: r }; }
      else { node('rect', { class: 'dw-cut dw-crop', x: Math.min(a[0], b[0]), y: H - Math.max(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]), fill: 'none', 'stroke-width': sw }, g); D.preview = { kind: 'crop', shape: 'rect', a: a.slice(), b: b.slice() }; }
    } else if (D.tool === 'brk') {
      var w = P.view != null ? sheetView(P.view) : parentAt(P.at), ax = P.dir === 'horizontal' ? 1 : 0;
      if (!w) return;
      var lines = [];
      if (P.view != null) lines.push(w.toSheet(P.dir === 'horizontal' ? [0, P.a] : [P.a, 0])[ax]);
      lines.push(P.at[ax]);
      lines.forEach(function (s0) { poly(breakLinePts(w, P.dir, s0, P.style), 'dw-cut dw-break'); });
      D.preview = { kind: 'break', at: lines.slice() };
    }
  }
  // ------------------------------------------------------------------ rfAD: Broken-out Section, Area Hatch / Fill
  // SolidWorks: Insert ▸ Drawing View ▸ Broken-out Section (View Layout tab, after Detail View): draw a closed profile
  // in a view (a spline through clicked points, closed by clicking its first point again or OK; or a rectangle by two
  // corners, a circle by centre and a point), then the depth: a number, or (Depth reference) an edge or circle picked in
  // another view, the cut going down to it. Area Hatch/Fill (Annotation tab; Insert ▸ Annotations; a hatched region's
  // right-click menu; or a click on the hatch of a view already selected): Material crosshatch, or the region's own
  // Pattern, Scale and Angle. (rfAG: tools 'bko' and 'ahatch'; drawing-ui.js routes their clicks and live preview here
  // by name.)
  var BO_PROFILES = [['spline', 'Spline (click points, then the first point again)'], ['poly', 'Polyline (click points, then the first point again)'], ['rect', 'Rectangle (two corners)'], ['circle', 'Circle (centre, then a point on it)']];
  function boActive() { return D.tool === 'bko' && !!D.pending; }
  function cmdBrokenOut() {
    if (boActive()) { endToolPM(); return; }
    if (!needPart()) return;
    var inch = units() === 'in', vals = { shape: 'spline', depth: inch ? 0.25 : 5, useRef: false };
    startTool('bko', { mode: 'bo', shape: 'spline', view: null, pts: [], spts: [], pm: vals });
    openDrawingPM({
      title: 'Broken-out Section', icon: 'brokenOut', command: 'brokenOut', noFocus: true, values: vals,
      message: 'Draw the closed profile in a model, projected or auxiliary view, then press OK (or click the first point again). The material inside it is removed down to the depth, in this view only.',
      groups: [
        { title: 'Profile', fields: [{ type: 'select', key: 'shape', label: 'Profile', options: BO_PROFILES }] },
        { title: 'Depth', fields: [
          { type: 'check', key: 'useRef', label: 'Depth reference (pick an edge or circle in another view)' },
          { type: 'number', key: 'depth', label: 'Depth', unit: 'u', min: 0, show: function (v) { return !v.useRef; } }] }
      ],
      onChange: function (v) { var P = D.pending; if (boActive() && P.pm === vals && !P.pts.length) P.shape = v.shape; },
      onOK: function (v) { var P = D.pending; if (boActive() && P.pm === vals) { P.closing = true; boFinishProfile(P); } },
      onClose: function () { var P = D.pending; if (boActive() && P.pm === vals && !P.closing) endTool(); }
    });
    UI.setStatus('Broken-out Section: click in a view to start the profile. Esc cancels.');
  }
  // -> { pts (sheet polyline, closed when finished), circle } of the profile being drawn
  function boPreview(P) {
    if (!P.spts.length) return null;
    var a = P.spts[0], at = P.stage === 'ref' ? null : P.at;
    if (P.shape === 'circle') { var e = P.spts[1] || at; return e ? { pts: [], circle: { c: a, r: Math.hypot(e[0] - a[0], e[1] - a[1]) } } : null; }
    if (P.shape === 'rect') { var b = P.spts[1] || at; return b ? { pts: [a, [b[0], a[1]], b, [a[0], b[1]], a] } : null; }
    var w = sheetView(P.view), pts = P.spts.slice();
    if (at) pts.push(at);
    if (P.shape === 'spline' && pts.length >= 3 && w) {
      var poly = Drawing.brokenOutPolygon({ shape: 'spline', pts: pts.map(function (q) { return w.fromSheet(q); }) }).map(function (q) { return w.toSheet(q); });
      return { pts: poly.concat([poly[0]]) };
    }
    return { pts: P.stage === 'ref' ? pts.concat([pts[0]]) : pts };
  }
  function boClick(p) {
    var P = D.pending;
    if (P.stage === 'ref') { boRefClick(p); return; }
    if (P.view == null) {
      var w = parentAt(p);
      if (!w || w.view.kind === 'section') { UI.setStatus('Broken-out Section: click inside a model, projected or auxiliary view.'); return; }
      P.view = w.view.id; P.pts = [w.fromSheet(p)]; P.spts = [p];
      D.sel = { kind: 'view', id: w.view.id };
      UI.setStatus(P.shape === 'rect' ? 'Broken-out Section: click the opposite corner.' : P.shape === 'circle' ? 'Broken-out Section: click a point on the circle.' : 'Broken-out Section: click the next point; click the first point again (or OK) to close the profile.');
      drawOverlay();
      return;
    }
    var w2 = sheetView(P.view);
    if (!w2) { endTool(); return; }
    var first = P.spts[0];
    if ((P.shape === 'spline' || P.shape === 'poly') && P.spts.length >= 3 && Math.hypot(p[0] - first[0], p[1] - first[1]) <= 2.5 * paperK()) { boFinishProfile(P); return; }
    P.pts.push(w2.fromSheet(p)); P.spts.push(p);
    if (P.shape === 'rect' || P.shape === 'circle') boFinishProfile(P);
    else drawOverlay();
  }
  function boSpec(P) {
    var w = sheetView(P.view), spec = { shape: P.shape };
    if (P.shape === 'rect') { spec.a = P.pts[0]; spec.b = P.pts[1]; }
    else if (P.shape === 'circle') { spec.c = P.pts[0]; spec.r = Math.hypot(P.spts[1][0] - P.spts[0][0], P.spts[1][1] - P.spts[0][1]) / (w ? w.scale : 1); }
    else spec.pts = P.pts.slice();
    return spec;
  }
  function boFinishProfile(P) {
    var need = P.shape === 'rect' || P.shape === 'circle' ? 2 : 3;
    if (P.view == null || P.pts.length < need) {
      P.closing = false;
      UI.setStatus('Broken-out Section: the profile needs ' + need + ' points first.');
      if (UI.pmSpec && !(UI.pmSpec() && UI.pmSpec().values === P.pm)) endTool();
      return;
    }
    var pm = P.pm || {};
    if (pm.useRef) { P.stage = 'ref'; drawOverlay(); UI.setStatus('Broken-out Section: click an edge or a circle in another view; the cut goes down to it.'); return; }
    boApply(P, Object.assign(boSpec(P), { depth: +pm.depth }));
  }
  function boRefClick(p) {
    var P = D.pending, ent = entityAt(p, true), q = null;
    if (ent && ent.view !== P.view) {
      if (ent.mc) q = ent.mc.c; else if (ent.ma) q = ent.ma.c; else if (ent.la) q = [(ent.la[0] + ent.lb[0]) / 2, (ent.la[1] + ent.lb[1]) / 2];
    }
    if (!q) { UI.setStatus('Broken-out Section: click an edge or a circle in another view (square to this one) for the depth.'); return; }
    boApply(P, Object.assign(boSpec(P), { depthRef: { view: ent.view, p: q } }));
  }
  function boApply(P, spec) {
    var id = P.view, pm = P.pm;
    endTool();
    if (pm && UI.pmSpec && UI.pmSpec() && UI.pmSpec().values === pm) UI.pmCancel();
    if (tryEdit(function (dc) { Drawing.addBrokenOut(dc, id, spec); })) {
      D.sel = { kind: 'view', id: id }; drawOverlay(); DW.renderTree();
      UI.setStatus('Broken-out section added (right-click the view ▸ Broken-out Section ▸ Remove takes it off).');
    }
  }
  function removeBrokenOut(id) { if (tryEdit(function (dc) { Drawing.clearBrokenOut(dc, id); })) UI.setStatus('Broken-out sections removed.'); }
  // the Area Hatch/Fill PropertyManager for region g (an entry of Drawing.hatchRegions) of view viewId (lane DW:
  // SolidWorks' groups — Properties: Material crosshatch, Hatch / Solid / None, Pattern, Pattern scale, Pattern angle;
  // Apply changes to: Region / Body / Component (an assembly))
  var HATCH_NAMES = { ANSI31: 'ANSI31 (Iron BrickStone)', ANSI32: 'ANSI32 (Steel)', ANSI33: 'ANSI33 (Bronze Brass)', ANSI34: 'ANSI34 (Plastic Rubber)', ANSI35: 'ANSI35 (Fire Brick)', ANSI36: 'ANSI36 (Marble Slate Glass)', ANSI37: 'ANSI37 (Lead Zinc Mg)', ANSI38: 'ANSI38 (Aluminum)' };
  function hatchValues(pattern, scale, angle) {
    var fill = pattern === 'SOLID' ? 'solid' : pattern === 'NONE' ? 'none' : 'hatch';
    return { fill: fill, pattern: fill !== 'hatch' || HATCH_NAMES[pattern] ? pattern : 'ANSI31', scale: scale || 1, angle: angle || 0 };   // (SOLID / NONE kept as the value: Hatch then starts from ANSI31, normFill)
  }
  function hatchFieldList(material) {
    var off = function (v) { return material && v.material; }, hatchOn = function (v) { return !off(v) && v.fill === 'hatch'; };
    return (material ? [{ type: 'check', key: 'material', label: 'Material crosshatch', rerender: true }] : []).concat([
      { type: 'radio', key: 'fill', label: 'Fill', rerender: true, options: [['hatch', 'Hatch'], ['solid', 'Solid'], ['none', 'None']], show: function (v) { return !off(v); } },
      { type: 'select', key: 'pattern', label: 'Pattern', options: Drawing.AREA_PATTERNS.filter(function (k) { return HATCH_NAMES[k]; }).map(function (k) { return [k, HATCH_NAMES[k]]; }), show: hatchOn },
      { type: 'number', key: 'scale', label: 'Scale', min: 0.01, show: hatchOn },
      { type: 'number', key: 'angle', label: 'Angle (degrees)', show: hatchOn }]);
  }
  function hatchProps(v) { return { fill: v.fill, pattern: v.pattern, scale: +v.scale > 0 ? +v.scale : 1, angle: +v.angle || 0 }; }
  function cmdAreaHatch(viewId, g) {
    if (!g) return;
    var vals = hatchValues(g.pattern, g.areaHatch ? g.scale : 1, g.areaHatch ? g.angle : 0);
    vals.material = !g.areaHatch; vals.apply = g.scope || 'region';
    var apply = [['region', 'Region'], ['body', 'Body']].concat(isAsm() ? [['component', 'Component']] : []);
    D.sel = { kind: 'view', id: viewId };
    openDrawingPM({
      title: 'Area Hatch/Fill', icon: 'areaHatch', command: 'areaHatch', values: vals,
      message: 'The hatch of the selected region. Material crosshatch uses the part\'s material pattern; untick it to give the region, its body or its component its own hatch, a solid fill or none.',
      groups: [{ title: 'Properties', fields: hatchFieldList(true) },
        { title: 'Apply changes to', fields: [{ type: 'radio', key: 'apply', label: 'Apply to', options: apply }] }],
      onOK: function (v) { setAreaHatch(viewId, g, v.material ? null : hatchProps(v), v.apply); }
    });
    UI.setStatus('Area Hatch/Fill: region ' + (g.index + 1) + ' of ' + ((sheetView(viewId) || { view: {} }).view.name || 'the view') + '.');
  }
  // setAreaHatch(viewId, region (an entry of hatchRegions) | [u, v], props | null, scope?) — one undo step
  function setAreaHatch(viewId, g, props, scope) {
    var p = Array.isArray(g) ? g : g.p, opts = Array.isArray(g) ? {} : { key: g.key, scope: scope || 'region', comp: g.comp };
    var what = { body: ' (the body)', component: ' (the component)' }[opts.scope] || '';
    if (tryEdit(function (dc) { Drawing.setAreaHatch(dc, viewId, p, props, opts); })) UI.setStatus(props ? 'Area hatch' + what + ': ' + hatchSays(props) + '.' : 'Area hatch' + what + ': material crosshatch.');
  }
  function hatchSays(props) { return props.fill === 'solid' || props.pattern === 'SOLID' ? 'solid fill' : props.fill === 'none' || props.pattern === 'NONE' ? 'none' : props.pattern + ', scale ' + props.scale + ', angle ' + props.angle + '°'; }
  // (lane DW) Area Hatch/Fill on a model face or a closed sketch profile: its PM (new: spec for Drawing.addAreaFill;
  // existing: the fill, an entry of the sheet's areaFills)
  function cmdAreaFill(spec, fill) {
    var vals = fill ? hatchValues(fill.pattern, fill.scale, fill.angle) : hatchValues('ANSI31', 1, 0);
    if (fill) D.sel = { kind: 'areaFill', id: fill.id };
    openDrawingPM({
      title: 'Area Hatch/Fill', icon: 'areaHatch', command: 'areaHatch', values: vals,
      message: fill ? 'The hatch of the selected area. Delete removes it.' : 'Hatch or fill the ' + (spec.ids ? 'closed sketch profile' : 'model face') + ' you picked.',
      groups: [{ title: 'Properties', fields: hatchFieldList(false) }],
      onOK: function (v) {
        var props = hatchProps(v);
        if (fill) { if (tryEdit(function (dc) { Drawing.editAreaFill(dc, fill.id, props); })) UI.setStatus('Area hatch: ' + hatchSays(props) + '.'); return; }
        var fr = spec.view != null && sheetView(spec.view) ? sheetView(spec.view).frame : null, made = null;
        if (tryEdit(function (dc) { made = Drawing.addAreaFill(dc, Object.assign({}, spec, props), mesh(), fr); })) {
          if (made) D.sel = { kind: 'areaFill', id: made.id };
          UI.setStatus('Area hatch added: ' + hatchSays(props) + '.');
        }
      }
    });
  }
  // the drawn Area Hatch/Fill under sheet point p (the smallest), or null
  function fillAt(p) {
    var best = null, ba = Infinity;
    ((D.sheet && D.sheet.areaFills) || []).forEach(function (f) {
      if (!Drawing._.inLoops(p, f.loops)) return;
      var a = 0; f.loops[0].forEach(function (q, i, l) { var r = l[(i + 1) % l.length]; a += q[0] * r[1] - r[0] * q[1]; });
      if (Math.abs(a) < ba) { ba = Math.abs(a); best = f; }
    });
    return best;
  }
  function deleteAreaFill(id) { if (tryEdit(function (dc) { Drawing.editAreaFill(dc, id, null); })) { if (D.sel && D.sel.kind === 'areaFill') D.sel = null; UI.setStatus('Area hatch deleted.'); } }
  DW.areaFillDelete = function () { var s = D.sel; if (!s || s.kind !== 'areaFill') return false; deleteAreaFill(s.id); return true; };
  function regionAtSheet(p) { var w = viewAt(p), g = w ? Drawing.hatchRegionAt(w, p) : null; return g ? { w: w, g: g } : null; }
  // an edge within 2.5 px of p (a click there picks the edge, not the hatch)
  function nearEdge(p) {
    var e = entityAt(p, true), t = pxToPaper(2.5);
    if (!e) return false;
    if (e.a) return segDist(p, e.a, e.b) <= t;
    var c = e.circle || e.arc;
    return c ? Math.abs(Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) - c.r) <= t : true;
  }
  function hatchUnder(v) { var h = ctxAt && D.sheet ? regionAtSheet(ctxAt) : null; return h && h.w.view.id === v.id ? h : null; }
  function cmdAreaHatchTool() {
    if (D.tool === 'ahatch') { endTool(); return; }
    if (!needPart()) return;
    startTool('ahatch', { mode: 'ahatch' });
    UI.setStatus('Area Hatch/Fill: click a hatched region of a section, a closed sketch profile, or a model face in a view. Esc cancels.');
  }
  function hatchPickClick(p) {
    var h = regionAtSheet(p);
    if (h) { endTool(); cmdAreaHatch(h.w.view.id, h.g); return; }
    var f = fillAt(p);
    if (f) { endTool(); cmdAreaFill(null, f); return; }
    var sk = Drawing.sketchRegionAt(doc(), p);
    if (sk) { endTool(); cmdAreaFill({ ids: sk.ids }); return; }
    var w = viewAt(p);
    if (w && !w.pending) {
      var spec = { view: w.view.id, p: w.fromSheet(p) };
      try { Drawing.addAreaFill(JSON.parse(JSON.stringify(doc())), spec, mesh(), w.frame); } catch (err) { UI.setStatus(err.message); return; }
      endTool(); cmdAreaFill(spec); return;
    }
    UI.setStatus('Area Hatch/Fill: click inside a hatched region, a closed sketch profile or a model face.');
  }
  // a plain click on the hatch of a view that is already selected opens the Area Hatch/Fill PropertyManager (SolidWorks
  // selects the hatch); the right-click menu of a hatched region offers it too
  var hatchDown = null, ctxAt = null;
  document.addEventListener('mousedown', function (e) {
    hatchDown = null;
    if (e.button !== 0 || e.defaultPrevented || !D.active || !D.sheet || D.tool || !D.host || !D.host.contains(e.target) || (UI.hasPM && UI.hasPM())) return;
    var p = DW.toPaper(e), h = regionAtSheet(p);
    if (h && D.sel && D.sel.kind === 'view' && D.sel.id === h.w.view.id && !nearEdge(p) && !(DW.dimAt && DW.dimAt(p))) hatchDown = { x: e.clientX, y: e.clientY, view: h.w.view.id, g: h.g };
    // (lane DW) an Area Hatch/Fill: a sheet one anywhere off the views, a view's one when the view is selected
    var fl = !hatchDown && !h ? fillAt(p) : null;
    if (fl && (fl.view == null ? !viewAt(p) : D.sel && D.sel.kind === 'view' && D.sel.id === fl.view) && !nearEdge(p) && !(DW.dimAt && DW.dimAt(p))) hatchDown = { x: e.clientX, y: e.clientY, fill: fl };
  }, true);
  document.addEventListener('mouseup', function (e) {
    var h = hatchDown; hatchDown = null;
    if (!h || Math.hypot(e.clientX - h.x, e.clientY - h.y) > 3 || D.tool) return;
    setTimeout(function () { if (D.active && !D.tool) { if (h.fill) cmdAreaFill(null, h.fill); else cmdAreaHatch(h.view, h.g); } }, 0);
  }, true);
  document.addEventListener('contextmenu', function (e) { ctxAt = D.active && D.sheet && D.host && D.host.contains(e.target) ? DW.toPaper(e) : null; }, true);
  var RF_TOOLS = { aux: auxClick, crop: cropClick, brk: breakClick, bko: boClick, ahatch: hatchPickClick };   // (rfAG) routed by tool name
  RF_TOOLS.rmsec = rmsecClick;   // (rfCX) Removed Section
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || !D.active || !D.sheet || !RF_TOOLS[D.tool] || !D.pending || !D.host || !D.host.contains(e.target)) return;
    if (D.inline && D.inline.box.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    settle();
    RF_TOOLS[D.tool](DW.toPaper(e));
  }, true);
  // an object property that drawing-ui-panels.js assigns later: each value assigned is passed through fix first
  function onAssign(obj, key, fix) {
    var cur = obj[key];
    Object.defineProperty(obj, key, { configurable: true, enumerable: true, get: function () { return cur; }, set: function (x) { cur = fix(x); } });
    if (cur != null) cur = fix(cur);
  }
  // View Layout tab: Auxiliary View after Projected View, Break and Crop View after Detail View (SolidWorks order)
  onAssign(UI.RIBBON, 'View Layout', function (list) {
    if (!Array.isArray(list) || list._rfN) return list;
    var out = [];
    list.forEach(function (b) {
      out.push(b);
      if (b.id === 'projView') out.push({ id: 'auxView', label: 'Auxiliary\nView', run: cmdAuxiliaryView, active: function () { return D.tool === 'aux'; } });
      if (b.id === 'sectionView') out.push({ id: 'removedSection', label: 'Removed\nSection', run: cmdRemovedSection, active: function () { return D.tool === 'rmsec'; } });   // (rfCX)
      if (b.id === 'detailView') {
        out.push({ id: 'brokenOut', label: 'Broken-out\nSection', run: cmdBrokenOut, active: boActive });   // (rfAD, SolidWorks order)
        out.push({ id: 'breakView', label: 'Break', run: cmdBreakView, active: function () { return D.tool === 'brk'; } });
        out.push({ id: 'cropView', label: 'Crop\nView', run: cmdCropView, active: function () { return D.tool === 'crop'; } });
      }
      if (b.id === 'dxfExport') out.push({ id: 'dwgExport', label: 'Save as\nDWG', run: function () { exportAs('dwg'); } });   // (rfS)
    });
    Object.defineProperty(out, '_rfN', { value: true });
    return out;
  });
  // (rfAD) Annotation tab: Area Hatch/Fill after Centerline
  onAssign(UI.RIBBON, 'Annotation', function (list) {
    if (!Array.isArray(list) || list._rfAD) return list;
    var out = [];
    list.forEach(function (b) {
      out.push(b);
      if (b.id === 'autoBalloon') out.push({ id: 'magLine', label: 'Magnetic\nLine', run: cmdMagLine, active: function () { return D.tool === 'magline'; } });   // (rfAG)
      if (b.id === 'centerline') out.push({ id: 'areaHatch', label: 'Area\nHatch/Fill', run: cmdAreaHatchTool, active: function () { return D.tool === 'ahatch'; } });
      // (rfAN) Weld Symbol, Revision Symbol, Revision Cloud after the shop symbols; Hole Table after Revision Table
      if (b.stack && b.stack.some(function (q) { return q.id === 'gtol'; })) out.push({ stack: [
        { id: 'weldSymbol', label: 'Weld Symbol', run: function () { cmdSymbolAN('weld'); }, active: function () { return D.tool === 'rfansym' && D.pending && D.pending.type === 'weld'; } },
        { id: 'revisionSymbol', label: 'Revision Symbol', run: function () { cmdSymbolAN('revision'); }, active: function () { return D.tool === 'rfansym' && D.pending && D.pending.type === 'revision'; } },
        { id: 'revisionCloud', label: 'Revision Cloud', run: cmdCloud, active: function () { return D.tool === 'rfancloud'; } }
      ] }, { stack: [   // (rfCU) Datum Target, Cosmetic Thread, Dowel Pin Symbol
        { id: 'datumTarget', label: 'Datum Target', run: function () { cuSymbolPM('datumTarget'); }, active: function () { return D.tool === 'cutarget'; } },
        { id: 'cosmeticThread', label: 'Cosmetic Thread', run: function () { cmdCosmeticThread(); }, active: function () { return D.tool === 'cuthread'; } },
        { id: 'dowelPin', label: 'Dowel Pin Symbol', run: cmdDowelPin, active: function () { return D.tool === 'cudowel'; } }
      ] });
      if (b.id === 'note') out.push({ id: 'multiJogLeader', label: 'Multi-jog\nLeader', run: cmdMultiJog, active: function () { return D.tool === 'culeader'; } });   // (rfCU)
      if (b.id === 'revTable') out.push({ id: 'holeTable', label: 'Hole\nTable', run: cmdHoleTable, active: function () { return D.tool === 'holetable'; } }, { id: 'bendTable', icon: 'bendNote', label: 'Bend\nTable', run: cmdBendTable });   // (rfGT)
    });
    Object.defineProperty(out, '_rfAD', { value: true });
    return out;
  });
  // Insert ▸ Drawing View ▸ Auxiliary / Break / Crop
  onAssign(UI, 'menuHook', function (f) {
    if (typeof f !== 'function' || f._rfN) return f;
    var g = function (menus) {
      var m = f(menus);
      (m || []).forEach(function (menu) {
        // (rfS) File ▸ Save Drawing as DWG… after the DXF entry (a drawing document's File menu only)
        // (rfAL) idempotent: drawing-ui-panels.js wraps UI.menuHook a second time, which comes through here again;
        // an entry already in the menu is not added twice
        if (menu && menu.label === 'File' && Array.isArray(menu.items) && D.active) {
          var fi = [], hasF = function (l) { return menu.items.some(function (q) { return q && q.label === l; }); };
          menu.items.forEach(function (it) { fi.push(it); if (it && it.label === 'Save Drawing as DXF…' && !hasF('Save Drawing as DWG…')) fi.push({ label: 'Save Drawing as DWG…', action: function () { DW.exportAs('dwg'); } }); });
          menu.items = fi;
        }
        if (!menu || menu.label !== 'Insert' || !Array.isArray(menu.items)) return;
        var items = [], has = function (l) { return menu.items.some(function (q) { return q && q.label === l; }); };
        var add = function (l, f) { if (!has(l)) items.push({ label: l, action: f }); };
        menu.items.forEach(function (it) {
          items.push(it);
          if (it && it.label === 'Drawing View ▸ Projected') add('Drawing View ▸ Auxiliary', cmdAuxiliaryView);
          if (it && it.label === 'Drawing View ▸ Detail') { add('Drawing View ▸ Broken-out Section', cmdBrokenOut); add('Drawing View ▸ Break', cmdBreakView); add('Drawing View ▸ Crop', cmdCropView); }
          if (it && it.label === 'Annotations ▸ Centerline') add('Annotations ▸ Area Hatch/Fill', cmdAreaHatchTool);   // (rfAD)
          if (it && it.label === 'Annotations ▸ Auto Balloon') add('Annotations ▸ Magnetic Line', cmdMagLine);   // (rfAG)
          if (it && it.label === 'Annotations ▸ Geometric Tolerance…') { add('Annotations ▸ Weld Symbol…', function () { cmdSymbolAN('weld'); }); add('Annotations ▸ Revision Symbol…', function () { cmdSymbolAN('revision'); }); add('Annotations ▸ Revision Cloud', cmdCloud); add('Annotations ▸ Datum Target…', function () { cuSymbolPM('datumTarget'); }); add('Annotations ▸ Cosmetic Thread…', function () { cmdCosmeticThread(); }); add('Annotations ▸ Dowel Pin Symbol', cmdDowelPin); }   // (rfAN; rfCU)
          if (it && it.label === 'Annotations ▸ Note') add('Annotations ▸ Multi-jog Leader', cmdMultiJog);   // (rfCU)
          if (it && /^Tables ▸ (Revision|General) Table/.test(it.label || '')) { add('Tables ▸ Hole Table…', cmdHoleTable); add('Tables ▸ Bend Table…', cmdBendTable); }   // (rfGT)
        });
        if (D.active && !items.some(function (q) { return q && q.label === 'Tables ▸ Hole Table…'; })) items.push({ label: 'Tables ▸ Hole Table…', action: cmdHoleTable });
        if (D.active && !items.some(function (q) { return q && q.label === 'Tables ▸ Bend Table…'; })) items.push({ label: 'Tables ▸ Bend Table…', action: cmdBendTable });
        menu.items = items;
      });
      return m;
    };
    g._rfN = true; g._inner = f;   // (lane DW2: drawing-ui-panels.js chains to the hook it replaces through _inner)
    return g;
  });
  // anvil.drawing.auxiliaryView(parentId, { a, b, sign, x, y, label }), crop(viewId, region | null),
  // breakView(viewId, { dir, a, b, gap, style }), unbreak(viewId): one undo step each, return the summary
  if (window.anvil) onAssign(window.anvil, 'drawing', function (api) {
    if (!api || api._rfN) return api;
    api.auxiliaryView = function (parentId, opts) {
      if (!doc()) return null;
      var v;
      if (DW.cutApi) return DW.cutApi(function (dc) { return Drawing.addAuxiliaryView(dc, mesh(), parentId, opts || {}); });   // (rfDR) worked out in the worker
      try { Drawing.addAuxiliaryView(JSON.parse(JSON.stringify(doc())), mesh(), parentId, opts || {}); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
      edit(function (dc) { v = Drawing.addAuxiliaryView(dc, mesh(), parentId, opts || {}); autoInsertViews(dc, [v.id]); });
      D.sel = { kind: 'view', id: v.id };
      return api.summary();
    };
    // (rfCX) removedSection(parentId, { a: [u, v], b: [u, v], x, y, label, flip, scale, showLabel }): one undo step
    api.removedSection = function (parentId, opts) {
      if (!doc()) return null;
      var v, o = Object.assign({ fit: true }, opts || {});
      if (DW.cutApi) return DW.cutApi(function (dc) { return Drawing.addRemovedSection(dc, mesh(), parentId, o); });   // (rfDN) cut in the worker
      try { Drawing.addRemovedSection(JSON.parse(JSON.stringify(doc())), mesh(), parentId, o); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
      edit(function (dc) { v = Drawing.addRemovedSection(dc, mesh(), parentId, o); delete v.offSheet; autoInsertViews(dc, [v.id]); });
      D.sel = { kind: 'view', id: v.id };
      return api.summary();
    };
    api.crop = function (viewId, region) { return doc() && tryEdit(function (dc) { Drawing.setCrop(dc, viewId, region == null ? null : region); }) ? api.summary() : null; };
    api.breakView = function (viewId, opts) { return doc() && tryEdit(function (dc) { Drawing.addBreak(dc, viewId, opts || {}); }) ? api.summary() : null; };
    api.unbreak = function (viewId) { return doc() && tryEdit(function (dc) { Drawing.clearBreaks(dc, viewId); }) ? api.summary() : null; };
    // (rfZ) viewOptions(viewId, { dimType: 'true' | 'projected', partial: [from, to] | null, scaleWithModel, style,
    // outline }): a model view's Dimension Type, a section's Partial section / Scale with model changes, a detail's
    // circle style and Full / Jagged outline; one undo step, returns the summary (null: refused, the message shown)
    api.viewOptions = function (viewId, o) {
      o = o || {};
      return doc() && tryEdit(function (dc) {
        var v = Drawing.findView(dc, viewId);
        if (!v) throw new Error('No drawing view ' + viewId);
        if (o.dimType !== undefined) Drawing.setDimType(dc, viewId, o.dimType);
        if (o.partial !== undefined || o.scaleWithModel !== undefined) Drawing.setSectionOptions(dc, mesh(), viewId, { partial: o.partial, scaleWithModel: o.scaleWithModel });
        if (o.style !== undefined || o.outline !== undefined) Drawing.setDetailOptions(dc, viewId, { style: o.style, outline: o.outline });
      }) ? api.summary() : null;
    };
    // (rfS) smartDim(viewId, pick1, pick2 | null, at, { minmax }) -> the dimension added (Drawing.smartDim picks, view
    // model units), one undo step; dwg() -> a promise of { name, bytes } or null (no converter: the message is shown)
    api.smartDim = function (viewId, p1, p2, at, opts) {
      if (!doc()) return null;
      var w = sheetView(viewId), o = Object.assign({ scale: w ? w.scale : 1, aligned: !!(w && w.trueDims) }, opts || {}), d = Drawing.smartDim(p1, p2 || null, at || null, o);
      if (!d) return null;
      edit(function (dc) { var v = Drawing.findView(dc, viewId); if (v) v.dims = (v.dims || []).concat([d]); });
      var v2 = Drawing.findView(doc(), viewId), sd = v2 && sheetDim({ kind: 'dim', view: viewId, key: null, index: v2.dims.length - 1 });
      return sd ? { kind: sd.kind, value: sd.value, text: sd.text, index: sd.index, view: viewId } : null;
    };
    api.dwg = function () { if (!doc()) return Promise.resolve(null); settle(); if (!D.sheet) render(); return saveDWG(D.sheet); };
    // (rfAD) brokenOut(viewId, { shape, pts | a, b | c, r, depth | depthRef: { view, p } }) adds a broken-out section;
    // brokenOutEdit(viewId, id, spec | null) changes or removes one; hatchRegions(viewId) -> [{ index, p, pattern, scale,
    // angle, areaHatch }] of the laid-out view; areaHatch(viewId, index | [u, v], { pattern, scale, angle } | null) gives a
    // region its own hatch (null: the material crosshatch). One undo step each; they return the summary (null: refused)
    api.brokenOut = function (viewId, spec) { return doc() && tryEdit(function (dc) { Drawing.addBrokenOut(dc, viewId, spec || {}); }) ? api.summary() : null; };
    api.brokenOutEdit = function (viewId, id, spec) { return doc() && tryEdit(function (dc) { Drawing.setBrokenOut(dc, viewId, id, spec == null ? null : spec); }) ? api.summary() : null; };
    api.hatchRegions = function (viewId) {
      if (!doc()) return [];
      settle(); if (!D.sheet) render();
      return Drawing.hatchRegions(sheetView(viewId)).map(function (g) {
        var r = { index: g.index, key: g.key, solid: g.solid, p: g.p, pattern: g.pattern, scale: g.scale, angle: g.angle, areaHatch: g.areaHatch, body: g.body };
        if (g.part != null) r.part = g.part;
        if (g.comp != null) r.comp = g.comp;
        if (g.scope) r.scope = g.scope;
        return r;
      });
    };
    // (lane DW) areaHatch(viewId, index | [u, v] | key 'b0:r1', props | null, { apply: 'region' | 'body' | 'component' }?);
    // props { pattern, scale, angle, fill: 'hatch' | 'solid' | 'none' }
    api.areaHatch = function (viewId, which, props, opts) {
      if (!doc()) return null;
      var p = which, o = { scope: opts && (opts.apply || opts.scope) || 'region' };
      if (typeof which === 'number' || typeof which === 'string') {
        var g = api.hatchRegions(viewId).filter(function (x) { return typeof which === 'number' ? x.index === which : x.key === which; })[0];
        if (!g && typeof which === 'number') { UI.toast('No hatched region ' + which); return null; }
        if (g) { p = g.p; o.key = g.key; o.comp = g.comp; } else { p = null; o.key = which; }
      }
      return tryEdit(function (dc) { Drawing.setAreaHatch(dc, viewId, p, props || null, o); }) ? api.summary() : null;
    };
    // hatch(viewId, regionKey, { pattern, scale, angle, fill, apply }) — the same, the scope in the props
    api.hatch = function (viewId, key, props) { return api.areaHatch(viewId, key, props ? props : null, props ? { apply: props.apply } : null); };
    // areaFill({ ids } | { view, p: [u, v] }, props?) -> the new fill ({ id, view, kind, pattern, scale, angle }) or null;
    // areaFills() -> every fill; areaFillEdit(id, props | null) changes or deletes one. One undo step each
    api.areaFill = function (spec, props) {
      if (!doc()) return null;
      settle(); if (!D.sheet) render();
      var s2 = Object.assign({}, spec || {}, props || {}), w = s2.view != null ? sheetView(s2.view) : null, made = null;
      return tryEdit(function (dc) { made = Drawing.addAreaFill(dc, s2, mesh(), w && w.frame); }) ? made : null;
    };
    api.areaFills = function () { return doc() ? Drawing.areaFills(doc()) : []; };
    api.areaFillEdit = function (id, props) { return doc() && tryEdit(function (dc) { Drawing.editAreaFill(dc, id, props || null); }) ? api.summary() : null; };
    // view(viewId) -> { id, hatch(key, props), hatchRegions(), areaFill(p, props) } (a script's handle on one view)
    if (!api.view) api.view = function (viewId) {
      return { id: viewId, hatch: function (key, props) { return api.hatch(viewId, key, props); }, hatchRegions: function () { return api.hatchRegions(viewId); },
        areaFill: function (p, props) { return api.areaFill({ view: viewId, p: p }, props); } };
    };
    // (rfAG) magnetic lines: magLines() -> [{ id, view, a, b (sheet, paper), side, balloons: [index] }]; magLine(viewId,
    // { a, b } (sheet points) | { side }) adds one (-> its id); magLineEdit(id, { a, b } | { shift } | null) moves or
    // deletes one (its balloons stay put); balloonMag(viewId, index, id | null, t?) puts a balloon on a line (or off it)
    api.magLines = function () {
      if (!doc()) return [];
      settle(); if (!D.sheet) render();
      return (D.sheet.magLines || []).map(function (m) { return { id: m.id, view: m.view, a: m.a.slice(), b: m.b.slice(), side: m.side, balloons: m.balloons.slice() }; });
    };
    api.magLine = function (viewId, spec) { var ml = null; return doc() && tryEdit(function (dc) { ml = Drawing.addMagLine(dc, viewId, spec || {}); }) ? ml.id : null; };
    api.magLineEdit = function (id, spec) {
      if (!doc()) return null;
      if (spec == null) return deleteMagLine(id) ? api.summary() : null;
      settle(); if (!D.sheet) render();
      var sh = D.sheet;
      return tryEdit(function (dc) { Drawing.setMagLine(dc, id, spec, sh); }) ? api.summary() : null;
    };
    api.balloonMag = function (viewId, index, id, t) { return doc() && tryEdit(function (dc) { Drawing.balloonMag(dc, viewId, index, id == null ? null : id, t); }) ? api.summary() : null; };
    // (rfAN) holeTable(viewId, { origin: { p } | { x: { a, b }, y: { a, b } }, holes, sizes, all, tagStyle, combineTags,
    // combineSizes, prec, x, y }) -> its id; holeTableEdit(id, props | null) changes or deletes one; holeTables() -> [{ id,
    // view, box, origin, rows: [{ tag, x, y, xText, yText, size, lines, c, r }] }] of the active sheet. Weld Symbol,
    // Revision Symbol and Revision Cloud go through symbol({ type: 'weld' | 'revision' | 'revCloud', … }).
    api.holeTable = function (viewId, spec) { var t = null; return doc() && tryEdit(function (dc) { t = Drawing.addHoleTable(dc, viewId, spec || {}); }) ? t.id : null; };
    api.holeTableEdit = function (id, props) {
      if (!doc()) return null;
      if (props == null) return Drawing.findHoleTable(doc(), id) ? (deleteHoleTable(id), api.holeTables()) : null;
      return tryEdit(function (dc) { Drawing.editHoleTable(dc, id, props); }) ? api.holeTables() : null;
    };
    api.holeTables = function () {
      if (!doc()) return [];
      settle(); if (!D.sheet) render();
      return JSON.parse(JSON.stringify(D.sheet.holeTables || []));
    };
    Object.defineProperty(api, '_rfN', { value: true });
    return api;
  });
  // ------------------------------------------------------------------ rfAG: magnetic lines for balloons
  // SolidWorks' Insert ▸ Annotations ▸ Magnetic Line (Annotation tab, after Auto Balloon): click where the line starts and
  // where it ends; it belongs to the view under (or nearest) its middle and moves with it. Balloons dragged near it
  // snap onto it and spread evenly along it; drag the line to take its balloons along; click it and press Delete to
  // remove it (its balloons stay where they are). Drawn on the overlay only: no output prints it.
  function nearestView(p) {
    var w = viewAt(p), best = null, bd = Infinity;
    if (w) return w;
    (D.sheet ? D.sheet.views : []).forEach(function (x) {
      if (x.pending) return;
      var dx = Math.max(x.box.x0 - p[0], 0, p[0] - x.box.x1), dy = Math.max(x.box.y0 - p[1], 0, p[1] - x.box.y1), d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = x; }
    });
    return best;
  }
  function cmdMagLine() {
    if (D.tool === 'magline') { endTool(); return; }
    if (!doc() || !D.sheet || !D.sheet.views.length) { UI.toast('Add a drawing view first.'); return; }
    startTool('magline', { a: null, view: null });
    UI.setStatus('Magnetic Line: click where the line starts (by the view whose balloons it holds). Esc cancels.');
  }
  function magLineClick(p) {
    var P = D.pending;
    if (!P.a) {
      var w = nearestView(p);
      if (!w) { UI.setStatus('Magnetic Line: add a drawing view first.'); return; }
      P.a = p.slice(); P.view = w.view.id; P.at = p.slice();
      UI.setStatus('Magnetic Line: click where it ends (Shift: any angle; it keeps horizontal or vertical when close).');
      drawOverlay();
      return;
    }
    var b = magEnd(P.a, p), ml = null;
    if (Math.hypot(b[0] - P.a[0], b[1] - P.a[1]) < pxToPaper(4)) { UI.setStatus('Magnetic Line: click a point away from the first one.'); return; }
    var a = P.a, wm = nearestView([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), view = wm ? wm.view.id : P.view;   // (the view nearest its middle holds it)
    endTool();
    if (tryEdit(function (dc) { ml = Drawing.addMagLine(dc, view, { a: a, b: b }); })) {
      D.sel = { kind: 'magline', id: ml.id, view: view }; drawOverlay();
      UI.setStatus('Magnetic line ' + ml.id + ': drag balloons onto it, drag it to move them, Delete removes it.');
    }
    return ml;
  }
  // the second end, squared to horizontal / vertical within 5° (as SolidWorks' inferencing does)
  function magEnd(a, p) {
    var dx = p[0] - a[0], dy = p[1] - a[1], ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 180;
    if (ang < 5 || ang > 175) return [p[0], a[1]];
    if (Math.abs(ang - 90) < 5) return [a[0], p[1]];
    return p.slice();
  }
  RF_TOOLS.magline = magLineClick;
  function magAt(p) { return D.sheet ? Drawing.magLineAt(D.sheet, p, pxToPaper(5)) : null; }
  // a dragged balloon snaps to a magnetic line of its view within 10 px: { id, t } or null
  function magSnap(viewId, c) { return D.sheet ? Drawing.magLineAt(D.sheet, c, Math.max(pxToPaper(10), 1.5 * paperK()), viewId) : null; }
  // the magnetic lines (and the one being drawn) on the overlay: dashed, highlighted when selected or under the cursor
  function magOverlay(g, H, node) {
    var sw = pxToPaper(1.6), dash = pxToPaper(8) + ' ' + pxToPaper(4);
    ((D.sheet && D.sheet.magLines) || []).forEach(function (m) {
      var sel = D.sel && D.sel.kind === 'magline' && D.sel.id === m.id, hov = magHover === m.id;
      // (rfAL) a view being dragged carries its magnetic lines with it (its linework moves by liveShift until release)
      var o = DW.liveOffset ? DW.liveOffset(m.view) : [0, 0];
      node('line', { class: 'dw-mag' + (sel ? ' sel' : hov ? ' pre' : ''), x1: m.a[0] + o[0], y1: H - m.a[1] - o[1], x2: m.b[0] + o[0], y2: H - m.b[1] - o[1], 'stroke-width': sel || hov ? sw * 1.6 : sw, 'stroke-dasharray': dash, 'data-mag': m.id }, g);
    });
    var P = D.pending;
    if (D.tool === 'magline' && P && P.a && P.at) {
      var e = magEnd(P.a, P.at);
      node('line', { class: 'dw-mag pre', x1: P.a[0], y1: H - P.a[1], x2: e[0], y2: H - e[1], 'stroke-width': sw, 'stroke-dasharray': dash }, g);
      D.preview = { kind: 'magline', a: P.a.slice(), b: e };
    }
    rfANOverlay(g, H, node);   // (rfAN) hole tables, the Hole Table / Revision Cloud tools
  }
  var magDrag = null, magHover = null;
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || !D.active || !D.sheet || D.tool || !D.host || !D.host.contains(e.target) || (UI.hasPM && UI.hasPM())) return;
    if (D.inline && D.inline.box.contains(e.target)) return;
    var p = DW.toPaper(e), m = magAt(p);
    if (!m || balloonAt(p)) return;
    e.preventDefault(); e.stopPropagation();
    settle();
    D.sel = { kind: 'magline', id: m.id, view: m.view };
    magDrag = { id: m.id, start: p, last: p, moved: false };
    drawOverlay(); DW.renderTree();
    UI.setStatus('Magnetic line ' + m.id + ' — drag it to move it with its balloons, Delete removes it.');
  }, true);
  document.addEventListener('mousemove', function (e) {
    if (!magDrag) {
      if (!D.active || !D.sheet || D.tool || D.drag || !D.host || !D.host.contains(e.target)) { if (magHover) { magHover = null; drawOverlay(); } return; }
      var h = magAt(DW.toPaper(e)), id = h ? h.id : null;
      if (id !== magHover) { magHover = id; drawOverlay(); }
      return;
    }
    var p = DW.toPaper(e), md = magDrag;
    e.stopPropagation();
    if (!md.moved && Math.hypot(p[0] - md.start[0], p[1] - md.start[1]) < pxToPaper(3)) return;
    if (!md.moved) { UI.pushUndo(); md.moved = true; D.host.classList.add('dw-dragging'); }
    try { Drawing.setMagLine(doc(), md.id, { shift: [p[0] - md.last[0], p[1] - md.last[1]] }, D.sheet); } catch (err) { return; }
    md.last = p;
    queueRender(true);
  }, true);
  document.addEventListener('mouseup', function (e) {
    var md = magDrag;
    if (!md) return;
    magDrag = null;
    e.stopPropagation();
    if (D.host) D.host.classList.remove('dw-dragging');
    if (md.moved) { D.dirty = true; UI.autosave(); render(); }
  }, true);
  function deleteMagLine(id) {
    var f = doc() && Drawing.findMagLine(doc(), id);
    if (!f) return false;
    settle(); if (!D.sheet) render();
    var sh = D.sheet;
    edit(function (dc) { Drawing.setMagLine(dc, id, null, sh); });
    if (D.sel && D.sel.kind === 'magline') D.sel = null;
    drawOverlay();
    UI.setStatus('Magnetic line ' + id + ' deleted; its balloons stay where they were.');
    return true;
  }
  // ------------------------------------------------------------------ rfGT: Bend Table, Autodimension
  // Insert ▸ Tables ▸ Bend Table / Annotation ▸ Bend Table: the flat pattern view selected (or the sheet's only one)
  // switches from bend notes to tags A, B, C and the table. SolidWorks asks for a flat pattern view the same way.
  function cmdBendTable() {
    var flats = (D.sheet ? D.sheet.views : []).filter(function (w) { return w.view.kind === 'flat'; });
    if (!flats.length) { UI.toast('Bend Table: this sheet has no flat pattern view. Add one with Model View first.'); return false; }
    var sel = D.sel && D.sel.kind === 'view' ? flats.filter(function (w) { return w.view.id === D.sel.id; })[0] : null;
    var w = sel || (flats.length === 1 ? flats[0] : null);
    if (!w) { UI.toast('Bend Table: select a flat pattern view first.'); return false; }
    setFlatViewProps(w.view.id, { bendNotes: 'table' });
    D.sel = { kind: 'view', id: w.view.id };
    UI.setStatus('Bend Table on ' + w.view.name + '. Double-click the view for its columns.');
    return true;
  }
  // Tools ▸ Dimensions ▸ Autodimension: the view selected (or clicked while the PropertyManager is open), All entities
  // in view; Horizontal and Vertical Dimensions each with their Scheme, Origin and Placement, as the sketch's PM
  var GT_SCHEME = [['baseline', 'Baseline'], ['chain', 'Chain'], ['ordinate', 'Ordinate']];
  function gtOrtho(w) { return !!(w && w.proj && w.proj.lines && !w.proj.pending && (w.ortho || w.view.kind === 'flat')); }
  function cmdAutodimension() {
    if (D.tool === 'autodim') { endToolPM(); return; }
    if (!doc() || !D.sheet || !D.sheet.views.length) { UI.toast('Add a drawing view first.'); return; }
    var w0 = D.sel && D.sel.kind === 'view' ? sheetView(D.sel.id) : D.sheet.views.length === 1 ? D.sheet.views[0] : null;
    if (!gtOrtho(w0)) w0 = null;
    toolPM({ title: 'Autodimension', icon: 'dim', command: 'autodimension',
      message: 'Click the view to dimension, set each direction\'s scheme, then ✓. Every edge and hole position gets a dimension from the origin side.',
      values: { h: true, hScheme: 'baseline', hOrigin: 'left', hPlace: 'above', v: true, vScheme: 'baseline', vOrigin: 'bottom', vPlace: 'right' },
      groups: [
        { title: 'Horizontal Dimensions', fields: [{ type: 'check', key: 'h', label: 'Horizontal dimensions' }, { type: 'select', key: 'hScheme', label: 'Scheme', options: GT_SCHEME },
          { type: 'select', key: 'hOrigin', label: 'Origin', options: [['left', 'Left edge'], ['right', 'Right edge']] }, { type: 'select', key: 'hPlace', label: 'Dimension placement', options: [['above', 'Above view'], ['below', 'Below view']] }] },
        { title: 'Vertical Dimensions', fields: [{ type: 'check', key: 'v', label: 'Vertical dimensions' }, { type: 'select', key: 'vScheme', label: 'Scheme', options: GT_SCHEME },
          { type: 'select', key: 'vOrigin', label: 'Origin', options: [['bottom', 'Bottom edge'], ['top', 'Top edge']] }, { type: 'select', key: 'vPlace', label: 'Dimension placement', options: [['right', 'Right of view'], ['left', 'Left of view']] }] }
      ],
      onOK: function (v) {
        var w = D.pending && D.pending.view != null ? sheetView(D.pending.view) : null;
        if (!w) { UI.toast('Autodimension: click an orthographic view first.'); return false; }
        var spec = { scale: w.scale, units: units(), h: v.h ? { scheme: v.hScheme, origin: v.hOrigin, place: v.hPlace } : null, v: v.v ? { scheme: v.vScheme, origin: v.vOrigin, place: v.vPlace } : null }, made = 0;
        if (!tryEdit(function (dc) { made = Drawing.autodimension(dc, w.view.id, w.proj, spec); })) return false;
        if (!made) { UI.toast('Autodimension: that view has nothing to dimension in those directions.'); return false; }
        UI.setStatus('Autodimension: ' + made + ' dimensions on ' + w.view.name + '.');
      } }, 'autodim', { view: w0 ? w0.view.id : null });
    UI.setStatus(w0 ? 'Autodimension: ' + w0.view.name + ' selected. Set the schemes, then ✓, or click another view.' : 'Autodimension: click an orthographic view.');
  }
  function gtAutodimClick(p) {
    var w = DW.viewAt ? DW.viewAt(p) : null;
    if (!gtOrtho(w)) { UI.setStatus('Autodimension: click an orthographic view.'); return; }
    D.pending.view = w.view.id; D.sel = { kind: 'view', id: w.view.id }; drawOverlay(); DW.renderTree();
    UI.setStatus('Autodimension: ' + w.view.name + ' selected. Set the schemes, then ✓.');
  }
  RF_TOOLS.autodim = gtAutodimClick;
  DW.cmdAutodimension = cmdAutodimension; DW.cmdBendTable = cmdBendTable;

  // ------------------------------------------------------------------ rfAN: Hole Table, Revision Symbol / Cloud, Weld Symbol
  // Hole Table (Annotation ▸ Hole Table, Insert ▸ Tables ▸ Hole Table): the PropertyManager's Datum (click a vertex for
  // the origin, or an X-axis edge then a Y-axis edge), Holes (click hole edges; Select all holes of the same size adds
  // every hole of that diameter; All holes in the view) and the tag / combine options; ✓ makes the table beside the
  // view (drag it anywhere; double-click for its properties; Delete removes it). Works on flat-pattern views too.
  var HT_PREC = [['', 'Document'], ['0', '0'], ['1', '.1'], ['2', '.12'], ['3', '.123'], ['4', '.1234']];
  function htGroups(editing) {
    var g = [
      { title: 'Tag', fields: [{ type: 'select', key: 'tagStyle', label: 'Tags', options: [['alpha', 'A1, A2 … B1 (a letter per size)'], ['numeric', '1, 2, 3 …']] },
        { type: 'check', key: 'combineTags', label: 'Combine same tags' }, { type: 'check', key: 'combineSizes', label: 'Combine same sizes' }] },
      { title: 'Hole Location Precision', fields: [{ type: 'select', key: 'prec', label: 'X / Y LOC', options: HT_PREC }] }
    ];
    if (!editing) g.unshift({ title: 'Holes', fields: [{ type: 'check', key: 'sameSize', label: 'Select all holes of the same size' }, { type: 'check', key: 'all', label: 'All holes in the view' }] });
    return g;
  }
  function htProps(v) { return { tagStyle: v.tagStyle, combineTags: !!v.combineTags, combineSizes: !!v.combineSizes, prec: v.prec === '' ? null : +v.prec }; }
  function cmdHoleTable() {
    if (D.tool === 'holetable') { endToolPM(); return; }
    if (!doc() || !D.sheet || !D.sheet.views.length) { UI.toast('Add a drawing view first.'); return; }
    var vals = { sameSize: true, all: false, tagStyle: 'alpha', combineTags: false, combineSizes: false, prec: '' };
    toolPM({ title: 'Hole Table', icon: 'holeTable', command: 'holeTable',
      message: 'Datum: click a vertex of a view for the origin, or an edge for the X axis and then one for the Y axis. Holes: click hole edges (circles) in the same view. ✓ places the table beside the view.',
      values: vals, groups: htGroups(false),
      onChange: function (v) { if (D.pending) D.pending.values = v; },
      onOK: function (v) {
        var P = D.pending;
        if (!P || !P.origin) { UI.toast('Hole Table: pick the origin first (a vertex, or an X-axis and a Y-axis edge).'); return false; }
        if (!v.all && !P.holes.length && !P.sizes.length) { UI.toast('Hole Table: pick the holes (or tick All holes in the view).'); return false; }
        var spec = Object.assign({ origin: P.origin, holes: P.holes, sizes: P.sizes, all: !!v.all }, htProps(v)), made = null;
        if (!tryEdit(function (dc) { made = Drawing.addHoleTable(dc, P.view, spec); })) return false;
        D.sel = { kind: 'holetable', id: made.id };
        var st = D.sheet && (D.sheet.holeTables || []).filter(function (t) { return t.id === made.id; })[0];
        UI.setStatus('Hole Table: ' + (st ? st.rows.length : 0) + ' holes. Drag the table to move it, double-click it for its properties.');
      } }, 'holetable', { view: null, origin: null, xEdge: null, holes: [], sizes: [], values: vals });
    UI.setStatus('Hole Table: click a vertex (origin) or the X-axis edge of a view.');
  }
  function holeTableClick(p) {
    var P = D.pending, ent = entityAt(p);
    if (!ent || ent.arc || ent.ellipse) { UI.setStatus('Hole Table: click a vertex, an edge or a hole edge of a view.'); return; }
    if (P.view != null && ent.view !== P.view) { UI.setStatus('Hole Table: the origin and the holes must be in the same view.'); return; }
    var w = sheetView(ent.view);
    if (!w) return;
    P.view = ent.view;
    if (ent.circle) {
      var hole = Drawing.viewHoles(w, mesh()).filter(function (h) { return Math.hypot(h.c[0] - ent.mc.c[0], h.c[1] - ent.mc.c[1]) <= 1e-6 * (1 + Math.abs(h.c[0]) + Math.abs(h.c[1])); })[0];
      if (!hole) { UI.setStatus('Hole Table: that circle is not a hole.'); return; }
      if (P.values.sameSize) { var d = 2 * hole.r; if (!P.sizes.some(function (x) { return Math.abs(x - d) <= d * 1e-6; })) P.sizes.push(d); }
      else if (!P.holes.some(function (h) { return Math.hypot(h.c[0] - hole.c[0], h.c[1] - hole.c[1]) < 1e-9; })) P.holes.push({ c: hole.c.slice(), r: hole.r });
      drawOverlay();
      UI.setStatus('Hole Table: ' + htPickCount(P, w) + ' hole(s) picked' + (P.origin ? '' : '; now the origin (a vertex or the X-axis edge)') + '. ✓ places the table.');
      return;
    }
    // a vertex: an end of the edge within 8 px; else the edge is an axis
    var tol = pxToPaper(8), da = Math.hypot(p[0] - ent.a[0], p[1] - ent.a[1]), db = Math.hypot(p[0] - ent.b[0], p[1] - ent.b[1]);
    if (!P.xEdge && Math.min(da, db) <= tol) { P.origin = { p: (da <= db ? ent.la : ent.lb).slice() }; }
    else if (!P.xEdge) { P.xEdge = { a: ent.la.slice(), b: ent.lb.slice() }; P.origin = null; drawOverlay(); UI.setStatus('Hole Table: X axis picked; now click the Y-axis edge.'); return; }
    else {
      var e1 = P.xEdge, t1 = [e1.b[0] - e1.a[0], e1.b[1] - e1.a[1]], t2 = [ent.lb[0] - ent.la[0], ent.lb[1] - ent.la[1]];
      if (Math.abs(t1[0] * t2[1] - t1[1] * t2[0]) <= 1e-9 * Math.hypot(t1[0], t1[1]) * Math.hypot(t2[0], t2[1])) { UI.setStatus('Hole Table: the Y axis cannot be parallel to the X axis; click another edge.'); return; }
      P.origin = { x: e1, y: { a: ent.la.slice(), b: ent.lb.slice() } }; P.xEdge = null;
    }
    drawOverlay();
    UI.setStatus('Hole Table: origin set. Click the holes (or tick All holes in the view), then ✓.');
  }
  function htPickCount(P, w) {
    var n = P.holes.length;
    if (P.sizes.length && w) n += Drawing.viewHoles(w, mesh()).filter(function (h) { return P.sizes.some(function (d) { return Math.abs(2 * h.r - d) <= d * 1e-6; }) && !P.holes.some(function (q) { return Math.hypot(q.c[0] - h.c[0], q.c[1] - h.c[1]) < 1e-9; }); }).length;
    return n;
  }
  RF_TOOLS.holetable = holeTableClick;
  function holeTableAt(p) { return D.sheet ? Drawing.holeTableAt(D.sheet, p) : null; }
  function cmdHoleTableProps(id) {
    var t = Drawing.findHoleTable(doc(), id);
    if (!t) return;
    D.sel = { kind: 'holetable', id: id };
    openDrawingPM({ title: 'Hole Table', icon: 'holeTable', command: 'holeTable',
      message: 'Hole Table' + id + ': its tags, merged cells and the X / Y LOC precision. OK applies (one undo step).',
      values: { tagStyle: t.tagStyle || 'alpha', combineTags: !!t.combineTags, combineSizes: !!t.combineSizes, prec: t.prec != null ? String(t.prec) : '' }, groups: htGroups(true),
      onOK: function (v) { if (tryEdit(function (dc) { Drawing.editHoleTable(dc, id, htProps(v)); })) UI.setStatus('Hole Table changed.'); } });
  }
  function holeTableMenu(id) {
    var t = Drawing.findHoleTable(doc(), id);
    return [
      { label: 'Properties…', action: function () { cmdHoleTableProps(id); } },
      { label: 'Follow the view (move beside it)', disabled: !t || t.x == null, action: function () { tryEdit(function (dc) { Drawing.editHoleTable(dc, id, { x: null }); }); } },
      { label: 'Delete', key: 'Del', action: function () { deleteHoleTable(id); } }
    ];
  }
  function deleteHoleTable(id) {
    edit(function (dc) { Drawing.deleteHoleTable(dc, id); });
    if (D.sel && D.sel.kind === 'holetable') D.sel = null;
    drawOverlay(); UI.setStatus('Hole Table deleted.');
    return true;
  }
  // the hole table's mouse: select / drag it (no tool running), double-click for its properties, right-click menu
  var htDrag = null, htHover = null;
  function htEvent(e) { return D.active && D.sheet && D.host && D.host.contains(e.target) && !(D.inline && D.inline.box.contains(e.target)); }
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || !htEvent(e) || D.tool || D.formatEdit || (UI.hasPM && UI.hasPM())) return;
    var p = DW.toPaper(e), t = holeTableAt(p);
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    settle();
    D.sel = { kind: 'holetable', id: t.id };
    htDrag = { id: t.id, start: p, x0: t.box.x0, y0: t.box.y1, moved: false };
    drawOverlay(); DW.renderTree();
    UI.setStatus('Hole Table' + t.id + ' (' + t.rows.length + ' holes) — drag to move it, double-click for its properties, Delete removes it.');
  }, true);
  document.addEventListener('mousemove', function (e) {
    if (!htDrag) {
      if (!htEvent(e) || D.tool || D.drag) { if (htHover) { htHover = null; drawOverlay(); } return; }
      var h = holeTableAt(DW.toPaper(e)), id = h ? h.id : null;
      if (id !== htHover) { htHover = id; drawOverlay(); }
      return;
    }
    var p = DW.toPaper(e), dg = htDrag;
    e.stopPropagation();
    if (!dg.moved && Math.hypot(p[0] - dg.start[0], p[1] - dg.start[1]) < pxToPaper(3)) return;
    if (!dg.moved) { UI.pushUndo(); dg.moved = true; D.host.classList.add('dw-dragging'); }
    Drawing.moveHoleTable(doc(), dg.id, dg.x0 + p[0] - dg.start[0], dg.y0 + p[1] - dg.start[1]);
    queueRender(true);
  }, true);
  document.addEventListener('mouseup', function (e) {
    var dg = htDrag;
    if (!dg) return;
    htDrag = null;
    e.stopPropagation();
    if (D.host) D.host.classList.remove('dw-dragging');
    if (dg.moved) { D.dirty = true; UI.autosave(); render(); }
  }, true);
  document.addEventListener('dblclick', function (e) {
    if (!htEvent(e) || D.tool) return;
    var t = holeTableAt(DW.toPaper(e));
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    cmdHoleTableProps(t.id);
  }, true);
  document.addEventListener('contextmenu', function (e) {
    if (!htEvent(e) || D.formatEdit) return;
    var t = holeTableAt(DW.toPaper(e));
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    D.sel = { kind: 'holetable', id: t.id }; drawOverlay(); DW.renderTree();
    UI.showMenu(e.clientX, e.clientY, holeTableMenu(t.id));
  }, true);
  // the overlay: the hole table under the cursor / selected, the Hole Table tool's picks, the Revision Cloud being drawn
  function rfANOverlay(g, H, node) {
    var sw = pxToPaper(1.2), pad = 2 * paperK();
    ((D.sheet && D.sheet.holeTables) || []).forEach(function (t) {
      var sel = D.sel && D.sel.kind === 'holetable' && D.sel.id === t.id, hov = htHover === t.id;
      if (!t.box || !(sel || hov)) return;
      node('rect', { class: 'dw-dbox' + (sel ? ' sel' : ''), x: t.box.x0 - pad / 2, y: H - t.box.y1 - pad / 2, width: t.box.x1 - t.box.x0 + pad, height: t.box.y1 - t.box.y0 + pad, 'stroke-width': sw }, g);
    });
    var P = D.pending;
    if (D.tool === 'holetable' && P && P.view != null) {
      var w = sheetView(P.view);
      if (w) {
        var picked = P.holes.slice();
        if (P.sizes.length) Drawing.viewHoles(w, mesh()).forEach(function (h) { if (P.sizes.some(function (d) { return Math.abs(2 * h.r - d) <= d * 1e-6; })) picked.push(h); });
        picked.forEach(function (h) { var q = w.toSheet(h.c); node('circle', { class: 'dw-hot', cx: q[0], cy: H - q[1], r: h.r * w.scale, 'stroke-width': pxToPaper(3) }, g); });
        var ax = P.xEdge || (P.origin && P.origin.x);
        [ax, P.origin && P.origin.y].forEach(function (e) { if (e) { var a = w.toSheet(e.a), b = w.toSheet(e.b); node('line', { class: 'dw-hot', x1: a[0], y1: H - a[1], x2: b[0], y2: H - b[1], 'stroke-width': pxToPaper(3) }, g); } });
        if (P.origin && P.origin.p) { var o = w.toSheet(P.origin.p); node('circle', { class: 'dw-hot', cx: o[0], cy: H - o[1], r: pxToPaper(5), 'stroke-width': pxToPaper(2.5) }, g); }
      }
    }
    if (D.tool === 'rfancloud' && P && P.pts && P.pts.length) {
      var pts = P.pts.concat(P.at ? [P.at] : []), shp = P.values.shape;
      if ((shp === 'rect' || shp === 'ellipse') && pts.length >= 2) {
        var a0 = pts[0], b0 = pts[pts.length - 1];
        if (shp === 'rect') node('rect', { class: 'dw-cut', x: Math.min(a0[0], b0[0]), y: H - Math.max(a0[1], b0[1]), width: Math.abs(b0[0] - a0[0]), height: Math.abs(b0[1] - a0[1]), fill: 'none', 'stroke-width': pxToPaper(1.5) }, g);
        else node('ellipse', { class: 'dw-cut', cx: (a0[0] + b0[0]) / 2, cy: H - (a0[1] + b0[1]) / 2, rx: Math.abs(b0[0] - a0[0]) / 2, ry: Math.abs(b0[1] - a0[1]) / 2, fill: 'none', 'stroke-width': pxToPaper(1.5) }, g);
      } else node('polyline', { class: 'dw-cut', points: pts.map(function (q) { return q[0] + ',' + (H - q[1]); }).join(' '), fill: 'none', 'stroke-width': pxToPaper(1.5) }, g);
    }
    if (D.tool === 'rfansym' && P && P.tip && P.at) node('line', { class: 'dw-cut', x1: P.tip[0], y1: H - P.tip[1], x2: P.at[0], y2: H - P.at[1], 'stroke-width': pxToPaper(1.5) }, g);
  }
  // pointer position for the previews of the rfAN tools
  document.addEventListener('mousemove', function (e) {
    if (!D.active || !D.pending || !(D.tool === 'rfancloud' || D.tool === 'rfansym') || !D.host || !D.host.contains(e.target)) return;
    var p = DW.toPaper(e), P = D.pending;
    P.at = p;
    if (D.tool === 'rfancloud' && P.drawing) { var l = P.pts[P.pts.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > pxToPaper(4)) P.pts.push(p); }
    drawOverlay();
  }, true);

  // Revision Symbol / Weld Symbol: PropertyManager, then (with a leader) the arrow point and the place; ✓ / Esc ends.
  // Revision Cloud: Rectangle / Ellipse (two corners), Irregular Polygon (click the corners, click the first one or ✓
  // to close it), Freehand (press, draw, release).
  var RF_SYM = {
    revision: { title: 'Revision Symbol', icon: 'revisionSymbol' },
    weld: { title: 'Weld Symbol', icon: 'weldSymbol' },
    revCloud: { title: 'Revision Cloud', icon: 'revisionCloud' }
  };
  function revOptions() {
    var rows = (doc().revisions && doc().revisions.rows) || [];
    return rows.length ? rows.map(function (r) { return [String(r.rev), String(r.rev) + (r.description ? ' — ' + r.description : '')]; }) : [['A', 'A (no Revision Table yet)']];
  }
  function weldValues(s) {
    s = s || {}; var a = s.arrow || {}, o = s.other || {};
    return { aType: s.id ? a.type || 'none' : 'fillet', aSize: a.size || '', aLen: a.length || '', oType: o.type || 'none', oSize: o.size || '', oLen: o.length || '', allAround: !!s.allAround, field: !!s.field, tail: s.tail || '' };
  }
  function weldSpec(v) {
    return { arrow: v.aType === 'none' ? null : { type: v.aType, size: v.aSize, length: v.aLen }, other: v.oType === 'none' ? null : { type: v.oType, size: v.oSize, length: v.oLen },
      allAround: !!v.allAround, field: !!v.field, tail: v.tail };
  }
  function symGroupsAN(type, editing) {
    if (type === 'revision') return [{ title: 'Revision', fields: [{ type: 'select', key: 'rev', label: 'Revision (Revision Table row)', options: revOptions() }] },
      { title: 'Leader', fields: [{ type: 'check', key: 'leader', label: editing ? 'Leader (drag its arrow on the sheet)' : 'Leader: first click the arrow point, then the symbol' }] }];
    if (type === 'revCloud') return [{ title: 'Cloud Shape', fields: [{ type: 'select', key: 'shape', label: 'Shape', options: Drawing.CLOUD_SHAPES }, { type: 'number', key: 'arc', label: 'Maximum arc radius (mm on paper)', min: 0.5 }] }];
    return [
      { title: 'Arrow Side (below the line)', fields: [{ type: 'select', key: 'aType', label: 'Symbol', options: Drawing.WELD_TYPES }, { type: 'text', key: 'aSize', label: 'Size (left)' }, { type: 'text', key: 'aLen', label: 'Length-pitch (right)' }] },
      { title: 'Other Side (above the line)', fields: [{ type: 'select', key: 'oType', label: 'Symbol', options: Drawing.WELD_TYPES }, { type: 'text', key: 'oSize', label: 'Size (left)' }, { type: 'text', key: 'oLen', label: 'Length-pitch (right)' }] },
      { title: 'Options', fields: [{ type: 'check', key: 'allAround', label: 'Weld all around' }, { type: 'check', key: 'field', label: 'Field weld (flag)' }, { type: 'text', key: 'tail', label: 'Tail (process / spec)' }] }
    ];
  }
  function symSpecAN(type, v) {
    if (type === 'revision') { var rr = Drawing.revRow(doc(), { rev: v.rev }); return { rev: v.rev, row: rr && rr.id != null ? rr.id : null }; }
    if (type === 'revCloud') return { arc: +v.arc > 0 ? +v.arc : null };
    return weldSpec(v);
  }
  function cmdSymbolAN(type, id) {
    var M = RF_SYM[type];
    if (id != null) {
      var s = Drawing.findSymbol(doc(), id);
      if (!s) return;
      var vals = type === 'weld' ? weldValues(s) : type === 'revision' ? { rev: s.rev, leader: !!s.leader } : { shape: s.shape, arc: s.arc || 3 };
      openDrawingPM({ title: M.title, icon: M.icon, command: type, message: Drawing.symbolText(s, doc()), values: vals, groups: symGroupsAN(type, true),
        onOK: function (v) {
          var spec = symSpecAN(type, v);
          if (type === 'revCloud' && v.shape !== s.shape) UI.toast('A cloud keeps its shape; draw a new one for another shape.');
          if (type === 'revision') { if (!v.leader) spec.leader = null; else if (!s.leader) spec.leader = [s.p[0] - 12 * paperK(), s.p[1] - 8 * paperK()]; }
          if (tryEdit(function (dc) { Drawing.editSymbol(dc, id, spec); })) UI.setStatus(M.title + ' changed.');
        } });
      return;
    }
    if (type === 'revCloud') { cmdCloud(); return; }
    var tool = 'rfansym';
    if (D.tool === tool && D.pending && D.pending.type === type) { endToolPM(); return; }
    var v0 = type === 'weld' ? weldValues(null) : { rev: Drawing.latestRev(doc()) || 'A', leader: true };
    toolPM({ title: M.title, icon: M.icon, command: type, values: v0, groups: symGroupsAN(type, false),
      message: type === 'weld' ? 'Set the weld, then click the joint (the arrow point) and where the reference line starts. Esc or ✓ ends.' : 'Pick the revision, then click the point the leader touches and where the triangle goes. Esc or ✓ ends.',
      onChange: function (v) { if (D.pending) { D.pending.values = v; if (type === 'revision' && !v.leader) D.pending.tip = null; } } }, tool, { type: type, values: v0, tip: null });
    UI.setStatus(M.title + ': click the point the arrow touches.');
  }
  function symClickAN(p) {
    var P = D.pending, v = P.values, M = RF_SYM[P.type];
    var lead = P.type === 'weld' || v.leader;
    if (lead && !P.tip) { P.tip = p; UI.setStatus(M.title + ': now click where the ' + (P.type === 'weld' ? 'reference line starts' : 'symbol goes') + '.'); return; }
    var spec = Object.assign({ type: P.type, p: p }, symSpecAN(P.type, v)), made = null;
    if (P.tip) spec.leader = P.tip;
    P.tip = null; P.at = null;
    if (!tryEdit(function (dc) { made = Drawing.addSymbol(dc, spec); })) return;
    D.sel = { kind: 'symbol', id: made.id };
    UI.setStatus(Drawing.symbolText(made, doc()) + ' placed — click for the next one, Esc ends.');
    drawOverlay();
  }
  RF_TOOLS.rfansym = symClickAN;
  function cmdCloud() {
    if (D.tool === 'rfancloud') { endToolPM(); return; }
    var v0 = { shape: 'rect', arc: 3 };
    toolPM({ title: 'Revision Cloud', icon: 'revisionCloud', command: 'revCloud', values: v0, groups: symGroupsAN('revCloud', false),
      message: 'Rectangle / Ellipse: click two opposite corners. Irregular Polygon: click the corners, then the first one again (or ✓). Freehand: press, draw, release.',
      onChange: function (v) { if (D.pending) { D.pending.values = v; D.pending.pts = []; } },
      onOK: function () { var P = D.pending; if (P && P.values.shape === 'polygon' && P.pts.length >= 3) cloudMake(P.pts.slice()); } }, 'rfancloud', { values: v0, pts: [], at: null });
    UI.setStatus('Revision Cloud: click the first corner.');
  }
  function cloudMake(pts) {
    var P = D.pending, v = P.values, spec = { type: 'revCloud', shape: v.shape, arc: +v.arc > 0 ? +v.arc : null }, made = null;
    if (v.shape === 'rect' || v.shape === 'ellipse') { spec.a = pts[0]; spec.b = pts[pts.length - 1]; } else spec.points = pts;
    P.pts = []; P.drawing = false;
    if (!tryEdit(function (dc) { made = Drawing.addSymbol(dc, spec); })) return;
    D.sel = { kind: 'symbol', id: made.id };
    drawOverlay();
    UI.setStatus('Revision Cloud placed — draw the next one, Esc ends.');
  }
  function cloudClick(p) {
    var P = D.pending, shp = P.values.shape;
    if (shp === 'freehand') { P.pts = [p]; P.drawing = true; return; }
    if (shp === 'rect' || shp === 'ellipse') {
      if (!P.pts.length) { P.pts = [p]; UI.setStatus('Revision Cloud: click the opposite corner.'); return; }
      if (Math.abs(p[0] - P.pts[0][0]) < pxToPaper(4) || Math.abs(p[1] - P.pts[0][1]) < pxToPaper(4)) { UI.setStatus('Revision Cloud: click a corner away from the first one.'); return; }
      cloudMake([P.pts[0], p]);
      return;
    }
    if (P.pts.length >= 3 && Math.hypot(p[0] - P.pts[0][0], p[1] - P.pts[0][1]) <= pxToPaper(8)) { cloudMake(P.pts.slice()); return; }
    P.pts.push(p);
    UI.setStatus('Revision Cloud: ' + P.pts.length + ' corner(s); click the first one (or ✓) to close it.');
    drawOverlay();
  }
  RF_TOOLS.rfancloud = cloudClick;
  // ------------------------------------------------------------------ lane CT: Angular Running and Path Length Dimension
  // Angular Running Dimension (Smart Dimension flyout, Tools ▸ Dimensions): click the 0° line in an orthographic view,
  // then lines or holes round its vertex; the first one places the set (Drawing.addAngularRunning, one undo step), the
  // next ones join it, as Ordinate Dimension does (a value already in the set is refused). ✓ or Esc ends.
  var AR_NAME = 'Angular Running Dimension', PL_NAME = 'Path Length Dimension';
  function cmdAngularRunning() {
    if (D.tool === 'angrun') { endToolPM(); return; }
    if (D.tool && UI.hasPM && UI.hasPM()) UI.pmCancel();
    toolPM({
      title: AR_NAME, icon: 'angRunDim', command: 'angrun', values: {}, groups: [],
      message: 'Click the 0° line in an orthographic view, then each line or hole to measure round its vertex. ✓ ends.'
    }, 'angrun', { base: null, baseEnt: null, view: null, dim: null });
    UI.setStatus(AR_NAME + ': click the base line (0°) in an orthographic view. Esc ends.');
  }
  function angRunClick(p) {
    var ent = entityAt(p), P = D.pending;
    if (!ent || ent.arc) { UI.setStatus(AR_NAME + ': click a straight edge or a hole of an orthographic view.'); return; }
    if (!P.base) {
      if (!ent.la) { UI.setStatus(AR_NAME + ': the base (0°) is a straight edge.'); return; }
      P.base = entRef(ent); P.baseEnt = ent; P.view = ent.view; drawOverlay();
      UI.setStatus(AR_NAME + ': base picked; now click the lines or holes to measure round its vertex. ✓ ends.');
      return;
    }
    if (ent.view !== P.view) { UI.setStatus(AR_NAME + ': stay in the view of the base.'); return; }
    var ref = entRef(ent);
    if (!P.dim) {
      var spec = { base: P.base, refs: [ref] };
      try { Drawing.addAngularRunning(JSON.parse(JSON.stringify(doc())), P.view, spec); } catch (err) { UI.setStatus(AR_NAME + ': ' + err.message + '.'); return; }
      edit(function (dc) { Drawing.addAngularRunning(dc, P.view, spec); });
      P.dim = { view: P.view, index: Drawing.findView(doc(), P.view).dims.length - 1 };
    } else {
      var v = Drawing.findView(doc(), P.dim.view), dd = v && v.dims[P.dim.index];
      if (!dd) return;
      var had = [0].concat(dd.values || []);
      dd.refs.push(Drawing.refFrom(ref)); Drawing.angRunMeasure(dd);
      var nv = dd.values[dd.values.length - 1];
      if (had.some(function (x) { return Math.abs(x - nv) <= 1e-6; })) {
        dd.refs.pop(); Drawing.angRunMeasure(dd);
        UI.setStatus(AR_NAME + ': ' + Drawing.ctAngleText(nv) + ' is in the set already — click another line or hole, ✓ ends.');
        return;
      }
      UI.autosave(); render();
    }
    var sd = D.sheet.dims.filter(function (x) { return x.view === P.dim.view && x.index === P.dim.index; })[0];
    UI.setStatus(AR_NAME + ': ' + (sd ? sd.text : '') + ' — click more, ✓ ends.');
  }
  // Path Length Dimension: click the lines and arcs of a chain (each meets one picked before it end to end; a second
  // click takes one off), then click where the value goes: one undo step (Drawing.addPathLength); ✓ places a picked
  // chain beside its first edge and ends. The tool stays on for the next chain; Esc ends.
  function cmdPathLength() {
    if (D.tool === 'pathlen') { endToolPM(); return; }
    if (D.tool && UI.hasPM && UI.hasPM()) UI.pmCancel();
    toolPM({
      title: PL_NAME, icon: 'pathLengthDim', command: 'pathlen', values: {}, groups: [],
      message: 'Click the lines and arcs of a chain in an orthographic view, end to end, then click where the value goes. ✓ places it beside the first edge.',
      onOK: function () { placePath(null); }
    }, 'pathlen', { refs: [], keys: [], hl: [], view: null });
    UI.setStatus(PL_NAME + ': click the lines and arcs of a chain. Esc ends.');
  }
  function pathPick(ent) {
    if (ent.arc) return { c: ent.ma.c.slice(), r: ent.ma.r, a0: ent.ma.a0, a1: ent.ma.a1 };
    if (ent.circle) return { c: ent.mc.c.slice(), r: ent.mc.r };
    return { a: ent.la.slice(), b: ent.lb.slice() };
  }
  function pathLenClick(p) {
    var ent = entityAt(p), P = D.pending;
    if (!ent || ent.ellipse) {
      if (P.refs.length) { placePath(p); return; }
      UI.setStatus(PL_NAME + ': click a line or arc of an orthographic view.');
      return;
    }
    if (P.view != null && ent.view !== P.view) { UI.setStatus(PL_NAME + ': stay in the view of the first edge.'); return; }
    var r = pathPick(ent), key = JSON.stringify(r), at = P.keys.indexOf(key);
    if (at >= 0) { P.refs.splice(at, 1); P.keys.splice(at, 1); P.hl.splice(at, 1); if (!P.refs.length) P.view = null; }
    else {
      var trial = P.refs.concat([r]).map(Drawing.pathRefFrom);
      if (Drawing.pathChained(trial) >= 0) { UI.setStatus(PL_NAME + ': that edge does not join the chain end to end.'); return; }
      P.refs.push(r); P.keys.push(key); P.hl.push(ent); P.view = ent.view;
    }
    drawOverlay();
    var n = P.refs.length;
    UI.setStatus(n ? PL_NAME + ': ' + n + ' edge' + (n === 1 ? '' : 's') + ', ' + Drawing.numText(Drawing.pathLengthOf(P.refs.map(Drawing.pathRefFrom)), units()) + ' — click more, or click where the value goes.'
      : PL_NAME + ': click the lines and arcs of a chain. Esc ends.');
  }
  function placePath(p) {
    var P = D.pending;
    if (D.tool !== 'pathlen' || !P || !P.refs.length) return null;
    var viewId = P.view, w = sheetView(viewId), spec = { refs: P.refs.slice() }, d = null;
    if (p && w) { var m = w.toSheet(Drawing.pathRefMid(Drawing.pathRefFrom(spec.refs[0]))); spec.lead = [p[0] - m[0], p[1] - m[1]]; }
    try { Drawing.addPathLength(JSON.parse(JSON.stringify(doc())), viewId, spec); } catch (err) { UI.setStatus(PL_NAME + ': ' + err.message + '.'); return null; }
    edit(function (dc) { d = Drawing.addPathLength(dc, viewId, spec); });
    P.refs = []; P.keys = []; P.hl = []; P.view = null;
    var idx = Drawing.findView(doc(), viewId).dims.length - 1, sd = sheetDim({ kind: 'dim', view: viewId, key: null, index: idx });
    drawOverlay();
    UI.setStatus('Path length ' + (sd ? sd.text : '') + ' added. Click the next chain, Esc ends.');
    return d;
  }
  RF_TOOLS.angrun = angRunClick; RF_TOOLS.pathlen = pathLenClick;
  // drawOverlay's part (drawing-ui.js): the base line of an angular running set, the chain picked so far
  function ctOverlay(g, H, svgNode) {
    var P = D.pending, list = D.tool === 'angrun' && P && P.baseEnt ? [P.baseEnt] : D.tool === 'pathlen' && P ? P.hl : [];
    list.forEach(function (h) {
      if (h.circle) svgNode('circle', { class: 'dw-hot', cx: h.circle.c[0], cy: H - h.circle.c[1], r: h.circle.r, 'stroke-width': pxToPaper(3) }, g);
      else if (h.arc) {
        var a0 = h.arc.a0 * Math.PI / 180, a1 = h.arc.a1 * Math.PI / 180, c = h.arc.c, r = h.arc.r, s = [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], e = [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)];
        svgNode('path', { class: 'dw-hot', d: 'M' + s[0] + ' ' + (H - s[1]) + ' A' + r + ' ' + r + ' 0 ' + (h.arc.a1 - h.arc.a0 > 180 ? 1 : 0) + ' 0 ' + e[0] + ' ' + (H - e[1]), fill: 'none', 'stroke-width': pxToPaper(3) }, g);
      } else if (h.a) svgNode('line', { class: 'dw-hot', x1: h.a[0], y1: H - h.a[1], x2: h.b[0], y2: H - h.b[1], 'stroke-width': pxToPaper(3) }, g);
    });
  }
  DW.cmdLockedDimension = cmdLockedDimension; DW.cmdAngularRunning = cmdAngularRunning; DW.angRunClick = angRunClick; DW.cmdPathLength = cmdPathLength;
  DW.pathLenClick = pathLenClick; DW.placePath = placePath; DW.ctOverlay = ctOverlay;
  document.addEventListener('mouseup', function (e) {
    var P = D.pending;
    if (D.tool !== 'rfancloud' || !P || !P.drawing) return;
    P.drawing = false;
    if (P.pts.length >= 3) cloudMake(P.pts.slice()); else { P.pts = []; UI.setStatus('Revision Cloud: press and draw round the change.'); }
  }, true);
  // ------------------------------------------------------------------ rfCU: Cosmetic Thread, Dowel Pin Symbol, Datum
  // Target, Multi-jog Leader, Note properties (border, numbered / bulleted list). Each tool opens its PropertyManager
  // (✓ / ✗, Esc ends), each placement is one undo step. Cosmetic Thread / Dowel Pin: click a hole circle in a view
  // (the thread's size defaults to the tap drill's thread); Datum Target: click the target point, then where the
  // symbol goes; Multi-jog Leader (lane DF: SolidWorks' order): click the arrow tip, each bend point, then double-click
  // the end (on a note: the leader hangs from the note; or ✓ / Enter: the last click is the end). Double-click edits; Delete removes; a leader's bend
  // point drags on its own (DW.jogAt), the whole leader drags by a segment.
  var CU_SYM = { datumTarget: { title: 'Datum Target', icon: 'datumTarget' }, leader: { title: 'Multi-jog Leader', icon: 'multiJogLeader' } };
  function cuThreadOptions() {
    var rows = typeof HoleWizard !== 'undefined' && HoleWizard.ANSI_THREADS ? HoleWizard.ANSI_THREADS : [];
    return [['auto', 'From the hole (tap drill)']].concat(rows.map(function (r) { return [r.size, r.size]; }));
  }
  function cuThreadGroups() {
    return [
      { title: 'Thread Settings', fields: [{ type: 'select', key: 'standard', label: 'Standard', options: [['ansi', 'ANSI Inch']] }, { type: 'select', key: 'size', label: 'Size', options: cuThreadOptions() },
        { type: 'select', key: 'end', label: 'End Condition', options: [['through', 'Through'], ['blind', 'Blind']] }, { type: 'number', key: 'depth', label: 'Depth (Blind)', unit: 'u', min: 0 }] },
      { title: 'Thread Callout', fields: [{ type: 'check', key: 'callout', label: 'Insert callout' }, { type: 'text', key: 'text', label: 'Callout text (<THREAD> is the standard one; blank: standard)' }] }
    ];
  }
  function cuThreadSpec(v) {
    var s = { end: v.end === 'blind' ? 'blind' : 'through', callout: !!v.callout, text: v.text || null, size: v.size || 'auto' };
    if (s.end === 'blind') s.depth = +v.depth;
    return s;
  }
  function cmdCosmeticThread(id) {
    if (id != null) {
      var f = Drawing.findAnnotation(doc(), id);
      if (!f || f.annotation.type !== 'cosmeticThread') return;
      var an = f.annotation;
      openDrawingPM({ title: 'Cosmetic Thread', icon: 'cosmeticThread', command: 'cosmeticThread', message: 'Cosmetic thread ' + an.size + ' on the hole.',
        values: { standard: 'ansi', size: an.size, end: an.end, depth: an.depth || (units() === 'in' ? 0.5 : 12), callout: an.callout !== false, text: an.text || '' }, groups: cuThreadGroups(),
        onOK: function (v) { if (tryEdit(function (dc) { Drawing.editAnnotation(dc, id, cuThreadSpec(v)); })) UI.setStatus('Cosmetic Thread changed.'); else return false; } });
      return;
    }
    if (D.tool === 'cuthread') { endToolPM(); return; }
    var v0 = { standard: 'ansi', size: 'auto', end: 'through', depth: units() === 'in' ? 0.5 : 12, callout: true, text: '' };
    toolPM({ title: 'Cosmetic Thread', icon: 'cosmeticThread', command: 'cosmeticThread', values: v0, groups: cuThreadGroups(),
      message: 'Set the thread, then click the edge of a hole (a circle) in a view. Esc or ✓ ends.',
      onChange: function (v) { if (D.pending) D.pending.values = v; } }, 'cuthread', { values: v0 });
    UI.setStatus('Cosmetic Thread: click the edge of a hole in a view.');
  }
  function cuHoleClick(p) {
    var P = D.pending, ent = entityAt(p), what = D.tool === 'cudowel' ? 'Dowel Pin Symbol' : 'Cosmetic Thread', made = null;
    if (!ent || !ent.circle) { UI.setStatus(what + ': click the edge of a hole (a circle) in a view.'); return; }
    var spec = { c: ent.mc.c.slice(), r: ent.mc.r };
    if (D.tool === 'cuthread') {
      Object.assign(spec, cuThreadSpec(P.values));
      // a circle that is not a hole (a boss, a shaft end) takes an external thread (2A); a flat pattern's circles are holes
      var w = sheetView(ent.view), m = w && (w.section ? w.section.mesh : mesh());
      spec.external = !!(w && w.ortho && !w.flat && m && m.faces && m.faces.length && !Drawing.holeInfo(m, w.frame, spec.c, spec.r));
    }
    if (!tryEdit(function (dc) { made = D.tool === 'cudowel' ? Drawing.addDowelPin(dc, ent.view, spec) : Drawing.addCosmeticThread(dc, ent.view, spec); })) return;
    D.sel = { kind: 'annot', id: made.id, view: ent.view };
    drawOverlay();
    UI.setStatus(what + (made.size ? ' ' + made.size : '') + ' added — click the next hole, Esc ends.');
  }
  RF_TOOLS.cuthread = cuHoleClick; RF_TOOLS.cudowel = cuHoleClick;
  function cmdDowelPin() {
    if (D.tool === 'cudowel') { endToolPM(); return; }
    toolPM({ title: 'Dowel Pin Symbol', icon: 'dowelPin', command: 'dowelPin', values: {}, groups: [],
      message: 'Click the edge of a hole (a circle) in a view: the dowel pin symbol goes on it, at its size. Esc or ✓ ends.' }, 'cudowel', { values: {} });
    UI.setStatus('Dowel Pin Symbol: click the edge of a hole in a view.');
  }
  function cuTargetGroups() {
    return [
      { title: 'Datum Target', fields: [{ type: 'text', key: 'datum', label: 'Datum' }, { type: 'number', key: 'num', label: 'Target number', min: 1 }] },
      { title: 'Target Area', fields: [{ type: 'select', key: 'area', label: 'Target', options: Drawing.TARGET_AREAS }, { type: 'number', key: 'aw', label: 'Diameter / width', unit: 'u', min: 0 }, { type: 'number', key: 'ah', label: 'Height (rectangle)', unit: 'u', min: 0 },
        { type: 'text', key: 'size', label: 'Size text (blank: the area\'s size)' }] }
    ];
  }
  function cuTargetSpec(v) { return { datum: v.datum, num: +v.num > 0 ? +v.num : null, area: v.area, aw: v.area === 'point' ? null : +v.aw, ah: v.area === 'rect' ? +v.ah : null, size: v.size || null }; }
  function cuLeaderGroups() { return [{ title: 'Leader', fields: [{ type: 'select', key: 'end', label: 'Arrow style', options: Drawing.LEADER_ENDS }] }]; }
  function cuSymbolPM(type, id) {
    var M = CU_SYM[type];
    if (id != null) {
      var s = Drawing.findSymbol(doc(), id);
      if (!s) return;
      var vals = type === 'datumTarget' ? { datum: s.datum, num: s.num, area: s.area, aw: s.aw || 0, ah: s.ah || 0, size: s.size || '' } : { end: s.end || 'arrow' };
      openDrawingPM({ title: M.title, icon: M.icon, command: type, message: Drawing.symbolText(s, doc()), values: vals, groups: type === 'datumTarget' ? cuTargetGroups() : cuLeaderGroups(),
        onOK: function (v) {
          var spec = type === 'datumTarget' ? cuTargetSpec(v) : { end: v.end };
          if (spec.num == null) delete spec.num;
          if (tryEdit(function (dc) { Drawing.editSymbol(dc, id, spec); })) UI.setStatus(M.title + ' changed.'); else return false;
        } });
      return;
    }
    if (type === 'leader') { cmdMultiJog(); return; }
    if (D.tool === 'cutarget') { endToolPM(); return; }
    var inch = units() === 'in', v0 = { datum: 'A', num: Drawing.nextTargetNum(doc(), 'A'), area: 'point', aw: inch ? 0.5 : 10, ah: inch ? 0.25 : 5, size: '' };
    toolPM({ title: M.title, icon: M.icon, command: type, values: v0, groups: cuTargetGroups(),
      message: 'Click the target point (the X, or the area\'s centre), then where the symbol goes. Esc or ✓ ends.',
      onChange: function (v) { if (D.pending) D.pending.values = v; } }, 'cutarget', { values: v0, tip: null });
    UI.setStatus('Datum Target: click the target point.');
  }
  function cuTargetClick(p) {
    var P = D.pending, made = null;
    if (!P.tip) { P.tip = p; UI.setStatus('Datum Target: now click where the symbol goes.'); return; }
    if (Math.hypot(p[0] - P.tip[0], p[1] - P.tip[1]) <= pxToPaper(12)) { UI.setStatus('Datum Target: click away from the target point, where the symbol goes.'); return; }
    var spec = Object.assign({ type: 'datumTarget', p: p, leader: P.tip }, cuTargetSpec(P.values));
    P.tip = null;
    if (!tryEdit(function (dc) { made = Drawing.addSymbol(dc, spec); })) return;
    // the next target of the same datum takes the next number
    P.values.num = Drawing.nextTargetNum(doc(), made.datum);
    if (UI.pmSetValue) try { UI.pmSetValue('num', P.values.num); } catch (err) { }
    D.sel = { kind: 'symbol', id: made.id };
    drawOverlay();
    UI.setStatus(Drawing.symbolText(made, doc()) + ' placed — click the next target point, Esc ends.');
  }
  RF_TOOLS.cutarget = cuTargetClick;
  function cmdMultiJog() {
    if (D.tool === 'culeader') { endToolPM(); return; }
    var v0 = { end: 'arrow' };
    toolPM({ title: 'Multi-jog Leader', icon: 'multiJogLeader', command: 'leader', values: v0, groups: cuLeaderGroups(),
      message: 'Click the arrow tip, each bend point, then double-click the end (on a note: the leader hangs from it; or ✓ / Enter: the last click is the end). Esc ends.',
      onChange: function (v) { if (D.pending) D.pending.values = v; },
      onOK: function () { var P = D.pending; if (P && P.pts.length >= 2) cuLeaderMake(); } }, 'culeader', { values: v0, pts: [], note: null });
    UI.setStatus('Multi-jog Leader: click where the arrow points.');
  }
  function cuLeaderClick(p) {
    var P = D.pending;
    var last = P.pts[P.pts.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) <= pxToPaper(3)) return;   // (the second click of a double-click)
    P.pts.push(p);
    UI.setStatus('Multi-jog Leader: ' + P.pts.length + ' point' + (P.pts.length === 1 ? '' : 's') + ' — click the next bend, double-click the end (on a note to hang it from the note).');
    drawOverlay();
  }
  RF_TOOLS.culeader = cuLeaderClick;
  function cuLeaderMake() {
    var P = D.pending, pts = P.pts.slice(), made = null;
    P.pts = [];
    if (pts.length < 2) { UI.setStatus('Multi-jog Leader: a leader needs a start and an end.'); return; }
    // lane DF: clicked from the arrow tip to the end; stored from the end (p, the note side) through the jogs to the tip
    var nt = DW.noteAt(pts[pts.length - 1]);
    var spec = { type: 'leader', p: pts[pts.length - 1], jogs: pts.slice(1, -1).reverse(), leader: pts[0], end: P.values.end, note: nt ? nt.id : null };
    P.note = null;
    if (!tryEdit(function (dc) { made = Drawing.addSymbol(dc, spec); })) return;
    D.sel = { kind: 'symbol', id: made.id };
    drawOverlay();
    UI.setStatus('Multi-jog Leader placed (' + (pts.length - 1) + ' segments) — draw the next one, Esc ends.');
  }
  document.addEventListener('dblclick', function (e) {
    if (!D.active || D.tool !== 'culeader' || !D.pending || !D.host || !D.host.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    if (D.pending.pts.length >= 2) cuLeaderMake();
  }, true);
  // a multi-jog leader's bend point under p (within 4 px): { id, index, at }
  function jogAt(p) {
    var t = pxToPaper(4), hit = null;
    (doc() && doc().symbols || []).forEach(function (s) { (s.type === 'leader' && s.jogs || []).forEach(function (q, i) { if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= t) hit = { id: s.id, index: i, at: q.slice() }; }); });
    return hit;
  }
  var jogDrag = null;
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || !D.active || D.tool || !D.sheet || !D.host || !D.host.contains(e.target) || (D.inline && D.inline.box.contains(e.target))) return;
    var p = DW.toPaper(e), j = jogAt(p);
    if (!j) return;
    e.preventDefault(); e.stopPropagation();
    settle();
    jogDrag = { id: j.id, index: j.index, start: p, at0: j.at, moved: false };
    D.sel = { kind: 'symbol', id: j.id }; drawOverlay(); DW.renderTree();
    UI.setStatus('Leader bend point — drag it.');
  }, true);
  document.addEventListener('mousemove', function (e) {
    if (!jogDrag) return;
    var p = DW.toPaper(e), g = jogDrag;
    if (!g.moved && Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) < pxToPaper(3)) return;
    if (!g.moved) { UI.pushUndo(); g.moved = true; }
    e.stopPropagation();
    Drawing.editSymbol(doc(), g.id, { jog: g.index, at: [g.at0[0] + p[0] - g.start[0], g.at0[1] + p[1] - g.start[1]] });
    queueRender(true);
  }, true);
  document.addEventListener('mouseup', function () {
    var g = jogDrag; jogDrag = null;
    if (g && g.moved) { D.dirty = true; UI.autosave(); render(); }
  }, true);
  // Note PropertyManager (right-click a note ▸ Properties…): Border and the list style of a multi-line note
  function cmdNoteProps(id) {
    var n = Drawing.findNote(doc(), id);
    if (!n) return;
    openDrawingPM({ title: 'Note', icon: 'note', command: 'noteProps', message: String(n.text).split('\n')[0],
      values: { border: n.border || 'none', list: n.list || 'none' },
      groups: [{ title: 'Border', fields: [{ type: 'select', key: 'border', label: 'Style', options: Drawing.NOTE_BORDERS }] }, { title: 'Text Format', fields: [{ type: 'select', key: 'list', label: 'List (one item per line)', options: Drawing.NOTE_LISTS }] }],
      onOK: function (v) { if (tryEdit(function (dc) { Drawing.editNote(dc, id, { border: v.border, list: v.list }); })) UI.setStatus('Note changed.'); else return false; } });
  }
  // (rfCU2) the leader being clicked, as a rubber band: the placed segments, a live one to the pointer, and the end
  // (arrow / dot, the PM's Arrow style) where the next click would put the tip; group class dw-cu-leader
  function cuLeaderOverlay(g, H, svgNode) {
    var P = D.pending;
    if (!P || !P.pts || !P.pts.length) return;
    var pts = P.pts.concat(P.at && Math.hypot(P.at[0] - P.pts[P.pts.length - 1][0], P.at[1] - P.pts[P.pts.length - 1][1]) > pxToPaper(1) ? [P.at] : []);
    var grp = svgNode('g', { class: 'dw-cu-leader' }, g), lw = pxToPaper(1.5);
    svgNode('polyline', { class: 'dw-cut', points: pts.map(function (q) { return q[0] + ',' + (H - q[1]); }).join(' '), fill: 'none', 'stroke-width': lw }, grp);
    if (pts.length < 2) { svgNode('circle', { class: 'dw-cut', cx: pts[0][0], cy: H - pts[0][1], r: pxToPaper(3), 'stroke-width': lw }, grp); return; }
    var tip = pts[0], from = pts[1], d = [tip[0] - from[0], tip[1] - from[1]], n = Math.hypot(d[0], d[1]) || 1, u = [d[0] / n, d[1] / n], k = paperK();
    var end = P.values && P.values.end || 'arrow';   // lane DF: the arrow sits on the first click (the tip)
    if (end === 'arrow') {
      var L = 3 * k, w = 0.5 * k, b = [tip[0] - u[0] * L, tip[1] - u[1] * L];
      svgNode('polygon', { class: 'dw-cu-end', points: [tip, [b[0] + u[1] * w, b[1] - u[0] * w], [b[0] - u[1] * w, b[1] + u[0] * w]].map(function (q) { return q[0] + ',' + (H - q[1]); }).join(' '), fill: 'var(--dw-hot)', stroke: 'none' }, grp);
    } else if (end === 'dot') svgNode('circle', { class: 'dw-cu-end', cx: tip[0], cy: H - tip[1], r: 0.75 * k, fill: 'var(--dw-hot)', stroke: 'none' }, grp);
  }
  DW.cmdCosmeticThread = cmdCosmeticThread; DW.cmdDowelPin = cmdDowelPin; DW.cuSymbolPM = cuSymbolPM; DW.cmdMultiJog = cmdMultiJog; DW.cmdNoteProps = cmdNoteProps; DW.jogAt = jogAt; DW.cuLeaderOverlay = cuLeaderOverlay;   // (rfCU; rfCU2)
  DW.cuDatumTarget = function () { cuSymbolPM('datumTarget'); };
  // the shop symbols' PropertyManager and right-click menu (drawing-ui-panels.js) hand these types to cmdSymbolAN
  // (rfCU: Datum Target and Multi-jog Leader to cuSymbolPM)
  onAssign(DW, 'cmdSymbol', function (f) {
    if (typeof f !== 'function' || f._rfAN) return f;
    var g = function (type, id) { return CU_SYM[type] ? cuSymbolPM(type, id) : RF_SYM[type] ? cmdSymbolAN(type, id) : f.apply(this, arguments); };
    g._rfAN = true;
    return g;
  });
  onAssign(DW, 'symbolMenu', function (f) {
    if (typeof f !== 'function' || f._rfAN) return f;
    var g = function (id) {
      var items = f.apply(this, arguments), s = Drawing.findSymbol(doc(), id);
      if (s && RF_SYM[s.type]) {
        items[0] = { label: 'Properties…', action: function () { cmdSymbolAN(s.type, id); } };
        if (s.type !== 'revision') items = items.filter(function (it) { return !/Leader/.test(it.label || ''); });
      }
      if (s && CU_SYM[s.type]) {   // (rfCU)
        items[0] = { label: 'Properties…', action: function () { cuSymbolPM(s.type, id); } };
        items = items.filter(function (it) { return !/Leader/.test(it.label || ''); });
      }
      return items;
    };
    g._rfAN = true;
    return g;
  });
  DW.cmdHoleTable = cmdHoleTable; DW.cmdHoleTableProps = cmdHoleTableProps; DW.holeTableAt = holeTableAt; DW.cmdSymbolAN = cmdSymbolAN; DW.cmdCloud = cmdCloud;   // (rfAN)
  DW.cmdBrokenOut = cmdBrokenOut; DW.cmdAreaHatch = cmdAreaHatch; DW.cmdAreaHatchTool = cmdAreaHatchTool; DW.cmdAreaFill = cmdAreaFill; DW.fillAt = fillAt;   // (lane DW)   // (rfAD)
  DW.cmdMagLine = cmdMagLine; DW.magLineClick = magLineClick; DW.magOverlay = magOverlay; DW.magSnap = magSnap; DW.magAt = magAt; DW.deleteMagLine = deleteMagLine;   // (rfAG)
  DW.smartDimClick = smartDimClick; DW.smartDimMove = smartDimMove; DW.smartDimOverlay = smartDimOverlay; DW.pickAt = pickAt; DW.saveDWG = saveDWG;
  DW.cmdNote = cmdNote; DW.noteClick = noteClick; DW.noteAt = noteAt; DW.openNoteEdit = openNoteEdit; DW.cmdFlatView = cmdFlatView; DW.setFlatViewProps = setFlatViewProps; DW.flatReady = flatReady; DW.sheetMetal = sheetMetal;
  DW.cmdStandard3View = cmdStandard3View; DW.cmdModelView = cmdModelView; DW.startPlacing = startPlacing; DW.placePending = placePending; DW.sheetView = sheetView;
  DW.cmdProjectedView = cmdProjectedView; DW.projectPlacement = projectPlacement; DW.projectClick = projectClick; DW.cmdSectionView = cmdSectionView; DW.sectionLineAt = sectionLineAt;
  DW.sectionPlacement = sectionPlacement; DW.partialLine = partialLine; DW.sectionClick = sectionClick; DW.cmdDetailView = cmdDetailView; DW.detailClick = detailClick; DW.cmdViewProperties = cmdViewProperties;
  DW.setViewTangent = setViewTangent; DW.deleteView = deleteView; DW.deleteSelection = deleteSelection; DW.addDimension = addDimension; DW.cmdSmartDimension = cmdSmartDimension;
  DW.cmdModelItems = cmdModelItems; DW.setSheet = setSheet; DW.cmdSheetProperties = cmdSheetProperties; DW.exportAs = exportAs; DW.viewMenu = viewMenu; DW.sheetMenu = sheetMenu;
  DW.defaultBalloonView = defaultBalloonView; DW.autoBalloonView = autoBalloonView; DW.cmdAutoBalloon = cmdAutoBalloon; DW.setBom = setBom; DW.cmdBOM = cmdBOM; DW.setTitleBlock = setTitleBlock;
  DW.bomMenu = bomMenu; DW.bomAt = bomAt; DW.balloonAt = balloonAt; DW.dimRef = dimRef; DW.setDimProps = setDimProps; DW.annotAt = annotAt; DW.edgeAt = edgeAt;
  DW.cmdCenterMark = cmdCenterMark; DW.centerMarkClick = centerMarkClick; DW.cmdCenterline = cmdCenterline; DW.centerlineClick = centerlineClick; DW.cmdHoleCallout = cmdHoleCallout;
  DW.holeCalloutClick = holeCalloutClick; DW.cmdChainDim = cmdChainDim; DW.chainDimClick = chainDimClick; DW.cmdChamferDim = cmdChamferDim; DW.chamferClick = chamferClick;
  DW.cmdBalloon = cmdBalloon; DW.balloonClick = balloonClick; DW.cmdBalloonProps = cmdBalloonProps; DW.setBalloonProps = setBalloonProps; DW.cmdDimensionPM = cmdDimensionPM; DW.sectionPreview = sectionPreview; DW.liveOverlay = liveOverlay; DW.openClickDimPM = openClickDimPM; DW.closeClickPM = closeClickPM; DW.clickPM = clickPM;
  DW.applyDimensionPM = applyDimensionPM; DW.cmdCalloutProps = cmdCalloutProps; DW.cmdDocProps = cmdDocProps; DW.setDocOptions = setDocOptions; DW.defaultDocOptions = defaultDocOptions;
  DW.autoInsertViews = autoInsertViews; DW.startDimDrag = startDimDrag; DW.FLIP_KINDS = FLIP_KINDS; DW.arrowAt = arrowAt; DW.flipArrows = flipArrows; DW.openInlineEdit = openInlineEdit;
  DW.positionInlineEdit = positionInlineEdit; DW.openTitleEdit = openTitleEdit; DW.closeInlineEdit = closeInlineEdit; DW.dragDim = dragDim; DW.balloonRef = balloonRef;
})();
