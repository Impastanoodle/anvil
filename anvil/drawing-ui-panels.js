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
  var makeDrawing = DW.makeDrawing, openDrawing = DW.openDrawing, closeDrawing = DW.closeDrawing, requestClose = DW.requestClose, detachDrawing = DW.detachDrawing, render = DW.render, settle = DW.settle, ready = DW.ready, queueRender = DW.queueRender;
  var fitBox = DW.fitBox, fitSheet = DW.fitSheet, glideTo = DW.glideTo, toPaper = DW.toPaper, drawOverlay = DW.drawOverlay, dimMatches = DW.dimMatches, dimAt = DW.dimAt, entityAt = DW.entityAt;
  var cmdStandard3View = DW.cmdStandard3View, cmdModelView = DW.cmdModelView, startPlacing = DW.startPlacing, placePending = DW.placePending, cmdProjectedView = DW.cmdProjectedView, cmdSectionView = DW.cmdSectionView;
  var cmdDetailView = DW.cmdDetailView, cmdViewProperties = DW.cmdViewProperties, setViewTangent = DW.setViewTangent, deleteView = DW.deleteView, deleteSelection = DW.deleteSelection, addDimension = DW.addDimension;
  var cmdSmartDimension = DW.cmdSmartDimension, cmdModelItems = DW.cmdModelItems, setSheet = DW.setSheet, cmdSheetProperties = DW.cmdSheetProperties, exportAs = DW.exportAs, viewMenu = DW.viewMenu, sheetMenu = DW.sheetMenu;
  var defaultBalloonView = DW.defaultBalloonView, autoBalloonView = DW.autoBalloonView, cmdAutoBalloon = DW.cmdAutoBalloon, setBom = DW.setBom, cmdBOM = DW.cmdBOM, setTitleBlock = DW.setTitleBlock, bomMenu = DW.bomMenu;
  var bomAt = DW.bomAt, balloonAt = DW.balloonAt, dimRef = DW.dimRef, setDimProps = DW.setDimProps, annotAt = DW.annotAt, edgeAt = DW.edgeAt, cmdCenterMark = DW.cmdCenterMark, cmdCenterline = DW.cmdCenterline;
  var cmdHoleCallout = DW.cmdHoleCallout, cmdChainDim = DW.cmdChainDim, cmdChamferDim = DW.cmdChamferDim, cmdBalloon = DW.cmdBalloon, setBalloonProps = DW.setBalloonProps, cmdDimensionPM = DW.cmdDimensionPM;
  var applyDimensionPM = DW.applyDimensionPM, cmdDocProps = DW.cmdDocProps, setDocOptions = DW.setDocOptions, autoInsertViews = DW.autoInsertViews;

  // ------------------------------------------------------------------ rfT: Model Items PM, ANSI scales, Dimensions page
  // An inch drawing lists the ANSI scales (1:1, 1:2, 1:4, 1:8 …): Sheet Properties and the Model View PM build their
  // scale lists from Drawing.SCALES while they open, so it holds the drawing's unit set for that call
  function withUnitScales(fn) {
    return function () {
      var S = Drawing.SCALES, want = Drawing.scalesFor ? Drawing.scalesFor(units()) : S;
      if (want === S) return fn.apply(this, arguments);
      var keep = S.slice();
      S.length = 0; want.forEach(function (x) { S.push(x.slice()); });
      try { return fn.apply(this, arguments); } finally { S.length = 0; keep.forEach(function (x) { S.push(x); }); }
    };
  }
  cmdSheetProperties = withUnitScales(cmdSheetProperties); cmdModelView = withUnitScales(cmdModelView);
  // Model Items (SolidWorks' Insert Model Items PropertyManager): Source / Destination, Dimensions (Marked for drawing,
  // Hole Wizard locations, Hole callouts), Annotations, Options (Eliminate duplicates); OK inserts them (one undo step)
  // as the drawing's model items, kept in doc.modelItems (Drawing.modelItems)
  function modelItemFeatures() {
    return (App.model.features || []).filter(function (f) { return !f.suppressed && (f.type === 'sketch' || f.type === 'flange' || f.sketch != null); })
      .map(function (f) { return [String(f.id), f.name || f.type]; });
  }
  function applyModelItems(o) {
    o = o || {};
    var dc0 = doc(), views = dc0.views.map(function (v) { return v.id; });
    var mi = { source: o.source === 'feature' && o.feature != null && o.feature !== '' ? 'feature' : 'entire', marked: o.marked !== false, holeLocations: o.holeLocations !== false,
      holeCallouts: o.holeCallouts !== false, annotations: o.annotations !== false, dedupe: o.dedupe !== false };
    if (mi.source === 'feature') mi.feature = isNaN(+o.feature) ? o.feature : +o.feature;
    var dest = o.views && o.views !== 'all' ? [].concat(o.views).map(function (x) { return +x; }).filter(function (x) { return views.indexOf(x) >= 0; }) : [];
    if (dest.length) mi.views = dest;
    edit(function (dc) {
      dc.modelItems = mi; dc.autoDims = true; dc.suppressed = [];
      if (mi.annotations && autoInsertViews) { try { autoInsertViews(dc, dest.length ? dest : null); } catch (e) { } }
      // (rfAJ) Hole callouts: one hole callout per Hole Wizard hole, with the feature's text (its circles get no Ø dimension)
      if (Drawing.insertWizardCallouts) { try { Drawing.insertWizardCallouts(dc, App.model, dest.length ? dest : null, { on: mi.holeCallouts, dedupe: mi.dedupe, feature: mi.source === 'feature' ? mi.feature : null }); } catch (e) { } }
    });
    UI.setStatus('Model Items inserted' + (mi.source === 'feature' ? ' from the selected feature' : '') + (dest.length ? ' into ' + dest.length + ' view' + (dest.length > 1 ? 's' : '') : ' into all views') + '.');
  }
  function cmdModelItemsPM() {
    var dc = doc();
    if (!dc) return;
    if (isAsm()) { cmdModelItems(); return; }
    var cur = Drawing.modelItems(dc), feats = modelItemFeatures(), sel = D.sel && D.sel.kind === 'view' ? D.sel.id : null;
    var viewOpts = dc.views.map(function (v) { return [String(v.id), v.name]; });
    var vals = { source: cur.source, feature: cur.feature != null ? String(cur.feature) : (feats[0] ? feats[0][0] : ''), dest: cur.views || sel != null ? 'selected' : 'all',
      view: String(cur.views ? cur.views[0] : sel != null ? sel : (dc.views[0] ? dc.views[0].id : '')), marked: cur.marked, holeLocations: cur.pm ? cur.holeLocations : true,
      holeCallouts: cur.holeCallouts, annotations: cur.annotations, dedupe: cur.dedupe };
    pmOpen({
      title: 'Model Items', icon: 'modelItems', command: 'modelItems',
      message: 'Inserts the part\'s dimensions into the drawing views: the sketch and feature dimensions marked for drawing, flange lengths, hole locations and hole callouts.',
      values: vals,
      groups: [
        { title: 'Source/Destination', fields: [
          { type: 'radio', key: 'source', label: 'Source', options: [['entire', 'Entire model'], ['feature', 'Selected feature']] },
          { type: 'select', key: 'feature', label: 'Feature', options: feats.length ? feats : [['', '(none)']] },
          { type: 'radio', key: 'dest', label: 'Destination', options: [['all', 'Import items into all views'], ['selected', 'Selected view']] },
          { type: 'select', key: 'view', label: 'View', options: viewOpts.length ? viewOpts : [['', '(none)']] }
        ] },
        { title: 'Dimensions', fields: [
          { type: 'check', key: 'marked', label: 'Marked for drawing' },
          { type: 'check', key: 'holeLocations', label: 'Hole Wizard locations' },
          { type: 'check', key: 'holeCallouts', label: 'Hole callout' }
        ] },
        { title: 'Annotations', fields: [{ type: 'check', key: 'annotations', label: 'Center marks and centerlines' }] },
        { title: 'Options', fields: [{ type: 'check', key: 'dedupe', label: 'Eliminate duplicates' }] }
      ],
      onOK: function (v) {
        applyModelItems({ source: v.source, feature: v.feature, views: v.dest === 'selected' && v.view !== '' ? [v.view] : 'all', marked: !!v.marked, holeLocations: !!v.holeLocations,
          holeCallouts: !!v.holeCallouts, annotations: !!v.annotations, dedupe: !!v.dedupe });
      }
    }, 'modelItems', {});
    UI.setStatus('Model Items: choose the source, the destination views and the items, then OK.');
  }
  DW.cmdModelItemsPM = cmdModelItemsPM; DW.applyModelItems = applyModelItems;
  // Document Properties > Dimensions (ANSI inch / ISO mm): text height, arrow length and width, extension-line gap and
  // extension beyond the dimension line, in the drawing's units, stored in doc.options (Drawing.dimSizes); a page added
  // to the Document Properties dialog, applied with its OK
  var baseDocProps = cmdDocProps;
  cmdDocProps = function () {
    baseDocProps();
    var body = document.querySelector('.dw-docprops'), ok = document.getElementById('dw-opt-ok');
    if (!body || !doc()) return;
    var z = Drawing.dimSizes(doc()), inch = z.units === 'in', un = inch ? 'in' : 'mm', inputs = {};
    var rows = [['dimText', 'Text height'], ['arrowLen', 'Arrow length'], ['arrowWidth', 'Arrow width'], ['extGap', 'Extension line gap'], ['extBeyond', 'Extension beyond dimension line']];
    var kids = [el('div', { class: 'dw-tb-head', text: 'Dimensions (' + (inch ? 'ANSI, inches' : 'ISO, millimetres') + ')' })];
    rows.forEach(function (r) {
      var inp = el('input', { type: 'number', step: inch ? '0.001' : '0.1', min: '0', value: String(z[r[0]]), id: 'dw-opt-' + r[0] });
      inputs[r[0]] = inp;
      kids.push(el('label', { text: r[1] + ' (' + un + ')' }), inp);
    });
    var sec = el('div', { class: 'dw-docprops-dims' }, kids);
    body.appendChild(sec);
    if (ok) ok.addEventListener('click', function () {
      var props = {}, df = Drawing.DIM_SIZES[z.units];
      rows.forEach(function (r) { var x = +inputs[r[0]].value; props[r[0]] = x > 0 && Math.abs(x - df[r[0]]) > 1e-12 ? x : ''; });
      setDocOptions(props);
    }, true);
  };

  // ------------------------------------------------------------------ rfQ: several sheets in the exports
  // sheetOf(i) -> sheet i worked out (the active one is the sheet on screen); the others are laid out and worked out
  // whole, without switching the sheet on screen
  function sheetOf(i) {
    var dc = doc(), a = dc.activeSheet | 0;
    if (i == null || i === a) return current();
    var sd = Drawing.sheetDoc(dc, i);
    if (sd.layout === 'auto') Drawing.layout(sd, mesh(), units());
    return Drawing.compute(sd, mesh(), App.model, cctx());
  }
  function everySheet() { var out = []; for (var i = 0; i < Drawing.sheetCount(doc()); i++) out.push(sheetOf(i)); return out; }
  // Save as PDF writes every sheet, one page each (as SolidWorks saves a multi-sheet drawing); Save as SVG / DXF
  // write one sheet, the active one, and the save dialog gets a Sheet choice when the drawing has more than one
  // (choosing another sheet activates it and writes that one)
  var baseExportAs = DW.exportAs;
  exportAs = DW.exportAs = function (kind, opts) {
    opts = opts || {};
    var dc = doc();
    if (!dc) return;
    if (opts.sheet != null && Drawing.sheetIndex(dc, opts.sheet) >= 0) DW.activateSheet(opts.sheet);
    var n = Drawing.sheetCount(dc);
    if (kind === 'pdf' && n > 1) {
      settle();
      var nm = (dc.name + '_' + (App.model.name || 'part')).replace(/[^\w\-]+/g, '_');
      UI.exportDialog('Save Drawing as PDF (' + n + ' sheets, one page each)', nm + '.pdf', Drawing.toPDF(everySheet()), 'application/pdf');
      return;
    }
    baseExportAs(kind, opts);
    if (n < 2 || kind === 'pdf') return;
    var ta = document.querySelector('#modal textarea');
    if (!ta) return;
    var sel = el('select', { id: 'dw-export-sheet', title: 'The sheet to save' });
    Drawing.sheets(doc()).forEach(function (s) { var op = el('option', { value: String(s.index), text: s.name }); if (s.active) op.selected = true; sel.appendChild(op); });
    sel.onchange = function () { exportAs(kind, { sheet: +sel.value }); };
    ta.parentNode.insertBefore(el('p', {}, [el('label', { text: 'Sheet ' }), sel, el('span', { class: 'dw-muted', text: '  one sheet per ' + kind.toUpperCase() + ' file (Save as PDF writes every sheet)' })]), ta);
    var vs = document.getElementById('dw-dxf-version');
    if (vs) vs.onchange = function () { exportAs('dxf', { version: vs.value }); };
  };

  // ------------------------------------------------------------------ rfQ: the general tolerances block edits as lines
  // A title block field of several lines (f.multi: the general tolerances) is edited in place in a box of lines:
  // Enter / Shift+Enter starts a new line, Ctrl+Enter or ✓ applies, Esc / ✗ cancels (as a note is typed). The other
  // fields keep their one-line box (drawing-ui-tools.js).
  var baseTitleEdit = DW.openTitleEdit;
  DW.openTitleEdit = function (tf) {
    if (!tf || !tf.field || !tf.field.multi) return baseTitleEdit(tf);
    DW.closeInlineEdit(false);
    var dc = doc(), own = dc.titleBlock && dc.titleBlock[tf.field.key];
    var shown = own != null ? String(own) : Drawing.titleBlock(dc, App.model, { build: App.build || null, mesh: mesh() })[tf.field.key] || '';
    var ta = el('textarea', { rows: String(Math.max(3, Math.min(8, shown.split('\n').length + 1))), spellcheck: 'false', 'aria-label': tf.field.label });
    var ok = el('button', { class: 'dw-edit-btn ok', title: 'OK (Ctrl+Enter)', text: '✓' }), no = el('button', { class: 'dw-edit-btn', title: 'Cancel (Esc)', text: '✗' });
    var box = el('div', { id: 'dw-edit', class: 'text tb multi' }, [ta, el('div', { class: 'dw-edit-col' }, [ok, no])]);
    ta.value = shown;
    D.root.appendChild(box);
    D.inline = { box: box, inp: ta, field: { key: tf.field.key, rect: tf.rect, shown: shown, multi: true } };
    DW.positionInlineEdit();
    ta.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); DW.closeInlineEdit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); DW.closeInlineEdit(false); }
    });
    ta.addEventListener('blur', function () { setTimeout(function () { if (D.inline && D.inline.inp === ta && !box.contains(document.activeElement)) DW.closeInlineEdit(false); }, 0); });
    [ok, no].forEach(function (b) { b.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); }); });
    ok.addEventListener('click', function () { DW.closeInlineEdit(true); });
    no.addEventListener('click', function () { DW.closeInlineEdit(false); });
    box.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    try { ta.focus({ preventScroll: true }); ta.select(); } catch (err) { }
    UI.setStatus(tf.field.label + ': one line per row (Enter starts a new line; empty restores the default); Ctrl+Enter or ✓ applies, Esc cancels.');
  };

  // ------------------------------------------------------------------ rfM: Revision Table, shop symbols, drawing properties
  // A PropertyManager of the drawing (as drawing-ui-tools.js opens them): the sheet stays live under it
  function pmOpen(spec, tool, pending) {
    var onClose = spec.onClose;
    spec.onClose = function () {
      $('app').classList.remove('dw-pm'); DW.closeInlineEdit(false);
      if (tool && D.tool === tool) { D.tool = null; D.pending = null; D.hover = null; UI.refreshRibbon(); }
      if (onClose) onClose();
      if (D.active) { UI.setFmTab('tree'); render(); }
    };
    UI.openPM(spec);
    $('app').classList.add('dw-pm');
    if (tool) { D.tool = tool; D.pending = pending; D.hover = null; drawOverlay(); UI.refreshRibbon(); }
  }
  var SYM_TITLES = { surfaceFinish: 'Surface Finish', datum: 'Datum Feature', gtol: 'Geometric Tolerance' };
  var MOD_OPTIONS = [['', 'None (RFS)'], ['M', 'Ⓜ Maximum material condition'], ['L', 'Ⓛ Least material condition']];
  // symbol PM values <-> symbol fields
  function symValues(type, s) {
    s = s || {};
    if (type === 'surfaceFinish') return { symbol: s.symbol || 'machined', ra: s.ra != null ? s.ra : units() === 'in' ? '125' : '3.2', method: s.method || '', leader: s.id ? !!s.leader : true };
    if (type === 'datum') return { label: s.label || Drawing.nextDatum(doc()), leader: true };
    var d = s.datums || [];
    return { char: s.char || 'position', dia: s.id ? !!s.dia : true, tol: s.tol || (units() === 'in' ? '.010' : '0.2'), mod: s.mod || '', d1: d[0] || '', d2: d[1] || '', d3: d[2] || '', leader: s.id ? !!s.leader : true };
  }
  function symSpec(type, v) {
    if (type === 'surfaceFinish') return { symbol: v.symbol, ra: v.ra, method: v.method };
    if (type === 'datum') return { label: v.label };
    return { char: v.char, dia: !!v.dia, tol: v.tol, mod: v.mod, datums: [v.d1, v.d2, v.d3].filter(function (x) { return String(x || '').trim(); }) };
  }
  function symGroups(type, editing) {
    var lead = { title: 'Leader', fields: [{ type: 'check', key: 'leader', label: editing ? 'Leader (drag its arrow on the sheet)' : 'Leader: first click the arrow point, then the symbol' }] };
    if (type === 'surfaceFinish') return [
      { title: 'Symbol', fields: [{ type: 'select', key: 'symbol', label: 'Symbol', options: Drawing.SF_SYMBOLS }] },
      { title: 'Symbol Layout', fields: [{ type: 'text', key: 'ra', label: 'Maximum roughness (Ra)' }, { type: 'text', key: 'method', label: 'Production method' }] }, lead];
    if (type === 'datum') return [{ title: 'Label Settings', fields: [{ type: 'text', key: 'label', label: 'Label' }] }, lead];
    return [
      { title: 'Symbol', fields: [{ type: 'select', key: 'char', label: 'Characteristic', options: Drawing.GTOL_CHARS }] },
      { title: 'Tolerance 1', fields: [{ type: 'check', key: 'dia', label: 'Ø Diameter' }, { type: 'text', key: 'tol', label: 'Tolerance' }, { type: 'select', key: 'mod', label: 'Material condition', options: MOD_OPTIONS }] },
      { title: 'Datums', fields: [{ type: 'text', key: 'd1', label: 'Primary (e.g. A, B(M))' }, { type: 'text', key: 'd2', label: 'Secondary' }, { type: 'text', key: 'd3', label: 'Tertiary' }] }, lead];
  }
  // cmdSymbol(type, id?): with id, the symbol's PropertyManager (OK applies, one undo step); without, the insert tool —
  // click the sheet to place the symbol (with Leader: the arrow point first), ✓ / Esc ends
  function cmdSymbol(type, id) {
    var title = SYM_TITLES[type];
    if (id != null) {
      var s = Drawing.findSymbol(doc(), id);
      if (!s) return;
      pmOpen({ title: title, icon: type === 'gtol' ? 'gtol' : type === 'datum' ? 'datumFeature' : 'surfaceFinish', command: type, message: Drawing.symbolText(s), values: symValues(type, s), groups: symGroups(type, true),
        onOK: function (v) {
          var spec = symSpec(type, v);
          if (!v.leader) spec.leader = null; else if (!s.leader) spec.leader = [s.p[0] - 12 * paperK(), s.p[1] - 8 * paperK()];
          try { Drawing.editSymbol(JSON.parse(JSON.stringify(doc())), id, spec); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return; }
          edit(function (dc) { Drawing.editSymbol(dc, id, spec); });
          UI.setStatus(title + ' changed.');
        } });
      return;
    }
    if (D.tool === 'symbol' && D.pending && D.pending.type === type) { if (UI.hasPM && UI.hasPM()) UI.pmCancel(); return; }
    var vals = symValues(type, null);
    pmOpen({ title: title, icon: type === 'gtol' ? 'gtol' : type === 'datum' ? 'datumFeature' : 'surfaceFinish', command: type,
      message: 'Set the symbol, then click on the sheet to place it' + (vals.leader ? ' (Leader on: click the arrow point first)' : '') + '. Esc or ✓ ends.', values: vals, groups: symGroups(type, false),
      onChange: function (v) { if (D.pending) { D.pending.values = v; if (!v.leader) D.pending.tip = null; } } }, 'symbol', { type: type, values: vals, tip: null });
    UI.setStatus(title + ': ' + (vals.leader ? 'click the point the leader arrow touches, then where the symbol goes.' : 'click where the symbol goes.'));
  }
  function symbolClick(p) {
    var P = D.pending;
    if (!P) return;
    if (P.values.leader && !P.tip) { P.tip = p; UI.setStatus(SYM_TITLES[P.type] + ': now click where the symbol goes.'); return; }
    var spec = Object.assign({ type: P.type, p: p }, symSpec(P.type, P.values));
    if (P.tip) spec.leader = P.tip;
    try { Drawing.addSymbol(JSON.parse(JSON.stringify(doc())), spec); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return; }
    var made;
    edit(function (dc) { made = Drawing.addSymbol(dc, spec); });
    D.sel = { kind: 'symbol', id: made.id };
    P.tip = null;
    // the next datum gets the next letter
    if (P.type === 'datum') { P.values.label = Drawing.nextDatum(doc()); if (UI.pmSet) try { UI.pmSet({ label: P.values.label }); } catch (e) { } }
    UI.setStatus(Drawing.symbolText(made) + ' placed — click for the next one, Esc ends.');
    drawOverlay();
  }
  function symbolMenu(id) {
    var s = Drawing.findSymbol(doc(), id);
    return [
      { label: 'Properties…', action: function () { cmdSymbol(s.type, id); } },
      { label: s.leader ? 'Remove Leader' : 'Add Leader', action: function () { edit(function (dc) { Drawing.editSymbol(dc, id, { leader: s.leader ? null : [s.p[0] - 12 * paperK(), s.p[1] - 8 * paperK()] }); }); } },
      { label: 'Delete', key: 'Del', action: function () { edit(function (dc) { Drawing.deleteSymbol(dc, id); }); D.sel = null; render(); } }
    ];
  }
  // Revision Table: insert (anchored top-right), Add Revision (the next letter, today's date), edit a row
  function insertRevisionTable(anchor) {
    edit(function (dc) { Drawing.insertRevisionTable(dc, { anchor: anchor }); if (dc.layout === 'auto') Drawing.layout(dc, mesh(), units()); });
    D.sel = { kind: 'revtable' };
    UI.setStatus('Revision Table inserted (top-right). Right-click it for Add Revision.');
  }
  function addRevision(spec) {
    var row = null;
    edit(function (dc) { row = Drawing.addRevision(dc, spec || {}); });
    D.sel = { kind: 'revtable' };
    return row;
  }
  // cmdRevision(i): the row's PropertyManager (null: Add Revision with the next letter)
  function cmdRevision(i) {
    var t = doc().revisions, r = i != null && t && t.rows[i];
    var next = Drawing.nextRev(Drawing.latestRev(doc()));
    pmOpen({ title: r ? 'Revision ' + r.rev : 'Add Revision', icon: 'revTable', command: 'revision',
      message: r ? 'Edit the revision row; OK applies it (one undo step).' : 'The new revision is ' + next + ' (I, O, Q, S, X, Z are skipped). The title block REV follows the latest revision.',
      values: r ? { rev: r.rev, zone: r.zone, description: r.description, date: r.date, approved: r.approved } : { rev: next, zone: '', description: '', date: Drawing.todayISO ? Drawing.todayISO() : new Date().toISOString().slice(0, 10), approved: '' },
      groups: [{ title: 'Revision', fields: [{ type: 'text', key: 'rev', label: 'REV' }, { type: 'text', key: 'zone', label: 'ZONE' }, { type: 'text', key: 'description', label: 'DESCRIPTION' }, { type: 'text', key: 'date', label: 'DATE' }, { type: 'text', key: 'approved', label: 'APPROVED' }] }],
      onOK: function (v) {
        if (r) { edit(function (dc) { Drawing.editRevision(dc, i, v); }); UI.setStatus('Revision ' + String(v.rev).toUpperCase() + ' changed.'); }
        else { var row = addRevision(v); UI.setStatus('Revision ' + row.rev + ' added; the title block REV reads ' + row.rev + '.'); }
      } });
  }
  function revTableMenu(i) {
    var items = [{ label: 'Add Revision', action: function () { cmdRevision(null); } }];
    if (i != null && i >= 0) {
      items.push({ label: 'Edit Revision ' + doc().revisions.rows[i].rev + '…', action: function () { cmdRevision(i); } });
      items.push({ label: 'Delete Revision ' + doc().revisions.rows[i].rev, action: function () { edit(function (dc) { Drawing.deleteRevision(dc, i); }); } });
    }
    items.push({ label: 'Delete Table', key: 'Del', action: function () { edit(function (dc) { Drawing.deleteRevisionTable(dc); }); D.sel = null; render(); } });
    return items;
  }
  // File ▸ Properties… of the drawing: the custom properties the sheet format's $PRP links read
  var DRAWING_PROPS = [['CompanyName', 'Company name'], ['DrawnBy', 'Drawn by'], ['DrawnDate', 'Drawn date'], ['CheckedBy', 'Checked by'], ['CheckedDate', 'Checked date'], ['GeneralTolerances', 'General tolerances (\\n between lines)']];
  function setDrawingProps(map) {
    edit(function (dc) {
      var own = dc.properties || {};
      Object.keys(map || {}).forEach(function (k) { var v = map[k]; if (v == null || String(v).trim() === '') delete own[k]; else own[k] = String(v).replace(/\\n/g, '\n'); });
      if (Object.keys(own).length) dc.properties = own; else delete dc.properties;
    });
  }
  function cmdDrawingProps() {
    var own = doc().properties || {}, values = {};
    DRAWING_PROPS.forEach(function (p) { values[p[0]] = own[p[0]] != null ? String(own[p[0]]).replace(/\n/g, '\\n') : ''; });
    pmOpen({ title: 'Drawing Properties', icon: 'sheetFormat', command: 'drawingProps',
      message: 'Custom properties of the drawing: the title block reads them through $PRP:"name" (an empty general tolerances box gives the ' + (units() === 'in' ? 'inch' : 'mm') + ' defaults).',
      values: values, groups: [{ title: 'Custom', fields: DRAWING_PROPS.map(function (p) { return { type: 'text', key: p[0], label: p[1] }; }) }],
      onOK: function (v) { setDrawingProps(v); UI.setStatus('Drawing properties applied.'); } });
  }
  // Delete for the new kinds, then the rest
  var baseDeleteSelection = deleteSelection;
  deleteSelection = function () {
    var s = D.sel;
    if (s && s.kind === 'symbol') { edit(function (dc) { Drawing.deleteSymbol(dc, s.id); }); D.sel = null; render(); return true; }
    if (s && s.kind === 'revtable') { edit(function (dc) { Drawing.deleteRevisionTable(dc); }); D.sel = null; render(); return true; }
    return baseDeleteSelection.apply(this, arguments);
  };
  DW.cmdSymbol = cmdSymbol; DW.symbolClick = symbolClick; DW.symbolMenu = symbolMenu; DW.cmdRevision = cmdRevision; DW.revTableMenu = revTableMenu;
  DW.insertRevisionTable = insertRevisionTable; DW.cmdDrawingProps = cmdDrawingProps;


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
        menu: function () { return [{ label: 'Properties…', action: function () { DW.cmdNoteProps(n.id); } }, { label: 'Delete', action: function () { edit(function (dc2) { Drawing.deleteNote(dc2, n.id); }); } }]; } }));   // (rfCU: Properties)
    });
    (dc.symbols || []).forEach(function (sy) {
      var nm = ({ surfaceFinish: 'Surface Finish', datum: 'Datum Feature', gtol: 'Geometric Tolerance', weld: 'Weld Symbol', revision: 'Revision Symbol', revCloud: 'Revision Cloud', datumTarget: 'Datum Target', leader: 'Multi-jog Leader' }[sy.type] || 'Symbol') + sy.id;
      t.appendChild(row({ icon: ({ gtol: 'gtol', datum: 'datumFeature', weld: 'weldSymbol', revision: 'revisionSymbol', revCloud: 'revisionCloud', datumTarget: 'datumTarget', leader: 'multiJogLeader' })[sy.type] || 'surfaceFinish', name: nm, depth: 2, cls: 'dw-symbol', data: { symbol: String(sy.id) }, sel: D.sel && D.sel.kind === 'symbol' && D.sel.id === sy.id,
        badge: sy.type === 'datumTarget' ? sy.datum + sy.num : sy.type === 'datum' ? sy.label : sy.type === 'gtol' ? (sy.dia ? 'Ø' : '') + sy.tol : sy.type === 'revision' ? sy.rev || '' : sy.type === 'surfaceFinish' ? sy.ra || '' : '', title: Drawing.symbolText(sy) + '\n(double-click for properties)',
        click: function () { D.sel = { kind: 'symbol', id: sy.id }; drawOverlay(); renderTree(); }, dbl: function () { cmdSymbol(sy.type, sy.id); }, menu: function () { return symbolMenu(sy.id); } }));
    });
    // (rfQ) the other sheets: one row each, in sheet order around the active one (whose views are listed under it);
    // double-click or Activate brings one up
    var allSheets = Drawing.sheets(dc), act = dc.activeSheet | 0;
    function otherSheet(s) {
      t.appendChild(row({ icon: 'sheet', name: s.name, depth: 1, twisty: true, cls: 'dw-sheet-off', data: { sheetIndex: String(s.index) }, badge: s.format + '  ' + s.scale, title: s.name + ': ' + s.views + ' view' + (s.views === 1 ? '' : 's') + '. Double-click to activate.',
        dbl: function () { DW.activateSheet(s.index); }, menu: function () { return DW.sheetTabMenu(s.index); } }));
    }
    allSheets.slice(0, act).forEach(otherSheet);
    t.appendChild(row({ icon: 'sheet', name: dc.sheet.name, depth: 1, twisty: true, cls: 'dw-sheet', data: { sheet: '1' }, sel: D.sel && D.sel.kind === 'sheet', badge: dc.sheet.format + '  ' + Drawing.scaleText(dc.sheet.scale), title: 'Double-click for Sheet Properties', click: function () { D.sel = { kind: 'sheet' }; drawOverlay(); renderTree(); }, dbl: cmdSheetProperties, menu: sheetMenu }));
    t.appendChild(row({ icon: 'sheetFormat', name: (dc.format && dc.format.name) || 'Sheet Format1', depth: 2, cls: 'dw-sheetformat', badge: D.formatEdit ? 'editing' : dc.template || (dc.format ? 'edited' : ''), title: 'Border and title block (File ▸ Properties… sets DRAWN / CHECKED / COMPANY / tolerances). Right-click for Edit Sheet Format.', dbl: cmdDrawingProps, menu: function () { return DW.fmtTreeMenu(); } }));
    // (rfAE) the General Tables of the sheet
    (dc.tables || []).forEach(function (gt) {
      t.appendChild(row({ icon: 'generalTable', name: 'General Table' + gt.id, depth: 2, cls: 'dw-gtable', data: { gtable: String(gt.id) }, badge: gt.cols + ' × ' + gt.rows, sel: D.sel && D.sel.kind === 'gtable' && D.sel.id === gt.id,
        click: function () { D.sel = { kind: 'gtable', id: gt.id }; drawOverlay(); renderTree(); }, menu: function () { return DW.tableTreeMenu(gt.id); } }));
    });
    if (dc.revisions && dc.revisions.show !== false) {
      var nrv = dc.revisions.rows.length;
      t.appendChild(row({ icon: 'revTable', name: 'Revision Table1', depth: 2, cls: 'dw-revtable', sel: D.sel && D.sel.kind === 'revtable', badge: nrv ? 'REV ' + Drawing.latestRev(dc) : 'no revisions',
        title: 'Revision Table (' + nrv + ' revision' + (nrv === 1 ? '' : 's') + '). Right-click for Add Revision.',
        click: function () { D.sel = { kind: 'revtable' }; drawOverlay(); renderTree(); }, dbl: function () { cmdRevision(null); }, menu: function () { return revTableMenu(null); } }));
    }
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
      t.appendChild(row({ icon: v.kind === 'section' ? (v.section && v.section.removed ? 'removedSection' : 'sectionView') : v.kind === 'detail' ? 'detailView' : v.kind === 'projected' ? 'projView' : v.kind === 'flat' ? 'flatView' : 'drawingView', name: v.name, depth: 2, twisty: true, cls: 'dw-view' + (v.kind ? ' dw-' + v.kind : ''), data: { view: String(v.id) }, sel: sel, badge: badge,
        title: v.name + ' \u2014 ' + v.orient + (v.scale ? ', scale ' + Drawing.scaleText(v.scale) : '') + (st ? ' \u2014 ' + st.visibleLines + ' visible / ' + st.hiddenLines + ' hidden lines, ' + st.visibleCircles + ' circles' : '') + '. Double-click for properties.',
        click: function () { D.sel = { kind: 'view', id: v.id }; drawOverlay(); renderTree(); },
        dbl: function () { cmdViewProperties(v.id); }, menu: function () { return viewMenu(v); } }));
      t.appendChild(row({ icon: isAsm() ? 'assembly' : 'part', name: App.model.name, depth: 3, cls: 'dw-ref' }));
      var an = w && D.sheet.annotations ? D.sheet.annotations.filter(function (a) { return a.view === v.id; }) : [];
      [['centerMark', 'Center Marks'], ['centerline', 'Centerlines'], ['holeCallout', 'Hole Callouts'], ['cosmeticThread', 'Cosmetic Threads'], ['dowelPin', 'Dowel Pin Symbols']].forEach(function (tp) {   // (rfCU: the last two)
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
    allSheets.slice(act + 1).forEach(otherSheet);
  }

  // ------------------------------------------------------------------ ribbon, menus, keys
  UI.RIBBON['View Layout'] = [
    { id: 'std3view', label: 'Standard\n3 View', run: cmdStandard3View },
    { id: 'modelView', label: 'Model\nView', run: cmdModelView, active: function () { return D.tool === 'place'; } },
    { id: 'projView', label: 'Projected\nView', run: cmdProjectedView, active: function () { return D.tool === 'project'; } },
    { id: 'sectionView', label: 'Section\nView', run: cmdSectionView, active: function () { return D.tool === 'section'; } },
    { id: 'detailView', label: 'Detail\nView', run: cmdDetailView, active: function () { return D.tool === 'detail'; } }
  ];
  // (rfW, SolidWorks 2024) View Layout holds the drawing views only (Auxiliary View, Break and Crop View are added by
  // drawing-ui-tools.js in SolidWorks' order). Smart Dimension, Model Items, Auto Balloon and the Tables (Bill of
  // Materials, Revision Table) are on Annotation; Save as SVG / DXF / DWG / PDF and Close Drawing in the File menu;
  // Sheet Properties in Tools and the sheet's right-click menu.
  // Annotation tab (SolidWorks: Smart Dimension with its Ordinate / Baseline / Chamfer flyout, Model Items, Balloon,
  // Auto Balloon, Stacked Balloon, Hole Callout, Center Mark, Centerline)
  // (lane CT) the dimension tools of the Smart Dimension flyout and Tools ▸ Dimensions, in SolidWorks 2024's order
  function ordFixed(f) { return function () { return D.tool === 'ordinate' && !!D.pending && D.pending.fixed === f; }; }
  var CT_DIMS = [
    { id: 'dim', label: 'Smart\nDimension', run: cmdSmartDimension, active: function () { return D.tool === 'dim' && !D.dimLock; } },
    { id: 'horizDim', label: 'Horizontal\nDimension', run: function () { DW.cmdLockedDimension('h'); }, active: function () { return D.tool === 'dim' && D.dimLock === 'h'; } },
    { id: 'vertDim', label: 'Vertical\nDimension', run: function () { DW.cmdLockedDimension('v'); }, active: function () { return D.tool === 'dim' && D.dimLock === 'v'; } },
    { id: 'baselineDim', label: 'Baseline\nDimension', run: function () { cmdChainDim('baseline'); }, active: function () { return D.tool === 'baseline'; } },
    { id: 'ordinateDim', label: 'Ordinate\nDimension', run: function () { cmdChainDim('ordinate'); }, active: function () { return D.tool === 'ordinate' && !(D.pending && D.pending.fixed); } },
    { id: 'ordinateH', label: 'Horizontal Ordinate\nDimension', run: function () { cmdChainDim('ordinate', 'h'); }, active: ordFixed('h') },
    { id: 'ordinateV', label: 'Vertical Ordinate\nDimension', run: function () { cmdChainDim('ordinate', 'v'); }, active: ordFixed('v') },
    { id: 'angRunDim', label: 'Angular Running\nDimension', run: function () { DW.cmdAngularRunning(); }, active: function () { return D.tool === 'angrun'; } },
    { id: 'chamferDim', label: 'Chamfer\nDimension', run: cmdChamferDim, active: function () { return D.tool === 'chamferdim'; } },
    { id: 'pathLengthDim', label: 'Path Length\nDimension', run: function () { DW.cmdPathLength(); }, active: function () { return D.tool === 'pathlen'; } }
  ];
  UI.RIBBON.Annotation = [
    // (lane CT) the Smart Dimension flyout, SolidWorks 2024's drawing order (CT_DIMS)
    { fly: 'dwDim', items: CT_DIMS.map(function (x) { return { id: x.id, label: x.label, run: x.run, active: x.active }; }) },
    { stack: [
      { id: 'ordinateDim', label: 'Ordinate Dimension', run: function () { cmdChainDim('ordinate'); }, active: function () { return D.tool === 'ordinate' && !(D.pending && D.pending.fixed); } },
      { id: 'baselineDim', label: 'Baseline Dimension', run: function () { cmdChainDim('baseline'); }, active: function () { return D.tool === 'baseline'; } },
      { id: 'chamferDim', label: 'Chamfer Dimension', run: cmdChamferDim, active: function () { return D.tool === 'chamferdim'; } }
    ] },
    { id: 'modelItems', label: 'Model\nItems', run: cmdModelItemsPM, active: function () { return !!(doc() && doc().autoDims); } },
    { sep: true },
    { id: 'balloon', label: 'Balloon', run: function () { cmdBalloon(false); }, active: function () { return D.tool === 'balloon'; } },
    { id: 'autoBalloon', label: 'Auto\nBalloon', run: function () { cmdAutoBalloon(); } },
    { id: 'stackBalloon', label: 'Stacked\nBalloon', run: function () { cmdBalloon(true); }, active: function () { return D.tool === 'stackballoon'; } },
    { id: 'holeCallout', label: 'Hole\nCallout', run: cmdHoleCallout, active: function () { return D.tool === 'holecallout'; } },
    { id: 'note', label: 'Note', run: function () { DW.cmdNote(); }, active: function () { return D.tool === 'note'; } },
    { stack: [
      { id: 'surfaceFinish', label: 'Surface Finish', run: function () { cmdSymbol('surfaceFinish'); }, active: function () { return D.tool === 'symbol' && D.pending && D.pending.type === 'surfaceFinish'; } },
      { id: 'datumFeature', label: 'Datum Feature', run: function () { cmdSymbol('datum'); }, active: function () { return D.tool === 'symbol' && D.pending && D.pending.type === 'datum'; } },
      { id: 'gtol', label: 'Geometric Tolerance', run: function () { cmdSymbol('gtol'); }, active: function () { return D.tool === 'symbol' && D.pending && D.pending.type === 'gtol'; } }
    ] },
    { id: 'bom', label: 'Bill of\nMaterials', run: function () { cmdBOM(); }, active: function () { return !!(doc() && doc().bom && doc().bom.show !== false); } },
    { id: 'revTable', label: 'Revision\nTable', run: function () { if (doc().revisions) cmdRevision(null); else insertRevisionTable(); }, active: function () { return !!(doc() && doc().revisions); } },
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
  // (lane DW2) a menu hook set before this one (a part-side module) runs first: DW.menuHookBase (the hook itself, not
  // drawing-ui-tools.js' onAssign wrapper round it, which wraps this one again)
  var hook0 = UI.menuHook;
  DW.menuHookBase = hook0 && hook0._inner ? hook0._inner : hook0 || null;
  UI.menuHook = function (menus) {
    if (typeof DW.menuHookBase === 'function') menus = DW.menuHookBase(menus) || menus;
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
        { label: 'Properties\u2026', action: cmdDrawingProps },
        { sep: true },
        { label: 'Save Drawing as SVG\u2026', action: function () { exportAs('svg'); } },
        { label: 'Save Drawing as DXF\u2026', action: function () { exportAs('dxf'); } },
        { label: 'Save Drawing as PDF\u2026', action: function () { exportAs('pdf'); } },
        { sep: true },
        { label: 'Close Drawing', action: requestClose }
      ]) },
      { label: 'Edit', items: (editMenu ? editMenu.items.slice(0, 2) : []).concat([{ label: 'Delete', key: 'Del', disabled: !D.sel || D.sel.kind === 'sheet', action: deleteSelection }]) },
      { label: 'View', items: [{ label: 'Zoom to Fit', key: 'F', action: fitSheet }] },
      { label: 'Insert', items: [
        { label: 'Sheet\u2026', action: function () { DW.addSheet(); } },
        { label: 'Drawing View \u25b8 Standard 3 View', action: cmdStandard3View },
        { label: 'Drawing View \u25b8 Model\u2026', action: cmdModelView },
        { label: 'Drawing View \u25b8 Projected', action: cmdProjectedView },
        { label: 'Drawing View \u25b8 Section\u2026', action: cmdSectionView },
        { label: 'Drawing View \u25b8 Detail', action: cmdDetailView },
        { label: 'Drawing View \u25b8 Flat Pattern\u2026', disabled: !DW.sheetMetal(), action: function () { DW.cmdFlatView(); } },
        { label: 'Annotations \u25b8 Note', action: function () { DW.cmdNote(); } },
        { label: 'Annotations \u25b8 Surface Finish Symbol\u2026', action: function () { cmdSymbol('surfaceFinish'); } },
        { label: 'Annotations \u25b8 Datum Feature\u2026', action: function () { cmdSymbol('datum'); } },
        { label: 'Annotations \u25b8 Geometric Tolerance\u2026', action: function () { cmdSymbol('gtol'); } },
        { label: 'Annotations \u25b8 Smart Dimension', key: 'D', action: cmdSmartDimension },
        { label: 'Annotations \u25b8 Model Items\u2026', checked: !!(dc && dc.autoDims), action: cmdModelItemsPM },
        { label: 'Annotations \u25b8 Auto Balloon', disabled: !isAsm(), action: cmdAutoBalloon },
        { label: 'Annotations \u25b8 Balloon', action: function () { cmdBalloon(false); } },
        { label: 'Annotations \u25b8 Stacked Balloon', action: function () { cmdBalloon(true); } },
        { label: 'Annotations \u25b8 Hole Callout', action: cmdHoleCallout },
        { label: 'Annotations \u25b8 Center Mark', action: cmdCenterMark },
        { label: 'Annotations \u25b8 Centerline', action: cmdCenterline },
        { label: 'Dimensions \u25b8 Ordinate', action: function () { cmdChainDim('ordinate'); } },
        { label: 'Dimensions \u25b8 Baseline', action: function () { cmdChainDim('baseline'); } },
        { label: 'Dimensions \u25b8 Chamfer', action: cmdChamferDim },
        { label: 'Tables \u25b8 Bill of Materials\u2026', action: cmdBOM },
        { label: 'Tables \u25b8 Revision Table', disabled: !!(dc && dc.revisions), action: function () { insertRevisionTable(); } },
        { label: 'Tables \u25b8 Add Revision\u2026', action: function () { cmdRevision(null); } }
      ] },
      { label: 'Tools', items: [{ label: 'Sheet Properties\u2026', action: cmdSheetProperties }, { label: 'Options \u25b8 Document Properties\u2026', action: cmdDocProps }, { sep: true }].concat(CT_DIMS.map(function (x) {
        return { label: 'Dimensions \u25b8 ' + x.label.replace(/\n/g, ' '), checked: !!x.active(), action: x.run };   // (lane CT)
      })) },
      { label: 'Window', items: [
        { label: App.model.name + ' (' + docKind() + ')', action: requestClose },
        { label: (dc ? dc.name + ' - ' + dc.sheet.name : 'Drawing'), checked: true, action: function () { } }
      ] },
      help || { label: 'Help', items: [] }
    ];
  };
  // lane CA (user, 2026-10-13): Ctrl+Z / Ctrl+Y, Edit ▸ Undo / Redo and the Undo / Redo buttons with a drawing
  // PropertyManager open cancel it first (its ✗: what it applied live goes back, "Dimension cancelled."), as on the
  // part side (ui-app.js undoCommand); the next Ctrl+Z undoes. Smart Dimension's PM ends the tool, as Esc does. In the
  // PM's value box Ctrl+Z takes back what was typed there first; another text box (a note being typed on the sheet, a
  // tab being renamed, a PM's text area) keeps its own Ctrl+Z. A modal dialog keeps the keys.
  function undoCancelsDrawingPM(target) {
    if (!D.active || !(UI.hasPM && UI.hasPM()) || !$('modal').hidden) return false;
    if (target && target !== document.body && target.tagName) {
      var tag = target.tagName.toLowerCase(), root = $('pm');
      if (tag === 'textarea' || target.isContentEditable) return false;
      if (tag === 'select' || (tag === 'input' && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test(target.type || ''))) {
        if (!root || !root.contains(target)) return false;
        if (UI.pmPending && UI.pmPending(target)) return false;
      }
    }
    return true;
  }
  function cancelDrawingPM() {
    var title = UI.pmTitle ? UI.pmTitle() : '', dimTool = D.tool === 'dim' && D.sdPM;
    UI.pmCancel();
    if (dimTool && D.tool === 'dim') { D.tool = null; D.pending = null; D.hover = null; UI.refreshRibbon(); }
    if (title) UI.setStatus(title + ' cancelled.');
    if (D.active) { drawOverlay(); renderTree(); }
    return UI.whenIdle();
  }
  ['undoCommand', 'redoCommand'].forEach(function (name) {
    var base = UI[name];
    if (typeof base !== 'function') return;
    UI[name] = function () { return undoCancelsDrawingPM(document.activeElement) ? cancelDrawingPM() : base.apply(this, arguments); };
  });
  var baseUndoCancels = UI.undoCancelsPM;
  UI.undoCancelsPM = function (target) { return undoCancelsDrawingPM(target === undefined ? document.activeElement : target) || !!(baseUndoCancels && baseUndoCancels.apply(this, arguments)); };
  window.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || !/^[zZyY]$/.test(e.key) || !undoCancelsDrawingPM(e.target)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    cancelDrawingPM();
  }, true);
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
    // the Dimension PM a single click opened shows the dimension as it was: a model change closes it (unapplied)
    if (D.active && DW.clickPM && DW.clickPM() && !D.inRefreshClose) { D.inRefreshClose = true; try { DW.closeClickPM(false); } finally { D.inRefreshClose = false; } }
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
      name: dc.name, open: D.active, sheet: { name: dc.sheet.name, format: dc.sheet.format, size: D.sheet.size, scale: Drawing.scaleText(dc.sheet.scale), autoScale: !!dc.sheet.autoScale, projection: dc.sheet.projection, index: dc.activeSheet | 0, count: Drawing.sheetCount(dc) }, sheets: Drawing.sheets(dc),
      views: D.sheet.views.map(function (w) {
        var b = w.proj.bounds;
        return { id: w.view.id, name: w.view.name, orient: w.view.orient, role: w.view.role, kind: w.view.kind || 'model', label: w.view.label || null, parent: w.view.parent, showLabel: Drawing.viewLabelShown(w.view),
          display: w.view.display, tangent: w.view.tangent || 'removed', x: +w.view.x.toFixed(3), y: +w.view.y.toFixed(3), scale: w.view.scale ? Drawing.scaleText(w.view.scale) : null,
          extents: [+(b.umax - b.umin).toFixed(4), +(b.vmax - b.vmin).toFixed(4)], box: [w.box.x0, w.box.y0, w.box.x1, w.box.y1].map(function (x) { return +x.toFixed(3); }), stats: w.proj.stats, dims: (w.view.dims || []).length,
          hatch: w.hatch, sectionArea: w.section ? +w.section.area.toFixed(6) : null,
          hatches: (w.hatches || []).map(function (h) { return { body: h.body, component: isAsm() && App.model.components[h.body] ? App.model.components[h.body].name : null, part: h.part != null ? (pnames || (pnames = partNames()))[h.part] || null : null, angle: h.angle, spacing: +h.spacing.toFixed(4), lines: h.lines, pattern: h.pattern }; }),
          balloons: (D.sheet.balloons || []).filter(function (b) { return b.view === w.view.id; }).map(function (b) { return b.item; }),
          flat: w.view.kind === 'flat' ? flatSummary(w) : undefined };
      }),
      revisions: D.sheet.revisions ? { rows: D.sheet.revisions.rows, latest: D.sheet.revisions.latest, anchor: D.sheet.revisions.anchor, box: ['x0', 'y0', 'x1', 'y1'].map(function (q) { return +D.sheet.revisions.box[q].toFixed(3); }) } : null,
      symbols: (D.sheet.symbols || []).map(function (y) { var s0 = Drawing.findSymbol(dc, y.id) || {}; return { id: y.id, type: y.type, text: y.text, p: s0.p, leader: s0.leader || null, view: y.view || null, box: [y.box.x0, y.box.y0, y.box.x1, y.box.y1].map(function (x) { return +x.toFixed(3); }) }; }),
      notes: (D.sheet.notes || []).map(function (n) { return { id: n.id, text: n.text, raw: n.raw, leader: n.leader, view: n.view || null, p: [+n.p[0].toFixed(3), +n.p[1].toFixed(3)], box: [n.box.x0, n.box.y0, n.box.x1, n.box.y1].map(function (x) { return +x.toFixed(3); }) }; }),
      bom: D.sheet.bom ? { anchor: dc.bom.x != null ? 'moved' : dc.bom.anchor, box: ['x0', 'y0', 'x1', 'y1'].map(function (q) { return +D.sheet.bom.box[q].toFixed(3); }),
        type: D.sheet.bom.type, columns: D.sheet.bom.columns.map(function (c) { return c.title; }), cells: D.sheet.bom.cells.map(function (r) { return r.map(function (x) { return String(x); }); }),
        rows: D.sheet.bom.rows.map(function (r, i) { var o = { item: r.item, partNumber: r.partNumber, description: r.description, qty: r.qty, components: r.components.map(function (id) { var c = Assembly.findComponent(App.model, id); return c ? c.name : id; }) }; D.sheet.bom.columns.forEach(function (c, j) { if (c.type === 'property') o[c.prop] = String(D.sheet.bom.cells[i][j]); }); return o; }) } : null,
      titleBlock: Drawing.titleBlock(dc, App.model, cctx()),
      balloons: (D.sheet.balloons || []).map(function (b) { return { view: b.view, index: b.index, item: b.item, component: isAsm() ? (Assembly.findComponent(App.model, b.component) || {}).name || null : null, c: [+b.c[0].toFixed(3), +b.c[1].toFixed(3)], attach: [+b.attach[0].toFixed(3), +b.attach[1].toFixed(3)], stack: (b.stack || []).map(function (x) { return x.item; }), qty: b.qty ? b.qtyText : null, manual: !!b.manual }; }),
      dims: D.sheet.dims.map(function (d) { return d.text; }), dangling: D.sheet.dims.filter(function (d) { return d.dangling; }).length, autoDims: !!dc.autoDims,
      dimDetails: D.sheet.dims.map(function (d) { return { view: d.view, kind: d.kind, text: d.text, value: d.value != null ? +(+d.value).toFixed(6) : null, values: d.values ? d.values.map(function (x) { return +x.toFixed(6); }) : undefined, auto: !!d.auto, style: d.style || null, index: d.index != null ? d.index : null, tol: d.tol || null, prec: d.prec != null ? d.prec : null, flip: !!d.flip, dangling: !!d.dangling, box: d.box ? [d.box.x0, d.box.y0, d.box.x1, d.box.y1].map(function (x) { return +x.toFixed(3); }) : null }; }),
      annotations: (D.sheet.annotations || []).map(function (a) { return { id: a.id, view: a.view, type: a.type, style: a.style, text: a.text, auto: a.auto, dangling: a.dangling, box: [a.box.x0, a.box.y0, a.box.x1, a.box.y1].map(function (x) { return +x.toFixed(3); }), centers: a.info && a.info.centers ? a.info.centers.map(function (c) { return [+c[0].toFixed(3), +c[1].toFixed(3)]; }) : undefined }; }),
      options: Drawing.docOptions(dc),
      // (rfAE) the sheet format (edited: it differs from the built-in one; items: what Edit Sheet Format picks) and
      // the General Tables (cells: the text shown, links worked out)
      format: { name: dc.format && dc.format.name || 'Sheet Format1', edited: !!dc.format, editing: !!D.formatEdit, template: dc.template || null,
        items: (D.sheet.format || []).map(function (it) { var r3 = function (x) { return +x.toFixed(3); }; return it.box ? { id: it.id, kind: it.kind, added: !!it.added, text: it.text, box: [it.box.x0, it.box.y0, it.box.x1, it.box.y1].map(r3) } : { id: it.id, kind: it.kind, added: !!it.added, a: it.a.map(r3), b: it.b.map(r3) }; }) },
      tables: (D.sheet.tables || []).map(function (t) { var own = Drawing.findTable(dc, t.id) || {}; return { id: t.id, rows: t.rows, cols: t.cols, anchor: t.anchor, cells: t.cells, raw: JSON.parse(JSON.stringify(own.cells || [])), box: [t.box.x0, t.box.y0, t.box.x1, t.box.y1].map(function (x) { return +x.toFixed(3); }) }; })
    };
  }
  // a flat-pattern view in the summary: its bends (sheet points, direction, angle, radius, note text), the blank's size
  // and what the bend notes / tags read
  function flatSummary(w) {
    var fd = w.content && w.content.flat;
    if (!fd || fd.error) return { error: fd ? fd.error : 'no flat pattern' };
    var r3 = function (x) { return +x.toFixed(4); };
    return { size: [r3(fd.bbox.umax - fd.bbox.umin), r3(fd.bbox.vmax - fd.bbox.vmin)], bendNotes: w.view.bendNotes || Drawing.docOptions(doc()).bendNotes,
      bends: fd.bends.map(function (b, i) { return { id: b.id || null, key: (w.view._bendKeys && w.view._bendKeys[i]) || b.key || null, up: b.up, angle: r3(b.angle), R: r3(b.R), ba: b.ba != null ? r3(b.ba) : null, bd: b.bd != null ? r3(b.bd) : null, a: w.toSheet(b.a).map(r3), b: w.toSheet(b.b).map(r3), note: Drawing.bendNoteText(b, units()) }; }),
      circles: fd.circles.length, arcs: fd.arcs.length, lines: fd.lines.length,
      // the etch marks: how many the flat has, whether the view shows them, how many sheet primitives they drew
      etch: (fd.etch || []).length, showEtch: w.view.showEtch !== false, etchPrims: D.sheet.prims.filter(function (p) { return p.etch && p.view === w.view.id; }).length,
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
  // (rfDN) cutApi(fn): viewApi for a view whose linework is a CSG cut (Section View, Removed Section; rfDR: and every
  // view the API adds: Projected, Detail, Auxiliary, whose hidden-line removal goes the same way). As the mouse
  // tools do (editView), the cut and its hidden-line removal go to drawing-worker.js and Auto insert (centre marks,
  // centrelines) waits until the view has landed, so the call returns at once without cutting on the main thread.
  // What it returns is laterSummary(): reading any property of it right away (sm.views …) finishes the drawing
  // here and now (settle) and reads the summary, as before; awaiting it (or UI.drawing.ready()) waits for the worker
  // instead and resolves to the summary. A closed drawing (or no Proxy) takes the synchronous viewApi path.
  function cutApi(fn) {
    if (!doc()) return null;
    if (!D.active || typeof Proxy === 'undefined') return viewApi(fn);
    try { fn(JSON.parse(JSON.stringify(doc()))); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
    var off = false, v = DW.editView(function (dc) { var nv = fn(dc); if (nv.offSheet) { off = true; delete nv.offSheet; } return nv; });
    if (off) { var msg = v.name + ': no room on the sheet, placed beside it. Move it, or use a larger sheet or a smaller scale.'; UI.toast(msg); UI.setStatus(msg); }
    D.sel = { kind: 'view', id: v.id };
    return laterSummary();
  }
  function laterSummary() {
    var t = {}, filled = false;
    function fill() { if (!filled) { filled = true; Object.assign(t, summary() || {}); } return t; }
    function then(res, rej) { return ready().then(function () { return filled ? t : summary(); }).then(res, rej); }
    return new Proxy(t, {
      get: function (o, k) { if (k === 'then') return filled ? undefined : then; return fill()[k]; },
      has: function (o, k) { return k in fill(); },
      ownKeys: function () { return Reflect.ownKeys(fill()); },
      getOwnPropertyDescriptor: function (o, k) { return Object.getOwnPropertyDescriptor(fill(), k); }
    });
  }
  // (rfDR) the summary after a call that left views to be worked out in the worker (a closed drawing / no Proxy: now)
  function later() { return D.active && typeof Proxy !== 'undefined' ? laterSummary() : summary(); }
  DW.cutApi = cutApi; DW.laterSummary = later;
  function annotApi(fn) {
    if (!doc()) return null;
    try { fn(JSON.parse(JSON.stringify(doc()))); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
    edit(function (dc) { fn(dc); });
    return summary();
  }
  function current() { if (!doc()) return null; settle(); if (D.active && D.renderQueued) render(); if (!D.active) { syncBom(); if (doc().layout === 'auto') Drawing.layout(doc(), mesh(), units()); D.sheet = Drawing.compute(doc(), mesh(), App.model, cctx()); } return D.sheet; }
  if (window.anvil) {
    window.anvil.drawing = {
      // (rfDR) make / open / standard3View / addView return laterSummary(): the views are worked out in the worker
      // (await the result, or read a property of it at once to finish them here)
      make: function (opts) { return makeDrawing(opts) ? later() : null; },
      open: function (i) { return makeDrawing({ index: i || 0 }) ? later() : null; },
      close: function () { closeDrawing(); },
      isOpen: function () { return D.active; },
      // isDirty(): the open drawing has changes since it was opened, made or saved (Close Drawing would ask)
      isDirty: function () { return DW.drawingDirty(); },
      summary: summary,
      standard3View: function () { cmdStandard3View(); return later(); },
      // Projected / Section / Detail View without the mouse; each is one undo step and returns the summary
      projectedView: function (parentId, dir, opts) { return cutApi(function (dc) { return Drawing.addProjectedView(dc, mesh(), parentId, dir, Object.assign({ fit: true }, opts || {})); }); },
      sectionView: function (parentId, opts) { return cutApi(function (dc) { return Drawing.addSectionView(dc, mesh(), parentId, Object.assign({ fit: true }, opts || {})); }); },
      // (rfCQ) detailView(parentId, { sketch: [entity ids] }): the closed sketch profile those entities make in a view
      // is the detail's boundary (its entities go); parentId may be null (the profile's view)
      detailView: function (parentId, opts) {
        opts = Object.assign({}, opts || {});
        var loopIds = null;
        if (opts.sketch) {
          var L, sh = current();
          try { L = Drawing.sketchLoop(doc(), opts.sketch); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
          var lw = sh && sh.views.filter(function (x) { return x.view.id === L.view; })[0];
          if (!lw) { var m0 = 'Detail View: sketch the profile in a view'; UI.toast(m0); UI.setStatus(m0); return null; }
          if (parentId == null) parentId = L.view;
          if (L.circle) { opts.c = lw.fromSheet(L.circle.c); opts.r = L.circle.r / lw.scale; } else opts.pts = L.pts.map(lw.fromSheet);
          loopIds = L.ids; delete opts.sketch;
        }
        return cutApi(function (dc) { if (loopIds) loopIds.forEach(function (id) { Drawing.deleteSketchEntity(dc, id); }); return Drawing.addDetailView(dc, mesh(), parentId, Object.assign({ c: [0, 0], fit: true }, opts)); });
      },
      // (rfCQ) viewLabel(id, on | null): a view's Display label (null: its kind's default); one undo step, the summary
      viewLabel: function (id, on) { return annotApi(function (dc) { return Drawing.setViewLabel(dc, id, on); }); },
      deleteView: function (id) { deleteView(id); return summary(); },
      tangent: function (id, mode) { setViewTangent(id, mode); return later(); },   // (rfDR: the new edges come from the worker)
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
      addView: function (orient, opts) { opts = opts || {}; startPlacing({ orient: orient, display: opts.display, scale: opts.scale ? Drawing.parseScale(opts.scale) : null, dimType: opts.dimType === 'true' || opts.dimType === 'projected' ? opts.dimType : null }); placePending([opts.x != null ? opts.x : 60 * paperK(), opts.y != null ? opts.y : 100 * paperK()]); return later(); },
      setSheet: function (props) { setSheet(props || {}); return summary(); },
      // modelItems(on): the model items on / off (the drawing's default set); modelItems({ source, feature, views,
      // marked, holeLocations, holeCallouts, annotations, dedupe }): as the Model Items PM's OK (rfT)
      modelItems: function (on) {
        if (on && typeof on === 'object') applyModelItems(on);
        else if (!!doc().autoDims !== !!on) cmdModelItems();
        return summary();
      },
      modelItemsPM: function () { cmdModelItemsPM(); return true; },
      // svg(i): one sheet (default: the active one, rfQ)
      svg: function (i) { if (!doc()) return null; return Drawing.toSVG(sheetOf(i == null ? null : Drawing.sheetIndex(doc(), i))); },
      // dxf({ version: 'R12' (default) | 'R2000', sheet: i | name }): one sheet (default: the active one) as DXF, one layer per view
      dxf: function (opts) { if (!doc()) return null; return Drawing.toDXF(sheetOf(opts && opts.sheet != null ? Drawing.sheetIndex(doc(), opts.sheet) : null), opts); },
      // pdf(): every sheet, one page each (rfQ)
      pdf: function () { if (!doc()) return null; settle(); return Drawing.toPDF(Drawing.sheetCount(doc()) > 1 ? everySheet() : current()); },
      // sheets (rfQ): sheets() lists them; addSheet({ name, format, scale, projection }) adds one and activates it,
      // activateSheet(i | name) -> the summary, deleteSheet(i | name), renameSheet(i | name, newName); each edit is one
      // undo step and returns the list of sheets (null when refused)
      sheets: function () { return doc() ? Drawing.sheets(doc()) : null; },
      addSheet: function (opts) { if (!doc()) return null; return DW.addSheet(opts) < 0 ? null : Drawing.sheets(doc()); },
      activateSheet: function (i) { if (!doc() || !DW.activateSheet(i)) return null; return summary(); },
      deleteSheet: function (i) { if (!doc() || !DW.deleteSheet(i, true)) return null; return Drawing.sheets(doc()); },
      renameSheet: function (i, name) { if (!doc() || name == null || !DW.renameSheet(i, name)) return null; return Drawing.sheets(doc()); },
      doc: function () { return JSON.parse(JSON.stringify(doc())); },
      // annotations: each is one undo step and returns the summary (null and a status message when refused)
      options: function (props) { if (!doc()) return null; if (props) setDocOptions(props); return Drawing.docOptions(doc()); },
      centerMark: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addCenterMark(dc, viewId, spec || {}); }); },
      autoCenterMarks: function (viewId) { return annotApi(function (dc) { var n = 0; dc.views.forEach(function (v) { if (viewId == null || v.id === viewId) n += Drawing.autoCenterMarks(dc, mesh(), v.id); }); return n; }); },
      centerline: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addCenterline(dc, viewId, spec || {}); }); },
      autoCenterlines: function (viewId) { return annotApi(function (dc) { var n = 0; dc.views.forEach(function (v) { if (viewId == null || v.id === viewId) n += Drawing.autoCenterlines(dc, mesh(), v.id); }); return n; }); },
      holeCallout: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addHoleCallout(dc, viewId, spec || {}); }); },
      // (rfDD) a slot callout: spec { c, r } = an end arc of a slot (or an arc slot's side arc) in the view's frame
      slotCallout: function (viewId, spec) { var sh = current(), w = sh && sh.views.filter(function (x) { return x.view.id === viewId; })[0]; return annotApi(function (dc) { return Drawing.addSlotCallout(dc, viewId, w && w.proj, spec || {}); }); },
      deleteAnnotation: function (id) { return annotApi(function (dc) { if (!Drawing.deleteAnnotation(dc, id)) throw new Error('No annotation ' + id); return true; }); },
      ordinate: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addOrdinate(dc, viewId, spec || {}); }); },
      baseline: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addBaseline(dc, viewId, spec || {}); }); },
      chamferDim: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addChamferDim(dc, viewId, spec || {}); }); },
      // (lane CT) horizontalDim / verticalDim(viewId, pick1, pick2 | null, at): smartDim held horizontal / vertical (the
      // same picks, view model units) -> { kind, value, text, index, view }; horizontalOrdinate / verticalOrdinate(viewId,
      // { base, refs, side, at }): ordinate with the direction preset; angularRunning(viewId, { base: { a, b }, refs:
      // [{ a, b } | { c, r }], c?, cw?, rad? }), pathLength(viewId, { refs: [{ a, b } | { c, r, a0, a1 } | { c, r }],
      // lead? }) -> the summary. One undo step each (null: refused, the message shown)
      horizontalDim: function (viewId, p1, p2, at, opts) { return window.anvil.drawing.smartDim(viewId, p1, p2, at, Object.assign({}, opts || {}, { lock: 'h' })); },
      verticalDim: function (viewId, p1, p2, at, opts) { return window.anvil.drawing.smartDim(viewId, p1, p2, at, Object.assign({}, opts || {}, { lock: 'v' })); },
      horizontalOrdinate: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addOrdinate(dc, viewId, Object.assign({}, spec || {}, { dir: 'h' })); }); },
      verticalOrdinate: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addOrdinate(dc, viewId, Object.assign({}, spec || {}, { dir: 'v' })); }); },
      angularRunning: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addAngularRunning(dc, viewId, spec || {}); }); },
      pathLength: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addPathLength(dc, viewId, spec || {}); }); },
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
      // undo step; null and a message on a part that is not sheet metal); flatViewProps(id, { bendNotes, flatSize,
      // bendCols: ['bd', 'ba', 'k'] (the Bend Table's optional columns; null: BEND DED. only), showEtch (false hides
      // the etch marks) });
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
      // (rfM) Revision Table: revisionTable({ anchor }) inserts it, revisionTable(null) removes it, revisionTable() -> the
      // summary's revisions; addRevision({ description, date, approved, zone, rev }) (next letter by default),
      // editRevision(i, props), deleteRevision(i); each one undo step, returning the summary's revisions
      revisionTable: function (opts) {
        if (!doc()) return null;
        if (opts === null) edit(function (dc) { Drawing.deleteRevisionTable(dc); });
        else if (opts !== undefined) insertRevisionTable(opts && opts.anchor);
        return summary().revisions;
      },
      addRevision: function (spec) { if (!doc()) return null; addRevision(spec || {}); return summary().revisions; },
      editRevision: function (i, props) { return annotApi(function (dc) { return Drawing.editRevision(dc, i, props || {}); }) ? summary().revisions : null; },
      deleteRevision: function (i) { return annotApi(function (dc) { if (!Drawing.deleteRevision(dc, i)) throw new Error('No revision row ' + i); return true; }) ? summary().revisions : null; },
      // shop symbols: symbol({ type: 'surfaceFinish' | 'datum' | 'gtol', p, leader, … }) (see Drawing.addSymbol),
      // editSymbol(id, props), deleteSymbol(id), symbols() -> [{ id, type, text, p, leader, box }]
      symbol: function (spec) { return annotApi(function (dc) { return Drawing.addSymbol(dc, spec || {}); }); },
      editSymbol: function (id, props) { return annotApi(function (dc) { return Drawing.editSymbol(dc, id, props || {}); }); },
      deleteSymbol: function (id) { return annotApi(function (dc) { if (!Drawing.deleteSymbol(dc, id)) throw new Error('No symbol ' + id); return true; }); },
      symbols: function () { var s = summary(); return s ? s.symbols : null; },
      // (rfCU) cosmeticThread(viewId, { c, r, size ('#10-32 UNF'; default: the tap drill's thread), end: 'through' | 'blind',
      // depth, callout, lead, text }), dowelPin(viewId, { c, r }) on a hole circle of the view (model units), editAnnotation(id,
      // props), annotations() -> [{ id, view, type, text, dangling, info }]; datumTarget({ p, leader, datum, num, area:
      // 'point' | 'circle' | 'rect', aw, ah, size }), leader({ p, jogs: [[x, y] …], leader (the tip), end: 'arrow' | 'dot' |
      // 'none', note }) are symbols (editSymbol / deleteSymbol); note() / editNote() take border ('circle' | 'triangle' |
      // 'square' | 'hexagon' | 'flag' | 'none') and list ('number' | 'bullet' | 'none')
      cosmeticThread: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addCosmeticThread(dc, viewId, spec || {}); }); },
      dowelPin: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addDowelPin(dc, viewId, spec || {}); }); },
      editAnnotation: function (id, props) { return annotApi(function (dc) { return Drawing.editAnnotation(dc, id, props || {}); }); },
      annotations: function () { var sh = current(); return sh ? (sh.annotations || []).map(function (a) { return { id: a.id, view: a.view, type: a.type, text: a.text, dangling: !!a.dangling, info: a.info ? JSON.parse(JSON.stringify(a.info)) : null, box: a.box ? [a.box.x0, a.box.y0, a.box.x1, a.box.y1] : null }; }) : null; },
      datumTarget: function (spec) { return annotApi(function (dc) { return Drawing.addSymbol(dc, Object.assign({}, spec || {}, { type: 'datumTarget' })); }); },
      leader: function (spec) { return annotApi(function (dc) { return Drawing.addSymbol(dc, Object.assign({}, spec || {}, { type: 'leader' })); }); },
      // the drawing's custom properties ($PRP:"name"): properties() -> them; properties({ name: value | null })
      properties: function (map) { if (!doc()) return null; if (map) setDrawingProps(map); return JSON.parse(JSON.stringify(doc().properties || {})); },
      balloon: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addBalloon(dc, App.model, viewId, spec || {}); }); },
      balloonProps: function (viewId, index, props) { if (!doc()) return null; setBalloonProps(viewId, index, props || {}); return summary(); }
    };
  }
  UI.makeDrawing = makeDrawing; UI.openDrawing = openDrawing; UI.closeDrawing = closeDrawing; UI.drawingActive = function () { return D.active; };
  UI.drawing = { state: D, render: render, ready: ready, settle: settle, note: function () { DW.cmdNote(); }, noteAt: function (p) { return DW.noteAt(p); }, flatView: function () { DW.cmdFlatView(); }, centerMark: cmdCenterMark, centerline: cmdCenterline, holeCallout: cmdHoleCallout, ordinate: function () { cmdChainDim('ordinate'); }, baseline: function () { cmdChainDim('baseline'); },
    chamferDim: cmdChamferDim, balloon: function () { cmdBalloon(false); }, stackedBalloon: function () { cmdBalloon(true); }, docProps: cmdDocProps, dimensionPM: cmdDimensionPM, annotAt: annotAt, dimAt: dimAt, edgeAt: edgeAt, autoBalloon: cmdAutoBalloon, bom: cmdBOM, balloonAt: balloonAt, bomAt: bomAt, fit: fitSheet, standard3View: cmdStandard3View, projectedView: cmdProjectedView, sectionView: cmdSectionView, detailView: cmdDetailView, modelView: cmdModelView, smartDimension: cmdSmartDimension, modelItems: cmdModelItems, sheetProperties: cmdSheetProperties, viewProperties: cmdViewProperties, deleteSelection: deleteSelection, addDimension: addDimension, entityAt: entityAt, exportAs: exportAs, toPaper: toPaper };
  // ------------------------------------------------------------------ rfAE: Edit Sheet Format, drawing templates,
  // General Table, the .drawing document
  // Edit Sheet Format (SolidWorks: right-click the sheet ▸ Edit Sheet Format, or the Sheet Format tab): the views and
  // annotations grey out and only the border and title block take clicks. A click picks a line or a text (a title
  // block field's label and text move together), a drag moves it, Delete removes it (a built-in one is hidden; Reset
  // Sheet Format brings everything back), Line and Note add to the format (a note takes $PRP:"…" links), a double-click
  // edits a note's or a field's text, right-click ▸ Edit Sheet goes back. Every change is one undo step.
  var pxToPaper = DW.pxToPaper;
  function fmtSheetSize() { return D.sheet ? D.sheet.size : Drawing.sheetSize(doc(), units()); }
  function fmtItemAt(p) { return D.sheet ? Drawing.formatItemAt(D.sheet, p, pxToPaper(4)) : null; }
  function setFormatEdit(on) {
    if (!doc()) return false;
    settle();
    DW.closeInlineEdit(false);
    D.tool = null; D.pending = null; D.hover = null; D.sel = null;
    D.formatEdit = !!on;
    if (D.formatEdit) App.ribbonTab = 'Sheet Format';
    UI.refreshRibbon(); UI.renderMenuBar(); drawOverlay(); renderTree();
    if (DW.renderStatus) DW.renderStatus();
    UI.setStatus(D.formatEdit ? 'Edit Sheet Format: drag a border / title block line or text to move it, Delete removes it, Line and Note add to the format; right-click ▸ Edit Sheet goes back to the sheet.' : 'Editing ' + doc().sheet.name + '.');
    return D.formatEdit;
  }
  function fmtTool(tool) {
    if (!doc()) return;
    if (!D.formatEdit) setFormatEdit(true);
    D.tool = tool; D.pending = { a: null, at: null, style: 'thin' }; D.hover = null;
    UI.refreshRibbon(); drawOverlay();
    UI.setStatus(tool === 'fmtline' ? 'Sheet format Line: click its start, then its end (it snaps horizontal / vertical and to line ends). Esc ends.' : 'Sheet format Note: click where the note goes. $PRP:"CompanyName" links a property. Esc ends.');
  }
  // a line end snaps to a format line's end within 6 px, then the line to horizontal / vertical within 3°
  function snapFmt(p, from) {
    var t = pxToPaper(6), best = null, bd = t;
    (D.sheet.format || []).forEach(function (it) { if (it.kind === 'line') [it.a, it.b].forEach(function (q) { var d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } }); });
    if (best) return best.slice();
    if (from) {
      var dx = p[0] - from[0], dy = p[1] - from[1], ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
      if (ang < 3 || ang > 177) return [p[0], from[1]];
      if (Math.abs(ang - 90) < 3) return [from[0], p[1]];
    }
    return p.slice();
  }
  function fmtEditNote(id) {
    var it = Drawing.findFormatItem(doc(), id);
    if (!it || it.k !== 'note') return;
    UI.promptDialog('Sheet Format Note', 'Text ($PRP:"name" links a drawing property, $PRPSHEET:"name" the part\'s; \\n starts a new line):', String(it.text).replace(/\n/g, '\\n'), function (txt) {
      if (txt == null || String(txt) === String(it.text).replace(/\n/g, '\\n')) return;
      edit(function (dc) { Drawing.editFormatItem(dc, id, { text: String(txt).replace(/\\n/g, '\n') }); });
    });
  }
  function fmtDelete(id) {
    if (!id) return false;
    edit(function (dc) { Drawing.deleteFormatItem(dc, id); });
    if (D.sel && D.sel.kind === 'fmt' && D.sel.id === id) D.sel = null;
    drawOverlay();
    return true;
  }
  function resetSheetFormat() { edit(function (dc) { Drawing.resetFormat(dc); }); D.sel = null; UI.setStatus('Sheet format reset to the built-in ' + doc().sheet.format + ' format.'); }
  function fmtMenu(it) {
    var items = [];
    if (it) {
      var own = Drawing.findFormatItem(doc(), it.id);
      if (own && own.k === 'note') items.push({ label: 'Edit Text…', action: function () { fmtEditNote(it.id); } });
      if (/^field:/.test(it.id)) items.push({ label: 'Edit Text…', action: function () { var f = Drawing.TB_FIELDS.filter(function (x) { return 'field:' + x.key === it.id; })[0]; var tf = f && { field: f, rect: Drawing.fieldRect(f, fmtSheetSize(), units()) }; if (tf) DW.openTitleEdit(tf); } });
      if (own && own.k === 'line') items.push({ label: own.style === 'thick' ? 'Thin Line' : 'Thick Line', action: function () { edit(function (dc) { Drawing.editFormatItem(dc, it.id, { style: own.style === 'thick' ? 'thin' : 'thick' }); }); } });
      items.push({ label: 'Delete', key: 'Del', action: function () { fmtDelete(it.id); } }, { sep: true });
    }
    items.push({ label: 'Line', action: function () { fmtTool('fmtline'); } }, { label: 'Note', action: function () { fmtTool('fmtnote'); } }, { sep: true },
      { label: 'Edit Sheet', action: function () { setFormatEdit(false); } },
      { label: 'Save Sheet Format…', action: function () { cmdSaveTemplate('format'); } },
      { label: 'Save as Drawing Template…', action: function () { cmdSaveTemplate('template'); } },
      { label: 'Reset Sheet Format', disabled: !doc().format, action: resetSheetFormat });
    return items;
  }

  // Drawing templates and sheet formats, kept in this browser (localStorage 'anvil.drawingTemplates', a list of
  // Drawing.drawingTemplate / sheetFormatData objects by name) and written / read as JSON files
  var TPL_KEY = 'anvil.drawingTemplates';
  function templates() { try { var l = JSON.parse(localStorage.getItem(TPL_KEY) || '[]'); return Array.isArray(l) ? l.filter(function (t) { return t && t.name && (t.kind === 'anvil-drawing-template' || t.kind === 'anvil-sheet-format'); }) : []; } catch (e) { return []; } }
  function storeTemplates(l) { try { localStorage.setItem(TPL_KEY, JSON.stringify(l)); return true; } catch (e) { UI.toast('Could not keep the template: ' + e.message); return false; } }
  function findTemplate(name) { var n = String(name || '').toLowerCase(); return templates().filter(function (t) { return t.name.toLowerCase() === n; })[0] || null; }
  function keepTemplate(t) {
    Drawing.checkTemplate(t);
    var l = templates().filter(function (x) { return x.name.toLowerCase() !== String(t.name).toLowerCase(); });
    l.push(t);
    return storeTemplates(l) ? t : null;
  }
  function deleteTemplate(name) { var n = String(name || '').toLowerCase(), l = templates(), k = l.filter(function (t) { return t.name.toLowerCase() !== n; }); return k.length < l.length && storeTemplates(k); }
  function makeTemplate(kind, name) {
    var t = kind === 'format' ? Drawing.sheetFormatData(doc(), name) : Drawing.drawingTemplate(doc(), name);
    t.name = String(name).trim();
    return t;
  }
  function templateFileName(t) { return String(t.name).replace(/[^\w\-]+/g, '_') + (t.kind === 'anvil-sheet-format' ? '.slddrt.json' : '.drwdot.json'); }
  function exportTemplate(t) { if (UI.download) UI.download(templateFileName(t), JSON.stringify(t, null, 1), 'application/json'); return t; }
  function cmdSaveTemplate(kind) {
    if (!doc()) return;
    var own = doc().properties || {}, guess = doc().template || own.CompanyName || own.companyname || (kind === 'format' ? 'Shop Format' : 'Shop Drawing');
    UI.promptDialog(kind === 'format' ? 'Save Sheet Format' : 'Save as Drawing Template', (kind === 'format' ? 'Sheet format' : 'Drawing template') + ' name (kept in this browser; Drawing Templates… exports it as a file):', guess, function (name) {
      name = String(name || '').trim();
      if (!name) return;
      var t = keepTemplate(makeTemplate(kind, name));
      if (t) { doc().template = name; UI.toast('Saved ' + (kind === 'format' ? 'sheet format' : 'drawing template') + ' "' + name + '"'); UI.setStatus('New Drawing and Make Drawing from Part offer "' + name + '".'); }
    });
  }
  function importTemplateData(data) {
    var t = typeof data === 'string' ? JSON.parse(data) : data;
    Drawing.checkTemplate(t);
    if (!t.name) t.name = 'Imported template';
    return keepTemplate(t);
  }
  function pickJSON(onText) {
    var inp = el('input', { type: 'file', accept: '.json,.drwdot,.slddrt', style: 'display:none' });
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0];
      inp.remove();
      if (!file) return;
      var r = new FileReader();
      r.onload = function () { onText(String(r.result), file.name); };
      r.readAsText(file);
    });
    document.body.appendChild(inp);
    inp.click();
  }
  // Tools ▸ Drawing Templates…: the saved templates and sheet formats, with Export, Delete, Load Sheet Format (in a
  // drawing: its format, title block texts and properties replace the sheet's) and Import
  function cmdTemplates() {
    var body = el('div', { class: 'dw-tpl-dialog' });
    function fill() {
      body.innerHTML = '';
      var l = templates();
      if (!l.length) body.appendChild(el('p', { text: 'No drawing templates yet. In a drawing, Sheet Format ▸ Save as Drawing Template keeps the sheet\'s format, title block and properties (your company name) under a name.' }));
      l.forEach(function (t) {
        var btns = [el('button', { class: 'dw-tpl-export', text: 'Export', onclick: function () { exportTemplate(t); } }),
          el('button', { class: 'dw-tpl-delete', text: 'Delete', onclick: function () { deleteTemplate(t.name); fill(); } })];
        if (D.active && doc()) btns.unshift(el('button', { class: 'dw-tpl-load', text: 'Load Sheet Format', onclick: function () { edit(function (dc) { Drawing.applySheetFormat(dc, t); }); UI.closeModal(); UI.setStatus('Sheet format "' + t.name + '" loaded.'); } }));
        body.appendChild(el('div', { class: 'dw-tpl-row', 'data-name': t.name }, [el('span', { class: 'dw-tpl-name', text: t.name + (t.kind === 'anvil-sheet-format' ? ' (sheet format)' : t.sheet ? ' (' + t.sheet.format + ')' : '') })].concat(btns)));
      });
    }
    fill();
    UI.showModal({ title: 'Drawing Templates', body: body, buttons: [
      { label: 'Import…', action: function () { pickJSON(function (txt, fname) { try { var t = importTemplateData(txt); UI.toast('Imported "' + t.name + '" from ' + fname); fill(); } catch (e) { UI.toast(e.message); } }); } },
      { label: 'Close', primary: true, action: UI.closeModal }
    ] });
  }
  // the template chooser of New Drawing / Make Drawing from Part: with no saved template it goes straight on (the
  // built-in ANSI / ISO format); otherwise SolidWorks' New SOLIDWORKS Document list: the default, then the templates
  function chooseTemplate(onChosen) {
    var l = templates().filter(function (t) { return t.kind === 'anvil-drawing-template'; });
    if (!l.length) { onChosen(null); return; }
    var list = el('div', { class: 'dw-tpl-choose' }), def = (App.model.units === 'in' ? 'ANSI B' : 'A3');
    function opt(value, label, checked) {
      var r = el('input', { type: 'radio', name: 'dw-tpl', value: value });
      r.checked = !!checked;
      list.appendChild(el('label', { class: 'dlg-row' }, [r, el('span', { text: ' ' + label })]));
    }
    opt('', 'Default (built-in ' + def + ', ' + (App.model.units === 'in' ? 'ANSI' : 'ISO') + ' title block)', false);
    l.forEach(function (t, i) { opt(t.name, t.name + ' (' + (t.sheet ? t.sheet.format : def) + ')', i === l.length - 1); });
    UI.showModal({ title: 'New Drawing', body: el('div', {}, [el('p', { text: 'Drawing template:' }), list]), buttons: [
      { label: 'OK', primary: true, action: function () {
        var c = list.querySelector('input:checked'), t = c && c.value ? findTemplate(c.value) : null;
        UI.closeModal(); onChosen(t);
      } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  // newDrawing(template): a new drawing of the open part / assembly from a template (name or object; null: built-in)
  function newDrawing(template) {
    var t = typeof template === 'string' ? findTemplate(template) : template || null;
    if (typeof template === 'string' && !t) { UI.toast('No drawing template "' + template + '"'); return null; }
    if (D.active) closeDrawing();
    return makeDrawing(t ? { fresh: true, template: t } : { fresh: true });
  }
  function cmdNewDrawing() { chooseTemplate(function (t) { newDrawing(t); }); }
  // Make Drawing from Part / Assembly: the part's drawing opens when it has one; else a new one from a chosen template
  function cmdMakeDrawing() {
    if ((App.model.drawings || []).length) { makeDrawing(); return; }
    chooseTemplate(function (t) { makeDrawing(t ? { template: t } : {}); });
  }

  // General Table (Insert ▸ Tables ▸ General Table, Annotation tab): its PropertyManager asks for the columns and rows
  // and an anchor; with no anchor the table follows the pointer until a click places it. A click picks it (drag moves
  // it off its anchor), a double-click edits a cell in place (Enter applies, Tab goes on to the next cell, Esc
  // cancels), right-click adds or deletes rows and columns, Delete removes it.
  function tableAt(p) { var c = doc() ? Drawing.tableCellAt(doc(), units(), p) : null; return c; }
  function cmdGeneralTable() {
    if (!doc()) return;
    if (D.formatEdit) setFormatEdit(false);
    pmOpen({ title: 'General Table', icon: 'generalTable', command: 'generalTable',
      message: 'Columns and rows; with an anchor the table goes to that corner of the sheet, else click where its top-left corner goes.',
      values: { cols: 2, rows: 2, anchor: 'none' },
      groups: [{ title: 'Table Size', fields: [{ type: 'number', key: 'cols', label: 'Columns', min: 1 }, { type: 'number', key: 'rows', label: 'Rows', min: 1 }] },
        { title: 'Table Position', fields: [{ type: 'select', key: 'anchor', label: 'Attach to anchor point', options: [['none', 'None (click to place)'], ['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']] }] }],
      onOK: function (v) {
        var spec = { cols: Math.max(1, Math.round(+v.cols) || 2), rows: Math.max(1, Math.round(+v.rows) || 2) };
        if (v.anchor && v.anchor !== 'none') { spec.anchor = v.anchor; placeTable(spec); return; }
        D.tool = 'gtable'; D.pending = { spec: spec, at: null }; UI.refreshRibbon(); drawOverlay();
        UI.setStatus('General Table ' + spec.cols + ' × ' + spec.rows + ': click where its top-left corner goes (Esc cancels).');
      } });
  }
  function placeTable(spec) {
    var t = null;
    edit(function (dc) { t = Drawing.addTable(dc, units(), spec); });
    D.sel = { kind: 'gtable', id: t.id }; D.tool = null; D.pending = null;
    UI.refreshRibbon(); drawOverlay(); renderTree();
    UI.setStatus('General Table' + t.id + ' (' + t.cols + ' × ' + t.rows + '): double-click a cell to type in it, right-click to add or delete rows and columns.');
    return t;
  }
  function tableEdit(fn) { try { fn(JSON.parse(JSON.stringify(doc()))); } catch (e) { UI.toast(e.message); UI.setStatus(e.message); return false; } edit(fn); return true; }
  function tableMenu(c) {
    var id = c.id, t = Drawing.findTable(doc(), id), anchor = function (a) { return function () { tableEdit(function (dc) { Drawing.setTableProps(dc, units(), id, { anchor: a }); }); }; };
    return [
      { label: 'Edit Cell…', action: function () { openCellEdit(c); } },
      { sep: true },
      { label: 'Insert ▸ Row Above', action: function () { tableEdit(function (dc) { Drawing.insertTableRow(dc, id, c.r); }); } },
      { label: 'Insert ▸ Row Below', action: function () { tableEdit(function (dc) { Drawing.insertTableRow(dc, id, c.r + 1); }); } },
      { label: 'Insert ▸ Column Left', action: function () { tableEdit(function (dc) { Drawing.insertTableCol(dc, id, c.c); }); } },
      { label: 'Insert ▸ Column Right', action: function () { tableEdit(function (dc) { Drawing.insertTableCol(dc, id, c.c + 1); }); } },
      { label: 'Delete ▸ Row', disabled: t.rows < 2, action: function () { tableEdit(function (dc) { Drawing.deleteTableRow(dc, id, c.r); }); } },
      { label: 'Delete ▸ Column', disabled: t.cols < 2, action: function () { tableEdit(function (dc) { Drawing.deleteTableCol(dc, id, c.c); }); } },
      { sep: true },
      { label: 'Anchor ▸ Top Left', checked: t.anchor === 'top-left', action: anchor('top-left') },
      { label: 'Anchor ▸ Top Right', checked: t.anchor === 'top-right', action: anchor('top-right') },
      { label: 'Anchor ▸ Bottom Left', checked: t.anchor === 'bottom-left', action: anchor('bottom-left') },
      { label: 'Anchor ▸ Bottom Right', checked: t.anchor === 'bottom-right', action: anchor('bottom-right') },
      { sep: true },
      { label: 'Delete Table', key: 'Del', action: function () { edit(function (dc) { Drawing.deleteTable(dc, id); }); D.sel = null; drawOverlay(); renderTree(); } }
    ];
  }
  function openCellEdit(c) {
    DW.closeInlineEdit(false);
    var t = Drawing.findTable(doc(), c.id);
    if (!t || !t.cells[c.r]) return;
    var shown = t.cells[c.r][c.c] || '';
    var inp = el('input', { type: 'text', spellcheck: 'false', 'aria-label': 'Cell ' + (c.r + 1) + ', ' + (c.c + 1) });
    var ok = el('button', { class: 'dw-edit-btn ok', title: 'OK (Enter)', text: '✓' }), no = el('button', { class: 'dw-edit-btn', title: 'Cancel (Esc)', text: '✗' });
    var box = el('div', { id: 'dw-edit', class: 'text tb cell' }, [inp, ok, no]);
    inp.value = shown;
    D.root.appendChild(box);
    // (field.rect places the box over the cell; ref matches no dimension, so the shared close paths leave it alone)
    D.inline = { box: box, inp: inp, field: { key: '__cell', rect: c.rect, shown: shown }, ref: { view: -1, index: -1 }, cell: { id: c.id, r: c.r, c: c.c, shown: shown } };
    DW.positionInlineEdit();
    inp.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); closeCell(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closeCell(false); }
      else if (ev.key === 'Tab') {
        ev.preventDefault();
        var I = D.inline && D.inline.cell, tt = I && Drawing.findTable(doc(), I.id);
        if (!I || !tt) return;
        var n = I.r * tt.cols + I.c + (ev.shiftKey ? -1 : 1);
        closeCell(true);
        if (n < 0 || n >= tt.rows * tt.cols) return;
        var b = Drawing.tableBox(doc(), units(), Drawing.findTable(doc(), I.id)), r = Math.floor(n / tt.cols), cc = n % tt.cols;
        openCellEdit({ id: I.id, r: r, c: cc, rect: { x0: b.colX[cc], x1: b.colX[cc + 1], y0: b.rowY[r + 1], y1: b.rowY[r] } });
      }
    });
    inp.addEventListener('blur', function () { setTimeout(function () { if (D.inline && D.inline.inp === inp && !box.contains(document.activeElement)) closeCell(false); }, 0); });
    [ok, no].forEach(function (b) { b.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); }); });
    ok.addEventListener('click', function () { closeCell(true); });
    no.addEventListener('click', function () { closeCell(false); });
    box.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    try { inp.focus({ preventScroll: true }); inp.select(); } catch (err) { }
    UI.setStatus('Cell ' + (c.r + 1) + ', ' + (c.c + 1) + ': type its text ($PRP:"…" links a property); Enter applies, Tab goes to the next cell, Esc cancels.');
  }
  function closeCell(commit) {
    var I = D.inline;
    if (!I || !I.cell) return;
    D.inline = null;
    if (I.box.parentNode) I.box.parentNode.removeChild(I.box);
    if (!commit || I.inp.value === I.cell.shown) return;
    var v = I.inp.value;
    edit(function (dc) { Drawing.editTableCell(dc, I.cell.id, I.cell.r, I.cell.c, v); });
  }
  var baseCloseInline = DW.closeInlineEdit;
  DW.closeInlineEdit = function (commit) { if (D.inline && D.inline.cell) return closeCell(commit); return baseCloseInline.apply(this, arguments); };

  // the sheet's mouse (drawing-ui.js calls these first): the format tools, General Table placement and picks
  DW.aeDown = function (p, e) {
    if (D.tool === 'fmtline' && D.pending) {
      if (!D.pending.a) { D.pending.a = snapFmt(p); drawOverlay(); UI.setStatus('Sheet format Line: click its end.'); return true; }
      var a = D.pending.a, b = snapFmt(p, a), st = D.pending.style;
      D.pending.a = null;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < pxToPaper(2)) return true;
      var id = null;
      edit(function (dc) { id = Drawing.addFormatLine(dc, fmtSheetSize(), units(), a, b, st); });
      D.sel = { kind: 'fmt', id: id }; drawOverlay();
      UI.setStatus('Line added to the sheet format. Click the next line\'s start, Esc ends.');
      return true;
    }
    if (D.tool === 'fmtnote' && D.pending) {
      var at = p.slice();
      UI.promptDialog('Sheet Format Note', 'Text ($PRP:"CompanyName" links a drawing property; \\n starts a new line):', '', function (txt) {
        if (!txt || !String(txt).trim()) return;
        var nid = null;
        edit(function (dc) { nid = Drawing.addFormatNote(dc, fmtSheetSize(), units(), at, String(txt).replace(/\\n/g, '\n'), 3.5); });
        D.sel = { kind: 'fmt', id: nid }; drawOverlay();
      });
      return true;
    }
    if (D.tool === 'gtable' && D.pending) { placeTable(Object.assign({ x: p[0], y: p[1] }, D.pending.spec)); return true; }
    if (D.formatEdit && !D.tool) {
      var it = fmtItemAt(p);
      if (it) {
        D.sel = { kind: 'fmt', id: it.id };
        D.drag = { kind: 'fmt', id: it.id, start: p, last: p, moved: false };
        UI.setStatus('Sheet format ' + (it.kind === 'text' ? 'text' : 'line') + ' ' + it.id + ' — drag to move it, Delete removes it' + (it.kind === 'text' ? ', double-click to edit it' : '') + '.');
      } else {
        D.sel = null;
        D.drag = { kind: 'pan', x: e.clientX, y: e.clientY, vb: JSON.parse(JSON.stringify(D.vb)) };
      }
      drawOverlay(); renderTree();
      return true;
    }
    if (D.tool) return false;
    var gt = tableAt(p);
    if (gt) {
      D.sel = { kind: 'gtable', id: gt.id };
      D.drag = { kind: 'gtable', id: gt.id, start: p, x0: gt.box.x0, y0: gt.box.y1, moved: false };
      drawOverlay(); renderTree();
      UI.setStatus('General Table' + gt.id + ' — drag to move it, double-click a cell to edit it, right-click to add or delete rows and columns, Delete removes it.');
      return true;
    }
    return false;
  };
  DW.aeDragMove = function (dg, p) {
    if (dg.kind !== 'fmt' && dg.kind !== 'gtable') return false;
    if (!dg.moved && Math.hypot(p[0] - dg.start[0], p[1] - dg.start[1]) < pxToPaper(3)) return true;
    if (!dg.moved) { UI.pushUndo(); dg.moved = true; D.host.classList.add('dw-dragging'); }
    if (dg.kind === 'fmt') { Drawing.moveFormatItem(doc(), dg.id, p[0] - dg.last[0], p[1] - dg.last[1], units()); dg.last = p; }
    else Drawing.moveTable(doc(), dg.id, dg.x0 + p[0] - dg.start[0], dg.y0 + p[1] - dg.start[1]);
    queueRender(true);
    return true;
  };
  DW.aeHover = function (q) {
    var h;
    if ((D.tool === 'fmtline' || D.tool === 'gtable') && D.pending) { D.pending.at = D.tool === 'fmtline' ? snapFmt(q, D.pending.a) : q; drawOverlay(); return true; }
    if (D.tool === 'fmtnote') return true;
    if (D.formatEdit && !D.tool) { var it = fmtItemAt(q); h = it ? { kind: 'fmt', id: it.id } : null; }
    else if (!D.tool) { var gt = tableAt(q); if (!gt) return false; h = { kind: 'gtable', id: gt.id }; }
    else return false;
    if (JSON.stringify(h) !== JSON.stringify(D.hover)) { D.hover = h; drawOverlay(); }
    return true;
  };
  DW.aeDblClick = function (p) {
    if (D.formatEdit) {
      var it = fmtItemAt(p), own = it && Drawing.findFormatItem(doc(), it.id);
      if (own && own.k === 'note') { fmtEditNote(it.id); return true; }
      if (it && /^field:/.test(it.id)) { var tf = Drawing.titleFieldAt(fmtSheetSize(), units(), p, doc()); if (tf) DW.openTitleEdit(tf); }
      return true;
    }
    var c = tableAt(p);
    if (c) { D.sel = { kind: 'gtable', id: c.id }; openCellEdit(c); return true; }
    return false;
  };
  DW.aeContext = function (p, e) {
    if (D.formatEdit) {
      var it = fmtItemAt(p);
      D.sel = it ? { kind: 'fmt', id: it.id } : null; drawOverlay();
      UI.showMenu(e.clientX, e.clientY, fmtMenu(it));
      return true;
    }
    var c = tableAt(p);
    if (c) { D.sel = { kind: 'gtable', id: c.id }; drawOverlay(); renderTree(); UI.showMenu(e.clientX, e.clientY, tableMenu(c)); return true; }
    return false;
  };
  DW.aeOverlay = function (g, H, svgNode, sw, pad) {
    if (D.host) D.host.classList.toggle('dw-fmt-edit', !!D.formatEdit);
    var hot = function (it, sel) {
      if (it.box) svgNode('rect', { class: 'dw-dbox' + (sel ? ' sel' : ''), x: it.box.x0 - pad / 2, y: H - it.box.y1 - pad / 2, width: it.box.x1 - it.box.x0 + pad, height: it.box.y1 - it.box.y0 + pad, 'stroke-width': sw }, g);
      else svgNode('line', { class: 'dw-hot' + (sel ? '' : ' pre'), x1: it.a[0], y1: H - it.a[1], x2: it.b[0], y2: H - it.b[1], 'stroke-width': pxToPaper(sel ? 3 : 2.4) }, g);
    };
    if (D.formatEdit && D.sheet && D.sheet.format) D.sheet.format.forEach(function (it) {
      var sel = D.sel && D.sel.kind === 'fmt' && D.sel.id === it.id, hov = D.hover && D.hover.kind === 'fmt' && D.hover.id === it.id;
      if (sel || hov) hot(it, sel);
    });
    (D.sheet && D.sheet.tables || []).forEach(function (t) {
      var sel = D.sel && D.sel.kind === 'gtable' && D.sel.id === t.id, hov = D.hover && D.hover.kind === 'gtable' && D.hover.id === t.id;
      if (sel || hov) hot({ box: t.box }, sel);
    });
    var P = D.pending;
    if (D.tool === 'fmtline' && P && P.a && P.at) svgNode('line', { class: 'dw-cut', x1: P.a[0], y1: H - P.a[1], x2: P.at[0], y2: H - P.at[1], 'stroke-width': pxToPaper(1.5) }, g);
    if (D.tool === 'gtable' && P && P.at) {
      var k = paperK(), w = P.spec.cols * 25 * k, h = P.spec.rows * 6 * k;
      svgNode('rect', { class: 'dw-ghost', x: P.at[0], y: H - P.at[1], width: w, height: h, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g);
    }
  };
  // Delete: a format item, a General Table
  var baseDelete2 = deleteSelection;
  deleteSelection = DW.deleteSelection = function () {
    var s = D.sel;
    if (s && s.kind === 'fmt') { fmtDelete(s.id); return true; }
    if (s && s.kind === 'gtable') { edit(function (dc) { Drawing.deleteTable(dc, s.id); }); D.sel = null; drawOverlay(); renderTree(); return true; }
    if (D.formatEdit) return false;
    return baseDelete2.apply(this, arguments);
  };
  // (rfAO) Delete: sketch entities (drawing-ui-sketch.js)
  var baseDelete3 = deleteSelection;
  deleteSelection = DW.deleteSelection = function () {
    if (DW.skDelete && DW.skDelete()) return true;
    return baseDelete3.apply(this, arguments);
  };
  // (lane DW) Delete: an Area Hatch/Fill (drawing-ui-tools.js)
  var baseDelete4 = deleteSelection;
  deleteSelection = DW.deleteSelection = function () {
    if (DW.areaFillDelete && DW.areaFillDelete()) return true;
    return baseDelete4.apply(this, arguments);
  };
  // the sheet's right-click menu: Edit Sheet Format after Properties (SolidWorks' place)
  var baseSheetMenu = DW.sheetMenu;
  sheetMenu = DW.sheetMenu = function () {
    var items = baseSheetMenu.apply(this, arguments);
    items.splice(1, 0, { label: 'Edit Sheet Format', action: function () { setFormatEdit(true); } });
    return items;
  };
  DW.fmtTreeMenu = function () { return [{ label: D.formatEdit ? 'Edit Sheet' : 'Edit Sheet Format', action: function () { setFormatEdit(!D.formatEdit); } }, { label: 'Save Sheet Format…', action: function () { cmdSaveTemplate('format'); } }, { label: 'Reset Sheet Format', disabled: !doc().format, action: resetSheetFormat }]; };
  DW.tableTreeMenu = function (id) { var t = Drawing.findTable(doc(), id), b = t && Drawing.tableBox(doc(), units(), t); return t ? tableMenu({ id: id, r: 0, c: 0, rect: { x0: b.colX[0], x1: b.colX[1], y0: b.rowY[1], y1: b.rowY[0] } }) : []; };
  DW.setFormatEdit = setFormatEdit; DW.cmdGeneralTable = cmdGeneralTable;

  // the Sheet Format tab (SolidWorks 2024's drawing CommandManager) and General Table on Annotation
  UI.RIBBON['Sheet Format'] = [
    { id: 'editSheetFormat', label: 'Edit Sheet\nFormat', run: function () { setFormatEdit(!D.formatEdit); }, active: function () { return !!D.formatEdit; } },
    { sep: true },
    { id: 'fmtLine', label: 'Line', run: function () { fmtTool('fmtline'); }, active: function () { return D.tool === 'fmtline'; } },
    { id: 'fmtNote', label: 'Note', run: function () { fmtTool('fmtnote'); }, active: function () { return D.tool === 'fmtnote'; } },
    { sep: true },
    { id: 'saveSheetFormat', label: 'Save Sheet\nFormat', run: function () { cmdSaveTemplate('format'); } },
    { id: 'saveTemplate', label: 'Save as\nTemplate', run: function () { cmdSaveTemplate('template'); } },
    { id: 'drawingTemplates', icon: 'docProps', label: 'Drawing\nTemplates', run: cmdTemplates },
    { id: 'resetFormat', label: 'Reset\nFormat', run: resetSheetFormat }
  ];
  if (UI.ASM_RIBBON) UI.ASM_RIBBON['Sheet Format'] = UI.RIBBON['Sheet Format'];
  (function () {
    var an = UI.RIBBON.Annotation, at = -1;
    an.forEach(function (it, i) { if (it.id === 'revTable') at = i; });
    an.splice(at >= 0 ? at + 1 : an.length, 0, { id: 'generalTable', label: 'General\nTable', run: cmdGeneralTable, active: function () { return D.tool === 'gtable'; } });
  })();
  var baseTabsFor = UI.ribbonTabsFor;
  UI.ribbonTabsFor = function (names, extra) {
    if (D.active) return [['View Layout', 'Annotation', 'Sketch', 'Sheet Format'], ['Markup']];   // (rfAO) the Sketch tab is drawing-ui-sketch.js
    var r = baseTabsFor(names, extra);
    return [r[0].filter(function (n) { return n !== 'Sheet Format'; }), r[1]];
  };
  // menus: File ▸ New Drawing / Save Drawing As (.drawing) / Drawing Templates, Insert ▸ Tables ▸ General Table, Edit
  // Sheet Format; Make Drawing from Part offers the templates
  var baseMenuHook = UI.menuHook;
  UI.menuHook = function (menus) {
    var out = baseMenuHook(menus);
    var file = out.filter(function (m) { return m.label === 'File'; })[0];
    if (!D.active) {
      if (file) file.items.forEach(function (it, i) {
        if (/^Make Drawing from /.test(it.label || '')) file.items.splice(i, 1, Object.assign({}, it, { action: cmdMakeDrawing }), { label: 'New Drawing…', action: cmdNewDrawing });
      });
      return out;
    }
    if (file) {
      var ci = -1;
      file.items.forEach(function (it, i) { if (it.label === 'Properties…' && ci < 0) ci = i; });
      file.items.splice(ci >= 0 ? ci : file.items.length, 0, { label: 'New Drawing…', action: cmdNewDrawing }, { label: 'Save Drawing As…', action: function () { saveDrawingFile(); } }, { sep: true });
    }
    var ins = out.filter(function (m) { return m.label === 'Insert'; })[0];
    if (ins) {
      var ri = -1;
      ins.items.forEach(function (it, i) { if (/^Tables ▸ Revision Table/.test(it.label || '')) ri = i; });
      ins.items.splice(ri >= 0 ? ri + 1 : ins.items.length, 0, { label: 'Tables ▸ General Table…', action: cmdGeneralTable });
    }
    var tools = out.filter(function (m) { return m.label === 'Tools'; })[0];
    if (tools) tools.items.push({ sep: true }, { label: D.formatEdit ? 'Edit Sheet' : 'Edit Sheet Format', action: function () { setFormatEdit(!D.formatEdit); } }, { label: 'Drawing Templates…', action: cmdTemplates });
    return out;
  };

  // The .drawing document. File ▸ Save Drawing As writes the open drawing as <name>.drawing (JSON: the drawing and a
  // reference to its part by name and file name); File ▸ Open of a .drawing opens it on that part: the open part when
  // it is the one (the drawing is added to it, or replaces its drawing of the same name), else the part saved in this
  // browser under that file name or model name, else it asks for the part file. model.drawings keeps working.
  function saveDrawingFile() {
    if (!doc()) return null;
    settle();
    var f = Drawing.drawingFile(doc(), App.model, App.fileName || null);
    if (UI.download) UI.download(String(doc().name || 'Draw1').replace(/[^\w\-]+/g, '_') + '.drawing', JSON.stringify(f, null, 1), 'application/json');
    DW.markDrawingClean();
    UI.setStatus('Saved ' + doc().name + '.drawing (it refers to ' + (App.model.name || 'the part') + (App.fileName ? ', file "' + App.fileName + '"' : '') + ').');
    return f;
  }
  function savedFiles() { try { return JSON.parse(localStorage.getItem('anvil.files') || '{}'); } catch (e) { return {}; } }
  function partMatches(want) {
    if (!want || !App.model) return false;
    var asm = App.model.type === 'assembly';
    if (want.type && (want.type === 'assembly') !== asm) return false;
    return (want.file && App.fileName === want.file) || (want.name != null && App.model.name === want.name);
  }
  function attachDrawing(f, fname) {
    if (D.active) closeDrawing();
    UI.pushUndo();
    var list = App.model.drawings = (App.model.drawings || []).slice(), dc = JSON.parse(JSON.stringify(f.drawing)), i = -1;
    list.forEach(function (d, j) { if (d && d.name === dc.name) i = j; });
    if (i >= 0) list[i] = dc; else { list.push(dc); i = list.length - 1; }
    UI.autosave();
    makeDrawing({ index: i });
    UI.setStatus('Opened ' + (fname || dc.name + '.drawing') + ' on ' + (App.model.name || 'the part') + '.');
    return window.anvil && window.anvil.drawing ? window.anvil.drawing.summary() : true;
  }
  // openDrawingFile(name, data, opts) -> Promise of the drawing summary (null when the part is not given).
  // opts.part = { name, data }: the part file to open it on (as the dialog's Browse picks one)
  function openDrawingFile(name, data, opts) {
    opts = opts || {};
    var f;
    try {
      var txt = typeof data === 'string' || (data && data.kind) ? data : new TextDecoder('utf-8').decode(new Uint8Array(data));
      f = Drawing.readDrawingFile(txt);
    } catch (e) { return Promise.reject(e); }
    var want = f.part, label = want.name || want.file || 'its part';
    if (partMatches(want)) return Promise.resolve(attachDrawing(f, name));
    function onPart(pname, pdata) {
      return UI.openFileData(pname, pdata).then(function () {
        if (!partMatches(want) && want.name && App.model.name !== want.name) UI.toast(pname + ' is ' + (App.model.name || 'a part') + ', not ' + want.name + ': the drawing opens on it anyway.');
        return attachDrawing(f, name);
      });
    }
    if (opts.part) return onPart(opts.part.name, opts.part.data);
    var files = savedFiles(), key = want.file && files[want.file] && files[want.file].model ? want.file : null;
    if (!key) Object.keys(files).forEach(function (n) { if (!key && files[n] && files[n].model && files[n].model.name === want.name && (!want.type || (files[n].model.type === 'assembly') === (want.type === 'assembly'))) key = n; });
    if (key) {
      return UI.loadModel(files[key].model).then(function () { App.fileName = key; if (UI.markClean) UI.markClean(); return attachDrawing(f, name); });
    }
    return new Promise(function (resolve, reject) {
      var inp = el('input', { type: 'file', id: 'dw-part-file', accept: '.json,.js', 'aria-label': 'Part file' });
      inp.addEventListener('change', function () {
        var file = inp.files && inp.files[0];
        if (!file) return;
        var r = new FileReader();
        r.onload = function () { UI.closeModal(); onPart(file.name, String(r.result)).then(resolve, reject); };
        r.readAsText(file);
      });
      UI.showModal({ title: 'Open Drawing', body: el('div', { class: 'dw-open-drawing' }, [
        el('p', { text: (f.drawing.name || 'The drawing') + ' refers to ' + label + (want.file && want.file !== want.name ? ' (file "' + want.file + '")' : '') + ', which is not open or saved in this browser.' }),
        el('p', { text: 'Choose the ' + (want.type === 'assembly' ? 'assembly' : 'part') + ' file (.anvil.json or .anvil.js) to open it on:' }), inp
      ]), buttons: [{ label: 'Cancel', action: function () { UI.closeModal(); resolve(null); } }] });
    });
  }
  UI.openDrawingFile = openDrawingFile;

  if (window.anvil && window.anvil.drawing) {
    var AD = window.anvil.drawing;
    // (rfAE) Edit Sheet Format: editSheetFormat(on) -> whether it is on; formatItems() -> [{ id, kind, a, b | box,
    // added }]; formatLine(a, b, style) / formatNote(p, text, h) -> the new item's id; formatMove(id, dx, dy),
    // formatDelete(id), formatEdit(id, { text, h, style }), resetFormat(); each change one undo step
    AD.editSheetFormat = function (on) { if (!doc()) return null; if (on !== undefined) setFormatEdit(on); return !!D.formatEdit; };
    AD.formatItems = function () { var s = summary(); return s ? s.format.items : null; };
    AD.formatLine = function (a, b, style) { if (!doc()) return null; var id; edit(function (dc) { id = Drawing.addFormatLine(dc, fmtSheetSize(), units(), a, b, style); }); return id; };
    AD.formatNote = function (p, text, h) { if (!doc()) return null; var id; edit(function (dc) { id = Drawing.addFormatNote(dc, fmtSheetSize(), units(), p, text, h); }); return id; };
    AD.formatMove = function (id, dx, dy) { if (!doc()) return null; edit(function (dc) { Drawing.moveFormatItem(dc, id, dx, dy, units()); }); return AD.formatItems(); };
    AD.formatDelete = function (id) { if (!doc()) return null; fmtDelete(id); return AD.formatItems(); };
    AD.formatEdit = function (id, props) { return tableEdit(function (dc) { Drawing.editFormatItem(dc, id, props || {}); }) ? AD.formatItems() : null; };
    AD.resetFormat = function () { if (!doc()) return null; resetSheetFormat(); return AD.formatItems(); };
    // templates: templates() -> [{ name, kind, format }]; saveTemplate(name, { kind: 'template' | 'format' }) keeps the
    // open drawing's; template(name) -> it; deleteTemplate(name); exportTemplate(name) (downloads; -> the JSON text);
    // importTemplate(text | object) -> its name; loadSheetFormat(name | object) applies one to the open drawing;
    // newDrawing({ template: name | object | null }) -> the summary of a new drawing of the open part
    AD.templates = function () { return templates().map(function (t) { return { name: t.name, kind: t.kind === 'anvil-sheet-format' ? 'format' : 'template', format: t.sheet ? t.sheet.format : null }; }); };
    AD.saveTemplate = function (name, opts) { if (!doc() || !String(name || '').trim()) return null; var t = keepTemplate(makeTemplate(opts && opts.kind === 'format' ? 'format' : 'template', name)); if (t) doc().template = t.name; return t ? t.name : null; };
    AD.template = function (name) { var t = findTemplate(name); return t ? JSON.parse(JSON.stringify(t)) : null; };
    AD.deleteTemplate = function (name) { return !!deleteTemplate(name); };
    AD.exportTemplate = function (name) { var t = findTemplate(name); if (!t) return null; exportTemplate(t); return JSON.stringify(t, null, 1); };
    AD.importTemplate = function (data) { try { return importTemplateData(data).name; } catch (e) { UI.toast(e.message); return null; } };
    AD.loadSheetFormat = function (t) { var o = typeof t === 'string' ? findTemplate(t) : t; if (!doc() || !o) return null; return tableEdit(function (dc) { Drawing.applySheetFormat(dc, o); }) ? summary() : null; };
    AD.newDrawing = function (opts) { return newDrawing(opts && opts.template || null) ? summary() : null; };
    // General Tables: table({ rows, cols, anchor | x, y, cells }) -> its id; tableCell(id, r, c, text); insertRow(id, at),
    // insertColumn(id, at), deleteRow(id, r), deleteColumn(id, c), tableProps(id, { anchor, x, y, rowH, colW }),
    // deleteTable(id); tables() -> summary().tables; each change one undo step
    AD.table = function (spec) { if (!doc()) return null; var t = null; if (!tableEdit(function (dc) { t = Drawing.addTable(dc, units(), spec || {}); })) return null; return t.id; };
    AD.tableCell = function (id, r, c, text) { return tableEdit(function (dc) { Drawing.editTableCell(dc, id, r, c, text); }) ? AD.tables() : null; };
    AD.insertRow = function (id, at) { return tableEdit(function (dc) { Drawing.insertTableRow(dc, id, at); }) ? AD.tables() : null; };
    AD.insertColumn = function (id, at) { return tableEdit(function (dc) { Drawing.insertTableCol(dc, id, at); }) ? AD.tables() : null; };
    AD.deleteRow = function (id, r) { return tableEdit(function (dc) { Drawing.deleteTableRow(dc, id, r); }) ? AD.tables() : null; };
    AD.deleteColumn = function (id, c) { return tableEdit(function (dc) { Drawing.deleteTableCol(dc, id, c); }) ? AD.tables() : null; };
    AD.tableProps = function (id, props) { return tableEdit(function (dc) { Drawing.setTableProps(dc, units(), id, props || {}); }) ? AD.tables() : null; };
    AD.deleteTable = function (id) { return tableEdit(function (dc) { if (!Drawing.deleteTable(dc, id)) throw new Error('No general table ' + id); }) ? AD.tables() : null; };
    AD.tables = function () { var s = summary(); return s ? s.tables : null; };
    // the .drawing document: saveFile() downloads it (-> the object); openFile(text | object, { part: { name, data } })
    // -> Promise of the summary (as File ▸ Open of a .drawing)
    AD.saveFile = function () { return saveDrawingFile(); };
    AD.openFile = function (data, opts) { return openDrawingFile('Drawing.drawing', data, opts); };
  }
  DW.renderTree = renderTree;
  // the File menu gets its drawing entry through UI.menuHook; redraw the menu bar now that the hook exists
  if (UI.renderMenuBar && $('menus').children.length) UI.renderMenuBar();
  if (UI.refreshRibbon && $('ribbon-buttons').children.length) UI.refreshRibbon();
})();
