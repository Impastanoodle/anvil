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
        list.appendChild(el('button', { html: '<b>' + ex.name + '</b><small>' + ex.note + '</small>', onclick: function () { confirmDiscard(null, function () { openExample(ex); }); } }));
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
      var isA = f.model && f.model.type === 'assembly';
      var b = el('button', { html: '<b>' + n + '</b><small>' + (isA ? 'assembly, ' + ((f.model.components || []).length) + ' components' : (typeof f.features === 'number' ? f.features : (f.features ? f.features.length : 0)) + ' features') + ' · ' + new Date(f.savedAt || 0).toLocaleString() + '</small>' });
      b.addEventListener('click', function () { confirmDiscard(null, function () { rememberPart(); UI.loadModel(JSON.parse(JSON.stringify(f.model))); App.fileName = n; UI.toast('Opened ' + n); }); });
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
      { label: 'Save', primary: true, action: function () { UI.closeModal(); if (App.fileName) { if (saveInBrowser(App.fileName)) onProceed(); } else fileSave(onProceed); } },
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
      var res = Exchange.finishImport('step', { units: units === 'auto' ? 'mm' : units }, r.solids, 1, []);
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
  function fileOpen() { confirmDiscard(null, showOpenDialog); }
  function showOpenDialog() {
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
  // File ▸ Save (Ctrl+S): asks for the name (the last one offered), saves in this browser; onSaved (a function) runs
  // after a successful save (the Save of "Save changes to Part1?")
  function fileSave(onSaved) {
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
    if (UI.afterSaveHook) UI.afterSaveHook(name);   // an assembly also saves its edited referenced documents (ui-assembly.js)
    UI.markClean();
    if (tpCurrent === 'files') openTaskPane('files');
    return true;
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
    var k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.shiftKey && k >= '1' && k <= '7') { e.preventDefault(); UI.setView(['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom', 'Isometric'][+k - 1]); return; }
    if (ctrl && k === '8') { e.preventDefault(); UI.normalToSelection(); return; }
    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) UI.previousView(); else undoCommand(false, e.target); return; }
    if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); undoCommand(true, e.target); return; }
    if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); fileSave(); return; }
    if (ctrl && (k === 'b' || k === 'B')) { e.preventDefault(); UI.rebuild().then(function () { UI.toast('Rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms'); }); return; }
    if (ctrl && (k === 'n' || k === 'N')) { e.preventDefault(); fileNew(); return; }
    if (ctrl && (k === 'o' || k === 'O')) { e.preventDefault(); fileOpen(); return; }
    if (ctrl) return;
    if (k === 'Enter' && UI.hasPM()) { e.preventDefault(); UI.pmEnter(e.target); return; }   // lane BP: nothing typed here, so ✓ (ui-commands.js pmEnter)
    if (k === 'Delete' || k === 'Backspace') { UI.deleteSelection(); return; }
    if (k === 'F2' && App.sel && App.sel.kind === 'feature') { e.preventDefault(); UI.startRename(K.findFeature(App.model, App.sel.id)); return; }
    if (k === 'f' || k === 'F') { UI.zoomToFit(); return; }
    if (k === 'z') { UI.zoomView(1.25); return; }
    if (k === 'Z') { UI.zoomView(0.8); return; }
    if (k === ' ') { e.preventDefault(); if (UI.showOrientationMenu) { UI.showOrientationMenu(); return; } var hb = $('hud').children[5]; if (hb) hb.click(); return; }
    if (k === 's' || k === 'S') { if (UI.showShortcutBar) UI.showShortcutBar(); else { UI.cmdSketch(); UI.refreshRibbon(); } return; }   // r14/commands14: ui-panels.js takes S first
    if (App.mode === 'sketch') {
      var map = { l: 'line', r: 'rect', c: 'circle', a: 'arc', p: 'polygon', t: 'slot', d: 'dimension' };
      var t = map[k.toLowerCase()];
      // r5/sketch5: A again with the Centerpoint Arc goes on to the 3 Point Arc, then puts the tool down
      if (t === 'arc' && App.tool === 'arc') t = 'arc3';
      else if (t === 'arc' && App.tool === 'arc3') t = 'select';
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
    // bendLines, notes }) -> the DXF text the DXF/DWG Output PropertyManager would save, without opening it
    dxfOutput: function (opts) { built('dxfOutput'); return UI.dxfOutput(opts); },
    dxfFace: function (i) { return K.exportDXFFace(App.mesh, i, App.model.units); },
    dxfSketch: function (id) { return K.exportDXFSketch(K.findFeature(App.model, id), App.model.units); },
    // the flat pattern reads the model and its build together: while a rebuild is queued or running (a parameter just
    // changed) they would not match, so these throw "rebuild in progress" (await anvil.idle() first, or use the
    // ...Async forms, which wait for it)
    flat: function () { built('flat'); return K.flatPattern(App.model, App.build, App.mesh); },
    dxfFlat: function () { built('dxfFlat'); return K.exportDXFFlat(K.flatPattern(App.model, App.build, App.mesh), App.model.units); },
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
        var name = flat(it.label), can = !!(it.run || it.tool);
        add({ name: name, icon: it.icon || it.id, where: tab + (here ? '' : drawingTab(tab) ? ' (drawing)' : ''), enabled: can, here: here, sketchTool: !!it.tool, tab: tab,
          run: function () {
            if (!here) { UI.toast(drawingTab(tab) && !drawing ? 'Open a drawing first: ' + name + ' is on its ' + tab + ' tab.' : name + ' is not on this document\'s CommandManager.'); return; }
            if (it.tool && !it.run) { if (App.mode !== 'sketch') { UI.toast('Open a sketch first: ' + name + ' is a sketch tool.'); return; } UI.setTool(it.tool); }
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
      { name: 'DWG Output', alias: 'dwg', run: function () { UI.cmdDxfOutput({ format: 'dwg' }); } }].forEach(function (x) { add({ name: x.name, alias: x.alias, icon: null, where: 'Anvil', enabled: true, here: true, run: x.run }); });
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

  // ------------------------------------------------------------------ boot
  function boot() {
    if (UI.wrapOkPlusCommands) UI.wrapOkPlusCommands();   // ✓+ on the commands that make something (ui-commands.js)
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
    UI.renderMenuBar();
    UI.refreshRibbon();
    UI.resize();
    UI.rebuild({ noSave: true, sync: true });   // boot builds on the main thread so the first frame already shows the body
    UI.holdRecovery(true);   // the start-up part is clean, and an earlier session's recovery copy waits for offerRecovery
    UI.markClean();
    UI.frame();
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
  UI.openTaskPane = openTaskPane; UI.closeTaskPane = closeTaskPane; UI.runScript = runScript; UI.exportDialog = exportDialog; UI.download = download;
  UI.exportSTL = exportSTL; UI.exportFaceDXF = exportFaceDXF; UI.exportSketchDXF = exportSketchDXF; UI.exportScript = exportScript; UI.exportJSON = exportJSON; UI.screenshot = screenshot;
  UI.fileNew = fileNew; UI.fileOpen = fileOpen; UI.fileSave = fileSave; UI.fileSaveAs = fileSaveAs;
  UI.cmdInsertImported = cmdInsertImported; UI.openFileData = openFileData; UI.exportData = exportData;
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
