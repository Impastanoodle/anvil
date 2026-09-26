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
    function addList(items) {
      var list = el('div', { class: 'list' });
      items.forEach(function (ex) {
        list.appendChild(el('button', { html: '<b>' + ex.name + '</b><small>' + ex.note + '</small>', onclick: function () { openExample(ex); } }));
      });
      body.appendChild(list);
    }
    addList(EXAMPLES.filter(function (ex) { return ex.kind !== 'assembly'; }));
    var asms = EXAMPLES.filter(function (ex) { return ex.kind === 'assembly'; });
    if (asms.length) {
      body.appendChild(el('h3', { text: 'Sample assemblies' }));
      body.appendChild(el('p', { text: 'Opens as an assembly document: components from the parts above, positioned by mates.' }));
      addList(asms);
    }
  }
  // Design Library entry -> a new part or assembly document (an assembly entry's code is an assembly script)
  function openExample(ex) {
    return runScript(ex.code, true, ex.kind === 'assembly' ? 'assembly' : 'part').then(function (r) {
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
      var isA = f.model && f.model.type === 'assembly';
      var b = el('button', { html: '<b>' + n + '</b><small>' + (isA ? 'assembly, ' + ((f.model.components || []).length) + ' components' : (typeof f.features === 'number' ? f.features : (f.features ? f.features.length : 0)) + ' features') + ' · ' + new Date(f.savedAt || 0).toLocaleString() + '</small>' });
      b.addEventListener('click', function () { rememberPart(); UI.loadModel(JSON.parse(JSON.stringify(f.model))); UI.toast('Opened ' + n); });
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
    var asm = isAsm();
    var name = el('input', { type: 'text', value: m.name }); name.addEventListener('change', function () { m.name = name.value || (asm ? 'Assem1' : 'Part1'); UI.rebuild(); });
    field(asm ? 'Assembly name' : 'Part name', name);
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
    return UI.loadModel(Assembly.newAssembly(name || 'Assem1')).then(function () {
      UI.setRibbonTab('Assembly');
      UI.setStatus('New assembly. Assembly tab → Insert Components to add parts, then Mate to position them.');
      return window.anvil.summary();
    });
  }
  function newPart(name) {
    rememberPart();
    App.hiddenBodies = {};
    return UI.loadModel(K.newModel(name || 'Part1')).then(function () { return window.anvil.summary(); });
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
      if (!replace) UI.pushUndo();
      if (replace && !isAsm()) { model.color = App.model.color; model.density = App.model.density; }
      K.runScript(model, code);
      if (replace) { UI.pushUndo(); var undo = App.undo; App.hiddenBodies = {}; p = UI.loadModel(model); App.undo = undo; }
      else p = UI.rebuild();
    } catch (e) {
      return Promise.resolve({ error: (e && e.message) || String(e) });
    }
    return finishScript(p);
  }
  // Assembly scripts (a.insert / a.mate): replace = a new assembly document, else appended to the open assembly.
  function runAssemblyScript(code, replace) {
    var model, p;
    try {
      if (!hasAssembly()) throw new Error('Assemblies need assembly.js, which did not load.');
      if (!replace && !isAsm()) throw new Error('This is an assembly script: open an assembly (File ▸ New ▸ Assembly) to append to it.');
      if (replace) rememberPart();
      model = replace ? Assembly.newAssembly('Assem1') : App.model;
      if (!replace) UI.pushUndo();
      Assembly.runScript(model, code);
      if (replace) { UI.pushUndo(); var undo = App.undo; App.hiddenBodies = {}; p = UI.loadModel(model); App.undo = undo; }
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
    exportDialog('Export sketch as DXF', safeName() + '_' + sketch.name + '.dxf', K.exportDXFSketch(sketch, App.model.units), 'application/dxf');
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
      { label: 'New part', primary: true, action: function () { UI.closeModal(); newPart('Part1'); } },
      { label: 'New assembly', action: function () { UI.closeModal(); newAssembly('Assem1'); } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  // File ▸ Open: an Anvil document (.anvil.json / .json), a script (.anvil.js / .js) or a neutral CAD file (STEP, STL,
  // OBJ, 3MF — exchange.js), picked from disk or pasted. A neutral file opens as a new part whose one feature is
  // Imported1; Insert ▸ Features ▸ Imported… adds one to the open part instead.
  var OPEN_TYPES = [
    ['all', 'All Anvil and CAD files (*.json;*.js;*.step;*.stp;*.stl;*.obj;*.3mf)', '.json,.js,.step,.stp,.stl,.obj,.3mf'],
    ['anvil', 'Anvil documents and scripts (*.anvil.json;*.anvil.js)', '.json,.js'],
    ['step', 'STEP AP203/AP214 (*.step;*.stp)', '.step,.stp'],
    ['stl', 'STL (*.stl)', '.stl'],
    ['obj', 'OBJ (*.obj)', '.obj'],
    ['3mf', '3D Manufacturing Format (*.3mf)', '.3mf']
  ];
  function hasExchange() { return typeof Exchange !== 'undefined'; }
  function neutralFile(name) { return /\.(step|stp|p21|stl|obj|3mf)$/i.test(String(name || '')); }
  function readFile(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(file); });
  }
  function bytesText(data) { return typeof data === 'string' ? data : Exchange.fromUtf8(new Uint8Array(data)); }
  // openFileData(name, data, opts?) -> Promise of the summary. data: text, ArrayBuffer or Uint8Array.
  function openFileData(name, data, opts) {
    opts = opts || {};
    if (neutralFile(name) || opts.format) return opts.into === 'current' ? importIntoCurrent(name, data, opts) : importIntoNew(name, data, opts);
    var txt = typeof data === 'string' ? data : new TextDecoder('utf-8').decode(new Uint8Array(data));
    txt = txt.trim();
    if (txt.charAt(0) === '{') {
      var jm = JSON.parse(txt);
      rememberPart(); App.hiddenBodies = {};
      return UI.loadModel(jm).then(function () { return window.anvil.summary(); });
    }
    return runScript(txt, true).then(function (r) { if (r.error) throw new Error(r.error); return window.anvil.summary(); });
  }
  function importStatus(res, what) {
    var st = res.stats || {};
    UI.setStatus(what + ' ' + (res.file || res.name) + ': ' + st.solids + ' solid' + (st.solids === 1 ? '' : 's') + ', ' + st.triangles + ' triangles' + (res.warnings && res.warnings.length ? '. ' + res.warnings.join(' ') : '.'));
    if (res.warnings && res.warnings.length) UI.toast(res.warnings[0]);
  }
  function importIntoNew(name, data, opts) {
    if (!hasExchange()) return Promise.reject(new Error('exchange.js is not loaded'));
    var res;
    try { res = Exchange.importFile(name, data, { units: (opts && opts.units) || 'auto', sourceUnits: opts && opts.sourceUnits, format: opts && opts.format }); } catch (e) { return Promise.reject(e); }
    rememberPart(); App.hiddenBodies = {};
    return UI.loadModel(Exchange.newPartFromImport(res, { merge: opts && opts.merge })).then(function () { importStatus(res, 'Opened'); return window.anvil.summary(); });
  }
  function importIntoCurrent(name, data, opts) {
    if (!hasExchange()) return Promise.reject(new Error('exchange.js is not loaded'));
    if (isAsm()) return Promise.reject(new Error('Open a part first: imported bodies go into a part (File ▸ Open makes a new one).'));
    if (App.mode === 'sketch' && UI.exitSketch) UI.exitSketch(true);
    var res;
    try { res = Exchange.importFile(name, data, { units: App.model.units === 'in' ? 'in' : 'mm', sourceUnits: opts && opts.sourceUnits, format: opts && opts.format }); } catch (e) { return Promise.reject(e); }
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
  function fileOpen() {
    var chosen = null;
    var type = el('select', { 'aria-label': 'Files of type' });
    OPEN_TYPES.forEach(function (t) { type.appendChild(el('option', { value: t[0], text: t[1] })); });
    var fileInp = el('input', { type: 'file', accept: OPEN_TYPES[0][2], 'aria-label': 'File to open' });
    type.addEventListener('change', function () { OPEN_TYPES.forEach(function (t) { if (t[0] === type.value) fileInp.accept = t[2]; }); });
    fileInp.addEventListener('change', function () {
      var file = fileInp.files && fileInp.files[0];
      if (!file) { chosen = null; return; }
      readFile(file).then(function (buf) { chosen = { name: file.name, data: buf }; }, function (e) { UI.toast('Could not read ' + file.name + ': ' + (e && e.message || e)); });
    });
    var ta = el('textarea', { placeholder: '…or paste a model JSON (File → Save As), an Anvil script, or the text of a STEP / ASCII STL / OBJ file here…' });
    var body = el('div', { class: 'open-dialog' }, [
      el('p', { text: 'Anvil documents and scripts open as they were saved. STEP (planar and faceted B-reps), STL, OBJ and 3MF files open as a new part with an Imported1 feature you can sketch on, cut and boss against.' }),
      el('label', { class: 'dlg-row' }, [el('span', { text: 'Files of type' }), type]),
      el('label', { class: 'dlg-row' }, [el('span', { text: 'File' }), fileInp]),
      ta
    ]);
    UI.showModal({ title: 'Open', body: body, buttons: [
      { label: 'Open', primary: true, action: function () {
        var p;
        if (chosen) p = openFileData(chosen.name, chosen.data);
        else {
          var txt = ta.value.trim();
          if (!txt) { UI.toast('Choose a file or paste its text first.'); return; }
          // pasted text: JSON, a STEP / ASCII STL / OBJ file, or else an Anvil script
          var fmt = txt.charAt(0) === '{' || !hasExchange() ? null : Exchange.formatOf('', txt);
          if (fmt === 'obj' && /(^|[^\w.$])(p|a)\s*\.\s*\w+\s*\(/.test(txt)) fmt = null;
          p = fmt ? openFileData('Pasted.' + fmt, txt, { format: fmt }) : openFileData('Pasted.anvil.js', txt);
        }
        p.then(function () { UI.closeModal(); }, function (e) { UI.toast((e && e.message) || String(e)); });
      } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  // Insert ▸ Features ▸ Imported…: a STEP / STL / OBJ / 3MF file becomes an Imported feature at the end of the part
  function cmdInsertImported() {
    if (isAsm()) { UI.toast('Imported bodies go into a part. Open a part, or use File ▸ Open for a new one.'); return; }
    pickFile('.step,.stp,.stl,.obj,.3mf', function (name, data) {
      importIntoCurrent(name, data).catch(function (e) { UI.toast((e && e.message) || String(e)); });
    });
  }
  function fileSave() {
    UI.promptDialog('Save', 'Save as (kept in this browser):', App.model.name, function (name) {
      name = (name || '').trim();
      if (!name) return;
      var files = savedFiles();
      files[name] = { model: App.model, features: App.model.features.length, components: isAsm() ? (App.model.components || []).length : undefined, savedAt: Date.now() };
      try { localStorage.setItem('anvil.files', JSON.stringify(files)); UI.toast('Saved "' + name + '"'); } catch (e) { UI.toast('Could not save: ' + e.message); }
      if (tpCurrent === 'files') openTaskPane('files');
    });
  }
  // File ▸ Save As: the document (JSON), its script, or a neutral format through exchange.js (STEP AP214, 3MF, OBJ with
  // its .mtl, STL). exportData(type, base) -> { name, data, mime, extra? } is also what anvil.saveAs downloads.
  function saveTypes() {
    var doc = isAsm() ? 'Assembly' : 'Part';
    var t = [['json', doc + ' (*.anvil.json)'], ['script', 'Anvil script (*.anvil.js)']];
    if (hasExchange()) t.push(['step', 'STEP AP214 (*.step)'], ['3mf', '3D Manufacturing Format (*.3mf)'], ['obj', 'OBJ (*.obj) + materials (*.mtl)']);
    t.push(['stl', 'STL (*.stl)']);
    return t;
  }
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
    }
    throw new Error('Unknown file type "' + type + '"');
  }
  function fileSaveAs(preset) {
    var name = el('input', { type: 'text', value: safeName(), 'aria-label': 'File name', spellcheck: 'false' });
    var type = el('select', { 'aria-label': 'Save as type' });
    saveTypes().forEach(function (t) { var o = el('option', { value: t[0], text: t[1] }); if (t[0] === preset) o.selected = true; type.appendChild(o); });
    var note = el('p', { class: 'dlg-note' });
    function describe() {
      var v = type.value;
      note.textContent = v === 'step' ? 'Planar-faced B-rep (ADVANCED_FACE on planes): one solid per body' + (isAsm() ? ', components as assembly occurrences with their placements.' : '.') :
        v === '3mf' ? 'Mesh package in ' + (App.model.units === 'in' ? 'inches' : 'millimetres') + ': one object per body' + (isAsm() ? ', one build item per component.' : '.') :
        v === 'obj' ? 'Mesh with normals, one group per body' + (isAsm() ? ' per component' : '') + '; colours go into the .mtl downloaded with it.' :
        v === 'stl' ? 'Triangle mesh, ASCII.' : v === 'script' ? 'The model as an Anvil script.' : 'The Anvil document, re-opened with File ▸ Open.';
    }
    type.addEventListener('change', describe); describe();
    var body = el('div', { class: 'saveas-dialog' }, [
      el('label', { class: 'dlg-row' }, [el('span', { text: 'File name' }), name]),
      el('label', { class: 'dlg-row' }, [el('span', { text: 'Save as type' }), type]), note]);
    UI.showModal({ title: 'Save As', body: body, buttons: [
      { label: 'Save', primary: true, action: function () {
        if (!App.mesh || (!App.mesh.triCount && type.value !== 'json' && type.value !== 'script')) { UI.toast('Nothing to export yet.'); return; }
        var out;
        try { out = exportData(type.value, (name.value || '').trim().replace(/\.(anvil\.json|anvil\.js|json|js|step|stp|3mf|obj|stl)$/i, '').replace(/[^\w\-]+/g, '_') || safeName()); } catch (e) { UI.toast('Export failed: ' + ((e && e.message) || e)); return; }
        download(out.name, out.data, out.mime);
        if (out.extra) download(out.extra.name, out.extra.data, out.extra.mime);
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
      rows.push([c.name, 'volume ' + UI.fmtNum(c.volume, 2) + ' ' + u + '³, mass ' + UI.fmtNum(c.mass * toKg * 1000, 2) + ' g (' + c.density + ' kg/m³)']);
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
    load: function (json) { rememberPart(); App.hiddenBodies = {}; return UI.loadModel(typeof json === 'string' ? JSON.parse(json) : json).then(function () { return window.anvil.summary(); }); },
    busy: function () { return !!App.rebuilding; },
    idle: function () { return UI.whenIdle(); },
    workerOn: function (on) { if (arguments.length) UI.setWorkerOn(on); return App.workerOn; },
    script: function () { return modelScript(); },
    stl: function () { return K.exportSTL(App.mesh, App.model.name); },
    // neutral formats (exchange.js): STEP AP214 text, 3MF bytes (Uint8Array), OBJ text (+ exportMtl), from the open
    // document (part or assembly) as last built
    exportStep: function (opts) { return Exchange.exportSTEP(App.model, App.build, opts); },
    export3mf: function (opts) { return Exchange.export3MF(App.model, App.build, opts); },
    exportObj: function (opts) { return Exchange.exportOBJ(App.model, App.build, opts); },
    exportMtl: function () { return Exchange.exportMTL(App.model, App.build); },
    // importFile(name, data, { into: 'new' | 'current', units, sourceUnits, merge }) -> Promise of the summary: a STEP /
    // STL / OBJ / 3MF file as a new part (Imported1), or as an Imported feature appended to the open part; .json / .js
    // open as documents
    importFile: function (name, data, opts) { return openFileData(name, data, opts); },
    // saveAs(type, baseName?) downloads the file File ▸ Save As would (type: json, script, step, 3mf, obj, stl) and
    // returns { name, data, mime, extra }
    saveAs: function (type, base) { var out = exportData(type, base); download(out.name, out.data, out.mime); if (out.extra) download(out.extra.name, out.extra.data, out.extra.mime); return out; },
    dxfFace: function (i) { return K.exportDXFFace(App.mesh, i, App.model.units); },
    dxfSketch: function (id) { return K.exportDXFSketch(K.findFeature(App.model, id), App.model.units); },
    flat: function () { return K.flatPattern(App.model, App.build, App.mesh); },
    dxfFlat: function () { return K.exportDXFFlat(K.flatPattern(App.model, App.build, App.mesh), App.model.units); },
    edges: function () { return (App.edges || []).filter(function (e) { return !e.smooth && e.faces.length === 2; }).map(function (e, i) { return { mid: e.mid.map(function (x) { return +x.toFixed(3); }), len: +e.len.toFixed(3), convex: e.convex }; }); },
    mass: function () { return isAsm() && hasAssembly() ? Assembly.massProps(App.model, App.build) : K.massProps(App.mesh, App.model.density); },
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
    summary: function () {
      if (isAsm()) return asmSummary();
      var mp = App.mesh.triCount ? K.massProps(App.mesh, App.model.density) : null; return { name: App.model.name, type: 'part', features: App.model.features.length, errors: App.build.errors, volume: mp ? +mp.volume.toFixed(3) : 0, bbox: mp ? mp.bbox : null, faces: App.mesh.faces.length, bodies: UI.bodyList ? UI.bodyList().length : (App.mesh.triCount ? 1 : 0), rebuildMs: +App.lastRebuildMs.toFixed(1), equations: JSON.parse(JSON.stringify((App.build && App.build.equations) || {})), equationErrors: JSON.parse(JSON.stringify((App.build && App.build.equationErrors) || {})), configuration: UI.configurations.active(), configurations: UI.configurations.list().map(function (c) { return c.name; }) }; },
    examples: EXAMPLES,
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
        return { id: c.id, name: c.name, index: i, fixed: !!c.fixed, dof: st.dof != null ? st.dof : null, underDefined: !!st.underDefined,
          position: c.transform.position.slice(), rotation: c.transform.rotation.slice(), volume: vols[c.id] != null ? +vols[c.id].toFixed(3) : 0, error: st.error || (App.build.errors || {})[c.id] || null };
      });
    },
    mates: function () {
      if (!isAsm()) return [];
      return (App.model.mates || []).map(function (m) {
        var st = UI.mateStatus(m), o = { id: m.id, name: m.name, type: m.type, ok: !m.suppressed && !st.error, error: m.suppressed ? null : st.error, suppressed: !!m.suppressed };
        ['distance', 'angle', 'offset'].forEach(function (k) { if (m[k] != null) o[k] = m[k]; });
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
  function needAsm() { return isAsm() && hasAssembly() ? Promise.resolve() : Promise.reject(new Error('Not an assembly document')); }
  function asmSummary() {
    var mp = null;
    try { mp = (App.model.components || []).length ? Assembly.massProps(App.model, App.build) : null; } catch (e) { mp = null; }
    return { name: App.model.name, type: 'assembly', features: 0, components: (App.model.components || []).length, mates: (App.model.mates || []).length,
      errors: App.build.errors, volume: mp ? +mp.volume.toFixed(3) : 0, bbox: mp ? mp.bbox : null, faces: App.mesh.faces.length,
      bodies: UI.bodyList ? UI.bodyList().length : 0, rebuildMs: +(App.lastRebuildMs || 0).toFixed(1), equations: {}, equationErrors: {}, configuration: null, configurations: [] };
  }
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
    try { var lp = localStorage.getItem('anvil.lastPart'); if (lp) App.lastPart = JSON.parse(lp); } catch (e) { }
    var asmOk = model && model.type === 'assembly' && hasAssembly() && Array.isArray(model.components);
    if (model && model.type === 'assembly' && !asmOk) model = null;
    if (asmOk) model.features = model.features || [];
    if (!asmOk && (!model || !model.features || !model.features.length)) {
      model = K.newModel('Mounting Bracket');
      try { K.runScript(model, EXAMPLES[0].code); } catch (e) { console.error(e); }
    }
    App.model = model;
    App.model.nextId = App.model.nextId || (Math.max.apply(null, [0].concat(model.features.map(function (f) { return f.id; }), (model.components || []).map(function (c) { return c.id; }), (model.mates || []).map(function (m) { return m.id; }))) + 1);
    if (asmOk) App.ribbonTab = 'Assembly';
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
      var cmds = { extrude: function () { UI.cmdExtrude(false); }, cut: function () { UI.cmdExtrude(true); }, revolve: function () { UI.cmdRevolve(false); }, sketch: UI.cmdSketch, hole: UI.cmdHole, pattern: function () { UI.cmdLinearPattern(); }, circular: function () { UI.cmdCircularPattern(); }, mirror: function () { UI.cmdMirror(); }, plane: function () { UI.cmdPlane(); }, measure: UI.cmdMeasure, mass: showMassProperties, section: UI.cmdSection, dxf: exportFaceDXF, stl: exportSTL, script: function () { openTaskPane('macro'); }, macro: function () { openTaskPane('macro'); }, mate: function () { UI.cmdMate(); }, insert: function () { UI.cmdInsertComponent(); }, component: function () { UI.cmdInsertComponent(); }, assembly: function () { newAssembly(); } };
      var hit = Object.keys(cmds).filter(function (c) { return q.indexOf(c) >= 0; })[0];
      if (hit) { cmds[hit](); $('cmd-search').value = ''; $('cmd-search').blur(); } else UI.toast('No command matches "' + q + '"');
    });
  }

  UI.openTaskPane = openTaskPane; UI.closeTaskPane = closeTaskPane; UI.runScript = runScript; UI.exportDialog = exportDialog;
  UI.exportSTL = exportSTL; UI.exportFaceDXF = exportFaceDXF; UI.exportSketchDXF = exportSketchDXF; UI.exportScript = exportScript; UI.exportJSON = exportJSON; UI.screenshot = screenshot;
  UI.fileNew = fileNew; UI.fileOpen = fileOpen; UI.fileSave = fileSave; UI.fileSaveAs = fileSaveAs;
  UI.cmdInsertImported = cmdInsertImported; UI.openFileData = openFileData; UI.exportData = exportData;
  UI.newAssembly = newAssembly; UI.newPart = newPart; UI.rememberPart = rememberPart; UI.modelScript = modelScript; UI.openExample = openExample;
  UI.showMassProperties = showMassProperties; UI.showShortcuts = showShortcuts; UI.showAbout = showAbout; UI.EXAMPLES = EXAMPLES;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(UI);
