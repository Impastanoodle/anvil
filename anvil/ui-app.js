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
'p.sketch("Right", 20).circle(-12, 12, 1.5).cut("through", { reverse: true });\n' },
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
      EXAMPLES.push({ name: ex.name, note: ex.description || '', code: ex.code });
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
      var b = el('button', { html: Icons(t[1] === 'appearances' ? 'appearance' : t[1], 20), title: t[2], onclick: function () { if (tpCurrent === t[0]) closeTaskPane(); else openTaskPane(t[0]); } });
      b.dataset.id = t[0];
      strip.appendChild(b);
    });
  }
  function openTaskPane(id) {
    tpCurrent = id;
    var def = TP.filter(function (t) { return t[0] === id; })[0];
    $('tp-panel').hidden = false;
    $('tp-title').innerHTML = '';
    $('tp-title').appendChild(el('span', { html: Icons(def[1] === 'appearances' ? 'appearance' : def[1], 18) + ' ' + def[2] }));
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
  function tpLibrary(body) {
    body.appendChild(el('h3', { text: 'Sample parts' }));
    body.appendChild(el('p', { text: 'Loading a sample replaces the current model (it is kept in Undo).' }));
    var list = el('div', { class: 'list' });
    EXAMPLES.forEach(function (ex) {
      list.appendChild(el('button', { html: '<b>' + ex.name + '</b><small>' + ex.note + '</small>', onclick: function () { runScript(ex.code, true); UI.toast('Loaded ' + ex.name); } }));
    });
    body.appendChild(list);
  }
  function savedFiles() { try { return JSON.parse(localStorage.getItem('anvil.files') || '{}'); } catch (e) { return {}; } }
  function tpFiles(body) {
    body.appendChild(el('h3', { text: 'Saved in this browser' }));
    var files = savedFiles(), names = Object.keys(files).sort();
    if (!names.length) body.appendChild(el('p', { text: 'No saved parts yet. Use File → Save (Ctrl+S).' }));
    var list = el('div', { class: 'list' });
    names.forEach(function (n) {
      var f = files[n];
      var b = el('button', { html: '<b>' + n + '</b><small>' + (f.features ? f.features.length : 0) + ' features · ' + new Date(f.savedAt || 0).toLocaleString() + '</small>' });
      b.addEventListener('click', function () { UI.loadModel(f.model); UI.toast('Opened ' + n); });
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
    [['shadedEdges', 'Shaded + edges'], ['shaded', 'Shaded'], ['hlr', 'Hidden lines removed'], ['wireframe', 'Wireframe']].forEach(function (s) { g2.appendChild(el('button', { text: s[1], onclick: function () { UI.setStyle(s[0]); } })); });
    body.appendChild(g2);
  }
  function tpAppearance(body) {
    body.appendChild(el('h3', { text: 'Part color' }));
    var sw = el('div', { class: 'swatches' });
    ['#a8adb6', '#8d9299', '#c9ccd1', '#5b6b7c', '#b8860b', '#c8442e', '#2f6db5', '#3f8f4e', '#d9b38c', '#e0e0e0', '#3a3f47', '#f0c419', '#7e57c2', '#00897b', '#ef6c00', '#795548'].forEach(function (c) {
      sw.appendChild(el('button', { style: 'background:' + c, title: c, onclick: function () { App.model.color = c; UI.applyDisplayStyle(); UI.autosave(); } }));
    });
    body.appendChild(sw);
    var inp = el('input', { type: 'color', value: App.model.color || '#a8adb6' });
    inp.addEventListener('input', function () { App.model.color = inp.value; UI.applyDisplayStyle(); });
    body.appendChild(el('div', { class: 'row' }, [el('span', { text: 'Custom: ' }), inp]));
    body.appendChild(el('h3', { text: 'Scene' }));
    var g = el('div', { class: 'views' });
    [['gradient', 'Studio gradient'], ['white', 'Plain white'], ['dark', 'Dark room']].forEach(function (s) { g.appendChild(el('button', { text: s[1], onclick: function () { UI.setBg(s[0]); } })); });
    body.appendChild(g);
  }
  function tpProps(body) {
    var m = App.model;
    body.appendChild(el('h3', { text: 'Document properties' }));
    var kv = el('div', { class: 'kv' });
    function field(label, input) { kv.appendChild(el('span', { text: label })); kv.appendChild(input); }
    var name = el('input', { type: 'text', value: m.name }); name.addEventListener('change', function () { m.name = name.value || 'Part1'; UI.rebuild(); });
    field('Part name', name);
    var units = el('select'); [['mm', 'Millimeters (MMGS)'], ['in', 'Inches (IPS)']].forEach(function (u) { var o = el('option', { value: u[0], text: u[1] }); if (m.units === u[0]) o.selected = true; units.appendChild(o); });
    units.addEventListener('change', function () { m.units = units.value; UI.rebuild(); });
    field('Units', units);
    var mat = el('select');
    [['Steel, plain carbon', 7850], ['Stainless 304', 8000], ['Aluminum 6061', 2700], ['Brass', 8500], ['Copper', 8960], ['ABS', 1020], ['Nylon 6/6', 1140], ['Titanium Ti-6Al-4V', 4430], ['Custom', 0]].forEach(function (x) {
      var o = el('option', { value: String(x[1]), text: x[0] + (x[1] ? ' · ' + x[1] + ' kg/m³' : '') });
      if ((m.materialName || 'Steel, plain carbon') === x[0]) o.selected = true;
      mat.appendChild(o);
    });
    mat.addEventListener('change', function () { var t = mat.options[mat.selectedIndex].text.split(' · ')[0]; m.materialName = t; if (+mat.value) m.density = +mat.value; UI.rebuild(); tpProps(body); });
    field('Material', mat);
    var dens = el('input', { type: 'number', value: m.density, step: 'any' }); dens.addEventListener('change', function () { m.density = +dens.value || 0; UI.rebuild(); });
    field('Density kg/m³', dens);
    body.innerHTML = '';
    body.appendChild(el('h3', { text: 'Document properties' }));
    body.appendChild(kv);
    var sm = m.sheet || { thickness: 2, bendRadius: 2, kFactor: 0.71 };
    body.appendChild(el('h3', { text: 'Sheet metal defaults' }));
    var kv2 = el('div', { class: 'kv' });
    [['Thickness', 'thickness'], ['Bend radius', 'bendRadius'], ['K-factor', 'kFactor']].forEach(function (f) {
      var i = el('input', { type: 'number', value: sm[f[1]], step: 'any' });
      i.addEventListener('change', function () { m.sheet = m.sheet || sm; m.sheet[f[1]] = +i.value; UI.autosave(); });
      kv2.appendChild(el('span', { text: f[0] })); kv2.appendChild(i);
    });
    body.appendChild(kv2);
    body.appendChild(el('p', { html: '<small>K-factor 0.71 is the shop default for steel; use 0.64 for aluminum.</small>' }));
  }

  var lastScript = null;
  function tpMacro(body) {
    var ta = el('textarea', { spellcheck: 'false' });
    ta.value = lastScript != null ? lastScript : K.generateScript(App.model);
    ta.addEventListener('input', function () { lastScript = ta.value; });
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(true); } e.stopPropagation(); });
    var out = el('div', { class: 'err-text' });
    function run(replace) {
      out.textContent = '';
      runScript(ta.value, replace).then(function (res) {
        if (res.error) { out.textContent = res.error; UI.toast('Script error'); }
        else UI.toast((replace ? 'Model rebuilt from script' : 'Script appended') + ' · ' + App.model.features.length + ' features');
      });
    }
    var row = el('div', { class: 'row' });
    row.appendChild(el('button', { class: 'btn primary', text: 'Run (replace model)', title: 'Ctrl+Enter', onclick: function () { run(true); } }));
    row.appendChild(el('button', { class: 'btn', text: 'Append to model', onclick: function () { run(false); } }));
    row.appendChild(el('button', { class: 'btn', text: 'Script from model', onclick: function () { ta.value = K.generateScript(App.model); lastScript = ta.value; } }));
    row.appendChild(el('button', { class: 'btn', text: 'Copy', onclick: function () { copyText(ta.value); } }));
    var ex = el('select');
    ex.appendChild(el('option', { value: '', text: 'Insert example…' }));
    EXAMPLES.forEach(function (e, i) { ex.appendChild(el('option', { value: String(i), text: e.name })); });
    ex.addEventListener('change', function () { if (ex.value !== '') { ta.value = EXAMPLES[+ex.value].code; lastScript = ta.value; ex.value = ''; } });
    row.appendChild(ex);
    body.appendChild(el('p', { html: 'Scripts run against <code>p</code>, a part builder. The model and this script are interchangeable: <b>Script from model</b> regenerates code from the feature tree.' }));
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
'Sketch frames: Front (x=X, y=Y, n=Z)  Top (x=X, y=-Z, n=Y)  Right (x=-Z, y=Y, n=X)\n' +
'Extrudes go along the plane normal; reverse:true goes the other way.\n\n' +
'Browser console: anvil.run(code) anvil.append(code) anvil.script() anvil.model()\n' +
'anvil.load(json) anvil.stl() anvil.dxfFace(i) anvil.mass() anvil.faces() anvil.bodies() anvil.selectBody(i) anvil.png()' }));
    body.appendChild(ref);
  }

  // Resolves to { ok: true } or { error: text } once the model is rebuilt (never rejects).
  function runScript(code, replace) {
    var model, p;
    try {
      model = replace ? K.newModel('Part1') : App.model;
      if (!replace) UI.pushUndo();
      if (replace) { model.color = App.model.color; model.density = App.model.density; }
      K.runScript(model, code);
      if (replace) { UI.pushUndo(); var undo = App.undo; p = UI.loadModel(model); App.undo = undo; }
      else p = UI.rebuild();
    } catch (e) {
      return Promise.resolve({ error: (e && e.message) || String(e) });
    }
    return p.then(function () {
      UI.refreshStatus();
      UI.setStatus('Script ran: ' + App.model.features.length + ' features, rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms.');
      var errs = Object.keys(App.build.errors);
      if (errs.length) return { error: errs.map(function (id) { var f = K.findFeature(App.model, +id); return (f ? f.name : id) + ': ' + App.build.errors[id]; }).join('\n') };
      return { ok: true };
    }, function (e) {
      return { error: (e && e.message) || String(e) };
    });
  }

  // ------------------------------------------------------------------ files & exports
  function download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'text/plain' });
      var a = el('a', { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    } catch (e) { }
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
  function safeName() { return (App.model.name || 'part').replace(/[^\w\-]+/g, '_'); }
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
    exportDialog('Export sketch as DXF', safeName() + '_' + sketch.name + '.dxf', K.exportDXFSketch(sketch, App.model.units), 'application/dxf');
  }
  function exportScript() { exportDialog('Model as script', safeName() + '.anvil.js', K.generateScript(App.model), 'text/javascript'); }
  function screenshot() {
    UI.render();
    var url = UI.renderer.domElement.toDataURL('image/png');
    var img = el('img', { src: url, style: 'max-width:100%;border:1px solid #ccc' });
    UI.showModal({ title: 'Screenshot', body: el('div', {}, [img]), buttons: [{ label: 'Download PNG', primary: true, action: function () { var a = el('a', { href: url, download: safeName() + '.png' }); document.body.appendChild(a); a.click(); a.remove(); } }, { label: 'Close', action: UI.closeModal }] });
  }
  function fileNew() {
    UI.confirmDialog('New part', 'Start a new part? The current one stays in File Explorer only if you saved it.', function () {
      UI.loadModel(K.newModel('Part1'));
    }, 'New part');
  }
  function fileOpen() {
    var ta = el('textarea', { placeholder: 'Paste a model JSON (File → Save As) or an Anvil script here…' });
    UI.showModal({ title: 'Open', body: el('div', {}, [el('p', { text: 'Paste model JSON or a script. Scripts are detected by the leading "p." calls.' }), ta]), buttons: [
      { label: 'Open', primary: true, action: function () {
        var txt = ta.value.trim();
        if (!txt) return;
        if (txt.charAt(0) === '{') { try { UI.loadModel(JSON.parse(txt)); UI.closeModal(); } catch (e) { UI.toast('Invalid JSON: ' + e.message); } }
        else runScript(txt, true).then(function (r) { if (r.error) UI.toast(r.error); else UI.closeModal(); });
      } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  function fileSave() {
    UI.promptDialog('Save', 'Save as (kept in this browser):', App.model.name, function (name) {
      name = (name || '').trim();
      if (!name) return;
      var files = savedFiles();
      files[name] = { model: App.model, features: App.model.features.length, savedAt: Date.now() };
      try { localStorage.setItem('anvil.files', JSON.stringify(files)); UI.toast('Saved "' + name + '"'); } catch (e) { UI.toast('Could not save: ' + e.message); }
      if (tpCurrent === 'files') openTaskPane('files');
    });
  }
  function fileSaveAs() { exportDialog('Model JSON', safeName() + '.anvil.json', JSON.stringify(App.model, null, 1), 'application/json'); }

  // ------------------------------------------------------------------ mass properties
  function showMassProperties() {
    if (!App.mesh || !App.mesh.triCount) { UI.toast('No solid body yet.'); return; }
    var u = UI.unitLabel(), mp = K.massProps(App.mesh, App.model.density);
    var volM3 = u === 'in' ? mp.volume * Math.pow(0.0254, 3) : mp.volume * 1e-9;
    var mass = volM3 * App.model.density;
    var rows = [
      ['Density', App.model.density + ' kg/m³' + (App.model.materialName ? ' (' + App.model.materialName + ')' : '')],
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
        var info = infos[i] || { name: 'Body' + (i + 1) }, bm = null;
        try { bm = K.massProps(K.meshFromBody(b), App.model.density); } catch (e) { bm = null; }
        var bVolM3 = bm ? (u === 'in' ? bm.volume * Math.pow(0.0254, 3) : bm.volume * 1e-9) : 0;
        rows.push([info.name, bm ? 'volume ' + UI.fmtNum(bm.volume, 2) + ' ' + u + '³, mass ' + UI.fmtNum(bVolM3 * App.model.density * 1000, 2) + ' g' : '(not computed)']);
      });
    }
    var body = el('table', {}, rows.map(function (r) { return el('tr', {}, [el('th', { text: r[0] }), el('td', { text: r[1] })]); }));
    UI.showModal({ title: 'Mass Properties — ' + App.model.name, body: body, buttons: [{ label: 'Copy', action: function () { copyText(rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n')); } }, { label: 'Close', primary: true, action: UI.closeModal }] });
  }

  function showShortcuts() {
    UI.showModal({ title: 'Keyboard shortcuts', body:
      '<table><tr><th>Ctrl+1 … Ctrl+7</th><td>Front, Back, Left, Right, Top, Bottom, Isometric</td></tr>' +
      '<tr><th>Ctrl+8</th><td>Normal To selected face / plane / sketch</td></tr>' +
      '<tr><th>F</th><td>Zoom to fit</td></tr><tr><th>Z / Shift+Z</th><td>Zoom out / in</td></tr>' +
      '<tr><th>Space</th><td>View orientation menu</td></tr>' +
      '<tr><th>S</th><td>Start a sketch (or exit the current one)</td></tr>' +
      '<tr><th>L, R, C, A, P, T</th><td>In a sketch: Line, Rectangle, Circle, Arc, Polygon, Slot</td></tr>' +
      '<tr><th>Esc</th><td>Cancel tool / command / selection</td></tr><tr><th>Enter</th><td>Accept the PropertyManager</td></tr>' +
      '<tr><th>Delete</th><td>Delete selected entity or feature</td></tr><tr><th>F2</th><td>Rename selected feature</td></tr>' +
      '<tr><th>Ctrl+Z / Ctrl+Y</th><td>Undo / Redo</td></tr><tr><th>Ctrl+B</th><td>Rebuild</td></tr><tr><th>Ctrl+S</th><td>Save</td></tr>' +
      '<tr><th>Ctrl+Enter</th><td>Run the script (in the script console)</td></tr></table>' });
  }
  function showAbout() {
    UI.showModal({ title: 'About Anvil', body: '<p><b>Anvil</b> — a scriptable parametric solid modeler with a SolidWorks-style workspace. Sketch on planes and faces, extrude, revolve, cut, pattern, mirror; export STL and DXF. Booleans run on a BSP CSG kernel in the browser; nothing leaves your machine.</p><p>Every model is a script (Tools → Macro), so it can be generated, diffed and rebuilt by a person or by Claude.</p>' });
  }

  // ------------------------------------------------------------------ keyboard
  // Keys bound by the keydown handler below, by ribbon command id (used for ribbon tooltips). Keep in sync with the handler.
  var SHORTCUTS = {
    sketch: 'S', exitSketch: 'S', extrude: 'E', line: 'L', rect: 'R', circle: 'C', arc: 'A', polygon: 'P', slot: 'T', dim: 'D',
    fit: 'F', undo: 'Ctrl+Z', redo: 'Ctrl+Y', rebuild: 'Ctrl+B', save: 'Ctrl+S', new: 'Ctrl+N', open: 'Ctrl+O', normalTo: 'Ctrl+8', prevView: 'Shift+Ctrl+Z', orient: 'Space', delete: 'Del', rename: 'F2'
  };
  UI.shortcutFor = function (id) { return SHORTCUTS[id] || null; };
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (!$('modal').hidden) { if (e.key === 'Escape') UI.closeModal(); return; }
    if (e.key === 'Escape') {
      if (typing) { e.target.blur(); return; }
      UI.closeMenus();
      if (App.zoomAreaMode) { App.zoomAreaMode = false; UI.refreshHud(); return; }
      if (App.mode === 'sketch' && App.tool !== 'select') { UI.cancelTool(); return; }
      if (UI.hasPM()) { UI.pmCancel(); return; }
      App.sel = null; App.sel2 = null; UI.updateHighlights(); UI.updateSketches(); UI.refreshTree();
      return;
    }
    if (typing) return;
    var k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.shiftKey && k >= '1' && k <= '7') { e.preventDefault(); UI.setView(['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom', 'Isometric'][+k - 1]); return; }
    if (ctrl && k === '8') { e.preventDefault(); UI.normalToSelection(); return; }
    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) UI.previousView(); else UI.undo(); return; }
    if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); UI.redo(); return; }
    if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); fileSave(); return; }
    if (ctrl && (k === 'b' || k === 'B')) { e.preventDefault(); UI.rebuild().then(function () { UI.toast('Rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms'); }); return; }
    if (ctrl && (k === 'n' || k === 'N')) { e.preventDefault(); fileNew(); return; }
    if (ctrl && (k === 'o' || k === 'O')) { e.preventDefault(); fileOpen(); return; }
    if (ctrl) return;
    if (k === 'Enter' && UI.hasPM()) { e.preventDefault(); UI.pmOK(); return; }
    if (k === 'Delete' || k === 'Backspace') { UI.deleteSelection(); return; }
    if (k === 'F2' && App.sel && App.sel.kind === 'feature') { e.preventDefault(); UI.startRename(K.findFeature(App.model, App.sel.id)); return; }
    if (k === 'f' || k === 'F') { UI.zoomToFit(); return; }
    if (k === 'z') { UI.zoomView(1.25); return; }
    if (k === 'Z') { UI.zoomView(0.8); return; }
    if (k === ' ') { e.preventDefault(); var hb = $('hud').children[5]; if (hb) hb.click(); return; }
    if (k === 's' || k === 'S') { UI.cmdSketch(); UI.refreshRibbon(); return; }
    if (App.mode === 'sketch') {
      var map = { l: 'line', r: 'rect', c: 'circle', a: 'arc', p: 'polygon', t: 'slot', d: 'dimension' };
      var t = map[k.toLowerCase()];
      if (t) { UI.setTool(App.tool === t ? 'select' : t); return; }
    }
    if (k === 'e' || k === 'E') { UI.cmdExtrude(false); return; }
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
    // run / append / load / rebuild resolve to the summary (or reject with the script error) once the build is applied
    run: function (code) { return runScript(code, true).then(function (r) { if (r.error) throw new Error(r.error); return window.anvil.summary(); }); },
    append: function (code) { return runScript(code, false).then(function (r) { if (r.error) throw new Error(r.error); return window.anvil.summary(); }); },
    model: function () { return JSON.parse(JSON.stringify(App.model)); },
    load: function (json) { return UI.loadModel(typeof json === 'string' ? JSON.parse(json) : json).then(function () { return window.anvil.summary(); }); },
    busy: function () { return !!App.rebuilding; },
    idle: function () { return UI.whenIdle(); },
    workerOn: function (on) { if (arguments.length) UI.setWorkerOn(on); return App.workerOn; },
    script: function () { return K.generateScript(App.model); },
    stl: function () { return K.exportSTL(App.mesh, App.model.name); },
    dxfFace: function (i) { return K.exportDXFFace(App.mesh, i, App.model.units); },
    dxfSketch: function (id) { return K.exportDXFSketch(K.findFeature(App.model, id), App.model.units); },
    flat: function () { return K.flatPattern(App.model, App.build, App.mesh); },
    dxfFlat: function () { return K.exportDXFFlat(K.flatPattern(App.model, App.build, App.mesh), App.model.units); },
    edges: function () { return (App.edges || []).filter(function (e) { return !e.smooth && e.faces.length === 2; }).map(function (e, i) { return { mid: e.mid.map(function (x) { return +x.toFixed(3); }), len: +e.len.toFixed(3), convex: e.convex }; }); },
    mass: function () { return K.massProps(App.mesh, App.model.density); },
    faces: function () { return App.mesh.faces.map(function (f, i) { return { index: i, normal: f.normal, area: +f.area.toFixed(3), centroid: f.centroid.map(function (x) { return +x.toFixed(3); }) }; }); },
    // separate solid bodies of a multi-body part: [{ index, featureId, name, volume }]
    bodies: function () { return (UI.bodyInfos ? UI.bodyInfos() : []).map(function (b) { return { index: b.index, featureId: b.featureId, name: b.name, volume: +b.volume.toFixed(3) }; }); },
    selectBody: function (i) { if (UI.selectBody) UI.selectBody(i); else if (UI.selectBodyRow) UI.selectBodyRow(i); else { App.sel = { kind: 'body', index: i }; UI.updateHighlights(); UI.refreshTree(); } return window.anvil.bodies()[i] || null; },
    features: function () { return App.model.features.map(function (f) { return { id: f.id, type: f.type, name: f.name, error: App.build.errors[f.id] || null }; }); },
    select: function (i) { App.sel = { kind: 'face', index: i }; UI.updateHighlights(); return App.mesh.faces[i]; },
    view: function (name) { UI.setView(name); },
    fit: function () { UI.zoomToFit(); },
    png: function () { UI.render(); return UI.renderer.domElement.toDataURL('image/png'); },
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
    summary: function () { var mp = App.mesh.triCount ? K.massProps(App.mesh, App.model.density) : null; return { name: App.model.name, features: App.model.features.length, errors: App.build.errors, volume: mp ? +mp.volume.toFixed(3) : 0, bbox: mp ? mp.bbox : null, faces: App.mesh.faces.length, bodies: UI.bodyList ? UI.bodyList().length : (App.mesh.triCount ? 1 : 0), rebuildMs: +App.lastRebuildMs.toFixed(1), equations: JSON.parse(JSON.stringify((App.build && App.build.equations) || {})), equationErrors: JSON.parse(JSON.stringify((App.build && App.build.equationErrors) || {})), configuration: UI.configurations.active(), configurations: UI.configurations.list().map(function (c) { return c.name; }) }; },
    examples: EXAMPLES
  };
  window.anvil.configurations.activate = window.anvil.activateConfiguration;
  ['add', 'rename', 'remove'].forEach(function (op) {
    window.anvil.configurations[op] = function () { return UI.configurations[op].apply(null, arguments).then(function () { return window.anvil.summary(); }); };
  });

  // ------------------------------------------------------------------ boot
  function boot() {
    // theme first, before anything is drawn (index.html already set data-theme from localStorage to avoid a flash)
    var savedTheme = 'light';
    try { savedTheme = localStorage.getItem('anvil.theme') || 'light'; } catch (e) { }
    setTheme(savedTheme);
    $('search-ico').innerHTML = Icons('search', 16);
    $('filter-ico').innerHTML = Icons('filter', 14);
    UI.renderFmTabs();
    renderTaskStrip();
    UI.refreshHud();
    var model = null;
    try { var raw = localStorage.getItem('anvil.autosave'); if (raw) model = JSON.parse(raw); } catch (e) { }
    if (!model || !model.features || !model.features.length) {
      model = K.newModel('Mounting Bracket');
      try { K.runScript(model, EXAMPLES[0].code); } catch (e) { console.error(e); }
    }
    App.model = model;
    App.model.nextId = App.model.nextId || (Math.max.apply(null, [0].concat(model.features.map(function (f) { return f.id; }))) + 1);
    UI.renderMenuBar();
    UI.refreshRibbon();
    UI.resize();
    UI.rebuild({ noSave: true, sync: true });   // boot builds on the main thread so the first frame already shows the body
    UI.frame();
    // fit once the viewport has real dimensions (the pane may still be laying out)
    var fitTries = 0;
    (function fitWhenReady() {
      UI.resize();
      if (UI.size.w > 50 || fitTries++ > 20) UI.setView('Isometric');
      else requestAnimationFrame(fitWhenReady);
    })();
    if (window.ResizeObserver) new ResizeObserver(function () { UI.resize(); }).observe(UI.viewport);
    UI.setStatus('Ready. Sketch tab → Sketch to start drawing, or open Automation / Script on the right to model in code.');
    $('cmd-search').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var q = $('cmd-search').value.toLowerCase();
      var cmds = { extrude: function () { UI.cmdExtrude(false); }, cut: function () { UI.cmdExtrude(true); }, revolve: function () { UI.cmdRevolve(false); }, sketch: UI.cmdSketch, hole: UI.cmdHole, pattern: function () { UI.cmdLinearPattern(); }, circular: function () { UI.cmdCircularPattern(); }, mirror: function () { UI.cmdMirror(); }, plane: function () { UI.cmdPlane(); }, measure: UI.cmdMeasure, mass: showMassProperties, section: UI.cmdSection, dxf: exportFaceDXF, stl: exportSTL, script: function () { openTaskPane('macro'); }, macro: function () { openTaskPane('macro'); } };
      var hit = Object.keys(cmds).filter(function (c) { return q.indexOf(c) >= 0; })[0];
      if (hit) { cmds[hit](); $('cmd-search').value = ''; $('cmd-search').blur(); } else UI.toast('No command matches "' + q + '"');
    });
  }

  UI.openTaskPane = openTaskPane; UI.closeTaskPane = closeTaskPane; UI.runScript = runScript; UI.exportDialog = exportDialog;
  UI.exportSTL = exportSTL; UI.exportFaceDXF = exportFaceDXF; UI.exportSketchDXF = exportSketchDXF; UI.exportScript = exportScript; UI.screenshot = screenshot;
  UI.fileNew = fileNew; UI.fileOpen = fileOpen; UI.fileSave = fileSave; UI.fileSaveAs = fileSaveAs;
  UI.showMassProperties = showMassProperties; UI.showShortcuts = showShortcuts; UI.showAbout = showAbout; UI.EXAMPLES = EXAMPLES;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(UI);
