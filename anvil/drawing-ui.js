// drawing-ui.js — the drawing document UI (only when `UI` exists; tests/kernel-tests.html and drawing-worker.js load
// the engine, drawing.js and drawing-*.js, without it): File ▸ Make Drawing from Part / Assembly, the drawing icons,
// the document state (D), the sheet's DOM inside the viewport with pan and zoom, opening, closing and detaching the
// document, rendering (the sheet is worked out again and its SVG patched layer by layer; the views' hidden-line
// removal runs in drawing-worker.js and each view drops in as it is done), hit testing and the mouse. The commands and
// tools are drawing-ui-tools.js, the drawing FeatureManager, ribbon, menus, keys and the `anvil.drawing` automation
// drawing-ui-panels.js; the three share their state through UI.drawingInternal, made here.
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.App || typeof document === 'undefined') return;
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el;
  // UI.drawingInternal (DW): the state object D and the functions the drawing-ui*.js files share. A later file aliases
  // what an earlier one put here; this file reaches the tools and the FeatureManager (drawing-ui-tools.js,
  // drawing-ui-panels.js, loaded after it) through DW.name, so they are bound when they are called, not when this runs.
  var DW = UI.drawingInternal = {};

  // ------------------------------------------------------------------ icons (drawing documents)
  var DI = {
    drawing: '<path d="M2.5 2.5 h11 v11 h-11 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 9.5 h4 v2.5 h-4 z M4.5 4.5 h4 v3.5 h-4 z M10 9.5 h2 v2.5 h-2 z" fill="none" stroke="#6d6d6d" stroke-width="0.9"/>',
    sheet: '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M9 10 h5 M9 10 v3" stroke="currentColor" stroke-width="0.9" fill="none"/>',
    sheetFormat: '<path d="M2 3 h12 v10 H2 z" fill="#f4f4f4" stroke="currentColor" stroke-width="1.1"/><path d="M8 9.5 h6 M8 9.5 v3.5 M11 9.5 v3.5" stroke="currentColor" stroke-width="0.8" fill="none"/>',
    drawingView: '<path d="M2 2.5 h12 v11 H2 z" fill="none" stroke="#6d6d6d" stroke-width="1" stroke-dasharray="2 1.2"/><path d="M4.5 5 h7 v6 h-7 z" fill="#c4c4c4" stroke="currentColor" stroke-width="1"/>',
    std3view: '<path d="M1.5 8.5 h6 v5.5 h-6 z M1.5 2 h6 v5 h-6 z M9 8.5 h5.5 v5.5 H9 z" fill="#c4c4c4" stroke="currentColor" stroke-width="1"/><path d="M4.5 3.5 v2 M3 4.5 h3" stroke="#6d6d6d" stroke-width="0.8"/>',
    modelView: '<path d="M2 2.5 h12 v11 H2 z" fill="none" stroke="#6d6d6d" stroke-width="1" stroke-dasharray="2 1.2"/><path d="M5 7 l3 -2 3 2 v4 l-3 2 -3 -2 z" fill="#c4c4c4" stroke="currentColor" stroke-width="1"/><path d="M5 7 l3 2 3 -2 M8 9 v4" fill="none" stroke="currentColor" stroke-width="0.8"/>',
    projView: '<path d="M2 8.5 h6 v5.5 H2 z" fill="#c4c4c4" stroke="currentColor" stroke-width="1"/><path d="M2 2 h6 v5 H2 z" fill="none" stroke="#6d6d6d" stroke-width="1" stroke-dasharray="1.6 1"/><path d="M11.5 12 V4 M9.8 5.8 l1.7 -1.8 1.7 1.8" fill="none" stroke="#3ba776" stroke-width="1.2"/>',
    modelItems: '<path d="M3 13 l3 -2 3 2 V8 l-3 -2 -3 2 z" fill="#c4c4c4" stroke="currentColor" stroke-width="0.9"/><path d="M8 3.5 h6 M8 3.5 l1.2 -0.8 M8 3.5 l1.2 0.8 M14 3.5 l-1.2 -0.8 M14 3.5 l-1.2 0.8" fill="none" stroke="#6d6d6d" stroke-width="1"/><path d="M11 7 v6" stroke="#6d6d6d" stroke-width="1"/>',
    sheetProps: '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 6 h7 M4.5 8.5 h7 M4.5 11 h4" stroke="#6d6d6d" stroke-width="1"/>',
    svgExport: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><text x="8" y="12" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#e0553c">SVG</text>',
    pdfExport: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><text x="8" y="12" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#d9453b">PDF</text>',
    dxfExport: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><text x="8" y="12" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#6d6d6d">DXF</text>',
    sectionView: '<path d="M2 3 h12 v10 H2 z" fill="#c4c4c4" stroke="currentColor" stroke-width="1"/><path d="M3 12 l3 -3 M3 9 l3 -3 M3 6 l2 -2 M5 12 l1 -1" stroke="currentColor" stroke-width="0.6"/><path d="M8 1 v14" stroke="#e0553c" stroke-width="1.3" stroke-dasharray="3 1 1 1"/><path d="M8 1.5 h3 M8 14.5 h3 M10 0.3 l1.4 1.2 -1.4 1.2 M10 13.3 l1.4 1.2 -1.4 1.2" fill="none" stroke="#e0553c" stroke-width="1"/>',
    detailView: '<path d="M1.5 9 h7 v5 h-7 z" fill="#c4c4c4" stroke="currentColor" stroke-width="0.9"/><circle cx="7" cy="9" r="2.4" fill="none" stroke="#e0553c" stroke-width="1"/><circle cx="11.5" cy="5" r="3.8" fill="#fff" stroke="#6d6d6d" stroke-width="1"/><path d="M8 5 h3.5 v4" fill="none" stroke="currentColor" stroke-width="1"/>',
    autoBalloon: '<path d="M2 13 h6 v-5 h-6 z" fill="#c4c4c4" stroke="currentColor" stroke-width="0.9"/><path d="M7 9.5 L10.2 6.3" stroke="currentColor" stroke-width="0.9"/><circle cx="12" cy="4.5" r="3.2" fill="#fff" stroke="#6d6d6d" stroke-width="1.1"/><text x="12" y="6.2" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#6d6d6d">1</text>',
    bom: '<path d="M1.5 3 h13 v10 h-13 z" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M1.5 5.5 h13" stroke="currentColor" stroke-width="1.1"/><path d="M1.5 8 h13 M1.5 10.5 h13 M4.5 3 v10 M12 3 v10" stroke="currentColor" stroke-width="0.6"/><path d="M5.8 6.8 h4.6 M5.8 9.3 h3.6 M5.8 11.8 h4.2" stroke="#6d6d6d" stroke-width="0.8"/>',
    closeDoc: '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M5.5 5.5 l5 5 M10.5 5.5 l-5 5" stroke="#e0553c" stroke-width="1.4"/>',
    centerMark: '<circle cx="8" cy="8" r="4.2" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M6.6 8 h2.8 M8 6.6 v2.8" stroke="#6d6d6d" stroke-width="1.1"/><path d="M1 8 h4 M11 8 h4 M8 1 v4 M8 11 v4" stroke="#6d6d6d" stroke-width="0.9" stroke-dasharray="2.2 0.8 0.6 0.8"/>',
    centerline: '<path d="M2 4.5 h12 M2 11.5 h12" stroke="currentColor" stroke-width="1.1"/><path d="M0.8 8 h14.4" stroke="#6d6d6d" stroke-width="1" stroke-dasharray="3 1 1 1"/>',
    holeCallout: '<circle cx="5" cy="11" r="3" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M7.1 8.9 L10 6 h5" fill="none" stroke="#6d6d6d" stroke-width="1"/><text x="12" y="4.6" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#6d6d6d">\u00d8</text>',
    balloon: '<path d="M2.5 13.5 L8.4 7.6" stroke="currentColor" stroke-width="0.9"/><path d="M2.5 13.5 l0.6 -2 1.4 1.4 z" fill="currentColor"/><circle cx="11" cy="5" r="3.8" fill="#fff" stroke="#6d6d6d" stroke-width="1.1"/><text x="11" y="6.8" font-size="5" font-weight="700" font-family="Arial" text-anchor="middle" fill="#6d6d6d">1</text>',
    stackBalloon: '<path d="M2 14 L5 11" stroke="currentColor" stroke-width="0.9"/><circle cx="6.5" cy="9.5" r="2.6" fill="#fff" stroke="#6d6d6d" stroke-width="1"/><circle cx="11.7" cy="9.5" r="2.6" fill="#fff" stroke="#6d6d6d" stroke-width="1"/><circle cx="9.1" cy="4.4" r="2.6" fill="#fff" stroke="#6d6d6d" stroke-width="1"/>',
    ordinateDim: '<path d="M3 13.5 V3 M7 13.5 V6 M12 13.5 V8" stroke="#6d6d6d" stroke-width="0.9"/><path d="M1.5 13.5 h13" stroke="currentColor" stroke-width="1.1"/><text x="3" y="2.6" font-size="3.4" font-family="Arial" text-anchor="middle" fill="currentColor">0</text>',
    baselineDim: '<path d="M2.5 14 V2" stroke="currentColor" stroke-width="1.1"/><path d="M2.5 5 h7 M2.5 9 h11" stroke="#6d6d6d" stroke-width="0.9"/><path d="M9.5 3.5 v3 M13.5 7.5 v3" stroke="currentColor" stroke-width="0.9"/>',
    chamferDim: '<path d="M2 14 V7 L7 2 h7" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 4.5 L8.5 8.5 h6" fill="none" stroke="#6d6d6d" stroke-width="0.9"/>',
    note: '<path d="M2.5 2.5 h11 v8 l-3 3 h-8 z" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M10.5 13.5 v-3 h3" fill="none" stroke="currentColor" stroke-width="0.9"/><text x="7.5" y="9" font-size="6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#6d6d6d">A</text>',
    flatView: '<path d="M1.5 4.5 h13 v7 h-13 z" fill="#c4c4c4" stroke="currentColor" stroke-width="1"/><path d="M4.5 3.5 v9 M11.5 3.5 v9" stroke="#6d6d6d" stroke-width="0.9"/><path d="M11.5 3.5 v9" stroke="#e0553c" stroke-width="0.9" stroke-dasharray="1.4 0.9"/><circle cx="8" cy="8" r="1.3" fill="#fff" stroke="currentColor" stroke-width="0.8"/>',
    // (rfM) shop symbols and the Revision Table
    surfaceFinish: '<path d="M2.5 7.5 L5.5 13 L11 2.5 H14.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M2.5 7.5 H8.2" stroke="currentColor" stroke-width="1.1"/>',
    datumFeature: '<rect x="4.5" y="1.5" width="7" height="6.5" fill="#fff" stroke="currentColor" stroke-width="1"/><text x="8" y="6.9" font-size="5.5" font-weight="700" font-family="Arial" text-anchor="middle" fill="currentColor">A</text><path d="M8 8 v3.5" stroke="currentColor" stroke-width="1"/><path d="M5 14.5 L8 11 L11 14.5 z" fill="#6d6d6d" stroke="currentColor" stroke-width="0.6"/>',
    gtol: '<rect x="1" y="4.5" width="14" height="7" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M5.5 4.5 v7 M11 4.5 v7" stroke="currentColor" stroke-width="0.9"/><circle cx="3.25" cy="8" r="1.4" fill="none" stroke="#6d6d6d" stroke-width="0.9"/><path d="M1.6 8 h3.3 M3.25 6.3 v3.4" stroke="#6d6d6d" stroke-width="0.8"/><text x="13" y="10.3" font-size="5" font-weight="700" font-family="Arial" text-anchor="middle" fill="currentColor">A</text>',
    revTable: '<rect x="1.5" y="2.5" width="13" height="11" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M1.5 5.5 h13 M1.5 8.5 h13 M1.5 11 h13 M5 5.5 v8" stroke="currentColor" stroke-width="0.7"/><text x="3.3" y="10.6" font-size="3.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#6d6d6d">B</text>',
    bendNote: '<path d="M5 2 v12" stroke="#6d6d6d" stroke-width="1"/><text x="10.5" y="10" font-size="5.2" font-weight="700" font-family="Arial" text-anchor="middle" fill="currentColor">UP</text>',
    docProps: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><circle cx="8" cy="9" r="2.6" fill="none" stroke="#6d6d6d" stroke-width="1.3" stroke-dasharray="1.4 0.9"/><circle cx="8" cy="9" r="0.9" fill="#6d6d6d"/>'
  };
  // (rfAE) Sheet Format tab and General Table
  DI.editSheetFormat = '<path d="M2 3 h12 v10 H2 z" fill="#f4f4f4" stroke="currentColor" stroke-width="1.1"/><path d="M8 9.5 h6 M8 9.5 v3.5" stroke="currentColor" stroke-width="0.8" fill="none"/><path d="M4 11 l5.5 -5.5 1.5 1.5 -5.5 5.5 h-1.5 z" fill="#6d6d6d"/>';
  DI.fmtLine = '<path d="M2.5 13.5 L13.5 2.5" stroke="currentColor" stroke-width="1.3"/><circle cx="2.5" cy="13.5" r="1.4" fill="#6d6d6d"/><circle cx="13.5" cy="2.5" r="1.4" fill="#6d6d6d"/>';
  DI.fmtNote = '<path d="M2.5 2.5 h11 v8 l-3 3 h-8 z" fill="#f4f4f4" stroke="currentColor" stroke-width="1"/><text x="7.5" y="9" font-size="6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#6d6d6d">A</text>';
  DI.saveSheetFormat = '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M8 9.5 h6 M8 9.5 v3.5" stroke="currentColor" stroke-width="0.8" fill="none"/><path d="M5 2 v5 M3 5 l2 2 2 -2" stroke="#3ba776" stroke-width="1.2" fill="none"/>';
  DI.saveTemplate = '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M5 11 h6 M5 11 v2.5 M8 11 v2.5" stroke="currentColor" stroke-width="0.8"/><text x="8" y="8.5" font-size="4.4" font-weight="700" font-family="Arial" text-anchor="middle" fill="#6d6d6d">DRW</text>';
  DI.resetFormat = '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M5 8 a3 3 0 1 0 1 -2.3 M5 4.5 v1.5 h1.5" stroke="#e0553c" stroke-width="1.1" fill="none"/>';
  DI.generalTable = '<rect x="1.5" y="2.5" width="13" height="11" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M1.5 6 h13 M1.5 9.5 h13 M6 2.5 v11 M10.5 2.5 v11" stroke="#6d6d6d" stroke-width="0.8"/>';
  // (rfCU) Cosmetic Thread (a hole with its 3/4 thread circle), Dowel Pin Symbol (quadrants), Datum Target (split circle, X),
  // Multi-jog Leader (a bent leader with an arrow)
  DI.cosmeticThread = '<circle cx="8" cy="8" r="3.6" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M14 6.4 A6.2 6.2 0 1 1 9.6 1.9" fill="none" stroke="#6d6d6d" stroke-width="1"/>';
  DI.dowelPin = '<circle cx="8" cy="8" r="5.5" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M8 8 V2.5 A5.5 5.5 0 0 1 13.5 8 z M8 8 V13.5 A5.5 5.5 0 0 1 2.5 8 z" fill="currentColor"/><path d="M1 8 h14 M8 1 v14" stroke="#6d6d6d" stroke-width="0.8"/>';
  DI.datumTarget = '<circle cx="6" cy="6" r="4.8" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M1.2 6 h9.6 M9.4 9.4 L12.5 12.5" stroke="currentColor" stroke-width="0.9"/><text x="6" y="10" font-size="3.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="currentColor">A1</text><path d="M11.3 11.3 l2.6 2.6 M13.9 11.3 l-2.6 2.6" stroke="#6d6d6d" stroke-width="1.2"/>';
  DI.multiJogLeader = '<path d="M9 3 h5 M9 3 L5 7 V10 L2.5 13.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M2 14.2 l0.4 -2.5 2 1.4 z" fill="currentColor"/><circle cx="5" cy="7" r="1" fill="#6d6d6d"/><circle cx="5" cy="10" r="1" fill="#6d6d6d"/>';
  // (rfCX) Removed Section: the parent with its cutting line, the hatched cross-section set apart
  DI.removedSection = '<path d="M1.5 2.5 h7 v11 h-7 z" fill="none" stroke="currentColor" stroke-width="1"/><path d="M5 1 v14" stroke="#e0553c" stroke-width="1.2" stroke-dasharray="3 1 1 1"/><path d="M10.5 6 h4 v4 h-4 z" fill="#c4c4c4" stroke="currentColor" stroke-width="1"/><path d="M10.5 9 l3 -3 M11.5 10 l3 -3" stroke="currentColor" stroke-width="0.6"/>';
  // (rfGZ) optical centring, whole units (see icons.js CENTRE): these were drawn a unit or two off the grid's centre
  DI.modelItems = '<g transform="translate(-1 0)">' + DI.modelItems + '</g>';
  DI.bendNote = '<g transform="translate(-2 0)">' + DI.bendNote + '</g>';
  DI.ordinateDim = '<g transform="translate(0 1)">' + DI.ordinateDim + '</g>';
  var baseIcons = Icons;
  // icons.js' Icons.svg weighs the strokes for the size shown (rfGZ: 1 px outlines, pixel-snapped), as for every icon
  var wrapped = function (name, size, cls) {
    if (!DI[name]) return baseIcons(name, size, cls);
    if (baseIcons.svg) return baseIcons.svg(DI[name], size, cls);
    size = size || 32;
    return '<svg class="ico ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 16 16" aria-hidden="true">' + DI[name] + '</svg>';
  };
  wrapped.has = function (name) { return !!DI[name] || baseIcons.has(name); };
  Icons = wrapped;   // eslint-disable-line no-global-assign

  // ------------------------------------------------------------------ state
  var D = {
    active: false, index: 0, sheet: null, sel: null, hover: null, tool: null, pending: null,
    vb: null, drag: null, root: null, host: null, tree: null, renderQueued: false
  };
  // drawings belong to the open part or assembly document (model.drawings)
  function doc() { var l = App.model && App.model.drawings; return l && l[D.index] || null; }
  // an assembly drawing's BOM row count drives where Standard 3 View leaves room for the table
  // the build the sheet reads mass and bodies from (the open document's)
  // (lane drawing) showHidden: View ▸ Hide/Show Annotations runs, so hidden annotations are drawn grey to be clicked back
  function cctx() { return { build: App.build || null, mesh: App.mesh || null, showHidden: D.tool === 'sk:hideann' }; }   // (rfKM) mesh: Cut-List links in the title block
  function syncBom(dc) { dc = dc || doc(); if (dc && dc.bom) dc.bomRows = Drawing.bomRows(App.model, mesh(), dc.bom, cctx()).length; return dc; }
  function relayout(dc) { syncBom(dc); Drawing.layout(dc, mesh(), units()); }
  function units() { return App.model.units === 'in' ? 'in' : 'mm'; }
  function mesh() { return App.mesh || { positions: new Float32Array(0), faces: [], triCount: 0 }; }
  function paperK() { return units() === 'in' ? 1 / 25.4 : 1; }
  function edit(fn) {
    settle();
    UI.pushUndo();
    D.dirty = true;
    fn(doc());
    UI.autosave();
    render();
  }
  // editView(fn) -> the view fn(doc) adds (r13/drawings13): a view placed with the mouse (model, projected, section,
  // detail) is one undo step whose linework is worked out in drawing-worker.js, as when a drawing opens: the sheet
  // shows a placeholder where it goes at once (a section's CSG cut and hidden-line removal took 15–60 ms on the main
  // thread), the linework drops in when ready, then Auto insert adds its centre marks / centrelines.
  // (rfDR) o.insert: fn replaced several views (Standard 3 View): Auto insert runs on every view once they have landed
  function editView(fn, o) {
    settle();
    UI.pushUndo();
    D.dirty = true;
    var v = fn(doc());
    UI.autosave();
    D.prog = { doc: doc(), insert: !!(o && o.insert), ids: o && o.insert ? null : [v.id], t0: performance.now() };
    render();
    return v;
  }

  // ------------------------------------------------------------------ unsaved changes (Close Drawing asks)
  // The drawing lives in the part / assembly document (model.drawings), so Save saves it with the document and the
  // document's "*" and AutoRecover copy cover it. D.dirty says whether this drawing changed since it was opened, made or
  // saved (every edit goes through edit / editView, a drag or a driven dimension), which is what SolidWorks asks about
  // when a drawing is closed: "Save changes to Draw1?". D.clean is the drawing as it was then (JSON), which Don't Save
  // puts back. Closing from a script (anvil.drawing.close, UI.closeDrawing) never asks.
  function markDrawingClean() {
    var dc = doc();
    D.dirty = false;
    D.clean = dc ? { index: D.index, json: JSON.stringify(dc) } : null;
  }
  function drawingDirty() { return !!(D.active && D.dirty && doc() && UI.isDirty && UI.isDirty()); }
  // Don't Save: the drawing goes back to how it was when it was opened, made or saved (one undo step)
  function revertDrawing() {
    var c = D.clean, list = App.model && App.model.drawings;
    D.dirty = false;
    if (!c || !list || !list[c.index] || JSON.stringify(list[c.index]) === c.json) return;
    UI.pushUndo();
    list[c.index] = JSON.parse(c.json);
    UI.autosave();
  }
  // requestClose(): Close Drawing from the ribbon, the File and Window menus or the part tab under the sheet
  function requestClose() {
    if (!D.active) return;
    settle();
    if (D.inline) DW.closeInlineEdit(false);   // (a note being typed is placed first, as a click elsewhere places it)
    if (!drawingDirty()) { closeDrawing(); return; }
    UI.confirmDiscard(doc().name, function () { closeDrawing(); }, { dirty: true, onDiscard: function () { closeDrawing(); revertDrawing(); } });
  }
  // a save (File ▸ Save, the Save of "Save changes to …?") makes the open drawing clean too
  var baseMarkClean = UI.markClean;
  UI.markClean = function () { var r = baseMarkClean.apply(UI, arguments); if (D.active) markDrawingClean(); else D.dirty = false; return r; };

  // ------------------------------------------------------------------ DOM
  function ensureDom() {
    if (D.root) return;
    D.root = el('div', { id: 'drawing-doc', hidden: true });
    D.host = el('div', { id: 'drawing-sheet' });
    var tabs = el('div', { id: 'drawing-tabs' });
    D.root.appendChild(D.host);
    D.root.appendChild(tabs);
    UI.viewport.appendChild(D.root);
    D.tree = el('div', { id: 'drawing-tree', hidden: true });
    $('left').appendChild(D.tree);
    D.host.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    D.host.addEventListener('wheel', onWheel, { passive: false });
    D.host.addEventListener('dblclick', onDblClick);
    D.host.addEventListener('contextmenu', onContext);
    window.addEventListener('resize', function () { if (D.active) strokeFloor(); });
  }
  // the sheet tabs under the sheet (rfQ): one per sheet, the active one raised; a click activates a sheet, right-click
  // gives Add Sheet… / Delete / Rename / Properties… (SolidWorks' sheet tab menu), the tab after the last adds a sheet
  function renderTabs() {
    var tabs = $('drawing-tabs'), dc = doc();
    if (D.renaming != null) return;   // (a tab being renamed keeps its box until Enter / Esc)
    tabs.innerHTML = '';
    // (rfBI) SolidWorks' four sheet scroll arrows before the tabs: first / previous / next / last sheet
    var list = dc ? Drawing.sheets(dc) : [{ index: 0, name: 'Sheet1', active: true }], cur = dc ? dc.activeSheet | 0 : 0, last = list.length - 1;
    var nav = el('span', { class: 'dw-tab-nav' });
    [['first', 0, 'M10.5 4 L6 8 l4.5 4 M5 4 v8'], ['prev', cur - 1, 'M10 4 L5.5 8 l4.5 4'], ['next', cur + 1, 'M6 4 l4.5 4 L6 12'], ['last', last, 'M5.5 4 L10 8 l-4.5 4 M11 4 v8']].forEach(function (n) {
      var to = Math.max(0, Math.min(last, n[1]));
      var bt = nav.appendChild(el('button', { class: 'dw-nav dw-nav-' + n[0], title: { first: 'First sheet', prev: 'Previous sheet', next: 'Next sheet', last: 'Last sheet' }[n[0]], 'aria-label': n[0] + ' sheet',
        html: '<svg width="12" height="12" viewBox="0 0 16 16"><path d="' + n[2] + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
        onclick: function () { activateSheet(to); } }));
      bt.disabled = to === cur;
    });
    tabs.appendChild(nav);
    list.forEach(function (s) {
      tabs.appendChild(el('button', { class: 'dw-tab dw-sheet-tab' + (s.active ? ' active' : ''), text: s.name, 'data-sheet': String(s.index),
        title: s.name + (s.format ? ' (' + s.format + ', ' + s.scale + ')' : '') + (s.active ? '' : ': click to activate') + '. Right-click for Add Sheet, Delete, Rename, Properties.',
        onclick: function () { activateSheet(s.index); },
        oncontextmenu: function (e) { e.preventDefault(); e.stopPropagation(); UI.showMenu(e.clientX, e.clientY, sheetTabMenu(s.index)); } }));
    });
    tabs.appendChild(el('button', { class: 'dw-tab dw-add-sheet', html: '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 2.5 h7 l3 3 v8 H3 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M8 6.5 v5 M5.5 9 h5" stroke="#1f9d3a" stroke-width="1.6"/></svg>',
      title: 'Add Sheet', 'aria-label': 'Add Sheet', onclick: function () { addSheet(); } }));
    tabs.appendChild(el('span', { class: 'dw-sp' }));
    tabs.appendChild(el('button', { class: 'dw-tab', html: Icons(isAsm() ? 'assembly' : 'part', 14) + '<span>' + (App.model.name || 'Part') + '</span>', title: 'Switch to the ' + (isAsm() ? 'assembly' : 'part') + ' document (Window menu)', onclick: function () { requestClose(); } }));
  }
  // (rfBI) the status bar's right end while a drawing is open, as SolidWorks: Editing Sheet1 (Editing Sheet Format while
  // the format is edited), the sheet scale and the drawing's unit system; the part's items (rebuild, levels, Editing
  // Part) are hidden under it (drawing.css, #app.drawing-mode) and come back as the drawing closes
  function renderStatus() {
    var bar = $('statusbar'), dc = doc();
    if (!bar || !dc || !D.sheet) return;
    var st = $('dw-status');
    if (!st) { st = el('span', { id: 'dw-status' }); bar.insertBefore(st, $('status-right')); }
    var sh = Drawing.sheets(dc).filter(function (x) { return x.active; })[0] || {};
    var sc = String(sh.scale || '1:1').split(':').map(function (x) { return x.trim(); }).join(' : ');
    var items = [['dw-st-mode', D.formatEdit ? 'Editing Sheet Format' : 'Editing ' + dc.sheet.name, ''], ['dw-st-scale', sc, 'Sheet scale'], ['dw-st-units', D.sheet.units === 'in' ? 'IPS' : 'MMGS', 'Unit system']];
    var key = JSON.stringify(items);
    if (st._key === key) return;
    st._key = key; st.innerHTML = '';
    items.forEach(function (it) { st.appendChild(el('span', it[2] ? { class: it[0], text: it[1], title: it[2] } : { class: it[0], text: it[1] })); });
  }
  DW.renderStatus = renderStatus;

  // ------------------------------------------------------------------ sheets (rfQ)
  // activateSheet(i | name): the sheet comes up as a drawing opens (its views drop in from drawing-worker.js) and is
  // fitted to the window; the selection and any tool are dropped. Not an undo step (SolidWorks: switching sheets is not
  // an edit). -> true when that sheet is now active
  function activateSheet(which) {
    var dc = doc();
    if (!dc) return false;
    var i = Drawing.sheetIndex(dc, which);
    if (i < 0) return false;
    if (i === (dc.activeSheet | 0)) return true;
    settle();
    if (D.inline) DW.closeInlineEdit(false);
    Drawing.activateSheet(dc, i);
    D.sel = null; D.hover = null; D.tool = null; D.pending = null; D.vb = null;
    if (D.active) D.prog = { doc: dc, insert: false, t0: performance.now() };
    UI.autosave();
    if (D.active) { UI.refreshRibbon(); render(); fitSheet(); UI.setStatus('Sheet ' + dc.sheet.name + ' (' + (i + 1) + ' of ' + Drawing.sheetCount(dc) + ').'); }
    return true;
  }
  // addSheet(opts): Add Sheet (the tab after the last sheet tab, right-click ▸ Add Sheet…, the API): one undo step;
  // the new sheet takes the active one's format and becomes active. -> its index, or -1 when refused
  function addSheet(opts) {
    if (!doc()) return -1;
    try { Drawing.addSheet(JSON.parse(JSON.stringify(doc())), opts); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return -1; }
    if (D.inline) DW.closeInlineEdit(false);
    var i = -1;
    D.sel = null; D.tool = null; D.pending = null;
    edit(function (dc) { i = Drawing.addSheet(dc, opts); });
    fitSheet();
    UI.setStatus('Added ' + doc().sheet.name + ': Model View or Standard 3 View puts views on it; right-click its tab for Properties.');
    return i;
  }
  // deleteSheet(i, confirmed): SolidWorks asks first ("Delete Sheet2 and its views?"); the last sheet cannot go
  function deleteSheet(which, confirmed) {
    var dc = doc();
    if (!dc) return false;
    var i = Drawing.sheetIndex(dc, which);
    if (i < 0) return false;
    if (Drawing.sheetCount(dc) < 2) { UI.toast('A drawing keeps at least one sheet.'); return false; }
    var s = Drawing.sheets(dc)[i];
    if (!confirmed) {
      UI.showModal({ title: 'Confirm Delete', body: el('p', { text: 'Delete ' + s.name + (s.views ? ' and its ' + s.views + ' view' + (s.views === 1 ? '' : 's') : '') + '?' }), buttons: [
        { label: 'Yes', primary: true, action: function () { UI.closeModal(); deleteSheet(i, true); } },
        { label: 'No', action: UI.closeModal }
      ] });
      return false;
    }
    if (D.inline) DW.closeInlineEdit(false);
    D.sel = null; D.tool = null; D.pending = null;
    edit(function (d2) { var a = d2.activeSheet; Drawing.deleteSheet(d2, i); if (a === i) D.prog = { doc: d2, insert: false, t0: performance.now() }; });
    fitSheet();
    UI.setStatus('Deleted ' + s.name + '.');
    return true;
  }
  // renameSheet(i, name): one undo step; with no name the tab becomes a text box (Enter applies, Esc cancels)
  function renameSheet(which, name) {
    var dc = doc();
    if (!dc) return false;
    var i = Drawing.sheetIndex(dc, which);
    if (i < 0) return false;
    if (name == null) { startRenameTab(i); return false; }
    var nm = String(name).trim();
    if (nm === Drawing.sheets(dc)[i].name) return true;
    try { Drawing.renameSheet(JSON.parse(JSON.stringify(dc)), i, nm); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return false; }
    edit(function (d2) { Drawing.renameSheet(d2, i, nm); });
    return true;
  }
  function startRenameTab(i) {
    var tab = document.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="' + i + '"]');
    if (!tab) return;
    var old = Drawing.sheets(doc())[i].name, inp = el('input', { type: 'text', class: 'dw-tab-rename', value: old, spellcheck: 'false', 'aria-label': 'Sheet name' }), done = false;
    function finish(ok) {
      if (done) return; done = true;
      D.renaming = null;
      var v = inp.value;
      if (!ok || !renameSheet(i, v)) renderTabs();
    }
    D.renaming = i;
    tab.textContent = '';
    tab.appendChild(inp);
    inp.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); finish(true); } else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); } });
    inp.addEventListener('click', function (ev) { ev.stopPropagation(); });
    inp.addEventListener('blur', function () { finish(true); });
    try { inp.focus(); inp.select(); } catch (err) { }
  }
  // the sheet tab's menu (SolidWorks: Add Sheet…, Copy, Delete, Rename, Properties…); a right-click on another sheet's
  // tab activates that sheet first, so Properties… and the rest act on the sheet the tab names
  function sheetTabMenu(i) {
    var n = doc() ? Drawing.sheetCount(doc()) : 1;
    return [
      { label: 'Add Sheet…', action: function () { addSheet(); } },
      { label: 'Delete', disabled: n < 2, action: function () { deleteSheet(i); } },
      { label: 'Rename', action: function () { renameSheet(i); } },
      { label: 'Properties…', action: function () { if (activateSheet(i)) DW.cmdSheetProperties(); } },
      { sep: true },
      { label: 'Activate', checked: doc() && (doc().activeSheet | 0) === i, action: function () { activateSheet(i); } }
    ];
  }

  // ------------------------------------------------------------------ open / close
  // makeDrawing(opts): File ▸ Make Drawing from Part / Assembly. Reuses the document's first drawing or creates one
  // with Standard 3 View + Isometric (and, for an assembly, a Bill of Materials in the top-right corner of the sheet;
  // opts.bom === false leaves it out) as one undo step, then shows the drawing document.
  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function docKind() { return isAsm() ? 'assembly' : 'part'; }
  function makeDrawing(opts) {
    opts = opts || {};
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return null; }
    if (App.mode === 'sketch' && UI.exitSketch) UI.exitSketch();
    if (UI.hasPM && UI.hasPM()) UI.pmCancel();
    var list = App.model.drawings || [];
    if (!list.length || opts.fresh) {
      UI.pushUndo();
      App.model.drawings = list = list.concat([]);
      var dc = Drawing.newDrawing(App.model, Object.assign({ options: DW.defaultDocOptions() }, opts));
      syncBom(dc);
      // (the centre marks / centrelines of Auto insert need the views' linework: they go in once it is worked out)
      Drawing.standard3View(dc, App.mesh, units(), Object.assign({}, opts, { autoInsert: false }));
      list.push(dc);
      UI.autosave();
      D.index = list.length - 1;
    } else D.index = opts.index != null ? opts.index : 0;
    openDrawing({ insert: !!dc && opts.autoInsert !== false });
    return doc();
  }
  // openDrawing(o): shows the drawing at once (r12/drawui12): the sheet, its border and title block and a placeholder
  // where each view goes are drawn in the first frame; the views' hidden-line removal (100–200 ms for the four views of
  // a new drawing) runs in drawing-worker.js and each view drops in as it is done (D.prog until all are). Anything
  // that reads or edits the sheet first (a click, an API call, an export) finishes it on the spot (settle).
  // o.insert: run Auto insert (centre marks, centrelines) once the views are known.
  function openDrawing(o) {
    ensureDom();
    if (!doc()) return;
    var t0 = performance.now();
    D.active = true; D.sel = null; D.hover = null; D.tool = null; D.pending = null; D.vb = null; D.formatEdit = false;
    D.prog = { doc: doc(), insert: !!(o && o.insert), t0: t0 };
    markDrawingClean();
    $('app').classList.add('drawing-mode');
    D.root.hidden = false; D.tree.hidden = false;
    App.ribbonTab = 'View Layout';   // (SolidWorks' first drawing CommandManager tab, r12/drawui12)
    UI.refreshRibbon();
    UI.renderMenuBar();
    render();
    fitSheet();
    D.firstPaintMs = performance.now() - t0;
    UI.setStatus('Drawing ' + doc().name + (isAsm() ? ' of assembly ' + App.model.name + ': Auto Balloon numbers the components after the Bill of Materials' : '') + ': drag a view to move it, Smart Dimension (D) to dimension an edge or circle, wheel to zoom.');
  }
  // ownPM(): the open PropertyManager is one of the drawing's own (openDrawingPM marks #app with dw-pm). Closing the
  // drawing cancels only that one, never a part / assembly PM opened since (r14/fixes14).
  function ownPM() { return !!(UI.hasPM && UI.hasPM() && $('app').classList.contains('dw-pm')); }
  function closeDrawing() {
    if (!D.active) return;
    settle();
    if (ownPM()) UI.pmCancel();
    DW.closeInlineEdit(false);
    D.active = false; D.tool = null; D.pending = null;
    $('app').classList.remove('drawing-mode', 'dw-pm');
    D.root.hidden = true; D.tree.hidden = true;
    App.ribbonTab = 'Features';
    UI.setFmTab('tree');
    UI.refreshRibbon();
    UI.renderMenuBar();
    UI.refreshStatus();
    UI.setStatus((isAsm() ? 'Assembly ' : 'Part ') + App.model.name);
  }
  // detachDrawing(next): the document under the drawing went away (File ▸ New, Open, an example, Edit Part, or an undo
  // past Make Drawing): the drawing is put away at once, with no settle of its pending views and no queued redraw left
  // behind, and only a PropertyManager of its own is cancelled (r14/fixes14). next: the model about to be loaded.
  function detachDrawing(next) {
    D.renderQueued = false; D.renderFull = false; D.qtok = (D.qtok || 0) + 1;
    D.prog = null; D.drag = null; D.sheet = null; D.sheetMesh = null; D.sheetDoc = null;
    D.dirty = false; D.clean = null;
    if (!D.active) return;
    if (ownPM()) UI.pmCancel();
    if (D.inline) D.inline.autoCommit = false;   // (a note being typed belongs to the document going away)
    DW.closeInlineEdit(false);
    D.active = false; D.tool = null; D.pending = null; D.sel = null; D.hover = null;
    $('app').classList.remove('drawing-mode', 'dw-pm');
    D.root.hidden = true; D.tree.hidden = true;
    var m = next || App.model;
    App.ribbonTab = m && m.type === 'assembly' ? 'Assembly' : 'Features';
    UI.setFmTab('tree');
    UI.refreshRibbon();
    UI.renderMenuBar();
  }

  // ------------------------------------------------------------------ render
  // render(light): works the sheet out again and patches the SVG in place, layer by layer: only the layers whose
  // markup changed are parsed again (a dragged dimension re-parses the DIMENSIONS layer, not the views' thousands of
  // edges), the sheet never goes blank between two states, and the pan / zoom and overlay stay (r3/drawings3).
  // light: a drag frame, the FeatureManager and the tabs are left alone.
  function render(light) {
    if (!D.active) return;
    var dc = doc();
    if (!dc) { detachDrawing(); return; }
    var t0 = performance.now();
    // this render answers any queued one (a queued full render makes this one full)
    if (D.renderQueued && D.renderFull) light = false;
    D.qtok = (D.qtok || 0) + 1; D.renderQueued = false; D.renderFull = false;
    syncBom(dc);
    if (dc.layout === 'auto') Drawing.layout(dc, mesh(), units());
    if (D.prog && D.prog.doc !== dc) D.prog = null;   // (undo / another drawing: nothing left to finish)
    // the part changed under the open drawing (a rebuild, OpenCascade's exact solid, undo): the last sheet stays on
    // screen while the new views are worked out in the worker, then the new sheet replaces it in one go, as SolidWorks
    // updates a drawing after a rebuild (no freeze of 100–250 ms at a moment the user did not choose, no blank views)
    var m = mesh(), old = D.sheet;
    if (!D.prog && old && D.sheetMesh && D.sheetMesh !== m && D.sheetDoc === dc) D.prog = { doc: dc, insert: false, t0: t0, hold: true };
    // (rfDR2) every render is lazy unless settling: an edit that needs a projection not worked out yet (a view's tangent
    // edges or display style changed from the mouse or a script, an undo onto a rebuilt mesh) shows the placeholder and
    // has it worked out in the worker, as editView does. Readers settle (summary, current, a click, an export) or
    // await ready().
    var lazy = D.prog ? !D.prog.sync : true;
    D.sheet = Drawing.compute(dc, m, App.model, lazy ? Object.assign(cctx(), { lazy: true }) : cctx());
    if (!D.prog && lazy && D.sheet.pending.length) D.prog = { doc: dc, insert: false, t0: t0 };
    if (D.prog) {
      if (lazy && D.sheet.pending.length) {
        requestProjections(D.sheet.pending);
        if (D.prog.hold && old) { D.sheet = old; return; }
      } else { var pg = D.prog; D.prog = null; if ((pg.insert || pg.ids) && Drawing.autoInsert(dc, m, pg.ids || undefined)) { UI.autosave(); D.sheet = Drawing.compute(dc, m, App.model, cctx()); if (!D.dirty) markDrawingClean(); } D.openMs = performance.now() - pg.t0; }
    }
    D.sheetMesh = m; D.sheetDoc = dc;
    // (rfJB) what the sheet could not place cleanly (a Bend Table with no free paper) goes to the status bar once
    var wn = (D.sheet.warnings || []).join(' ');
    if (wn && wn !== D.lastWarn && UI.setStatus) UI.setStatus(wn);
    D.lastWarn = wn;
    D.occtDrove = !!(UI.occt && UI.occt.status && UI.occt.status().driving);
    D.rendered = {};
    D.sheet.views.forEach(function (w) { D.rendered[w.view.id] = [w.view.x, w.view.y]; });
    patchSheet(Drawing.svgParts(D.sheet, { live: true }));
    applyViewBox();
    drawOverlay();
    if (light !== true) { DW.renderTree(); renderTabs(); }
    renderStatus();
    $('doc-title').textContent = dc.name + ' - ' + dc.sheet.name;
    D.lastRenderMs = performance.now() - t0;
  }
  // Views worked out off the main thread (r12/drawui12): drawing-worker.js gets the mesh once, then one message per
  // view, and answers each with its projection, which goes into the mesh's projection cache; the sheet is drawn again
  // as each one lands. Without workers (or when one fails) the views are worked out here, one per task, so the page
  // still paints between them.
  var PJ = { worker: null, off: false, mesh: null, id: 0, jobs: {}, tick: 0, flushT: 0 };
  function projWorker() {
    if (PJ.off || typeof Worker === 'undefined' || performance.now() < (PJ.coolUntil || 0)) return null;
    if (!PJ.worker) {
      try { PJ.worker = new Worker('drawing-worker.js'); } catch (err) { PJ.off = true; return null; }
      PJ.worker.onmessage = onProjected;
      var me = PJ.worker;
      PJ.worker.onerror = function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();   // (handled: the views are worked out here instead)
        if (PJ.worker !== me) return;   // (a worker already dropped)
        // (rfDN) a worker that failed to start (a script that did not load from a busy local server) is tried again
        // with the next views once a pause has passed (1 s per failure so far, at most 10 s; meanwhile the views are
        // worked out here). The new one is sent the mesh again.
        PJ.why = String(ev && ev.message || 'worker error'); PJ.fails = (PJ.fails || 0) + 1; PJ.coolUntil = performance.now() + Math.min(10000, 1000 * PJ.fails); PJ.worker = null; PJ.sent = false;
        var jobs = PJ.jobs; Object.keys(jobs).forEach(function (k) { if (jobs[k].posted) projectHere(jobs[k]); });
      };
    }
    return PJ.worker;
  }
  // a busy worker is dropped when what it works on is no longer wanted (the next drawing does not queue behind it)
  function dropBusyWorker() {
    var busy = Object.keys(PJ.jobs).some(function (k) { return PJ.jobs[k].posted; });
    if (PJ.worker && busy) { PJ.worker.terminate(); PJ.worker = null; }
  }
  // the jobs are posted in a task of their own, after the first paint (and never when a script settles the drawing
  // in the same task, as anvil.drawing.make() does)
  function requestProjections(list) {
    var m = mesh();
    if (PJ.mesh !== m) { dropBusyWorker(); PJ.mesh = m; PJ.id++; PJ.jobs = {}; PJ.sent = false; }
    list.forEach(function (j) {
      if (!PJ.jobs[j.key]) PJ.jobs[j.key] = { key: j.key, frame: j.frame, display: j.display, tangent: j.tangent, section: j.section || null, mesh: m, id: PJ.id, posted: false };
    });
    if (!PJ.flushT) PJ.flushT = setTimeout(flushProjections, 0);
  }
  function flushProjections() {
    PJ.flushT = 0;
    var m = PJ.mesh, w = null;
    Object.keys(PJ.jobs).forEach(function (k) {
      var job = PJ.jobs[k];
      if (job.posted || job.id !== PJ.id) return;
      job.posted = true;
      if (!w && !PJ.off) w = projWorker();
      if (w) {
        try {
          if (!PJ.sent) {
            var copy = {};
            Object.keys(m).forEach(function (q) { if (q.indexOf('_drawing') !== 0) copy[q] = m[q]; });
            w.postMessage({ type: 'mesh', id: PJ.id, mesh: copy });
            PJ.sent = true;
          }
          if (job.section) w.postMessage({ type: 'section', id: PJ.id, job: job.key, section: job.section, frame: job.frame, display: job.display, tangent: job.tangent });
          else w.postMessage({ type: 'project', id: PJ.id, job: job.key, frame: job.frame, display: job.display, tangent: job.tangent });
          return;
        } catch (err) { PJ.why = String(err && err.message || err); PJ.off = true; w = null; }
      }
      projectHere(job);
    });
  }
  // the main-thread fallback: one view per task
  function projectHere(job) {
    setTimeout(function () {
      if (job.id !== PJ.id || !D.prog || !PJ.jobs[job.key]) return;
      var c = job.mesh._drawingProj;
      if (job.section) Drawing.putSection(job.mesh, job.section, job.frame, job.display, job.tangent, Drawing.sectionJob(job.mesh, job.section, job.frame, job.display, job.tangent));
      else if (!(c && c[job.key])) Drawing.putProjection(job.mesh, job.key, Drawing.projectView(job.mesh, job.frame, { display: job.display, tangent: job.tangent }));
      landed(job);
    }, 0);
  }
  function onProjected(ev) {
    var d = ev.data || {}, job = PJ.jobs[d.job];
    if (d.id !== PJ.id || !job) return;
    if (d.type === 'projected') { Drawing.putProjection(job.mesh, job.key, d.proj); landed(job); }
    else if (d.type === 'sectioned') { Drawing.putSection(job.mesh, job.section, job.frame, job.display, job.tangent, d.result); landed(job); }
    else projectHere(job);
  }
  // a view is done: the sheet is drawn again (once for views landing together)
  function landed(job) {
    delete PJ.jobs[job.key];
    if (PJ.tick) return;
    PJ.tick = setTimeout(function () { PJ.tick = 0; if (D.active && D.prog && mesh() === job.mesh) render(true); }, 0);
  }
  // settle(): finishes a drawing that is still being worked out, here and now (the views left are worked out on the
  // main thread), so a click, an export or a script sees the whole sheet
  // (rfHO) and a redraw still queued is done now: a queued render can wait up to 3 s for OpenCascade's exact solid
  // (occtSwapComing), and a reader (hatchRegions, an export, a click) must not see the sheet from before an undo
  function settle() {
    if (!D.active) return;
    if (!D.prog && D.renderQueued) render(true);
    if (!D.prog) return;
    dropBusyWorker();
    PJ.id++; PJ.mesh = null; PJ.jobs = {};
    D.prog.sync = true;
    render();
  }
  // a promise for when the drawing on screen is complete (tests; the views land in a few hundred ms at most)
  // (rfHO) a redraw still queued counts too (it waits for OpenCascade's exact solid at most ~3 s; after 4 s it is done)
  function ready() {
    var t0 = performance.now();
    return new Promise(function (res) {
      (function poll() {
        if (!D.active || (!D.prog && !D.renderQueued)) res();
        else if (!D.prog && performance.now() - t0 > 4000) { render(true); res(); }
        else setTimeout(poll, 10);
      })();
    });
  }
  // the sheet SVG from svgParts: built whole the first time (or when the sheet size or the list of layers changed),
  // afterwards only the changed layers' contents are replaced; transforms left by a live view drag are cleared
  function patchSheet(P) {
    var s = svgEl(), keys = P.groups.map(function (g) { return g.open; }).join('\n');
    if (!s || D.svgHead !== P.head || D.svgKeys !== keys) {
      D.host.innerHTML = P.head + '\n' + P.bg + '\n' + P.groups.map(function (g) { return g.open + '\n' + g.body + '\n</g>'; }).join('\n') + '\n</svg>';
      s = svgEl();
      s.setAttribute('width', '100%'); s.setAttribute('height', '100%');
      s.appendChild(document.createElementNS(NS, 'g')).setAttribute('id', 'dw-overlay');
      crispLines(s);
      D.svgHead = P.head; D.svgKeys = keys; D.svgBodies = P.groups.map(function (g) { return g.body; });
      D.patched = P.groups.length;
      return;
    }
    var nodes = s.querySelectorAll(':scope > g[data-layer]'), n = 0;
    P.groups.forEach(function (g, i) {
      var node = nodes[i];
      if (!node) return;
      if (D.svgBodies[i] !== g.body) { node.innerHTML = g.body; D.svgBodies[i] = g.body; n++; crispLines(node); }
      else if (D.shifted) {
        if (node.hasAttribute('transform')) node.removeAttribute('transform');
        var sub = node.querySelectorAll('g[transform]');
        for (var j = 0; j < sub.length; j++) sub[j].removeAttribute('transform');
      }
      if (node.hasAttribute('transform')) node.removeAttribute('transform');
    });
    D.shifted = false;
    D.patched = n;
  }
  // a dragged view follows the mouse at full frame rate: its layer (and its dimensions, annotations and balloons, and
  // the aligned views that move with it) is translated where it was drawn; the sheet is worked out again on release
  function liveShift() {
    var s = svgEl();
    if (!s || !D.sheet || !D.rendered) return;
    D.sheet.views.forEach(function (w) {
      var o = liveOffset(w.view.id), dx = o[0], dy = o[1], tr = dx || dy ? 'translate(' + dx + ' ' + (-dy) + ')' : null;
      var nodes = s.querySelectorAll('g[data-view="' + w.view.id + '"], g[data-of="' + w.view.id + '"]');
      for (var i = 0; i < nodes.length; i++) { if (tr) nodes[i].setAttribute('transform', tr); else nodes[i].removeAttribute('transform'); }
      if (tr) D.shifted = true;
    });
  }
  // how far a view has been dragged since the sheet was last worked out (paper units)
  function liveOffset(id) {
    var r = D.rendered && D.rendered[id], v = r && doc() && Drawing.findView(doc(), id);
    return v ? [v.x - r[0], v.y - r[1]] : [0, 0];
  }
  // The sheet was drawn from OpenCascade's exact solid and the part has just been rebuilt by Anvil's kernel, with
  // OpenCascade's build of it on the way: the drawing keeps its last sheet rather than redraw Anvil's approximation
  // (facet edges, a swept handle's chords) and then the exact solid again a moment later (r3/drawings3). ui-occt.js
  // says when a build is queued, running or held (UI.occt.pending, r4/drawings4); the sheet waits for it up to 3 s.
  function occtSwapComing(since) {
    if (!D.occtDrove || !UI.occt || !UI.occt.on || !UI.occt.on()) return false;
    var st = UI.occt.status(), dt = performance.now() - since;
    if (st.driving || dt > 3000) return false;
    if (UI.occt.pending) return UI.occt.pending();
    return dt < 1500 && (st.state === 'building' || dt < 250);
  }
  function queueRender(light) {
    if (light !== true) D.renderFull = true;
    if (D.renderQueued) return;
    D.renderQueued = true;
    // the next frame, or 60 ms when frames are throttled (a page in a background tab / pane): a part change still
    // redraws the sheet. While OpenCascade is about to swap its exact solid in for Anvil's approximation (UI.holdFrame,
    // ui-occt.js), the sheet keeps its last drawing instead of flashing the approximation's facet edges first.
    var tok = D.qtok, since = performance.now(), go = function () {
      if (tok !== D.qtok || !D.renderQueued) return;   // answered by a render since
      var hold = App.holdFrameUntil && App.holdFrameUntil - performance.now();
      if (!(hold > 0) && occtSwapComing(since)) hold = 40;
      if (hold > 0 && D.renderFull && !D.drag) { setTimeout(go, Math.min(hold + 5, 40)); return; }
      render(!D.renderFull);
    };
    requestAnimationFrame(go); setTimeout(go, 60);
  }
  function svgEl() { return D.host && D.host.querySelector('svg'); }
  function applyViewBox() {
    var s = svgEl();
    if (!s || !D.sheet) return;
    if (!D.vb) D.vb = fitBox();
    s.setAttribute('viewBox', D.vb.x + ' ' + D.vb.y + ' ' + D.vb.w + ' ' + D.vb.h);
    strokeFloor();
    DW.positionInlineEdit();
  }
  // Line weights on screen (r12/drawui12): the sheet draws its lines at their paper widths (0.25–0.7 mm), which at the
  // zoom that fits an A3 sheet in the window comes out at 0.4–0.6 px for thin, hidden and hatch lines: faint grey
  // smudges. Like SolidWorks, the screen keeps every line at least about a pixel wide (visible and thick edges a
  // little more) while zoomed out; zoomed in, the paper widths show. Exports always use the paper widths.
  // (rfHB, user 2026-11-03 "clean, sharp and professional") The floors are whole DEVICE pixels, so a hairline is one
  // crisp pixel row at 100 %, 125 % and 150 % display scaling, never a 1.5-pixel grey smear: hairlines (dimension,
  // extension, centre, hidden, hatch, bend lines) 1 device px (2 from 200 %), visible edges 1.5 CSS px rounded
  // (2 / 2 / 2 / 3 device px at 1 / 1.25 / 1.5 / 2), thick lines (border, title block frame) one more, the section
  // line as visible. SolidWorks' screen hierarchy: outlines clearly heavier than everything that annotates them.
  var MIN_PX = { visible: 1.5, thick: 2.5, chain: 1.5, hidden: 1, thin: 1, center: 1, tangent: 1, tanfont: 1, hatch: 1, bendup: 1, benddown: 1, etch: 1 };
  var HAIR = { hidden: 1, thin: 1, center: 1, tangent: 1, tanfont: 1, hatch: 1, bendup: 1, benddown: 1, etch: 1 };
  function devPx(c) {
    var dpr = window.devicePixelRatio || 1;
    var d = HAIR[c] ? Math.max(1, Math.floor(dpr + 0.01)) : Math.max(2, Math.round(MIN_PX[c] * dpr));
    if (c === 'thick') d = Math.max(d, devPx('visible') + 1);
    return d / dpr;
  }
  DW.devPx = devPx;
  // axis-aligned <line>s (borders, title block, dimension and extension lines, most model edges of orthographic views)
  // are snapped to the device pixel grid; slanted lines, arcs and circles stay anti-aliased (crispEdges would step them)
  function crispLines(root) {
    if (!root) return;
    var ls = root.getElementsByTagName('line');
    for (var i = 0; i < ls.length; i++) {
      var l = ls[i];
      if (l.getAttribute('x1') === l.getAttribute('x2') || l.getAttribute('y1') === l.getAttribute('y2')) l.setAttribute('shape-rendering', 'crispEdges');
    }
  }
  DW.crispLines = crispLines;
  function strokeFloor() {
    var st = D.strokeStyle;
    if (!st) { st = D.strokeStyle = document.createElement('style'); st.id = 'dw-stroke-floor'; document.head.appendChild(st); }
    var w = D.host ? D.host.clientWidth : 0, h = D.host ? D.host.clientHeight : 0;
    if (!w || !h || !D.vb || !D.sheet) return;
    var ppu = Math.min(w / D.vb.w, h / D.vb.h), k = D.sheet.units === 'in' ? 1 / 25.4 : 1;
    // (in steps of about 6 %, so a smooth zoom restyles the sheet a few times, not on every frame)
    var q = Math.round(Math.log(ppu) / 0.06), dpr = window.devicePixelRatio || 1;
    if (q === D.strokeQ && dpr === D.strokeDpr) return;
    D.strokeQ = q; D.strokeDpr = dpr;
    // (rfHB) paper units per CSS px at the zoom now, plus the most the zoom drifts before the next restyle (half a
    // step), so a floor of one device pixel never comes out at 0.97 px and drops out between restyles
    var px = Math.exp(0.03) / ppu, css = '';
    Object.keys(MIN_PX).forEach(function (c) {
      var paper = (Drawing.STROKE[c] || 0.25) * k, need = devPx(c) * px;
      if (need > paper) css += '#drawing-sheet svg .' + c + '{stroke-width:' + +need.toPrecision(4) + 'px}';
    });
    // (rfBI) the sheet's shadow, down and to the right as SolidWorks draws it, the same few screen pixels at any zoom
    // and in either paper unit (a filter's lengths on an SVG element are in the sheet's units)
    var sp = function (n) { return +(n * px).toPrecision(3) + 'px'; };
    // (rfHB) a one-pixel edge first, so the paper reads as a sheet on either desk, then a soft shadow down-right
    css += '#drawing-sheet .sheet-bg{filter:drop-shadow(0 0 ' + sp(0.6) + ' rgba(0,0,0,0.5)) drop-shadow(' + sp(2) + ' ' + sp(3) + ' ' + sp(4) + ' rgba(0,0,0,0.3))}';
    if (st.textContent !== css) st.textContent = css;
  }
  function fitBox() {
    var S = D.sheet.size, m = Math.max(S[0], S[1]) * 0.03;
    return { x: -m, y: -m, w: S[0] + 2 * m, h: S[1] + 2 * m };
  }
  function fitSheet() { stopVbAnim(); ZM.pending = 0; D.vb = null; applyViewBox(); }
  // client px -> paper coordinates (y up)
  function toPaper(ev) {
    var s = svgEl();
    if (!s) return [0, 0];
    var pt = s.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    var m = s.getScreenCTM();
    if (!m) return [0, 0];
    var q = pt.matrixTransform(m.inverse());
    return [q.x, D.sheet.size[1] - q.y];
  }
  function pxToPaper(px) {
    var s = svgEl(), m = s && s.getScreenCTM();
    return m ? px / m.a : px;
  }
  var NS = 'http://www.w3.org/2000/svg';
  function svgNode(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  // the pointer says what a click does (r12/drawui12): a crosshair while a tool waits for a pick or a placement, the
  // move cursor over anything a drag moves (a view, a dimension, a balloon, an annotation, the BOM)
  function updateCursor() {
    if (!D.host) return;
    var h = D.hover, mv = !D.tool && !!h && h.kind !== 'edge';
    D.host.classList.toggle('dw-cur-tool', !!D.tool);
    D.host.classList.toggle('dw-cur-move', mv);
  }
  // (rfBI) SolidWorks colours a dimension itself on the screen: selected blue, pre-selected (under the pointer) orange,
  // a reference dimension added on the sheet (not a model item) grey; paper and every export (SVG / PDF / DXF) stay
  // black, since this only sets data-tint on the live sheet's elements (drawing.css). Drawing.svgParts writes the
  // DIMENSIONS layer one element per primitive, in order, so element i is the layer's primitive i (a dimension's
  // primitives carry dimIx, its index in sheet.dims). -> false when the counts disagree (nothing tinted)
  function tintDims() {
    var s = svgEl(), g = s && D.sheet && s.querySelector(':scope > g[data-layer="DIMENSIONS"]');
    if (!g) return false;
    var els = g.querySelectorAll(':scope > :not(g), :scope > g[data-of] > *');
    var ps = D.sheet.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k !== 'pending'; });
    if (els.length !== ps.length) return false;
    var sel = -1, hov = -1;
    D.sheet.dims.forEach(function (d, i) {
      if (D.sel && D.sel.kind === 'dim' && dimMatches(D.sel, d)) sel = i;
      else if (D.hover && D.hover.kind === 'dim' && dimMatches(D.hover, d)) hov = i;
    });
    for (var i = 0; i < els.length; i++) {
      var ix = ps[i].dimIx, d = ix != null ? D.sheet.dims[ix] : null;
      var t = !d ? '' : ix === sel ? 'sel' : ix === hov ? 'pre' : !d.auto && !d.dangling ? 'ref' : '';
      if ((els[i].getAttribute('data-tint') || '') !== t) { if (t) els[i].setAttribute('data-tint', t); else els[i].removeAttribute('data-tint'); }
    }
    return true;
  }
  function drawOverlay() {
    updateCursor();
    // (lane drawing) Hide/Show Annotations turned on or off (its button, Esc, another tool): the sheet is worked out again
    // so hidden annotations show grey while it runs and go when it ends
    var shNow = D.tool === 'sk:hideann';
    if (D.sheet && !!D.sheetShowHidden !== shNow) { D.sheetShowHidden = shNow; queueRender(); }
    var s = svgEl(), g = s && s.querySelector('#dw-overlay');
    if (!g) return;
    g.innerHTML = '';
    var tinted = tintDims();
    var H = D.sheet.size[1], pad = 2 * paperK(), vpad = 3 * paperK(), sw = pxToPaper(devPx('visible'));   // (rfHB: whole device pixels, crisp; 2 px at 100 %) (a view's frame is where a click takes the view: viewAt's margin)
    D.sheet.views.forEach(function (w) {
      var sel = D.sel && D.sel.kind === 'view' && D.sel.id === w.view.id, hov = D.hover && (D.hover.kind === 'view' && D.hover.id === w.view.id || D.hover.pre && D.hover.view === w.view.id);
      if (!sel && !hov) return;
      var o = liveOffset(w.view.id);
      svgNode('rect', { class: 'dw-vbox' + (sel ? ' sel' : ' pre'), x: w.box.x0 + o[0] - vpad, y: H - w.box.y1 - o[1] - vpad, width: w.box.x1 - w.box.x0 + 2 * vpad, height: w.box.y1 - w.box.y0 + 2 * vpad, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g);
    });
    D.sheet.dims.forEach(function (d) {
      var sel = D.sel && D.sel.kind === 'dim' && dimMatches(D.sel, d), hov = D.hover && D.hover.kind === 'dim' && dimMatches(D.hover, d);
      if (!sel && !hov || !d.box) return;
      // (rfBI) the dimension itself turns blue / orange (tintDims); the frame only when that could not be done
      if (!tinted) svgNode('rect', { class: 'dw-dbox' + (sel ? ' sel' : ' pre'), x: d.box.x0 - pad / 2, y: H - d.box.y1 - pad / 2, width: d.box.x1 - d.box.x0 + pad, height: d.box.y1 - d.box.y0 + pad, 'stroke-width': sw }, g);
      // the selected dimension's arrow handles: click one to flip the arrows (r4/drawings4)
      if (sel && DW.FLIP_KINDS[d.kind] && d.arrows && !(D.drag && D.drag.moved)) d.arrows.forEach(function (a) { svgNode('circle', { class: 'dw-handle', cx: a[0], cy: H - a[1], r: pxToPaper(3.2), 'stroke-width': sw }, g); });
    });
    if (D.snapGuide) svgNode('line', { class: 'dw-guide', x1: D.snapGuide.a[0], y1: H - D.snapGuide.a[1], x2: D.snapGuide.b[0], y2: H - D.snapGuide.b[1], 'stroke-width': sw, 'stroke-dasharray': pxToPaper(4) + ' ' + pxToPaper(3) }, g);
    if (D.sel && D.sel.kind === 'bom' && D.sheet.bom) { var bb = D.sheet.bom.box; svgNode('rect', { class: 'dw-vbox sel', x: bb.x0 - pad, y: H - bb.y1 - pad, width: bb.x1 - bb.x0 + 2 * pad, height: bb.y1 - bb.y0 + 2 * pad, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g); }
    (D.sheet.balloons || []).forEach(function (b) {
      var bsel = D.sel && D.sel.kind === 'balloon' && D.sel.view === b.view && (D.sel.index != null ? D.sel.index === b.index : D.sel.key === b.key && D.sel.component === b.component);
      var bhov = D.hover && D.hover.kind === 'balloon' && D.hover.view === b.view && D.hover.index === b.index;
      if (bsel || bhov) svgNode('circle', { class: 'dw-hot' + (bsel ? '' : ' pre'), cx: b.c[0], cy: H - b.c[1], r: b.r + pad / 2, 'stroke-width': pxToPaper(2) }, g);
    });
    (D.sheet.notes || []).forEach(function (n) {
      var nsel = D.sel && D.sel.kind === 'note' && D.sel.id === n.id, nhov = D.hover && D.hover.kind === 'note' && D.hover.id === n.id;
      if (!(nsel || nhov) || !isFinite(n.box.x0)) return;
      svgNode('rect', { class: 'dw-dbox' + (nsel ? ' sel' : ' pre'), x: n.box.x0 - pad / 2, y: H - n.box.y1 - pad / 2, width: n.box.x1 - n.box.x0 + pad, height: n.box.y1 - n.box.y0 + pad, 'stroke-width': sw }, g);
    });
    // (rfM) shop symbols and the Revision Table
    (D.sheet.symbols || []).forEach(function (y) {
      var ysel = D.sel && D.sel.kind === 'symbol' && D.sel.id === y.id, yhov = D.hover && D.hover.kind === 'symbol' && D.hover.id === y.id;
      if (!(ysel || yhov) || !isFinite(y.box.x0)) return;
      if (y.pts) {
        // (rfCU) a multi-jog leader: its polyline highlighted, a handle on each bend point when selected (drag it)
        svgNode('polyline', { class: 'dw-vbox' + (ysel ? ' sel' : ' pre'), points: y.pts.map(function (q) { return q[0] + ',' + (H - q[1]); }).join(' '), fill: 'none', 'stroke-width': pxToPaper(2) }, g);
        if (ysel) y.pts.slice(1, -1).forEach(function (q) { var hs = pxToPaper(3); svgNode('rect', { class: 'dw-dbox sel', x: q[0] - hs, y: H - q[1] - hs, width: 2 * hs, height: 2 * hs, 'stroke-width': sw }, g); });
        return;
      }
      svgNode('rect', { class: 'dw-dbox' + (ysel ? ' sel' : ' pre'), x: y.box.x0 - pad / 2, y: H - y.box.y1 - pad / 2, width: y.box.x1 - y.box.x0 + pad, height: y.box.y1 - y.box.y0 + pad, 'stroke-width': sw }, g);
    });
    if (D.sheet.revisions && ((D.sel && D.sel.kind === 'revtable') || (D.hover && D.hover.kind === 'revtable'))) {
      var rb = D.sheet.revisions.box, rsel = D.sel && D.sel.kind === 'revtable';
      svgNode('rect', { class: 'dw-dbox' + (rsel ? ' sel' : ' pre'), x: rb.x0 - pad / 2, y: H - rb.y1 - pad / 2, width: rb.x1 - rb.x0 + pad, height: rb.y1 - rb.y0 + pad, 'stroke-width': sw }, g);
    }
    (D.sheet.annotations || []).forEach(function (a) {
      var asel = D.sel && D.sel.kind === 'annot' && D.sel.id === a.id, ahov = D.hover && D.hover.kind === 'annot' && D.hover.id === a.id;
      if (!(asel || ahov) || a.hidden || !isFinite(a.box.x0)) return;
      svgNode('rect', { class: 'dw-dbox' + (asel ? ' sel' : ' pre'), x: a.box.x0 - pad / 2, y: H - a.box.y1 - pad / 2, width: a.box.x1 - a.box.x0 + pad, height: a.box.y1 - a.box.y0 + pad, 'stroke-width': sw }, g);
    });
    if (D.tool === 'centermark' && D.pending && D.pending.view != null) {
      var cw = DW.sheetView(D.pending.view);
      if (cw) D.pending.holes.forEach(function (h0) { var q0 = cw.toSheet(h0.c); svgNode('circle', { class: 'dw-hot', cx: q0[0], cy: H - q0[1], r: h0.r * cw.scale, 'stroke-width': pxToPaper(3) }, g); });
    }
    if ((D.tool === 'balloon' || D.tool === 'stackballoon') && D.pending && D.pending.item && !D.pending.placed && D.pending.at) {
      var bw = DW.sheetView(D.pending.view), ap = bw ? bw.toSheet(D.pending.attach) : D.pending.cp;
      svgNode('line', { class: 'dw-cut', x1: ap[0], y1: H - ap[1], x2: D.pending.at[0], y2: H - D.pending.at[1], 'stroke-width': pxToPaper(1.5) }, g);
      svgNode('circle', { class: 'dw-cut', cx: D.pending.at[0], cy: H - D.pending.at[1], r: 5 * paperK(), 'stroke-width': pxToPaper(1.5) }, g);
    }
    if (D.tool === 'dim' && DW.smartDimOverlay) DW.smartDimOverlay(g, H, svgNode);   // (rfS)
    if (DW.ctOverlay) DW.ctOverlay(g, H, svgNode);   // (lane CT) Angular Running / Path Length picks
    if (D.hover && D.hover.kind === 'entity') {
      var h = D.hover, hc = 'dw-hot' + (h.pre ? ' pre' : ''), hw = pxToPaper(h.pre ? 2.4 : 3);
      if (h.circle) svgNode('circle', { class: hc, cx: h.circle.c[0], cy: H - h.circle.c[1], r: h.circle.r, 'stroke-width': hw }, g);
      else if (h.arc) {
        var ha = h.arc, h0 = ha.a0 * Math.PI / 180, h1 = ha.a1 * Math.PI / 180;
        svgNode('path', { class: hc, d: 'M' + (ha.c[0] + ha.r * Math.cos(h0)) + ' ' + (H - ha.c[1] - ha.r * Math.sin(h0)) + ' A' + ha.r + ' ' + ha.r + ' 0 ' + (ha.a1 - ha.a0 > 180 ? 1 : 0) + ' 0 ' + (ha.c[0] + ha.r * Math.cos(h1)) + ' ' + (H - ha.c[1] - ha.r * Math.sin(h1)), fill: 'none', 'stroke-width': hw }, g);
      } else if (h.ellipse) svgNode('path', { class: hc, d: ellipsePath(h.ellipse.pts, H), fill: 'none', 'stroke-width': hw }, g);
      else svgNode('line', { class: hc, x1: h.a[0], y1: H - h.a[1], x2: h.b[0], y2: H - h.b[1], 'stroke-width': hw }, g);
    }
    function ghost(cx, cy, gw, gh) { svgNode('rect', { class: 'dw-ghost', x: cx - gw / 2, y: H - cy - gh / 2, width: gw, height: gh, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g); }
    var P = D.pending;
    if (D.tool === 'place' && P && P.at) ghost(P.at[0], P.at[1], P.w, P.h);
    if (D.tool === 'project' && P && P.parent != null && P.at) { var pl = DW.projectPlacement(P.at); if (pl) ghost(pl.x, pl.y, pl.w, pl.h); }
    if (D.tool === 'section' && P && P.at) {
      // (rfW) a half / offset / aligned cutting line shows every leg while it is clicked, the one to come at the pointer
      var sl = P.parent != null ? (P.partial && DW.partialLine ? DW.partialLine(P) : P.line) : DW.sectionLineAt(P.at), sdash = pxToPaper(12) + ' ' + pxToPaper(3) + ' ' + pxToPaper(3) + ' ' + pxToPaper(3);
      var legs = P.parent != null && DW.sectionPreview ? DW.sectionPreview(P) : null;
      if (legs) svgNode('polyline', { class: 'dw-cut dw-legs', points: legs.pts.map(function (q) { return q[0] + ',' + (H - q[1]); }).join(' '), fill: 'none', 'stroke-width': pxToPaper(2), 'stroke-dasharray': sdash }, g);
      else if (sl) svgNode('line', { class: 'dw-cut', x1: sl.a[0], y1: H - sl.a[1], x2: sl.b[0], y2: H - sl.b[1], 'stroke-width': pxToPaper(2), 'stroke-dasharray': sdash }, g);
      if (P.parent != null && (!legs || legs.ghost) && !(P.partial && P.to == null)) { var sp = DW.sectionPlacement(P.at); if (sp) ghost(sp.x, sp.y, sp.w, sp.h); }
    }
    if (D.tool === 'detail' && P && P.parent != null && P.pts) {
      // (rfCQ) a sketched profile: its outline on the parent, the enlarged view's box at the pointer
      var pw0 = DW.sheetView(P.parent);
      if (pw0) {
        var PS = P.pts.map(pw0.toSheet), xs = PS.map(function (q) { return q[0]; }), ys = PS.map(function (q) { return q[1]; });
        svgNode('polygon', { class: 'dw-cut', points: PS.map(function (q) { return q[0] + ',' + (H - q[1]); }).join(' '), fill: 'none', 'stroke-width': pxToPaper(2) }, g);
        if (P.at) { var pk0 = Drawing.scaleValue(P.scale) / pw0.scale; ghost(P.at[0], P.at[1], (Math.max.apply(null, xs) - Math.min.apply(null, xs)) * pk0, (Math.max.apply(null, ys) - Math.min.apply(null, ys)) * pk0); }
      }
    } else if (D.tool === 'detail' && P && P.parent != null && P.profile) {
      // (rfZ) a Profile: the rectangle from the first corner to the pointer, then the enlarged view at the pointer
      var q2 = P.cp2 || P.at;
      if (q2) svgNode('rect', { class: 'dw-cut', x: Math.min(P.cp[0], q2[0]), y: H - Math.max(P.cp[1], q2[1]), width: Math.abs(q2[0] - P.cp[0]), height: Math.abs(q2[1] - P.cp[1]), fill: 'none', 'stroke-width': pxToPaper(2) }, g);
      if (P.cp2 && P.at) { var pds = Drawing.scaleValue(P.scale) / DW.sheetView(P.parent).scale; ghost(P.at[0], P.at[1], Math.abs(P.cp2[0] - P.cp[0]) * pds, Math.abs(P.cp2[1] - P.cp[1]) * pds); }
    } else if (D.tool === 'detail' && P && P.parent != null) {
      var dw = DW.sheetView(P.parent), rr = P.r != null ? P.r : P.at ? Math.hypot(P.at[0] - P.cp[0], P.at[1] - P.cp[1]) / dw.scale : 0;
      if (rr > 0) svgNode('circle', { class: 'dw-cut', cx: P.cp[0], cy: H - P.cp[1], r: rr * dw.scale, 'stroke-width': pxToPaper(2) }, g);
      if (P.r != null && P.at) { var ds = Drawing.scaleValue(P.scale); ghost(P.at[0], P.at[1], 2 * P.r * ds, 2 * P.r * ds); }
    }
    D.preview = null;
    if (/^(aux|crop|brk|bko|ahatch|magline)$/.test(D.tool) && DW.liveOverlay) DW.liveOverlay(g, H, svgNode, ghost);   // (rfW)
    if (D.tool === 'rmsec' && D.pending && DW.rmsecOverlay) DW.rmsecOverlay(g, H, svgNode, ghost);   // (rfCX) Removed Section
    if (DW.magOverlay) DW.magOverlay(g, H, svgNode);   // (rfAG) magnetic lines (not printed)
    if (D.tool === 'culeader' && DW.cuLeaderOverlay) DW.cuLeaderOverlay(g, H, svgNode);   // (rfCU2) the multi-jog leader being clicked
    if (DW.aeOverlay) DW.aeOverlay(g, H, svgNode, sw, pad);
    if (DW.skOverlay) DW.skOverlay(g, H, svgNode, sw, pad);   // (rfAO) sketch selection, tool previews, hidden edges   // (rfAE) sheet format items, General Tables, their tools
  }
  function dimMatches(ref, d) { return ref.view === d.view && (ref.key ? ref.key === d.key : ref.index === d.index && d.index != null); }

  // ------------------------------------------------------------------ hit testing
  function viewAt(p) {
    var pad = 3 * paperK(), hit = null;
    D.sheet.views.forEach(function (w) { if (p[0] >= w.box.x0 - pad && p[0] <= w.box.x1 + pad && p[1] >= w.box.y0 - pad && p[1] <= w.box.y1 + pad) hit = w; });
    return hit;
  }
  function dimAt(p) {
    var t = pxToPaper(4), hit = null;
    D.sheet.dims.forEach(function (d) { var b = d.box; if (b && p[0] >= b.x0 - t && p[0] <= b.x1 + t && p[1] >= b.y0 - t && p[1] <= b.y1 + t) hit = d; });
    return hit;
  }
  // nearest visible line or circle of an orthographic view within 6 px: { view, a, b (paper), la, lb (model 2D) } or { view, circle, c, r }
  // ell (rfAL): an ellipse (a true circle seen obliquely) can be picked too, in an orthographic or a True view; its
  // entity carries { ellipse: { pts (sheet polyline) }, me (the view's record) } and no line ends (callers that take
  // only lines, circles and arcs leave ell off)
  function entityAt(p, any, ell) {
    var tol = pxToPaper(6), best = null, bd = tol;
    D.sheet.views.forEach(function (w) {
      if (!w.ortho && !w.trueDims && !any) return;   // lengths in a pictorial view are foreshortened (any: pre-highlight only; rfZ: a True view reads true lengths)
      var b = w.box;
      if (p[0] < b.x0 - tol || p[0] > b.x1 + tol || p[1] < b.y0 - tol || p[1] > b.y1 + tol) return;
      w.proj.lines.visible.forEach(function (l) {
        var a = w.toSheet([l[0], l[1]]), b = w.toSheet([l[2], l[3]]), d = segDist(p, a, b);
        if (d < bd) { bd = d; best = { kind: 'entity', view: w.view.id, a: a, b: b, la: [l[0], l[1]], lb: [l[2], l[3]] }; }
      });
      w.proj.circles.visible.forEach(function (c) {
        var cc = w.toSheet(c.c), r = c.r * w.scale, d = Math.abs(Math.hypot(p[0] - cc[0], p[1] - cc[1]) - r);
        if (d < bd) { bd = d; best = { kind: 'entity', view: w.view.id, circle: { c: cc, r: r }, mc: c }; }
      });
      // true arcs: a radius
      (w.proj.arcs ? w.proj.arcs.visible : []).forEach(function (a) {
        var cc = w.toSheet(a.c), r = a.r * w.scale, d = Math.abs(Math.hypot(p[0] - cc[0], p[1] - cc[1]) - r);
        var ang = Math.atan2(p[1] - cc[1], p[0] - cc[0]) * 180 / Math.PI, inside = false;
        for (var j = -2; j <= 2; j++) if (ang + 360 * j >= a.a0 && ang + 360 * j <= a.a1) inside = true;
        if (inside && d < bd) { bd = d; best = { kind: 'entity', view: w.view.id, arc: { c: cc, r: r, a0: a.a0, a1: a.a1 }, ma: a }; }
      });
      if (ell && (w.ortho || w.trueDims)) (w.proj.ellipses ? w.proj.ellipses.visible : []).forEach(function (el) {
        var pts = ellipsePts(w, el), d = Infinity;
        for (var j = 1; j < pts.length; j++) d = Math.min(d, segDist(p, pts[j - 1], pts[j]));
        if (d < bd) { bd = d; best = { kind: 'entity', view: w.view.id, ellipse: { pts: pts }, me: el }; }
      });
    });
    return best;
  }
  // an ellipse record of a view ({ c, ax, ay, t0, t1 }, view units) as a sheet polyline
  function ellipsePts(w, el) {
    var n = Math.max(12, Math.ceil(Math.abs(el.t1 - el.t0) / (2 * Math.PI) * 96)), out = [];
    for (var i = 0; i <= n; i++) {
      var t = el.t0 + (el.t1 - el.t0) * i / n, ct = Math.cos(t), st = Math.sin(t);
      out.push(w.toSheet([el.c[0] + el.ax[0] * ct + el.ay[0] * st, el.c[1] + el.ax[1] * ct + el.ay[1] * st]));
    }
    return out;
  }
  function ellipsePath(pts, H) { return pts.map(function (q, i) { return (i ? 'L' : 'M') + q[0] + ' ' + (H - q[1]); }).join(' '); }
  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }

  // ------------------------------------------------------------------ mouse
  // the sheet sits inside the part viewport: its mouse events must not reach the viewport's own handlers (a double-click
  // there opens the feature under the pointer in the hidden 3D view, a middle drag rotates it)
  function onDown(e) {
    if (e.button !== 1) settle();   // (a middle-drag pan lets the views keep landing)
    if (!D.active || !D.sheet) return;
    if (D.inline && D.inline.box.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    DW.closeInlineEdit(false);
    var p = toPaper(e);
    stopVbAnim();
    if (ZM.pending) { ZM.pending = 0; }
    if (e.button === 1 || e.button === 2 && e.shiftKey) {
      // middle drag pans; a middle double-click fits the sheet (as in the 3D view)
      var now = performance.now();
      if (e.button === 1 && now - (D.mmbAt || -1e9) < 350) { D.mmbAt = 0; D.drag = null; glideTo(fitBox(), e.isTrusted); return; }
      if (e.button === 1) D.mmbAt = now;
      D.drag = { kind: 'pan', x: e.clientX, y: e.clientY, vb: D.vb && JSON.parse(JSON.stringify(D.vb)) };
      return;
    }
    if (e.button !== 0) return;
    if (DW.skDown && DW.skDown(p, e)) return;   // (rfAO) the Sketch tab's tools, sketch entities, Smart Dimension on them
    if (D.tool === 'place' && D.pending) { DW.placePending(p); return; }
    if (D.tool === 'project' && D.pending) { DW.projectClick(p); return; }
    if (D.tool === 'section' && D.pending) { DW.sectionClick(p); return; }
    if (D.tool === 'detail' && D.pending) { DW.detailClick(p); return; }
    if (D.tool === 'dim') { DW.smartDimClick(p, e); return; }   // (rfS) first pick, second pick, placement
    if (D.tool === 'centermark') { DW.centerMarkClick(p); return; }
    if (D.tool === 'centerline') { DW.centerlineClick(p); return; }
    if (D.tool === 'holecallout') { DW.holeCalloutClick(p); return; }
    if (D.tool === 'ordinate' || D.tool === 'baseline') { DW.chainDimClick(p); return; }
    if (D.tool === 'chamferdim') { DW.chamferClick(p); return; }
    if (D.tool === 'balloon' || D.tool === 'stackballoon') { DW.balloonClick(p); return; }
    if (D.tool === 'note') { DW.noteClick(p); return; }
    if (D.tool === 'symbol') { DW.symbolClick(p); return; }
    // (rfAE) the sheet format's Line / Note tools, General Table placement; in Edit Sheet Format only the format picks
    if (DW.aeDown && DW.aeDown(p, e)) return;
    // a click anywhere but on a dimension closes the Dimension PM a single click opened (with its edits, as SolidWorks)
    if (DW.clickPM() && !dimAt(p) && !DW.arrowAt(p)) DW.closeClickPM(true);
    // a leader's arrow tip (a note's or a symbol's): drag it to another point
    var lt = leaderTipAt(p);
    if (lt) {
      D.sel = { kind: lt.kind, id: lt.id };
      D.drag = { kind: 'tip', of: lt.kind, id: lt.id, start: p, t0: lt.tip.slice(), moved: false };
      drawOverlay(); DW.renderTree();
      UI.setStatus('Leader arrow — drag it to the point it should touch.');
      return;
    }
    var sy = symbolAt(p);
    if (sy) {
      D.sel = { kind: 'symbol', id: sy.id };
      var sy0 = Drawing.findSymbol(doc(), sy.id);
      D.drag = { kind: 'symbol', id: sy.id, start: p, p0: sy0.p.slice(), moved: false };
      drawOverlay(); DW.renderTree();
      UI.setStatus(sy.text + ' \u2014 drag to move it, double-click for its properties, Delete removes it.');
      return;
    }
    if (revTableAt(p)) {
      D.sel = { kind: 'revtable' };
      drawOverlay(); DW.renderTree();
      UI.setStatus('Revision Table (' + D.sheet.revisions.rows.length + ' revisions) \u2014 right-click for Add Revision, double-click a row to edit it, Delete removes the table.');
      return;
    }
    var nt = DW.noteAt(p);
    if (nt) {
      D.sel = { kind: 'note', id: nt.id };
      D.drag = { kind: 'note', id: nt.id, start: p, p0: nt.p.slice(), moved: false };
      drawOverlay(); DW.renderTree();
      UI.setStatus('Note "' + nt.lines[0] + (nt.lines.length > 1 ? '…' : '') + '" — drag to move it, double-click to edit it, Delete removes it.');
      return;
    }
    var bl = DW.balloonAt(p);
    if (bl) {
      D.sel = DW.balloonRef(bl);
      D.drag = { kind: 'balloon', view: bl.view, index: bl.index, start: p, c0: bl.c.slice(), moved: false };
      drawOverlay(); DW.renderTree();
      UI.setStatus('Balloon ' + bl.item + ' (Bill of Materials item ' + bl.item + ') — drag to move it, double-click for properties, Delete removes it.');
      return;
    }
    var an = DW.annotAt(p);
    if (an) {
      D.sel = { kind: 'annot', id: an.id, view: an.view };
      if (an.flat) {
        // a flat view's bend note / tag / Bend Table / FLAT SIZE note: dragged by its offset from where it goes by itself
        D.drag = { kind: 'flatann', view: an.view, key: an.key, start: p, off0: (an.off || [0, 0]).slice(), moved: false };
        drawOverlay(); DW.renderTree();
        UI.setStatus(an.text + ' — drag to move it, Delete hides it, double-click for the flat-pattern view\'s properties.');
        return;
      }
      if (an.type === 'holeCallout' || (an.type === 'cosmeticThread' && an.info && an.info.callout)) D.drag ={ kind: 'annot', id: an.id, start: p, lead0: (Drawing.findAnnotation(doc(), an.id).annotation.leadNow || [0, 0]).slice(), moved: false };
      drawOverlay(); DW.renderTree();
      UI.setStatus(an.text + (an.dangling ? ' (dangling: its geometry is gone)' : '') + (an.type === 'holeCallout' ? ' — drag to move it, double-click for its text' : '') + ', Delete removes it.');
      return;
    }
    var bt = DW.bomAt(p);
    if (bt) {
      D.sel = { kind: 'bom' };
      D.drag = { kind: 'bom', start: p, x0: bt.box.x0, y0: bt.box.y1, moved: false };
      drawOverlay(); DW.renderTree();
      UI.setStatus('Bill of Materials (' + bt.rows.length + ' items) — drag to move it off its anchor, double-click for properties, Delete removes it.');
      return;
    }
    // a click on an arrowhead of the selected dimension flips its arrows (SolidWorks' arrow handles), r4/drawings4
    var fl = DW.arrowAt(p);
    if (fl) { DW.flipArrows(fl); return; }
    var dm = dimAt(p);
    if (dm) { D.sel = { kind: 'dim', view: dm.view, key: dm.key || null, index: dm.index }; DW.startDimDrag(dm, p); D.drag.clickPM = true; drawOverlay(); DW.renderTree(); UI.setStatus('Dimension ' + dm.text + (dm.auto ? ' (model item)' : '') + ' \u2014 drag to move it (it snaps in line with the others), click an arrowhead to flip the arrows, double-click to edit the value in place, Delete removes it.'); return; }
    var w = viewAt(p);
    if (w) {
      D.sel = { kind: 'view', id: w.view.id };
      D.drag = { kind: 'view', id: w.view.id, start: p, x0: w.view.x, y0: w.view.y, moved: false };
      drawOverlay(); DW.renderTree();
      UI.setStatus(w.view.name + ' (' + w.view.orient + ') \u2014 drag to move' + (w.view.parent != null ? ' along its projection' : '') + ', right-click for options.');
      return;
    }
    D.sel = null;
    D.drag = { kind: 'pan', x: e.clientX, y: e.clientY, vb: JSON.parse(JSON.stringify(D.vb)) };
    drawOverlay(); DW.renderTree();
  }
  function onMove(e) {
    if (!D.active || !D.sheet) return;
    if (!D.drag) updateCursor();   // (a tool started from the keyboard or a PropertyManager)
    if (D.drag && D.drag.kind === 'pan') {
      var s = svgEl(), m = s && s.getScreenCTM();
      if (!m || !D.drag.vb) return;
      D.vb = { x: D.drag.vb.x - (e.clientX - D.drag.x) / m.a, y: D.drag.vb.y - (e.clientY - D.drag.y) / m.d, w: D.drag.vb.w, h: D.drag.vb.h };
      applyViewBox();
      D.host.classList.add('dw-panning');
      return;
    }
    if (D.drag && DW.aeDragMove && DW.aeDragMove(D.drag, toPaper(e))) return;
    if (D.drag && DW.skDragMove && DW.skDragMove(D.drag, toPaper(e), e)) return;   // (rfAO) a sketch entity or one of its ends   // (rfAE) a format item, a General Table
    if (!D.drag && DW.aeHover && e.target && e.target.nodeType && D.host.contains(e.target) && DW.aeHover(toPaper(e))) return;
    if (D.drag && D.drag.kind === 'bom') {
      var pb = toPaper(e), db = D.drag;
      if (!db.moved && Math.hypot(pb[0] - db.start[0], pb[1] - db.start[1]) < pxToPaper(3)) return;
      if (!db.moved) { UI.pushUndo(); db.moved = true; D.host.classList.add('dw-dragging'); }
      doc().bom.x = db.x0 + pb[0] - db.start[0]; doc().bom.y = db.y0 + pb[1] - db.start[1];
      queueRender(true);
      return;
    }
    if (D.drag && D.drag.kind === 'tip') {
      var pt = toPaper(e), dt = D.drag;
      if (!dt.moved && Math.hypot(pt[0] - dt.start[0], pt[1] - dt.start[1]) < pxToPaper(3)) return;
      if (!dt.moved) { UI.pushUndo(); dt.moved = true; D.host.classList.add('dw-dragging'); }
      var nl = [dt.t0[0] + pt[0] - dt.start[0], dt.t0[1] + pt[1] - dt.start[1]];
      if (dt.of === 'note') Drawing.editNote(doc(), dt.id, { leader: nl }); else Drawing.editSymbol(doc(), dt.id, { leader: nl });
      queueRender(true);
      return;
    }
    if (D.drag && D.drag.kind === 'symbol') {
      var py = toPaper(e), dy = D.drag;
      if (!dy.moved && Math.hypot(py[0] - dy.start[0], py[1] - dy.start[1]) < pxToPaper(3)) return;
      if (!dy.moved) { UI.pushUndo(); dy.moved = true; D.host.classList.add('dw-dragging'); }
      Drawing.editSymbol(doc(), dy.id, { p: [dy.p0[0] + py[0] - dy.start[0], dy.p0[1] + py[1] - dy.start[1]] });
      queueRender(true);
      return;
    }
    if (D.drag && (D.drag.kind === 'note' || D.drag.kind === 'flatann')) {
      var pn = toPaper(e), dn = D.drag;
      if (!dn.moved && Math.hypot(pn[0] - dn.start[0], pn[1] - dn.start[1]) < pxToPaper(3)) return;
      if (!dn.moved) { UI.pushUndo(); dn.moved = true; D.host.classList.add('dw-dragging'); }
      if (dn.kind === 'note') Drawing.editNote(doc(), dn.id, { p: [dn.p0[0] + pn[0] - dn.start[0], dn.p0[1] + pn[1] - dn.start[1]] });
      else Drawing.flatAnnotation(doc(), dn.view, dn.key, { off: [dn.off0[0] + pn[0] - dn.start[0], dn.off0[1] + pn[1] - dn.start[1]] });
      queueRender(true);
      return;
    }
    if (D.drag && (D.drag.kind === 'dim' || D.drag.kind === 'balloon' || D.drag.kind === 'annot')) {
      var pd = toPaper(e), dd = D.drag;
      if (!dd.moved && Math.hypot(pd[0] - dd.start[0], pd[1] - dd.start[1]) < pxToPaper(3)) return;
      if (!dd.moved) { UI.pushUndo(); dd.moved = true; D.host.classList.add('dw-dragging'); }
      if (dd.kind === 'dim') { dd.noSnap = !!e.altKey; DW.dragDim(pd); }   // Alt: no snapping (r4/drawings4)
      else if (dd.kind === 'balloon') {
        var vb = Drawing.findView(doc(), dd.view), bb = vb && vb.balloons && vb.balloons[dd.index];
        if (bb) {
          // (rfAG) near a magnetic line of its view it snaps onto it (and spreads evenly with the others there)
          var nc = [dd.c0[0] + pd[0] - dd.start[0], dd.c0[1] + pd[1] - dd.start[1]], ms = !e.altKey && DW.magSnap ? DW.magSnap(dd.view, nc) : null;
          delete bb.side;
          if (ms) { bb.mag = ms.id; bb.magT = ms.t; delete bb.pos; }
          else { delete bb.mag; delete bb.magT; bb.pos = [nc[0] - vb.x, nc[1] - vb.y]; }
          queueRender(true);
        }
      } else {
        var fa = Drawing.findAnnotation(doc(), dd.id);
        if (fa) { fa.annotation.lead = [dd.lead0[0] + pd[0] - dd.start[0], dd.lead0[1] + pd[1] - dd.start[1]]; queueRender(true); }
      }
      return;
    }
    if (D.drag && D.drag.kind === 'view') {
      var p = toPaper(e), dg = D.drag;
      if (!dg.moved && Math.hypot(p[0] - dg.start[0], p[1] - dg.start[1]) < pxToPaper(3)) return;
      if (!dg.moved) { UI.pushUndo(); dg.moved = true; D.host.classList.add('dw-dragging'); D.hover = null; }
      Drawing.moveView(doc(), dg.id, dg.x0 + p[0] - dg.start[0], dg.y0 + p[1] - dg.start[1]);
      liveShift(); drawOverlay();
      return;
    }
    if (e.target && e.target.nodeType && D.host.contains(e.target)) {
      var q = toPaper(e), h = null;
      if (DW.skHover && DW.skHover(q, e)) return;   // (rfAO)
      if (/^(place|project|section|detail|culeader)$/.test(D.tool) && D.pending) { D.pending.at = q; drawOverlay(); return; }   // (rfCU2: culeader, the multi-jog leader's rubber band)
      // (rfW) Auxiliary / Crop / Break follow the pointer; before its edge is picked, Auxiliary pre-highlights straight edges
      if (/^(aux|crop|brk|bko|ahatch|magline|rmsec)$/.test(D.tool) && D.pending) {
        D.pending.at = q;
        if (D.tool === 'aux' && D.pending.parent == null) { var ea = entityAt(q); D.hover = ea && ea.la ? ea : null; } else D.hover = null;
        drawOverlay(); return;
      }
      if (D.pending && (D.tool === 'balloon' || D.tool === 'stackballoon')) D.pending.at = q;
      if (D.tool === 'dim') { DW.smartDimMove(q, e); return; }   // (rfS) pre-highlight and the preview
      if (/^(centermark|holecallout|ordinate|baseline|chamferdim|cuthread|cudowel|angrun|pathlen)$/.test(D.tool)) h = entityAt(q);   // (lane CT: angrun, pathlen)
      else if (D.tool === 'balloon' || D.tool === 'stackballoon') { var eg = DW.edgeAt(q); h = eg ? { kind: 'edge', view: eg.view, body: eg.body } : null; if (D.pending && D.pending.item && !D.pending.placed) { D.hover = h; drawOverlay(); return; } }
      else if (D.tool === 'centerline') h = null;
      else h = preHighlight(q);
      if (JSON.stringify(h) !== JSON.stringify(D.hover)) { D.hover = h; drawOverlay(); }
    }
  }
  // what the cursor pre-highlights with no tool running (SolidWorks): a balloon, an annotation, a dimension, else the
  // model edge under it (in any view; its view's frame shows too), else the view
  function preHighlight(q) {
    var sy = symbolAt(q);
    if (sy) return { kind: 'symbol', id: sy.id };
    if (revTableAt(q)) return { kind: 'revtable' };
    var nt = DW.noteAt(q);
    if (nt) return { kind: 'note', id: nt.id };
    var bl = DW.balloonAt(q);
    if (bl) return { kind: 'balloon', view: bl.view, index: bl.index };
    var an = DW.annotAt(q);
    if (an) return { kind: 'annot', id: an.id };
    var dm = dimAt(q);
    if (dm) return { kind: 'dim', view: dm.view, key: dm.key || null, index: dm.index };
    var ent = entityAt(q, true);
    if (ent) { ent.pre = true; return ent; }
    var w = viewAt(q);
    return w ? { kind: 'view', id: w.view.id } : null;
  }
  function onUp() {
    if (!D.drag) return;
    var dg = D.drag;
    D.drag = null;
    if (D.host) D.host.classList.remove('dw-dragging', 'dw-panning');
    if (D.snapGuide) { D.snapGuide = null; drawOverlay(); }
    // (SolidWorks) a click on a dimension, without a drag, opens its Dimension PropertyManager; the keyboard stays on
    // the sheet (Delete deletes it, D starts Smart Dimension)
    if (dg.kind === 'dim' && dg.clickPM && !dg.moved && D.active) DW.openClickDimPM(dg.ref);
    if ((dg.kind === 'fmt' || dg.kind === 'gtable' || dg.kind === 'sk') && dg.moved) { D.dirty = true; UI.autosave(); render(); return; }   // (rfAE)
    if ((dg.kind === 'view' || dg.kind === 'bom' || dg.kind === 'dim' || dg.kind === 'balloon' || dg.kind === 'annot' || dg.kind === 'note' || dg.kind === 'flatann' || dg.kind === 'symbol' || dg.kind === 'tip') && dg.moved) { D.dirty = true; UI.autosave(); render(); }
  }
  // Wheel zoom about the cursor, as in the 3D view (smooth/viewport): each notch (or trackpad scroll / pinch, in
  // proportion to its delta) adds to a pending zoom that eases out over ~50 ms; one notch (deltaY 100) is 1.15×.
  // A script's wheel event (untrusted) or reduced motion zooms at once.
  var WHEEL_K = Math.log(1.15) / 100, ZM = { pending: 0, cx: 0, cy: 0, last: 0, raf: 0 };
  function smoothOn() {
    if (UI.viewAnimation === false) return false;
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (err) { }
    return true;
  }
  function zoomAbout(f, cx, cy) {
    var s = svgEl(), m = s && s.getScreenCTM();
    if (!m || !D.vb) return;
    var pt = s.createSVGPoint(); pt.x = cx; pt.y = cy;
    var q = pt.matrixTransform(m.inverse()), S = D.sheet.size, big = Math.max(S[0], S[1]);
    // from a tenth of a millimetre of paper across the window to ten sheets
    f = Math.max(big * 0.02 / D.vb.w, Math.min(big * 10 / D.vb.w, f));
    D.vb = { x: q.x - (q.x - D.vb.x) * f, y: q.y - (q.y - D.vb.y) * f, w: D.vb.w * f, h: D.vb.h * f };
    applyViewBox();
    drawOverlay();
  }
  function stepZoom(now) {
    ZM.raf = 0;
    if (!ZM.pending || !D.active) { ZM.pending = 0; return; }
    var dt = Math.max(0, now - ZM.last), p = ZM.pending, step = p * (1 - Math.exp(-dt / 50));
    ZM.last = now;
    if (Math.abs(p - step) < 2e-4) step = p;
    ZM.pending = p - step;
    zoomAbout(Math.exp(step), ZM.cx, ZM.cy);
    if (ZM.pending) ZM.raf = requestAnimationFrame(stepZoom);
  }
  function onWheel(e) {
    if (!D.active || !D.vb) return;
    e.preventDefault(); e.stopPropagation();
    var dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    var d = Math.max(-0.7, Math.min(0.7, dy * (e.ctrlKey ? 0.01 : WHEEL_K)));
    if (!d) return;
    stopVbAnim();
    if (!e.isTrusted || !smoothOn()) { ZM.pending = 0; zoomAbout(Math.exp(d), e.clientX, e.clientY); return; }
    if (!ZM.pending) ZM.last = performance.now();
    ZM.pending += d; ZM.cx = e.clientX; ZM.cy = e.clientY;
    if (!ZM.raf) ZM.raf = requestAnimationFrame(stepZoom);
  }
  // the sheet glides to a new pan / zoom (F, a middle double-click) over 250 ms; at once for scripts / reduced motion
  var VBA = null;
  function stopVbAnim() { if (VBA) { cancelAnimationFrame(VBA.raf); VBA = null; } }
  function glideTo(vb, animate) {
    stopVbAnim(); ZM.pending = 0;
    if (!animate || !smoothOn() || !D.vb) { D.vb = vb; applyViewBox(); drawOverlay(); return; }
    var from = D.vb, t0 = performance.now();
    VBA = { raf: 0 };
    (function step() {
      var t = Math.min(1, (performance.now() - t0) / 250), e = 1 - Math.pow(1 - t, 3);
      // the zoom eases in log space, so the motion looks even at every scale
      var w = from.w * Math.pow(vb.w / from.w, e), k = Math.abs(vb.w - from.w) > 1e-9 ? (w - from.w) / (vb.w - from.w) : e;
      D.vb = { x: from.x + (vb.x - from.x) * k, y: from.y + (vb.y - from.y) * k, w: w, h: from.h * Math.pow(vb.h / from.h, e) };
      applyViewBox(); drawOverlay();
      if (t < 1 && VBA) VBA.raf = requestAnimationFrame(step); else { VBA = null; D.vb = vb; applyViewBox(); drawOverlay(); }
    })();
  }
  function onDblClick(e) {
    settle();
    if (D.active) e.stopPropagation();
    if (!D.active || D.tool) return;
    var pp = toPaper(e);
    D.drag = null;
    if (DW.skDblClick && DW.skDblClick(pp)) return;   // (rfAO) a sketch entity's properties, a sketch dimension's value
    if (DW.aeDblClick && DW.aeDblClick(pp)) return;   // (rfAE) a format note / field, a General Table cell
    var bq = DW.balloonAt(pp);
    if (bq) { DW.cmdBalloonProps(bq); return; }
    var sq = symbolAt(pp);
    if (sq) { D.sel = { kind: 'symbol', id: sq.id }; DW.cmdSymbol(Drawing.findSymbol(doc(), sq.id).type, sq.id); return; }
    var rq = D.sheet ? Drawing.revRowAt(doc(), units(), pp) : null;
    if (rq != null) { D.sel = { kind: 'revtable' }; DW.cmdRevision(rq >= 0 ? rq : null); return; }
    var nq = DW.noteAt(pp);
    if (nq) { D.sel = { kind: 'note', id: nq.id }; DW.openNoteEdit(Drawing.findNote(doc(), nq.id)); return; }
    var aq = DW.annotAt(pp);
    if (aq) { if (aq.type === 'cosmeticThread' && DW.cmdCosmeticThread) DW.cmdCosmeticThread(aq.id); else if (aq.type === 'holeCallout') DW.cmdCalloutProps(aq); else if (aq.flat) DW.cmdViewProperties(aq.view); return; }
    var dq = dimAt(pp);
    if (dq) { DW.cmdDimensionPM(DW.dimRef(dq)); DW.openInlineEdit(dq); return; }
    if (DW.bomAt(toPaper(e))) { DW.cmdBOM(); return; }
    var tf = D.sheet && Drawing.titleFieldAt(D.sheet.size, units(), pp, doc());
    if (tf) { DW.openTitleEdit(tf); return; }
    var w = viewAt(toPaper(e));
    if (w) DW.cmdViewProperties(w.view.id); else DW.cmdSheetProperties();
  }
  function onContext(e) {
    settle();
    e.preventDefault(); e.stopPropagation();
    if (!D.active) return;
    var p = toPaper(e), w = viewAt(p);
    if (DW.skContext && DW.skContext(p, e)) return;   // (rfAO) a sketch entity's menu (also notes the point for a view edge's Hide Edge)
    if (DW.aeContext && DW.aeContext(p, e)) return;   // (rfAE) Edit Sheet Format's menu, a General Table's menu
    if (revTableAt(p)) { D.sel = { kind: 'revtable' }; drawOverlay(); DW.renderTree(); UI.showMenu(e.clientX, e.clientY, DW.revTableMenu(Drawing.revRowAt(doc(), units(), p))); return; }
    var nm = DW.noteAt(p);
    if (nm) { D.sel = { kind: 'note', id: nm.id }; drawOverlay(); DW.renderTree(); UI.showMenu(e.clientX, e.clientY, noteMenu(nm.id)); return; }
    var sm = symbolAt(p);
    if (sm) { D.sel = { kind: 'symbol', id: sm.id }; drawOverlay(); DW.renderTree(); UI.showMenu(e.clientX, e.clientY, DW.symbolMenu(sm.id)); return; }
    if (DW.bomAt(p)) { D.sel = { kind: 'bom' }; drawOverlay(); DW.renderTree(); UI.showMenu(e.clientX, e.clientY, DW.bomMenu()); return; }
    if (w) { D.sel = { kind: 'view', id: w.view.id }; drawOverlay(); DW.renderTree(); UI.showMenu(e.clientX, e.clientY, DW.viewMenu(w.view)); }
    else UI.showMenu(e.clientX, e.clientY, DW.sheetMenu());
  }

  // (rfM) the shop symbol under paper point p (within 3 px of its box), the Revision Table under it
  function symbolAt(p) {
    var t = pxToPaper(3), hit = null;
    (D.sheet && D.sheet.symbols || []).forEach(function (y) {
      var b = y.box;
      if (y.pts) { for (var i = 1; i < y.pts.length; i++) if (segDist(p, y.pts[i - 1], y.pts[i]) <= t) { hit = y; break; } return; }   // (rfCU) a multi-jog leader: along its segments
      if (b && p[0] >= b.x0 - t && p[0] <= b.x1 + t && p[1] >= b.y0 - t && p[1] <= b.y1 + t) hit = y;
    });
    return hit;
  }
  function revTableAt(p) { var r = D.sheet && D.sheet.revisions, b = r && r.box; return b && p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1 ? r : null; }
  // the leader arrow tip within 4 px of p: { kind: 'note' | 'symbol', id, tip }, or null
  function leaderTipAt(p) {
    var t = pxToPaper(4), hit = null, dc = doc();
    if (!dc) return null;
    (dc.notes || []).forEach(function (n) { if (n.leader && Math.hypot(p[0] - n.leader[0], p[1] - n.leader[1]) <= t) hit = { kind: 'note', id: n.id, tip: n.leader }; });
    (dc.symbols || []).forEach(function (y) { if (y.leader && Math.hypot(p[0] - y.leader[0], p[1] - y.leader[1]) <= t) hit = { kind: 'symbol', id: y.id, tip: y.leader }; });
    return hit;
  }
  // a note's right-click menu: Add / Remove Leader (the arrow goes down-left of the note; drag its tip), Delete
  function noteMenu(id) {
    var n = Drawing.findNote(doc(), id), k = paperK();
    return [
      { label: 'Edit Text', action: function () { DW.openNoteEdit(Drawing.findNote(doc(), id)); } },
      { label: 'Properties…', action: function () { DW.cmdNoteProps(id); } },   // (rfCU) border, numbered / bulleted list
      { label: n.leader ? 'Remove Leader' : 'Add Leader', action: function () { edit(function (dc) { Drawing.editNote(dc, id, { leader: n.leader ? null : [n.p[0] - 15 * k, n.p[1] - 10 * k] }); }); } },
      { label: 'Delete', key: 'Del', action: function () { edit(function (dc) { Drawing.deleteNote(dc, id); }); D.sel = null; render(); } }
    ];
  }
  DW.symbolAt = symbolAt; DW.revTableAt = revTableAt; DW.leaderTipAt = leaderTipAt; DW.noteMenu = noteMenu;
  DW.D = D; DW.doc = doc; DW.cctx = cctx; DW.syncBom = syncBom; DW.relayout = relayout; DW.units = units; DW.mesh = mesh; DW.paperK = paperK; DW.edit = edit; DW.editView = editView;
  DW.isAsm = isAsm; DW.docKind = docKind; DW.makeDrawing = makeDrawing; DW.openDrawing = openDrawing; DW.closeDrawing = closeDrawing; DW.detachDrawing = detachDrawing;
  DW.requestClose = requestClose; DW.drawingDirty = drawingDirty; DW.markDrawingClean = markDrawingClean;
  DW.activateSheet = activateSheet; DW.addSheet = addSheet; DW.deleteSheet = deleteSheet; DW.renameSheet = renameSheet; DW.sheetTabMenu = sheetTabMenu; DW.renderTabs = renderTabs;
  DW.workerState = function () { return { off: !!PJ.off, why: PJ.why || null, fails: PJ.fails || 0, worker: !!PJ.worker, cooling: Math.max(0, (PJ.coolUntil || 0) - performance.now()) }; };   // (rfDN: tests)
  DW.render = render; DW.settle = settle; DW.ready = ready; DW.queueRender = queueRender; DW.svgEl = svgEl; DW.fitBox = fitBox; DW.fitSheet = fitSheet; DW.glideTo = glideTo;
  DW.toPaper = toPaper; DW.pxToPaper = pxToPaper; DW.liveOffset = liveOffset; DW.drawOverlay = drawOverlay; DW.dimMatches = dimMatches; DW.viewAt = viewAt; DW.dimAt = dimAt; DW.entityAt = entityAt; DW.segDist = segDist; DW.ellipsePts = ellipsePts; DW.ellipsePath = ellipsePath;
})();
