// ui-profiles.js — interface profiles (lane profiles, user 2026-11-11: "a setting that rearranges the ui to be similar
// to different softwares i.e. click this setting if you are used to mastercam click this setting if you are used to
// solidworks"). A profile is data, not a fork: one JSON-able table per profile, read by the CommandManager
// (ui-panels.js profileSet: tabs, groups, captions, names), the key table (ui-app.js KEY_DEFAULTS + keys), the
// graphics-area mouse (ui-core.js UI.setNavMap, lane profnav) and the panel layout (UI.setTreeDock). No command code
// asks which profile is on. What never changes with a profile: what a command does, PropertyManagers, feature names,
// files, scripts, the script API and the menus.
//
// UI.Profiles: register(def), list() -> [{ id, name, note }], get(id) (a copy), active() -> id, set(id) (applies at
// once, kept in localStorage 'anvil.profile', 'anvil.test.profile' in a frame under /tests/), onChange(fn),
// labelFor(cmd), tabOf(cmd), check(id) (cmds a profile names that no document type has), optionsSection() (Tools ▸
// Options ▸ Interface), openSetting().
//
// Schema (every section optional; a document type or a section left out is SolidWorks'):
//   { id, name, note,
//     tabs: { part | assembly | drawing: [ { name, groups: [ { name, items: [cmd | { stack: [cmd] } | { grid: [cmd] } |
//             { fly, label, items: [cmd] }] } ] } | { name, sw: '<SolidWorks tab kept whole>' } ] },
//     tabAlias: { part: { Sketch: 'Wireframe', Features: 'Solids' } },   // where Anvil's "show the Sketch tab" lands
//     labels: { cmd: 'Name' },  keys: { cmd | key action: 'Alt+F1' },  mouse: { drag, wheel, middleDouble },
//     dock: { tree: 'left' | 'right' } }
(function (UI) {
  'use strict';
  var App = UI.App;
  var KEY = (function () { var t = false; try { t = !!(window.frameElement && /\/tests\//.test(window.parent.location.pathname)); } catch (e) { } return t ? 'anvil.test.profile' : 'anvil.profile'; })();
  var defs = {}, order = [], current = 'solidworks', listeners = [], booted = false;
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function flat(s) { return String(s || '').replace(/\s*\n\s*/g, ' ').trim(); }

  function register(def) {
    if (!def || typeof def.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(def.id)) throw new Error('A profile needs an id of lower-case letters, digits and -');
    var d = clone(def);
    d.name = d.name || d.id;
    d.rev = (defs[d.id] ? defs[d.id].rev || 0 : 0) + 1;
    if (!defs[d.id]) order.push(d.id);
    defs[d.id] = d;
    if (d.id === current && booted) apply(null);
    return d.id;
  }
  // unregister(id): a profile registered for a test goes again (the built-in ones stay); the active one falls back to SolidWorks
  function unregister(id) {
    if (!defs[id] || id === 'solidworks' || id === 'mastercam') return false;
    if (current === id) set('solidworks');
    delete defs[id]; order.splice(order.indexOf(id), 1);
    return true;
  }
  function list() { return order.map(function (id) { return { id: id, name: defs[id].name, note: defs[id].note || '' }; }); }
  function get(id) { return defs[id] ? clone(defs[id]) : null; }
  function active() { return current; }
  function def(id) { return defs[id] || null; }
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  // the SolidWorks name of the tab under a profile ('Wireframe' -> 'Sketch'), so a switch keeps the user where he was
  function swTabOf(p, tab) {
    var al = p && p.tabAlias && p.tabAlias[UI.Commands ? UI.Commands.docType() : 'part'];
    if (al) for (var k in al) if (al[k] === tab) return k;
    return tab;
  }
  function apply(prev) {
    if (prev) App.ribbonTab = swTabOf(prev, App.ribbonTab);
    var p = defs[current] || {};
    if (UI.profileRibbonReset) UI.profileRibbonReset();
    if (UI.keys) UI.keys.reset();
    if (UI.setNavMap) { try { UI.setNavMap(p.mouse || null); } catch (e) { console.warn('setNavMap', e); } }   // lane profnav (ui-core.js)
    if (UI.setTreeDock) UI.setTreeDock(p.dock && p.dock.tree === 'right' ? 'right' : 'left');
    if (UI.refreshRibbon) UI.refreshRibbon();
    if (UI.refreshStatus) UI.refreshStatus();
    if (UI.refreshTaskPane) UI.refreshTaskPane();
  }
  function set(id) {
    if (!defs[id]) id = 'solidworks';
    var prev = defs[current], changed = id !== current;
    current = id;
    try { if (id === 'solidworks') localStorage.removeItem(KEY); else localStorage.setItem(KEY, id); } catch (e) { }
    if (changed || !booted) apply(prev);
    if (changed) listeners.slice().forEach(function (fn) { try { fn(id); } catch (e) { console.warn(e); } });
    return current;
  }
  function labelFor(cmd) {
    var p = defs[current];
    return p && p.id !== 'solidworks' && p.labels && p.labels[cmd] ? flat(p.labels[cmd]) : null;
  }
  // the tab of the active profile's CommandManager a command is on now (null with SolidWorks' layout)
  function tabOf(cmd, docType) {
    var set = UI.profileRibbon ? UI.profileRibbon(docType) : null;
    if (!set || !defs[current].tabs) return null;
    var names = Object.keys(set);
    for (var i = 0; i < names.length; i++) {
      var leaves = UI.ribbonLeaves(set[names[i]]);
      for (var j = 0; j < leaves.length; j++) if (UI.Commands.cmdOf(leaves[j]) === cmd) return names[i];
    }
    return null;
  }
  // the cmds a profile names (tabs, labels, keys) that no document type has and no key action is called
  function check(id) {
    var p = defs[id || current], bad = [];
    if (!p) return ['no profile ' + id];
    var known = {};
    ['part', 'assembly', 'drawing'].forEach(function (dt) { UI.Commands.list(dt).forEach(function (c) { known[c.cmd] = true; }); });
    (UI.keys ? UI.keys.defaults() : []).forEach(function (d) { known[d.action] = true; });
    function see(c, where) { if (typeof c === 'string' && !known[c]) bad.push(where + ': ' + c); }
    Object.keys(p.tabs || {}).forEach(function (dt) {
      (p.tabs[dt] || []).forEach(function (t) {
        (t.groups || []).forEach(function (g) { (g.items || []).forEach(function (x) { if (typeof x === 'string') see(x, dt + ' ' + t.name); else (x.stack || x.grid || x.items || []).forEach(function (c) { see(c, dt + ' ' + t.name); }); }); });
      });
    });
    Object.keys(p.labels || {}).forEach(function (c) { see(c, 'labels'); });
    Object.keys(p.keys || {}).forEach(function (c) { see(c, 'keys'); });
    return bad;
  }

  // ------------------------------------------------------------------ Tools ▸ Options ▸ Interface
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function optionsSection() {
    var box = el('div', { 'data-role': 'interface-profiles' });
    box.appendChild(el('h3', { text: 'Interface' }));
    box.appendChild(el('p', { text: 'Lay out Anvil like:' }));
    var opts = el('div', { class: 'prof-opts', role: 'radiogroup', 'aria-label': 'Lay out Anvil like' });
    list().forEach(function (p) {
      var r = el('input', { type: 'radio', name: 'anvil-profile', value: p.id, 'data-profile': p.id });
      r.checked = p.id === current;
      r.addEventListener('change', function () { if (r.checked) { set(p.id); UI.setStatus('Interface: Anvil is laid out like ' + p.name + '.'); } });
      opts.appendChild(el('label', { 'data-profile': p.id }, [r, el('span', { text: p.name + (p.id === 'solidworks' ? ' (default)' : '') }), p.note ? el('small', { text: p.note }) : null]));
    });
    box.appendChild(opts);
    box.appendChild(el('p', { html: '<small>Moves the CommandManager tabs and names, the keys and the mouse; what each command does, the menus and your files stay the same. The status bar names the profile while it is not SolidWorks.</small>' }));
    return box;
  }
  function openSetting() {
    if (UI.openTaskPane) UI.openTaskPane('props');
    var s = document.querySelector('[data-role="interface-profiles"]');
    if (s) { if (s.scrollIntoView) s.scrollIntoView({ block: 'nearest' }); var r = s.querySelector('input:checked'); if (r) r.focus(); }
  }
  UI.profileStatusHtml = function () {
    var p = defs[current];
    if (!p || p.id === 'solidworks') return '';
    var n = String(p.name).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    return '<span class="st-profile" title="Interface profile: Anvil is laid out like ' + n + '. Click to change it (Tools ▸ Options).">' + n + '</span>';
  };
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#status-right .st-profile') : null;
    if (t) { e.preventDefault(); openSetting(); }
  });

  // keys in a drawing: drawing-ui-panels.js takes every key while a drawing is open (capture on window); a key the
  // active profile binds is run here first (this file loads before the drawing files, so this listener runs first)
  window.addEventListener('keydown', function (e) {
    if (current === 'solidworks' || !(UI.drawingActive && UI.drawingActive()) || !UI.keys) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable) || !document.getElementById('modal').hidden) return;
    var c = UI.keys.canon((e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.altKey ? 'Alt+' : '') + (e.key === ' ' ? 'Space' : e.key));
    var p = defs[current], cmd = null;
    Object.keys(p.keys || {}).forEach(function (k) { if ([].concat(p.keys[k]).some(function (x) { return UI.keys.canon(x) === c; })) cmd = k; });
    if (!cmd) return;
    if (UI.Commands.get(cmd, 'drawing')) { e.preventDefault(); e.stopImmediatePropagation(); UI.Commands.run(cmd, 'drawing'); return; }
    // a key action the drawing has its own key for (Zoom to Fit = F, Delete): hand the drawing that key
    var dflt = UI.keys.defaults().filter(function (d) { return d.action === cmd && /^[A-Z]$|^Del$/.test(d.key); })[0];
    if (!dflt) return;
    e.preventDefault(); e.stopImmediatePropagation();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: dflt.key === 'Del' ? 'Delete' : dflt.key.toLowerCase(), bubbles: true, cancelable: true }));
  }, true);

  // ------------------------------------------------------------------ the profiles
  register({ id: 'solidworks', name: 'SolidWorks', note: 'CommandManager tabs, names, keys and mouse as SOLIDWORKS 2024 has them.' });

  // Mastercam 2024 / 2025 (design side). Facts from lane profnav's reference (scratchpad mastercam-reference.json):
  // tab and group names, command names, keys and mouse. A Mastercam name is used only where the command is that
  // command; Anvil's own and SolidWorks-only commands keep their SolidWorks names. Mastercam has no sheet metal and
  // no assemblies: Anvil's Sheet Metal tab stays whole, assemblies get the names, keys and mouse only. Unverified
  // entries (the reference marks them) are listed in anvil/docs/areas/ui-core.md *Interface profiles*.
  register({
    id: 'mastercam', name: 'Mastercam',
    note: 'Wireframe, Solids, Drafting, Transform and View tabs with Mastercam names, Alt+F1 / Alt+1… keys, middle-drag rotate, Shift+middle pan.',
    tabs: {
      part: [
        { name: 'Wireframe', groups: [
          { name: 'Sketch', items: ['sketch', { fly: 'relations', items: ['relations', 'addRelation', 'fullyDefine'] }, { stack: ['repairSketch', 'checkSketch', 'construction'] }] },
          { name: 'Points', items: ['point'] },
          { name: 'Lines', items: ['line', { grid: ['parallelLine', 'perpLine', 'bisectorLine', 'centerline', 'midline', 'tangentLine'] }] },
          { name: 'Arcs', items: ['circle', { grid: ['pcircle', 'arc', 'arc3', 'tarc', 'tangentCircle'] }] },
          { name: 'Splines', items: ['spline', { stack: ['styleSpline', 'eqnCurve'] }] },
          { name: 'Curves', items: [{ stack: ['convert', 'intersectCurve', 'projCurve'] }] },
          { name: 'Shapes', items: ['rect', { grid: ['crect', 'rect3', 'crect3', 'parallelogram', 'slot', 'cslot', 'aslot3', 'aslot', 'polygon'] }, { stack: ['ellipse', 'pellipse', 'helix'] }, 'text'] },
          { name: 'Modify', items: ['trim', { grid: ['extend', 'splitEnt', 'joinEnt', 'skFillet', 'skChamfer', 'closeArc'] }, 'offset'] }
        ] },
        { name: 'Solids', groups: [
          { name: 'Create', items: ['extrude', 'revolve', { stack: ['sweep', 'loft', 'boundary'] }, 'cut', 'revolveCut', { stack: ['sweptCut', 'loftedCut', 'boundaryCut'] }] },
          { name: 'Modify', items: [{ fly: 'fillet', items: ['fillet', 'chamfer'] }, 'shell', 'draft', 'holeWizard', { stack: ['intersect', 'rib', 'wrap'] }] },
          { name: 'Pattern', items: ['lpattern', 'cpattern', 'mirror'] },
          { name: 'Reference', items: [{ fly: 'refgeo', label: 'Reference\nGeometry', items: ['plane', 'refAxis', 'csys', 'refPoint'] }] }
        ] },
        { name: 'Sheet Metal', sw: 'Sheet Metal' },
        { name: 'Drafting', groups: [
          { name: 'Dimension', items: ['dim', { grid: ['horizDim', 'vertDim', 'ordinateDim', 'ordinateH', 'ordinateV', 'chamferDim', 'angRunDim', 'pathLengthDim', 'autodim'] }] }
        ] },
        { name: 'Transform', sw: 'Transform' },
        { name: 'View', sw: 'View' }
      ],
      drawing: [
        { name: 'View Layout', sw: 'View Layout' },
        { name: 'Drafting', groups: [
          { name: 'Dimension', items: ['dim', { grid: ['horizDim', 'vertDim', 'baselineDim', 'ordinateDim', 'ordinateH', 'ordinateV', 'angRunDim', 'chamferDim', 'pathLengthDim'] }, 'modelItems'] },
          { name: 'Annotate', items: ['note', { grid: ['balloon', 'autoBalloon', 'stackBalloon', 'holeCallout', 'magLine', 'multiJogLeader', 'flagNote', 'areaHatch', 'centerMark', 'centerline'] }] },
          { name: 'Symbols', items: [{ grid: ['surfaceFinish', 'datumFeature', 'gtol', 'weldSymbol', 'datumTarget', 'cosmeticThread', 'dowelPin', 'revisionSymbol', 'revisionCloud'] }] },
          { name: 'Tables', items: [{ grid: ['bom', 'revTable', 'generalTable', 'holeTable', 'bendTable', 'punchTable'] }, 'docProps'] }
        ] },
        { name: 'Sketch', sw: 'Sketch' },
        { name: 'Sheet Format', sw: 'Sheet Format' }
      ]
    },
    tabAlias: { part: { Sketch: 'Wireframe', Features: 'Solids', Evaluate: 'More' }, drawing: { Annotation: 'Drafting' } },
    labels: {
      extrude: 'Extrude', revolve: 'Revolve', sweep: 'Sweep', loft: 'Loft', holeWizard: 'Hole', fillet: 'Constant\nFillet',
      lpattern: 'Rectangular\nPattern', cpattern: 'Circular\nPattern', draft: 'Draft\nFaces',
      line: 'Line\nEndpoints', parallelLine: 'Line Parallel', perpLine: 'Line Perpendicular', bisectorLine: 'Line Bisect',
      point: 'Point\nPosition', rect: 'Rectangle', circle: 'Circle\nCenter Point', pcircle: 'Circle Edge Point', arc: 'Arc Polar', arc3: 'Arc 3 Points', tarc: 'Arc Tangent',
      text: 'Letters', trim: 'Dynamic\nTrim', skFillet: 'Fillet Entities', skChamfer: 'Chamfer Entities',
      horizDim: 'Horizontal', vertDim: 'Vertical', ordinateDim: 'Ordinate', baselineDim: 'Baseline',
      measure: 'Analyze\nDistance', mass: 'Analyze Solid\nProperties',
      vZoomFit: 'Fit', zoomArea: 'Window', vGrid: 'Display Grid', vFeatureTree: 'Solids Manager', levels: 'Levels', vLevels: 'Levels Manager'
    },
    keys: {
      vTop: 'Alt+1', vFront: 'Alt+2', vBack: 'Alt+3', vBottom: 'Alt+4', vRight: 'Alt+5', vLeft: 'Alt+6', vIso: 'Alt+7', prevView: 'Alt+P',
      fit: 'Alt+F1', zoomArea: 'F1', vOrigins: 'F9', levels: 'Alt+Z', vFeatureTree: 'Alt+I', trim: 'Shift+T',
      zoomIn: 'PageUp', zoomOut: ['Alt+F2', 'PageDown']
    },
    mouse: { drag: { 'middle': 'rotate', 'shift+middle': 'pan', 'ctrl+middle': 'pan', 'alt+left': 'rotate', 'right': null }, wheel: { zoom: 1, about: 'cursor' }, middleDouble: 'fit' },
    dock: { tree: 'left' }
  });

  UI.Profiles = { register: register, unregister: unregister, list: list, get: get, def: def, active: active, set: set, onChange: onChange, labelFor: labelFor, tabOf: tabOf, check: check,
    optionsSection: optionsSection, openSetting: openSetting, storageKey: KEY };

  // boot: the saved profile (after every file has loaded: the drawing tabs and the mouse map come later)
  function boot() {
    var id = 'solidworks';
    try { id = localStorage.getItem(KEY) || 'solidworks'; } catch (e) { }
    current = defs[id] ? id : 'solidworks';
    booted = true;
    if (current !== 'solidworks') apply(null);
    else if (UI.setNavMap) { try { UI.setNavMap(null); } catch (e) { console.warn('setNavMap', e); } }   // SolidWorks' mouse
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);
})(UI);
