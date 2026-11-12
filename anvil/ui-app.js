// ui-app.js — task pane (resources, library, files, views, appearance, properties, script console), files & exports,
// mass properties, keyboard shortcuts, the window.anvil automation API and boot.
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el;

  // ------------------------------------------------------------------ sample parts (script API)
  var EXAMPLES = [
    { name: 'Mounting Bracket', note: 'plate, boss, through hole, corner holes patterned, mirrored slot', code:
'p.name("Mounting Bracket").units("mm");\n' +
'// 120 x 80 x 4 base plate on the Top plane (sketch X = world X, sketch Y = -Z)\n' +
'p.sketch("Top").centerRect(0, 0, 120, 80).extrude(4);\n' +
'// central boss and its bore\n' +
'p.sketch("Top", 4).circle(0, 0, 15).extrude(20);\n' +
'p.sketch("Top", 30).circle(0, 0, 6).cut("through", { reverse: true });\n' +
'// one corner hole, then a 2 x 2 linear pattern\n' +
'p.sketch("Top", 30).circle(45, 25, 4.5).cut("through", { reverse: true });\n' +
'p.linearPattern({ dir: "x", reverse: true, spacing: 90, count: 2, dir2: "z", spacing2: 50, count2: 2 });\n' +
'// a slot, mirrored about the Right plane\n' +
'p.sketch("Top", 30).slot(-50, 0, -35, 0, 6).cut("through", { reverse: true });\n' +
'p.mirror("Right");\n' },
    { name: 'Flanged Bushing', note: 'single revolve of a stepped profile', code:
'p.name("Flanged Bushing");\n' +
'// profile in the Front plane: X is radius, Y is height; revolve about the sketch Y axis\n' +
'p.sketch("Front").polyline([[6, 0], [14, 0], [14, 3], [9, 3], [9, 22], [6, 22]]).revolve(360);\n' +
'// cross hole through the wall\n' +
'p.sketch("Right", 20).circle(0, 12, 1.5).cut("through", { reverse: true });\n' },
    { name: 'V-Belt Pulley', note: 'revolve with groove, bore, six lightening holes in a circular pattern', code:
'p.name("V-Belt Pulley");\n' +
'p.sketch("Front").polyline([[8, 0], [40, 0], [40, 5], [34, 9], [40, 13], [40, 18], [8, 18]]).revolve(360);\n' +
'p.sketch("Top", 30).circle(24, 0, 4).cut("through", { reverse: true });\n' +
'p.circularPattern({ axis: "y", count: 6 });\n' +
'// keyway\n' +
'p.sketch("Top", 30).rect(6, -1.5, 4, 3).cut("through", { reverse: true });\n' },
    { name: 'Enclosure Base', note: 'box, pocket leaving 3 mm walls, four corner bosses with holes', code:
'p.name("Enclosure Base");\n' +
'p.sketch("Top").centerRect(0, 0, 100, 60).extrude(22);\n' +
'p.sketch("Top", 22).centerRect(0, 0, 94, 54).cut(19, { reverse: true });\n' +
'// corner boss inside the pocket\n' +
'p.sketch("Top", 3).circle(43, 23, 3.5).extrude(19);\n' +
'p.linearPattern({ dir: "x", reverse: true, spacing: 86, count: 2, dir2: "z", spacing2: 46, count2: 2 });\n' +
'p.sketch("Top", 30).circle(43, 23, 1.3).cut(12, { reverse: true });\n' +
'p.linearPattern({ dir: "x", reverse: true, spacing: 86, count: 2, dir2: "z", spacing2: 46, count2: 2 });\n' },
    { name: 'Sheet Metal Bracket', note: 'base flange, hole, two edge flanges (one reversed), ready to Flatten', code:
'p.name("Sheet Bracket");\n' +
'// 2 mm steel, 2 mm inside bend radius, shop K-factor 0.71\n' +
'p.sheet(2, 2, 0.71);\n' +
'p.sketch("Top").centerRect(0, 0, 100, 60).end().baseFlange(2);\n' +
'p.sketch("Top", 10).circle(0, 0, 6).cut("through", { reverse: true });\n' +
'// flanges are placed by a point on the edge: front edge up, right edge down\n' +
'p.flange(20, [[0, 2, 30]]);\n' +
'p.flange(15, [[50, 2, 0]], { reverse: true });\n' +
'// Sheet Metal tab -> Flatten shows the blank with bend lines; Flat to DXF exports OUTLINE/HOLES/BEND/NOTES\n' },
    { name: 'Hex Standoff', note: 'polygon extrude with a threaded-size bore, mid-plane', code:
'p.name("Hex Standoff");\n' +
'p.sketch("Top").polygon(0, 0, 4, 6, 30).extrude(20, { midplane: true });\n' +
'p.sketch("Top", 20).circle(0, 0, 1.6).cut("through", { reverse: true });\n' }
  ];

  // examples/examples.js (optional) contributes more sample parts as AnvilExamples = [{name, description, code}]
  if (window.AnvilExamples && Array.isArray(window.AnvilExamples)) {
    window.AnvilExamples.forEach(function (ex) {
      if (!ex || !ex.code || EXAMPLES.some(function (e) { return e.name === ex.name; })) return;
      EXAMPLES.push({ name: ex.name, note: ex.description || '', code: ex.code, kind: ex.kind === 'assembly' ? 'assembly' : 'part' });
    });
  }

  // ------------------------------------------------------------------ task pane
  var TP = [
    ['home', 'home', 'Anvil Resources'], ['library', 'library', 'Design Library'], ['files', 'explorer', 'File Explorer'],
    ['views', 'palette', 'View Palette'], ['appearance', 'appearances', 'Appearances, Scenes'], ['props', 'props', 'Custom Properties'], ['macro', 'macro', 'Automation / Script']
  ];
  var tpCurrent = null;
  function renderTaskStrip() {
    var strip = $('tp-strip');
    strip.innerHTML = '';
    TP.forEach(function (t) {
      var b = el('button', { html: Icons(t[1] === 'appearances' ? 'appearance' : t[1], 16), title: t[2], onclick: function () { if (tpCurrent === t[0]) closeTaskPane(); else openTaskPane(t[0]); } });
      b.dataset.id = t[0];
      strip.appendChild(b);
    });
  }
  function openTaskPane(id) {
    tpCurrent = id;
    var def = TP.filter(function (t) { return t[0] === id; })[0];
    $('tp-panel').hidden = false;
    $('tp-title').innerHTML = '';
    $('tp-title').appendChild(el('span', { html: Icons(def[1] === 'appearances' ? 'appearance' : def[1], 16) + ' ' + def[2] }));
    $('tp-title').appendChild(el('button', { text: '✕', title: 'Close', onclick: closeTaskPane }));
    Array.prototype.forEach.call($('tp-strip').children, function (b) { b.classList.toggle('active', b.dataset.id === id); });
    var body = $('tp-body');
    body.innerHTML = '';
    ({ home: tpHome, library: tpLibrary, files: tpFiles, views: tpViews, appearance: tpAppearance, props: tpProps, macro: tpMacro })[id](body);
    setTimeout(UI.resize, 0);
  }
  function closeTaskPane() {
    tpCurrent = null;
    $('tp-panel').hidden = true;
    Array.prototype.forEach.call($('tp-strip').children, function (b) { b.classList.remove('active'); });
    setTimeout(UI.resize, 0);
  }

  function tpHome(body) {
    body.innerHTML =
      '<h3>Getting started</h3>' +
      '<p>Anvil is a parametric solid modeler laid out like SolidWorks: the <b>CommandManager</b> ribbon on top, the <b>FeatureManager</b> tree and <b>PropertyManager</b> on the left, the graphics area in the middle and this Task Pane on the right.</p>' +
      '<p><b>1.</b> Sketch tab → <b>Sketch</b> → pick a plane. Draw with Line, Rectangle, Circle, Slot… Click an entity to type exact values.<br>' +
      '<b>2.</b> Features tab → <b>Extruded Boss/Base</b> (or Cut). Set the depth, press ✓.<br>' +
      '<b>3.</b> Pattern, mirror, add holes, then <b>Evaluate → Mass Properties</b> or <b>Face to DXF</b>.</p>' +
      '<h3>Mouse</h3><p>Left-drag or middle-drag rotates · right-drag or Ctrl+middle pans · wheel zooms at the cursor · click selects a face · Ctrl+click adds a second face for Measure · double-click a face to edit its feature.</p>' +
      '<h3>Scripting</h3><p>Every model is also a script. Open <b>Automation / Script</b> in this pane to write parts in code, or run <code>anvil.run(code)</code> from the browser console.</p>';
    var row = el('div', { class: 'row' });
    row.appendChild(el('button', { class: 'btn primary', text: 'Open the script console', onclick: function () { openTaskPane('macro'); } }));
    row.appendChild(el('button', { class: 'btn', text: 'Keyboard shortcuts', onclick: showShortcuts }));
    body.appendChild(row);
  }
  // ---- Design Library (rfHH): SolidWorks' layout — a toolbar (Back, Up, search), the folder tree, the path of the
  // open folder and its contents as icon tiles. Folders: Examples (the sample parts and assemblies: unchanged, a click
  // opens one as a new document), Hardware (library.js families: a click asks size / length, then opens the part or,
  // in an assembly, inserts it), Parts (library.js curved parts), Features (library features cut into a planar face:
  // libraryFeature), Forming Tools (Kernel.FORMING_TOOLS when the kernel has them: UI.cmdFormingTool(id)).
  // Every tile is in the DOM all the time (the other folders' are hidden), so `#tp-body button` holds every example.
  // DOM: .dl > .dl-bar (#dl-back, #dl-up, #dl-search), .dl-tree (.dl-row[data-folder] > .dl-caret, .dl-name), .dl-path,
  // .dl-tiles (.dl-tile[data-folder][data-kind] > .dl-ico, .dl-name; folder tiles .dl-tile.dl-folder[data-open]).
  var LIB = window.AnvilLibrary || null;
  var dl = { folder: 'examples', back: [], expanded: { examples: true, hardware: true, parts: true, features: true, forming: true }, query: '', root: null };
  function dlSvg(body, size) { return Icons.svg ? Icons.svg(body, size || 16) : ''; }
  function dlIcon(name, size) {
    if (LIB && LIB.icons[name]) return dlSvg(LIB.icons[name], size);
    return Icons(Icons.has && Icons.has(name) ? name : 'part', size);
  }
  var DL_BACK = '<path d="M9.5 3.5 L5 8 L9.5 12.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
  var DL_UP = '<path d="M1.5 4.5 h4.5 l1.5 1.5 h7 v7.5 h-13 z" fill="#e8e8e8" stroke="#464646" stroke-width="1"/><path d="M8 12 V7.5 M5.8 9.5 L8 7.3 L10.2 9.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
  // folder ids: 'lib' (root), top folders ('examples', 'hardware' …) and 'hardware/Nuts' style sub-folders
  function dlFolders() {
    var tops = LIB ? LIB.folders.slice() : [{ id: 'examples', name: 'Examples' }];
    if (LIB && LIB.shapes && !tops.some(function (f) { return f.id === 'parts'; })) tops.splice(2, 0, { id: 'parts', name: 'Parts', subs: ['Bent and Swept', 'Rounded and Revolved'] });
    return tops;
  }
  function dlName(id) {
    if (id === 'lib') return 'Design Library';
    var i = id.indexOf('/');
    if (i >= 0) return id.slice(i + 1);
    var f = dlFolders().filter(function (t) { return t.id === id; })[0];
    return f ? f.name : id;
  }
  function dlParent(id) { if (id === 'lib') return null; var i = id.indexOf('/'); return i >= 0 ? id.slice(0, i) : 'lib'; }
  function dlSubs(id) {
    if (id === 'lib') return dlFolders().map(function (f) { return f.id; });
    var f = dlFolders().filter(function (t) { return t.id === id; })[0];
    return f && f.subs ? f.subs.map(function (s) { return id + '/' + s; }) : [];
  }
  function formingTools() { try { return (K && Array.isArray(K.FORMING_TOOLS)) ? K.FORMING_TOOLS : null; } catch (e) { return null; } }
  // every item tile: { folder, kind, name, note, icon, run }
  function dlItems() {
    var out = [];
    EXAMPLES.forEach(function (ex) { out.push({ folder: 'examples', kind: ex.kind === 'assembly' ? 'assembly' : 'example', name: ex.name, note: ex.note, icon: ex.kind === 'assembly' ? 'assembly' : 'part', run: function () { confirmDiscard(null, function () { openExample(ex); }); } }); });
    if (LIB) {
      LIB.hardware.forEach(function (f) { out.push({ folder: 'hardware/' + f.folder, kind: 'hardware', id: f.id, name: f.name, note: f.standard + ': ' + f.choices.map(function (c) { return c.items.length + ' ' + c.label.toLowerCase() + (c.items.length > 1 ? 's' : ''); }).join(' × '), icon: f.icon, run: function () { hardwareDialog(f.id); } }); });
      (LIB.shapes || []).forEach(function (s) { out.push({ folder: 'parts/' + s.folder, kind: 'shape', name: s.name, note: s.note, icon: s.icon, run: function () { placeLibraryPart({ name: s.name, code: s.code }); } }); });
      LIB.features.forEach(function (f) { out.push({ folder: 'features/' + f.folder, kind: 'feature', id: f.id, name: f.name, note: f.help + ' Select a planar face, then click.', icon: f.icon, run: function () { libraryFeature(f.id); } }); });
    }
    (formingTools() || []).forEach(function (t) {
      if (!t || !t.id) return;
      out.push({ folder: 'forming', kind: 'forming', id: t.id, name: t.label || t.id, note: t.help || '', icon: Icons.has && Icons.has(t.icon || t.id) ? (t.icon || t.id) : 'formingTool', run: function () { if (typeof UI.cmdFormingTool === 'function') UI.cmdFormingTool(t.id); else UI.toast('Forming tools are not available in this build.'); } });
    });
    return out;
  }
  function tpLibrary(body) {
    var root = el('div', { class: 'dl' });
    dl.root = root;
    var back = el('button', { id: 'dl-back', class: 'dl-btn', title: 'Back', html: dlSvg(DL_BACK), onclick: function () { if (dl.back.length) dlOpen(dl.back.pop(), true); } });
    var up = el('button', { id: 'dl-up', class: 'dl-btn', title: 'Up one level', html: dlSvg(DL_UP), onclick: function () { var p = dlParent(dl.folder); if (p) dlOpen(p); } });
    var search = el('input', { id: 'dl-search', type: 'search', placeholder: 'Search Design Library', spellcheck: 'false' });
    search.value = dl.query;
    search.addEventListener('input', function () { dl.query = search.value; dlShow(); });
    search.addEventListener('keydown', function (e) { if (e.key === 'Escape' && search.value) { e.preventDefault(); e.stopPropagation(); search.value = ''; dl.query = ''; dlShow(); } });
    root.appendChild(el('div', { class: 'dl-bar' }, [back, up, search]));
    // tree
    var tree = el('div', { class: 'dl-tree', role: 'tree' }), items = dlItems();
    function count(id) { return items.filter(function (it) { return it.folder === id || it.folder.indexOf(id + '/') === 0; }).length; }
    function row(id, depth) {
      var subs = dlSubs(id), r = el('div', { class: 'dl-row', role: 'treeitem', 'data-folder': id, style: 'padding-left:' + (4 + depth * 14) + 'px' });
      var caret = el('span', { class: 'dl-caret' + (subs.length ? '' : ' none'), text: subs.length ? '▸' : '' });
      caret.addEventListener('click', function (e) { e.stopPropagation(); if (!subs.length) return; dl.expanded[id] = !dl.expanded[id]; dlShow(); });
      r.appendChild(caret);
      r.appendChild(el('span', { class: 'dl-ico', html: Icons(id === 'lib' ? 'library' : 'folder', 16) }));
      r.appendChild(el('span', { class: 'dl-name', text: dlName(id) }));
      if (id !== 'lib') r.appendChild(el('span', { class: 'dl-count', text: String(count(id)) }));
      r.addEventListener('click', function () { dlOpen(id); });
      r.addEventListener('dblclick', function () { if (subs.length) { dl.expanded[id] = !dl.expanded[id]; dlShow(); } });
      tree.appendChild(r);
      subs.forEach(function (s) { row(s, depth + 1); });
    }
    dl.expanded.lib = true;
    row('lib', 0);
    root.appendChild(tree);
    root.appendChild(el('div', { class: 'dl-path' }));
    // tiles: folder tiles for every folder, then every item
    var tiles = el('div', { class: 'dl-tiles' });
    function folderTiles(id) {
      dlSubs(id).forEach(function (s) {
        tiles.appendChild(el('button', { class: 'dl-tile dl-folder', 'data-folder': id, 'data-open': s, title: dlName(s) + ' (' + count(s) + ')', onclick: function () { dlOpen(s); } },
          [el('span', { class: 'dl-ico', html: Icons('folder', 32) }), el('span', { class: 'dl-name', text: dlName(s) })]));
        folderTiles(s);
      });
    }
    folderTiles('lib');
    items.forEach(function (it) {
      var b = el('button', { class: 'dl-tile', 'data-folder': it.folder, 'data-kind': it.kind, title: it.name + (it.note ? '\n' + it.note : ''), onclick: function () { it.run(); } },
        [el('span', { class: 'dl-ico', html: dlIcon(it.icon, 32) }), el('span', { class: 'dl-name', text: it.name })]);
      if (it.id) b.dataset.id = it.id;
      tiles.appendChild(b);
    });
    root.appendChild(tiles);
    root.appendChild(el('div', { class: 'dl-empty', text: '' }));
    body.appendChild(root);
    dlShow();
  }
  function dlOpen(id, isBack) {
    if (id !== dl.folder && !isBack) dl.back.push(dl.folder);
    if (dl.back.length > 50) dl.back.shift();
    dl.folder = id;
    for (var p = dlParent(id); p; p = dlParent(p)) dl.expanded[p] = true;
    if (dl.query) { dl.query = ''; var s = dl.root && dl.root.querySelector('#dl-search'); if (s) s.value = ''; }
    dlShow();
  }
  // which rows and tiles show: the open folder's sub-folders and items, or every item matching the search
  function dlShow() {
    var root = dl.root;
    if (!root || !root.isConnected) return;
    var q = dl.query.trim().toLowerCase();
    Array.prototype.forEach.call(root.querySelectorAll('.dl-row'), function (r) {
      var id = r.dataset.folder, shown = true;
      for (var p = dlParent(id); p; p = dlParent(p)) if (!dl.expanded[p]) shown = false;
      r.hidden = !shown;
      r.classList.toggle('sel', !q && id === dl.folder);
      if (!q && id === dl.folder && shown && r.parentNode) { var tr = r.parentNode; if (r.offsetTop < tr.scrollTop || r.offsetTop + r.offsetHeight > tr.scrollTop + tr.clientHeight) tr.scrollTop = r.offsetTop - tr.clientHeight / 2; }
      var c = r.querySelector('.dl-caret');
      if (c && !c.classList.contains('none')) c.textContent = dl.expanded[id] ? '▾' : '▸';
    });
    var n = 0;
    Array.prototype.forEach.call(root.querySelectorAll('.dl-tile'), function (t) {
      var show;
      if (q) show = !t.classList.contains('dl-folder') && (t.textContent.toLowerCase().indexOf(q) >= 0 || (t.title || '').toLowerCase().indexOf(q) >= 0);
      else show = t.dataset.folder === dl.folder;
      t.hidden = !show;
      if (show) n++;
    });
    var path = root.querySelector('.dl-path');
    if (q) path.textContent = 'Search: ' + n + ' match' + (n === 1 ? '' : 'es') + ' for "' + dl.query.trim() + '"';
    else { var parts = []; for (var f = dl.folder; f; f = dlParent(f)) parts.unshift(dlName(f)); path.textContent = parts.join('  ›  '); }
    var empty = root.querySelector('.dl-empty');
    empty.textContent = n ? '' : q ? 'Nothing in the Design Library matches.' : dl.folder === 'forming' ? 'No forming tools installed in this build.' : 'This folder is empty.';
    empty.hidden = !!n;
    root.querySelector('#dl-back').disabled = !dl.back.length;
    root.querySelector('#dl-up').disabled = dl.folder === 'lib';
  }
  // A Design Library part ({ name, code }): opened as a new part, or inserted as a component in an open assembly
  function placeLibraryPart(p, opts) {
    if (isAsm() && UI.asm && UI.asm.insert) {
      return Promise.resolve(UI.asm.insert({ script: p.code }, { name: p.name })).then(function (c) { UI.toast('Inserted ' + p.name); return c; }, function (e) { UI.toast(p.name + ': ' + ((e && e.message) || e)); });
    }
    return new Promise(function (res) {
      confirmDiscard(null, function () {
        runScript(p.code, true, 'part').then(function (r) {
          if (!r.error) UI.markClean();
          UI.toast(r.error ? p.name + ': ' + r.error.split('\n')[0] : 'Loaded ' + p.name);
          res(r);
        });
      }, opts && opts.noConfirm ? { dirty: false } : null);
    });
  }
  // Hardware: size (and length) for one family, then Open / Insert. DOM: #dl-hw with select[data-key], #dl-hw-info.
  function hardwareDialog(id) {
    var f = LIB && LIB.family(id);
    if (!f) return;
    var sel = {}, box = el('div', { id: 'dl-hw', class: 'dl-hw' }), info = el('div', { id: 'dl-hw-info', class: 'dl-hw-info' });
    function current() { return LIB.part(f.id, sel.size, sel.len); }
    function upd() { var p = current(); info.innerHTML = ''; info.appendChild(el('b', { text: p.name })); info.appendChild(el('div', { text: p.note + (p.hole ? '' : '') })); info.appendChild(el('div', { class: 'dl-muted', text: f.standard })); }
    f.choices.forEach(function (ch) {
      var s = el('select', { 'data-key': ch.key });
      ch.items.forEach(function (it) { s.appendChild(el('option', { value: it.label, text: it.label })); });
      s.value = ch.key === 'size' ? ch.items[0].label : (ch.def || ch.items[0].label);
      sel[ch.key] = s.value;
      s.addEventListener('change', function () { sel[ch.key] = s.value; upd(); });
      box.appendChild(el('label', { class: 'dl-hw-row' }, [el('span', { text: ch.label }), s]));
    });
    box.appendChild(info);
    upd();
    var asm = isAsm();
    UI.showModal({ title: f.name, body: box, buttons: [
      { label: asm ? 'Insert' : 'Open', primary: true, id: 'dl-hw-ok', action: function () { var p = current(); UI.closeModal(); placeLibraryPart(p); } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  // ---- library features: a PropertyManager over a planar face; ✓ adds a sketch on the face and a Cut-Extrude Through
  // All (one undo step), both ordinary features in the FeatureManager. Values in the document's units; X / Y are from
  // the face sketch's origin (the projection of the part origin, as a sketch on that face has it).
  var dlPreviewMat = null;
  function libraryFeature(id, preset) {
    var fd = LIB && LIB.feature(id);
    if (!fd) return null;
    if (isAsm()) { UI.toast('Library features go on a part: open a part first.'); return null; }
    if (App.mode === 'sketch' && UI.exitSketch) UI.exitSketch(true);
    if (!App.mesh || !App.mesh.faces || !App.mesh.faces.length) { UI.toast('Create a solid first, then add ' + fd.name + ' to one of its faces.'); return null; }
    var s = App.model.units === 'mm' ? 25.4 : 1, dp = s === 1 ? 1e4 : 1e3;
    var v = LIB.featureDefaults(id, s), face = null;
    Object.keys(preset || {}).forEach(function (k) { if (k !== 'face') v[k] = preset[k]; });
    function planar(i) {
      var fc = App.mesh.faces[i];
      if (!fc) return false;
      if (fc.polys && fc.polys[0] && fc.polys[0].surf) return false;
      return !(UI.faceGroup && UI.faceGroup(i).length > 1);
    }
    function setFace(i, point, keepXY) {
      if (!planar(i)) { UI.setStatus(fd.name + ' goes on a planar face: pick a flat face.'); return false; }
      var fc = App.mesh.faces[i], pl = UI.facePlane(fc, point || fc.centroid), p = point || fc.centroid, d = K.vec.sub(p, pl.origin);
      face = { index: i, plane: pl };
      if (!keepXY) { v.x = Math.round(K.vec.dot(d, pl.x) * dp) / dp; v.y = Math.round(K.vec.dot(d, pl.y) * dp) / dp; }
      if (App.command) App.command.faceList = [i];
      return true;
    }
    if (preset && preset.face != null) setFace(preset.face, preset.point || null, preset.x != null);
    else {
      var pre = (UI.selection ? UI.selection() : [App.sel]).filter(function (q) { return q && q.kind === 'face'; })[0];
      if (pre) { setFace(pre.index, pre.point || null); if (UI.setSelection) UI.setSelection([]); }
    }
    function why(val) {
      if (!face) return 'Select a planar face for the ' + fd.name + '.';
      try { LIB.featureEntities(id, val, s); } catch (e) { return e.message; }
      return null;
    }
    function preview() {
      UI.disposeGroup(UI.groups.preview);
      if (!face) return;
      var ents; try { ents = LIB.featureEntities(id, v, s); } catch (e) { UI.setStatus(e.message); return; }
      var pl = face.plane, lift = 1e-3 * s, pts = [];
      function P(u, w) { return new THREE.Vector3(pl.origin[0] + u * pl.x[0] + w * pl.y[0] + lift * pl.n[0], pl.origin[1] + u * pl.x[1] + w * pl.y[1] + lift * pl.n[1], pl.origin[2] + u * pl.x[2] + w * pl.y[2] + lift * pl.n[2]); }
      function seg(a, b) { pts.push(a, b); }
      function arc(cx, cy, r, a0, a1) { var n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 6)), prev = null; for (var k = 0; k <= n; k++) { var t = (a0 + (a1 - a0) * k / n) * Math.PI / 180, q = P(cx + r * Math.cos(t), cy + r * Math.sin(t)); if (prev) seg(prev, q); prev = q; } }
      ents.forEach(function (e) {
        if (e.t === 'line') seg(P(e.x1, e.y1), P(e.x2, e.y2));
        else if (e.t === 'arc') arc(e.cx, e.cy, e.r, e.a0, e.a1);
        else if (e.t === 'circle') arc(e.cx, e.cy, e.r, 0, 360);
        else if (e.t === 'slot') {
          var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * e.w / 2, ny = dx / L * e.w / 2, a = Math.atan2(dy, dx) * 180 / Math.PI;
          seg(P(e.x1 + nx, e.y1 + ny), P(e.x2 + nx, e.y2 + ny)); seg(P(e.x1 - nx, e.y1 - ny), P(e.x2 - nx, e.y2 - ny));
          arc(e.x2, e.y2, e.w / 2, a - 90, a + 90); arc(e.x1, e.y1, e.w / 2, a + 90, a + 270);
        }
      });
      if (!dlPreviewMat) dlPreviewMat = new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false, transparent: true });
      var g = new THREE.BufferGeometry().setFromPoints(pts), ls = new THREE.LineSegments(g, dlPreviewMat);
      ls.renderOrder = 10;
      UI.groups.preview.add(ls);
      if (UI.requestRender) UI.requestRender();
      UI.setStatus(fd.name + ': ' + UI.fmtNum(LIB.featureArea(id, v, s), 4) + ' ' + UI.unitLabel() + '² cut Through All. Press Enter or ✓ to add it.');
    }
    var sizeFields = fd.fields.map(function (f) {
      if (f.type === 'select') return { type: 'select', key: f.key, label: f.label, options: f.options.map(function (o) { return [o, o]; }) };
      if (f.deg) return { type: 'number', key: f.key, label: f.label, unit: 'deg', step: 15 };
      if (f.count) return { type: 'number', key: f.key, label: f.label, step: 1, min: 1 };
      return { type: 'number', key: f.key, label: f.label, unit: 'u', min: 0 };
    });
    UI.openPM({
      title: fd.name, icon: 'library', values: v,
      message: fd.help + ' Pick a <b>planar face</b>; the click sets the location (X, Y from the face sketch origin).',
      command: {
        faceList: face ? [face.index] : [],
        onPick: function (pk) {
          if (!pk || pk.kind !== 'face') return false;
          if (!setFace(pk.index, pk.point)) return true;
          UI.renderPM(); preview(); if (UI.updateHighlights) UI.updateHighlights();
          return true;
        }
      },
      groups: [
        { title: 'Placement', fields: [
          { type: 'pick', icon: 'faceSel', value: function () { return face ? 'Face<1>' : ''; }, placeholder: 'Planar face…' },
          { type: 'number', key: 'x', label: 'X', unit: 'u' },
          { type: 'number', key: 'y', label: 'Y', unit: 'u' }
        ] },
        { title: 'Size', fields: sizeFields }
      ],
      okBlocked: why,
      onChange: function () { preview(); },
      onClose: function () { UI.disposeGroup(UI.groups.preview); },
      onOK: function (val) {
        var bad = why(val);
        if (bad) { UI.toast(bad); return false; }
        UI.pushUndo();
        var made;
        try { made = LIB.addFeature(App.model, face.plane, id, val); } catch (e) { UI.toast(e.message); return false; }
        return UI.afterRebuild(UI.rebuild(), function () {
          App.sel = { kind: 'feature', id: made.cut.id };
          UI.updateHighlights(); UI.updateSketches(); UI.refreshTree();
          var err = App.build.errors[made.cut.id];
          UI.setStatus(err ? made.cut.name + ' failed: ' + err : fd.name + ' added: ' + made.sketch.name + ' + ' + made.cut.name + '.');
          if (UI.autosave) UI.autosave();
          return made;
        });
      }
    });
    preview();
    return true;
  }
  UI.libraryFeature = libraryFeature; UI.placeLibraryPart = placeLibraryPart; UI.hardwareDialog = hardwareDialog;
  UI.designLibrary = { open: function (id) { if (tpCurrent !== 'library') openTaskPane('library'); dlOpen(id || 'lib'); }, state: function () { return { folder: dl.folder, query: dl.query, back: dl.back.slice() }; },
    search: function (q) { if (tpCurrent !== 'library') openTaskPane('library'); dl.query = q || ''; var s = dl.root && dl.root.querySelector('#dl-search'); if (s) s.value = dl.query; dlShow(); },
    reset: function () { dl.folder = 'examples'; dl.back = []; dl.query = ''; if (tpCurrent === 'library') openTaskPane('library'); } };
  // Design Library entry -> a new part or assembly document (an assembly entry's code is an assembly script)
  function openExample(ex) {
    return runScript(ex.code, true, ex.kind === 'assembly' ? 'assembly' : 'part').then(function (r) {
      if (!r.error) UI.markClean();   // opened from the Design Library, not made by the user: nothing to save yet
      UI.toast(r.error ? ex.name + ': ' + r.error.split('\n')[0] : 'Loaded ' + ex.name);
      return r;
    });
  }
  function savedFiles() { try { return JSON.parse(localStorage.getItem('anvil.files') || '{}'); } catch (e) { return {}; } }
  function tpFiles(body) {
    body.appendChild(el('h3', { text: 'Saved in this browser' }));
    var files = savedFiles(), names = Object.keys(files).sort();
    if (!names.length) body.appendChild(el('p', { text: 'No saved parts yet. Use File → Save (Ctrl+S).' }));
    var list = el('div', { class: 'list' });
    names.forEach(function (n) {
      var f = files[n];
      var b = el('button', { html: '<b>' + n + '</b><small>' + savedSummary(f) + '</small>' });
      b.addEventListener('click', function () { confirmDiscard(null, function () { openSaved(n, f); }); });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); UI.showMenu(e.clientX, e.clientY, [{ label: 'Delete ' + n, action: function () { delete files[n]; localStorage.setItem('anvil.files', JSON.stringify(files)); openTaskPane('files'); } }]); });
      list.appendChild(b);
    });
    body.appendChild(list);
    var row = el('div', { class: 'row' });
    row.appendChild(el('button', { class: 'btn', text: 'Open JSON…', onclick: fileOpen }));
    row.appendChild(el('button', { class: 'btn', text: 'Save current as…', onclick: fileSave }));
    body.appendChild(row);
  }
  function tpViews(body) {
    body.appendChild(el('h3', { text: 'Standard views' }));
    var grid = el('div', { class: 'views' });
    Object.keys(UI.VIEWS).forEach(function (n) { grid.appendChild(el('button', { text: n, onclick: function () { UI.setView(n); } })); });
    grid.appendChild(el('button', { text: 'Normal To', onclick: UI.normalToSelection }));
    body.appendChild(grid);
    body.appendChild(el('h3', { text: 'Display style' }));
    var g2 = el('div', { class: 'views' });
    [['shadedEdges', 'Shaded + edges'], ['shaded', 'Shaded'], ['hlr', 'Hidden lines removed'], ['hlv', 'Hidden lines visible'], ['wireframe', 'Wireframe']].forEach(function (s) { g2.appendChild(el('button', { text: s[1], onclick: function () { UI.setStyle(s[0]); } })); });
    body.appendChild(g2);
  }
  function tpAppearance(body) {
    body.appendChild(el('h3', { text: 'Part color' }));
    var sw = el('div', { class: 'swatches' });
    ['#8c8c8c', '#6e6e6e', '#c8c8c8', '#505050', '#b8860b', '#c8442e', '#2f6db5', '#3f8f4e', '#d9b38c', '#e0e0e0', '#3a3a3a', '#f0c419', '#7e57c2', '#00897b', '#ef6c00', '#795548'].forEach(function (c) {
      sw.appendChild(el('button', { style: 'background:' + c, title: c, onclick: function () { App.model.color = c; UI.applyDisplayStyle(); UI.autosave(); } }));
    });
    body.appendChild(sw);
    var inp = el('input', { type: 'color', value: UI.partColor(App.model.color) });
    inp.addEventListener('input', function () { App.model.color = inp.value; UI.applyDisplayStyle(); UI.autosave(); });
    body.appendChild(el('div', { class: 'row' }, [el('span', { text: 'Custom: ' }), inp]));
    body.appendChild(el('h3', { text: 'Scene' }));
    var g = el('div', { class: 'views' });
    [['gradient', 'Gradient'], ['plain', 'Plain'], ['dark', 'Dark']].forEach(function (s) { g.appendChild(el('button', { text: s[1], onclick: function () { UI.setBg(s[0]); } })); });
    body.appendChild(g);
  }
  function tpProps(body) {
    var m = App.model;
    body.appendChild(el('h3', { text: 'Document properties' }));
    var kv = el('div', { class: 'kv' });
    function field(label, input) { kv.appendChild(el('span', { text: label })); kv.appendChild(input); }
    var asm = isAsm();
    var name = el('input', { type: 'text', value: m.name }); name.addEventListener('change', function () { m.name = name.value || (asm ? 'Assem1' : 'Part1'); UI.rebuild(); });
    field(asm ? 'Assembly name' : 'Part name', name);
    var units = el('select'); [['mm', 'Millimeters (MMGS)'], ['in', 'Inches (IPS)']].forEach(function (u) { var o = el('option', { value: u[0], text: u[1] }); if (m.units === u[0]) o.selected = true; units.appendChild(o); });
    units.addEventListener('change', function () { m.units = units.value; UI.rebuild(); });
    field('Units', units);
    // Material: the materials.js library by class (Edit Material… for the full dialog); a typed density that is not
    // the material's unlinks it (custom density)
    if (typeof Materials !== 'undefined' && !asm) {
      var mat = el('select', { 'data-role': 'material' }), cur = Materials.materialName(m);
      mat.appendChild(el('option', { value: '', text: Materials.NONE }));
      Materials.classes().forEach(function (c) {
        var g = el('optgroup', { label: c.name });
        c.materials.forEach(function (x) { var o = el('option', { value: x.name, text: x.name + ' · ' + x.density + ' kg/m³' }); if (cur === x.name) o.selected = true; g.appendChild(o); });
        mat.appendChild(g);
      });
      mat.addEventListener('change', function () { if (UI.setMaterial) UI.setMaterial(mat.value || null); else { UI.pushUndo(); Materials.apply(m, mat.value || null); UI.rebuild(); } tpProps(body); });
      field('Material', mat);
      if (UI.editMaterial) field('', el('button', { text: 'Edit Material…', onclick: function () { UI.editMaterial(); } }));
    }
    if (!asm) {
      var dens = el('input', { type: 'number', value: m.density, step: 'any' });
      dens.addEventListener('change', function () {
        UI.pushUndo(); m.density = +dens.value || 0;
        var lm = typeof Materials !== 'undefined' ? Materials.of(m) : null;
        if (lm && Math.abs(lm.density - m.density) > 1e-9) { delete m.material; delete m.materialName; }
        UI.rebuild(); tpProps(body);
      });
      field('Density kg/m³', dens);
    }
    body.innerHTML = '';
    body.appendChild(el('h3', { text: 'Document properties' }));
    body.appendChild(kv);
    if (UI.Profiles && UI.Profiles.optionsSection) body.appendChild(UI.Profiles.optionsSection());   // lane profiles: Interface ▸ Lay out Anvil like
    // Image Quality (Tools ▸ Options ▸ Document Properties ▸ Image Quality): the chord tolerance curved faces are
    // meshed to; saved in the document (model.tessellation), an undo step, rebuilds
    if (UI.imageQuality) {
      var iq = UI.imageQuality();
      body.appendChild(el('h3', { text: 'Image Quality' }));
      var kv3 = el('div', { class: 'kv' });
      var qsel = el('select', { 'data-role': 'image-quality' });
      UI.imagePresets().forEach(function (q) { var o = el('option', { value: q.key, text: q.label }); if (iq.preset === q.key) o.selected = true; qsel.appendChild(o); });
      if (iq.preset === 'custom') { var oc = el('option', { value: 'custom', text: 'Custom (' + iq.chordTol + ' mm)' }); oc.selected = true; qsel.appendChild(oc); }
      var tolIn = el('input', { type: 'number', value: iq.chordTol, step: 'any', min: '0.001', 'data-role': 'chord-tol' });
      function applyQ(v) { UI.setImageQuality(v).then(function () { tpProps(body); }, function (e) { UI.toast(e.message); tpProps(body); }); }
      qsel.addEventListener('change', function () { if (qsel.value !== 'custom') applyQ(qsel.value); });
      tolIn.addEventListener('change', function () { applyQ(+tolIn.value); });
      kv3.appendChild(el('span', { text: 'Shaded resolution' })); kv3.appendChild(qsel);
      kv3.appendChild(el('span', { text: 'Chord deviation mm' })); kv3.appendChild(tolIn);
      body.appendChild(kv3);
      body.appendChild(el('p', { html: '<small>Curved faces are meshed so no chord strays more than this from the true surface' + (iq.segsR10 ? ' (a Ø20 circle: ' + iq.segsR10 + ' facets)' : '') + '. Mass properties use the exact surfaces at every setting.</small>' }));
    }
    // rfIF: Dimensions (Tools ▸ Options ▸ Document Properties ▸ Dimensions ▸ Primary precision): the places every
    // dimension without its own precision shows; saved in the document (model.dimPrecision), an undo step, redraws
    if (UI.setDocDimPrecision && !asm) {
      body.appendChild(el('h3', { text: 'Dimensions' }));
      var kv4 = el('div', { class: 'kv', 'data-role': 'dim-precision' });
      var precSel = function (angle) {
        var s = el('select', { 'data-role': angle ? 'dim-prec-angular' : 'dim-prec-linear', title: angle ? 'Angular dimensions: primary precision' : 'Linear dimensions: primary precision' });
        var cur = UI.docDimPrec(angle);
        for (var i = 0; i <= UI.DIM_MAX_PREC; i++) { var o = el('option', { value: String(i), text: UI.dimPrecText(i) }); if (i === cur) o.selected = true; s.appendChild(o); }
        s.addEventListener('change', function () { var o = {}; o[angle ? 'angular' : 'linear'] = +s.value; UI.setDocDimPrecision(o); tpProps(body); });
        return s;
      };
      kv4.appendChild(el('span', { text: 'Primary precision (' + (m.units === 'in' ? 'in' : 'mm') + ')' })); kv4.appendChild(precSel(false));
      kv4.appendChild(el('span', { text: 'Angular precision (°)' })); kv4.appendChild(precSel(true));
      body.appendChild(kv4);
      body.appendChild(el('p', { html: '<small>Decimal places of every dimension set to Document in its PropertyManager (defaults: inch .123, mm .12, angles .12).</small>' }));
    }
    if (UI.occtOptionsSection) body.appendChild(UI.occtOptionsSection(function () { tpProps(body); }));   // r12/occtui12: OpenCascade kernel, After an edit
    // sheet metal: the part's parameters read-only here; Sheet metal parameters… opens the Sheet-Metal PropertyManager
    // (gauge, T, R, bend allowance method, bend table), which rebuilds and is undoable
    body.appendChild(el('h3', { text: 'Sheet metal' }));
    if (m.sheet) {
      var sm = m.sheet, smType = sm.bendAllowanceType || 'kfactor';
      var kv2 = el('div', { class: 'kv', 'data-role': 'sheet-props' });
      var smRows = [['Thickness', sm.thickness], ['Bend radius', sm.bendRadius]];
      if (sm.gauge != null) smRows.unshift(['Gauge', sm.gauge + ' ga (' + (typeof sm.gaugeTable === 'object' ? sm.gaugeTable.name || 'shop table' : sm.gaugeTable) + ')']);
      smRows.push(['Bend allowance', { kfactor: 'K-Factor', allowance: 'Bend Allowance', deduction: 'Bend Deduction', table: 'Bend Table' }[smType] || smType]);
      if (smType === 'kfactor' || smType === 'table') smRows.push(['K-factor', K.sheetKFactor(sm)]);
      if (smType === 'allowance') smRows.push(['BA', sm.bendAllowance]);
      if (smType === 'deduction') smRows.push(['BD', sm.bendDeduction]);
      if (smType === 'table' && sm.bendTable) smRows.push(['Bend table', sm.bendTable.rows.length + ' rows (' + sm.bendTable.kind + ')']);
      smRows.forEach(function (r) { kv2.appendChild(el('span', { text: r[0] })); kv2.appendChild(el('span', { text: String(r[1]) })); });
      body.appendChild(kv2);
      try { var flat = K.flatPattern(m, App.build, App.mesh); body.appendChild(el('p', { 'data-role': 'flat-size', text: UI.flatSizeText ? UI.flatSizeText(flat) : '' })); } catch (e) { }
      body.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn', text: 'Sheet metal parameters…', onclick: function () { if (UI.cmdSheetMetal) UI.cmdSheetMetal(); } })]));
    } else body.appendChild(el('p', { html: '<small>No sheet metal parameters: a Base Flange/Tab sets them (Sheet Metal tab). New parts default to K = 0.5.</small>' }));
  }

  var lastScript = null;
  function tpMacro(body) {
    var ta = el('textarea', { spellcheck: 'false' });
    ta.value = lastScript != null ? lastScript : modelScript();
    ta.addEventListener('input', function () { lastScript = ta.value; });
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(true); } e.stopPropagation(); });
    var out = el('div', { class: 'err-text' });
    function run(replace) {
      out.textContent = '';
      runScript(ta.value, replace).then(function (res) {
        if (res.error) { out.textContent = res.error; UI.toast('Script error'); }
        else UI.toast((replace ? 'Model rebuilt from script' : 'Script appended') + ' · ' + docCount());
      });
    }
    var row = el('div', { class: 'row' });
    row.appendChild(el('button', { class: 'btn primary', text: 'Run (replace model)', title: 'Ctrl+Enter', onclick: function () { run(true); } }));
    row.appendChild(el('button', { class: 'btn', text: 'Append to model', onclick: function () { run(false); } }));
    row.appendChild(el('button', { class: 'btn', text: 'Script from model', onclick: function () { ta.value = modelScript(); lastScript = ta.value; } }));
    row.appendChild(el('button', { class: 'btn', text: 'Copy', onclick: function () { copyText(ta.value); } }));
    var ex = el('select');
    ex.appendChild(el('option', { value: '', text: 'Insert example…' }));
    EXAMPLES.forEach(function (e, i) { ex.appendChild(el('option', { value: String(i), text: e.name })); });
    ex.addEventListener('change', function () { if (ex.value !== '') { ta.value = EXAMPLES[+ex.value].code; lastScript = ta.value; ex.value = ''; } });
    row.appendChild(ex);
    body.appendChild(el('p', { html: 'Scripts run against <code>p</code>, a part builder, or <code>a</code>, an assembly builder (a script calling <code>a.insert</code> / <code>a.mate</code> opens as an assembly). The model and this script are interchangeable: <b>Script from model</b> regenerates code from the feature tree.' }));
    body.appendChild(ta);
    body.appendChild(row);
    body.appendChild(out);
    var ref = el('details');
    ref.appendChild(el('summary', { text: 'API reference' }));
    ref.appendChild(el('pre', { text:
'p.name(str) .units("mm"|"in") .density(kg_m3) .color("#hex")\n' +
'p.plane(ref, offset, name?) -> planeId          ref: "Front"|"Top"|"Right"\n' +
'p.sketch(ref | planeId | {ref,offset}, offset?) -> sketch builder\n' +
'  .line(x1,y1,x2,y2)  .rect(x,y,w,h)  .centerRect(cx,cy,w,h)\n' +
'  .circle(cx,cy,r)  .polygon(cx,cy,r,n,rot)  .slot(x1,y1,x2,y2,w)\n' +
'  .arc(cx,cy,r,a0,a1)  .polyline([[x,y],...],closed)  .point(x,y)\n' +
'  .extrude(d,opts) .cut(d|"through",opts) .revolve(deg,opts) .revolveCut(deg,opts)\n' +
'  .id()  .end()\n' +
'p.extrude(depth, {cut, reverse, midplane, throughAll, depth2, both, sketch, name})\n' +
'p.cut(depth|"through", opts)\n' +
'p.revolve(angle, {axis:"y"|"x"|lineIndex|{x1,y1,x2,y2}, reverse, cut, sketch})\n' +
'p.linearPattern({feature, dir:"x"|"y"|"z", reverse, spacing, count, dir2, spacing2, count2})\n' +
'p.circularPattern({feature, axis, center:[x,y,z], count, angle, equal})\n' +
'p.mirror("Front"|"Top"|"Right", {feature | body:true, offset})\n' +
'p.hole(planeRef, x, y, dia, {depth, forward})   p.box(w,d,h,{at,centered,cut})\n' +
'p.cylinder(r,h,{axis,at,cut})   p.last() -> id of the last feature\n\n' +
'Assemblies (a = assembly builder):\n' +
'a.name(str) .units("mm")   a.insert({example|script|model}, {position, rotation, fixed, name}) -> id\n' +
'a.coincident(refA, refB, {alignment:"aligned"|"anti-aligned"})   a.concentric(refA, refB)\n' +
'a.mate(type, refA, refB, opts)   a.fix(c)   a.float(c)\n' +
'refs: {component, face:[x,y,z]} {component, cylinder:[x,y,z]} {component, plane:"Top"} {component, axis:"y"} {plane:"Top"}\n\n' +
'Sketch frames: Front (x=X, y=Y, n=Z)  Top (x=X, y=-Z, n=Y)  Right (x=-Z, y=Y, n=X)\n' +
'Extrudes go along the plane normal; reverse:true goes the other way.\n\n' +
'Browser console: anvil.run(code) anvil.append(code) anvil.script() anvil.model()\n' +
'anvil.load(json) anvil.stl() anvil.dxfFace(i) anvil.mass() anvil.faces() anvil.bodies() anvil.selectBody(i) anvil.png()\n' +
'anvil.newAssembly(name) anvil.newPart(name) anvil.insert(src, opts) anvil.mate(type, a, b, opts) anvil.components() anvil.mates()\n' +
'anvil.fix(c, fixed) anvil.removeComponent(id) anvil.removeMate(id)' }));
    body.appendChild(ref);
  }

  // ------------------------------------------------------------------ documents: part / assembly
  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function hasAssembly() { return typeof Assembly !== 'undefined'; }
  function modelScript() { return isAsm() && hasAssembly() ? Assembly.generateScript(App.model) : K.generateScript(App.model); }
  function docCount() { return isAsm() ? (App.model.components || []).length + ' components, ' + (App.model.mates || []).length + ' mates' : App.model.features.length + ' features'; }
  // The last part document stays available to Insert Components ("Part1 (last part)") after switching to an assembly.
  function rememberPart() {
    var m = App.model;
    if (!m || m.type === 'assembly' || !Array.isArray(m.features) || !m.features.length) return;
    App.lastPart = JSON.parse(JSON.stringify(m));
    try { localStorage.setItem('anvil.lastPart', JSON.stringify(App.lastPart)); } catch (e) { }
  }
  function newAssembly(name) {
    if (!hasAssembly()) { UI.toast('Assemblies need assembly.js, which did not load.'); return Promise.reject(new Error('assembly.js is not loaded')); }
    rememberPart();
    App.hiddenBodies = {};
    var am = Assembly.newAssembly(name || 'Assem1'); am.units = UI.defaultUnits();   // r15/inches15
    return UI.loadModel(am).then(function () {
      UI.setRibbonTab('Assembly');
      UI.setStatus('New assembly. Assembly tab → Insert Components to add parts, then Mate to position them.');
      return window.anvil.summary();
    });
  }
  function newPart(name) {
    rememberPart();
    App.hiddenBodies = {};
    var pm0 = K.newModel(name || 'Part1'); pm0.units = UI.defaultUnits();   // r15/inches15: inches unless Tools ▸ Default units says mm
    return UI.loadModel(pm0).then(function () { return window.anvil.summary(); });
  }
  // An assembly script calls a.insert / a.mate …; a script run while an assembly is open is one too unless it drives `p.`
  function isAssemblyCode(code) {
    if (!hasAssembly()) return false;
    if (Assembly.isAssemblyScript(code)) return true;
    return isAsm() && !/(^|[^\w.$])p\s*\.\s*\w+\s*\(/.test(code);
  }
  // Resolves to { ok: true } or { error: text } once the model is rebuilt (never rejects). kind: 'part' | 'assembly'
  // forces the document type (Design Library entries); otherwise assembly scripts are detected (isAssemblyCode).
  function runScript(code, replace, kind) {
    var asm = kind ? kind === 'assembly' : isAssemblyCode(code);
    if (asm) return runAssemblyScript(code, replace);
    var model, p;
    try {
      if (replace) rememberPart();
      if (!replace && isAsm()) throw new Error('This is a part script: open a part (File ▸ New ▸ Part) to append to it.');
      model = replace ? K.newModel('Part1') : App.model;
      if (replace) model.units = UI.defaultUnits();   // r15/inches15: a script's own .units() overrides
      if (!replace) UI.pushUndo();
      if (replace && !isAsm()) { model.color = App.model.color; model.density = App.model.density; if (App.model.material) model.material = App.model.material; }
      K.runScript(model, code);
      if (replace) { UI.pushUndo(); var undo = App.undo; App.hiddenBodies = {}; p = unsavedAfter(UI.loadModel(model)); App.undo = undo; }
      else p = UI.rebuild();
    } catch (e) {
      return Promise.resolve({ error: (e && e.message) || String(e) });
    }
    return finishScript(p);
  }
  // a model a script made replaces the document as a new, unsaved one (Design Library entries and opened scripts are
  // marked clean again by their callers)
  function unsavedAfter(p) { return p.then(function (b) { UI.markUnsaved(); return b; }); }
  // Assembly scripts (a.insert / a.mate): replace = a new assembly document, else appended to the open assembly.
  function runAssemblyScript(code, replace) {
    var model, p;
    try {
      if (!hasAssembly()) throw new Error('Assemblies need assembly.js, which did not load.');
      if (!replace && !isAsm()) throw new Error('This is an assembly script: open an assembly (File ▸ New ▸ Assembly) to append to it.');
      if (replace) rememberPart();
      model = replace ? Assembly.newAssembly('Assem1') : App.model;
      if (replace) model.units = UI.defaultUnits();   // r15/inches15
      if (!replace) UI.pushUndo();
      Assembly.runScript(model, code);
      if (replace) { UI.pushUndo(); var undo = App.undo; App.hiddenBodies = {}; p = unsavedAfter(UI.loadModel(model)); App.undo = undo; }
      else p = UI.rebuild();
    } catch (e) {
      return Promise.resolve({ error: (e && e.message) || String(e) });
    }
    return finishScript(p);
  }
  function errorOwnerName(id) {
    var f = K.findFeature(App.model, +id);
    if (!f && isAsm() && hasAssembly()) f = Assembly.findComponent(App.model, +id) || Assembly.findMate(App.model, +id);
    return f ? f.name : id;
  }
  function finishScript(p) {
    return p.then(function () {
      UI.refreshStatus();
      UI.setStatus('Script ran: ' + docCount() + ', rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms.');
      var errs = Object.keys(App.build.errors);
      if (errs.length) return { error: errs.map(function (id) { return errorOwnerName(id) + ': ' + App.build.errors[id]; }).join('\n') };
      return { ok: true };
    }, function (e) {
      return { error: (e && e.message) || String(e) };
    });
  }

  // ------------------------------------------------------------------ files & exports
  // download(name, data, mime): in a browser, the browser's download; in the Windows app (desktop/preload.js
  // anvilDesktop.files) Windows' own Save dialog in the last folder used, then the file is written there. Returns a
  // Promise of { path } in the app (null when cancelled), undefined in a browser.
  function download(name, text, mime) {
    if (desk()) return deskExport(name, text);
    try {
      var blob = new Blob([text], { type: mime || 'text/plain' });
      var a = el('a', { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    } catch (e) { }
  }
  // ---- the Windows app's files (desktop/main.js): Open / Save dialogs, the document's own path (App.filePath) ----
  // SolidWorks behaviour: File ▸ Open shows Windows' Open box and remembers the file's path; Save (Ctrl+S) writes
  // straight back to that path; the first Save and Save As show Windows' Save box. App.fileName stays the name of a
  // document saved in the browser's own storage (the Task Pane's list); a new or loaded model clears App.filePath.
  function desk() { var d = window.anvilDesktop; return d && d.isDesktop && d.files ? d.files : null; }
  var deskPending = null;   // { name, path, at }: the file Save As picked for a DXF / DWG the Output PropertyManager writes
  var deskLastSaved = null; // { path, base, at }: an OBJ just saved, so its .mtl goes beside it without a second box
  var EXT_FILTERS = { json: 'Anvil document', js: 'Anvil script', step: 'STEP', stp: 'STEP', igs: 'IGES', iges: 'IGES', stl: 'STL', obj: 'OBJ', mtl: 'OBJ materials',
    '3mf': '3D Manufacturing Format', dxf: 'DXF', dwg: 'DWG', pdf: 'PDF', svg: 'SVG', png: 'PNG image', drawing: 'Anvil drawing', sldcrv: 'Curve file', sldblk: 'Sketch block' };
  function extOf(name) { return ((/\.([a-z0-9]+)$/i.exec(String(name || '')) || [])[1] || '').toLowerCase(); }
  function filtersFor(name) {
    var ext = extOf(name);
    return (ext ? [{ name: (EXT_FILTERS[ext] || ext.toUpperCase()) + ' (*.' + ext + ')', extensions: [ext] }] : []).concat([{ name: 'All files (*.*)', extensions: ['*'] }]);
  }
  function deskData(data) {
    if (typeof Blob !== 'undefined' && data instanceof Blob) return data.arrayBuffer();
    return Promise.resolve(data);
  }
  // a failed write: a normal Anvil message; the document stays open and unsaved
  function deskFailed(what, r) {
    var msg = (r && r.error) || String(r);
    UI.setStatus('Not saved: ' + msg);
    UI.showModal({ title: 'Anvil', body: el('div', {}, [el('p', { text: what + ' could not be saved.' }), el('p', { text: msg }),
      el('p', { class: 'dlg-note', text: 'Your work is still open in Anvil. Save As to another folder, or fix the problem and save again.' })]),
      buttons: [{ label: 'OK', primary: true, action: UI.closeModal }] });
  }
  function deskWrite(path, data, opts) {
    return deskData(data).then(function (d) { return desk().write(path, d, opts); });
  }
  // an export: straight to the file Save As picked (DXF / DWG after the Output PropertyManager), beside its OBJ
  // (.mtl), or Windows' Save box
  function deskExport(name, data) {
    var now = Date.now(), ext = extOf(name), p;
    if (deskPending && deskPending.name === name && now - deskPending.at < 30 * 60000) { p = Promise.resolve({ path: deskPending.path }); deskPending = null; }
    else if (ext === 'mtl' && deskLastSaved && deskLastSaved.base === name.replace(/\.mtl$/i, '') && now - deskLastSaved.at < 60000) {
      var obj = deskLastSaved.path;
      return deskWrite(obj, data, { sibling: name }).then(function (r) { if (r && r.error) { deskFailed(name, r); return null; } return r; });
    }
    else p = desk().saveDialog({ name: name, filters: filtersFor(name), kind: 'export' });
    return p.then(function (pick) {
      if (!pick) return null;
      if (pick.error) { deskFailed(name, pick); return null; }
      return deskWrite(pick.path, data).then(function (r) {
        if (!r || r.error) { deskFailed(name, r); return null; }
        if (ext === 'obj') deskLastSaved = { path: r.path, base: name.replace(/\.obj$/i, ''), at: Date.now() };
        // (rfIK) File ▸ Save Drawing As: the open drawing now has this file, so Ctrl+S writes back to it
        if (ext === 'drawing' && drawingDoc()) { App.drawingPath = { path: r.path, name: drawingDoc().name, part: partJson(), partDirty: !!(UI.isDirty && UI.isDirty()) }; recentNote(r.path); syncDocument(); }
        UI.setStatus('Saved ' + r.path);
        return r;
      });
    }, function (e) { deskFailed(name, e && e.message || e); return null; });
  }
  function deskSetPath(p) {
    App.filePath = p || null;
    if (p) App.importPath = null;   // the imported file's new part has its own file now
    syncDocument(true);
  }
  function docBase() { return String(App.model.name || (isAsm() ? 'Assem1' : 'Part1')).replace(/[\\\/:*?"<>|]+/g, '_'); }
  function docFilters() {
    var doc = isAsm() ? 'Assembly' : 'Part';
    return [{ name: 'Anvil ' + doc + ' (*.anvil.json)', extensions: ['json'] }, { name: 'Anvil script (*.anvil.js)', extensions: ['js'] }];
  }
  // writes the open document (JSON, or its script for a .js path) to path; onSaved runs after a good save
  function deskSaveTo(path, onSaved) {
    var data = /\.js$/i.test(path) ? modelScript() : JSON.stringify(App.model, null, 1), name = String(path).replace(/^.*[\\\/]/, '');
    return deskWrite(path, data).then(function (r) {
      if (!r || r.error) { deskFailed(name, r); return false; }
      deskSetPath(r.path);
      UI.markClean();
      recentNote(r.path);
      UI.toast('Saved ' + name);
      UI.setStatus('Saved ' + r.path);
      if (typeof onSaved === 'function') onSaved();
      return true;
    }, function (e) { deskFailed(name, e && e.message || e); return false; });
  }
  // Save As for the document: Windows' Save box in the document's folder (else the last folder). (rfIK) A part made
  // by opening a STEP, IGES, DXF, DWG, STL … (App.importPath) is saved beside that file under its name, as SolidWorks
  // offers bracket.SLDPRT beside bracket.step; a part a drawing file was opened on goes beside the drawing.
  function nearPath() { return App.importPath || (App.drawingPath && App.drawingPath.path) || null; }
  function fileBase(p) { return String(p || '').replace(/^.*[\\\/]/, '').replace(/\.(anvil\.json|anvil\.js|[a-z0-9]+)$/i, '').replace(/[\\\/:*?"<>|]+/g, '_') || docBase(); }
  function deskSaveDocAs(onSaved) {
    var o = { name: (App.importPath ? fileBase(App.importPath) : docBase()) + (App.filePath && /\.js$/i.test(App.filePath) ? '.anvil.js' : '.anvil.json'), filters: docFilters(), kind: 'document' };
    if (nearPath()) o.near = nearPath();
    return desk().saveDialog(o).then(function (pick) {
      if (!pick) return false;
      return deskSaveTo(pick.path, onSaved);
    });
  }
  function deskSave(onSaved) { return App.filePath ? deskSaveTo(App.filePath, onSaved) : deskSaveDocAs(onSaved); }
  // (rfIK) a drawing opened from a .drawing file (or saved as one) in the Windows app: App.drawingPath = { path, name
  // (the drawing's name in the part), part (the part's JSON less its drawings when the drawing was opened or saved),
  // partDirty (the part had unsaved changes then) }. While that drawing shows, Save (Ctrl+S, the Save of "Save changes
  // to …?") writes the drawing file back in place; when the part changed too, the part is saved as well (its own file,
  // else Windows' Save box beside the drawing), as SolidWorks' Save Modified Documents saves both.
  function drawingDoc() {
    var DW = UI.drawingInternal;
    if (!UI.drawingActive || !UI.drawingActive() || !DW || !DW.doc) return null;
    return DW.doc() || null;
  }
  function partJson() {
    var m = App.model, o = {};
    if (!m) return '';
    Object.keys(m).forEach(function (k) { if (k !== 'drawings') o[k] = m[k]; });
    try { return JSON.stringify(o); } catch (e) { return ''; }
  }
  function drawingTarget() {
    var dp = App.drawingPath, dc = dp && drawingDoc();
    return dc && dc.name === dp.name ? dp : null;
  }
  function deskSaveDrawing(dp, onSaved) {
    var DW = UI.drawingInternal, dc = drawingDoc(), name = String(dp.path).replace(/^.*[\\\/]/, '');
    if (DW.settle) DW.settle();
    var data = JSON.stringify(Drawing.drawingFile(dc, App.model, App.fileName || null), null, 1);
    return deskWrite(dp.path, data).then(function (r) {
      if (!r || r.error) { deskFailed(name, r); return false; }
      if (DW.markDrawingClean) DW.markDrawingClean();
      recentNote(dp.path);
      UI.setStatus('Saved ' + r.path);
      var pj = partJson();
      if (!dp.partDirty && pj === dp.part) {
        UI.markClean();
        UI.toast('Saved ' + name);
        if (typeof onSaved === 'function') onSaved();
        return true;
      }
      UI.toast('Saved ' + name + '. ' + (App.model.name || 'The part') + ' changed too: saving it.');
      return deskSave(function () { dp.part = partJson(); dp.partDirty = false; if (typeof onSaved === 'function') onSaved(); });
    }, function (e) { deskFailed(name, e && e.message || e); return false; });
  }
  // File ▸ Open in the app: Windows' Open box with Anvil's file types; an Anvil document or script keeps its path
  function deskOpen() {
    var filters = OPEN_TYPES.map(function (t) {
      return { name: t[1].replace(/\s*\(\*.*$/, '') + ' (' + t[2].split(',').map(function (x) { return '*' + x; }).join(';') + ')', extensions: t[2].split(',').map(function (x) { return x.replace(/^\./, ''); }) };
    }).concat([{ name: 'All files (*.*)', extensions: ['*'] }]);
    return desk().open({ filters: filters }).then(function (r) {
      if (!r) return null;
      if (r.error) { UI.showModal({ title: 'Open', body: el('div', {}, [el('p', { text: r.name || r.path || 'The file' }), el('p', { text: r.error })]), buttons: [{ label: 'OK', primary: true, action: UI.closeModal }] }); return null; }
      return openDiskFile(r);
    });
  }
  // a file read from disk (r = { path, name, data }: Windows' Open box, or a file dropped on the window; path null in a
  // browser):
  // opened as File ▸ Open would. A document Anvil can write back (a part / assembly JSON or a script) keeps its path;
  // an imported STEP, DXF … is a new part (Save asks where), and a drawing saves itself (File ▸ Save Drawing As)
  // (rfIK) In the Windows app an import (STEP, DXF …) keeps its file as App.importPath (Save asks where, starting
  // beside it with its name) and a drawing file as App.drawingPath (Ctrl+S writes back to it); every file opened goes
  // on File ▸ Recent Documents.
  function openDiskFile(r) {
    var keep = /\.js$/i.test(r.name), isDrawing = /\.drawing$/i.test(r.name);
    if (/\.json$/i.test(r.name)) { try { var j = JSON.parse(new TextDecoder('utf-8').decode(r.data)); isDrawing = !!j && j.kind === 'anvil-drawing'; keep = !!j && !isDrawing && (Array.isArray(j.features) || j.type === 'assembly'); } catch (e) { keep = false; } }
    var d = r.data;
    if (d && typeof d !== 'string' && ArrayBuffer.isView(d)) d = d.byteOffset === 0 && d.byteLength === d.buffer.byteLength ? d.buffer : d.slice().buffer;
    var model0 = App.model, dirty0 = !!(UI.isDirty && UI.isDirty());
    return openFileData(r.name, d).then(function (s) {
      if (keep && r.path) deskSetPath(r.path);
      else if (r.path && isDrawing) {
        var dc = s && drawingDoc();
        if (dc) {
          // the drawing came in on a part just opened (clean), or on the part already open (as clean as it was)
          var partDirty = App.model === model0 && dirty0;
          if (!partDirty) UI.markClean();
          App.drawingPath = { path: r.path, name: dc.name, part: partJson(), partDirty: partDirty };
        }
      } else if (r.path && !keep) App.importPath = r.path;
      if (s !== null || !isDrawing) recentNote(r.path || null, r.name);   // (a drawing whose part was not given: null)
      syncDocument();
      UI.setStatus('Opened ' + (r.path || r.name));
      return s;
    }, function (e) { UI.toast('Could not open ' + r.name + ': ' + ((e && e.message) || e)); return null; });
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { UI.toast('Copied to clipboard'); }, function () { UI.toast('Copy failed — select the text and press Ctrl+C'); });
    else UI.toast('Select the text and press Ctrl+C');
  }
  function exportDialog(title, filename, text, mime) {
    var ta = el('textarea', { spellcheck: 'false' });
    ta.value = text;
    var body = el('div', {}, [el('p', { html: '<b>' + filename + '</b> · ' + (text.length / 1024).toFixed(1) + ' KB. Download it, or copy the text if downloads are blocked where this page is hosted.' }), ta]);
    UI.showModal({ title: title, body: body, buttons: [
      { label: 'Download', primary: true, action: function () { download(filename, text, mime); } },
      { label: 'Copy', action: function () { ta.select(); copyText(text); } },
      { label: 'Close', action: UI.closeModal }
    ] });
    setTimeout(function () { ta.setSelectionRange(0, 0); ta.scrollTop = 0; }, 0);
  }
  function safeName() { return (App.model.name || (isAsm() ? 'assembly' : 'part')).replace(/[^\w\-]+/g, '_'); }
  function exportSTL() {
    if (!App.mesh || !App.mesh.triCount) { UI.toast('Nothing to export yet.'); return; }
    exportDialog('Export STL', safeName() + '.stl', K.exportSTL(App.mesh, App.model.name), 'model/stl');
  }
  function exportFaceDXF() {
    if (!App.sel || App.sel.kind !== 'face') { UI.toast('Select a planar face first (click it), then export.'); UI.setStatus('Face to DXF: click a face in the graphics area, then run the command again.'); return; }
    var dxf = K.exportDXFFace(App.mesh, App.sel.index, App.model.units);
    if (!dxf) { UI.toast('Could not outline that face.'); return; }
    exportDialog('Export face outline as DXF', safeName() + '_face' + App.sel.index + '.dxf', dxf, 'application/dxf');
  }
  function exportSketchDXF(sketch) {
    if (!sketch) {
      if (App.mode === 'sketch') sketch = UI.activeSketchFeature();
      else if (App.sel && App.sel.kind === 'feature') { var f = K.findFeature(App.model, App.sel.id); if (f && f.type === 'sketch') sketch = f; else if (f && f.sketch != null) sketch = K.findFeature(App.model, f.sketch); }
    }
    if (!sketch) { UI.toast('Select a sketch in the tree (or open one) first.'); return; }
    // the DXF/DWG Output PropertyManager with Sketch chosen: version, construction geometry, DWG, file name
    UI.cmdDxfOutput({ export: 'sketch', sketch: sketch.id });
  }
  function exportJSON() { exportDialog('Model JSON', safeName() + '.anvil.json', JSON.stringify(App.model, null, 1), 'application/json'); }
  function exportScript() { exportDialog(isAsm() ? 'Assembly as script' : 'Model as script', safeName() + '.anvil.js', modelScript(), 'text/javascript'); }
  function screenshot() {
    UI.render();
    var url = UI.renderer.domElement.toDataURL('image/png');
    var img = el('img', { src: url, style: 'max-width:100%;border:1px solid #ccc' });
    UI.showModal({ title: 'Screenshot', body: el('div', {}, [img]), buttons: [{ label: 'Download PNG', primary: true, action: function () { var a = el('a', { href: url, download: safeName() + '.png' }); document.body.appendChild(a); a.click(); a.remove(); } }, { label: 'Close', action: UI.closeModal }] });
  }
  // New SOLIDWORKS-style document: Part or Assembly (the current one stays in File Explorer only if it was saved).
  function fileNew() {
    UI.showModal({ title: 'New Document', body: '<p>Start a new document? The current one stays in File Explorer only if you saved it.</p><p><b>Part</b>: a single design component. <b>Assembly</b>: parts positioned by mates.</p>', buttons: [
      { label: 'New part', primary: true, action: function () { UI.closeModal(); confirmDiscard(null, function () { newPart('Part1'); }); } },
      { label: 'New assembly', action: function () { UI.closeModal(); confirmDiscard(null, function () { newAssembly('Assem1'); }); } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  // SolidWorks' "Save changes to Part1?" before the open document is replaced (File ▸ New, Open, a saved file or a
  // Design Library entry from the Task Pane) or put away (Close Drawing: drawing-ui.js requestClose). With no
  // unsaved changes onProceed runs at once. Save saves under the document's name in this browser (asking for one the
  // first time), then goes on; Don't Save goes on; Cancel leaves everything as it was.
  // opts.dirty: whether to ask (default: the document has unsaved changes); opts.onDiscard: what Don't Save does
  // instead of onProceed (Close Drawing puts the drawing back as it was, then closes it).
  function confirmDiscard(name, onProceed, opts) {
    opts = opts || {};
    var dirty = opts.dirty != null ? !!opts.dirty : !!(UI.isDirty && UI.isDirty());
    if (!dirty) { onProceed(); return; }
    UI.showModal({ title: 'Anvil', body: el('div', { class: 'save-changes' }, [el('p', { text: 'Save changes to ' + (name || App.model.name || (isAsm() ? 'Assem1' : 'Part1')) + '?' })]), buttons: [
      { label: 'Save', primary: true, action: function () { UI.closeModal(); if (desk()) fileSave(onProceed); else if (App.fileName) { if (saveInBrowser(App.fileName)) onProceed(); } else fileSave(onProceed); } },
      { label: "Don't Save", action: function () { UI.closeModal(); (opts.onDiscard || onProceed)(); } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  // File ▸ Open: an Anvil document (.anvil.json / .json), a script (.anvil.js / .js) or a neutral CAD file (STEP, STL,
  // OBJ, 3MF — exchange.js), picked from disk or pasted. A neutral file opens as a new part whose one feature is
  // Imported1; Insert ▸ Features ▸ Imported… adds one to the open part instead.
  var OPEN_TYPES = [
    ['all', 'All Anvil and CAD files (*.json;*.js;*.drawing;*.step;*.stp;*.igs;*.stl;*.obj;*.3mf;*.dxf;*.dwg)', '.json,.js,.drawing,.step,.stp,.igs,.iges,.stl,.obj,.3mf,.dxf,.dwg'],
    ['anvil', 'Anvil documents, drawings and scripts (*.anvil.json;*.drawing;*.anvil.js)', '.json,.js,.drawing'],   // rfAE: + .drawing
    ['step', 'STEP AP203/AP214 (*.step;*.stp)', '.step,.stp'],
    ['iges', 'IGES (*.igs;*.iges), read by OpenCascade', '.igs,.iges'],
    ['stl', 'STL (*.stl)', '.stl'],
    ['obj', 'OBJ (*.obj)', '.obj'],
    ['3mf', '3D Manufacturing Format (*.3mf)', '.3mf'],
    ['dxf', 'DXF (*.dxf), as a 2D sketch on the Top Plane', '.dxf'],   // dxf-import (ui-sketch-import.js)
    ['dwg', 'DWG (*.dwg), as a 2D sketch on the Top Plane (needs the local Anvil server)', '.dwg']   // dwg-import
  ];
  function hasExchange() { return typeof Exchange !== 'undefined'; }
  function neutralFile(name) { return /\.(step|stp|p21|igs|iges|stl|obj|3mf)$/i.test(String(name || '')); }
  function readFile(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(file); });
  }
  function bytesText(data) { return typeof data === 'string' ? data : Exchange.fromUtf8(new Uint8Array(data)); }
  // openFileData(name, data, opts?) -> Promise of the summary. data: text, ArrayBuffer or Uint8Array.
  function openFileData(name, data, opts) {
    opts = opts || {};
    if (/\.dxf$/i.test(String(name || '')) && UI.openDXFFile) return UI.openDXFFile(name, data);   // dxf-import: a new part, the DXF in Sketch1
    if (/\.dwg$/i.test(String(name || '')) && UI.openDWGFile) return UI.openDWGFile(name, data);   // dwg-import: the same after the local server's conversion
    if (neutralFile(name) || opts.format) return opts.into === 'current' ? importIntoCurrent(name, data, opts) : importIntoNew(name, data, opts);
    // (rfAE) a drawing document (File ▸ Save Drawing As): it opens on its part (drawing-ui-panels.js openDrawingFile)
    if (/\.drawing$/i.test(String(name || '')) && UI.openDrawingFile) return UI.openDrawingFile(name, data, opts);
    var txt = typeof data === 'string' ? data : new TextDecoder('utf-8').decode(new Uint8Array(data));
    txt = txt.trim();
    if (txt.charAt(0) === '{') {
      var jm = JSON.parse(txt);
      if (jm && jm.kind === 'anvil-drawing' && UI.openDrawingFile) return UI.openDrawingFile(name, jm, opts);
      rememberPart(); App.hiddenBodies = {};
      return UI.loadModel(jm).then(function () { return window.anvil.summary(); });
    }
    return runScript(txt, true).then(function (r) { if (r.error) throw new Error(r.error); UI.markClean(); return window.anvil.summary(); });
  }
  function importStatus(res, what) {
    var st = res.stats || {};
    UI.setStatus(what + ' ' + (res.file || res.name) + ': ' + st.solids + ' solid' + (st.solids === 1 ? '' : 's') + ', ' + st.triangles + ' triangles' + (res.warnings && res.warnings.length ? '. ' + res.warnings.join(' ') : '.'));
    if (res.warnings && res.warnings.length) UI.toast(res.warnings[0]);
  }
  // importData(name, data, units, opts) -> Promise of an exchange.js import result. STEP / IGES go through OpenCascade
  // (ui-occt.js, any surfaces, the file kept on the feature so OpenCascade rebuilds it exactly) for IGES, while
  // Tools ▸ OpenCascade kernel is on, or when Anvil's own STEP reader cannot take the file; everything else is Anvil's.
  function importData(name, data, units, opts) {
    opts = opts || {};
    var fmt = opts.format || Exchange.formatOf(name, typeof data === 'string' ? data : null);
    var occt = !!(UI.occt && UI.occt.canImport() && (fmt === 'step' || fmt === 'iges'));
    var first = null;
    if (!(occt && (fmt === 'iges' || UI.occt.on()))) {
      try { return Promise.resolve(Exchange.importFile(name, data, { units: units, sourceUnits: opts.sourceUnits, format: opts.format })); }
      catch (e) { if (!occt) return Promise.reject(e); first = e; }
    }
    var text = bytesText(data), base = String(name || 'Imported').replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '');
    UI.setStatus('Reading ' + String(name || '').replace(/^.*[\\\/]/, '') + ' with OpenCascade…');
    return UI.occt.importFile(fmt, text).then(function (r) {
      // (rfLR) 'auto' (File ▸ Open) keeps an inch STEP file's inches, as Anvil's own reader does; OpenCascade hands every
      // file over in millimetres, so the same customer file opened as an inch part with OpenCascade off and as a
      // millimetre part (38.1 for 1.5) with it on, which is the default wherever the engine is installed
      var auto = fmt === 'step' && /CONVERSION_BASED_UNIT\s*\(\s*'INCH'/i.test(text) ? 'in' : 'mm';
      var res = Exchange.finishImport('step', { units: units === 'auto' ? auto : units }, r.solids, 1, []);
      res.format = fmt; res.name = base; res.file = String(name || '').replace(/^.*[\\\/]/, '');
      res.brep = { format: fmt, text: text };
      return res;
    }, function (e) { throw first ? new Error(first.message + ' (OpenCascade: ' + e.message + ')') : e; });
  }
  function importIntoNew(name, data, opts) {
    if (!hasExchange()) return Promise.reject(new Error('exchange.js is not loaded'));
    return importData(name, data, (opts && opts.units) || 'auto', opts).then(function (res) {
      rememberPart(); App.hiddenBodies = {};
      return UI.loadModel(Exchange.newPartFromImport(res, { merge: opts && opts.merge })).then(function () { importStatus(res, 'Opened'); return window.anvil.summary(); });
    });
  }
  function importIntoCurrent(name, data, opts) {
    if (!hasExchange()) return Promise.reject(new Error('exchange.js is not loaded'));
    if (isAsm()) return Promise.reject(new Error('Open a part first: imported bodies go into a part (File ▸ Open makes a new one).'));
    if (App.mode === 'sketch' && UI.exitSketch) UI.exitSketch(true);
    return importData(name, data, App.model.units === 'in' ? 'in' : 'mm', opts).then(function (res) { return insertImported(res, opts); });
  }
  function insertImported(res, opts) {
    UI.pushUndo();
    var f = Exchange.importFeature(App.model, res, { merge: opts && opts.merge });
    f.id = App.model.nextId++;
    App.model.features.push(f);
    return UI.afterRebuild(UI.rebuild(), function () {
      App.sel = { kind: 'feature', id: f.id };
      UI.updateHighlights(); UI.refreshTree();
      importStatus(res, f.name + ' from');
      return window.anvil.summary();
    });
  }
  // pick a file from disk: resolves to { name, data } (ArrayBuffer), or never when the picker is cancelled
  function pickFile(accept, onFile) {
    var inp = el('input', { type: 'file', accept: accept, style: 'display:none' });
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0];
      inp.remove();
      if (!file) return;
      readFile(file).then(function (buf) { onFile(file.name, buf); }, function (e) { UI.toast('Could not read ' + file.name + ': ' + (e && e.message || e)); });
    });
    document.body.appendChild(inp);
    inp.click();
  }
  function fileOpen() { confirmDiscard(null, desk() ? deskOpen : showOpenDialog); }
  // what a file of this name opens as, for the Open dialog's file card: [badge, line]
  function openKind(name) {
    var n = String(name || '').toLowerCase(), ext = (/\.([a-z0-9]+)$/.exec(n) || [])[1] || '';
    if (/\.anvil\.json$|\.json$/.test(n)) return ['JSON', 'Anvil document: opens as it was saved'];
    if (/\.js$/.test(n)) return ['JS', 'Anvil script: runs and opens as a part or assembly'];
    if (ext === 'drawing') return ['DWG', 'Anvil drawing: opens as it was saved'];
    if (ext === 'dxf') return ['DXF', 'A new part with the DXF in a sketch on the Top Plane'];
    if (ext === 'dwg') return ['DWG', 'A new part with the DWG in a sketch on the Top Plane (converted by the local Anvil server)'];
    if (ext === 'igs' || ext === 'iges') return ['IGES', 'A new part with an Imported1 feature, read by OpenCascade'];
    if (neutralFile(n)) return [ext === 'stp' ? 'STEP' : ext.toUpperCase(), 'A new part with an Imported1 feature you can sketch on, cut and boss against'];
    return [ext ? ext.toUpperCase().slice(0, 4) : '?', 'Not a file type Anvil opens'];
  }
  function fileSize(n) { return n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function savedSummary(f) {
    var isA = f.model && f.model.type === 'assembly';
    return (isA ? 'assembly, ' + ((f.model.components || []).length) + ' components' : (typeof f.features === 'number' ? f.features : (f.features ? f.features.length : 0)) + ' features') + ' · ' + new Date(f.savedAt || 0).toLocaleString();
  }
  // a document saved in this browser (File ▸ Save) replaces the open one
  function openSaved(n, f) { rememberPart(); UI.loadModel(JSON.parse(JSON.stringify(f.model))); App.fileName = n; UI.toast('Opened ' + n); recentNoteBrowser(n); }
  // File ▸ Open: the documents saved in this browser on the left; on the right a drop zone (drag a file in, or click /
  // Browse… for the system's file picker, narrowed by Files of type), the chosen file's card (type, name, size, what
  // it opens as), and "Paste text instead" (a model JSON, a script, or a STEP / ASCII STL / OBJ file's text).
  // Open opens the chosen file, else the selected saved document, else the pasted text. Double-click a saved one opens it.
  // hint (rfIK, Recent Documents in a browser): a line above the drop zone naming the file to choose again
  function showOpenDialog(hint) {
    var chosen = null, reading = null, savedPick = null;
    var type = el('select', { 'aria-label': 'Files of type' });
    OPEN_TYPES.forEach(function (t) { type.appendChild(el('option', { value: t[0], text: t[1] })); });
    var fileInp = el('input', { type: 'file', accept: OPEN_TYPES[0][2], 'aria-label': 'File to open', class: 'open-input' });
    type.addEventListener('change', function () { OPEN_TYPES.forEach(function (t) { if (t[0] === type.value) fileInp.accept = t[2]; }); });
    var card = el('div', { class: 'open-card', hidden: '' });
    var zone = el('div', { class: 'open-drop', tabindex: '0', role: 'button', 'aria-label': 'Drop a file here, or press Enter to browse' }, [
      el('div', { class: 'open-drop-icon', html: Icons('openDoc', 32) }),
      el('div', { class: 'open-drop-text' }, [el('b', { text: 'Drop a file here' }), el('span', { text: 'or' }),
        el('button', { class: 'btn', type: 'button', text: 'Browse…', onclick: function (e) { e.stopPropagation(); fileInp.click(); } })]),
      el('small', { text: 'Anvil documents and scripts, STEP, IGES, STL, OBJ, 3MF, DXF, DWG' })
    ]);
    function choose(file) {
      if (!file) return;
      savedPick = null; markSaved();
      var k = openKind(file.name);
      card.hidden = false; zone.classList.add('has-file'); card.classList.toggle('bad', k[1].indexOf('Not a file') === 0);
      card.innerHTML = '';
      card.appendChild(el('span', { class: 'open-badge', text: k[0] }));
      card.appendChild(el('div', { class: 'open-card-text' }, [el('b', { text: file.name, title: file.name }), el('small', { text: fileSize(file.size || 0) + ' · ' + k[1] })]));
      card.appendChild(el('button', { class: 'btn', type: 'button', text: 'Change…', onclick: function () { fileInp.click(); } }));
      chosen = null;
      reading = readFile(file).then(function (buf) { chosen = { name: file.name, data: buf }; reading = null; },
        function (e) { reading = null; UI.toast('Could not read ' + file.name + ': ' + (e && e.message || e)); });
    }
    fileInp.addEventListener('change', function () { choose(fileInp.files && fileInp.files[0]); });
    zone.addEventListener('click', function () { fileInp.click(); });
    zone.addEventListener('keydown', function (e) { if (e.key === ' ' || (e.key === 'Enter' && !chosen)) { e.preventDefault(); e.stopPropagation(); fileInp.click(); } });
    ['dragenter', 'dragover'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; zone.classList.add('over'); }); });
    zone.addEventListener('dragleave', function (e) { if (!zone.contains(e.relatedTarget)) zone.classList.remove('over'); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('over'); choose(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
    // the saved documents
    var files = savedFiles(), names = Object.keys(files).sort(function (a, b) { return (files[b].savedAt || 0) - (files[a].savedAt || 0); });
    var list = el('div', { class: 'open-saved-list', role: 'listbox', 'aria-label': 'Saved in this browser' });
    function markSaved() { Array.prototype.forEach.call(list.children, function (b) { b.classList.toggle('sel', b.dataset.name === savedPick); }); }
    names.forEach(function (n) {
      var f = files[n], isA = f.model && f.model.type === 'assembly';
      var b = el('button', { type: 'button', class: 'open-saved', 'data-name': n, title: n }, [
        el('span', { class: 'open-saved-icon', html: Icons(isA ? 'assembly' : 'part', 16) }),
        el('span', { class: 'open-saved-text' }, [el('b', { text: n }), el('small', { text: savedSummary(f) })])]);
      b.addEventListener('click', function () { savedPick = n; markSaved(); chosen = reading = null; fileInp.value = ''; card.hidden = true; zone.classList.remove('has-file'); });
      b.addEventListener('dblclick', function () { UI.closeModal(); openSaved(n, f); });
      list.appendChild(b);
    });
    if (!names.length) list.appendChild(el('p', { class: 'dlg-note', text: 'Nothing saved yet. File ▸ Save (Ctrl+S) keeps a document here.' }));
    var ta = el('textarea', { placeholder: 'Paste a model JSON (File → Save As), an Anvil script, or the text of a STEP / ASCII STL / OBJ file…' });
    var paste = el('details', { class: 'open-paste' }, [el('summary', { text: 'Paste text instead' }), ta]);
    var body = el('div', { class: 'open-dialog' }, [
      el('div', { class: 'open-side' }, [el('h4', { text: 'Saved in this browser' }), list]),
      el('div', { class: 'open-main' }, [typeof hint === 'string' && hint ? el('p', { class: 'dlg-note open-hint', text: hint }) : null, zone, fileInp, card,
        el('label', { class: 'dlg-row' }, [el('span', { text: 'Files of type' }), type]), paste])
    ]);
    body.addEventListener('dragover', function (e) { e.preventDefault(); });   // a file dropped beside the zone is not opened by the browser
    body.addEventListener('drop', function (e) { if (!zone.contains(e.target)) { e.preventDefault(); choose(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); } });
    openDlg = { zone: zone, choose: choose };   // a file dropped elsewhere on the window while this dialog shows (rfID)
    UI.showModal({ title: 'Open', body: body, buttons: [
      { label: 'Open', primary: true, action: function go() {
        if (reading) { reading.then(go); return; }
        var p;
        if (chosen) p = openFileData(chosen.name, chosen.data);
        else if (savedPick && files[savedPick]) { UI.closeModal(); openSaved(savedPick, files[savedPick]); return; }
        else {
          var txt = ta.value.trim();
          if (!txt) { UI.toast('Choose a file, a saved document, or paste its text first.'); return; }
          // pasted text: JSON, a STEP / ASCII STL / OBJ file, or else an Anvil script
          var fmt = txt.charAt(0) === '{' || !hasExchange() ? null : Exchange.formatOf('', txt);
          if (fmt === 'obj' && /(^|[^\w.$])(p|a)\s*\.\s*\w+\s*\(/.test(txt)) fmt = null;
          p = fmt ? openFileData('Pasted.' + fmt, txt, { format: fmt }) : openFileData('Pasted.anvil.js', txt);
        }
        p.then(function () { UI.closeModal(); }, function (e) { UI.toast((e && e.message) || String(e)); });
      } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
    $('modal-card').classList.add('wide');
    setTimeout(function () { zone.focus(); }, 0);
  }
  // Insert ▸ Features ▸ Imported…: a STEP / STL / OBJ / 3MF file becomes an Imported feature at the end of the part
  function cmdInsertImported() {
    if (isAsm()) { UI.toast('Imported bodies go into a part. Open a part, or use File ▸ Open for a new one.'); return; }
    pickFile('.step,.stp,.stl,.obj,.3mf', function (name, data) {
      importIntoCurrent(name, data).catch(function (e) { UI.toast((e && e.message) || String(e)); });
    });
  }
  // ---- a file dropped anywhere on the window (rfID) ----------------------------------------------------------------
  // Any file File ▸ Open takes (OPEN_TYPES) opens through File ▸ Open's own path: "Save changes?" first
  // (confirmDiscard), then openDiskFile -> openFileData. In the Windows app the dropped file keeps its path
  // (anvilDesktop.files.dropped, desktop/preload.js + main.js), so the title names it and Ctrl+S writes back to it.
  // A drop an element handles itself (calls preventDefault: the Open dialog's drop zone and its body) wins; while the
  // Open dialog shows, a drop on its backdrop goes to the dialog. Anvil holds one document at a time: of several files
  // the first one Anvil can open opens and a toast says so. A file drag always has its default cancelled, so the
  // browser never opens or navigates to a dropped file. While dragging, a full-window overlay (#drop-overlay) says
  // what a drop will do; Chrome hides file names until the drop, so then it judges by the file's MIME type only.
  var openDlg = null;   // { zone, choose } of the Open dialog last shown
  var OPEN_EXTS = OPEN_TYPES[0][2].split(',');
  var OPEN_TYPES_TEXT = 'Anvil parts, assemblies, drawings and scripts (.json, .js, .drawing), STEP, IGES, STL, OBJ, 3MF, DXF and DWG';
  var BAD_MIME = /^(image|video|audio|font)\/|^application\/(pdf|zip|x-zip|x-7z|x-rar|msword|vnd\.ms-|vnd\.openxmlformats|x-msdownload)|^text\/(html|csv)$/;
  function canOpenName(name) { var n = String(name || '').toLowerCase(); return OPEN_EXTS.some(function (x) { return n.length > x.length && n.slice(-x.length) === x; }); }
  function cantOpenText(name) { var x = extOf(name); return "Anvil can't open " + (x ? '.' + x + ' files' : String(name || 'that file')); }
  function dragHasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
  function dragFiles(e) { var f = e.dataTransfer && e.dataTransfer.files; return f ? Array.prototype.slice.call(f) : []; }
  function modalShown() { var m = $('modal'); return !!m && !m.hidden; }
  function openDlgShown() { return !!(openDlg && modalShown() && document.body.contains(openDlg.zone)); }
  // [can open, the overlay's line]
  function dropVerdict(e) {
    var files = dragFiles(e);
    if (files.length) {
      var good = files.filter(function (f) { return canOpenName(f.name); });
      if (!good.length) return [false, cantOpenText(files[0].name)];
      return [true, 'Drop to open ' + good[0].name];
    }
    var items = e.dataTransfer && e.dataTransfer.items, types = [];
    for (var i = 0; items && i < items.length; i++) if (items[i].kind === 'file') types.push(items[i].type || '');
    if (types.length && types.every(function (t) { return BAD_MIME.test(t); })) return [false, "Anvil can't open this type of file"];
    return [true, types.length > 1 ? 'Drop to open the first file' : 'Drop to open the file'];
  }
  var dropEl = null, dropTimer = null, dropDepth = 0;
  function showDropOverlay(v, several) {
    if (!dropEl) {
      dropEl = el('div', { id: 'drop-overlay', role: 'status' }, [el('div', { class: 'drop-card' }, [
        el('div', { class: 'drop-icon', html: Icons('openDoc', 40) }), el('b', { class: 'drop-text' }), el('small', { class: 'drop-sub' })])]);
      document.body.appendChild(dropEl);
    }
    dropEl.classList.toggle('bad', !v[0]);
    dropEl.querySelector('.drop-text').textContent = v[1];
    dropEl.querySelector('.drop-sub').textContent = !v[0] ? 'Anvil opens ' + OPEN_TYPES_TEXT + '.'
      : several ? 'Anvil opens one document at a time: the first file opens.' : 'It opens as File ▸ Open would.';
    dropEl.hidden = false;
    clearTimeout(dropTimer);
    dropTimer = setTimeout(hideDropOverlay, 1500);   // a drag that ended with no dragleave / drop reaching the page
  }
  function hideDropOverlay() { clearTimeout(dropTimer); dropDepth = 0; if (dropEl) dropEl.hidden = true; }
  function onFileDrag(e) {
    if (!dragHasFiles(e)) return;
    var handled = e.defaultPrevented;   // an element under the pointer takes this drop itself (the Open dialog)
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    if (e.type === 'dragenter') dropDepth++;
    if (handled || modalShown()) { if (dropEl) dropEl.hidden = true; return; }
    var dt = e.dataTransfer, n = dt ? (dt.files.length || (dt.items ? dt.items.length : 0)) : 0;
    showDropOverlay(dropVerdict(e), n > 1);
  }
  function onFileDragLeave(e) {
    if (!dragHasFiles(e)) return;
    dropDepth = Math.max(0, dropDepth - 1);
    if (!dropDepth) hideDropOverlay();   // every dragenter has its dragleave; 0 = the pointer left the window
  }
  function onFileDrop(e) {
    if (!dragHasFiles(e)) return;
    var handled = e.defaultPrevented;
    e.preventDefault();   // never let the browser open the file
    hideDropOverlay();
    if (handled) return;
    var files = dragFiles(e);
    if (openDlgShown()) { if (files[0]) openDlg.choose(files[0]); return; }
    if (modalShown()) { UI.toast('Close the open dialog first, then drop the file again.'); return; }
    openDroppedFiles(files);
  }
  // openDroppedFiles(files) -> Promise of the summary (null: nothing opened; never settles on Cancel in "Save changes?")
  function openDroppedFiles(files) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return Promise.resolve(null);
    var good = files.filter(function (f) { return canOpenName(f.name); });
    if (!good.length) {
      var msg = cantOpenText(files[0].name) + '. It opens ' + OPEN_TYPES_TEXT + '.';
      UI.toast(msg); UI.setStatus(msg);
      return Promise.resolve(null);
    }
    var file = good[0], rest = files.length - 1;
    return new Promise(function (res) {
      confirmDiscard(null, function () {
        res(openDroppedFile(file).then(function (s) {
          if (s && rest) UI.toast('Opened ' + file.name + '. Anvil holds one document at a time, so the other ' + (rest === 1 ? 'file was' : rest + ' files were') + ' not opened.');
          return s;
        }));
      });
    });
  }
  function openDroppedFile(file) {
    var d = desk();
    var where = d && d.dropped ? Promise.resolve().then(function () { return d.dropped(file); }).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([readFile(file), where]).then(function (r) {
      return openDiskFile({ name: file.name, path: (r[1] && r[1].path) || null, data: r[0] });
    }, function (e) { UI.toast('Could not read ' + file.name + ': ' + ((e && e.message) || e)); return null; });
  }
  function initFileDrop() {
    window.addEventListener('dragenter', onFileDrag);
    window.addEventListener('dragover', onFileDrag);
    window.addEventListener('dragleave', onFileDragLeave);
    window.addEventListener('drop', onFileDrop);
    window.addEventListener('dragend', hideDropOverlay);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dropEl && !dropEl.hidden) hideDropOverlay(); }, true);
  }
  // ---- Recent documents (rfIK) -----------------------------------------------------------------------------------
  // SolidWorks lists the documents last opened at the foot of the File menu and in File ▸ Browse Recent Documents.
  // Here: the last RECENT_MAX documents opened or saved (parts, assemblies, drawings, and imported STEP / DXF … too),
  // newest first. A click opens it through File ▸ Open's own path ("Save changes?" first, then openDiskFile).
  // Windows app: the list lives in the app's user-data folder (desktop/main.js recent.json, paths only); reopening
  // one makes that path writable again as an Open-box pick does; a file that is not there any more is greyed and the
  // Browse Recent Documents dialog offers to remove it (a click on it there asks).
  // Browser: a browser cannot reopen a file by its path, so the list says what it can do: documents saved in this
  // browser (File ▸ Save) reopen at once; a file opened from disk is listed by name only and its click shows the Open
  // dialog asking for that file again. Kept in localStorage 'anvil.recent' (a test frame: 'anvil.test.recent').
  // Entries: { path, name, folder, missing } (app) / { name, kind: 'browser' | 'disk', at, missing } (browser).
  var RECENT_MAX = 10;
  var RECENT_KEY = (function () { var t = false; try { t = !!(window.frameElement && /\/tests\//.test(window.parent.location.pathname)); } catch (e) { } return t ? 'anvil.test.recent' : 'anvil.recent'; })();
  var recentCache = [];
  function deskRecent() { var d = desk(); return d && d.recent ? d.recent : null; }
  function browserRecent() {
    var l = [];
    try { l = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { l = []; }
    var files = savedFiles();
    return (Array.isArray(l) ? l : []).filter(function (x) { return x && x.name; }).slice(0, RECENT_MAX).map(function (x) {
      return { name: String(x.name), kind: x.kind === 'browser' ? 'browser' : 'disk', at: x.at || 0, missing: x.kind === 'browser' && !(files[x.name] && files[x.name].model) };
    });
  }
  function browserRecentWrite(l) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(l.slice(0, RECENT_MAX).map(function (x) { return { name: x.name, kind: x.kind, at: x.at }; }))); } catch (e) { } }
  function setRecent(l) { recentCache = Array.isArray(l) ? l.slice(0, RECENT_MAX) : []; return recentCache; }
  // recentList(fresh) -> Promise of the list (fresh: ask the app again, so a file deleted meanwhile shows missing)
  function recentList(fresh) {
    var dr = deskRecent();
    if (!dr) return Promise.resolve(setRecent(browserRecent()));
    if (!fresh && recentCache.loaded) return Promise.resolve(recentCache);
    return Promise.resolve().then(function () { return dr.list(); }).then(function (l) { setRecent(l); recentCache.loaded = true; return recentCache; }, function () { return recentCache; });
  }
  function recentNoteBrowser(name) {
    if (desk()) return;
    var l = browserRecent().filter(function (x) { return !(x.kind === 'browser' && x.name === name); });
    l.unshift({ name: name, kind: 'browser', at: Date.now() });
    browserRecentWrite(l); setRecent(browserRecent());
  }
  // a file opened from disk or saved to it: path in the app, name only in a browser
  function recentNote(path, name) {
    var dr = deskRecent();
    if (dr) { if (path) Promise.resolve().then(function () { return dr.add(path); }).then(function (l) { setRecent(l); recentCache.loaded = true; }, function () { }); return; }
    if (desk() || !name) return;
    var l = browserRecent().filter(function (x) { return !(x.kind === 'disk' && x.name === name); });
    l.unshift({ name: name, kind: 'disk', at: Date.now() });
    browserRecentWrite(l); setRecent(browserRecent());
  }
  function recentRemove(entry) {
    var dr = deskRecent();
    if (dr) return Promise.resolve().then(function () { return dr.remove(entry.path); }).then(function (l) { setRecent(l); recentCache.loaded = true; return recentCache; });
    browserRecentWrite(browserRecent().filter(function (x) { return !(x.kind === entry.kind && x.name === entry.name); }));
    return Promise.resolve(setRecent(browserRecent()));
  }
  function recentClear() {
    var dr = deskRecent();
    if (dr) return Promise.resolve().then(function () { return dr.clear(); }).then(function () { setRecent([]); recentCache.loaded = true; return recentCache; });
    browserRecentWrite([]);
    return Promise.resolve(setRecent([]));
  }
  function recentLabel(x) { return x.path ? x.name : x.kind === 'browser' ? x.name + ' (saved in this browser)' : x.name; }
  function shortFolder(f) {
    var parts = String(f || '').split(/[\\\/]/).filter(Boolean);
    return parts.length > 3 ? parts[0] + '\\…\\' + parts.slice(-2).join('\\') : String(f || '');
  }
  // the entry is not there any more: offer to take it off the list
  function recentMissing(x, after) {
    UI.showModal({ title: 'Anvil', body: el('div', { class: 'recent-missing' }, [
      el('p', { text: x.path ? x.name + ' is not in ' + x.folder + ' any more.' : x.name + ' is no longer saved in this browser.' }),
      el('p', { class: 'dlg-note', text: 'It was moved, renamed or deleted' + (x.path ? ', or its drive is not connected.' : '.') + ' Remove it from Recent Documents?' })]),
      buttons: [{ label: 'Remove', primary: true, action: function () { UI.closeModal(); recentRemove(x).then(function () { if (after) after(); }); } },
        { label: 'Keep', action: function () { UI.closeModal(); if (after) after(); } }] });
  }
  // recentOpen(entry) -> Promise of the summary (null: not opened). "Save changes?" first, as File ▸ Open.
  function recentOpen(x) {
    if (!x) return Promise.resolve(null);
    if (x.missing) { recentMissing(x); return Promise.resolve(null); }
    var dr = deskRecent();
    return new Promise(function (res) {
      confirmDiscard(null, function () {
        if (dr) {
          res(Promise.resolve().then(function () { return dr.open(x.path); }).then(function (r) {
            if (!r) return null;
            if (r.missing) { x.missing = true; recentList(true); recentMissing(x); return null; }
            if (r.error) { UI.showModal({ title: 'Open', body: el('div', {}, [el('p', { text: r.name || x.name }), el('p', { text: r.error })]), buttons: [{ label: 'OK', primary: true, action: UI.closeModal }] }); return null; }
            return openDiskFile(r);
          }));
          return;
        }
        if (x.kind === 'browser') {
          var f = savedFiles()[x.name];
          if (!f || !f.model) { recentMissing(x); res(null); return; }
          openSaved(x.name, f);
          res(window.anvil.summary());
          return;
        }
        // a file from disk in a browser: ask for it again
        showOpenDialog('Choose ' + x.name + ' again: a browser cannot reopen a file from its folder by itself.');
        res(null);
      });
    });
  }
  // File ▸ Browse Recent Documents…: every entry with its folder; a greyed one is not there any more (Remove)
  function showRecentDialog() {
    var body = el('div', { class: 'recent-dialog' }), list = el('div', { class: 'recent-list', role: 'listbox', 'aria-label': 'Recent Documents' });
    function iconFor(x) {
      var n = x.name.toLowerCase();
      return /\.drawing$/.test(n) ? 'drawing' : /\.(step|stp|igs|iges|stl|obj|3mf|dxf|dwg)$/.test(n) ? 'openDoc' : 'part';
    }
    function render(l) {
      list.innerHTML = '';
      if (!l.length) list.appendChild(el('p', { class: 'dlg-note', text: 'No recent documents yet. Files you open or save are listed here.' }));
      l.forEach(function (x, i) {
        var row = el('div', { class: 'recent-row' + (x.missing ? ' missing' : ''), role: 'option', tabindex: '0', 'data-i': String(i), title: x.path || recentLabel(x) }, [
          el('span', { class: 'recent-ico', html: Icons(iconFor(x), 16) }),
          el('span', { class: 'recent-text' }, [el('b', { text: recentLabel(x) }),
            el('small', { text: x.path ? x.folder + (x.missing ? ' (not found)' : '') : x.kind === 'browser' ? (x.missing ? 'no longer saved in this browser' : 'opens at once') : 'opened from disk: asks for the file again' })])]);
        if (x.missing) row.appendChild(el('button', { class: 'btn recent-remove', type: 'button', text: 'Remove', onclick: function (e) { e.stopPropagation(); recentRemove(x).then(render); } }));
        function go() { if (x.missing) { recentMissing(x, showRecentDialog); return; } UI.closeModal(); recentOpen(x); }
        row.addEventListener('click', go);
        row.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); } });
        list.appendChild(row);
      });
    }
    if (!desk()) body.appendChild(el('p', { class: 'dlg-note', text: 'In a browser Anvil cannot reopen a file from its folder: a file opened from disk asks for it again. Documents saved in this browser open at once.' }));
    body.appendChild(list);
    render(recentCache);
    UI.showModal({ title: 'Recent Documents', body: body, buttons: [
      { label: 'Remove missing', action: function () { var gone = recentCache.filter(function (x) { return x.missing; }); gone.reduce(function (p, x) { return p.then(function () { return recentRemove(x); }); }, Promise.resolve()).then(function () { render(recentCache); }); } },
      { label: 'Clear list', action: function () { recentClear().then(render); } },
      { label: 'Close', primary: true, action: UI.closeModal }
    ] });
    recentList(true).then(function (l) { if (document.body.contains(list)) render(l); });
  }
  // the File menu: Browse Recent Documents… after Open…, and the list itself at the foot (numbered, folder on the right).
  // Installed at boot, outside every other file's hook, so a drawing's own File menu gets it too.
  function installRecentMenu() {
   var recentMenuBase = UI.menuHook;
   UI.menuHook = function (menus) {
    var out = recentMenuBase ? recentMenuBase(menus) || menus : menus;
    var file = out.filter(function (m) { return m.label === 'File'; })[0];
    if (!file || file.items.some(function (it) { return it && it.recent; })) return out;
    var at = -1;
    file.items.forEach(function (it, i) { if (it && it.label === 'Open…' && at < 0) at = i; });
    file.items.splice(at >= 0 ? at + 1 : file.items.length, 0, { label: 'Browse Recent Documents…', action: showRecentDialog, recent: true });
    var l = recentCache;
    if (l.length) {
      file.items.push({ sep: true, recent: true });
      l.forEach(function (x, i) {
        file.items.push({ label: (i + 1) + '  ' + recentLabel(x) + (x.missing ? ' (not found)' : ''), key: x.path ? shortFolder(x.folder) : '', dimmed: !!x.missing, recent: true,   // rfIP: greyed, a click offers Remove / Keep
          action: function () { recentOpen(x); } });
      });
    }
    return out;
   };
  }
  // ---- the window title (rfIK): "bracket.anvil.json * - Anvil" --------------------------------------------------
  // ui-core.js showDirty writes "<model name> * - Anvil"; this names the document's file instead when it has one (the
  // Windows app), the drawing ("Draw1 - Sheet1 *") while a drawing shows, with the "*" of unsaved changes. In the app
  // main.js shows the page's title as the window's (setDocument passes it too).
  var deskDocSent;
  function baseName(p) { return String(p || '').replace(/^.*[\\\/]/, ''); }
  function visiblePath() { var dp = drawingTarget(); return dp ? dp.path : App.filePath || null; }
  function titleText() {
    var name, dc = drawingDoc(), dp = drawingTarget();
    if (dc) name = (dp ? baseName(dp.path) : dc.name || 'Drawing') + (dc.sheet && dc.sheet.name ? ' - ' + dc.sheet.name : '');
    else if (App.filePath) name = baseName(App.filePath);
    else name = App.model && App.model.name;
    return name ? name + (App.dirty ? ' *' : '') + ' - Anvil' : 'Anvil';
  }
  var titleProp = null;   // Document.prototype's title accessor, when document.title is routed through titleText
  function syncTitle() {
    var t = titleText();
    if (titleProp) { if (titleProp.get.call(document) !== t) titleProp.set.call(document, t); }
    else if (document.title !== t) document.title = t;
    return t;
  }
  function syncDocument(force) {
    var t = syncTitle(), p = visiblePath(), d = desk();
    if (d && (force || p !== deskDocSent)) { deskDocSent = p; try { d.setDocument(p, t); } catch (e) { } }
  }
  function initTitle() {
    // ui-core.js showDirty (and anything else) writing document.title gets Anvil's title at once, so the window title
    // never flickers between the model name and the file name; with no accessor to wrap, a MutationObserver puts it back
    try {
      var tp = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
      if (tp && tp.get && tp.set) {
        Object.defineProperty(document, 'title', { configurable: true, get: function () { return tp.get.call(document); }, set: function () { syncTitle(); } });
        titleProp = tp;
      }
    } catch (e) { titleProp = null; }
    var t = document.querySelector('title');
    if (!t) { t = document.createElement('title'); document.head.appendChild(t); }
    if (!titleProp && window.MutationObserver) new MutationObserver(function () { syncTitle(); }).observe(t, { childList: true, characterData: true, subtree: true });
    // a drawing opens or closes (drawing-ui.js redraws the ribbon then): the title and the app's document follow
    var baseRibbon = UI.refreshRibbon;
    UI.refreshRibbon = function () { var r = baseRibbon.apply(this, arguments); syncDocument(); return r; };
    // a file deleted, moved or put back while Anvil was in the background shows as it is now
    window.addEventListener('focus', function () { if (deskRecent()) recentList(true); });
    installRecentMenu();
    recentList(true);
    syncDocument();
  }

  // File ▸ Save (Ctrl+S): asks for the name (the last one offered), saves in this browser; onSaved (a function) runs
  // after a successful save (the Save of "Save changes to Part1?")
  // In the Windows app: straight to the document's file (App.filePath), else Windows' Save box.
  function fileSave(onSaved) {
    if (desk()) { var dp = drawingTarget(); return dp ? deskSaveDrawing(dp, onSaved) : deskSave(onSaved); }
    UI.promptDialog('Save', 'Save as (kept in this browser):', App.fileName || App.model.name, function (name) {
      name = (name || '').trim();
      if (!name) return;
      if (saveInBrowser(name) && typeof onSaved === 'function') onSaved();
    });
  }
  function saveInBrowser(name) {
    var files = savedFiles();
    files[name] = { model: App.model, features: App.model.features.length, components: isAsm() ? (App.model.components || []).length : undefined, savedAt: Date.now() };
    try { localStorage.setItem('anvil.files', JSON.stringify(files)); App.fileName = name; UI.toast('Saved "' + name + '"'); } catch (e) { UI.toast('Could not save: ' + e.message); return false; }
    recentNoteBrowser(name);
    if (UI.afterSaveHook) UI.afterSaveHook(name);   // an assembly also saves its edited referenced documents (ui-assembly.js)
    UI.markClean();
    if (tpCurrent === 'files') openTaskPane('files');
    return true;
  }
  // File ▸ Save As in the Windows app: one Windows Save box whose types are File ▸ Save As's (preset first); the type
  // is the extension of the file picked. The document types (JSON, script) become the document's file; STEP, STL …
  // are exports; DXF / DWG open the DXF/DWG Output PropertyManager, whose OK writes to the file picked here.
  var SAVE_EXT = { json: ['json'], script: ['js'], step: ['step', 'stp'], '3mf': ['3mf'], obj: ['obj'], stl: ['stl'], iges: ['igs', 'iges'], dxf: ['dxf'], dwg: ['dwg'] };
  function saveTypeOf(path) {
    var ext = extOf(path), hit = null;
    Object.keys(SAVE_EXT).forEach(function (t) { if (!hit && SAVE_EXT[t].indexOf(ext) >= 0) hit = t; });
    return hit;
  }
  function deskSaveAs(preset) {
    var types = saveTypes();
    if (preset) types.sort(function (a, b) { return (b[0] === preset) - (a[0] === preset); });
    var first = types[0][0], base = App.importPath ? fileBase(App.importPath) : docBase();   // (rfIK) an import: its name and folder
    var ext0 = first === 'json' ? '.anvil.json' : first === 'script' ? '.anvil.js' : '.' + SAVE_EXT[first][0];
    var filters = types.map(function (t) { return { name: t[1], extensions: SAVE_EXT[t[0]] || [t[0]] }; });
    var isDoc = first === 'json' || first === 'script';
    var so = { name: base + ext0, filters: filters, kind: isDoc ? 'document' : 'export', title: isDoc ? 'Save As' : 'Export' };
    if (isDoc && nearPath()) so.near = nearPath();
    return desk().saveDialog(so).then(function (pick) {
      if (!pick) return null;
      var type = saveTypeOf(pick.path) || first, fname = String(pick.path).replace(/^.*[\\\/]/, '');
      var b = fname.replace(/\.(anvil\.json|anvil\.js|json|js|step|stp|3mf|obj|stl|igs|iges|dxf|dwg)$/i, '').replace(/[^\w\-]+/g, '_') || safeName();
      if (type === 'json' || type === 'script') return deskSaveTo(pick.path);
      var sketchOnly = (type === 'dxf' || type === 'dwg') && (App.model.features || []).some(function (f) { return f.type === 'sketch' && (f.entities || []).some(function (e) { return e.t !== 'point'; }); });
      if (!App.mesh || (!App.mesh.triCount && !sketchOnly)) { UI.toast(type === 'dxf' || type === 'dwg' ? 'Nothing to export yet: draw a sketch or build a solid first.' : 'Nothing to export yet.'); return null; }
      if (type === 'dxf' || type === 'dwg') { deskPending = { name: b + '.' + type, path: pick.path, at: Date.now() }; UI.cmdDxfOutput({ format: type, name: b }); return pick; }
      var out;
      try { out = exportData(type, b); } catch (e) { UI.toast('Export failed: ' + ((e && e.message) || e)); return null; }
      return deskWrite(pick.path, out.data).then(function (r) {
        if (!r || r.error) { deskFailed(fname, r); return null; }
        var done = function (extra) { UI.setStatus('Saved ' + r.path + (extra ? ' and ' + out.extra.name : '') + ' (' + ((out.data.length || out.data.byteLength) / 1024).toFixed(1) + ' KB).'); return r; };
        if (!out.extra) return done(false);
        return deskWrite(pick.path, out.extra.data, { sibling: out.extra.name }).then(function (r2) { if (!r2 || r2.error) deskFailed(out.extra.name, r2); return done(r2 && !r2.error); });
      });
    });
  }
  // File ▸ Save As: the document (JSON), its script, or a neutral format through exchange.js (STEP AP214, 3MF, OBJ with
  // its .mtl, STL). exportData(type, base) -> { name, data, mime, extra? } is also what anvil.saveAs downloads.
  function saveTypes() {
    var doc = isAsm() ? 'Assembly' : 'Part';
    var t = [['json', doc + ' (*.anvil.json)'], ['script', 'Anvil script (*.anvil.js)']];
    if (hasExchange()) t.push(['step', 'STEP AP214 (*.step)'], ['3mf', '3D Manufacturing Format (*.3mf)'], ['obj', 'OBJ (*.obj) + materials (*.mtl)']);
    t.push(['stl', 'STL (*.stl)']);
    if (occtExports()) t.push(['iges', 'IGES 5.3 (*.igs)']);
    // a part's 2D exports go through the DXF/DWG Output PropertyManager (ui-commands.js cmdDxfOutput)
    if (!isAsm()) t.push(['dxf', 'DXF (*.dxf)'], ['dwg', 'DWG (*.dwg)']);
    return t;
  }
  // the part shown is OpenCascade's (Tools ▸ OpenCascade kernel): its STEP / IGES come straight from the B-rep
  function occtExports() { return !isAsm() && App.build && App.build.occt && App.build.occt.step ? App.build.occt : null; }
  function exportData(type, base) {
    base = base || safeName();
    var m = App.model, b = App.build;
    switch (type) {
      case 'json': return { name: base + '.anvil.json', data: JSON.stringify(m, null, 1), mime: 'application/json' };
      case 'script': return { name: base + '.anvil.js', data: modelScript(), mime: 'text/javascript' };
      case 'step': return { name: base + '.step', data: Exchange.exportSTEP(m, b, { fileName: base + '.step' }), mime: 'model/step' };
      case '3mf': return { name: base + '.3mf', data: Exchange.export3MF(m, b), mime: 'model/3mf' };
      case 'obj': {
        var mtl = Exchange.exportMTL(m, b), hasMtl = /newmtl/.test(mtl);
        return { name: base + '.obj', data: Exchange.exportOBJ(m, b, { mtlName: base + '.mtl', mtl: hasMtl }), mime: 'model/obj', extra: hasMtl ? { name: base + '.mtl', data: mtl, mime: 'model/mtl' } : null };
      }
      case 'stl': return { name: base + '.stl', data: K.exportSTL(App.mesh, m.name), mime: 'model/stl' };
      case 'iges': {
        var oe = occtExports();
        if (!oe || !oe.iges) throw new Error('IGES export needs the part built by OpenCascade (Tools ▸ OpenCascade kernel).');
        return { name: base + '.igs', data: oe.iges, mime: 'model/iges' };
      }
    }
    throw new Error('Unknown file type "' + type + '"');
  }
  function fileSaveAs(preset) {
    if (desk()) return deskSaveAs(preset);
    var name = el('input', { type: 'text', value: safeName(), 'aria-label': 'File name', spellcheck: 'false' });
    var type = el('select', { 'aria-label': 'Save as type' });
    saveTypes().forEach(function (t) { var o = el('option', { value: t[0], text: t[1] }); if (t[0] === preset) o.selected = true; type.appendChild(o); });
    var note = el('p', { class: 'dlg-note' });
    function describe() {
      var v = type.value;
      note.textContent = v === 'step' && occtExports() ? 'Exact B-rep from OpenCascade: planes, cylinders, cones, spheres, tori and B-spline faces.' :
        v === 'iges' ? 'IGES 5.3 from OpenCascade\'s B-rep, every face exact.' :
        v === 'step' ? 'Planar-faced B-rep (ADVANCED_FACE on planes): one solid per body' + (isAsm() ? ', components as assembly occurrences with their placements.' : '.') :
        v === '3mf' ? 'Mesh package in ' + (App.model.units === 'in' ? 'inches' : 'millimetres') + ': one object per body' + (isAsm() ? ', one build item per component.' : '.') :
        v === 'obj' ? 'Mesh with normals, one group per body' + (isAsm() ? ' per component' : '') + '; colours go into the .mtl downloaded with it.' :
        v === 'stl' ? 'Triangle mesh, ASCII.' : v === 'script' ? 'The model as an Anvil script.' :
        v === 'dxf' || v === 'dwg' ? 'Opens the DXF/DWG Output PropertyManager: a planar face, the standard views at full size (1:1), or the sheet-metal flat pattern.' + (v === 'dwg' ? ' DWG is AutoCAD 2000 (AC1015), written by Anvil itself (no converter needed).' : '') :
        'The Anvil document, re-opened with File ▸ Open.';
    }
    type.addEventListener('change', describe); describe();
    var body = el('div', { class: 'saveas-dialog' }, [
      el('label', { class: 'dlg-row' }, [el('span', { text: 'File name' }), name]),
      el('label', { class: 'dlg-row' }, [el('span', { text: 'Save as type' }), type]), note]);
    UI.showModal({ title: 'Save As', body: body, buttons: [
      { label: 'Save', primary: true, action: function () {
        // a part with no solid yet still saves itself, and DXF / DWG of a sketch (the DXF/DWG Output PropertyManager's Sketch)
        var sketchOnly = (type.value === 'dxf' || type.value === 'dwg') && (App.model.features || []).some(function (f) { return f.type === 'sketch' && (f.entities || []).some(function (e) { return e.t !== 'point'; }); });
        if (!App.mesh || (!App.mesh.triCount && type.value !== 'json' && type.value !== 'script' && !sketchOnly)) { UI.toast(type.value === 'dxf' || type.value === 'dwg' ? 'Nothing to export yet: draw a sketch or build a solid first.' : 'Nothing to export yet.'); return; }
        var base = (name.value || '').trim().replace(/\.(anvil\.json|anvil\.js|json|js|step|stp|3mf|obj|stl|igs|dxf|dwg)$/i, '').replace(/[^\w\-]+/g, '_') || safeName();
        // DXF / DWG: the DXF/DWG Output PropertyManager takes over, with the format and the typed name
        if (type.value === 'dxf' || type.value === 'dwg') { UI.closeModal(); UI.cmdDxfOutput({ format: type.value, name: base }); return; }
        var out;
        try { out = exportData(type.value, base); } catch (e) { UI.toast('Export failed: ' + ((e && e.message) || e)); return; }
        download(out.name, out.data, out.mime);
        if (out.extra) download(out.extra.name, out.extra.data, out.extra.mime);
        if (type.value === 'json' || type.value === 'script') UI.markClean();   // the document itself was saved (STEP, STL… are exports)
        UI.closeModal();
        UI.setStatus('Saved ' + out.name + (out.extra ? ' and ' + out.extra.name : '') + ' (' + ((out.data.length || out.data.byteLength) / 1024).toFixed(1) + ' KB).');
      } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }

  // ------------------------------------------------------------------ mass properties
  // Assembly: totals from Assembly.massProps (each component with its part's own density), then one line per component.
  function showAssemblyMassProperties() {
    var u = UI.unitLabel(), mp;
    try { mp = Assembly.massProps(App.model, App.build); } catch (e) { UI.toast('Mass properties failed: ' + e.message); return; }
    var toKg = u === 'in' ? Math.pow(0.0254, 3) : 1e-9;
    var rows = [
      ['Components', String((App.model.components || []).length)],
      ['Mass', UI.fmtNum(mp.mass * toKg * 1000, 2) + ' g  (' + UI.fmtNum(mp.mass * toKg, 4) + ' kg)'],
      ['Volume', UI.fmtNum(mp.volume, 2) + ' ' + u + '³'],
      ['Surface area', UI.fmtNum(mp.area, 2) + ' ' + u + '²'],
      ['Center of mass', (mp.centroid || [0, 0, 0]).map(function (x) { return UI.fmtNum(x, 3); }).join(', ') + ' ' + u]
    ];
    if (mp.bbox) {
      rows.push(['Bounding box', mp.bbox.min.map(function (x) { return UI.fmtNum(x, 2); }).join(', ') + '  →  ' + mp.bbox.max.map(function (x) { return UI.fmtNum(x, 2); }).join(', ')]);
      rows.push(['Extents', [0, 1, 2].map(function (k) { return UI.fmtNum(mp.bbox.max[k] - mp.bbox.min[k], 2); }).join(' × ') + ' ' + u]);
    }
    (mp.components || []).forEach(function (c) {
      rows.push([c.name, 'volume ' + UI.fmtNum(c.volume, 2) + ' ' + u + '³, mass ' + UI.fmtNum(c.mass * toKg * 1000, 2) + ' g (' + (c.material ? c.material + ', ' : '') + UI.fmtNum(c.density, 2) + ' kg/m³)']);
    });
    var body = el('table', { id: 'mass-table' }, rows.map(function (r, i) { return el('tr', { class: i >= rows.length - (mp.components || []).length ? 'mass-comp' : '' }, [el('th', { text: r[0] }), el('td', { text: r[1] })]); }));
    UI.showModal({ title: 'Mass Properties — ' + App.model.name, body: body, buttons: [{ label: 'Copy', action: function () { copyText(rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n')); } }, { label: 'Close', primary: true, action: UI.closeModal }] });
  }
  function showMassProperties() {
    if (isAsm() && hasAssembly()) {
      if (!(App.model.components || []).length) { UI.toast('Insert a component first.'); return; }
      showAssemblyMassProperties(); return;
    }
    if (!App.mesh || !App.mesh.triCount) { UI.toast('No solid body yet.'); return; }
    var u = UI.unitLabel(), MT = typeof Materials !== 'undefined' ? Materials : null;
    var mp = MT ? MT.massProps(App.model, App.build, App.mesh) : K.massProps(App.mesh, App.model.density);
    var volM3 = u === 'in' ? mp.volume * Math.pow(0.0254, 3) : mp.volume * 1e-9;
    var mass = MT ? mp.massKg : volM3 * App.model.density;
    var matName = MT ? MT.materialName(App.model) : App.model.materialName;
    var multiMat = MT && MT.hasBodyMaterials(App.model);
    var rows = [
      ['Material', (matName || 'Material <not specified>') + (multiMat ? ' (some bodies have their own material)' : '')],
      ['Density', (multiMat ? UI.fmtNum(mp.density, 2) + ' kg/m³ (average)' : App.model.density + ' kg/m³')],
      ['Mass', UI.fmtNum(mass * 1000, 2) + ' g  (' + UI.fmtNum(mass, 4) + ' kg)'],
      ['Volume', UI.fmtNum(mp.volume, 2) + ' ' + u + '³'],
      ['Surface area', UI.fmtNum(mp.area, 2) + ' ' + u + '²'],
      ['Center of mass', mp.centroid.map(function (x) { return UI.fmtNum(x, 3); }).join(', ') + ' ' + u],
      ['Bounding box', mp.bbox.min.map(function (x) { return UI.fmtNum(x, 2); }).join(', ') + '  →  ' + mp.bbox.max.map(function (x) { return UI.fmtNum(x, 2); }).join(', ')],
      ['Extents', [0, 1, 2].map(function (k) { return UI.fmtNum(mp.bbox.max[k] - mp.bbox.min[k], 2); }).join(' × ') + ' ' + u],
      ['Faces / triangles', App.mesh.faces.length + ' / ' + App.mesh.triCount]
    ];
    // per-body section on a multi-body part (SolidWorks lists each solid body after the totals)
    var bodies = UI.bodyList ? UI.bodyList() : [], infos = UI.bodyInfos ? UI.bodyInfos() : [];
    if (bodies.length >= 2) {
      rows.push(['Solid bodies', String(bodies.length)]);
      bodies.forEach(function (b, i) {
        var info = infos[i] || { name: 'Body' + (i + 1) }, bm = null, pb = MT && mp.bodies ? mp.bodies[i] : null;
        if (pb) { rows.push([info.name, 'volume ' + UI.fmtNum(pb.volume, 2) + ' ' + u + '³, mass ' + UI.fmtNum(pb.massKg * 1000, 2) + ' g (' + (pb.material || 'Material <not specified>') + ', ' + pb.density + ' kg/m³)']); return; }
        try { bm = K.massProps(K.meshFromBody(b), App.model.density); } catch (e) { bm = null; }
        var bVolM3 = bm ? (u === 'in' ? bm.volume * Math.pow(0.0254, 3) : bm.volume * 1e-9) : 0;
        rows.push([info.name, bm ? 'volume ' + UI.fmtNum(bm.volume, 2) + ' ' + u + '³, mass ' + UI.fmtNum(bVolM3 * App.model.density * 1000, 2) + ' g' : '(not computed)']);
      });
    }
    var cells = {}, body = el('table', {}, rows.map(function (r) { var td = el('td', { text: r[1] }); cells[r[0]] = td; return el('tr', {}, [el('th', { text: r[0] }), td]); }));
    // lane CZ / DF: "Report coordinate values relative to" (SolidWorks' output coordinate system): with a Coordinate
    // System feature in the part, the centre of mass and the bounding box are given in the chosen system
    // (Kernel.toCsys); the choice is remembered for the session in App.massFrame (a csys feature id)
    var frames = massFrames(), sel = null;
    if (frames.length) {
      if (App.massFrame != null && !frames.some(function (f) { return f.id === App.massFrame; })) App.massFrame = null;
      sel = el('select', { id: 'mass-frame', 'aria-label': 'Report coordinate values relative to' });
      [['', '-- default --']].concat(frames.map(function (f) { return [String(f.id), f.name]; })).forEach(function (o) {
        var op = el('option', { value: o[0], text: o[1] });
        if (String(App.massFrame == null ? '' : App.massFrame) === o[0]) op.selected = true;
        sel.appendChild(op);
      });
      body.insertBefore(el('tr', {}, [el('th', { text: 'Report coordinate values relative to' }), el('td', {}, [sel])]), body.firstChild);
      var setRow = function (name, text) { rows.forEach(function (r) { if (r[0] === name) r[1] = text; }); if (cells[name]) cells[name].textContent = text; };
      var applyFrame = function () {
        App.massFrame = sel.value === '' ? null : +sel.value;
        var fm = massInFrame(App.massFrame);
        if (!fm) return;
        setRow('Center of mass', fm.centroid.map(function (x) { return UI.fmtNum(Math.abs(x) < 5e-13 ? 0 : x, 3); }).join(', ') + ' ' + u);
        setRow('Bounding box', fm.bboxMin.map(function (x) { return UI.fmtNum(x, 2); }).join(', ') + '  →  ' + fm.bboxMax.map(function (x) { return UI.fmtNum(x, 2); }).join(', '));
        setRow('Extents', [0, 1, 2].map(function (k) { return UI.fmtNum(fm.bboxMax[k] - fm.bboxMin[k], 2); }).join(' × ') + ' ' + u);
      };
      sel.addEventListener('change', applyFrame);
      if (App.massFrame != null) applyFrame();
    }
    UI.showModal({ title: 'Mass Properties — ' + App.model.name, body: body, buttons: [{ label: 'Copy', action: function () {
      var head = sel ? ['Report coordinate values relative to: ' + sel.options[sel.selectedIndex].text] : [];
      copyText(head.concat(rows.map(function (r) { return r[0] + ': ' + r[1]; })).join('\n'));
    } }, { label: 'Close', primary: true, action: UI.closeModal }] });
  }
  // the part's Coordinate System features that rebuilt (the Mass Properties frame list)
  function massFrames() {
    var b = App.build && App.build.planes;
    return (App.model.features || []).filter(function (f) { return f.type === 'csys' && b && b[f.id] && b[f.id].refgeo === 'csys'; });
  }
  // massInFrame(csysId) -> { centroid, bboxMin, bboxMax, frame } in that system (null: the part origin), or null
  function massInFrame(id) {
    if (!App.mesh || !App.mesh.triCount) return null;
    var mp = K.massProps(App.mesh, App.model.density), cs = id != null && App.build && App.build.planes ? App.build.planes[id] : null;
    if (!cs || cs.refgeo !== 'csys') return { centroid: mp.centroid.slice(), bboxMin: mp.bbox.min.slice(), bboxMax: mp.bbox.max.slice(), frame: null };
    // the box of the vertices in the system's axes (not the world box carried over)
    var P = App.mesh.positions64 || App.mesh.positions, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i + 2 < P.length; i += 3) {
      var q = K.toCsys(cs, [P[i], P[i + 1], P[i + 2]]);
      for (var k = 0; k < 3; k++) { if (q[k] < lo[k]) lo[k] = q[k]; if (q[k] > hi[k]) hi[k] = q[k]; }
    }
    return { centroid: K.toCsys(cs, mp.centroid), bboxMin: lo, bboxMax: hi, frame: id };
  }

  function showShortcuts() {
    UI.showModal({ title: 'Keyboard shortcuts', body:
      '<table><tr><th>Ctrl+1 … Ctrl+7</th><td>Front, Back, Left, Right, Top, Bottom, Isometric</td></tr>' +
      '<tr><th>Ctrl+8</th><td>Normal To selected face / plane / sketch</td></tr>' +
      '<tr><th>F</th><td>Zoom to fit</td></tr><tr><th>Z / Shift+Z</th><td>Zoom out / in</td></tr>' +
      '<tr><th>Space</th><td>View orientation menu</td></tr>' +
      '<tr><th>S</th><td>Shortcut Bar at the pointer: the common commands for the part, sketch, assembly or drawing (arrows and Enter pick one, Esc closes it)</td></tr>' +
      '<tr><th>S, S</th><td>Start a sketch (or exit the current one): the first button of the Shortcut Bar</td></tr>' +
      '<tr><th>L, R, C, A, P, T, D</th><td>In a sketch: Line, Rectangle, Circle, Arc (A again: 3 Point Arc), Polygon, Slot, Smart Dimension (the same key again puts the tool down)</td></tr>' +
      '<tr><th>Esc</th><td>Cancel tool / command / selection</td></tr><tr><th>Enter</th><td>Accept the PropertyManager</td></tr>' +
      '<tr><th>Delete</th><td>Delete selected entity or feature</td></tr><tr><th>F2</th><td>Rename selected feature</td></tr>' +
      '<tr><th>Ctrl+Z / Ctrl+Y</th><td>Undo / Redo</td></tr><tr><th>Ctrl+B</th><td>Rebuild</td></tr><tr><th>Ctrl+S</th><td>Save</td></tr>' +
      '<tr><th>Ctrl+Enter</th><td>Run the script (in the script console)</td></tr></table>' });
  }
  function showAbout() {
    UI.showModal({ title: 'About Anvil', body: '<p><b>Anvil</b> — a scriptable parametric solid modeler with a SolidWorks-style workspace. Sketch on planes and faces, extrude, revolve, cut, pattern, mirror; export STL and DXF. Booleans run on a BSP CSG kernel in the browser; nothing leaves your machine.</p><p>Every model is a script (Tools → Macro), so it can be generated, diffed and rebuilt by a person or by Claude.</p>' +
      '<p><b>OpenCascade kernel</b> (Tools → OpenCascade kernel): Open CASCADE Technology 7.6 compiled to WebAssembly by opencascade.js 2.0.0-beta.b5ff984, used under the GNU LGPL 2.1 — <a href="vendor/occt/LICENSE-opencascade.js.txt" target="_blank" rel="noopener">licence</a>; source: <a href="https://github.com/donalffons/opencascade.js" target="_blank" rel="noopener">github.com/donalffons/opencascade.js</a> and <a href="https://github.com/Open-Cascade-SAS/OCCT" target="_blank" rel="noopener">github.com/Open-Cascade-SAS/OCCT</a>. Before it runs, the engine is checked against the official build\'s SHA-256 fingerprints (loader 8016d504…, binary 4b6a7439…); a file that does not match is refused.</p>' });
  }

  // ------------------------------------------------------------------ keyboard
  // Keys bound by the keydown handler below, by ribbon command id (used for ribbon tooltips). Keep in sync with the handler.
  var SHORTCUTS = {
    sketch: 'S, S', exitSketch: 'S, S', extrude: 'E', line: 'L', rect: 'R', circle: 'C', arc: 'A', arc3: 'A, A', polygon: 'P', slot: 'T', dim: 'D',
    fit: 'F', undo: 'Ctrl+Z', redo: 'Ctrl+Y', rebuild: 'Ctrl+B', save: 'Ctrl+S', new: 'Ctrl+N', open: 'Ctrl+O', normalTo: 'Ctrl+8', prevView: 'Shift+Ctrl+Z', orient: 'Space', delete: 'Del', rename: 'F2'
  };
  UI.shortcutFor = function (id) { return SHORTCUTS[id] || null; };
  // lane profiles: the keys of the document keydown handler (below) as one table, combo -> action. An action is a
  // name in KEY_ACTIONS or a ribbon command (UI.Commands). Combos are written Ctrl+Shift+Alt+Key ('Ctrl+1', 'Shift+Z',
  // 'Del', 'Space', 'F9'); entries marked 1 are aliases the handler always took (Shift+Ctrl+S saved too) and are not
  // shown. The active profile's `keys` ({ cmd: combo }) rebind on top: its combo runs its command, a default combo it
  // takes no longer runs the old action, every other default stays. Enter, Esc and S are not rebindable (the
  // two-Enter rule, one-Esc rule and the Shortcut Bar keep them).
  var KEY_DEFAULTS = [
    ['Ctrl+1', 'vFront'], ['Ctrl+2', 'vBack'], ['Ctrl+3', 'vLeft'], ['Ctrl+4', 'vRight'], ['Ctrl+5', 'vTop'], ['Ctrl+6', 'vBottom'], ['Ctrl+7', 'vIso'],
    ['Ctrl+8', 'normalTo'], ['Ctrl+Shift+Z', 'prevView'], ['Ctrl+Z', 'undo'], ['Ctrl+Y', 'redo'], ['Ctrl+Shift+Y', 'redo', 1],
    ['Ctrl+S', 'save'], ['Ctrl+Shift+S', 'save', 1], ['Ctrl+B', 'rebuild'], ['Ctrl+Shift+B', 'rebuild', 1], ['Ctrl+N', 'new'], ['Ctrl+Shift+N', 'new', 1],
    ['Ctrl+O', 'open'], ['Ctrl+Shift+O', 'open', 1],
    ['Del', 'delete'], ['Backspace', 'delete', 1], ['F9', 'toggleTree'], ['F2', 'rename'], ['F', 'fit'], ['Z', 'zoomOut'], ['Shift+Z', 'zoomIn'], ['Space', 'orient'],
    ['S', 'shortcutBar'], ['L', 'line'], ['R', 'rect'], ['C', 'circle'], ['A', 'arc'], ['P', 'polygon'], ['T', 'slot'], ['D', 'dim'], ['E', 'extrude']
  ];
  var KEY_FIXED = { Enter: 1, Esc: 1, S: 1 };
  // ribbon ids that are the same action as a key action (their tooltips show its key)
  var KEY_ALIAS = { vZoomFit: 'fit', vNormalTo: 'normalTo' };
  var VIEW_KEYS = { vFront: 'Front', vBack: 'Back', vLeft: 'Left', vRight: 'Right', vTop: 'Top', vBottom: 'Bottom', vIso: 'Isometric' };
  function sketchKey(tool) {
    return function () {
      if (App.mode !== 'sketch') return;
      var t = tool;
      // r5/sketch5: A again with the Centerpoint Arc goes on to the 3 Point Arc, then puts the tool down
      if (t === 'arc' && App.tool === 'arc') t = 'arc3';
      else if (t === 'arc' && App.tool === 'arc3') t = 'select';
      UI.setTool(App.tool === t ? 'select' : t);
    };
  }
  var KEY_ACTIONS = {
    normalTo: function (e) { e.preventDefault(); UI.normalToSelection(); },
    prevView: function (e) { e.preventDefault(); UI.previousView(); },
    undo: function (e) { e.preventDefault(); undoCommand(false, e.target); },
    redo: function (e) { e.preventDefault(); undoCommand(true, e.target); },
    save: function (e) { e.preventDefault(); fileSave(); },
    rebuild: function (e) { e.preventDefault(); UI.rebuild().then(function () { UI.toast('Rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms'); }); },
    'new': function (e) { e.preventDefault(); fileNew(); },
    open: function (e) { e.preventDefault(); fileOpen(); },
    'delete': function () { UI.deleteSelection(); },
    toggleTree: function (e) { if (UI.setFeatureManagerHidden) { e.preventDefault(); UI.setFeatureManagerHidden(); } },   // SolidWorks: F9 toggles the FeatureManager tree area
    rename: function (e) { if (App.sel && App.sel.kind === 'feature') { e.preventDefault(); UI.startRename(K.findFeature(App.model, App.sel.id)); } },
    fit: function () { UI.zoomToFit(); },
    zoomIn: function () { UI.zoomView(0.8); },   // lane profnav2: zoomView(f < 1) zooms in (SolidWorks: Shift+Z in, Z out)
    zoomOut: function () { UI.zoomView(1.25); },
    orient: function (e) { e.preventDefault(); if (UI.showOrientationMenu) { UI.showOrientationMenu(); return; } var hb = $('hud').children[5]; if (hb) hb.click(); },
    shortcutBar: function () { if (UI.showShortcutBar) UI.showShortcutBar(); else { UI.cmdSketch(); UI.refreshRibbon(); } },   // r14/commands14: ui-panels.js takes S first
    line: sketchKey('line'), rect: sketchKey('rect'), circle: sketchKey('circle'), arc: sketchKey('arc'), polygon: sketchKey('polygon'), slot: sketchKey('slot'), dim: sketchKey('dimension'),
    extrude: function () { UI.cmdExtrude(false); }
  };
  Object.keys(VIEW_KEYS).forEach(function (id) { KEY_ACTIONS[id] = function (e) { if (e && e.preventDefault) e.preventDefault(); UI.setView(VIEW_KEYS[id]); }; });
  var KEY_NAMES = { ' ': 'Space', Spacebar: 'Space', Delete: 'Del', Escape: 'Esc', Esc: 'Esc' };
  // 'shift+ctrl+z' / 'Ctrl+Shift+Z' -> 'Ctrl+Shift+Z'; null for text that is not one key (a menu's 'S, S')
  function keyCanon(text) {
    if (!text || /,/.test(text)) return null;
    var parts = String(text).split('+'), key = parts.pop(), mods = { ctrl: 0, shift: 0, alt: 0 };
    if (key === '' && parts.length) { parts.pop(); key = '+'; }
    for (var i = 0; i < parts.length; i++) { var m = parts[i].trim().toLowerCase(); if (m === 'cmd' || m === 'meta' || m === 'control') m = 'ctrl'; if (!(m in mods)) return null; mods[m] = 1; }
    key = key.trim();
    if (!key) return null;
    key = KEY_NAMES[key] || (/^del(ete)?$/i.test(key) ? 'Del' : /^space$/i.test(key) ? 'Space' : /^esc(ape)?$/i.test(key) ? 'Esc' : key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1));
    return (mods.ctrl ? 'Ctrl+' : '') + (mods.shift ? 'Shift+' : '') + (mods.alt ? 'Alt+' : '') + key;
  }
  function eventCombo(e, noAlt, noShift) {
    var k = e.key;
    if (k == null) return null;
    var ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey;
    // a plain letter's case is its Shift (Caps Lock z / Z as the handler always read them: z zooms out, Z in)
    if (!ctrl && k.length === 1 && k.toLowerCase() !== k.toUpperCase()) shift = k !== k.toLowerCase();
    k = KEY_NAMES[k] || (k.length === 1 ? k.toUpperCase() : k);
    return (ctrl ? 'Ctrl+' : '') + (shift && !noShift ? 'Shift+' : '') + (e.altKey && !noAlt ? 'Alt+' : '') + k;
  }
  var DEFAULT_MAP = {};
  KEY_DEFAULTS.forEach(function (d) { DEFAULT_MAP[d[0]] = d[1]; });
  var keyMap = null, keyMapFor = null;
  function profileKeys() { var P = UI.Profiles, p = P && P.def ? P.def(P.active()) : null; return p && p.keys ? p : null; }
  // the active table: combo -> action (rebuilt when the profile changes)
  function activeKeyMap() {
    var p = profileKeys(), sig = p ? p.id + '|' + (p.rev || 0) : '';
    if (keyMap && keyMapFor === sig) return keyMap;
    keyMap = Object.assign({}, DEFAULT_MAP); keyMapFor = sig;
    if (p) Object.keys(p.keys).forEach(function (cmd) {
      [].concat(p.keys[cmd]).forEach(function (k) {   // one combo, or a list ('Alt+F2', 'PageDown')
        var c = keyCanon(k);
        if (c && !KEY_FIXED[c]) keyMap[c] = cmd;
      });
    });
    return keyMap;
  }
  function profKey(p, id) { var k = p.keys[id]; return k == null ? null : [].concat(k)[0] || null; }
  // the action a key event runs: the exact combo, then without Alt, then (no Ctrl) without Shift, as the handler
  // always ignored those on plain keys (Shift+F fits, Alt+L is the Line tool)
  function keyHit(e) {   // the combo of the table that a key event matches (null: none)
    var map = activeKeyMap(), ctrl = e.ctrlKey || e.metaKey, c;
    c = eventCombo(e); if (map[c]) return c;
    if (e.altKey) { c = eventCombo(e, true); if (map[c]) return c; }
    if (!ctrl) {
      c = eventCombo(e, false, true); if (map[c]) return c;
      c = eventCombo(e, true, true); if (map[c]) return c;
    }
    return null;
  }
  function keyAction(e) { var c = keyHit(e); return c ? activeKeyMap()[c] : null; }
  // lane profnav2: the action only when the active profile bound that combo (not SolidWorks' own key), for handlers
  // that keep their own SolidWorks keys and add the profile's (the drawing's keydown, drawing-ui-panels.js)
  function profileKeyAction(e) {
    var c = profileKeys() ? keyHit(e) : null, map = c ? activeKeyMap() : null;
    return c && map[c] !== DEFAULT_MAP[c] ? map[c] : null;
  }
  function runKeyAction(name, e) {
    if (KEY_ACTIONS[name]) { KEY_ACTIONS[name](e); return true; }
    if (UI.Commands && UI.Commands.run(name)) { if (e && e.preventDefault) e.preventDefault(); return true; }
    return false;
  }
  // the key a tooltip / menu shows for a ribbon id or key action (its own `key` text as the default)
  function activeKey(id, ownKey) {
    var def = ownKey || SHORTCUTS[id] || null, p = profileKeys();
    if (!p) return def;
    var act = KEY_ALIAS[id] || id;
    if (profKey(p, id)) return profKey(p, id);
    if (profKey(p, act)) return profKey(p, act);
    var c = keyCanon(def);
    if (c && DEFAULT_MAP[c] && activeKeyMap()[c] !== DEFAULT_MAP[c]) return null;   // the profile gave this key to another command
    return def;
  }
  function menuKeyText(text) {
    var p = profileKeys();
    if (!p) return text;
    var c = keyCanon(text), act = c && DEFAULT_MAP[c];
    if (!act) return text;
    if (profKey(p, act)) return profKey(p, act);
    return activeKeyMap()[c] === act ? text : '';
  }
  UI.activeKey = activeKey; UI.menuKeyText = menuKeyText;
  UI.keys = { canon: keyCanon, defaults: function () { return KEY_DEFAULTS.filter(function (d) { return !d[2]; }).map(function (d) { return { key: d[0], action: d[1] }; }); },
    map: function () { return Object.assign({}, activeKeyMap()); }, actionFor: keyAction, profileActionFor: profileKeyAction, run: runKeyAction, fixed: Object.keys(KEY_FIXED), reset: function () { keyMap = null; } };
  // Typing goes to a text box, a list or an editable element that is still on screen; a check box, a button or a box
  // that went away with its PropertyManager (✓ leaves the focus on a PM control) does not keep the view keys (F, Z…).
  function typingIn(t) {
    if (!t || t === document.body || !t.tagName) return false;
    var tag = t.tagName.toLowerCase();
    var text = tag === 'textarea' || tag === 'select' || t.isContentEditable ||
      (tag === 'input' && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test(t.type || ''));
    return !!text && t.isConnected && !!(t.offsetWidth || t.offsetHeight || t.getClientRects().length);
  }
  // lane BY (user, 2026-10-13): Ctrl+Z / Ctrl+Y, Edit ▸ Undo / Redo and the Undo / Redo buttons with a command's
  // PropertyManager open cancel the command first (its preview and whatever it had not applied go: "Translate
  // cancelled."); the next Ctrl+Z undoes. Before, the undo ran under the open command: the step before it was undone
  // and the command closed without its ✗. Not a command: a PM that only shows the selection (Line / Point / Properties,
  // a sketch dimension) and a sketch tool's own PM (Insert Line …), where Ctrl+Z undoes at once (the last line drawn)
  // and the tool keeps its PM, as in SolidWorks; a drawing's PMs keep the drawing's own undo. In the command's value box
  // Ctrl+Z takes back what was typed there first (the browser's own text undo); with nothing typed it cancels.
  // rfCM: the curve family's tool PM (Circle / Arc / Polygon / Slot, ui-sketch-curves.js openToolPM: _curves.kind
  // 'tool', no sketchTool flag) is a sketch tool's PM too; it was cancelled ("Circle cancelled.", the tool put down, the
  // circle kept) where Line / Rectangle undid the entity at once.
  function pmIsCommand(spec) {
    return !!(spec && !spec.sketchTool && !spec.selectionPM && spec.entityIndex == null && !spec._skEntity && !spec._txtEntity &&
      !(spec._curves && (spec._curves.kind === 'entity' || spec._curves.kind === 'tool')) && !(UI.dimensionPMOpen && UI.dimensionPMOpen()));
  }
  function pmIsSketchTool(spec) { return !!(spec && (spec.sketchTool || (spec._curves && spec._curves.kind === 'tool'))); }
  function undoCancelsPM(target) {
    var spec = UI.pmSpec && UI.pmSpec();
    if (!pmIsCommand(spec) || (UI.drawingActive && UI.drawingActive())) return false;
    if (target && typingIn(target)) {
      var root = $('pm');
      if (!root || !root.contains(target)) return false;   // the script console, a dimension's value box: their own Ctrl+Z
      // typed text in the command's box: undo the typing first. rfCM: text the code put there ("=" or a shop entry's
      // letter switching a number box to text, ui-commands.js: _codeText) is not in the browser's history, so with the
      // box still at that text Ctrl+Z has nothing to take back and cancels the command instead of doing nothing
      if (UI.pmPending && UI.pmPending(target) && target.value !== target._codeText) return false;
    }
    return true;
  }
  // rfCM: `target` is the key's target for Ctrl+Z / Ctrl+Y, null for Edit ▸ Undo / Redo and the toolbar buttons: a menu
  // row runs on mouseup with the focus still in the command's box (the menu bar swallows the mousedown), and a menu never
  // triggers the browser's text undo, so the "typed text in the box" exception is the keyboard's only; before, Edit ▸
  // Undo with text typed in the box undid the previous step under the open command.
  // lane CY2 (SolidWorks): a sketch tool that commits an edit per click (Trim / Extend / Split Entities, the construct
  // tools) opens its PropertyManager with `undoInside: UI.undoMark()`, the undo stack's top as it opened. While the
  // stack holds snapshots pushed since (the tool's own edits), Ctrl+Z undoes the last of them and the tool stays open
  // (spec.onUndoInside(redo) lets it drop picks that named the old geometry); Ctrl+Y redoes what it undid. With none
  // left, Ctrl+Z cancels the tool as it cancels any command. Feature PropertyManagers keep the rfCM rule.
  UI.undoMark = function () { return { top: App.undo.length ? App.undo[App.undo.length - 1] : null, undone: 0 }; };
  function insideSteps(spec) {
    var m = spec && spec.undoInside;
    if (!m || App.mode !== 'sketch' || (UI.drawingActive && UI.drawingActive())) return 0;
    // the mark's place (-1: the stack was empty, or the mark has been shifted out of a full stack: all of it is the tool's)
    var at = m.top == null ? -1 : App.undo.lastIndexOf(m.top);
    return App.undo.length - 1 - at;
  }
  function insideCan(redo, spec) { return redo ? !!(spec && spec.undoInside && spec.undoInside.undone > 0 && App.redo.length && insideSteps(spec) >= 0 && App.mode === 'sketch') : insideSteps(spec) > 0; }
  function undoInside(redo, spec) {
    var m = spec.undoInside;
    if (redo) { App.undo.push(JSON.stringify(App.model)); App.model = JSON.parse(App.redo.pop()); m.undone--; }
    else { App.redo.push(JSON.stringify(App.model)); App.model = JSON.parse(App.undo.pop()); m.undone++; }
    App.sketchDirty = false; App.sel = null; App.sel2 = null; App.dimsStale = true;
    if (spec.onUndoInside) { try { spec.onUndoInside(redo); } catch (e) { } }
    if (UI.setStatus) UI.setStatus((redo ? 'Step redone' : 'Last step undone') + ' (' + (UI.pmTitle ? UI.pmTitle() : 'the command') + ' stays open).');
    var p = UI.rebuild();
    if (UI.updateSketches) UI.updateSketches();
    if (UI.refreshTree) UI.refreshTree();
    return p;
  }
  function undoCommand(redo, target) {
    var spec0 = UI.pmSpec && UI.pmSpec();
    if (spec0 && spec0.undoInside && !(target && typingIn(target) && $('pm') && $('pm').contains(target) && UI.pmPending && UI.pmPending(target)) && insideCan(redo, spec0)) return undoInside(redo, spec0);
    if (undoCancelsPM(target)) {
      var title = UI.pmTitle ? UI.pmTitle() : '';
      UI.pmCancel();
      var sm = $('status-msg');
      if (title && sm && !/cancelled/.test(sm.textContent)) UI.setStatus(title + ' cancelled.');
      return UI.whenIdle();
    }
    var spec = UI.pmSpec && UI.pmSpec(), tool = pmIsSketchTool(spec) && App.mode === 'sketch' ? App.tool : null;
    if (redo ? !App.redo.length : !App.undo.length) return UI.whenIdle();
    var p = redo ? UI.redo() : UI.undo();
    // the undo closed every PropertyManager (ui-core.js afterModelSwap): a sketch tool still in hand gets its own back
    // (rfCM: a curve tool's PM puts its tool down as it closes, onClose, so the tool may read 'select' here)
    if (tool && tool !== 'select' && App.mode === 'sketch' && (App.tool === tool || App.tool === 'select') && !UI.hasPM() && UI.setTool) UI.setTool(tool);
    return p;
  }
  // lane BY: the two-Enter rule (ui-commands.js pmEnter) counts what was typed, not only a changed text: "3" typed over a
  // selected 3 (Rectangular Array's instances) and Enter was ✓ and closed the command with the distance still to set.
  // A PropertyManager box typed in holds an entry until Enter commits it, whatever its text.
  // rfCM: the browser's own text undo / redo (Ctrl+Z in the box) fires an input event too; one landing back on the armed
  // text is not that text typed again: the box is clean (it was left pending for good, the next Ctrl+Z did nothing and
  // Enter committed again instead of ✓).
  document.addEventListener('input', function (e) {
    if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') return;
    var t = e.target, root = $('pm');
    if (!t || t.tagName !== 'INPUT' || t._armed == null || t.value !== t._armed || !root || !root.contains(t)) return;
    t._armed = '\u0000' + t._armed;   // the same text, but typed: pending (pmPending compares the two)
  }, true);
  UI.undoCommand = function () { return undoCommand(false, null); };
  UI.redoCommand = function () { return undoCommand(true, null); };
  UI.undoCancelsPM = undoCancelsPM;
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = typingIn(e.target);
    if (!$('modal').hidden) {
      if (e.key === 'Escape') UI.closeModal();
      // Enter = the dialog's default (primary) button, as in SolidWorks dialogs; not from a text area, a focused
      // button (Enter presses that one) or a field that already handled the key
      else if (e.key === 'Enter' && !e.defaultPrevented && tag !== 'textarea' && tag !== 'button' && tag !== 'select' && UI.modalDefault) { e.preventDefault(); UI.modalDefault(); }
      return;
    }
    if (e.key === 'Escape') {
      // an in-place editor that is not a command (a rename, a table cell, a level number) took its own Esc
      if (e.defaultPrevented) return;
      // Esc with a menu or a ribbon flyout open only closes it (it does not also cancel the command or clear the selection)
      if ((UI.menuOpen && UI.menuOpen()) || document.querySelector('.rb-fly.open, .rb-more.open, #menus > li.open')) { UI.closeMenus(); return; }
      UI.closeMenus();
      if (App.zoomAreaMode) { App.zoomAreaMode = false; UI.refreshHud(); return; }
      // one press ends the active command completely (ui-commands.js escapeCommand); a box outside any command (the
      // command search) only lets go of the keyboard
      if (UI.escapeCommand && UI.escapeCommand()) { e.preventDefault(); return; }
      if (typing) { e.target.blur(); return; }
      App.sel = null; App.sel2 = null; UI.updateHighlights(); UI.updateSketches(); UI.refreshTree();
      return;
    }
    // lane BY: Ctrl+Z / Ctrl+Y in a command's value box with nothing typed cancels the command (undoCommand)
    if (typing && !((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && /^[zZyY]$/.test(e.key) && undoCancelsPM(e.target))) return;
    // a focused check box or option keeps Space, Enter and Delete for itself
    if (tag === 'input' && e.target.isConnected && (e.key === ' ' || e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace')) return;
    // lane profiles: every other key goes through the key table (KEY_DEFAULTS + the active profile's keys)
    if (!(e.ctrlKey || e.metaKey) && e.key === 'Enter' && UI.hasPM()) { e.preventDefault(); UI.pmEnter(e.target); return; }   // lane BP: nothing typed here, so ✓ (ui-commands.js pmEnter)
    var act = keyAction(e);
    if (act) runKeyAction(act, e);
  });

  // ------------------------------------------------------------------ theme (light | dark)
  // The stylesheet keys every colour off html[data-theme]; the three.js materials follow through UI.setViewportTheme (ui-core.js).
  var THEMES = ['light', 'dark'];
  function theme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
  function setTheme(name) {
    name = THEMES.indexOf(name) >= 0 ? name : 'light';
    document.documentElement.dataset.theme = name;
    try { localStorage.setItem('anvil.theme', name); } catch (e) { }
    if (UI.setViewportTheme) UI.setViewportTheme(name);
    App.gridStale = true; App.dimsStale = true;   // sketch grid and dimension overlay pick up the new colours
    // the View ▸ Theme check marks come from MENUS(), which is re-evaluated every time a menu opens
    return name;
  }
  UI.theme = theme; UI.setTheme = setTheme;

  // ------------------------------------------------------------------ automation API (for the browser console / Claude)
  window.anvil = {
    theme: function (name) { if (arguments.length) setTheme(name); return theme(); },
    // lane profiles: profile() -> the active interface profile's id; profile(id) lays Anvil out like that program
    // ('solidworks' (default), 'mastercam'; UI.Profiles.list()) and returns the id now active
    profile: function (id) { if (!UI.Profiles) return 'solidworks'; if (arguments.length && id != null) UI.Profiles.set(id); return UI.Profiles.active(); },
    // run / append / load / rebuild resolve to the summary (or reject with the script error) once the build is applied
    run: function (code) { return runScript(code, true).then(function (r) { if (r.error) throw new Error(r.error); return window.anvil.summary(); }); },
    append: function (code) { return runScript(code, false).then(function (r) { if (r.error) throw new Error(r.error); return window.anvil.summary(); }); },
    model: function () { return JSON.parse(JSON.stringify(App.model)); },
    load: function (json) { rememberPart(); App.hiddenBodies = {}; return UI.loadModel(typeof json === 'string' ? JSON.parse(json) : json).then(function () { return window.anvil.summary(); }); },
    busy: function () { return !!App.rebuilding; },
    idle: function () { return UI.whenIdle(); },
    // tessellation() -> { chordTol, preset, segsR10 }; tessellation(preset | chordTol | { chordTol }) sets the document's
    // Image Quality (undoable, saved in the model) and resolves to the same object once rebuilt
    tessellation: function (opts) {
      if (!arguments.length || opts == null) return UI.imageQuality();
      return UI.setImageQuality(opts).then(function () { return UI.imageQuality(); });
    },
    workerOn: function (on) { if (arguments.length) UI.setWorkerOn(on); return App.workerOn; },
    // realView() -> on / off; realView(on) turns RealView Graphics on or off (rfHC, ui-core.js)
    realView: function (on) { return on == null ? UI.realView() : UI.setRealView(!!on); },
    script: function () { return modelScript(); },
    stl: function () { return K.exportSTL(App.mesh, App.model.name); },
    // neutral formats (exchange.js): STEP AP214 text, 3MF bytes (Uint8Array), OBJ text (+ exportMtl), from the open
    // document (part or assembly) as last built
    exportStep: function (opts) { return Exchange.exportSTEP(App.model, App.build, opts); },
    // IGES of the part as built by OpenCascade (Tools ▸ OpenCascade kernel), null otherwise
    exportIges: function () { var oe = occtExports(); return oe && oe.iges || null; },
    export3mf: function (opts) { return Exchange.export3MF(App.model, App.build, opts); },
    exportObj: function (opts) { return Exchange.exportOBJ(App.model, App.build, opts); },
    exportMtl: function () { return Exchange.exportMTL(App.model, App.build); },
    // importFile(name, data, { into: 'new' | 'current', units, sourceUnits, merge }) -> Promise of the summary: a STEP /
    // STL / OBJ / 3MF file as a new part (Imported1), or as an Imported feature appended to the open part; .json / .js
    // open as documents
    importFile: function (name, data, opts) { return openFileData(name, data, opts); },
    // saveAs(type, baseName?, opts?) downloads the file File ▸ Save As would (type: json, script, step, 3mf, obj, stl,
    // iges, dxf, dwg) and returns { name, data, mime, extra }. dxf / dwg take the dxfOutput options; dwg converts on
    // the local server, so it returns a Promise of { name, data (ArrayBuffer), mime }
    saveAs: function (type, base, opts) {
      if (type === 'dxf' || type === 'dwg') {
        built('saveAs ' + type);
        // the DWG converters read R2000 (an R12 file loses its model space in LibreDWG)
        if (type === 'dwg') opts = Object.assign({}, opts, { version: 'R2000' });
        var text = UI.dxfOutput(opts), nm = (base || safeName()) + '.' + type;
        if (type === 'dxf') { download(nm, text, 'application/dxf'); return { name: nm, data: text, mime: 'application/dxf' }; }
        return UI.dxfToDwg(text).then(function (bytes) { download(nm, bytes, 'application/acad'); return { name: nm, data: bytes, mime: 'application/acad' }; });
      }
      var out = exportData(type, base); download(out.name, out.data, out.mime); if (out.extra) download(out.extra.name, out.extra.data, out.extra.mime); return out;
    },
    // dxfOutput({ export: 'faces' | 'views' | 'sheet', face, views: ['Front', 'Top', 'Right', 'Isometric'], current,
    // bendLines, notes, etch, formingTools, and (sheet, off by default) hiddenEdges, boundaryBox, bendLayers: 'split',
    // reliefLayer }) -> the DXF text the DXF/DWG Output PropertyManager would save, without opening it
    dxfOutput: function (opts) { built('dxfOutput'); return UI.dxfOutput(opts); },
    dxfFace: function (i) { return K.exportDXFFace(App.mesh, i, App.model.units); },
    dxfSketch: function (id) { return K.exportDXFSketch(K.findFeature(App.model, id), App.model.units); },
    // the flat pattern reads the model and its build together: while a rebuild is queued or running (a parameter just
    // changed) they would not match, so these throw "rebuild in progress" (await anvil.idle() first, or use the
    // ...Async forms, which wait for it)
    flat: function () { built('flat'); return K.flatPattern(App.model, App.build, App.mesh); },
    dxfFlat: function () { built('dxfFlat'); return K.exportDXFFlat(K.flatPattern(App.model, App.build, App.mesh), App.model.units); },
    // lane flatopts-2: the sheet-metal Cut-List Properties ({ rows: [{ name, value, text, unit }], values, error }, Kernel.sheetCutList)
    cutList: function () { built('cutList'); var r = K.sheetCutList(App.model, App.build, App.mesh); return { rows: r.rows, values: r.values, error: r.error }; },
    flatAsync: function () { return UI.whenIdle().then(function () { return window.anvil.flat(); }); },
    dxfFlatAsync: function () { return UI.whenIdle().then(function () { return window.anvil.dxfFlat(); }); },
    edges: function () { return (App.edges || []).filter(function (e) { return !e.smooth && e.faces.length === 2; }).map(function (e, i) { return { mid: e.mid.map(function (x) { return +x.toFixed(3); }), len: +e.len.toFixed(3), convex: e.convex }; }); },
    // mass properties; parts go through materials.js (bodies with their own material, massKg), same fields as Kernel.massProps
    mass: function () { return isAsm() && hasAssembly() ? Assembly.massProps(App.model, App.build) : typeof Materials !== 'undefined' ? Materials.massProps(App.model, App.build, App.mesh) : K.massProps(App.mesh, App.model.density); },
    faces: function () { return App.mesh.faces.map(function (f, i) { return { index: i, normal: f.normal, area: +f.area.toFixed(3), centroid: f.centroid.map(function (x) { return +x.toFixed(3); }) }; }); },
    // separate solid bodies of a multi-body part: [{ index, featureId, name, volume }]
    bodies: function () { return (UI.bodyInfos ? UI.bodyInfos() : []).map(function (b) { return { index: b.index, featureId: b.featureId, name: b.name, volume: +b.volume.toFixed(3) }; }); },
    selectBody: function (i) { if (UI.selectBody) UI.selectBody(i); else if (UI.selectBodyRow) UI.selectBodyRow(i); else { App.sel = { kind: 'body', index: i }; UI.updateHighlights(); UI.refreshTree(); } return window.anvil.bodies()[i] || null; },
    features: function () { return App.model.features.map(function (f) { return { id: f.id, type: f.type, name: f.name, error: App.build.errors[f.id] || null }; }); },
    select: function (i) { App.sel = { kind: 'face', index: i }; UI.updateHighlights(); return App.mesh.faces[i]; },
    view: function (name) { UI.setView(name); },
    fit: function () { UI.zoomToFit(); },
    png: function () { if (UI.finishViewAnimation) UI.finishViewAnimation(); UI.render(); return UI.renderer.domElement.toDataURL('image/png'); },
    rebuild: function () { return UI.rebuild().then(function () { return window.anvil.summary(); }); },
    // equations() -> a copy of model.equations ([{ name, expr }]); equations(list | { T: 10, W: '=T*2' }) replaces them
    // (one undo step), rebuilds, and resolves to the summary (whose `equations` holds the evaluated variables)
    equations: function (spec) {
      if (!arguments.length) return JSON.parse(JSON.stringify(App.model.equations || []));
      return UI.setEquations(spec).then(function () { return window.anvil.summary(); });
    },
    showEquations: function () { UI.showEquations(); },
    // configurations() -> { active: name | null, list: [{ name, values }] } (copies); configurations(list, active?)
    // replaces them all (one undo step), rebuilds and resolves to the summary. Also .add(name?), .rename(old, new),
    // .remove(name) and .activate(name), each one undo step resolving to the summary (or rejecting with the reason).
    configurations: function (list, active) {
      if (!arguments.length) return { active: UI.configurations.active(), list: UI.configurations.list() };
      return UI.configurations.set(list, active).then(function () { return window.anvil.summary(); });
    },
    activateConfiguration: function (name) { return UI.configurations.activate(name).then(function () { return window.anvil.summary(); }); },
    // summary(): the build last applied (rebuilding: true while a newer one is queued or running; await anvil.idle())
    summary: function () {
      if (isAsm()) return asmSummary();
      var mp = App.mesh.triCount ? K.massProps(App.mesh, App.model.density) : null; return { name: App.model.name, type: 'part', rebuilding: rebuilding(), dirty: !!App.dirty, features: App.model.features.length, errors: App.build.errors, volume: mp ? +mp.volume.toFixed(3) : 0, bbox: mp ? mp.bbox : null, faces: App.mesh.faces.length, bodies: UI.bodyList ? UI.bodyList().length : (App.mesh.triCount ? 1 : 0), rebuildMs: +App.lastRebuildMs.toFixed(1), equations: JSON.parse(JSON.stringify((App.build && App.build.equations) || {})), equationErrors: JSON.parse(JSON.stringify((App.build && App.build.equationErrors) || {})), configuration: UI.configurations.active(), configurations: UI.configurations.list().map(function (c) { return c.name; }) }; },
    examples: EXAMPLES,
    // rfHH Design Library: library = AnvilLibrary (hardware, shapes, features); libraryPart(family | shape name, size?, len?)
    // opens it as a new part (in an assembly: inserts it); libraryFeature(id, { face, point?, x?, y?, ...size }) cuts a
    // library feature into a planar face (face index of anvil.faces()) and resolves to { sketch, cut } once rebuilt
    library: window.AnvilLibrary || null,
    libraryPart: function (name, size, len) {
      var L = window.AnvilLibrary, sh = L && L.shape(name), p = sh ? { name: sh.name, code: sh.code } : L.part(name, size, len);
      return placeLibraryPart({ name: p.name, code: p.code }, { noConfirm: true }).then(function () { return window.anvil.summary(); });
    },
    libraryFeature: function (id, opts) {
      if (!libraryFeature(id, opts || {})) return Promise.reject(new Error('Library feature ' + id + ' could not start'));
      return Promise.resolve(UI.pmOK()).then(function (made) { return made && made.cut ? made : window.anvil.summary(); });
    },
    // ---- assembly documents. Each change is one undo step and resolves to the summary once rebuilt; the calls that
    // need an assembly reject with "Not an assembly document" in a part.
    newAssembly: function (name) { return newAssembly(name); },
    newPart: function (name) { return newPart(name); },
    isAssembly: function () { return isAsm(); },
    // insert(source, { position, rotation, fixed, name }): source = Design Library part name | { example } | { script } | { model }
    insert: function (source, opts) { return needAsm().then(function () { return UI.asm.insert(source, opts); }).then(function () { return window.anvil.summary(); }); },
    // mate('coincident' | 'concentric' | 'distance' | 'angle', refA, refB, { alignment, name, suppressed, distance, angle, offset, flip });
    // refs as in assembly.js
    mate: function (type, a, b, opts) { return needAsm().then(function () { return UI.asm.mate(type, a, b, opts); }).then(function () { return window.anvil.summary(); }); },
    components: function () {
      if (!isAsm()) return [];
      var vols = {};
      try { (Assembly.massProps(App.model, App.build).components || []).forEach(function (c) { vols[c.id] = c.volume; }); } catch (e) { }
      return (App.model.components || []).map(function (c, i) {
        var st = UI.compStatus(c.id) || {};
        return { id: c.id, name: c.name, index: i, fixed: !!c.fixed, dof: st.dof != null ? st.dof : null, underDefined: !!st.underDefined, overDefined: !!st.overDefined,
          position: c.transform.position.slice(), rotation: c.transform.rotation.slice(), volume: vols[c.id] != null ? +vols[c.id].toFixed(3) : 0, error: st.error || (App.build.errors || {})[c.id] || null };
      });
    },
    mates: function () {
      if (!isAsm()) return [];
      return (App.model.mates || []).map(function (m) {
        var st = UI.mateStatus(m), o = { id: m.id, name: m.name, type: m.type, ok: !m.suppressed && !st.error, error: m.suppressed ? null : st.error, suppressed: !!m.suppressed };
        ['distance', 'angle', 'offset', 'min', 'max', 'ratio'].forEach(function (k) { if (m[k] != null) o[k] = m[k]; });
        if (m.flip) o.flip = true;
        return o;
      });
    },
    // Move / Rotate Component: the component's stored transform changes, then its mates are solved again
    moveComponent: function (idOrName, delta) { return needAsm().then(function () { return UI.asm.move(idOrName, delta); }).then(function () { return window.anvil.summary(); }); },
    // rotateComponent(idOrName, 'x' | 'y' | 'z' | [x, y, z], degrees): about the component's centre
    rotateComponent: function (idOrName, axis, deg) { return needAsm().then(function () { return UI.asm.rotate(idOrName, axis, deg); }).then(function () { return window.anvil.summary(); }); },
    // Interference Detection on the current build: { count, volume, pairs: [{ a, b, aId, bId, volume }] } (largest first)
    interference: function () {
      if (!isAsm() || !hasAssembly()) return { count: 0, volume: 0, pairs: [] };
      var r = UI.interference();
      return { count: r.pairs.length, volume: r.volume, pairs: r.pairs.map(function (p) { return { a: p.aName, b: p.bName, aId: p.a, bId: p.b, volume: p.volume }; }) };
    },
    fix: function (idOrName, fixed) { return needAsm().then(function () { return UI.asm.fix(idOrName, fixed !== false); }).then(function () { return window.anvil.summary(); }); },
    removeComponent: function (id) { return needAsm().then(function () { return UI.asm.removeComponent(id); }).then(function () { return window.anvil.summary(); }); },
    removeMate: function (id) { return needAsm().then(function () { return UI.asm.removeMate(id); }).then(function () { return window.anvil.summary(); }); }
  };
  function rebuilding() { return !!(UI.rebuildPending && UI.rebuildPending()); }
  function built(what) { if (rebuilding()) throw new Error('anvil.' + what + '(): rebuild in progress. Wait for it (await anvil.idle()) and call again.'); }
  function needAsm() { return isAsm() && hasAssembly() ? Promise.resolve() : Promise.reject(new Error('Not an assembly document')); }
  function asmSummary() {
    var mp = null;
    try { mp = (App.model.components || []).length ? Assembly.massProps(App.model, App.build) : null; } catch (e) { mp = null; }
    return { name: App.model.name, type: 'assembly', rebuilding: rebuilding(), dirty: !!App.dirty, features: 0, components: (App.model.components || []).length, mates: (App.model.mates || []).length,
      errors: App.build.errors, volume: mp ? +mp.volume.toFixed(3) : 0, bbox: mp ? mp.bbox : null, faces: App.mesh.faces.length,
      bodies: UI.bodyList ? UI.bodyList().length : 0, rebuildMs: +(App.lastRebuildMs || 0).toFixed(1), equations: {}, equationErrors: {}, configuration: null, configurations: [] };
  }
  window.anvil.configurations.activate = window.anvil.activateConfiguration;
  ['add', 'rename', 'remove'].forEach(function (op) {
    window.anvil.configurations[op] = function () { return UI.configurations[op].apply(null, arguments).then(function () { return window.anvil.summary(); }); };
  });

  // ------------------------------------------------------------------ Search Commands (rfAP)
  // The menu-bar box searches every CommandManager command (flyouts and stacks opened up, every tab of the document)
  // and every menu row by name and by SolidWorks' other words for it ("stretch entities", "constrain all", "hole
  // table", "flat pattern"); the matches are listed under the box with their icons and where they live, best first;
  // Enter (or a click) runs the first one that can run now, Esc closes the list.
  var SEARCH_ALIASES = {
    'Extruded Boss/Base': 'extrude boss base pad', 'Extruded Cut': 'cut extrude pocket', 'Revolved Boss/Base': 'revolve', 'Hole Wizard': 'hole tapped drill counterbore countersink',
    'Linear Pattern': 'pattern array', 'Circular Pattern': 'circular polar pattern', 'Smart Dimension': 'dimension dim measure sketch',
    'Add Relation': 'relation constraint constrain', 'Fully Define Sketch': 'fully define autodimension auto dimension', 'Constrain All': 'constrain all lock fully constrain dxf relations',
    'Modify': 'modify sketch move sketch rotate sketch flip sketch translate scale sketch position dxf', 'Segment': 'segment divide equal points',
    'Equation Driven Curve': 'equation curve function parametric', 'Stretch Entities': 'stretch', 'Trim Entities': 'trim cut lines', 'Offset Entities': 'offset',
    'Convert Entities': 'convert project edges use edge', 'Mirror Entities': 'mirror sketch', 'Insert DXF / DWG': 'import dxf dwg open dxf blank',
    'Repair Sketch': 'repair fix gaps', 'Check Sketch for Feature': 'check sketch open contour', 'Centerline': 'centreline construction line',
    'Corner Rectangle': 'rectangle box square', 'Straight Slot': 'slot obround', 'Base Flange/Tab': 'sheet metal base flange tab',
    'Edge Flange': 'flange bend', 'Sketched Bend': 'bend line brake', 'Flatten': 'flat pattern unfold flat blank', 'Flat to DXF': 'flat pattern dxf export laser',
    'Hole Table': 'hole table hole chart', 'Note': 'note text annotation', 'Mass Properties': 'mass weight', 'Measure': 'measure distance',
    'Sketch Fillet': 'fillet round corner', 'Sketch Chamfer': 'chamfer bevel',
    'Close Arc': 'close arc full circle complete arc', 'Show Endpoints': 'display endpoints end points dots'   // lane BS
  };
  function cmdSearchIndex() {
    var out = [], seen = {};
    function flat(s) { return String(s || '').replace(/\s*\n\s*/g, ' ').replace(/…$/, '').trim(); }
    function add(e) {
      var k = e.name.toLowerCase();
      // the same name on two ribbon tabs (Features ▸ Mirror, Transform ▸ Mirror): both listed, the later one named with its tab
      if (seen[k] && e.tab && seen[k].tab && e.tab !== seen[k].tab) { e.name += ' (' + e.tab + ')'; k = e.name.toLowerCase(); }
      if (seen[k] && (seen[k].enabled || !e.enabled)) return;
      if (seen[k]) out.splice(out.indexOf(seen[k]), 1);
      seen[k] = e; out.push(e);
    }
    var set = isAsm() ? (UI.ASM_RIBBON || UI.RIBBON) : UI.RIBBON, names = Object.keys(set || {}), shown = names;
    if (UI.ribbonTabsFor) { try { shown = UI.ribbonTabsFor(names.slice(), [])[0]; } catch (err) { shown = names; } }
    var drawing = !!(UI.drawingActive && UI.drawingActive());
    // the tabs on screen first, then the others (a drawing's tabs from a part, the part's from a drawing)
    names.slice().sort(function (a, b) { return (shown.indexOf(a) < 0) - (shown.indexOf(b) < 0); }).forEach(function (tab) {
      var here = shown.indexOf(tab) >= 0;
      (UI.ribbonLeaves ? UI.ribbonLeaves(set[tab]) : []).forEach(function (it) {
        var name = flat(it.label), can = !!(it.run || it.tool), alias = '', where = tab;
        // lane profiles: under another program's layout the command goes by that program's name (and is still found by
        // SolidWorks' name) and lives on that layout's tab
        var pc = UI.Profiles && UI.Commands ? UI.Commands.cmdOf(it) : null, pl = pc ? UI.Profiles.labelFor(pc) : null;
        if (pl) { alias = name + ' ' + (SEARCH_ALIASES[name] || ''); name = flat(pl); }
        if (pc && here) where = UI.Profiles.tabOf(pc) || where;
        add({ name: name, alias: alias, icon: it.icon || it.id, where: where + (here ? '' : drawingTab(tab) ? ' (drawing)' : ''), enabled: can, here: here, sketchTool: !!it.tool, tab: tab,
          run: function () {
            if (!here) { UI.toast(drawingTab(tab) && !drawing ? 'Open a drawing first: ' + name + ' is on its ' + tab + ' tab.' : name + ' is not on this document\'s CommandManager.'); return; }
            // lane mcdirect2: with no sketch open a drawing tool starts one (UI.setTool -> UI.sketchToolStart), as the ribbon does
            if (it.tool && !it.run) { if (App.mode !== 'sketch' && !(UI.sketchToolStart && it.tool !== 'dimension')) { UI.toast('Open a sketch first: ' + name + ' is a sketch tool.'); return; } UI.setTool(it.tool); }
            else it.run();
            UI.refreshRibbon();
          } });
      });
    });
    var menus = [];
    try { menus = UI.menuModel ? UI.menuModel() : []; } catch (err) { menus = []; }
    menus.forEach(function (m) {
      (m.items || []).forEach(function (it) {
        if (it.sep || !it.label || !it.action) return;
        var parts = it.label.split(' ▸ '), name = flat(parts[parts.length - 1]);
        if (/^Units:|^Default units/.test(it.label)) name = flat(it.label);
        if (parts[0] === 'Blocks' && parts.length > 1 && !/Block/.test(name)) name += ' Block';   // SolidWorks' search names: Make Block, Insert Block…
        add({ name: name, icon: it.icon || null, where: [m.label].concat(parts.slice(0, -1)).join(' ▸ '), enabled: !it.disabled, here: true, run: function () { it.action(); } });
      });
    });
    // the Anvil words the box always knew
    [{ name: 'Export STL', alias: 'stl', run: exportSTL }, { name: 'Script', alias: 'script macro code', run: function () { openTaskPane('macro'); } },
      { name: 'New Assembly', alias: 'assembly', run: function () { newAssembly(); } }, { name: 'DXF / DWG Output', alias: 'dxf dwg export output', run: function () { UI.cmdDxfOutput(); } },
      { name: 'DWG Output', alias: 'dwg', run: function () { UI.cmdDxfOutput({ format: 'dwg' }); } },
      { name: 'Interface profile', alias: 'interface profile layout mastercam solidworks ui keys keyboard mouse like', run: function () { if (UI.Profiles) UI.Profiles.openSetting(); } }].forEach(function (x) { add({ name: x.name, alias: x.alias, icon: null, where: 'Anvil', enabled: true, here: true, run: x.run }); });
    return out;
  }
  function drawingTab(t) { return t === 'View Layout' || t === 'Annotation' || t === 'Sheet Format'; }
  // the matches for q, best first: { name, icon, where, enabled, run }
  function searchCommands(q) {
    q = String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!q) return [];
    var words = q.split(' '), sketch = App.mode === 'sketch';
    var hits = cmdSearchIndex().map(function (e) {
      var n = e.name.toLowerCase(), al = ((SEARCH_ALIASES[e.name] || '') + ' ' + (e.alias || '')).toLowerCase(), nw = n.split(/[\s/()-]+/), s = 0;
      if (n === q) s = 100;
      else if (n.indexOf(q) === 0) s = 80;
      else if (words.every(function (w) { return nw.some(function (x) { return x.indexOf(w) === 0; }); })) s = 65;
      else if (n.indexOf(q) >= 0) s = 55;
      else if (al && (' ' + al + ' ').indexOf(' ' + q) >= 0) s = 45;
      else if (words.every(function (w) { return (n + ' ' + al).indexOf(w) >= 0; })) s = 30;
      if (!s) return null;
      if (!e.enabled) s -= 25;
      if (!e.here) s -= 15;
      if (sketch && (e.sketchTool || e.tab === 'Sketch')) s += 6;
      if (!sketch && e.tab === 'Features') s += 4;
      return { e: e, s: s };
    }).filter(Boolean);
    hits.sort(function (a, b) { return b.s - a.s || a.e.name.length - b.e.name.length; });
    return hits.slice(0, 14).map(function (h) { return h.e; });
  }
  function initCommandSearch() {
    var box = $('cmd-search'), shown = false;
    function close() { if (shown && UI.closeMenus) UI.closeMenus(); shown = false; }
    function runHit(h) {
      box.value = ''; close(); box.blur();
      if (!h.enabled) { UI.toast(h.name + ' is not available' + (App.mode !== 'sketch' && h.sketchTool ? ': open a sketch first.' : ' here.')); return; }
      h.run();
    }
    function list() {
      var hits = searchCommands(box.value);
      if (!hits.length) { close(); return; }
      var r = box.getBoundingClientRect();
      UI.showMenu(r.left, r.bottom, hits.map(function (h) { return { label: h.name, icon: h.icon || 'search', key: h.where, disabled: !h.enabled, action: function () { runHit(h); } }; }));
      var m = document.querySelector('body > .menu:last-of-type');
      if (m) { m.classList.add('cmd-search-list'); m.setAttribute('role', 'listbox'); }
      shown = true;
    }
    box.addEventListener('input', list);
    box.addEventListener('focus', function () { if (box.value) list(); });
    box.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement !== box) close(); }, 200); });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); box.value = ''; close(); box.blur(); return; }   // the search only (not the command under it)
      if (e.key !== 'Enter') return;
      var q = box.value, hits = searchCommands(q), first = hits.filter(function (h) { return h.enabled; })[0] || hits[0];
      if (first) runHit(first);
      else { close(); UI.toast('No command matches "' + q + '"'); }
    });
  }
  UI.searchCommands = function (q) { return searchCommands(q).map(function (h) { return { name: h.name, where: h.where, icon: h.icon, enabled: h.enabled }; }); };

  // lane DA: toasts sit over the middle of the graphics area (between the FeatureManager and the Task Pane), as
  // SolidWorks' pop-ups do, not over the middle of the window: the graphics area's centre and width go to CSS
  // variables (--gfx-cx, --gfx-w on <html>, read by .toast in style.css), refreshed whenever the viewport resizes
  function placeGfxCentre() {
    var v = UI.viewport, r = v && v.getBoundingClientRect();
    if (!r || r.width < 2) return;
    var s = document.documentElement.style, cx = Math.round(r.left + r.width / 2) + 'px', w = Math.round(r.width) + 'px';
    if (s.getPropertyValue('--gfx-cx') !== cx) s.setProperty('--gfx-cx', cx);
    if (s.getPropertyValue('--gfx-w') !== w) s.setProperty('--gfx-w', w);
  }
  UI.placeGfxCentre = placeGfxCentre;
  // lane DA: the status-bar coordinates must not jump when a chip to their right changes width ("Editing Part" →
  // "Editing Sketch12", Under → Fully Defined, the level chip): the chips' box keeps the widest it has been (at most
  // 45 % of the bar), so the coordinates' fixed-width box (style.css) stays put; a window resize starts afresh
  function holdStatusRight() {
    var sr = $('status-right'), bar = $('statusbar');
    if (!sr || !bar) return;
    var held = 0;
    function grow() {
      var w = Math.ceil(Math.max(sr.scrollWidth, sr.offsetWidth)), cap = bar.clientWidth * 0.45;
      if (w > held && w <= cap) { held = w; sr.style.minWidth = w + 'px'; }
    }
    if (window.ResizeObserver) new ResizeObserver(grow).observe(sr);
    if (window.MutationObserver) new MutationObserver(grow).observe(sr, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', function () { held = 0; sr.style.minWidth = ''; grow(); });
    grow();
  }

  // ------------------------------------------------------------------ lane mcpolish: Undelete Entity, Copy Image
  // Undelete Entity (Mastercam's Home ▸ Delete): every UI.deleteSelection (Del key, menus, ribbon) that removes sketch
  // entities pushes them on a stack (per sketch id, up to 20 deletions); UI.undeleteEntities() puts the last ones back
  // at the end of their sketch (one undo step), selected when that sketch is open. Relations and dimensions of the
  // deleted entities are not restored (Mastercam's wireframe has none either). The wrapper is the outermost one
  // (installed by boot, after every file's own wrapper).
  var undel = [];
  function sketchEnts() { var o = {}; ((App.model && App.model.features) || []).forEach(function (f) { if (f.type === 'sketch' && f.entities) o[f.id] = f.entities.map(function (e) { return JSON.stringify(e); }); }); return o; }
  function undelNote(before) {
    var after = sketchEnts(), gone = [];
    Object.keys(before).forEach(function (id) {
      var left = {};
      (after[id] || []).forEach(function (s) { left[s] = (left[s] || 0) + 1; });
      var ents = [];
      before[id].forEach(function (s) { if (left[s]) left[s]--; else ents.push(JSON.parse(s)); });
      if (ents.length) gone.push({ sketch: +id, entities: ents });
    });
    if (gone.length) { undel.push(gone); if (undel.length > 20) undel.shift(); }
    return gone.length;
  }
  function installUndelete() {
    var base = UI.deleteSelection;
    if (!base || base._undel) return;
    var w = function () {
      var before = App.model && !(UI.isAssembly && UI.isAssembly()) ? sketchEnts() : null;
      var out = base.apply(this, arguments);
      if (before) { if (out && typeof out.then === 'function') out.then(function () { undelNote(before); }); else undelNote(before); }
      return out;
    };
    w._undel = true;
    UI.deleteSelection = w;
  }
  function undeleteEntities() {
    var last = undel.pop();
    if (!last) { UI.toast('Nothing to undelete: no sketch entities were deleted.'); return 0; }
    var n = 0, open = null;
    UI.pushUndo();
    last.forEach(function (g) {
      var f = K.findFeature(App.model, g.sketch);
      if (!f || f.type !== 'sketch') return;
      var first = f.entities.length;
      g.entities.forEach(function (e) { f.entities.push(e); n++; });
      if (App.activeSketch === f.id) open = { first: first, n: g.entities.length };
    });
    if (!n) { UI.toast('Undelete: the sketch of those entities is gone.'); return 0; }
    if (open && UI.setSelection) { var sel = []; for (var i = open.first; i < open.first + open.n; i++) sel.push({ kind: 'entity', index: i }); UI.setSelection(sel); }
    UI.updateSketches();
    if (App.mode !== 'sketch') UI.rebuild();
    if (UI.autosave) UI.autosave();
    UI.setStatus('Undeleted ' + n + ' entit' + (n === 1 ? 'y' : 'ies') + (undel.length ? ' (Undelete again for the ones deleted before).' : '.'));
    return n;
  }
  UI.undeleteEntities = undeleteEntities;
  UI.undeleteCount = function () { return undel.length; };
  // Copy Image: the graphics window (the 3D view, or the drawing sheet's canvas) to the clipboard as a PNG; where the
  // browser has no image clipboard, the image is saved as a file instead. -> Promise of { ok, bytes, width, height, how }
  function copyImage() {
    var cv = null;
    try {
      if (UI.drawingActive && UI.drawingActive()) cv = document.querySelector('#dw-canvas, #drawing canvas, .dw-sheet canvas');
      if (!cv) { UI.render(); cv = UI.renderer.domElement; }
    } catch (e) { cv = UI.renderer && UI.renderer.domElement; }
    return new Promise(function (resolve) {
      if (!cv || !cv.toBlob) { UI.toast('Copy Image: no image to copy.'); resolve({ ok: false }); return; }
      cv.toBlob(function (blob) {
        var info = { ok: !!blob, bytes: blob ? blob.size : 0, width: cv.width, height: cv.height, how: null };
        if (!blob) { UI.toast('Copy Image failed.'); resolve(info); return; }
        var C = window.ClipboardItem, clip = navigator.clipboard;
        function saveFile() { info.how = 'file'; var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ((App.model && App.model.name) || 'Anvil') + '.png'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); UI.toast('The browser has no image clipboard here: the image was saved as a PNG file.'); resolve(info); }
        if (!C || !clip || !clip.write) { saveFile(); return; }
        clip.write([new C({ 'image/png': blob })]).then(function () { info.how = 'clipboard'; UI.setStatus('Copy Image: the graphics window (' + cv.width + ' × ' + cv.height + ') is on the clipboard.'); resolve(info); }, function () { saveFile(); });
      }, 'image/png');
    });
  }
  UI.copyImage = copyImage;

  // ------------------------------------------------------------------ boot
  function boot() {
    if (UI.wrapOkPlusCommands) UI.wrapOkPlusCommands();   // ✓+ on the commands that make something (ui-commands.js)
    installUndelete();   // lane mcpolish: after every file's own UI.deleteSelection wrapper
    // a model loaded by anything (New, Open, the Task Pane, a recovery) is no longer the file App.filePath names
    // (the Windows app; in a browser App.filePath is never set)
    var coreLoadModel = UI.loadModel;
    UI.loadModel = function () { App.importPath = null; App.drawingPath = null; if (App.filePath) deskSetPath(null); return coreLoadModel.apply(this, arguments); };
    // theme first, before anything is drawn (index.html already set data-theme from localStorage to avoid a flash)
    var savedTheme = 'light';
    try { savedTheme = localStorage.getItem('anvil.theme') || 'light'; } catch (e) { }
    setTheme(savedTheme);
    $('search-ico').innerHTML = Icons('search', 16);
    $('filter-ico').innerHTML = Icons('filter', 14);
    UI.renderFmTabs();
    renderTaskStrip();
    UI.refreshHud();
    // the start-up document is the first Design Library part; unsaved work from an earlier session is offered once it
    // is up (offerRecovery), never restored silently
    var model = K.newModel('Mounting Bracket');
    try { K.runScript(model, EXAMPLES[0].code); } catch (e) { console.error(e); }
    try { var lp = localStorage.getItem('anvil.lastPart'); if (lp) App.lastPart = JSON.parse(lp); } catch (e) { }
    App.model = model;
    App.model.nextId = App.model.nextId || (Math.max.apply(null, [0].concat(model.features.map(function (f) { return f.id; }))) + 1);
    initTitle();   // (rfIK) the window title, the File menu's Recent Documents
    UI.renderMenuBar();
    UI.refreshRibbon();
    UI.resize();
    UI.rebuild({ noSave: true, sync: true });   // boot builds on the main thread so the first frame already shows the body
    UI.holdRecovery(true);   // the start-up part is clean, and an earlier session's recovery copy waits for offerRecovery
    UI.markClean();
    // lane mcdirect2: the render loop (ui-core.js). It was started as UI.frame(), but ui-panels.js (lane mcframe)
    // reassigned UI.frame to the profile's window-frame getter, so the loop never started: every view change waited
    // for some other redraw (the labels by the triad, the right-click menu, overlays lagged a view behind)
    UI.renderLoop();
    // fit once the viewport has real dimensions (the pane may still be laying out)
    var fitTries = 0;
    (function fitWhenReady() {
      UI.resize();
      if (UI.size.w > 50 || fitTries++ > 20) UI.setView('Isometric');
      else requestAnimationFrame(fitWhenReady);
    })();
    if (window.ResizeObserver) new ResizeObserver(function () { UI.resize(); placeGfxCentre(); }).observe(UI.viewport);
    window.addEventListener('resize', placeGfxCentre);
    placeGfxCentre();
    holdStatusRight();
    UI.setStatus('Ready. Sketch tab → Sketch to start drawing, or open Automation / Script on the right to model in code.');
    initCommandSearch();
    initFileDrop();
    offerRecovery();
  }

  // ------------------------------------------------------------------ AutoRecover at start-up
  // A recovery copy (ui-core.js, localStorage 'anvil.recover') left by a session that closed with unsaved changes is
  // offered as SolidWorks' Document Recovery does: "Anvil found unsaved work from <time>: Part1" with Recover (opens
  // it, still unsaved, with its drawing if one was open) and Discard (deletes the copy). A copy that matches a document
  // saved in this browser, or the start-up part, is dropped without asking. The old always-on 'anvil.autosave' (before
  // AutoRecover) is read once as such a copy and removed.
  function offerRecovery() {
    var rec = UI.readRecovery(), legacy = null;
    try { legacy = localStorage.getItem('anvil.autosave'); if (legacy != null) localStorage.removeItem('anvil.autosave'); } catch (e) { }
    if (!rec && legacy) { try { rec = { v: 1, savedAt: null, model: JSON.parse(legacy) }; } catch (e) { rec = null; } }
    var m = rec && rec.model;
    var usable = m && typeof m === 'object' && Array.isArray(m.features) &&
      (m.type !== 'assembly' ? m.features.length || (m.drawings || []).length : hasAssembly() && Array.isArray(m.components));
    if (!usable) { UI.holdRecovery(false); UI.dropRecovery(); return false; }
    var mj = JSON.stringify(m), files = savedFiles();
    var same = mj === JSON.stringify(App.model) || Object.keys(files).some(function (n) { return files[n] && files[n].model && JSON.stringify(files[n].model) === mj; });
    if (same) { UI.holdRecovery(false); UI.dropRecovery(); return false; }
    UI.holdRecovery(true);
    var name = m.name || (m.type === 'assembly' ? 'Assem1' : 'Part1');
    var when = rec.savedAt ? new Date(rec.savedAt).toLocaleString() : 'an earlier session';
    UI.showModal({ title: 'Document Recovery', body: el('div', { class: 'recover-dialog' }, [
      el('p', { text: 'Anvil found unsaved work from ' + when + ': ' + name }),
      el('p', { class: 'dlg-note', text: 'Recover opens it as it was, still unsaved: save it to keep it. Discard deletes the recovered copy.' })
    ]), buttons: [
      { label: 'Recover', primary: true, action: function () { UI.closeModal(); recoverDocument(rec); } },
      { label: 'Discard', action: function () { UI.closeModal(); UI.holdRecovery(false); UI.dropRecovery(); UI.setStatus('Discarded the unsaved copy of ' + name + '.'); } }
    ] });
    return true;
  }
  function recoverDocument(rec) {
    var m = rec.model;
    rememberPart(); App.hiddenBodies = {};
    return UI.loadModel(m).then(function () {
      App.fileName = rec.fileName || null;
      UI.holdRecovery(false);
      UI.markUnsaved();   // "Part1 *" until saved; the recovery copy is kept meanwhile
      if (m.type === 'assembly' && UI.setRibbonTab) UI.setRibbonTab('Assembly');
      if (rec.drawing != null && UI.makeDrawing && (m.drawings || [])[rec.drawing]) UI.makeDrawing({ index: rec.drawing });
      UI.setStatus('Recovered ' + (m.name || 'the document') + '. Save it (Ctrl+S) to keep it.');
      return window.anvil.summary();
    }, function (e) { UI.holdRecovery(false); UI.toast('Could not recover: ' + ((e && e.message) || e)); });
  }
  // closing or reloading the page with unsaved changes asks first (the recovery copy is kept either way)
  window.addEventListener('beforeunload', function (e) {
    if (!UI.isDirty || !UI.isDirty()) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  // the Properties panel shows the material and density: redraw it after a material change made elsewhere
  UI.refreshTaskPane = function () { if (tpCurrent === 'props' && !$('tp-panel').hidden) openTaskPane('props'); };
  // lane mcframe: a Task Pane page drawn into another host (the Mastercam frame's File ▸ Options page), and the page open now
  UI.taskPaneContent = function (id, body) { var f = { home: tpHome, library: tpLibrary, files: tpFiles, views: tpViews, appearance: tpAppearance, props: tpProps, macro: tpMacro }[id]; if (f) f(body); return !!f; };
  UI.taskPaneCurrent = function () { return $('tp-panel').hidden ? null : tpCurrent; };
  UI.openTaskPane = openTaskPane; UI.closeTaskPane = closeTaskPane; UI.runScript = runScript; UI.exportDialog = exportDialog; UI.download = download;
  UI.exportSTL = exportSTL; UI.exportFaceDXF = exportFaceDXF; UI.exportSketchDXF = exportSketchDXF; UI.exportScript = exportScript; UI.exportJSON = exportJSON; UI.screenshot = screenshot;
  UI.fileNew = fileNew; UI.fileOpen = fileOpen; UI.fileSave = fileSave; UI.fileSaveAs = fileSaveAs;
  // (rfIK) Recent Documents and the window title
  UI.recentDocuments = { list: recentList, cached: function () { return recentCache; }, open: recentOpen, remove: recentRemove, clear: recentClear, browse: showRecentDialog, key: RECENT_KEY };
  UI.showRecentDialog = showRecentDialog; UI.syncTitle = syncTitle; UI.windowTitle = titleText;
  UI.cmdInsertImported = cmdInsertImported; UI.openFileData = openFileData; UI.openDroppedFiles = openDroppedFiles; UI.exportData = exportData;
  // File ▸ New ▸ Part / Assembly (menus): "Save changes to Part1?" first when the document has unsaved changes (the
  // promise waits for the answer and never settles on Cancel); anvil.newPart / newAssembly (scripts) never ask
  UI.newAssembly = function (name) { return new Promise(function (res) { confirmDiscard(null, function () { res(newAssembly(name)); }); }); };
  UI.newPart = function (name) { return new Promise(function (res) { confirmDiscard(null, function () { res(newPart(name)); }); }); };
  UI.confirmDiscard = confirmDiscard; UI.offerRecovery = offerRecovery; UI.recoverDocument = recoverDocument;
  UI.rememberPart = rememberPart; UI.modelScript = modelScript; UI.openExample = openExample;
  UI.massInFrame = massInFrame;   // lane DF
  UI.showMassProperties = showMassProperties; UI.showShortcuts = showShortcuts; UI.showAbout = showAbout; UI.EXAMPLES = EXAMPLES;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(UI);

// rfFC: window.anvil for Suppress, the Design Table and assembly configurations
//   suppress(feature | [features], scope?) / unsuppress(feature, scope?, dependents?): a feature id or name; scope 'this'
//     (default with configurations), 'all', or [configuration names]. -> summary() with `suppressed` (names)
//   suppressed(config?) -> [feature names] suppressed in that configuration (default: the active one)
//   designTable() -> the grid [[header…], [config, cell…]]; designTable(grid | tsvText) -> applies it: { ok, errors }
//   componentConfig(component, name | null, scope?) / suppressComponent(component, on, scope?) in an assembly;
//   asmConfigurations() -> { active, list }; asmConfigurations.add(name) / .activate(name) / .remove(name)
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, A = window.anvil;
  if (!A) return;
  function names(map) { return App.model.features.filter(function (f) { return map[f.id]; }).map(function (f) { return f.name; }); }
  function sum() { var s = A.summary(); if (K.suppressedIds && App.model.type !== 'assembly') s.suppressed = names(K.suppressedIds(App.model)); return s; }
  A.suppress = function (refs, scope) { return UI.suppressFeature(refs, scope).then(sum); };
  A.unsuppress = function (refs, scope, dependents) { return UI.unsuppressFeature(refs, scope, dependents).then(sum); };
  A.suppressed = function (cfg) { return K.suppressedIds ? names(K.suppressedIds(App.model, cfg)) : []; };
  A.designTable = function (grid) {
    if (!arguments.length) return K.designTable(App.model);
    if (typeof grid === 'string') grid = K.tsvToGrid(grid);
    var trial = JSON.parse(JSON.stringify(App.model, function (k, v) { return k === 'profile' ? undefined : v; }));
    var res = K.applyDesignTable(trial, grid);
    if (!res.ok) return Promise.resolve(res);
    UI.pushUndo();
    K.applyDesignTable(App.model, grid);
    return UI.afterRebuild(UI.rebuild(), function () { UI.refreshTree(); if (UI.refreshConfigPanel) UI.refreshConfigPanel(); return { ok: true, errors: [], created: res.created, summary: sum() }; });
  };
  A.componentConfig = function (comp, name, scope) { return UI.setComponentConfig(comp, name, scope).then(function () { return A.summary(); }); };
  A.suppressComponent = function (comp, on, scope) { return UI.setComponentSuppressed(comp, on !== false, scope).then(function () { return A.summary(); }); };
  A.asmConfigurations = function () { return { active: UI.asmConfigurations.active(), list: UI.asmConfigurations.list() }; };
  ['add', 'activate', 'remove'].forEach(function (op) { A.asmConfigurations[op] = function (n) { return UI.asmConfigurations[op](n).then(function () { return A.summary(); }); }; });
})(UI);
