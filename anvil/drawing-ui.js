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
    drawing: '<path d="M2.5 2.5 h11 v11 h-11 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 9.5 h4 v2.5 h-4 z M4.5 4.5 h4 v3.5 h-4 z M10 9.5 h2 v2.5 h-2 z" fill="none" stroke="#2f7fd6" stroke-width="0.9"/>',
    sheet: '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M9 10 h5 M9 10 v3" stroke="currentColor" stroke-width="0.9" fill="none"/>',
    sheetFormat: '<path d="M2 3 h12 v10 H2 z" fill="#f2f4f7" stroke="currentColor" stroke-width="1.1"/><path d="M8 9.5 h6 M8 9.5 v3.5 M11 9.5 v3.5" stroke="currentColor" stroke-width="0.8" fill="none"/>',
    drawingView: '<path d="M2 2.5 h12 v11 H2 z" fill="none" stroke="#2f7fd6" stroke-width="1" stroke-dasharray="2 1.2"/><path d="M4.5 5 h7 v6 h-7 z" fill="#bfcfe0" stroke="currentColor" stroke-width="1"/>',
    std3view: '<path d="M1.5 8.5 h6 v5.5 h-6 z M1.5 2 h6 v5 h-6 z M9 8.5 h5.5 v5.5 H9 z" fill="#bfcfe0" stroke="currentColor" stroke-width="1"/><path d="M4.5 3.5 v2 M3 4.5 h3" stroke="#2f7fd6" stroke-width="0.8"/>',
    modelView: '<path d="M2 2.5 h12 v11 H2 z" fill="none" stroke="#2f7fd6" stroke-width="1" stroke-dasharray="2 1.2"/><path d="M5 7 l3 -2 3 2 v4 l-3 2 -3 -2 z" fill="#bfcfe0" stroke="currentColor" stroke-width="1"/><path d="M5 7 l3 2 3 -2 M8 9 v4" fill="none" stroke="currentColor" stroke-width="0.8"/>',
    projView: '<path d="M2 8.5 h6 v5.5 H2 z" fill="#bfcfe0" stroke="currentColor" stroke-width="1"/><path d="M2 2 h6 v5 H2 z" fill="none" stroke="#2f7fd6" stroke-width="1" stroke-dasharray="1.6 1"/><path d="M11.5 12 V4 M9.8 5.8 l1.7 -1.8 1.7 1.8" fill="none" stroke="#3ba776" stroke-width="1.2"/>',
    modelItems: '<path d="M3 13 l3 -2 3 2 V8 l-3 -2 -3 2 z" fill="#bfcfe0" stroke="currentColor" stroke-width="0.9"/><path d="M8 3.5 h6 M8 3.5 l1.2 -0.8 M8 3.5 l1.2 0.8 M14 3.5 l-1.2 -0.8 M14 3.5 l-1.2 0.8" fill="none" stroke="#2f7fd6" stroke-width="1"/><path d="M11 7 v6" stroke="#2f7fd6" stroke-width="1"/>',
    sheetProps: '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 6 h7 M4.5 8.5 h7 M4.5 11 h4" stroke="#2f7fd6" stroke-width="1"/>',
    svgExport: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><text x="8" y="12" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#e0553c">SVG</text>',
    pdfExport: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><text x="8" y="12" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#d9453b">PDF</text>',
    dxfExport: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><text x="8" y="12" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#2f7fd6">DXF</text>',
    sectionView: '<path d="M2 3 h12 v10 H2 z" fill="#bfcfe0" stroke="currentColor" stroke-width="1"/><path d="M3 12 l3 -3 M3 9 l3 -3 M3 6 l2 -2 M5 12 l1 -1" stroke="currentColor" stroke-width="0.6"/><path d="M8 1 v14" stroke="#e0553c" stroke-width="1.3" stroke-dasharray="3 1 1 1"/><path d="M8 1.5 h3 M8 14.5 h3 M10 0.3 l1.4 1.2 -1.4 1.2 M10 13.3 l1.4 1.2 -1.4 1.2" fill="none" stroke="#e0553c" stroke-width="1"/>',
    detailView: '<path d="M1.5 9 h7 v5 h-7 z" fill="#bfcfe0" stroke="currentColor" stroke-width="0.9"/><circle cx="7" cy="9" r="2.4" fill="none" stroke="#e0553c" stroke-width="1"/><circle cx="11.5" cy="5" r="3.8" fill="#fff" stroke="#2f7fd6" stroke-width="1"/><path d="M8 5 h3.5 v4" fill="none" stroke="currentColor" stroke-width="1"/>',
    autoBalloon: '<path d="M2 13 h6 v-5 h-6 z" fill="#bfcfe0" stroke="currentColor" stroke-width="0.9"/><path d="M7 9.5 L10.2 6.3" stroke="currentColor" stroke-width="0.9"/><circle cx="12" cy="4.5" r="3.2" fill="#fff" stroke="#2f7fd6" stroke-width="1.1"/><text x="12" y="6.2" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#2f7fd6">1</text>',
    bom: '<path d="M1.5 3 h13 v10 h-13 z" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M1.5 5.5 h13" stroke="currentColor" stroke-width="1.1"/><path d="M1.5 8 h13 M1.5 10.5 h13 M4.5 3 v10 M12 3 v10" stroke="currentColor" stroke-width="0.6"/><path d="M5.8 6.8 h4.6 M5.8 9.3 h3.6 M5.8 11.8 h4.2" stroke="#2f7fd6" stroke-width="0.8"/>',
    closeDoc: '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M5.5 5.5 l5 5 M10.5 5.5 l-5 5" stroke="#e0553c" stroke-width="1.4"/>',
    centerMark: '<circle cx="8" cy="8" r="4.2" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M6.6 8 h2.8 M8 6.6 v2.8" stroke="#2f7fd6" stroke-width="1.1"/><path d="M1 8 h4 M11 8 h4 M8 1 v4 M8 11 v4" stroke="#2f7fd6" stroke-width="0.9" stroke-dasharray="2.2 0.8 0.6 0.8"/>',
    centerline: '<path d="M2 4.5 h12 M2 11.5 h12" stroke="currentColor" stroke-width="1.1"/><path d="M0.8 8 h14.4" stroke="#2f7fd6" stroke-width="1" stroke-dasharray="3 1 1 1"/>',
    holeCallout: '<circle cx="5" cy="11" r="3" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M7.1 8.9 L10 6 h5" fill="none" stroke="#2f7fd6" stroke-width="1"/><text x="12" y="4.6" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#2f7fd6">\u00d8</text>',
    balloon: '<path d="M2.5 13.5 L8.4 7.6" stroke="currentColor" stroke-width="0.9"/><path d="M2.5 13.5 l0.6 -2 1.4 1.4 z" fill="currentColor"/><circle cx="11" cy="5" r="3.8" fill="#fff" stroke="#2f7fd6" stroke-width="1.1"/><text x="11" y="6.8" font-size="5" font-weight="700" font-family="Arial" text-anchor="middle" fill="#2f7fd6">1</text>',
    stackBalloon: '<path d="M2 14 L5 11" stroke="currentColor" stroke-width="0.9"/><circle cx="6.5" cy="9.5" r="2.6" fill="#fff" stroke="#2f7fd6" stroke-width="1"/><circle cx="11.7" cy="9.5" r="2.6" fill="#fff" stroke="#2f7fd6" stroke-width="1"/><circle cx="9.1" cy="4.4" r="2.6" fill="#fff" stroke="#2f7fd6" stroke-width="1"/>',
    ordinateDim: '<path d="M3 13.5 V3 M7 13.5 V6 M12 13.5 V8" stroke="#2f7fd6" stroke-width="0.9"/><path d="M1.5 13.5 h13" stroke="currentColor" stroke-width="1.1"/><text x="3" y="2.6" font-size="3.4" font-family="Arial" text-anchor="middle" fill="currentColor">0</text>',
    baselineDim: '<path d="M2.5 14 V2" stroke="currentColor" stroke-width="1.1"/><path d="M2.5 5 h7 M2.5 9 h11" stroke="#2f7fd6" stroke-width="0.9"/><path d="M9.5 3.5 v3 M13.5 7.5 v3" stroke="currentColor" stroke-width="0.9"/>',
    chamferDim: '<path d="M2 14 V7 L7 2 h7" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 4.5 L8.5 8.5 h6" fill="none" stroke="#2f7fd6" stroke-width="0.9"/>',
    note: '<path d="M2.5 2.5 h11 v8 l-3 3 h-8 z" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M10.5 13.5 v-3 h3" fill="none" stroke="currentColor" stroke-width="0.9"/><text x="7.5" y="9" font-size="6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#2f7fd6">A</text>',
    flatView: '<path d="M1.5 4.5 h13 v7 h-13 z" fill="#bfcfe0" stroke="currentColor" stroke-width="1"/><path d="M4.5 3.5 v9 M11.5 3.5 v9" stroke="#2f7fd6" stroke-width="0.9"/><path d="M11.5 3.5 v9" stroke="#e0553c" stroke-width="0.9" stroke-dasharray="1.4 0.9"/><circle cx="8" cy="8" r="1.3" fill="#fff" stroke="currentColor" stroke-width="0.8"/>',
    bendNote: '<path d="M5 2 v12" stroke="#2f7fd6" stroke-width="1"/><text x="10.5" y="10" font-size="5.2" font-weight="700" font-family="Arial" text-anchor="middle" fill="currentColor">UP</text>',
    docProps: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><circle cx="8" cy="9" r="2.6" fill="none" stroke="#2f7fd6" stroke-width="1.3" stroke-dasharray="1.4 0.9"/><circle cx="8" cy="9" r="0.9" fill="#2f7fd6"/>'
  };
  var baseIcons = Icons;
  var wrapped = function (name, size, cls) {
    if (!DI[name]) return baseIcons(name, size, cls);
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
  function cctx() { return { build: App.build || null }; }
  function syncBom(dc) { dc = dc || doc(); if (dc && dc.bom) dc.bomRows = Drawing.bomRows(App.model, mesh(), dc.bom, cctx()).length; return dc; }
  function relayout(dc) { syncBom(dc); Drawing.layout(dc, mesh(), units()); }
  function units() { return App.model.units === 'in' ? 'in' : 'mm'; }
  function mesh() { return App.mesh || { positions: new Float32Array(0), faces: [], triCount: 0 }; }
  function paperK() { return units() === 'in' ? 1 / 25.4 : 1; }
  function edit(fn) {
    settle();
    UI.pushUndo();
    fn(doc());
    UI.autosave();
    render();
  }
  // editView(fn) -> the view fn(doc) adds (r13/drawings13): a view placed with the mouse (model, projected, section,
  // detail) is one undo step whose linework is worked out in drawing-worker.js, as when a drawing opens: the sheet
  // shows a placeholder where it goes at once (a section's CSG cut and hidden-line removal took 15–60 ms on the main
  // thread), the linework drops in when ready, then Auto insert adds its centre marks / centrelines.
  function editView(fn) {
    settle();
    UI.pushUndo();
    var v = fn(doc());
    UI.autosave();
    D.prog = { doc: doc(), insert: false, ids: [v.id], t0: performance.now() };
    render();
    return v;
  }

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
  function renderTabs() {
    var tabs = $('drawing-tabs'), dc = doc();
    tabs.innerHTML = '';
    tabs.appendChild(el('button', { class: 'dw-tab active', text: dc ? dc.sheet.name : 'Sheet1', title: 'Sheet (right-click for Sheet Properties)', oncontextmenu: function (e) { e.preventDefault(); UI.showMenu(e.clientX, e.clientY, DW.sheetMenu()); } }));
    tabs.appendChild(el('span', { class: 'dw-sp' }));
    tabs.appendChild(el('button', { class: 'dw-tab', html: Icons(isAsm() ? 'assembly' : 'part', 14) + '<span>' + (App.model.name || 'Part') + '</span>', title: 'Switch to the ' + (isAsm() ? 'assembly' : 'part') + ' document (Window menu)', onclick: function () { closeDrawing(); } }));
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
    D.active = true; D.sel = null; D.hover = null; D.tool = null; D.pending = null; D.vb = null;
    D.prog = { doc: doc(), insert: !!(o && o.insert), t0: t0 };
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
    var lazy = !!(D.prog && !D.prog.sync);
    D.sheet = Drawing.compute(dc, m, App.model, lazy ? Object.assign(cctx(), { lazy: true }) : cctx());
    if (D.prog) {
      if (lazy && D.sheet.pending.length) {
        requestProjections(D.sheet.pending);
        if (D.prog.hold && old) { D.sheet = old; return; }
      } else { var pg = D.prog; D.prog = null; if ((pg.insert || pg.ids) && Drawing.autoInsert(dc, m, pg.ids || undefined)) { UI.autosave(); D.sheet = Drawing.compute(dc, m, App.model, cctx()); } D.openMs = performance.now() - pg.t0; }
    }
    D.sheetMesh = m; D.sheetDoc = dc;
    D.occtDrove = !!(UI.occt && UI.occt.status && UI.occt.status().driving);
    D.rendered = {};
    D.sheet.views.forEach(function (w) { D.rendered[w.view.id] = [w.view.x, w.view.y]; });
    patchSheet(Drawing.svgParts(D.sheet, { live: true }));
    applyViewBox();
    drawOverlay();
    if (light !== true) { DW.renderTree(); renderTabs(); }
    $('doc-title').textContent = dc.name + ' - ' + dc.sheet.name;
    D.lastRenderMs = performance.now() - t0;
  }
  // Views worked out off the main thread (r12/drawui12): drawing-worker.js gets the mesh once, then one message per
  // view, and answers each with its projection, which goes into the mesh's projection cache; the sheet is drawn again
  // as each one lands. Without workers (or when one fails) the views are worked out here, one per task, so the page
  // still paints between them.
  var PJ = { worker: null, off: false, mesh: null, id: 0, jobs: {}, tick: 0, flushT: 0 };
  function projWorker() {
    if (PJ.off || typeof Worker === 'undefined') return null;
    if (!PJ.worker) {
      try { PJ.worker = new Worker('drawing-worker.js'); } catch (err) { PJ.off = true; return null; }
      PJ.worker.onmessage = onProjected;
      PJ.worker.onerror = function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();   // (handled: the views are worked out here instead)
        PJ.off = true; PJ.worker = null;
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
        } catch (err) { PJ.off = true; w = null; }
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
  function settle() {
    if (!D.prog || !D.active) return;
    dropBusyWorker();
    PJ.id++; PJ.mesh = null; PJ.jobs = {};
    D.prog.sync = true;
    render();
  }
  // a promise for when the drawing on screen is complete (tests; the views land in a few hundred ms at most)
  function ready() {
    return new Promise(function (res) { (function poll() { if (!D.prog || !D.active) res(); else setTimeout(poll, 10); })(); });
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
      D.svgHead = P.head; D.svgKeys = keys; D.svgBodies = P.groups.map(function (g) { return g.body; });
      D.patched = P.groups.length;
      return;
    }
    var nodes = s.querySelectorAll(':scope > g[data-layer]'), n = 0;
    P.groups.forEach(function (g, i) {
      var node = nodes[i];
      if (!node) return;
      if (D.svgBodies[i] !== g.body) { node.innerHTML = g.body; D.svgBodies[i] = g.body; n++; }
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
  var MIN_PX = { visible: 1.35, thick: 1.6, chain: 1.1, hidden: 1, thin: 1, center: 1, tangent: 1, tanfont: 1, hatch: 0.8 };
  function strokeFloor() {
    var st = D.strokeStyle;
    if (!st) { st = D.strokeStyle = document.createElement('style'); st.id = 'dw-stroke-floor'; document.head.appendChild(st); }
    var w = D.host ? D.host.clientWidth : 0, h = D.host ? D.host.clientHeight : 0;
    if (!w || !h || !D.vb || !D.sheet) return;
    var ppu = Math.min(w / D.vb.w, h / D.vb.h), k = D.sheet.units === 'in' ? 1 / 25.4 : 1;
    // (in steps of about 6 %, so a smooth zoom restyles the sheet a few times, not on every frame)
    var q = Math.round(Math.log(ppu) / 0.06);
    if (q === D.strokeQ) return;
    D.strokeQ = q;
    var px = 1 / Math.exp(q * 0.06), css = '';
    Object.keys(MIN_PX).forEach(function (c) {
      var paper = (Drawing.STROKE[c] || 0.25) * k, need = MIN_PX[c] * px;
      if (need > paper) css += '#drawing-sheet svg .' + c + '{stroke-width:' + +need.toPrecision(4) + 'px}';
    });
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
  function drawOverlay() {
    updateCursor();
    var s = svgEl(), g = s && s.querySelector('#dw-overlay');
    if (!g) return;
    g.innerHTML = '';
    var H = D.sheet.size[1], pad = 2 * paperK(), vpad = 3 * paperK(), sw = pxToPaper(1.2);   // (a view's frame is where a click takes the view: viewAt's margin)
    D.sheet.views.forEach(function (w) {
      var sel = D.sel && D.sel.kind === 'view' && D.sel.id === w.view.id, hov = D.hover && (D.hover.kind === 'view' && D.hover.id === w.view.id || D.hover.pre && D.hover.view === w.view.id);
      if (!sel && !hov) return;
      var o = liveOffset(w.view.id);
      svgNode('rect', { class: 'dw-vbox' + (sel ? ' sel' : ''), x: w.box.x0 + o[0] - vpad, y: H - w.box.y1 - o[1] - vpad, width: w.box.x1 - w.box.x0 + 2 * vpad, height: w.box.y1 - w.box.y0 + 2 * vpad, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g);
    });
    D.sheet.dims.forEach(function (d) {
      var sel = D.sel && D.sel.kind === 'dim' && dimMatches(D.sel, d), hov = D.hover && D.hover.kind === 'dim' && dimMatches(D.hover, d);
      if (!sel && !hov || !d.box) return;
      svgNode('rect', { class: 'dw-dbox' + (sel ? ' sel' : ''), x: d.box.x0 - pad / 2, y: H - d.box.y1 - pad / 2, width: d.box.x1 - d.box.x0 + pad, height: d.box.y1 - d.box.y0 + pad, 'stroke-width': sw }, g);
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
      svgNode('rect', { class: 'dw-dbox' + (nsel ? ' sel' : ''), x: n.box.x0 - pad / 2, y: H - n.box.y1 - pad / 2, width: n.box.x1 - n.box.x0 + pad, height: n.box.y1 - n.box.y0 + pad, 'stroke-width': sw }, g);
    });
    (D.sheet.annotations || []).forEach(function (a) {
      var asel = D.sel && D.sel.kind === 'annot' && D.sel.id === a.id, ahov = D.hover && D.hover.kind === 'annot' && D.hover.id === a.id;
      if (!(asel || ahov) || a.hidden || !isFinite(a.box.x0)) return;
      svgNode('rect', { class: 'dw-dbox' + (asel ? ' sel' : ''), x: a.box.x0 - pad / 2, y: H - a.box.y1 - pad / 2, width: a.box.x1 - a.box.x0 + pad, height: a.box.y1 - a.box.y0 + pad, 'stroke-width': sw }, g);
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
    if (D.hover && D.hover.kind === 'entity') {
      var h = D.hover, hc = 'dw-hot' + (h.pre ? ' pre' : ''), hw = pxToPaper(h.pre ? 2.4 : 3);
      if (h.circle) svgNode('circle', { class: hc, cx: h.circle.c[0], cy: H - h.circle.c[1], r: h.circle.r, 'stroke-width': hw }, g);
      else if (h.arc) {
        var ha = h.arc, h0 = ha.a0 * Math.PI / 180, h1 = ha.a1 * Math.PI / 180;
        svgNode('path', { class: hc, d: 'M' + (ha.c[0] + ha.r * Math.cos(h0)) + ' ' + (H - ha.c[1] - ha.r * Math.sin(h0)) + ' A' + ha.r + ' ' + ha.r + ' 0 ' + (ha.a1 - ha.a0 > 180 ? 1 : 0) + ' 0 ' + (ha.c[0] + ha.r * Math.cos(h1)) + ' ' + (H - ha.c[1] - ha.r * Math.sin(h1)), fill: 'none', 'stroke-width': hw }, g);
      } else svgNode('line', { class: hc, x1: h.a[0], y1: H - h.a[1], x2: h.b[0], y2: H - h.b[1], 'stroke-width': hw }, g);
    }
    function ghost(cx, cy, gw, gh) { svgNode('rect', { class: 'dw-ghost', x: cx - gw / 2, y: H - cy - gh / 2, width: gw, height: gh, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g); }
    var P = D.pending;
    if (D.tool === 'place' && P && P.at) ghost(P.at[0], P.at[1], P.w, P.h);
    if (D.tool === 'project' && P && P.parent != null && P.at) { var pl = DW.projectPlacement(P.at); if (pl) ghost(pl.x, pl.y, pl.w, pl.h); }
    if (D.tool === 'section' && P && P.at) {
      var sl = P.parent != null ? P.line : DW.sectionLineAt(P.at);
      if (sl) svgNode('line', { class: 'dw-cut', x1: sl.a[0], y1: H - sl.a[1], x2: sl.b[0], y2: H - sl.b[1], 'stroke-width': pxToPaper(2), 'stroke-dasharray': pxToPaper(12) + ' ' + pxToPaper(3) + ' ' + pxToPaper(3) + ' ' + pxToPaper(3) }, g);
      if (P.parent != null) { var sp = DW.sectionPlacement(P.at); if (sp) ghost(sp.x, sp.y, sp.w, sp.h); }
    }
    if (D.tool === 'detail' && P && P.parent != null) {
      var dw = DW.sheetView(P.parent), rr = P.r != null ? P.r : P.at ? Math.hypot(P.at[0] - P.cp[0], P.at[1] - P.cp[1]) / dw.scale : 0;
      if (rr > 0) svgNode('circle', { class: 'dw-cut', cx: P.cp[0], cy: H - P.cp[1], r: rr * dw.scale, 'stroke-width': pxToPaper(2) }, g);
      if (P.r != null && P.at) { var ds = Drawing.scaleValue(P.scale); ghost(P.at[0], P.at[1], 2 * P.r * ds, 2 * P.r * ds); }
    }
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
  function entityAt(p, any) {
    var tol = pxToPaper(6), best = null, bd = tol;
    D.sheet.views.forEach(function (w) {
      if (!w.ortho && !any) return;   // lengths in a pictorial view are foreshortened (any: pre-highlight only)
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
    });
    return best;
  }
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
    if (D.tool === 'place' && D.pending) { DW.placePending(p); return; }
    if (D.tool === 'project' && D.pending) { DW.projectClick(p); return; }
    if (D.tool === 'section' && D.pending) { DW.sectionClick(p); return; }
    if (D.tool === 'detail' && D.pending) { DW.detailClick(p); return; }
    if (D.tool === 'dim') {
      var ent = entityAt(p);
      if (ent) DW.addDimension(ent); else UI.setStatus('Smart Dimension: click a visible edge or circle of an orthographic view.');
      return;
    }
    if (D.tool === 'centermark') { DW.centerMarkClick(p); return; }
    if (D.tool === 'centerline') { DW.centerlineClick(p); return; }
    if (D.tool === 'holecallout') { DW.holeCalloutClick(p); return; }
    if (D.tool === 'ordinate' || D.tool === 'baseline') { DW.chainDimClick(p); return; }
    if (D.tool === 'chamferdim') { DW.chamferClick(p); return; }
    if (D.tool === 'balloon' || D.tool === 'stackballoon') { DW.balloonClick(p); return; }
    if (D.tool === 'note') { DW.noteClick(p); return; }
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
      if (an.type === 'holeCallout') D.drag ={ kind: 'annot', id: an.id, start: p, lead0: (Drawing.findAnnotation(doc(), an.id).annotation.leadNow || [0, 0]).slice(), moved: false };
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
    if (dm) { D.sel = { kind: 'dim', view: dm.view, key: dm.key || null, index: dm.index }; DW.startDimDrag(dm, p); drawOverlay(); DW.renderTree(); UI.setStatus('Dimension ' + dm.text + (dm.auto ? ' (model item)' : '') + ' \u2014 drag to move it (it snaps in line with the others), click an arrowhead to flip the arrows, double-click to edit the value in place, Delete removes it.'); return; }
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
    if (D.drag && D.drag.kind === 'bom') {
      var pb = toPaper(e), db = D.drag;
      if (!db.moved && Math.hypot(pb[0] - db.start[0], pb[1] - db.start[1]) < pxToPaper(3)) return;
      if (!db.moved) { UI.pushUndo(); db.moved = true; D.host.classList.add('dw-dragging'); }
      doc().bom.x = db.x0 + pb[0] - db.start[0]; doc().bom.y = db.y0 + pb[1] - db.start[1];
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
        if (bb) { bb.pos = [dd.c0[0] + pd[0] - dd.start[0] - vb.x, dd.c0[1] + pd[1] - dd.start[1] - vb.y]; queueRender(true); }
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
      if (/^(place|project|section|detail)$/.test(D.tool) && D.pending) { D.pending.at = q; drawOverlay(); return; }
      if (D.pending && (D.tool === 'balloon' || D.tool === 'stackballoon')) D.pending.at = q;
      if (/^(dim|centermark|holecallout|ordinate|baseline|chamferdim)$/.test(D.tool)) h = entityAt(q);
      else if (D.tool === 'balloon' || D.tool === 'stackballoon') { var eg = DW.edgeAt(q); h = eg ? { kind: 'edge', view: eg.view, body: eg.body } : null; if (D.pending && D.pending.item && !D.pending.placed) { D.hover = h; drawOverlay(); return; } }
      else if (D.tool === 'centerline') h = null;
      else h = preHighlight(q);
      if (JSON.stringify(h) !== JSON.stringify(D.hover)) { D.hover = h; drawOverlay(); }
    }
  }
  // what the cursor pre-highlights with no tool running (SolidWorks): a balloon, an annotation, a dimension, else the
  // model edge under it (in any view; its view's frame shows too), else the view
  function preHighlight(q) {
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
    if ((dg.kind === 'view' || dg.kind === 'bom' || dg.kind === 'dim' || dg.kind === 'balloon' || dg.kind === 'annot' || dg.kind === 'note' || dg.kind === 'flatann') && dg.moved) { UI.autosave(); render(); }
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
    var bq = DW.balloonAt(pp);
    if (bq) { DW.cmdBalloonProps(bq); return; }
    var nq = DW.noteAt(pp);
    if (nq) { D.sel = { kind: 'note', id: nq.id }; DW.openNoteEdit(Drawing.findNote(doc(), nq.id)); return; }
    var aq = DW.annotAt(pp);
    if (aq) { if (aq.type === 'holeCallout') DW.cmdCalloutProps(aq); else if (aq.flat) DW.cmdViewProperties(aq.view); return; }
    var dq = dimAt(pp);
    if (dq) { DW.cmdDimensionPM(DW.dimRef(dq)); DW.openInlineEdit(dq); return; }
    if (DW.bomAt(toPaper(e))) { DW.cmdBOM(); return; }
    var tf = D.sheet && Drawing.titleFieldAt(D.sheet.size, units(), pp);
    if (tf) { DW.openTitleEdit(tf); return; }
    var w = viewAt(toPaper(e));
    if (w) DW.cmdViewProperties(w.view.id); else DW.cmdSheetProperties();
  }
  function onContext(e) {
    settle();
    e.preventDefault(); e.stopPropagation();
    if (!D.active) return;
    var p = toPaper(e), w = viewAt(p);
    if (DW.bomAt(p)) { D.sel = { kind: 'bom' }; drawOverlay(); DW.renderTree(); UI.showMenu(e.clientX, e.clientY, DW.bomMenu()); return; }
    if (w) { D.sel = { kind: 'view', id: w.view.id }; drawOverlay(); DW.renderTree(); UI.showMenu(e.clientX, e.clientY, DW.viewMenu(w.view)); }
    else UI.showMenu(e.clientX, e.clientY, DW.sheetMenu());
  }

  DW.D = D; DW.doc = doc; DW.cctx = cctx; DW.syncBom = syncBom; DW.relayout = relayout; DW.units = units; DW.mesh = mesh; DW.paperK = paperK; DW.edit = edit; DW.editView = editView;
  DW.isAsm = isAsm; DW.docKind = docKind; DW.makeDrawing = makeDrawing; DW.openDrawing = openDrawing; DW.closeDrawing = closeDrawing; DW.detachDrawing = detachDrawing;
  DW.render = render; DW.settle = settle; DW.ready = ready; DW.queueRender = queueRender; DW.svgEl = svgEl; DW.fitBox = fitBox; DW.fitSheet = fitSheet; DW.glideTo = glideTo;
  DW.toPaper = toPaper; DW.pxToPaper = pxToPaper; DW.drawOverlay = drawOverlay; DW.dimMatches = dimMatches; DW.viewAt = viewAt; DW.dimAt = dimAt; DW.entityAt = entityAt; DW.segDist = segDist;
})();
