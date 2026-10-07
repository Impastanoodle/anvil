// drawing-ui-panels.js — the drawing document's panels and automation (drawing-ui.js holds the state and the sheet,
// drawing-ui-tools.js the commands): the drawing FeatureManager (Draw1 ▸ Annotations, Sheet1 ▸ Sheet Format1, the
// Bill of Materials, Drawing View1…n with their centre marks, centrelines, hole callouts and balloons), the View Layout
// and Annotation ribbon tabs (UI.ribbonTabsFor), the drawing menus (UI.menuHook: File, Edit, View, Insert, Tools,
// Window), the keys, following the part through UI.refreshTree and UI.loadModel, the `anvil.drawing` automation API
// with its summary, and UI.drawing / UI.makeDrawing / UI.openDrawing / UI.closeDrawing / UI.drawingActive. Loads last
// of the drawing-ui*.js files and shares their state through UI.drawingInternal.
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.App || typeof document === 'undefined') return;
  var App = UI.App, $ = UI.$, el = UI.el;
  var DW = UI.drawingInternal, D = DW.D, doc = DW.doc, cctx = DW.cctx, syncBom = DW.syncBom, units = DW.units, mesh = DW.mesh, paperK = DW.paperK, edit = DW.edit, isAsm = DW.isAsm, docKind = DW.docKind;
  var makeDrawing = DW.makeDrawing, openDrawing = DW.openDrawing, closeDrawing = DW.closeDrawing, detachDrawing = DW.detachDrawing, render = DW.render, settle = DW.settle, ready = DW.ready, queueRender = DW.queueRender;
  var fitBox = DW.fitBox, fitSheet = DW.fitSheet, glideTo = DW.glideTo, toPaper = DW.toPaper, drawOverlay = DW.drawOverlay, dimMatches = DW.dimMatches, dimAt = DW.dimAt, entityAt = DW.entityAt;
  var cmdStandard3View = DW.cmdStandard3View, cmdModelView = DW.cmdModelView, startPlacing = DW.startPlacing, placePending = DW.placePending, cmdProjectedView = DW.cmdProjectedView, cmdSectionView = DW.cmdSectionView;
  var cmdDetailView = DW.cmdDetailView, cmdViewProperties = DW.cmdViewProperties, setViewTangent = DW.setViewTangent, deleteView = DW.deleteView, deleteSelection = DW.deleteSelection, addDimension = DW.addDimension;
  var cmdSmartDimension = DW.cmdSmartDimension, cmdModelItems = DW.cmdModelItems, setSheet = DW.setSheet, cmdSheetProperties = DW.cmdSheetProperties, exportAs = DW.exportAs, viewMenu = DW.viewMenu, sheetMenu = DW.sheetMenu;
  var defaultBalloonView = DW.defaultBalloonView, autoBalloonView = DW.autoBalloonView, cmdAutoBalloon = DW.cmdAutoBalloon, setBom = DW.setBom, cmdBOM = DW.cmdBOM, setTitleBlock = DW.setTitleBlock, bomMenu = DW.bomMenu;
  var bomAt = DW.bomAt, balloonAt = DW.balloonAt, dimRef = DW.dimRef, setDimProps = DW.setDimProps, annotAt = DW.annotAt, edgeAt = DW.edgeAt, cmdCenterMark = DW.cmdCenterMark, cmdCenterline = DW.cmdCenterline;
  var cmdHoleCallout = DW.cmdHoleCallout, cmdChainDim = DW.cmdChainDim, cmdChamferDim = DW.cmdChamferDim, cmdBalloon = DW.cmdBalloon, setBalloonProps = DW.setBalloonProps, cmdDimensionPM = DW.cmdDimensionPM;
  var applyDimensionPM = DW.applyDimensionPM, cmdDocProps = DW.cmdDocProps, setDocOptions = DW.setDocOptions, autoInsertViews = DW.autoInsertViews;

  // ------------------------------------------------------------------ drawing FeatureManager
  function row(opts) {
    var r = el('div', { class: 'ti' + (opts.sel ? ' selected' : '') + (opts.cls ? ' ' + opts.cls : '') });
    r.style.paddingLeft = (6 + (opts.depth || 0) * 14) + 'px';
    r.appendChild(el('span', { class: 'tw' + (opts.twisty ? '' : ' leaf'), text: '\u25be' }));
    r.appendChild(el('span', { html: Icons(opts.icon, 16) }));
    r.appendChild(el('span', { class: 'nm', text: opts.name, title: opts.title || opts.name }));
    if (opts.badge) r.appendChild(el('span', { class: 'badge', text: opts.badge }));
    Object.keys(opts.data || {}).forEach(function (k) { r.dataset[k] = opts.data[k]; });
    if (opts.click) r.addEventListener('click', opts.click);
    if (opts.dbl) r.addEventListener('dblclick', opts.dbl);
    if (opts.menu) r.addEventListener('contextmenu', function (e) { e.preventDefault(); UI.showMenu(e.clientX, e.clientY, opts.menu()); });
    return r;
  }
  function renderTree() {
    var t = D.tree, dc = doc();
    if (!t || !dc) return;
    t.innerHTML = '';
    t.appendChild(row({ icon: 'drawing', name: dc.name, cls: 'dw-root', twisty: true, title: 'Drawing of ' + App.model.name }));
    t.appendChild(row({ icon: 'annotations', name: 'Annotations', depth: 1, badge: dc.autoDims ? 'model items' : '' }));
    // notes on the sheet (Annotation ▸ Note)
    (dc.notes || []).forEach(function (n) {
      var first = String(n.text).split('\n')[0];
      t.appendChild(row({ icon: 'note', name: 'Note' + n.id, depth: 2, cls: 'dw-note', data: { note: String(n.id) }, sel: D.sel && D.sel.kind === 'note' && D.sel.id === n.id, badge: first.length > 18 ? first.slice(0, 17) + '…' : first, title: n.text + '\n(double-click to edit)',
        click: function () { D.sel = { kind: 'note', id: n.id }; drawOverlay(); renderTree(); }, dbl: function () { D.sel = { kind: 'note', id: n.id }; DW.openNoteEdit(Drawing.findNote(doc(), n.id)); },
        menu: function () { return [{ label: 'Delete', action: function () { edit(function (dc2) { Drawing.deleteNote(dc2, n.id); }); } }]; } }));
    });
    t.appendChild(row({ icon: 'sheet', name: dc.sheet.name, depth: 1, twisty: true, cls: 'dw-sheet', data: { sheet: '1' }, sel: D.sel && D.sel.kind === 'sheet', badge: dc.sheet.format + '  ' + Drawing.scaleText(dc.sheet.scale), title: 'Double-click for Sheet Properties', click: function () { D.sel = { kind: 'sheet' }; drawOverlay(); renderTree(); }, dbl: cmdSheetProperties, menu: sheetMenu }));
    t.appendChild(row({ icon: 'sheetFormat', name: 'Sheet Format1', depth: 2, title: 'Border and title block' }));
    if (dc.bom && dc.bom.show !== false) {
      var nr = D.sheet && D.sheet.bom ? D.sheet.bom.rows.length : 0;
      t.appendChild(row({ icon: 'bom', name: 'Bill of Materials1', depth: 2, cls: 'dw-bom', sel: D.sel && D.sel.kind === 'bom', badge: nr + (nr === 1 ? ' item' : ' items'),
        title: 'Bill of Materials of ' + App.model.name + ' (' + (dc.bom.x != null ? 'moved' : 'anchored ' + (dc.bom.anchor || 'top-right')) + '). Double-click for properties.',
        click: function () { D.sel = { kind: 'bom' }; drawOverlay(); renderTree(); }, dbl: cmdBOM, menu: bomMenu }));
    }
    dc.views.forEach(function (v) {
      var sel = D.sel && D.sel.kind === 'view' && D.sel.id === v.id;
      var w = D.sheet && D.sheet.views.filter(function (x) { return x.view.id === v.id; })[0];
      var st = w ? w.proj.stats : null;
      var badge = v.kind === 'section' ? v.label + '-' + v.label : v.kind === 'detail' ? v.label + ' ' + Drawing.scaleText(v.scale || dc.sheet.scale) : v.orient;
      t.appendChild(row({ icon: v.kind === 'section' ? 'sectionView' : v.kind === 'detail' ? 'detailView' : v.kind === 'projected' ? 'projView' : v.kind === 'flat' ? 'flatView' : 'drawingView', name: v.name, depth: 2, twisty: true, cls: 'dw-view' + (v.kind ? ' dw-' + v.kind : ''), data: { view: String(v.id) }, sel: sel, badge: badge,
        title: v.name + ' \u2014 ' + v.orient + (v.scale ? ', scale ' + Drawing.scaleText(v.scale) : '') + (st ? ' \u2014 ' + st.visibleLines + ' visible / ' + st.hiddenLines + ' hidden lines, ' + st.visibleCircles + ' circles' : '') + '. Double-click for properties.',
        click: function () { D.sel = { kind: 'view', id: v.id }; drawOverlay(); renderTree(); },
        dbl: function () { cmdViewProperties(v.id); }, menu: function () { return viewMenu(v); } }));
      t.appendChild(row({ icon: isAsm() ? 'assembly' : 'part', name: App.model.name, depth: 3, cls: 'dw-ref' }));
      var an = w && D.sheet.annotations ? D.sheet.annotations.filter(function (a) { return a.view === v.id; }) : [];
      [['centerMark', 'Center Marks'], ['centerline', 'Centerlines'], ['holeCallout', 'Hole Callouts']].forEach(function (tp) {
        var list = an.filter(function (a) { return a.type === tp[0]; }), dang = list.filter(function (a) { return a.dangling; }).length;
        if (!list.length) return;
        t.appendChild(row({ icon: tp[0], name: tp[1], depth: 3, cls: 'dw-annots dw-' + tp[0], badge: String(list.length), data: { annots: tp[0] }, title: list.map(function (a) { return a.text; }).join(', ') + (dang ? ' (' + dang + ' dangling)' : ''),
          click: function () { D.sel = { kind: 'annot', id: list[0].id, view: v.id }; drawOverlay(); renderTree(); },
          menu: function () { return [{ label: 'Delete ' + tp[1], action: function () { edit(function (dc2) { var vv = Drawing.findView(dc2, v.id); if (vv) vv.annotations = (vv.annotations || []).filter(function (a) { return a.type !== tp[0]; }); }); } }]; } }));
      });
      // a flat-pattern view: its bend notes (or Bend Table tags), shown / hidden
      var fl = an.filter(function (a) { return a.flat && (a.type === 'bendNote' || a.type === 'bendTag'); });
      if (fl.length) {
        var hid = fl.filter(function (a) { return a.hidden; }).length;
        t.appendChild(row({ icon: 'bendNote', name: fl[0].type === 'bendTag' ? 'Bend Table' : 'Bend Notes', depth: 3, cls: 'dw-annots dw-bendNotes', badge: String(fl.length - hid) + (hid ? ' (' + hid + ' hidden)' : ''), title: fl.map(function (a) { return a.text + (a.hidden ? ' (hidden)' : ''); }).join(', '),
          dbl: function () { cmdViewProperties(v.id); } }));
      }
      var nb = w && D.sheet.balloons ? D.sheet.balloons.filter(function (b) { return b.view === v.id; }).length : 0;
      if (nb) t.appendChild(row({ icon: 'autoBalloon', name: 'Balloons', depth: 3, cls: 'dw-balloons', badge: String(nb), title: nb + ' balloons linked to the Bill of Materials item numbers',
        menu: function () { return [{ label: 'Delete Balloons', action: function () { edit(function (dc2) { Drawing.deleteBalloons(dc2, v.id); }); } }]; } }));
    });
  }

  // ------------------------------------------------------------------ ribbon, menus, keys
  UI.RIBBON['View Layout'] = [
    { id: 'std3view', label: 'Standard\n3 View', run: cmdStandard3View },
    { id: 'modelView', label: 'Model\nView', run: cmdModelView, active: function () { return D.tool === 'place'; } },
    { id: 'projView', label: 'Projected\nView', run: cmdProjectedView, active: function () { return D.tool === 'project'; } },
    { id: 'sectionView', label: 'Section\nView', run: cmdSectionView, active: function () { return D.tool === 'section'; } },
    { id: 'detailView', label: 'Detail\nView', run: cmdDetailView, active: function () { return D.tool === 'detail'; } },
    { sep: true },
    { id: 'dim', label: 'Smart\nDimension', run: cmdSmartDimension, active: function () { return D.tool === 'dim'; } },
    { id: 'modelItems', label: 'Model\nItems', run: cmdModelItems, active: function () { return !!(doc() && doc().autoDims); } },
    { id: 'autoBalloon', label: 'Auto\nBalloon', run: function () { cmdAutoBalloon(); } },
    { id: 'bom', label: 'Bill of\nMaterials', run: function () { cmdBOM(); }, active: function () { return !!(doc() && doc().bom && doc().bom.show !== false); } },
    { sep: true },
    { id: 'sheetProps', label: 'Sheet\nProperties', run: cmdSheetProperties },
    { sep: true },
    { id: 'svgExport', label: 'Save as\nSVG', run: function () { exportAs('svg'); } },
    { id: 'dxfExport', label: 'Save as\nDXF', run: function () { exportAs('dxf'); } },
    { id: 'pdfExport', label: 'Save as\nPDF', run: function () { exportAs('pdf'); } },
    { sep: true },
    { id: 'closeDoc', label: 'Close\nDrawing', run: function () { closeDrawing(); } }
  ];
  // Annotation tab (SolidWorks: Smart Dimension with its Ordinate / Baseline / Chamfer flyout, Model Items, Balloon,
  // Auto Balloon, Stacked Balloon, Hole Callout, Center Mark, Centerline)
  UI.RIBBON.Annotation = [
    { id: 'dim', label: 'Smart\nDimension', run: cmdSmartDimension, active: function () { return D.tool === 'dim'; } },
    { stack: [
      { id: 'ordinateDim', label: 'Ordinate Dimension', run: function () { cmdChainDim('ordinate'); }, active: function () { return D.tool === 'ordinate'; } },
      { id: 'baselineDim', label: 'Baseline Dimension', run: function () { cmdChainDim('baseline'); }, active: function () { return D.tool === 'baseline'; } },
      { id: 'chamferDim', label: 'Chamfer Dimension', run: cmdChamferDim, active: function () { return D.tool === 'chamferdim'; } }
    ] },
    { id: 'modelItems', label: 'Model\nItems', run: cmdModelItems, active: function () { return !!(doc() && doc().autoDims); } },
    { sep: true },
    { id: 'balloon', label: 'Balloon', run: function () { cmdBalloon(false); }, active: function () { return D.tool === 'balloon'; } },
    { id: 'autoBalloon', label: 'Auto\nBalloon', run: function () { cmdAutoBalloon(); } },
    { id: 'stackBalloon', label: 'Stacked\nBalloon', run: function () { cmdBalloon(true); }, active: function () { return D.tool === 'stackballoon'; } },
    { id: 'holeCallout', label: 'Hole\nCallout', run: cmdHoleCallout, active: function () { return D.tool === 'holecallout'; } },
    { id: 'note', label: 'Note', run: function () { DW.cmdNote(); }, active: function () { return D.tool === 'note'; } },
    { sep: true },
    { id: 'centerMark', label: 'Center\nMark', run: cmdCenterMark, active: function () { return D.tool === 'centermark'; } },
    { id: 'centerline', label: 'Centerline', run: cmdCenterline, active: function () { return D.tool === 'centerline'; } },
    { sep: true },
    { id: 'docProps', label: 'Document\nProperties', run: cmdDocProps }
  ];
  if (UI.ASM_RIBBON) { UI.ASM_RIBBON['View Layout'] = UI.RIBBON['View Layout']; UI.ASM_RIBBON.Annotation = UI.RIBBON.Annotation; }
  // the View Layout and Annotation tabs exist only in a drawing document; part tabs are hidden while one is open
  UI.ribbonTabsFor = function (names, extra) {
    if (D.active) return [['View Layout', 'Annotation'], ['Sketch', 'Markup', 'Sheet Format']];
    return [names.filter(function (n) { return n !== 'View Layout' && n !== 'Annotation'; }), extra];
  };
  UI.menuHook = function (menus) {
    var file = menus.filter(function (m) { return m.label === 'File'; })[0];
    if (!D.active) {
      var asm = isAsm();
      if (file) {
        // after the New / Open / Save group (the first separator); matched by position, not by label text
        var at = 0;
        while (at < file.items.length && !file.items[at].sep) at++;
        file.items.splice(at, 0, { sep: true }, { label: asm ? 'Make Drawing from Assembly' : 'Make Drawing from Part', action: function () { makeDrawing(); } });
      }
      // Window: the open document (part or assembly), then the part's drawings
      var win = menus.filter(function (m) { return m.label === 'Window'; })[0];
      if (win) {
        win.items.push({ sep: true });
        win.items.push({ label: (App.model.name || (asm ? 'Assem1' : 'Part1')) + (asm ? ' (assembly)' : ' (part)'), checked: true, action: function () { } });
        (App.model.drawings || []).forEach(function (dc, i) { win.items.push({ label: dc.name + ' - ' + dc.sheet.name, action: function () { makeDrawing({ index: i }); } }); });
      }
      return menus;
    }
    // a drawing document: SolidWorks-style drawing menus
    // the part File menu's New / Open / Save group: everything before its first separator
    var docItems = [];
    (file && file.items || []).some(function (it) { if (it.sep) return true; docItems.push(it); return false; });
    var editMenu = menus.filter(function (m) { return m.label === 'Edit'; })[0], help = menus.filter(function (m) { return m.label === 'Help'; })[0];
    var dc = doc();
    return [
      { label: 'File', items: docItems.concat([
        { sep: true },
        { label: 'Save Drawing as SVG\u2026', action: function () { exportAs('svg'); } },
        { label: 'Save Drawing as DXF\u2026', action: function () { exportAs('dxf'); } },
        { label: 'Save Drawing as PDF\u2026', action: function () { exportAs('pdf'); } },
        { sep: true },
        { label: 'Close Drawing', action: closeDrawing }
      ]) },
      { label: 'Edit', items: (editMenu ? editMenu.items.slice(0, 2) : []).concat([{ label: 'Delete', key: 'Del', disabled: !D.sel || D.sel.kind === 'sheet', action: deleteSelection }]) },
      { label: 'View', items: [{ label: 'Zoom to Fit', key: 'F', action: fitSheet }] },
      { label: 'Insert', items: [
        { label: 'Drawing View \u25b8 Standard 3 View', action: cmdStandard3View },
        { label: 'Drawing View \u25b8 Model\u2026', action: cmdModelView },
        { label: 'Drawing View \u25b8 Projected', action: cmdProjectedView },
        { label: 'Drawing View \u25b8 Section\u2026', action: cmdSectionView },
        { label: 'Drawing View \u25b8 Detail', action: cmdDetailView },
        { label: 'Drawing View \u25b8 Flat Pattern\u2026', disabled: !DW.sheetMetal(), action: function () { DW.cmdFlatView(); } },
        { label: 'Annotations \u25b8 Note', action: function () { DW.cmdNote(); } },
        { label: 'Annotations \u25b8 Smart Dimension', key: 'D', action: cmdSmartDimension },
        { label: 'Annotations \u25b8 Model Items', checked: !!(dc && dc.autoDims), action: cmdModelItems },
        { label: 'Annotations \u25b8 Auto Balloon', disabled: !isAsm(), action: cmdAutoBalloon },
        { label: 'Annotations \u25b8 Balloon', action: function () { cmdBalloon(false); } },
        { label: 'Annotations \u25b8 Stacked Balloon', action: function () { cmdBalloon(true); } },
        { label: 'Annotations \u25b8 Hole Callout', action: cmdHoleCallout },
        { label: 'Annotations \u25b8 Center Mark', action: cmdCenterMark },
        { label: 'Annotations \u25b8 Centerline', action: cmdCenterline },
        { label: 'Dimensions \u25b8 Ordinate', action: function () { cmdChainDim('ordinate'); } },
        { label: 'Dimensions \u25b8 Baseline', action: function () { cmdChainDim('baseline'); } },
        { label: 'Dimensions \u25b8 Chamfer', action: cmdChamferDim },
        { label: 'Tables \u25b8 Bill of Materials\u2026', action: cmdBOM }
      ] },
      { label: 'Tools', items: [{ label: 'Sheet Properties\u2026', action: cmdSheetProperties }, { label: 'Options \u25b8 Document Properties\u2026', action: cmdDocProps }] },
      { label: 'Window', items: [
        { label: App.model.name + ' (' + docKind() + ')', action: closeDrawing },
        { label: (dc ? dc.name + ' - ' + dc.sheet.name : 'Drawing'), checked: true, action: function () { } }
      ] },
      help || { label: 'Help', items: [] }
    ];
  };
  // keys in a drawing: Esc ends a tool, Delete removes the selection, F fits the sheet, D toggles Smart Dimension;
  // other part shortcuts are swallowed (Ctrl+Z / Y / S / O / N still reach the app).
  window.addEventListener('keydown', function (e) {
    if (!D.active) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || !$('modal').hidden) return;
    var k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && /^[zZyYsSoOnN]$/.test(k)) return;
    if (k === 'Enter' && UI.hasPM && UI.hasPM()) return;
    if (k === 'Escape') {
      if (UI.hasPM && UI.hasPM()) return;
      e.stopImmediatePropagation(); e.preventDefault();
      UI.closeMenus();
      if (D.tool) { D.tool = null; D.pending = null; D.hover = null; UI.refreshRibbon(); UI.setStatus('Ready'); } else D.sel = null;
      drawOverlay(); renderTree();
      return;
    }
    e.stopImmediatePropagation();
    if (ctrl) return;
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    if (k === 'f' || k === 'F') { if (D.sheet) glideTo(fitBox(), e.isTrusted); else fitSheet(); drawOverlay(); return; }
    if (k === 'd' || k === 'D') { cmdSmartDimension(); return; }
  }, true);
  // follow the part: every applied rebuild (and undo / redo / load) re-renders the open drawing
  var baseRefreshTree = UI.refreshTree;
  UI.refreshTree = function () {
    var r = baseRefreshTree.apply(this, arguments);
    if (D.active) queueRender();
    return r;
  };

  // another document replaces the one under the drawing (newPart, open, examples, Edit Part / return to assembly)
  var baseLoadModel = UI.loadModel;
  UI.loadModel = function (model) {
    if (D.active || D.renderQueued) detachDrawing(model);
    return baseLoadModel.apply(this, arguments);
  };

  // ------------------------------------------------------------------ automation: anvil.drawing
  // the names of an assembly's part tags (polygon.part, numbered as Assembly.rebuild does: one per part, one per body of
  // a multibody part, a sub-assembly's parts in its order): ['Base<1>', 'Hinge<1>/Leaf<1>', …] (r11/hatch11)
  function partNames() {
    var out = [];
    function walk(model, build, prefix) {
      (model.components || []).forEach(function (c) {
        var pb = build && build.partBuilds && build.partBuilds[c.id], name = prefix + c.name;
        if (!pb || !pb.body) return;
        if (pb.assembly && pb.model) { walk(pb.model, pb, name + '/'); return; }
        var n = 0;
        (pb.body.polygons || []).forEach(function (p) { var t = p.part != null ? p.part : p.body || 0; if (t + 1 > n) n = t + 1; });
        for (var i = 0; i < Math.max(1, n); i++) out.push(n > 1 ? name + ' body ' + (i + 1) : name);
      });
    }
    if (isAsm() && App.build) walk(App.model, App.build, '');
    return out;
  }
  function summary() {
    settle();
    var dc = doc(), pnames = null;
    if (!dc) return null;
    if (D.active && D.renderQueued) render();   // a script reads the sheet as it is now, not a held / queued one
    if (!D.sheet || !D.active) { syncBom(dc); if (dc.layout === 'auto') Drawing.layout(dc, mesh(), units()); D.sheet = Drawing.compute(dc, mesh(), App.model, cctx()); }
    return {
      name: dc.name, open: D.active, sheet: { name: dc.sheet.name, format: dc.sheet.format, size: D.sheet.size, scale: Drawing.scaleText(dc.sheet.scale), autoScale: !!dc.sheet.autoScale, projection: dc.sheet.projection },
      views: D.sheet.views.map(function (w) {
        var b = w.proj.bounds;
        return { id: w.view.id, name: w.view.name, orient: w.view.orient, role: w.view.role, kind: w.view.kind || 'model', label: w.view.label || null, parent: w.view.parent,
          display: w.view.display, tangent: w.view.tangent || 'removed', x: +w.view.x.toFixed(3), y: +w.view.y.toFixed(3), scale: w.view.scale ? Drawing.scaleText(w.view.scale) : null,
          extents: [+(b.umax - b.umin).toFixed(4), +(b.vmax - b.vmin).toFixed(4)], box: [w.box.x0, w.box.y0, w.box.x1, w.box.y1].map(function (x) { return +x.toFixed(3); }), stats: w.proj.stats, dims: (w.view.dims || []).length,
          hatch: w.hatch, sectionArea: w.section ? +w.section.area.toFixed(6) : null,
          hatches: (w.hatches || []).map(function (h) { return { body: h.body, component: isAsm() && App.model.components[h.body] ? App.model.components[h.body].name : null, part: h.part != null ? (pnames || (pnames = partNames()))[h.part] || null : null, angle: h.angle, spacing: +h.spacing.toFixed(4), lines: h.lines, pattern: h.pattern }; }),
          balloons: (D.sheet.balloons || []).filter(function (b) { return b.view === w.view.id; }).map(function (b) { return b.item; }),
          flat: w.view.kind === 'flat' ? flatSummary(w) : undefined };
      }),
      notes: (D.sheet.notes || []).map(function (n) { return { id: n.id, text: n.text, p: [+n.p[0].toFixed(3), +n.p[1].toFixed(3)], box: [n.box.x0, n.box.y0, n.box.x1, n.box.y1].map(function (x) { return +x.toFixed(3); }) }; }),
      bom: D.sheet.bom ? { anchor: dc.bom.x != null ? 'moved' : dc.bom.anchor, box: ['x0', 'y0', 'x1', 'y1'].map(function (q) { return +D.sheet.bom.box[q].toFixed(3); }),
        type: D.sheet.bom.type, columns: D.sheet.bom.columns.map(function (c) { return c.title; }), cells: D.sheet.bom.cells.map(function (r) { return r.map(function (x) { return String(x); }); }),
        rows: D.sheet.bom.rows.map(function (r, i) { var o = { item: r.item, partNumber: r.partNumber, description: r.description, qty: r.qty, components: r.components.map(function (id) { var c = Assembly.findComponent(App.model, id); return c ? c.name : id; }) }; D.sheet.bom.columns.forEach(function (c, j) { if (c.type === 'property') o[c.prop] = String(D.sheet.bom.cells[i][j]); }); return o; }) } : null,
      titleBlock: Drawing.titleBlock(dc, App.model, cctx()),
      balloons: (D.sheet.balloons || []).map(function (b) { return { view: b.view, index: b.index, item: b.item, component: isAsm() ? (Assembly.findComponent(App.model, b.component) || {}).name || null : null, c: [+b.c[0].toFixed(3), +b.c[1].toFixed(3)], attach: [+b.attach[0].toFixed(3), +b.attach[1].toFixed(3)], stack: (b.stack || []).map(function (x) { return x.item; }), qty: b.qty ? b.qtyText : null, manual: !!b.manual }; }),
      dims: D.sheet.dims.map(function (d) { return d.text; }), dangling: D.sheet.dims.filter(function (d) { return d.dangling; }).length, autoDims: !!dc.autoDims,
      dimDetails: D.sheet.dims.map(function (d) { return { view: d.view, kind: d.kind, text: d.text, value: d.value != null ? +(+d.value).toFixed(6) : null, values: d.values ? d.values.map(function (x) { return +x.toFixed(6); }) : undefined, auto: !!d.auto, style: d.style || null, index: d.index != null ? d.index : null, tol: d.tol || null, prec: d.prec != null ? d.prec : null, flip: !!d.flip, dangling: !!d.dangling, box: d.box ? [d.box.x0, d.box.y0, d.box.x1, d.box.y1].map(function (x) { return +x.toFixed(3); }) : null }; }),
      annotations: (D.sheet.annotations || []).map(function (a) { return { id: a.id, view: a.view, type: a.type, style: a.style, text: a.text, auto: a.auto, dangling: a.dangling, box: [a.box.x0, a.box.y0, a.box.x1, a.box.y1].map(function (x) { return +x.toFixed(3); }), centers: a.info && a.info.centers ? a.info.centers.map(function (c) { return [+c[0].toFixed(3), +c[1].toFixed(3)]; }) : undefined }; }),
      options: Drawing.docOptions(dc)
    };
  }
  // a flat-pattern view in the summary: its bends (sheet points, direction, angle, radius, note text), the blank's size
  // and what the bend notes / tags read
  function flatSummary(w) {
    var fd = w.content && w.content.flat;
    if (!fd || fd.error) return { error: fd ? fd.error : 'no flat pattern' };
    var r3 = function (x) { return +x.toFixed(4); };
    return { size: [r3(fd.bbox.umax - fd.bbox.umin), r3(fd.bbox.vmax - fd.bbox.vmin)], bendNotes: w.view.bendNotes || Drawing.docOptions(doc()).bendNotes,
      bends: fd.bends.map(function (b) { return { up: b.up, angle: r3(b.angle), R: r3(b.R), a: w.toSheet(b.a).map(r3), b: w.toSheet(b.b).map(r3), note: Drawing.bendNoteText(b, units()) }; }),
      circles: fd.circles.length, arcs: fd.arcs.length, lines: fd.lines.length,
      annotations: (D.sheet.annotations || []).filter(function (a) { return a.flat && a.view === w.view.id; }).map(function (a) { return { id: a.id, key: a.key, type: a.type, text: a.text, hidden: a.hidden, box: [a.box.x0, a.box.y0, a.box.x1, a.box.y1].map(function (x) { return +x.toFixed(3); }) }; }) };
  }
  // runs an engine call on a scratch copy first, so a refused view (missing parent, detail of a detail…) leaves no undo step
  function viewApi(fn) {
    if (!doc()) return null;
    try { fn(JSON.parse(JSON.stringify(doc()))); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
    var v, off = false;
    edit(function (dc) { v = fn(dc); if (v.offSheet) { off = true; delete v.offSheet; } autoInsertViews(dc, [v.id]); });
    if (off) { var msg = v.name + ': no room on the sheet, placed beside it. Move it, or use a larger sheet or a smaller scale.'; UI.toast(msg); UI.setStatus(msg); }
    D.sel = { kind: 'view', id: v.id };
    return summary();
  }
  function annotApi(fn) {
    if (!doc()) return null;
    try { fn(JSON.parse(JSON.stringify(doc()))); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
    edit(function (dc) { fn(dc); });
    return summary();
  }
  function current() { if (!doc()) return null; settle(); if (D.active && D.renderQueued) render(); if (!D.active) { syncBom(); if (doc().layout === 'auto') Drawing.layout(doc(), mesh(), units()); D.sheet = Drawing.compute(doc(), mesh(), App.model, cctx()); } return D.sheet; }
  if (window.anvil) {
    window.anvil.drawing = {
      make: function (opts) { return makeDrawing(opts) ? summary() : null; },
      open: function (i) { return makeDrawing({ index: i || 0 }) ? summary() : null; },
      close: function () { closeDrawing(); },
      isOpen: function () { return D.active; },
      summary: summary,
      standard3View: function () { cmdStandard3View(); return summary(); },
      // Projected / Section / Detail View without the mouse; each is one undo step and returns the summary
      projectedView: function (parentId, dir, opts) { return viewApi(function (dc) { return Drawing.addProjectedView(dc, mesh(), parentId, dir, Object.assign({ fit: true }, opts || {})); }); },
      sectionView: function (parentId, opts) { return viewApi(function (dc) { return Drawing.addSectionView(dc, mesh(), parentId, Object.assign({ fit: true }, opts || {})); }); },
      detailView: function (parentId, opts) { return viewApi(function (dc) { return Drawing.addDetailView(dc, mesh(), parentId, Object.assign({ c: [0, 0], fit: true }, opts || {})); }); },
      deleteView: function (id) { deleteView(id); return summary(); },
      tangent: function (id, mode) { setViewTangent(id, mode); return summary(); },
      // assembly drawings: Auto Balloon on a view (default: the selected view, else the isometric), the Bill of
      // Materials (anchor 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left', or { x, y } for its top-left corner),
      // bom(null) removes it
      autoBalloon: function (viewId, opts) { if (!doc() || !isAsm()) return null; var v = viewId != null ? Drawing.findView(doc(), viewId) : defaultBalloonView(); if (!v) return null; autoBalloonView(v.id, opts); return summary(); },
      deleteBalloons: function (viewId) { if (!doc()) return null; edit(function (dc) { Drawing.deleteBalloons(dc, viewId); }); return summary(); },
      bom: function (props) { if (!doc()) return null; if (props !== undefined) setBom(props === null ? null : typeof props === 'string' ? { anchor: props } : props); return summary().bom; },
      // BOM columns: bomColumns() -> the column specs; bomColumns([{ type, prop, title, width, hidden } | 'Material', …])
      // replaces them (a string is a property column); bomType('top' | 'indented' | 'parts'); each one undo step, returns summary().bom
      bomColumns: function (cols) { if (!doc()) return null; if (!arguments.length) return Drawing.bomColumnSpecs(doc().bom); setBom({ columns: cols }); return summary().bom; },
      bomType: function (t) { if (!doc()) return null; if (!arguments.length) return (doc().bom && doc().bom.type) || 'top'; setBom({ type: t }); return summary().bom; },
      // title block: titleBlock() -> { key: text shown }; titleBlock({ key: text | null }) sets (null: back to the default link)
      titleBlock: function (map) { if (!doc()) return null; if (map) setTitleBlock(map); return Drawing.titleBlock(doc(), App.model, cctx()); },
      addView: function (orient, opts) { opts = opts || {}; startPlacing({ orient: orient, display: opts.display, scale: opts.scale ? Drawing.parseScale(opts.scale) : null }); placePending([opts.x != null ? opts.x : 60 * paperK(), opts.y != null ? opts.y : 100 * paperK()]); return summary(); },
      setSheet: function (props) { setSheet(props || {}); return summary(); },
      modelItems: function (on) { if (!!doc().autoDims !== !!on) cmdModelItems(); return summary(); },
      svg: function () { return Drawing.toSVG(current()); },
      dxf: function () { return Drawing.toDXF(current()); },
      pdf: function () { return Drawing.toPDF(current()); },
      doc: function () { return JSON.parse(JSON.stringify(doc())); },
      // annotations: each is one undo step and returns the summary (null and a status message when refused)
      options: function (props) { if (!doc()) return null; if (props) setDocOptions(props); return Drawing.docOptions(doc()); },
      centerMark: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addCenterMark(dc, viewId, spec || {}); }); },
      autoCenterMarks: function (viewId) { return annotApi(function (dc) { var n = 0; dc.views.forEach(function (v) { if (viewId == null || v.id === viewId) n += Drawing.autoCenterMarks(dc, mesh(), v.id); }); return n; }); },
      centerline: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addCenterline(dc, viewId, spec || {}); }); },
      autoCenterlines: function (viewId) { return annotApi(function (dc) { var n = 0; dc.views.forEach(function (v) { if (viewId == null || v.id === viewId) n += Drawing.autoCenterlines(dc, mesh(), v.id); }); return n; }); },
      holeCallout: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addHoleCallout(dc, viewId, spec || {}); }); },
      deleteAnnotation: function (id) { return annotApi(function (dc) { if (!Drawing.deleteAnnotation(dc, id)) throw new Error('No annotation ' + id); return true; }); },
      ordinate: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addOrdinate(dc, viewId, spec || {}); }); },
      baseline: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addBaseline(dc, viewId, spec || {}); }); },
      chamferDim: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addChamferDim(dc, viewId, spec || {}); }); },
      // dimension i of summary().dims: dimProps(i) -> its properties; dimProps(i, { tol, prec, label, flip, at, tx, lead, off })
      dimProps: function (i, props) {
        var d = current() && current().dims[i];
        if (!d) return null;
        if (props) { setDimProps(d, props); d = current().dims.filter(function (x) { return dimMatches(dimRef(d), x); })[0] || d; }
        var o = {}; Drawing.DIM_PROPS.forEach(function (k) { if (d[k] != null) o[k] = JSON.parse(JSON.stringify(d[k])); }); o.text = d.text;
        return o;
      },
      dimSource: function (i) { var d = current() && current().dims[i]; if (!d) return null; var w = current().views.filter(function (x) { return x.view.id === d.view; })[0]; return Drawing.dimSource(App.model, App.build, w, d); },
      // driveDim(i, value) -> Promise of the summary: a model item's new value changes the part and rebuilds it
      driveDim: function (i, value) {
        var d = current() && current().dims[i], w = d && current().views.filter(function (x) { return x.view.id === d.view; })[0], src = d && d.auto ? Drawing.dimSource(App.model, App.build, w, d) : null;
        if (!src) { UI.setStatus('That dimension drives no model parameter.'); return Promise.resolve(null); }
        var r = applyDimensionPM(d, src, { value: value, tolType: d.tol ? d.tol.type : 'none', plus: d.tol ? d.tol.plus : 0, minus: d.tol ? d.tol.minus : 0, prec: d.prec != null ? String(d.prec) : 'auto', label: d.label, flip: d.flip });
        return r && r.then ? r.then(function () { return summary(); }) : Promise.resolve(r === false ? null : summary());
      },
      // sheet metal: flatView({ x, y, scale, bendNotes: 'notes' | 'table' | 'none' }) adds the flat-pattern view (one
      // undo step; null and a message on a part that is not sheet metal); flatViewProps(id, { bendNotes, flatSize });
      // flatAnnotation(viewId, key ('b0', 'b1' … | 'table' | 'size'), { off: [dx, dy], hidden })
      flatView: function (opts) {
        opts = opts || {};
        if (!doc() || !DW.flatReady()) return null;
        return viewApi(function (dc) { return Drawing.addFlatView(dc, mesh(), { model: App.model, build: App.build, x: opts.x, y: opts.y, scale: opts.scale || null, bendNotes: opts.bendNotes, fit: true }); });
      },
      flatViewProps: function (id, props) { if (!doc()) return null; DW.setFlatViewProps(id, props || {}); return summary(); },
      flatAnnotation: function (viewId, key, props) { return annotApi(function (dc) { return Drawing.flatAnnotation(dc, viewId, key, props || {}); }); },
      // notes: note({ p: [x, y] (paper), text ('\n' between lines), h }), editNote(id, { text, p, h }), deleteNote(id),
      // notes() -> [{ id, text, p, box }]; each change is one undo step
      note: function (spec) { return annotApi(function (dc) { return Drawing.addNote(dc, spec || {}); }); },
      editNote: function (id, props) { return annotApi(function (dc) { if (!Drawing.findNote(dc, id)) throw new Error('No note ' + id); Drawing.editNote(dc, id, props || {}); return true; }); },
      deleteNote: function (id) { return annotApi(function (dc) { if (!Drawing.deleteNote(dc, id)) throw new Error('No note ' + id); return true; }); },
      notes: function () { var s = summary(); return s ? s.notes : null; },
      balloon: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addBalloon(dc, App.model, viewId, spec || {}); }); },
      balloonProps: function (viewId, index, props) { if (!doc()) return null; setBalloonProps(viewId, index, props || {}); return summary(); }
    };
  }
  UI.makeDrawing = makeDrawing; UI.openDrawing = openDrawing; UI.closeDrawing = closeDrawing; UI.drawingActive = function () { return D.active; };
  UI.drawing = { state: D, render: render, ready: ready, settle: settle, note: function () { DW.cmdNote(); }, noteAt: function (p) { return DW.noteAt(p); }, flatView: function () { DW.cmdFlatView(); }, centerMark: cmdCenterMark, centerline: cmdCenterline, holeCallout: cmdHoleCallout, ordinate: function () { cmdChainDim('ordinate'); }, baseline: function () { cmdChainDim('baseline'); },
    chamferDim: cmdChamferDim, balloon: function () { cmdBalloon(false); }, stackedBalloon: function () { cmdBalloon(true); }, docProps: cmdDocProps, dimensionPM: cmdDimensionPM, annotAt: annotAt, dimAt: dimAt, edgeAt: edgeAt, autoBalloon: cmdAutoBalloon, bom: cmdBOM, balloonAt: balloonAt, bomAt: bomAt, fit: fitSheet, standard3View: cmdStandard3View, projectedView: cmdProjectedView, sectionView: cmdSectionView, detailView: cmdDetailView, modelView: cmdModelView, smartDimension: cmdSmartDimension, modelItems: cmdModelItems, sheetProperties: cmdSheetProperties, viewProperties: cmdViewProperties, deleteSelection: deleteSelection, addDimension: addDimension, entityAt: entityAt, exportAs: exportAs, toPaper: toPaper };
  DW.renderTree = renderTree;
  // the File menu gets its drawing entry through UI.menuHook; redraw the menu bar now that the hook exists
  if (UI.renderMenuBar && $('menus').children.length) UI.renderMenuBar();
  if (UI.refreshRibbon && $('ribbon-buttons').children.length) UI.refreshRibbon();
})();
