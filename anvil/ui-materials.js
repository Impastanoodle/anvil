// ui-materials.js — materials and custom properties in the UI (the data and maths are in materials.js):
// * Edit Material dialog like SolidWorks': the library as a tree of material classes on the left, the selected
//   material's Properties (model type, units, category, elastic modulus, Poisson's ratio, mass density, tensile and
//   yield strength) and Appearance on the right, Apply / Remove / Close. For the part, or for one solid body.
// * FeatureManager: the Material row ("Material <not specified>" / "6061-T6 (SS)"), double-click for Edit Material,
//   right-click for Edit Material, the favourites and Remove Material; Solid Bodies rows get Material ▸ entries.
// * Viewport colour follows the material: UI.bodyColors() gives per-body colours (bodies with their own material, or
//   each assembly component's part material) to ui-core.
// * File ▸ Properties: Summary, Custom and Configuration Specific tabs (Property Name, Type, Value / Text Expression
//   with "SW-Material" / "SW-Mass" links, Evaluated Value), stored in model.properties, one undo step on OK.
(function (UI) {
  'use strict';
  var MT = window.Materials;
  if (!MT || !UI) return;
  var App = UI.App, K = UI.K || window.Kernel, el = UI.el;

  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function afterChange() {
    var p = UI.rebuild();
    if (UI.refreshTree) UI.refreshTree();
    if (UI.refreshTaskPane) UI.refreshTaskPane();
    return p;
  }

  // ------------------------------------------------------------------ applying materials
  // UI.setMaterial(name | null) -> the rebuild Promise; one undo step. The viewport takes the material's colour.
  function setMaterial(name) {
    if (isAsm()) return Promise.reject(new Error('Materials belong to parts: open the part to change its material.'));
    if (name != null && name !== '' && !MT.find(name)) return Promise.reject(new Error('Unknown material "' + name + '"'));
    UI.pushUndo();
    var m = MT.apply(App.model, name || null);
    UI.setStatus(m ? 'Material ' + m.name + ' (' + m.density + ' kg/m³) applied to ' + App.model.name + '.' : 'Material removed from ' + App.model.name + '.');
    return afterChange();
  }
  function bodyFeature(index) {
    var infos = UI.bodyInfos ? UI.bodyInfos() : [];
    var b = infos[index];
    return b && b.featureId != null ? b.featureId : null;
  }
  // UI.setBodyMaterial(index, name | null): a solid body's own material (null: the body follows the part again)
  function setBodyMaterial(index, name) {
    if (isAsm()) return Promise.reject(new Error('Materials belong to parts.'));
    var fid = bodyFeature(index);
    if (fid == null) return Promise.reject(new Error('No solid body ' + index));
    if (name != null && name !== '' && !MT.find(name)) return Promise.reject(new Error('Unknown material "' + name + '"'));
    UI.pushUndo();
    var m = MT.applyToBody(App.model, fid, name || null);
    var nm = UI.bodyInfos()[index].name;
    UI.setStatus(m ? 'Material ' + m.name + ' applied to body ' + nm + '.' : 'Body ' + nm + ' uses the part material again.');
    return afterChange();
  }
  function bodyMaterialName(index) {
    var bm = MT.bodyMaterial(App.model, App.build, index);
    return bm.own ? bm.name : null;
  }

  // ------------------------------------------------------------------ viewport colours
  function bodyColors() {
    if (!App.build) return null;
    if (isAsm()) {
      var cs = App.model.components || [], cache = App.build.cache || {}, base = (App.model.color || MT.DEFAULT_COLOR).toLowerCase(), any = false;
      var out = cs.map(function (c) {
        var e = cache[JSON.stringify(c.source)], col = e && e.model && e.model.color ? e.model.color : MT.DEFAULT_COLOR;
        if (col.toLowerCase() !== base) any = true;
        return col;
      });
      return any ? out : null;
    }
    return MT.bodyColors(App.model, App.build);
  }
  function componentMaterial(c) {
    var e = App.build && App.build.cache ? App.build.cache[JSON.stringify(c.source)] : null;
    var nm = e && e.model ? MT.materialName(e.model) : null;
    return 'Material: ' + (nm || MT.NONE);
  }

  // ------------------------------------------------------------------ Edit Material dialog
  var PROPS = [['Elastic Modulus', 'E', 'N/mm^2'], ['Poisson’s Ratio', 'nu', 'N/A'], ['Mass Density', 'density', 'kg/m^3'], ['Tensile Strength', 'tensile', 'N/mm^2'], ['Yield Strength', 'yield', 'N/mm^2']];
  // UI.editMaterial(target?) opens the dialog: target undefined (the part) or { body: index }
  function editMaterial(target) {
    if (isAsm()) { UI.toast('Materials belong to parts: open the part to edit its material.'); return; }
    target = target || {};
    var forBody = target.body != null, bodyName = forBody ? ((UI.bodyInfos()[target.body] || {}).name || 'Body' + (target.body + 1)) : null;
    var current = forBody ? (bodyMaterialName(target.body) || MT.materialName(App.model)) : MT.materialName(App.model);
    var sel = current || null, open = {};
    MT.classes().forEach(function (c) { open[c.name] = !!(sel && c.materials.some(function (m) { return m.name === sel; })); });
    if (!sel) open.Steel = true;
    var root = el('div', { id: 'mat-dialog', class: 'mat-dialog' });
    var tree = el('div', { class: 'mat-tree', role: 'tree' }), right = el('div', { class: 'mat-right' }), msg = el('div', { class: 'mat-msg' });
    root.appendChild(tree); root.appendChild(right);
    var tab = 'props';
    function renderTree() {
      tree.innerHTML = '';
      tree.appendChild(el('div', { class: 'mat-lib', html: (window.Icons ? window.Icons('material', 14) : '') + '<span>Anvil Materials</span>' }));
      MT.classes().forEach(function (c) {
        var cls = el('div', { class: 'mat-class' + (open[c.name] ? ' open' : ''), 'data-class': c.name, role: 'treeitem' }, [el('span', { class: 'tw', text: open[c.name] ? '▾' : '▸' }), el('span', { text: c.name })]);
        cls.addEventListener('click', function () { open[c.name] = !open[c.name]; renderTree(); });
        tree.appendChild(cls);
        if (!open[c.name]) return;
        c.materials.forEach(function (m) {
          var it = el('div', { class: 'mat-item' + (m.name === sel ? ' selected' : '') + (m.name === current ? ' current' : ''), 'data-material': m.name, role: 'treeitem', title: m.name + ' — ' + m.density + ' kg/m³' },
            [el('span', { class: 'mat-dot', style: 'background:' + m.color }), el('span', { text: m.name })]);
          it.addEventListener('click', function () { sel = m.name; renderTree(); renderRight(); });
          it.addEventListener('dblclick', function () { sel = m.name; applySel(); });
          tree.appendChild(it);
        });
      });
    }
    function renderRight() {
      right.innerHTML = '';
      var tabs = el('div', { class: 'mat-tabs' });
      [['props', 'Properties'], ['appearance', 'Appearance']].forEach(function (t) {
        tabs.appendChild(el('button', { class: 'mat-tab' + (tab === t[0] ? ' active' : ''), 'data-tab': t[0], text: t[1], onclick: function () { tab = t[0]; renderRight(); } }));
      });
      right.appendChild(tabs);
      var m = MT.find(sel);
      if (!m) { right.appendChild(el('div', { class: 'mat-empty', text: 'Select a material in the tree.' })); right.appendChild(msg); return; }
      if (tab === 'props') {
        var kv = el('div', { class: 'mat-kv' });
        [['Model Type:', 'Linear Elastic Isotropic'], ['Units:', 'SI - N/mm^2 (MPa)'], ['Category:', m.category], ['Name:', m.name]].forEach(function (r) { kv.appendChild(el('span', { text: r[0] })); kv.appendChild(el('span', { class: 'v', text: r[1] })); });
        right.appendChild(kv);
        var tb = el('table', { class: 'mat-props' }, [el('tr', {}, [el('th', { text: 'Property' }), el('th', { text: 'Value' }), el('th', { text: 'Units' })])]);
        PROPS.forEach(function (p) { tb.appendChild(el('tr', { 'data-prop': p[1] }, [el('td', { text: p[0] }), el('td', { class: 'num', text: String(m[p[1]]) }), el('td', { text: p[2] })])); });
        right.appendChild(tb);
      } else {
        right.appendChild(el('div', { class: 'mat-appearance' }, [el('div', { class: 'mat-swatch', style: 'background:' + m.color }), el('div', {}, [el('div', { text: m.metal ? 'Polished ' + m.category.toLowerCase().replace(/s$/, '') : 'Plastic, ' + m.name }), el('div', { class: 'v', text: m.color })])]));
        right.appendChild(el('div', { class: 'mat-note', text: 'The part (or body) takes this colour in the viewport when the material is applied.' }));
      }
      right.appendChild(msg);
    }
    function applySel() {
      if (!sel) return;
      var p = forBody ? setBodyMaterial(target.body, sel) : setMaterial(sel);
      current = sel;
      msg.textContent = 'Applied ' + sel + ' to ' + (forBody ? 'body ' + bodyName : App.model.name) + '.';
      renderTree();
      return p;
    }
    renderTree(); renderRight();
    var buttons = [{ label: 'Apply', primary: true, id: 'mat-apply', action: applySel }];
    if (forBody ? bodyMaterialName(target.body) : MT.materialName(App.model)) buttons.push({ label: forBody ? 'Use Part Material' : 'Remove Material', id: 'mat-remove', action: function () { if (forBody) setBodyMaterial(target.body, null); else setMaterial(null); UI.closeModal(); } });
    buttons.push({ label: 'Close', id: 'mat-close', action: UI.closeModal });
    UI.showModal({ title: 'Material' + (forBody ? ' — ' + bodyName : ' — ' + App.model.name), body: root, buttons: buttons });
    var card = document.getElementById('modal-card');
    if (card) card.classList.add('wide');
    return { select: function (name) { sel = MT.find(name) ? MT.find(name).name : sel; renderTree(); renderRight(); }, apply: applySel };
  }

  // ------------------------------------------------------------------ FeatureManager
  function materialMenu() {
    var cur = MT.materialName(App.model), items = [{ label: 'Edit Material', action: function () { editMaterial(); } }, { sep: true }];
    MT.favorites().forEach(function (m) { items.push({ label: m.name, checked: cur === m.name, action: function () { run(setMaterial(m.name)); } }); });
    items.push({ sep: true });
    items.push({ label: 'Remove Material', disabled: !cur, action: function () { run(setMaterial(null)); } });
    return items;
  }
  function run(p) { if (p && p.catch) p.catch(function (e) { UI.toast(e.message || String(e)); }); }
  function materialTreeRow(treeItem) {
    var m = MT.of(App.model), multi = MT.hasBodyMaterials(App.model);
    var row = treeItem({ icon: 'material', name: m ? m.name : MT.NONE, depth: 1, cls: 'material-row' + (m ? '' : ' dim'), title: (m ? m.name + ' — ' + m.density + ' kg/m³' : 'No material: mass uses ' + App.model.density + ' kg/m³') + (multi ? '; some bodies have their own material' : '') + '. Double-click to edit.' });
    row.setAttribute('data-material', m ? m.name : '');
    row.addEventListener('dblclick', function (e) { e.stopPropagation(); editMaterial(); });
    row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); UI.showMenu(e.clientX, e.clientY, materialMenu()); });
    return row;
  }
  function bodyMaterialMenu(b) {
    var own = bodyMaterialName(b.index);
    return [
      { label: 'Material ▸ Edit Material…', action: function () { editMaterial({ body: b.index }); } },
      { label: 'Material ▸ Use Part Material', disabled: !own, action: function () { run(setBodyMaterial(b.index, null)); } }
    ];
  }
  var baseBodyTitle = UI.bodyTitle;
  function bodyTitle(b) {
    var t = baseBodyTitle ? baseBodyTitle(b) : b.name;
    if (!MT.hasBodyMaterials(App.model)) return t;
    var bm = MT.bodyMaterial(App.model, App.build, b.index);
    return t + ' — ' + (bm.name || MT.NONE) + (bm.own ? '' : ' (part material)');
  }

  // ------------------------------------------------------------------ File ▸ Properties
  // UI.fileProperties(tab?) opens Summary / Custom / Configuration Specific. Works on a working copy; OK stores it.
  function fileProperties(tab) {
    var model = App.model, asm = isAsm();
    var hasAny = !!(model.properties && (model.properties.custom || model.properties.config));
    var work = { custom: hasAny ? MT.custom(model) : MT.defaultProperties(model), config: {} };
    var cfgNames = MT.configNames(model), cfg = MT.activeConfigName(model);
    cfgNames.forEach(function (n) { work.config[n] = MT.configSpecific(model, n); });
    var ctx = MT.context(model, { build: App.build, mesh: App.mesh });
    tab = tab || 'custom';
    var root = el('div', { id: 'fp-dialog', class: 'fp-dialog' }), tabs = el('div', { class: 'fp-tabs' }), pane = el('div', { class: 'fp-pane' });
    root.appendChild(tabs); root.appendChild(pane);
    var dl1 = el('datalist', { id: 'fp-names' }); MT.PRESETS.forEach(function (n) { dl1.appendChild(el('option', { value: n })); });
    var dl2 = el('datalist', { id: 'fp-links' }); MT.LINKS.forEach(function (l) { dl2.appendChild(el('option', { value: '"' + l[1] + '"', label: l[0] })); });
    root.appendChild(dl1); root.appendChild(dl2);
    function renderTabs() {
      tabs.innerHTML = '';
      [['summary', 'Summary'], ['custom', 'Custom'], ['config', 'Configuration Specific']].forEach(function (t) {
        tabs.appendChild(el('button', { class: 'fp-tab' + (tab === t[0] ? ' active' : ''), 'data-tab': t[0], text: t[1], onclick: function () { tab = t[0]; renderTabs(); render(); } }));
      });
    }
    function table(rows) {
      var tb = el('table', { class: 'fp-table' });
      tb.appendChild(el('tr', {}, ['', 'Property Name', 'Type', 'Value / Text Expression', 'Evaluated Value', ''].map(function (h) { return el('th', { text: h }); })));
      rows.forEach(function (r, i) {
        var name = el('input', { type: 'text', class: 'fp-name', list: 'fp-names', value: r.name, placeholder: '<Type a new property>' });
        var type = el('select', { class: 'fp-type' }); MT.TYPES.forEach(function (t) { var o = el('option', { value: t, text: t }); if (t === r.type) o.selected = true; type.appendChild(o); });
        var val = el('input', { type: 'text', class: 'fp-value', list: 'fp-links', value: r.value });
        var ev = el('span', { class: 'fp-eval' });
        function upd() { ev.textContent = MT.evaluate(model, val.value, ctx); ev.classList.toggle('linked', MT.isLinked(val.value)); }
        name.addEventListener('input', function () { r.name = name.value; });
        type.addEventListener('change', function () { r.type = type.value; });
        val.addEventListener('input', function () { r.value = val.value; upd(); });
        // a property named Material / Mass starts linked, as SolidWorks offers
        name.addEventListener('change', function () {
          var k = name.value.trim().toLowerCase();
          if (!val.value && (k === 'material' || k === 'mass' || k === 'weight')) { val.value = MT.link(k === 'material' ? 'Material' : 'Mass'); r.value = val.value; upd(); }
        });
        upd();
        var del = el('button', { class: 'fp-del', title: 'Delete property', text: '✕', onclick: function () { rows.splice(i, 1); render(); } });
        tb.appendChild(el('tr', { class: 'fp-row' }, [el('td', { class: 'fp-n', text: String(i + 1) }), el('td', {}, [name]), el('td', {}, [type]), el('td', {}, [val]), el('td', {}, [ev]), el('td', {}, [del])]));
      });
      return tb;
    }
    function addRowBtn(rows) { return el('button', { id: 'fp-add', class: 'btn', text: 'Add Property', onclick: function () { rows.push({ name: '', type: 'Text', value: '' }); render(); var ins = pane.querySelectorAll('.fp-name'); if (ins.length) ins[ins.length - 1].focus(); } }); }
    function render() {
      pane.innerHTML = '';
      if (tab === 'summary') {
        var mp = ctx.mass(), kv = el('table', { class: 'fp-summary' });
        [['Document', model.name], ['Type', asm ? 'Assembly' : 'Part'], ['Units', model.units === 'in' ? 'IPS (inch, pound, second)' : 'MMGS (millimeter, gram, second)'],
          asm ? null : ['Material', MT.materialName(model) || MT.NONE], ['Mass', mp ? MT.formatMass(mp.massKg || 0, model.units === 'in' ? 'in' : 'mm') : '-'],
          ['Configuration', MT.activeConfigName(model)], ['Custom properties', String(work.custom.length)]].filter(Boolean).forEach(function (r) { kv.appendChild(el('tr', {}, [el('th', { text: r[0] }), el('td', { text: r[1] })])); });
        pane.appendChild(kv);
        return;
      }
      if (tab === 'custom') {
        if (!hasAny) pane.appendChild(el('div', { class: 'fp-hint', text: 'Suggested properties for a new ' + (asm ? 'assembly' : 'part') + '. OK keeps them; delete the ones you do not need.' }));
        pane.appendChild(table(work.custom));
        pane.appendChild(el('div', { class: 'fp-bar' }, [addRowBtn(work.custom), el('span', { class: 'fp-hint', text: 'Link a value with "SW-Material", "SW-Mass", "SW-Density", "SW-Volume" (pick from the list). Drawings read these properties in the title block and BOM.' })]));
        return;
      }
      var cs = el('select', { id: 'fp-config' });
      cfgNames.forEach(function (n) { var o = el('option', { value: n, text: n }); if (n === cfg) o.selected = true; cs.appendChild(o); });
      cs.addEventListener('change', function () { cfg = cs.value; render(); });
      pane.appendChild(el('div', { class: 'fp-bar' }, [el('label', { text: 'Applies to: ' }), cs]));
      var rows = work.config[cfg] = work.config[cfg] || [];
      pane.appendChild(table(rows));
      pane.appendChild(el('div', { class: 'fp-bar' }, [addRowBtn(rows), el('span', { class: 'fp-hint', text: 'Configuration Specific properties override Custom ones of the same name while ' + cfg + ' is active.' })]));
    }
    renderTabs(); render();
    UI.showModal({ title: (asm ? 'Assembly' : 'Part') + ' Properties — ' + model.name, body: root, buttons: [
      { label: 'OK', primary: true, id: 'fp-ok', action: function () { UI.closeModal(); run(setProperties(work.custom, work.config)); } },
      { label: 'Cancel', id: 'fp-cancel', action: UI.closeModal }
    ] });
    var card = document.getElementById('modal-card');
    if (card) card.classList.add('wide');
  }
  // setProperties(custom, config?) -> the rebuild Promise; one undo step. config: { "<configuration>": rows }
  function setProperties(customRows, config) {
    UI.pushUndo();
    if (customRows) MT.setCustom(App.model, customRows);
    Object.keys(config || {}).forEach(function (n) { MT.setConfigSpecific(App.model, n, config[n]); });
    var n = MT.custom(App.model).length;
    UI.setStatus('File Properties: ' + n + ' custom propert' + (n === 1 ? 'y' : 'ies') + ' on ' + App.model.name + '.');
    return afterChange();
  }

  // ------------------------------------------------------------------ hooks and automation
  UI.setMaterial = setMaterial; UI.setBodyMaterial = setBodyMaterial; UI.editMaterial = editMaterial;
  UI.materialTreeRow = materialTreeRow; UI.bodyMaterialMenu = bodyMaterialMenu; UI.bodyTitle = bodyTitle;
  UI.bodyColors = bodyColors; UI.componentMaterial = componentMaterial;
  UI.fileProperties = fileProperties; UI.setProperties = setProperties;

  var A = window.anvil;
  if (A) {
    var summary0 = A.summary;
    A.summary = function () {
      var s = summary0.apply(this, arguments);
      if (s && !isAsm()) {
        s.material = MT.materialName(App.model);
        if (App.mesh && App.mesh.triCount) { var mp = MT.massProps(App.model, App.build, App.mesh); s.massKg = +mp.massKg.toFixed(9); }
        if (MT.hasBodyMaterials(App.model)) s.bodyMaterials = clone(App.model.bodyMaterials);
      }
      return s;
    };
    // material() -> the part's material name (null: not specified); material(name | null) applies it (one undo step)
    A.material = function (name) {
      if (!arguments.length) return MT.materialName(App.model);
      return setMaterial(name).then(function () { return A.summary(); });
    };
    // bodyMaterial(i) -> the body's own material or null; bodyMaterial(i, name | null) sets it (one undo step)
    A.bodyMaterial = function (i, name) {
      if (arguments.length < 2) return bodyMaterialName(i);
      return setBodyMaterial(i, name).then(function () { return A.summary(); });
    };
    A.materials = function () { return MT.classes().map(function (c) { return { name: c.name, materials: c.materials.map(function (m) { return clone(m); }) }; }); };
    A.editMaterial = function (target) { return editMaterial(target); };
    A.fileProperties = function (tab) { fileProperties(tab); };
    // properties() -> { active, custom, config, evaluated: [{ name, type, value, evaluated, source }] };
    // properties(rows, { config }) replaces the Custom rows (or one configuration's) — one undo step
    A.properties = function (rows, opts) {
      if (!arguments.length) {
        var ctx = MT.context(App.model, { build: App.build, mesh: App.mesh });
        return { active: MT.activeConfigName(App.model), custom: MT.custom(App.model), config: clone((App.model.properties && App.model.properties.config) || {}), evaluated: MT.evaluated(App.model, ctx) };
      }
      opts = opts || {};
      var cfgMap = null;
      if (opts.config != null) { cfgMap = {}; cfgMap[opts.config] = rows; return setProperties(null, cfgMap).then(function () { return A.summary(); }); }
      return setProperties(rows, null).then(function () { return A.summary(); });
    };
    // property(name) -> its evaluated value (null when not defined); property(name, value | null, { type, config }) sets it
    A.property = function (name, value, opts) {
      if (arguments.length < 2) return MT.property(App.model, name, MT.context(App.model, { build: App.build, mesh: App.mesh }));
      UI.pushUndo();
      MT.setProperty(App.model, name, value, opts);
      return afterChange().then(function () { return A.summary(); });
    };
  }
  if (UI.refreshTree && App.model) UI.refreshTree();
})(window.UI);
