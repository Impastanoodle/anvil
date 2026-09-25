// ui-panels.js — ribbon (CommandManager), menu bar, FeatureManager tree, heads-up toolbar, status bar, modal dialogs.
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el;

  // ------------------------------------------------------------------ status & toast
  function setStatus(msg) { $('status-msg').textContent = msg; }
  var toastTimer = null;
  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = el('div', { class: 'toast', text: msg });
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 2600);
  }
  var lastDocType = null;
  function refreshStatus() {
    var asm = isAsm();
    // switching between a part and an assembly document swaps the CommandManager tabs
    if (lastDocType !== (asm ? 'assembly' : 'part')) {
      lastDocType = asm ? 'assembly' : 'part';
      if (ribbonTabs().indexOf(App.ribbonTab) < 0) App.ribbonTab = ribbonTabs()[0];
      refreshRibbon();
    }
    var mode = App.mode === 'sketch' ? 'Editing ' + (UI.activeSketchFeature() || {}).name : asm ? 'Editing Assembly' : 'Editing Part';
    var units = App.model.units === 'in' ? 'IPS' : 'MMGS';
    var errs = App.build ? Object.keys(App.build.errors).length : 0;
    $('status-right').innerHTML = '<span>' + (errs ? errs + ' rebuild error' + (errs > 1 ? 's' : '') : 'Fully rebuilt') + '</span><span>' + mode + '</span><span>' + units + '</span><span>' + (App.lastRebuildMs != null ? UI.fmtNum(App.lastRebuildMs, 0) + ' ms' : '') + '</span>';
    $('doc-title').textContent = App.model.name + (App.mode === 'sketch' ? '  —  sketch' : '');
  }

  // ------------------------------------------------------------------ ribbon
  var RIBBON = {
    Features: [
      { id: 'extrude', label: 'Extruded\nBoss/Base', run: function () { UI.cmdExtrude(false); } },
      { id: 'revolve', label: 'Revolved\nBoss/Base', run: function () { UI.cmdRevolve(false); } },
      { stack: [{ id: 'sweep', label: 'Swept Boss/Base', run: function () { UI.cmdSweep(false); } }, { id: 'loft', label: 'Lofted Boss/Base', run: function () { UI.cmdLoft(false); } }, { id: 'loft', label: 'Boundary Boss/Base' }] },
      { sep: true },
      { id: 'cut', label: 'Extruded\nCut', run: function () { UI.cmdExtrude(true); } },
      { id: 'hole', label: 'Hole\nWizard', run: function () { UI.cmdHole(); } },
      { id: 'revolveCut', label: 'Revolved\nCut', run: function () { UI.cmdRevolve(true); } },
      { stack: [{ id: 'sweep', label: 'Swept Cut', run: function () { UI.cmdSweep(true); } }, { id: 'loft', label: 'Lofted Cut', run: function () { UI.cmdLoft(true); } }, { id: 'loft', label: 'Boundary Cut' }] },
      { sep: true },
      { id: 'fillet', label: 'Fillet', run: function () { UI.cmdFillet(); } },
      { id: 'lpattern', label: 'Linear\nPattern', run: function () { UI.cmdLinearPattern(); } },
      { stack: [{ id: 'cpattern', label: 'Circular Pattern', run: function () { UI.cmdCircularPattern(); } }, { id: 'mirror', label: 'Mirror', run: function () { UI.cmdMirror(); } }, { id: 'chamfer', label: 'Chamfer', run: function () { UI.cmdChamfer(); } }] },
      { sep: true },
      { id: 'shell', label: 'Shell', run: function () { UI.cmdShell(); } },
      { id: 'draft', label: 'Draft' }, { id: 'intersect', label: 'Intersect' }, { id: 'rib', label: 'Rib' }, { id: 'wrap', label: 'Wrap' },
      { sep: true },
      { id: 'refgeo', label: 'Reference\nGeometry', run: function () { UI.cmdPlane(); } },
      { id: 'curves', label: 'Curves' },
      { id: 'instant', label: 'Instant3D' }
    ],
    Sketch: [
      { id: 'sketch', label: 'Sketch', run: function () { UI.cmdSketch(); }, dyn: function () { return App.mode === 'sketch' ? { id: 'exitSketch', label: 'Exit\nSketch' } : null; } },
      { id: 'dim', label: 'Smart\nDimension', tool: 'dimension' },
      { sep: true },
      { id: 'line', label: 'Line', tool: 'line' },
      { id: 'rect', label: 'Corner\nRectangle', tool: 'rect' },
      { id: 'crect', label: 'Center\nRectangle', tool: 'crect' },
      { id: 'circle', label: 'Circle', tool: 'circle' },
      { id: 'arc', label: 'Centerpoint\nArc', tool: 'arc' },
      { id: 'polygon', label: 'Polygon', tool: 'polygon' },
      { id: 'slot', label: 'Straight\nSlot', tool: 'slot' },
      { id: 'point', label: 'Point', tool: 'point' },
      { stack: [{ id: 'spline', label: 'Spline' }, { id: 'ellipse', label: 'Ellipse' }, { id: 'text', label: 'Text' }] },
      { sep: true },
      { id: 'fillet', label: 'Sketch\nFillet', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdSketchFillet(); } },
      { id: 'trim', label: 'Trim\nEntities', run: function () { UI.cmdTrimEntities(); } }, { id: 'convert', label: 'Convert\nEntities', run: function () { UI.cmdConvertEntities(); } }, { id: 'offset', label: 'Offset\nEntities', run: function () { UI.cmdOffsetEntities(); } },
      { stack: [{ id: 'mirrorEnt', label: 'Mirror Entities', run: function () { UI.cmdMirrorEntities(); } }, { id: 'sketchPattern', label: 'Linear Sketch Pattern', run: function () { UI.cmdSketchPattern(); } }, { id: 'relations', label: 'Display/Delete Relations' }] },
      { sep: true },
      { id: 'plane', label: 'Plane', run: function () { UI.cmdPlane(); } },
      { id: 'dxf', label: 'Sketch\nto DXF', run: function () { UI.exportSketchDXF(); } }
    ],
    Evaluate: [
      { id: 'measure', label: 'Measure', run: function () { UI.cmdMeasure(); } },
      { id: 'mass', label: 'Mass\nProperties', run: function () { UI.showMassProperties(); } },
      { id: 'section', label: 'Section\nView', run: function () { UI.cmdSection(); } },
      { sep: true },
      { id: 'dxf', label: 'Face\nto DXF', run: function () { UI.exportFaceDXF(); } },
      { id: 'check', label: 'Check' }, { id: 'sensor', label: 'Sensor' }, { id: 'zebra', label: 'Zebra\nStripes' },
      { stack: [{ id: 'generic', label: 'Draft Analysis' }, { id: 'generic', label: 'Undercut Analysis' }, { id: 'generic', label: 'Thickness Analysis' }] },
      { sep: true },
      { id: 'generic', label: 'Compare\nDocuments' }, { id: 'generic', label: 'Performance\nEvaluation' }, { id: 'generic', label: 'Costing' }
    ],
    'Sheet Metal': [
      { id: 'flange', label: 'Base\nFlange/Tab', run: function () { UI.cmdBaseFlange(); } },
      { id: 'generic', label: 'Convert to\nSheet Metal' }, { id: 'loft', label: 'Lofted-\nBend' },
      { sep: true },
      { id: 'bend', label: 'Edge\nFlange', run: function () { UI.cmdEdgeFlange(); } }, { id: 'miter', label: 'Miter\nFlange', run: function () { UI.cmdMiterFlange(); } }, { id: 'hem', label: 'Hem', run: function () { UI.cmdHem(); } }, { id: 'jog', label: 'Jog', run: function () { UI.cmdJog(); } }, { id: 'bend', label: 'Sketched\nBend' },
      { stack: [{ id: 'generic', label: 'Cross-Break' }, { id: 'generic', label: 'Corners' }, { id: 'generic', label: 'Forming Tool' }] },
      { sep: true },
      { id: 'cut', label: 'Extruded\nCut', run: function () { UI.cmdExtrude(true); } }, { id: 'hole', label: 'Simple\nHole', run: function () { UI.cmdHole(); } }, { id: 'generic', label: 'Vent' },
      { sep: true },
      { id: 'flatten', label: 'Flatten', run: function () { UI.cmdFlatten(); } }, { id: 'dxf', label: 'Flat to\nDXF', run: function () { UI.exportFlatDXF(); } }, { id: 'generic', label: 'Unfold' }, { id: 'generic', label: 'Fold' }, { id: 'generic', label: 'Rip' }
    ]
  };

  // Assembly documents get their own CommandManager: the Assembly tab plus Evaluate (the part-only tabs are hidden).
  var ASM_RIBBON = {
    Assembly: [
      { id: 'insertComponent', label: 'Insert\nComponents', run: function () { UI.cmdInsertComponent(); } },
      { id: 'mate', label: 'Mate', run: function () { UI.cmdMate(); } },
      { sep: true },
      { id: 'fix', label: 'Fix', run: function () { UI.cmdFixComponent(true); } },
      { id: 'float', label: 'Float', run: function () { UI.cmdFixComponent(false); } },
      { sep: true },
      { id: 'hideshow', label: 'Hide/Show\nComponents', run: function () { UI.cmdHideShowComponents(); } },
      { sep: true },
      { id: 'lpattern', label: 'Linear Component\nPattern' }, { id: 'generic', label: 'Move\nComponent' }, { id: 'generic', label: 'Exploded\nView' },
      { stack: [{ id: 'generic', label: 'Smart Fasteners' }, { id: 'generic', label: 'Bill of Materials' }, { id: 'generic', label: 'Instant3D' }] }
    ],
    Evaluate: [
      { id: 'measure', label: 'Measure', run: function () { UI.cmdMeasure(); } },
      { id: 'mass', label: 'Mass\nProperties', run: function () { UI.showMassProperties(); } },
      { id: 'section', label: 'Section\nView', run: function () { UI.cmdSection(); } },
      { sep: true },
      { id: 'generic', label: 'Interference\nDetection' }, { id: 'generic', label: 'Clearance\nVerification' }, { id: 'generic', label: 'Hole Alignment' }
    ]
  };
  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function ribbonSet() { return isAsm() ? ASM_RIBBON : RIBBON; }
  function ribbonTabs() { return Object.keys(ribbonSet()); }

  // One-line descriptions for the ribbon tooltips, keyed by the button label (ids such as 'bend' are shared by several buttons).
  var RIBBON_HELP = {
    'Extruded Boss/Base': 'Extrude a closed sketch profile into a solid', 'Revolved Boss/Base': 'Revolve a sketch profile about an axis line',
    'Swept Boss/Base': 'Sweep a profile sketch along a path', 'Lofted Boss/Base': 'Loft a solid through two or more section sketches',
    'Extruded Cut': 'Remove material by extruding a sketch profile', 'Hole Wizard': 'Cut a simple hole at the selected point on a face', 'Revolved Cut': 'Remove material by revolving a sketch profile',
    'Swept Cut': 'Remove material along a path', 'Lofted Cut': 'Remove material lofted through section sketches',
    'Fillet': 'Round the selected edges', 'Chamfer': 'Bevel the selected edges', 'Linear Pattern': 'Repeat a feature along one or two directions', 'Circular Pattern': 'Repeat a feature about an axis', 'Mirror': 'Mirror a feature or the body about a plane',
    'Shell': 'Hollow the body, removing the selected faces', 'Reference Geometry': 'Create an offset reference plane',
    'Sketch': 'Start a sketch on the selected plane or face', 'Exit Sketch': 'Close the sketch and return to the part', 'Smart Dimension': 'Dimension sketch entities',
    'Line': 'Draw a line', 'Corner Rectangle': 'Rectangle from two corners', 'Center Rectangle': 'Rectangle from its center', 'Circle': 'Circle from center and radius', 'Centerpoint Arc': 'Arc from center, start and end', 'Polygon': 'Regular polygon', 'Straight Slot': 'Slot from two centers and a width', 'Point': 'Sketch point',
    'Sketch Fillet': 'Round a sketch corner', 'Trim Entities': 'Trim or extend sketch entities', 'Convert Entities': 'Project model edges into the sketch', 'Offset Entities': 'Offset sketch entities by a distance',
    'Plane': 'Create an offset reference plane', 'Sketch to DXF': 'Export the active sketch as DXF',
    'Measure': 'Measure distances, lengths and areas', 'Mass Properties': 'Volume, mass, centroid and bounding box', 'Section View': 'Cut the view with a section plane', 'Face to DXF': 'Export the selected face outline as DXF',
    'Base Flange/Tab': 'Turn a sketch into the first sheet-metal body and set the sheet parameters', 'Edge Flange': 'Bend a wall from a straight edge of the sheet',
    'Miter Flange': 'Bend walls from adjacent edges and join them at the corner', 'Hem': 'Fold the sheet back over itself along an edge', 'Jog': 'Step the sheet up or down with two bends',
    'Flatten': 'Show the flat pattern with bend lines', 'Flat to DXF': 'Export the flat pattern as DXF', 'Simple Hole': 'Cut a simple hole through the sheet',
    'Insert Components': 'Add a part to the assembly', 'Mate': 'Position components relative to each other (Coincident, Concentric)',
    'Fix': 'Fix the selected component where it is', 'Float': 'Let the selected component move so mates can position it', 'Hide/Show Components': 'Hide the selected component, or show hidden ones'
  };
  function ribbonTitle(id, label, enabled) {
    var key = UI.shortcutFor ? UI.shortcutFor(id) : null, help = RIBBON_HELP[label];
    if (!enabled) return label + ' — not available in this build yet';
    return label + (key ? ' (' + key + ')' : '') + (help ? ' — ' + help : '');
  }
  function ribbonButton(item) {
    var d = item.dyn && item.dyn();
    var id = d ? d.id : item.id, label = d ? d.label : item.label, flat = label.replace('\n', ' ');
    var enabled = !!(item.run || item.tool);
    var b = el('button', { class: 'rb', html: Icons(id, 32) + '<span>' + label + '</span>', title: ribbonTitle(id, flat, enabled), 'aria-label': flat });
    if (!enabled) b.disabled = true;
    if (item.tool) {
      if (App.mode !== 'sketch') { b.disabled = true; b.title = ribbonTitle(id, flat, true) + ' — open a sketch first'; }
      if (App.mode === 'sketch' && App.tool === item.tool) b.classList.add('active');
      b.addEventListener('click', function () { UI.setTool(App.tool === item.tool ? 'select' : item.tool); });
    } else if (item.run) {
      if ((item.id === 'sketch' && App.mode === 'sketch') || (item.active && item.active())) b.classList.add('active');
      b.addEventListener('click', function () { item.run(); refreshRibbon(); });
    }
    return b;
  }
  function refreshRibbon() {
    var bar = $('ribbon-buttons');
    bar.innerHTML = '';
    var set = ribbonSet();
    if (!set[App.ribbonTab]) App.ribbonTab = Object.keys(set)[0];
    (set[App.ribbonTab] || []).forEach(function (item) {
      if (item.sep) { bar.appendChild(el('div', { class: 'rb-sep' })); return; }
      if (item.stack) {
        var st = el('div', { class: 'rb-stack' });
        item.stack.forEach(function (s) { var b = ribbonButton(s); b.innerHTML = Icons(s.id, 18) + '<span>' + s.label + '</span>'; st.appendChild(b); });
        bar.appendChild(st);
        return;
      }
      bar.appendChild(ribbonButton(item));
    });
    var tabs = $('ribbon-tabs');
    tabs.innerHTML = '';
    var tabNames = Object.keys(set), extraTabs = isAsm() ? ['Layout', 'Sketch', 'Markup', 'SOLIDWORKS Add-Ins'] : ['Surfaces', 'Weldments', 'Mold Tools', 'Direct Editing', 'MBD Dimensions'];
    // another document type (drawing.js) may swap the tab set: UI.ribbonTabsFor(names, extra) -> [names, extra]
    if (UI.ribbonTabsFor) { var tf = UI.ribbonTabsFor(tabNames, extraTabs); tabNames = tf[0]; extraTabs = tf[1]; }
    tabNames.forEach(function (name) {
      tabs.appendChild(el('button', { class: 'rtab' + (name === App.ribbonTab ? ' active' : ''), text: name, onclick: function () { setRibbonTab(name); } }));
    });
    extraTabs.forEach(function (name) {
      var t = el('button', { class: 'rtab', text: name, title: 'Not available in this build', style: 'opacity:.5' });
      tabs.appendChild(t);
    });
  }
  function setRibbonTab(name) { App.ribbonTab = name; refreshRibbon(); }

  // ------------------------------------------------------------------ FeatureManager tabs
  var FM_TABS = [['tree', 'tree', 'FeatureManager Design Tree'], ['pm', 'pm', 'PropertyManager'], ['config', 'config', 'ConfigurationManager'], ['dimx', 'dimx', 'DimXpertManager'], ['dispman', 'dispman', 'DisplayManager']];
  function renderFmTabs() {
    var bar = $('fm-tabs');
    bar.innerHTML = '';
    FM_TABS.forEach(function (t) {
      var b = el('button', { html: Icons(t[1], 18), title: t[2], onclick: function () { if (t[0] === 'pm' && !UI.hasPM()) { toast('The PropertyManager opens when a command is active.'); return; } if (t[0] === 'tree' || t[0] === 'config') { if (!UI.hasPM()) setFmTab(t[0]); else toast('Finish or cancel the active command first (✓ or ✗).'); return; } if (t[0] !== 'pm') toast(t[2] + ' is not available in this build.'); } });
      b.dataset.tab = t[0];
      bar.appendChild(b);
    });
    setFmTab('tree');
  }
  // setFmTab('tree' | 'config' | 'pm'): marks the tab and shows its pane. The PropertyManager (ui-commands openPM /
  // closePM) shows and hides #pm and #fm-tree itself; here 'pm' only hides the ConfigurationManager.
  function setFmTab(name) {
    Array.prototype.forEach.call($('fm-tabs').children, function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    App.fmTab = name;
    var cp = $('config-panel');
    if (name === 'tree') { $('fm-tree').hidden = false; if (cp) cp.hidden = true; }
    else if (name === 'config') { $('fm-tree').hidden = true; if (cp) { cp.hidden = false; refreshConfigPanel(); } }
    else if (cp) cp.hidden = true;
  }

  // ------------------------------------------------------------------ feature tree
  var expanded = {};
  var FEATURE_ICON = { sketch: 'sketch', plane: 'planeSmall', extrude: 'extrude', revolve: 'revolve', lpattern: 'lpattern', cpattern: 'cpattern', mirror: 'mirror', chamfer: 'chamfer', fillet: 'fillet', flange: 'bend', jog: 'bend', sweep: 'sweep', loft: 'loft', shell: 'shell' };
  function featureIcon(f) {
    if (f.type === 'extrude') return f.cut ? 'cut' : (f.sheetBase ? 'flange' : 'extrude');
    if (f.type === 'revolve') return f.cut ? 'revolveCut' : 'revolve';
    if (f.type === 'flange') return f.miter ? 'miter' : (f.hem ? 'hem' : 'bend');
    if (f.type === 'jog') return 'jog';
    return FEATURE_ICON[f.type] || 'generic';
  }
  function treeItem(opts) {
    var row = el('div', { class: 'ti' + (opts.cls ? ' ' + opts.cls : '') });
    row.style.paddingLeft = (6 + (opts.depth || 0) * 14) + 'px';
    var tw = el('span', { class: 'tw' + (opts.children ? '' : ' leaf'), text: opts.open ? '▾' : '▸' });
    row.appendChild(tw);
    row.appendChild(el('span', { html: Icons(opts.icon, 16) }));
    row.appendChild(el('span', { class: 'nm', text: opts.name, title: opts.title || opts.name }));
    if (opts.badge) row.appendChild(el('span', { class: 'badge', text: opts.badge }));
    if (opts.children) tw.addEventListener('click', function (e) { e.stopPropagation(); opts.toggle(); });
    return row;
  }
  function refreshTree() {
    if (isAsm()) { refreshAssemblyTree(); return; }
    var tree = $('tree');
    tree.innerHTML = '';
    var m = App.model, filter = ($('tree-filter-input').value || '').toLowerCase();
    var errors = App.build ? App.build.errors : {}, warnings = App.build ? App.build.warnings : {};
    var ac = K.activeConfiguration ? K.activeConfiguration(m) : null;
    var root = treeItem({ icon: 'part', name: m.name + (ac ? ' (' + ac.name + ')' : ''), children: true, open: true, toggle: function () { } });
    root.addEventListener('dblclick', function () { renameInline(root, m.name, function (n) { m.name = n; UI.rebuild(); }); });
    tree.appendChild(root);
    [['folder', 'History'], ['sensor', 'Sensors'], ['annotations', 'Annotations']].forEach(function (s) { tree.appendChild(treeItem({ icon: s[0], name: s[1], depth: 1, cls: 'dim' })); });
    appendEquationsFolder(tree, filter);
    appendBodiesFolder(tree, filter);
    tree.appendChild(treeItem({ icon: 'material', name: (m.materialName || 'Material <not specified>') + '  ·  ' + m.density + ' kg/m³', depth: 1, cls: 'dim' }));
    ['Front', 'Top', 'Right'].forEach(function (r) {
      var row = treeItem({ icon: 'planeSmall', name: r + ' Plane', depth: 1, cls: App.sel && App.sel.kind === 'plane' && App.sel.ref === r ? 'selected' : '' });
      row.addEventListener('click', function () { App.sel = { kind: 'plane', ref: r, plane: K.makePlane(r, 0), name: r + ' Plane' }; App.sel2 = null; UI.updatePlanes(); UI.updateHighlights(); refreshTree(); });
      row.addEventListener('dblclick', function () { UI.newSketchOnPlane(r); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Sketch on ' + r + ' Plane', action: function () { UI.newSketchOnPlane(r); } }, { label: 'Normal To', action: function () { UI.viewNormalTo(K.makePlane(r, 0)); } }, { label: (App.view.showPlanes ? 'Hide' : 'Show') + ' planes', action: function () { App.view.showPlanes = !App.view.showPlanes; UI.updatePlanes(); } }]); });
      tree.appendChild(row);
    });
    tree.appendChild(treeItem({ icon: 'origin', name: 'Origin', depth: 1, cls: 'dim' }));

    function childSketchIds(f) {
      var ids = [];
      if (f.sketch != null) ids.push(f.sketch);
      if (f.profile != null) ids.push(f.profile);
      if (f.path != null && !Array.isArray(f.path)) ids.push(f.path);
      if (f.sketches) ids = ids.concat(f.sketches);
      return ids;
    }
    var consumedBy = {};
    m.features.forEach(function (f) { childSketchIds(f).forEach(function (id) { if (consumedBy[id] == null) consumedBy[id] = f.id; }); });
    m.features.forEach(function (f) {
      if (f.type === 'sketch' && consumedBy[f.id] != null) return; // shown under its feature
      if (filter && f.name.toLowerCase().indexOf(filter) < 0) return;
      var kids = childSketchIds(f).filter(function (id) { return consumedBy[id] === f.id; }).map(function (id) { return K.findFeature(m, id); }).filter(Boolean);
      var isOpen = !!expanded[f.id];
      var row = featureRow(f, 1, kids.length ? { open: isOpen, toggle: function () { expanded[f.id] = !expanded[f.id]; refreshTree(); } } : null, errors, warnings);
      tree.appendChild(row);
      if (kids.length) {
        var box = el('div', { class: 'tc' + (isOpen ? ' open' : '') });
        kids.forEach(function (k) { box.appendChild(featureRow(k, 2, null, errors, warnings)); });
        tree.appendChild(box);
      }
    });
    if (App.sel && (App.sel.kind === 'feature' || App.sel.kind === 'body')) {
      var selRow = tree.querySelector('.ti.selected');
      if (selRow && selRow.scrollIntoViewIfNeeded) selRow.scrollIntoViewIfNeeded();
    }
    refreshConfigPanel();   // every rebuild, undo and load refreshes the tree; keep the ConfigurationManager in step
  }
  // ---- assembly FeatureManager: "Assem1", origin planes, one row per component ("(f) Plate<1>" fixed, "(-) Pin<1>"
  // still free to move, red on a build error) and the Mates folder ("Coincident1 (Plate<1>, Pin<1>)", red with the
  // message in the tooltip when the mate fails, grey when suppressed).
  // DOM: .ti.asm-root, .ti.component-row[data-comp=id], .ti.mates-folder, .ti.mate-row[data-mate=id].
  function refreshAssemblyTree() {
    var tree = $('tree');
    tree.innerHTML = '';
    var m = App.model, filter = ($('tree-filter-input').value || '').toLowerCase();
    var errors = (App.build && App.build.errors) || {};
    var root = treeItem({ icon: 'assembly', name: m.name, children: true, open: true, cls: 'asm-root', toggle: function () { } });
    root.addEventListener('dblclick', function () { renameInline(root, m.name, function (n) { UI.pushUndo(); m.name = n; UI.rebuild(); }); });
    tree.appendChild(root);
    [['folder', 'History'], ['sensor', 'Sensors'], ['annotations', 'Annotations']].forEach(function (s) { tree.appendChild(treeItem({ icon: s[0], name: s[1], depth: 1, cls: 'dim' })); });
    ['Front', 'Top', 'Right'].forEach(function (r) {
      var row = treeItem({ icon: 'planeSmall', name: r + ' Plane', depth: 1, cls: App.sel && App.sel.kind === 'plane' && App.sel.ref === r ? 'selected' : '' });
      row.addEventListener('click', function () { App.sel = { kind: 'plane', ref: r, plane: K.makePlane(r, 0), name: r + ' Plane' }; App.sel2 = null; UI.updatePlanes(); UI.updateHighlights(); refreshTree(); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Normal To', action: function () { UI.viewNormalTo(K.makePlane(r, 0)); } }, { label: (App.view.showPlanes ? 'Hide' : 'Show') + ' planes', action: function () { App.view.showPlanes = !App.view.showPlanes; UI.updatePlanes(); } }]); });
      tree.appendChild(row);
    });
    tree.appendChild(treeItem({ icon: 'origin', name: 'Origin', depth: 1, cls: 'dim' }));
    (m.components || []).forEach(function (c, i) {
      var label = UI.compLabel ? UI.compLabel(c) : c.name;
      if (filter && label.toLowerCase().indexOf(filter) < 0) return;
      var st = UI.compStatus ? UI.compStatus(c.id) : null;
      var err = (st && st.error) || errors[c.id] || null;
      var selected = App.sel && App.sel.kind === 'body' && App.sel.index === i;
      var hidden = isBodyHidden(i);
      var tip = err ? c.name + ': ' + err : c.name + (c.fixed ? ' (fixed)' : st ? (st.underDefined ? ' (under defined: ' + st.dof + ' degree' + (st.dof === 1 ? '' : 's') + ' of freedom left)' : ' (fully defined)') : '') + (hidden ? ' (hidden)' : '');
      var row = treeItem({ icon: err ? 'error' : 'component', name: label, depth: 1, cls: 'component-row' + (selected ? ' selected' : '') + (err ? ' err' : '') + (hidden ? ' hidden' : ''), title: tip });
      row.setAttribute('data-comp', String(c.id));
      row.title = tip;
      row.addEventListener('click', function () { if (UI.selectComponent) UI.selectComponent(c.id); else selectBody(i); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); if (UI.selectComponent) UI.selectComponent(c.id); showMenu(e.clientX, e.clientY, componentMenu(c)); });
      tree.appendChild(row);
    });
    var mates = m.mates || [];
    var shown = mates.filter(function (mt) { return !filter || (UI.mateLabel ? UI.mateLabel(mt) : mt.name).toLowerCase().indexOf(filter) >= 0; });
    var isOpen = expanded.mates == null ? true : !!expanded.mates;
    var anyErr = mates.some(function (mt) { return UI.mateStatus && UI.mateStatus(mt).error && !mt.suppressed; });
    var folder = treeItem({ icon: 'matesFolder', name: 'Mates', depth: 1, cls: 'mates-folder' + (anyErr ? ' err' : '') + (mates.length ? '' : ' dim'), children: mates.length > 0, open: isOpen, title: mates.length + ' mate' + (mates.length === 1 ? '' : 's'), toggle: function () { expanded.mates = !isOpen; refreshTree(); } });
    folder.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, [{ label: 'Add Mate…', action: function () { UI.cmdMate(); } }]); });
    tree.appendChild(folder);
    if (!mates.length) return;
    var box = el('div', { class: 'tc' + (isOpen ? ' open' : '') });
    shown.forEach(function (mt) {
      var st = UI.mateStatus ? UI.mateStatus(mt) : { error: null };
      var err = mt.suppressed ? null : st.error;
      var row = treeItem({ icon: err ? 'error' : (mt.type === 'concentric' ? 'concentric' : 'coincident'), name: UI.mateLabel ? UI.mateLabel(mt) : mt.name, depth: 2, cls: 'mate-row' + (err ? ' err' : '') + (mt.suppressed ? ' suppressed' : '') });
      row.setAttribute('data-mate', String(mt.id));
      row.title = err ? mt.name + ': ' + err : mt.name + (mt.suppressed ? ' (suppressed)' : '') + ' — double-click to edit';
      row.addEventListener('click', function () { setStatus(err ? mt.name + ': ' + err : (UI.mateLabel ? UI.mateLabel(mt) : mt.name) + (mt.suppressed ? ' (suppressed)' : '')); });
      row.addEventListener('dblclick', function (e) { e.stopPropagation(); UI.editMate(mt); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, mateMenu(mt)); });
      box.appendChild(row);
    });
    tree.appendChild(box);
  }
  function asmRun(p) { if (p && p.catch) p.catch(function (e) { toast(e.message || String(e)); }); }
  function componentMenu(c) {
    var i = UI.componentIndex ? UI.componentIndex(c.id) : -1, hidden = i >= 0 && isBodyHidden(i);
    return [
      c.fixed ? { label: 'Float', action: function () { asmRun(UI.asm.fix(c.id, false)); } } : { label: 'Fix', action: function () { asmRun(UI.asm.fix(c.id, true)); } },
      { label: hidden ? 'Show' : 'Hide', action: function () { UI.asm.setHidden(c.id, !hidden); } },
      { label: 'Mass Properties', action: function () { UI.showMassProperties(); } },
      { label: 'Add Mate…', action: function () { UI.cmdMate(); } },
      { sep: true },
      { label: 'Delete', action: function () { UI.confirmRemoveComponent(c); } }
    ];
  }
  function mateMenu(mt) {
    return [
      { label: 'Edit Feature', action: function () { UI.editMate(mt); } },
      mt.suppressed ? { label: 'Unsuppress', action: function () { asmRun(UI.asm.suppressMate(mt.id, false)); } } : { label: 'Suppress', action: function () { asmRun(UI.asm.suppressMate(mt.id, true)); } },
      { sep: true },
      { label: 'Delete', action: function () { UI.confirmRemoveMate(mt); } }
    ];
  }
  // Solid Bodies(n) folder: one row per separate solid (App.build.bodies, described by Kernel.bodyInfo through
  // UI.bodyInfos). Expanded by default on a multi-body part; the user's toggle is remembered in expanded.bodies.
  function isBodyHidden(i) { return UI.isBodyHidden ? !!UI.isBodyHidden(i) : !!(App.hiddenBodies && App.hiddenBodies[i]); }
  function setBodyHidden(i, hidden) {
    if (UI.setBodyHidden) { UI.setBodyHidden(i, hidden); return; }
    App.hiddenBodies = App.hiddenBodies || {};
    if (hidden) App.hiddenBodies[i] = true; else delete App.hiddenBodies[i];
    UI.updateHighlights(); refreshTree();
  }
  function selectBody(i) {
    if (typeof UI.selectBody === 'function') UI.selectBody(i);
    else if (UI.selectBodyRow) UI.selectBodyRow(i);
    else { App.sel = { kind: 'body', index: i }; App.sel2 = null; UI.updateHighlights(); refreshTree(); }
  }
  function bodyTitle(b) { return UI.bodyTitle ? UI.bodyTitle(b) : b.name + ': volume ' + UI.fmtNum(b.volume, 2) + ' ' + UI.unitLabel() + '³'; }
  function bodyMenu(b) {
    var hidden = isBodyHidden(b.index);
    var items = [
      { label: hidden ? 'Show' : 'Hide', action: function () { setBodyHidden(b.index, !hidden); } },
      { label: 'Mass Properties', action: function () { UI.showMassProperties(); } }
    ];
    // Zoom to Selection frames just this body when ui-core has UI.zoomToBody, else the whole model
    if (UI.zoomToBody || UI.zoomToFit) items.push({ label: 'Zoom to Selection', action: function () { if (!(UI.zoomToBody && UI.zoomToBody(b.index)) && UI.zoomToFit) UI.zoomToFit(); } });
    if (b.featureId != null && K.findFeature(App.model, b.featureId)) {
      items.push({ sep: true });
      items.push({ label: 'Edit Feature', action: function () { UI.editFeature(K.findFeature(App.model, b.featureId)); } });
    }
    return items;
  }
  function appendBodiesFolder(tree, filter) {
    var infos = [];
    try { infos = UI.bodyInfos ? UI.bodyInfos() : []; } catch (e) { infos = []; }
    var isOpen = expanded.bodies == null ? infos.length > 1 : !!expanded.bodies;
    var shown = infos.filter(function (b) { return !filter || b.name.toLowerCase().indexOf(filter) >= 0; });
    if (filter && shown.length) isOpen = true;   // a filter hit inside the folder opens it
    var folder = treeItem({ icon: 'folder', name: 'Solid Bodies(' + infos.length + ')', depth: 1, cls: 'bodies-folder' + (infos.length ? '' : ' dim'), children: infos.length > 0, open: isOpen, toggle: function () { expanded.bodies = !isOpen; refreshTree(); } });
    folder.addEventListener('click', function () { if (infos.length) { expanded.bodies = !isOpen; refreshTree(); } });
    tree.appendChild(folder);
    if (!infos.length) return;
    var box = el('div', { class: 'tc' + (isOpen ? ' open' : '') });
    shown.forEach(function (b) {
      var selected = App.sel && App.sel.kind === 'body' && App.sel.index === b.index;
      var hidden = isBodyHidden(b.index);
      var row = treeItem({ icon: 'body', name: b.name, depth: 2, cls: 'body-row' + (selected ? ' selected' : '') + (hidden ? ' hidden' : ''), title: bodyTitle(b) + (hidden ? ' (hidden)' : '') });
      row.setAttribute('data-body', String(b.index));
      row.title = bodyTitle(b) + (hidden ? ' (hidden)' : '');
      row.addEventListener('click', function () { selectBody(b.index); if (typeof UI.selectBody !== 'function') setStatus(bodyTitle(b)); });
      row.addEventListener('dblclick', function (e) { e.stopPropagation(); var f = b.featureId != null ? K.findFeature(App.model, b.featureId) : null; if (f) UI.editFeature(f); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); selectBody(b.index); setStatus(bodyTitle(b)); showMenu(e.clientX, e.clientY, bodyMenu(b)); });
      box.appendChild(row);
    });
    tree.appendChild(box);
  }
  // Equations folder (SolidWorks shows it near the top of the tree once the part has global variables): one
  // "T = 10" row per model.equations entry; double-click opens Tools ▸ Equations. Open by default.
  function appendEquationsFolder(tree, filter) {
    var list = currentEquations();   // with the active configuration's values
    if (!list.length) return;
    var vars = (App.build && App.build.equations) || {}, errs = (App.build && App.build.equationErrors) || {};
    var shown = list.filter(function (q) { return !filter || String(q.name).toLowerCase().indexOf(filter) >= 0; });
    var isOpen = expanded.equations == null ? true : !!expanded.equations;
    if (filter && shown.length) isOpen = true;
    var anyErr = list.some(function (q) { return errs[q.name]; });
    var folder = treeItem({ icon: 'equations', name: 'Equations', depth: 1, cls: 'eq-folder' + (anyErr ? ' err' : ''), children: true, open: isOpen, title: list.length + ' global variable' + (list.length === 1 ? '' : 's') + (K.activeConfiguration && K.activeConfiguration(App.model) ? ' (configuration ' + K.activeConfiguration(App.model).name + ')' : '') + ' — double-click to manage', toggle: function () { expanded.equations = !isOpen; refreshTree(); } });
    folder.addEventListener('dblclick', function (e) { e.stopPropagation(); showEquations(); });
    folder.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, [{ label: 'Manage Equations…', action: showEquations }]); });
    tree.appendChild(folder);
    var box = el('div', { class: 'tc' + (isOpen ? ' open' : '') });
    shown.forEach(function (q) {
      var err = errs[q.name], val = vars[q.name];
      var plain = /^\s*[-+]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(String(q.expr));
      var row = treeItem({ icon: err ? 'error' : 'equations', name: q.name + ' = ' + q.expr + (!err && !plain && val != null ? '  (' + UI.fmtNum(val, 4) + ')' : ''), depth: 2, cls: 'eq-row' + (err ? ' err' : ''), title: err ? q.name + ': ' + err : q.name + ' = ' + q.expr + (val != null ? ' = ' + val : '') });
      row.setAttribute('data-eq', String(q.name));
      row.addEventListener('dblclick', function (e) { e.stopPropagation(); showEquations(q.name); });
      row.addEventListener('click', function () { setStatus(err ? q.name + ': ' + err : q.name + ' = ' + q.expr + (val != null ? ' = ' + UI.fmtNum(val, 6) : '')); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, [{ label: 'Manage Equations…', action: function () { showEquations(q.name); } }]); });
      box.appendChild(row);
    });
    tree.appendChild(box);
  }
  function featureRow(f, depth, kids, errors, warnings) {
    var err = errors[f.id], warn = warnings[f.id];
    var selected = App.sel && App.sel.kind === 'feature' && App.sel.id === f.id;
    var active = App.activeSketch === f.id;
    var row = treeItem({ icon: err ? 'error' : (warn ? 'warn' : featureIcon(f)), name: f.name + (active ? '  (editing)' : ''), depth: depth, children: !!kids, open: kids && kids.open, toggle: kids && kids.toggle, cls: (selected ? 'selected' : '') + (err ? ' err' : '') + (warn ? ' warn' : ''), title: err || warn || featureTitle(f), badge: f.type === 'sketch' && f.entities ? f.entities.length + ' ent.' : '' });
    row.addEventListener('click', function () { App.sel = { kind: 'feature', id: f.id }; App.sel2 = null; UI.updateHighlights(); UI.updateSketches(); refreshTree(); if (UI.onSelectionChanged) UI.onSelectionChanged(); setStatus(f.name + (err ? ': ' + err : '')); });
    row.addEventListener('dblclick', function (e) { e.stopPropagation(); UI.editFeature(f); });
    row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); App.sel = { kind: 'feature', id: f.id }; UI.updateHighlights(); refreshTree(); showMenu(e.clientX, e.clientY, featureMenu(f)); });
    return row;
  }
  function featureTitle(f) {
    switch (f.type) {
      case 'extrude': return (f.cut ? 'Cut' : 'Boss') + ' extrude, ' + (f.end === 'through' ? 'through all' : f.end === 'mid' ? 'mid plane ' + f.depth : 'blind ' + f.depth) + (f.draft ? ', draft ' + f.draft + '°' + (f.draftOut ? ' outward' : '') : '') + (f.normalCut ? ', normal cut' : '');
      case 'revolve': return (f.cut ? 'Cut' : 'Boss') + ' revolve ' + f.angle + '°';
      case 'lpattern': return 'Linear pattern ' + f.n1 + ' × ' + f.s1 + ' along ' + f.d1 + (f.d2 ? ', ' + f.n2 + ' × ' + f.s2 + ' along ' + f.d2 : '');
      case 'cpattern': return 'Circular pattern ' + f.n + ' about ' + f.axis;
      case 'mirror': return 'Mirror about ' + f.plane + (f.body ? ' (body)' : '');
      case 'plane': return 'Plane parallel to ' + f.ref + ' at ' + f.offset;
      case 'chamfer': return 'Chamfer ' + f.d + ' on ' + (f.edges || []).length + ' edge pick' + ((f.edges || []).length === 1 ? '' : 's');
      case 'fillet': return 'Fillet R' + f.r + ' on ' + (f.edges || []).length + ' edge pick' + ((f.edges || []).length === 1 ? '' : 's');
      case 'jog': return 'Jog ' + f.height + ' high, ' + f.length + ' flat, ' + f.angle + '°, ' + (f.edges || []).length + ' edge' + ((f.edges || []).length === 1 ? '' : 's');
      case 'flange': return (f.hem ? 'Hem gap ' + Math.round(f.radius * 2 * 1e4) / 1e4 + ', ' : f.miter ? 'Miter flange ' : 'Edge flange ') + f.length + ' long, ' + f.angle + '°, ' + (f.edges || []).length + ' edge' + ((f.edges || []).length === 1 ? '' : 's') + (f.position === 'inside' ? ', material inside' : f.position === 'outside' ? ', material outside' : '') +
        (f.miter ? ', mitred' + (f.miterGap > 0 ? ' (gap ' + f.miterGap + ')' : '') : '') + (f.relief && f.relief !== 'none' ? ', relief ' + (f.relief === 'rect' ? 'rectangle' : f.relief) : '');
      case 'shell': return 'Shell, walls ' + f.thickness + ' thick, ' + ((f.faces || []).length ? (f.faces || []).length + ' face' + ((f.faces || []).length === 1 ? '' : 's') + ' removed' : 'closed');
      case 'sweep': return (f.cut ? 'Cut' : 'Boss') + ' sweep along ' + (Array.isArray(f.path) ? f.path.length + ' points' : 'a path sketch');
      case 'loft': return (f.cut ? 'Cut' : 'Boss') + ' loft through ' + (f.sketches || []).length + ' sections';
      case 'sketch': return 'Sketch on ' + (f.plane.custom ? 'face' : f.plane.featureId != null ? 'Plane' + f.plane.featureId : f.plane.ref + (f.plane.offset ? ' + ' + f.plane.offset : ''));
    }
    return f.type;
  }
  function featureMenu(f) {
    var items = [];
    if (f.type === 'sketch') items.push({ label: 'Edit Sketch', action: function () { UI.editSketch(f.id); } });
    else items.push({ label: 'Edit Feature', action: function () { UI.editFeature(f); } });
    if (f.sketch != null) items.push({ label: 'Edit Sketch', action: function () { UI.editSketch(f.sketch); } });
    if (f.type === 'sketch') items.push({ label: 'Export sketch as DXF', action: function () { UI.exportSketchDXF(f); } });
    if (f.type === 'sketch') items.push({ label: f.hidden ? 'Show' : 'Hide', action: function () { f.hidden = !f.hidden; UI.updateSketches(); } });
    items.push({ label: 'Rename (F2)', action: function () { startRename(f); } });
    items.push({ sep: true });
    items.push({ label: 'Delete', action: function () { UI.deleteFeature(f.id); } });
    return items;
  }
  function startRename(f) {
    var rows = Array.prototype.filter.call($('tree').querySelectorAll('.ti'), function (r) { return r.querySelector('.nm') && r.querySelector('.nm').textContent.indexOf(f.name) === 0; });
    var row = rows[0];
    if (!row) return;
    renameInline(row, f.name, function (n) { UI.pushUndo(); f.name = n; refreshTree(); });
  }
  function renameInline(row, current, done) {
    var nm = row.querySelector('.nm');
    var inp = el('input', { type: 'text', value: current });
    nm.replaceWith(inp);
    inp.focus(); inp.select();
    var finished = false;
    function finish(ok) {
      if (finished) return;
      finished = true;
      var v = inp.value.trim();
      inp.replaceWith(nm);
      if (ok && v && v !== current) done(v); else refreshTree();
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); e.stopPropagation(); });
    inp.addEventListener('blur', function () { finish(true); });
  }
  $('tree-filter-input').addEventListener('input', refreshTree);

  // ------------------------------------------------------------------ menus (popup + menu bar)
  var openMenu = null;
  function closeMenus() {
    if (openMenu) { openMenu.remove(); openMenu = null; }
    Array.prototype.forEach.call(document.querySelectorAll('#menus > li.open'), function (li) { li.classList.remove('open'); });
  }
  function showMenu(x, y, items, anchorLi) {
    closeMenus();
    var m = el('div', { class: 'menu' });
    items.forEach(function (it) {
      if (it.sep) { m.appendChild(el('div', { class: 'sep' })); return; }
      var row = el('div', { class: 'mi' + (it.disabled ? ' disabled' : '') });
      row.appendChild(el('span', { class: 'chk', text: it.checked ? '✓' : '' }));
      row.appendChild(el('span', { text: it.label }));
      if (it.key) row.appendChild(el('span', { class: 'key', text: it.key }));
      if (!it.disabled) row.addEventListener('click', function () { closeMenus(); it.action(); });
      m.appendChild(row);
    });
    document.body.appendChild(m);
    var mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.min(x, window.innerWidth - mw - 4) + 'px';
    m.style.top = Math.min(y, window.innerHeight - mh - 4) + 'px';
    openMenu = m;
    if (anchorLi) anchorLi.classList.add('open');
  }
  document.addEventListener('mousedown', function (e) { if (openMenu && !openMenu.contains(e.target) && !(e.target.closest && e.target.closest('#menus'))) closeMenus(); });

  // UI.menuHook(menus) -> menus lets another document type (drawing.js) add or replace menu items
  function MENUS() { var m = partMenus(); return UI.menuHook ? UI.menuHook(m) : m; }
  function partMenus() {
    var v = App.view;
    return [
      { label: 'File', items: [
        { label: 'New…', key: 'Ctrl+N', action: UI.fileNew },
        { label: 'New ▸ Part', action: function () { UI.newPart(); } },
        { label: 'New ▸ Assembly', action: function () { UI.newAssembly(); } },
        { label: 'Open…', key: 'Ctrl+O', action: UI.fileOpen },
        { label: 'Save', key: 'Ctrl+S', action: UI.fileSave },
        { label: 'Save As…', action: UI.fileSaveAs },
        { sep: true },
        { label: 'Export STL…', action: UI.exportSTL },
        { label: 'Export selected face as DXF…', action: UI.exportFaceDXF },
        { label: 'Export sketch as DXF…', action: function () { UI.exportSketchDXF(); } },
        { label: 'Export model as script…', action: UI.exportScript },
        { label: 'Export model as JSON…', action: UI.fileSaveAs },
        { sep: true },
        { label: 'Screenshot (PNG)…', action: UI.screenshot },
        { label: 'Properties…', action: function () { UI.openTaskPane('props'); } }
      ] },
      { label: 'Edit', items: [
        { label: 'Undo', key: 'Ctrl+Z', action: UI.undo, disabled: !App.undo.length },
        { label: 'Redo', key: 'Ctrl+Y', action: UI.redo, disabled: !App.redo.length },
        { sep: true },
        { label: 'Delete', key: 'Del', action: UI.deleteSelection, disabled: !App.sel },
        { label: 'Rebuild', key: 'Ctrl+B', action: function () { UI.rebuild().then(function () { toast('Rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms'); }); } },
        { label: 'Rebuild in background (Web Worker)', checked: App.workerOn, action: function () { UI.setWorkerOn(!App.workerOn); toast(App.workerOn ? 'Rebuilds run in a Web Worker' : 'Rebuilds run on the main thread'); } },
        { label: 'Clear selection', key: 'Esc', action: function () { App.sel = null; App.sel2 = null; UI.updateHighlights(); refreshTree(); } }
      ] },
      { label: 'View', items: [
        { label: 'Zoom to Fit', key: 'F', action: UI.zoomToFit },
        { label: 'Zoom to Area', action: function () { App.zoomAreaMode = true; refreshHud(); } },
        { label: 'Previous View', key: 'Shift+Ctrl+Z', action: UI.previousView },
        { sep: true },
        { label: 'Front', key: 'Ctrl+1', action: function () { UI.setView('Front'); } },
        { label: 'Back', key: 'Ctrl+2', action: function () { UI.setView('Back'); } },
        { label: 'Left', key: 'Ctrl+3', action: function () { UI.setView('Left'); } },
        { label: 'Right', key: 'Ctrl+4', action: function () { UI.setView('Right'); } },
        { label: 'Top', key: 'Ctrl+5', action: function () { UI.setView('Top'); } },
        { label: 'Bottom', key: 'Ctrl+6', action: function () { UI.setView('Bottom'); } },
        { label: 'Isometric', key: 'Ctrl+7', action: function () { UI.setView('Isometric'); } },
        { label: 'Normal To', key: 'Ctrl+8', action: normalToSelection },
        { sep: true },
        { label: 'Shaded With Edges', checked: v.style === 'shadedEdges', action: function () { setStyle('shadedEdges'); } },
        { label: 'Shaded', checked: v.style === 'shaded', action: function () { setStyle('shaded'); } },
        { label: 'Hidden Lines Removed', checked: v.style === 'hlr', action: function () { setStyle('hlr'); } },
        { label: 'Wireframe', checked: v.style === 'wireframe', action: function () { setStyle('wireframe'); } },
        { sep: true },
        { label: 'Planes', checked: v.showPlanes, action: function () { v.showPlanes = !v.showPlanes; UI.updatePlanes(); } },
        { label: 'Origins', checked: v.showOrigin, action: function () { v.showOrigin = !v.showOrigin; UI.updateOrigin(); } },
        { label: 'All Sketches', checked: v.showSketches, action: function () { v.showSketches = !v.showSketches; UI.updateSketches(); } },
        { label: 'Sketch Grid', checked: v.showGrid, action: function () { v.showGrid = !v.showGrid; App.gridStale = true; } },
        { label: 'Sketch Dimensions', checked: v.showDims, action: function () { v.showDims = !v.showDims; App.dimsStale = true; UI.setStatus(v.showDims ? 'Driven dimensions shown on every sketch entity. Click a value to change it.' : 'Only placed dimensions are shown.'); } },
        { label: 'Section View', checked: !!v.section, action: UI.cmdSection },
        { sep: true },
        { label: 'Theme ▸ Light', checked: UI.theme() === 'light', action: function () { UI.setTheme('light'); toast('Light theme'); } },
        { label: 'Theme ▸ Dark', checked: UI.theme() === 'dark', action: function () { UI.setTheme('dark'); toast('Dark theme'); } }
      ] },
      { label: 'Insert', items: isAsm() ? [
        { label: 'Component ▸ Existing Part…', action: function () { UI.cmdInsertComponent(); } },
        { label: 'Mate…', action: function () { UI.cmdMate(); } }
      ] : [
        { label: 'Boss/Base ▸ Extrude', action: function () { UI.cmdExtrude(false); } },
        { label: 'Boss/Base ▸ Revolve', action: function () { UI.cmdRevolve(false); } },
        { label: 'Boss/Base ▸ Sweep', action: function () { UI.cmdSweep(false); } },
        { label: 'Boss/Base ▸ Loft', action: function () { UI.cmdLoft(false); } },
        { label: 'Cut ▸ Extrude', action: function () { UI.cmdExtrude(true); } },
        { label: 'Cut ▸ Revolve', action: function () { UI.cmdRevolve(true); } },
        { label: 'Cut ▸ Sweep', action: function () { UI.cmdSweep(true); } },
        { label: 'Cut ▸ Loft', action: function () { UI.cmdLoft(true); } },
        { label: 'Features ▸ Hole Wizard', action: UI.cmdHole },
        { label: 'Features ▸ Fillet', action: function () { UI.cmdFillet(); } },
        { label: 'Features ▸ Chamfer', action: function () { UI.cmdChamfer(); } },
        { label: 'Features ▸ Shell', action: function () { UI.cmdShell(); } },
        { sep: true },
        { label: 'Pattern/Mirror ▸ Linear Pattern', action: function () { UI.cmdLinearPattern(); } },
        { label: 'Pattern/Mirror ▸ Circular Pattern', action: function () { UI.cmdCircularPattern(); } },
        { label: 'Pattern/Mirror ▸ Mirror', action: function () { UI.cmdMirror(); } },
        { sep: true },
        { label: 'Sketch', action: UI.cmdSketch },
        { label: 'Reference Geometry ▸ Plane', action: function () { UI.cmdPlane(); } },
        { label: 'Sheet Metal ▸ Base Flange', action: UI.cmdBaseFlange },
        { label: 'Sheet Metal ▸ Edge Flange', action: function () { UI.cmdEdgeFlange(); } },
        { label: 'Sheet Metal ▸ Miter Flange', action: function () { UI.cmdMiterFlange(); } },
        { label: 'Sheet Metal ▸ Hem', action: function () { UI.cmdHem(); } },
        { label: 'Sheet Metal ▸ Jog', action: function () { UI.cmdJog(); } },
        { label: 'Sheet Metal ▸ Flatten', action: function () { UI.cmdFlatten(); } }
      ] },
      { label: 'Tools', items: [
        { label: 'Macro ▸ Run script…', action: function () { UI.openTaskPane('macro'); } },
        { label: 'Measure', action: UI.cmdMeasure },
        { label: 'Mass Properties', action: UI.showMassProperties },
        { label: 'Equations…', action: function () { if (isAsm()) toast('Equations belong to parts: open the part to edit them.'); else showEquations(); }, disabled: isAsm() },
        { sep: true },
        { label: 'Units: millimeters (MMGS)', checked: App.model.units !== 'in', action: function () { App.model.units = 'mm'; UI.rebuild(); } },
        { label: 'Units: inches (IPS)', checked: App.model.units === 'in', action: function () { App.model.units = 'in'; UI.rebuild(); } },
        { label: 'Options…', action: function () { UI.openTaskPane('props'); } }
      ] },
      { label: 'Window', items: [
        { label: 'Task Pane', checked: !$('tp-panel').hidden, action: function () { if ($('tp-panel').hidden) UI.openTaskPane('home'); else UI.closeTaskPane(); } },
        { label: 'Background: gradient', checked: v.bg === 'gradient', action: function () { setBg('gradient'); } },
        { label: 'Background: white', checked: v.bg === 'white', action: function () { setBg('white'); } },
        { label: 'Background: dark', checked: v.bg === 'dark', action: function () { setBg('dark'); } }
      ] },
      { label: 'Help', items: [
        { label: 'Scripting reference', action: function () { UI.openTaskPane('macro'); } },
        { label: 'Keyboard shortcuts', action: UI.showShortcuts },
        { label: 'About Anvil', action: UI.showAbout }
      ] }
    ];
  }
  function renderMenuBar() {
    var ul = $('menus');
    ul.innerHTML = '';
    MENUS().forEach(function (menu, i) {
      var li = el('li', { text: menu.label });
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        if (li.classList.contains('open')) { closeMenus(); return; }
        var r = li.getBoundingClientRect();
        showMenu(r.left, r.bottom, MENUS()[i].items, li);
      });
      li.addEventListener('mouseenter', function () { if (openMenu && !li.classList.contains('open') && document.querySelector('#menus > li.open')) { var r = li.getBoundingClientRect(); showMenu(r.left, r.bottom, MENUS()[i].items, li); } });
      ul.appendChild(li);
    });
  }
  function setStyle(s) { App.view.style = s; UI.applyDisplayStyle(); refreshHud(); }
  function setBg(b) { App.view.bg = b; UI.viewport.className = b === 'gradient' ? '' : 'bg-' + b; }
  function normalToSelection() {
    if (App.sel && App.sel.kind === 'face' && App.mesh) { var f = App.mesh.faces[App.sel.index]; UI.viewNormalTo(K.planeFromFace(f.normal, f.centroid)); }
    else if (App.sel && App.sel.kind === 'plane') UI.viewNormalTo(App.sel.plane || K.makePlane(App.sel.ref, 0));
    else if (App.sel && App.sel.kind === 'edge') {
      // look along the mean normal of the edge's faces with the edge horizontal
      var e = App.sel.edge, V = UI.V, n = V.norm(e.normals.reduce(function (s, q) { return V.add(s, q); }, [0, 0, 0]));
      if (V.len(n) < 1e-6) n = e.normals[0];
      var x = V.norm(V.sub(e.dir, V.scale(n, V.dot(e.dir, n))));
      UI.viewNormalTo({ origin: e.mid, x: x, y: V.cross(n, x), n: n });
    }
    else if (App.mode === 'sketch') UI.viewNormalTo(UI.activePlane());
    else toast('Select a face or plane first.');
  }

  // ------------------------------------------------------------------ heads-up view toolbar
  function refreshHud() {
    var hud = $('hud');
    hud.innerHTML = '';
    function btn(icon, title, action, active, caret) {
      var b = el('button', { html: Icons(icon, 22) + (caret ? '<span class="caret">▾</span>' : ''), title: title, onclick: action });
      if (active) b.classList.add('active');
      hud.appendChild(b);
      return b;
    }
    function dd(icon, title, items) { var b = btn(icon, title, function () { var r = b.getBoundingClientRect(); showMenu(r.left, r.bottom + 2, items); }, false, true); }
    btn('fit', 'Zoom to Fit (F)', UI.zoomToFit);
    btn('zoomArea', 'Zoom to Area', function () { App.zoomAreaMode = !App.zoomAreaMode; refreshHud(); }, App.zoomAreaMode);
    btn('prevView', 'Previous View', UI.previousView);
    btn('section', 'Section View', UI.cmdSection, !!App.view.section);
    hud.appendChild(el('span', { class: 'sep' }));
    dd('orient', 'View Orientation', Object.keys(UI.VIEWS).map(function (n) { return { label: n, action: function () { UI.setView(n); } }; }).concat([{ sep: true }, { label: 'Normal To (Ctrl+8)', action: normalToSelection }]));
    dd('display', 'Display Style', [['shadedEdges', 'Shaded With Edges'], ['shaded', 'Shaded'], ['hlr', 'Hidden Lines Removed'], ['wireframe', 'Wireframe']].map(function (s) { return { label: s[1], checked: App.view.style === s[0], action: function () { setStyle(s[0]); } }; }));
    dd('hideshow', 'Hide/Show Items', [
      { label: 'Planes', checked: App.view.showPlanes, action: function () { App.view.showPlanes = !App.view.showPlanes; UI.updatePlanes(); } },
      { label: 'Origins', checked: App.view.showOrigin, action: function () { App.view.showOrigin = !App.view.showOrigin; UI.updateOrigin(); } },
      { label: 'Sketches', checked: App.view.showSketches, action: function () { App.view.showSketches = !App.view.showSketches; UI.updateSketches(); } },
      { label: 'Sketch grid', checked: App.view.showGrid, action: function () { App.view.showGrid = !App.view.showGrid; App.gridStale = true; } }
    ]);
    hud.appendChild(el('span', { class: 'sep' }));
    btn('appearance', 'Edit Appearance', function () { UI.openTaskPane('appearance'); });
    dd('scene', 'Apply Scene', [['gradient', 'Studio gradient'], ['white', 'Plain white'], ['dark', 'Dark room']].map(function (s) { return { label: s[1], checked: App.view.bg === s[0], action: function () { setBg(s[0]); } }; }));
    btn('settings', 'View Settings', function () { UI.openTaskPane('props'); });
  }

  // ------------------------------------------------------------------ modal
  function showModal(opts) {
    $('modal-title').innerHTML = '';
    $('modal-title').appendChild(el('span', { text: opts.title }));
    $('modal-title').appendChild(el('button', { text: '✕', title: 'Close', onclick: closeModal }));
    var body = $('modal-body');
    body.innerHTML = '';
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else body.appendChild(opts.body);
    var btns = $('modal-buttons');
    btns.innerHTML = '';
    (opts.buttons || [{ label: 'Close', primary: true, action: closeModal }]).forEach(function (b) {
      var bt = el('button', { class: 'btn' + (b.primary ? ' primary' : ''), text: b.label, onclick: function () { if (b.action) b.action(); if (b.close !== false && !b.action) closeModal(); } });
      if (b.id) bt.id = b.id;
      btns.appendChild(bt);
    });
    $('modal').hidden = false;
    var first = body.querySelector('textarea, input, button');
    if (first) first.focus();
  }
  function closeModal() { $('modal').hidden = true; $('modal-card').classList.remove('wide'); }

  // ------------------------------------------------------------------ Tools ▸ Equations
  // "Equations, Global Variables, and Dimensions": edits a working copy of model.equations ([{ name, expr }], in
  // order, each may use the ones above it; expr is stored without the leading "="). Every keystroke re-evaluates the
  // whole list with Kernel.resolveEquations and shows the value, or the error in red, per row. OK applies the list as
  // one undoable change and rebuilds (setEquations); Cancel discards it.
  // DOM: #eq-dialog, table #eq-table, rows tr.eq-row[data-index] with input.eq-name, input.eq-expr, td.eq-val (.err),
  // buttons .eq-up / .eq-down / .eq-del; #eq-add adds a row; #eq-msg; modal buttons #eq-ok and #eq-cancel.
  // Normalise any accepted form to [{ name, expr }]: a list of { name, expr|value }, or an object { T: 10, W: '=T*2' }.
  function normalizeEquations(spec) {
    var out = [];
    function exprText(v) { return v == null ? '' : String(v).replace(/^\s*=\s*/, '').trim(); }
    if (Array.isArray(spec)) spec.forEach(function (q) { if (q && q.name != null && String(q.name).trim() !== '') out.push({ name: String(q.name).trim(), expr: exprText(q.expr != null ? q.expr : q.value) }); });
    else if (spec && typeof spec === 'object') Object.keys(spec).forEach(function (k) { out.push({ name: k, expr: exprText(spec[k]) }); });
    return out;
  }
  // currentEquations() -> [{ name, expr }] as the model resolves them now (the active configuration's values applied)
  function currentEquations() {
    if (K.effectiveEquations) return normalizeEquations(K.effectiveEquations(App.model));
    return normalizeEquations(App.model.equations || []);
  }
  // setEquations(list) -> the rebuild Promise. An empty list removes model.equations. With a configuration active,
  // Kernel.applyEquations writes a variable that configuration sets into it only; everything else goes to the base.
  function setEquations(spec) {
    var list = normalizeEquations(spec);
    UI.pushUndo();
    if (K.applyEquations) K.applyEquations(App.model, list);
    else if (list.length) App.model.equations = list; else delete App.model.equations;
    return UI.afterRebuild(UI.rebuild(), function () { refreshTree(); refreshStatus(); });
  }
  function evaluateEquations(list) {
    if (!K.resolveEquations) return { vars: {}, errors: {} };
    try { return K.resolveEquations({ equations: list }); } catch (e) { return { vars: {}, errors: {} }; }
  }
  function showEquations(focusName) {
    var rows = currentEquations();
    var acfg = K.activeConfiguration ? K.activeConfiguration(App.model) : null;
    var wrap = el('div', { id: 'eq-dialog' });
    if (acfg) wrap.appendChild(el('p', { id: 'eq-config', class: 'eq-config', text: 'Configuration: ' + acfg.name, title: 'Values of variables this configuration sets are changed in it only; the other configurations keep theirs.' }));
    var table = el('table', { id: 'eq-table', class: 'eq-table' });
    table.appendChild(el('thead', {}, [el('tr', {}, [el('th', { text: 'Name' }), el('th', { text: 'Value / Equation' }), el('th', { text: 'Evaluates to' }), el('th', { text: '' })])]));
    var tbody = el('tbody');
    table.appendChild(tbody);
    var msg = el('div', { id: 'eq-msg', class: 'eq-msg' });
    var help = el('p', { class: 'eq-help', html: 'Global variables are evaluated top to bottom; each may use the ones above it. Use them in any PropertyManager number field by typing <kbd>=</kbd>, e.g. <kbd>=T*2</kbd>. Operators <kbd>+ - * / ^</kbd>, parentheses, <kbd>pi</kbd>, and functions such as <kbd>sqrt()</kbd>, <kbd>sind()</kbd>, <kbd>min()</kbd>, <kbd>max()</kbd>.' });
    var addBtn = el('button', { id: 'eq-add', class: 'btn', text: '+ Add global variable', onclick: function () { rows.push({ name: nextName(), expr: '0' }); render(rows.length - 1, 'name'); } });
    wrap.appendChild(table);
    wrap.appendChild(el('div', { class: 'eq-bar' }, [addBtn, msg]));
    wrap.appendChild(help);
    function nextName() {
      var used = {}; rows.forEach(function (q) { used[q.name] = true; });
      for (var i = 1; ; i++) if (!used['D' + i]) return 'D' + i;
    }
    function evaluate() {
      var live = rows.filter(function (q) { return q.name !== '' || q.expr !== ''; });
      var r = evaluateEquations(live);
      var bad = 0;
      Array.prototype.forEach.call(tbody.querySelectorAll('tr.eq-row'), function (tr) {
        var q = rows[+tr.getAttribute('data-index')], td = tr.querySelector('.eq-val');
        var err = null;
        if (q.name === '' && q.expr === '') err = null;
        else if (q.name === '') err = 'Enter a name';
        else if (q.expr === '') err = 'Enter a value or equation';
        else if (r.errors[q.name]) err = r.errors[q.name];
        else if (r.vars[q.name] == null) err = 'Not evaluated';
        td.classList.toggle('err', !!err);
        tr.classList.toggle('err', !!err);
        td.textContent = err ? err : (q.name === '' ? '' : UI.fmtNum(r.vars[q.name], 6));
        td.title = err || '';
        if (err) bad++;
      });
      msg.textContent = bad ? bad + ' equation' + (bad === 1 ? '' : 's') + ' with errors' : (rows.length ? rows.length + ' global variable' + (rows.length === 1 ? '' : 's') : 'No global variables yet');
      msg.classList.toggle('err', bad > 0);
      return bad;
    }
    function render(focusIndex, focusField) {
      tbody.innerHTML = '';
      rows.forEach(function (q, i) {
        var tr = el('tr', { class: 'eq-row', 'data-index': String(i) });
        var name = el('input', { type: 'text', class: 'eq-name', spellcheck: 'false', 'aria-label': 'Name' });
        name.value = q.name;
        var expr = el('input', { type: 'text', class: 'eq-expr', spellcheck: 'false', 'aria-label': 'Value or equation' });
        expr.value = q.expr === '' ? '' : '= ' + q.expr;
        name.addEventListener('input', function () { q.name = name.value.trim(); evaluate(); });
        expr.addEventListener('input', function () { q.expr = expr.value.replace(/^\s*=\s*/, '').trim(); evaluate(); });
        [name, expr].forEach(function (inp) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyAndClose(); } else if (e.key !== 'Escape') e.stopPropagation(); }); });
        var tools = el('td', { class: 'eq-tools' }, [
          el('button', { class: 'eq-up', title: 'Move up', text: '▲', onclick: function () { if (i > 0) { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); render(i - 1, 'name'); } } }),
          el('button', { class: 'eq-down', title: 'Move down', text: '▼', onclick: function () { if (i < rows.length - 1) { rows.splice(i + 1, 0, rows.splice(i, 1)[0]); render(i + 1, 'name'); } } }),
          el('button', { class: 'eq-del', title: 'Delete', text: '✕', onclick: function () { rows.splice(i, 1); render(Math.min(i, rows.length - 1), 'name'); } })
        ]);
        if (i === 0) tools.firstChild.disabled = true;
        if (i === rows.length - 1) tools.children[1].disabled = true;
        tr.appendChild(el('td', {}, [name]));
        tr.appendChild(el('td', {}, [expr]));
        tr.appendChild(el('td', { class: 'eq-val' }));
        tr.appendChild(tools);
        tbody.appendChild(tr);
      });
      evaluate();
      if (focusIndex != null && focusIndex >= 0) {
        var t = tbody.querySelectorAll('tr.eq-row')[focusIndex];
        var inp = t && t.querySelector(focusField === 'expr' ? '.eq-expr' : '.eq-name');
        if (inp) setTimeout(function () { inp.focus(); inp.select(); }, 0);
      }
    }
    function applyAndClose() {
      if (evaluate()) { msg.textContent = 'Fix the equations shown in red first.'; msg.classList.add('err'); return null; }
      var list = rows.filter(function (q) { return q.name !== '' && q.expr !== ''; }).map(function (q) { return { name: q.name, expr: q.expr }; });
      var before = JSON.stringify(currentEquations());
      closeModal();
      if (JSON.stringify(list) === before) return UI.whenIdle();
      var p = setEquations(list);
      UI.lastEquationsApply = p;
      p.then(function () {
        var n = App.build && App.build.errors ? Object.keys(App.build.errors).length : 0;
        setStatus('Equations applied: ' + list.length + ' global variable' + (list.length === 1 ? '' : 's') + '. ' + (n ? n + ' rebuild error' + (n > 1 ? 's' : '') + '.' : 'Rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms.'));
      });
      return p;
    }
    showModal({ title: 'Equations, Global Variables, and Dimensions', body: wrap, buttons: [
      { id: 'eq-ok', label: 'OK', primary: true, action: applyAndClose },
      { id: 'eq-cancel', label: 'Cancel', action: closeModal }
    ] });
    $('modal-card').classList.add('wide');
    var fi = -1;
    rows.forEach(function (q, i) { if (focusName != null && q.name === focusName) fi = i; });
    render(fi >= 0 ? fi : null, 'expr');
    if (!rows.length) setTimeout(function () { addBtn.focus(); }, 0);
    UI.equationsDialog = { rows: rows, evaluate: evaluate, apply: applyAndClose, render: render };
  }

  // ------------------------------------------------------------------ ConfigurationManager
  // Configurations are named sets of global-variable values (Kernel: model.configurations [{ name, values }],
  // model.activeConfiguration). The panel #config-panel replaces #fm-tree while its tab is active: a header, the
  // buttons #cfg-add / #cfg-rename / #cfg-delete / #cfg-activate, and #cfg-list with one .cfg-row[data-name] per
  // configuration (.active = the one shown, .selected = the one the buttons act on). Double-click a row to show it.
  // Every operation is one undo step followed by a rebuild; UI.configurations exposes them for scripts and tests.
  var cfgSelected = null;
  function cfgCopy(c) { return { name: String(c.name), values: JSON.parse(JSON.stringify(c.values || {})) }; }
  function cfgList() { return (K.configurationList ? K.configurationList(App.model) : []).map(cfgCopy); }
  function cfgActiveName() { var ac = K.activeConfiguration ? K.activeConfiguration(App.model) : null; return ac ? String(ac.name) : null; }
  function cfgValuesText(values) {
    var keys = Object.keys(values || {});
    var txt = keys.map(function (k) { return k + '=' + values[k]; }).join(', ');
    return txt.length > 40 ? txt.slice(0, 38) + '…' : txt;
  }
  function nextConfigName() {
    for (var i = cfgList().length + 1; ; i++) if (!K.findConfiguration(App.model, 'Config' + i)) return 'Config' + i;
  }
  function cfgFail(msg) { return Promise.reject(new Error(msg)); }
  function cfgCheckName(name, except) {
    var n = name == null ? '' : String(name).trim();
    if (!n) return { error: 'A configuration needs a name.' };
    if (n !== except && K.findConfiguration(App.model, n)) return { error: 'A configuration named "' + n + '" already exists.' };
    return { name: n };
  }
  // one undoable change: snapshot, mutate App.model, rebuild, refresh tree / status / panel
  function cfgCommit(mutate, message) {
    UI.pushUndo();
    mutate(App.model);
    return UI.afterRebuild(UI.rebuild(), function () { refreshTree(); refreshStatus(); if (message) setStatus(message); });
  }
  function cfgAdd(name) {
    var chk = cfgCheckName(name == null ? nextConfigName() : name);
    if (chk.error) return cfgFail(chk.error);
    var values = K.captureConfiguration(App.model);
    var first = !K.configurationList(App.model).length;
    if (first && chk.name === 'Default') return cfgFail('A configuration named "Default" already exists.');
    cfgSelected = chk.name;
    return cfgCommit(function (m) {
      if (!Array.isArray(m.configurations)) m.configurations = [];
      if (first) m.configurations.push({ name: 'Default', values: JSON.parse(JSON.stringify(values)) });
      m.configurations.push({ name: chk.name, values: values });
      m.activeConfiguration = chk.name;
    }, 'Added configuration "' + chk.name + '" (now active).');
  }
  function cfgRename(oldName, newName) {
    var c = K.findConfiguration(App.model, oldName);
    if (!c) return cfgFail('No configuration named "' + oldName + '".');
    var chk = cfgCheckName(newName, String(c.name));
    if (chk.error) return cfgFail(chk.error);
    if (chk.name === String(c.name)) return Promise.resolve();
    var from = String(c.name);
    if (cfgSelected === from) cfgSelected = chk.name;
    return cfgCommit(function (m) {
      var cc = K.findConfiguration(m, from);
      if (String(m.activeConfiguration) === from) m.activeConfiguration = chk.name;
      cc.name = chk.name;
    }, 'Renamed configuration "' + from + '" to "' + chk.name + '".');
  }
  function cfgRemove(name) {
    var c = K.findConfiguration(App.model, name);
    if (!c) return cfgFail('No configuration named "' + name + '".');
    var gone = String(c.name);
    if (cfgSelected === gone) cfgSelected = null;
    return cfgCommit(function (m) {
      var wasActive = cfgActiveName() === gone;
      m.configurations = m.configurations.filter(function (x) { return !(x && String(x.name) === gone); });
      var left = K.configurationList(m);
      if (!left.length) { delete m.configurations; delete m.activeConfiguration; }
      else if (wasActive || !K.activeConfiguration(m)) m.activeConfiguration = String(left[0].name);
    }, 'Deleted configuration "' + gone + '".');
  }
  function cfgActivate(name) {
    var c = K.findConfiguration(App.model, name);
    if (!c) return cfgFail('No configuration named "' + name + '".');
    if (cfgActiveName() === String(c.name)) return Promise.resolve();
    var to = String(c.name);
    return cfgCommit(function (m) { m.activeConfiguration = to; }, 'Configuration "' + to + '" is active.');
  }
  // cfgSet(list, active?): replace every configuration at once. list = [{ name, values: { T: 6 | '6' | '=W/2' } }];
  // active defaults to the current one when it survives, else the first. An empty list removes configurations.
  function cfgSet(list, active) {
    list = Array.isArray(list) ? list : [];
    var out = [], seen = {};
    for (var i = 0; i < list.length; i++) {
      var c = list[i] || {}, n = c.name == null ? '' : String(c.name).trim();
      if (!n) return cfgFail('Configuration ' + (i + 1) + ' needs a name.');
      if (seen[n]) return cfgFail('A configuration named "' + n + '" already exists.');
      seen[n] = true;
      var vals = {};
      Object.keys(c.values || {}).forEach(function (k) { vals[k] = String(c.values[k] == null ? '' : c.values[k]).replace(/^\s*=\s*/, '').trim(); });
      out.push({ name: n, values: vals });
    }
    var act = null;
    if (out.length) {
      if (active != null) { if (!seen[String(active)]) return cfgFail('No configuration named "' + active + '".'); act = String(active); }
      else act = seen[cfgActiveName()] ? cfgActiveName() : out[0].name;
    }
    if (cfgSelected && !seen[cfgSelected]) cfgSelected = null;
    return cfgCommit(function (m) {
      if (out.length) { m.configurations = out; m.activeConfiguration = act; }
      else { delete m.configurations; delete m.activeConfiguration; }
    }, out.length ? out.length + ' configuration' + (out.length === 1 ? '' : 's') + ', "' + act + '" active.' : 'Configurations removed.');
  }
  // UI entry points: report a refusal as a toast instead of an unhandled rejection
  function cfgRun(p) { return p.catch(function (e) { toast(e.message || String(e)); }); }
  function cfgNeedSelection() {
    var n = cfgSelected && K.findConfiguration(App.model, cfgSelected) ? cfgSelected : null;
    if (!n) toast('Select a configuration first.');
    return n;
  }
  function cfgPromptAdd() {
    promptDialog('Add Configuration', 'Configuration name:', nextConfigName(), function (v) { cfgRun(cfgAdd(v)); });
  }
  function cfgPromptRename(name) {
    name = name || cfgNeedSelection();
    if (!name) return;
    promptDialog('Rename Configuration', 'New name for "' + name + '":', name, function (v) { cfgRun(cfgRename(name, v)); });
  }
  function cfgConfirmDelete(name) {
    name = name || cfgNeedSelection();
    if (!name) return;
    confirmDialog('Delete Configuration', 'Delete configuration "' + escHtml(name) + '"? Its variable values are lost (Undo brings them back).', function () { cfgRun(cfgRemove(name)); }, 'Delete');
  }
  function escHtml(t) { return String(t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function cfgMenu(name) {
    var items = [];
    if (name) {
      items.push({ label: 'Show Configuration', action: function () { cfgRun(cfgActivate(name)); } });
      items.push({ label: 'Rename…', action: function () { cfgPromptRename(name); } });
      items.push({ label: 'Delete', action: function () { cfgConfirmDelete(name); } });
      items.push({ sep: true });
    }
    items.push({ label: 'Add Configuration…', action: cfgPromptAdd });
    items.push({ label: 'Manage Equations…', action: function () { showEquations(); } });
    return items;
  }
  function refreshConfigPanel() {
    var panel = $('config-panel');
    if (!panel || panel.hidden || !App.model) return;
    var list = cfgList(), active = cfgActiveName();
    if (cfgSelected && !list.some(function (c) { return c.name === cfgSelected; })) cfgSelected = null;
    panel.innerHTML = '';
    panel.appendChild(el('div', { class: 'cfg-head', title: App.model.name + ' Configuration(s)' }, [el('span', { html: Icons('config', 16) }), el('span', { class: 'cfg-title', text: App.model.name + ' Configuration(s)' })]));
    panel.appendChild(el('div', { class: 'cfg-tools' }, [
      el('button', { id: 'cfg-add', text: 'Add\u2026', title: 'Add Configuration: a copy of the current variable values, made active', onclick: cfgPromptAdd }),
      el('button', { id: 'cfg-rename', text: 'Rename\u2026', title: 'Rename the selected configuration', onclick: function () { cfgPromptRename(); } }),
      el('button', { id: 'cfg-delete', text: 'Delete', title: 'Delete the selected configuration', onclick: function () { cfgConfirmDelete(); } }),
      el('button', { id: 'cfg-activate', text: 'Show', title: 'Show Configuration: make the selected configuration active', onclick: function () { var n = cfgNeedSelection(); if (n) cfgRun(cfgActivate(n)); } })
    ]));
    var box = el('div', { id: 'cfg-list' });
    box.addEventListener('contextmenu', function (e) { if (e.target !== box) return; e.preventDefault(); showMenu(e.clientX, e.clientY, cfgMenu(null)); });
    if (!list.length) {
      var eqs = currentEquations().length;
      box.appendChild(el('div', { class: 'cfg-empty', text: eqs ? 'No configurations yet: the part uses its base equation values. Add… stores them as "Default" and starts a new configuration you can change in Tools ▸ Equations.' : 'Configurations are named sets of global-variable values. Add global variables in Tools ▸ Equations first, then Add… a configuration for each variant.' }));
    }
    list.forEach(function (c) {
      var isActive = c.name === active, vals = cfgValuesText(c.values);
      var row = el('div', { class: 'cfg-row' + (isActive ? ' active' : '') + (c.name === cfgSelected ? ' selected' : ''), 'data-name': c.name, title: c.name + (isActive ? ' (active)' : '') + (vals ? ': ' + Object.keys(c.values).map(function (k) { return k + ' = ' + c.values[k]; }).join(', ') : '') + ' — double-click to show' }, [
        el('span', { class: 'cfg-mark', text: isActive ? '\u2713' : '' }),
        el('span', { html: Icons('config', 16) }),
        el('span', { class: 'cfg-name', text: c.name }),
        el('span', { class: 'cfg-vals', text: vals })
      ]);
      row.addEventListener('click', function () { cfgSelected = c.name; refreshConfigPanel(); setStatus('Configuration "' + c.name + '"' + (vals ? ': ' + vals : '') + (isActive ? ' (active)' : '')); });
      row.addEventListener('dblclick', function (e) { e.stopPropagation(); cfgSelected = c.name; cfgRun(cfgActivate(c.name)); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); cfgSelected = c.name; refreshConfigPanel(); showMenu(e.clientX, e.clientY, cfgMenu(c.name)); });
      box.appendChild(row);
    });
    panel.appendChild(box);
  }

  // Modal replacements for window.confirm / window.prompt (native dialogs are blocked in sandboxed hosts).
  function confirmDialog(title, message, onYes, yesLabel) {
    showModal({ title: title, body: '<p>' + message + '</p>', buttons: [
      { label: yesLabel || 'OK', primary: true, action: function () { closeModal(); onYes(); } },
      { label: 'Cancel', action: closeModal }
    ] });
  }
  function promptDialog(title, message, initial, onOk) {
    var inp = el('input', { type: 'text', value: initial || '', style: 'width:100%' });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); closeModal(); onOk(inp.value); } e.stopPropagation(); });
    showModal({ title: title, body: el('div', {}, [el('p', { text: message }), inp]), buttons: [
      { label: 'OK', primary: true, action: function () { closeModal(); onOk(inp.value); } },
      { label: 'Cancel', action: closeModal }
    ] });
    setTimeout(function () { inp.focus(); inp.select(); }, 0);
  }
  $('modal').addEventListener('mousedown', function (e) { if (e.target === $('modal')) closeModal(); });

  UI.setStatus = setStatus; UI.toast = toast; UI.refreshStatus = refreshStatus;
  UI.RIBBON = RIBBON;
  UI.refreshRibbon = refreshRibbon; UI.setRibbonTab = setRibbonTab; UI.renderFmTabs = renderFmTabs; UI.setFmTab = setFmTab;
  UI.refreshTree = refreshTree; UI.startRename = startRename; UI.renderMenuBar = renderMenuBar; UI.closeMenus = closeMenus; UI.showMenu = showMenu;
  UI.refreshHud = refreshHud; UI.showModal = showModal; UI.closeModal = closeModal; UI.confirmDialog = confirmDialog; UI.promptDialog = promptDialog; UI.setStyle = setStyle; UI.setBg = setBg; UI.normalToSelection = normalToSelection;
  UI.showEquations = showEquations; UI.setEquations = setEquations; UI.normalizeEquations = normalizeEquations;
  UI.refreshConfigPanel = refreshConfigPanel;
  UI.configurations = { list: cfgList, active: cfgActiveName, add: cfgAdd, rename: cfgRename, remove: cfgRemove, activate: cfgActivate, set: cfgSet };
})(UI);
