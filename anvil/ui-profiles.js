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
//     dock: { tree: 'left' | 'right' },
//     frame: { ... },        // lane mcframe: the window around the graphics area (ui-panels.js UI.setFrame), see below
//     wireframe: { direct: true, plane: 'Top' },   // lane mcdirect reads it: wireframe tools draw without entering a
//                            // sketch, on the construction plane named here (ui-sketch*.js; this file only holds the data)
//     viewport: { background: ['#top', '#bottom'], labels, headsUp, quickMasks, selectionBar, contextMenu: 'mastercam' } }
//                            // lane mcdirect reads it: graphics-window gradient (top, bottom), view-name labels, the
//                            // heads-up toolbar shown or not, Quick Masks column, selection bar, right-click menu style;
//                            // colors: { wireframe, solid, gnomon: [x, y, z] } (lane mctheme, ui-core.js UI.profileViewportColors):
//                            // sketch / wireframe lines, the default solid colour and the gnomon under the profile
//   A tab's group item may also be { menu: 'Edit', row: 'Delete', label, icon } (runs that menu row: Home ▸ Delete
//   Entities) or { fn: 'manager' | 'search', arg, label, icon } (a frame function: a manager panel tab, Command Finder)
//   or { fn: 'action', arg } (lane mcpolish: a frame action of ui-panels.js FRAME_ACTIONS, its label / icon / help from
//   there: cut, copyImage, undelete, zDepth, level, mode3d, blank, unblank, hideUnhide, unzoom50, unzoom80, translucency,
//   material, showAxes, showGnomons, showGrid, snapGrid, vsOnOff, vsNew, vsSave, vsRestore).
//   A tab kept whole ({ sw }) may name the captions of its runs between separators: captions: ['Base', 'Flanges' …].
//   frame (left out = SolidWorks' window; every key optional):
//     ribbon: { tabsOnTop, fileTab ('File': opens the backstage), qat (title-row Quick Access Toolbar), captions (a
//               caption under every group, every tab and document type) },
//     menubar: false          (no classic menu bar: File rows in the backstage, the other menus as buttons on More),
//     managers: { tabs: ['solids', 'planes', 'levels', 'recent'], titles: { solids: 'Solids' … } }   (the left column
//               as a manager panel with its tabs at the bottom; a PropertyManager shows there as a function panel),
//     functionTitles: { cmd: 'Solid Extrude' },   (the function panel's title for a command started from the ribbon;
//               else the profile's label),
//     status: ['section', 'selected', 'xyz', 'mode', 'cplane', 'tplane', 'wcs', 'styles'],   (the status bar, left to
//               right; mode = 3D / 2D, styles = Wireframe … Outline Shaded, Material),
//     viewsheets: true        (the viewsheet strip under the graphics window: tabs, +, right-click; lane mcpolish),
//     theme: { name: 'mastercam' (html data-profile), vars: { light: { '--mc-x': … }, dark: { … } } }
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
  // ---- rfLX: the profile's icon set. `icons: { set: 'mastercam' }` names a set registered with icons.js (Icons.sets;
  // icons-mastercam.js); no section = the built-in drawings. The set is switched before anything is rebuilt, then every
  // icon still on screen from the other set is drawn again: what the set drew carries its name (data-ic), a built-in
  // icon (which carries nothing, its markup is untouched) is found by rendering the built-in names at its size.
  function iconSetOf(p) { var id = p && p.icons && p.icons.set; return id && window.Icons && Icons.sets && Icons.sets.get(id) ? id : null; }
  function iconHtml(html) { var box = document.createElement('div'); box.innerHTML = html; return box.firstChild; }
  function iconClass(svg) { return (svg.getAttribute('class') || '').replace(/(^|\s)ico(?=\s|$)/, ' ').trim(); }
  function redrawIcons() {
    var now = Icons.sets.active(), all = Array.prototype.slice.call(document.querySelectorAll('svg.ico[data-wt]')), tables = {};
    var plain = all.filter(function (s) { return !s.getAttribute('data-set'); });
    if (now && plain.length) {
      // the built-in icons on screen: their names, read with no set on
      Icons.sets.use(null);
      try {
        plain.forEach(function (s) {
          var size = parseFloat(s.getAttribute('width')) || 16, cls = iconClass(s), key = size + '|' + cls, t = tables[key];
          if (!t) { t = tables[key] = {}; Icons.names().forEach(function (n) { var m = iconHtml(Icons(n, size, cls)).innerHTML; if (!(m in t)) t[m] = n; }); }
          var name = t[s.innerHTML];
          if (name) s.setAttribute('data-ic', name);
        });
      } finally { Icons.sets.use(now); }
    }
    var done = 0;
    all.forEach(function (s) {
      var name = s.getAttribute('data-ic'), from = s.getAttribute('data-set') || null;
      if (!name || from === now || !s.parentNode) return;
      var fresh = iconHtml(Icons(name, parseFloat(s.getAttribute('width')) || 16, iconClass(s)));
      if (!fresh) return;
      if (s.getAttribute('style')) fresh.setAttribute('style', s.getAttribute('style'));
      s.parentNode.replaceChild(fresh, s);
      done++;
    });
    return done;
  }
  // buttons a file draws without Icons() (the Quick Masks): the set's `slots` name them; the first drawing is kept on
  // the element and put back when the set goes
  function slotIcons() {
    var now = Icons.sets.active(), set = now ? Icons.sets.get(now) : null, slots = {}, n = 0;
    Icons.sets.list().forEach(function (id) { ((Icons.sets.get(id) || {}).slots || []).forEach(function (sl) { slots[sl.sel] = sl; }); });
    Object.keys(slots).forEach(function (sel) {
      var mine = set && (set.slots || []).filter(function (sl) { return sl.sel === sel; })[0];
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (b) {
        var v = mine ? b.getAttribute(mine.attr) : null, name = v ? mine.prefix + v.charAt(0).toUpperCase() + v.slice(1) : null;
        if (name && set.has(name)) {
          if (b.getAttribute('data-ic-slot') === now) return;
          if (b._icon0 == null) b._icon0 = b.innerHTML;
          b.innerHTML = Icons(name, mine.size || 16); b.setAttribute('data-ic-slot', now); n++;
        } else if (b._icon0 != null) { b.innerHTML = b._icon0; b._icon0 = null; b.removeAttribute('data-ic-slot'); n++; }
      });
    });
    return n;
  }
  function applyIcons(p) {
    if (!window.Icons || !Icons.sets) return false;
    var want = iconSetOf(p);
    if (want === Icons.sets.active()) return false;
    Icons.sets.use(want);
    return true;
  }
  function refreshIcons() {
    ['refreshTree', 'refreshHud', 'refreshLevelsPanel'].forEach(function (fn) { try { if (UI[fn]) UI[fn](); } catch (e) { console.warn(fn, e); } });
    try { redrawIcons(); slotIcons(); } catch (e) { console.warn('icons', e); }
    // furniture built a frame later (the Quick Masks are made by the viewport's own tick)
    setTimeout(function () { try { slotIcons(); } catch (e) { } }, 0);
    if (window.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(function () { try { slotIcons(); } catch (e) { } }); });
  }
  function apply(prev) {
    if (prev) App.ribbonTab = swTabOf(prev, App.ribbonTab);
    var p = defs[current] || {};
    var icons = applyIcons(p);   // rfLX: before anything is rebuilt
    if (UI.profileRibbonReset) UI.profileRibbonReset();
    if (UI.keys) UI.keys.reset();
    if (UI.setNavMap) { try { UI.setNavMap(p.mouse || null); } catch (e) { console.warn('setNavMap', e); } }   // lane profnav (ui-core.js)
    if (UI.setTreeDock) UI.setTreeDock(p.dock && p.dock.tree === 'right' ? 'right' : 'left');
    if (UI.setFrame) { try { UI.setFrame(p.frame || null); } catch (e) { console.warn('setFrame', e); } }   // lane mcframe (ui-panels.js)
    if (UI.refreshRibbon) UI.refreshRibbon();
    if (UI.refreshStatus) UI.refreshStatus();
    if (UI.refreshTaskPane) UI.refreshTaskPane();
    if (icons) refreshIcons();
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
    // lane mcpolish: { fn: 'action', arg } names a frame action (ui-panels.js FRAME_ACTIONS: label and icon there)
    var acts = UI.frameActions ? UI.frameActions() : [];
    function seeFn(x, where) {
      if (x.fn === 'action') { if (acts.indexOf(x.arg) < 0) bad.push(where + ': no frame action ' + x.arg); }
      else if (!x.label) bad.push(where + ': a menu / fn item without a label');
    }
    Object.keys(p.tabs || {}).forEach(function (dt) {
      (p.tabs[dt] || []).forEach(function (t) {
        (t.groups || []).forEach(function (g) {
          (g.items || []).forEach(function (x) {
            if (typeof x === 'string') see(x, dt + ' ' + t.name);
            else if (x.menu || x.fn) seeFn(x, dt + ' ' + t.name);
            else (x.stack || x.grid || x.items || []).forEach(function (c) { if (c && typeof c === 'object') seeFn(c, dt + ' ' + t.name); else see(c, dt + ' ' + t.name); });
          });
        });
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
    box.appendChild(el('p', { html: '<small>Moves the CommandManager tabs and names, the keys, the mouse and the window around the graphics area (Mastercam: File backstage, managers, status bar); what each command does and your files stay the same. The status bar names the profile while it is not SolidWorks.</small>' }));
    return box;
  }
  function openSetting() {
    // lane mcframe: a frame with a File backstage keeps the setting there (File ▸ Options), as Mastercam's Configuration
    if (UI.frameBackstage && UI.frameBackstage.has()) { UI.frameBackstage.open('options'); return; }
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

  // keys in a drawing: drawing-ui-panels.js's keydown asks UI.keys.profileActionFor(e) (ui-app.js) and runs its own
  // fit / delete / zoom / drawing command for a key this profile binds (lane profnav2)

  // ------------------------------------------------------------------ the profiles
  register({ id: 'solidworks', name: 'SolidWorks', note: 'CommandManager tabs, names, keys and mouse as SOLIDWORKS 2024 has them.' });

  // Mastercam 2024 / 2025 (design side). Facts from lane profnav's reference (scratchpad mastercam-reference.json):
  // tab and group names, command names, keys and mouse. A Mastercam name is used only where the command is that
  // command; Anvil's own and SolidWorks-only commands keep their SolidWorks names. Mastercam has no sheet metal and
  // no assemblies: Anvil's Sheet Metal tab stays whole, assemblies get the names, keys and mouse only. Unverified
  // entries (the reference marks them) are listed in anvil/docs/areas/ui-core.md *Interface profiles*.
  register({
    id: 'mastercam', name: 'Mastercam',
    note: 'The whole window as Mastercam lays it out: File backstage, Home / Wireframe / Solids / Drafting / Transform / View tabs above the buttons, Solids / Planes / Levels managers, the Mastercam status bar; Alt+F1 / Alt+1… keys, middle-drag rotate, Shift+middle pan.',
    // lane mcframe: the tabs, groups and names of the user's own Mastercam (screenshots of 2026-11-11, transcribed in the
    // lane's scratchpad mastercam-screens.txt): File (the backstage, not a tab of buttons), Home, Wireframe, Solids,
    // Sheet Metal (Anvil's own), Drafting, Transform, View, More. A Mastercam button with nothing behind it in Anvil is
    // left out (Surfaces, Model Prep, Mesh, Machine). Lane mcpolish built Cut, Copy Image, Undelete, Blank, Unzoom 50 % / 80 %,
    // Translucency, Show Axes / Gnomons, Show Grid / Snap to Grid, Z depth, 3D / 2D and the viewsheets (frame actions).
    tabs: {
      part: [
        { name: 'Home', groups: [
          { name: 'Clipboard', items: [{ menu: 'Edit', row: 'Paste', label: 'Paste', icon: 'pasteSketch', help: 'Paste the copied sketch entities (Edit ▸ Paste; in a sketch)' }, { stack: [{ fn: 'action', arg: 'cut' }, { menu: 'Edit', row: 'Copy', label: 'Copy', icon: 'copyEnt', help: 'Copy the selected sketch entities (Edit ▸ Copy; in a sketch)' }, { fn: 'action', arg: 'copyImage' }] }] },
          { name: 'Attributes', items: ['appearance', { stack: ['construction', { fn: 'action', arg: 'mode3d' }] }] },
          { name: 'Organize', items: [{ stack: [{ fn: 'action', arg: 'zDepth' }, { fn: 'action', arg: 'level' }, 'levels'] }] },   // lane mcpolish: Z depth, main level
          { name: 'Delete', items: [{ menu: 'Edit', row: 'Delete', label: 'Delete\nEntities', icon: 'deleteEnt', help: 'Delete the selection (Edit ▸ Delete, Del)' }, { stack: [{ fn: 'action', arg: 'undelete', label: 'Undelete Entity' }] }] },
          { name: 'Display', items: [{ fn: 'action', arg: 'hideUnhide' }, { stack: ['showArcCenters', 'showEndpoints', { fn: 'action', arg: 'blank' }] }, { stack: [{ fn: 'action', arg: 'unblank' }, 'vSketches', 'filter'] }] },   // lane arccenters: Arc Center Points above Endpoints, as Mastercam
          { name: 'Analyze', items: ['measure', { stack: ['check', 'sectionProps', 'mass'] }, { stack: ['clearance', 'draftAnalysis', 'zebra'] }] },
          { name: 'Add-Ins', items: [{ menu: 'Tools', row: 'Macro ▸ Run script…', label: 'Run\nAdd-In', icon: 'macro', help: 'Run a script on the model (Tools ▸ Macro ▸ Run script…)' }, { fn: 'search', label: 'Command\nFinder', icon: 'search', help: 'Find any command by its name (Mastercam or SolidWorks)' }] }
        ] },
        { name: 'Wireframe', groups: [
          // lane mcribbon: Mastercam's stacks of three labelled buttons, the third a split button holding the rest (Line Closest ˅,
          // Circle Edge Point ˅ in the screenshots), so the tab fits 1900 px with every label shown (the old icon grids needed 2421 px)
          { name: 'Sketch', items: ['sketch', { fly: 'relations', items: ['relations', 'addRelation', 'fullyDefine'] }, { stack: ['repairSketch', 'checkSketch', 'construction'] }] },
          { name: 'Points', items: ['point'] },
          { name: 'Lines', items: ['line', { stack: ['parallelLine', 'perpLine', { fly: 'lines', label: 'More Lines', items: ['tangentLine', 'bisectorLine', 'centerline', 'midline'] }] }] },
          { name: 'Arcs', items: ['circle', { stack: ['arc3', 'tarc', { fly: 'arcs', label: 'More Arcs', items: ['pcircle', 'arc', 'tangentCircle'] }] }] },
          { name: 'Splines', items: ['spline', { stack: ['styleSpline', 'eqnCurve'] }] },
          { name: 'Shapes', items: [{ fly: 'rects', label: 'Rectangle', items: ['rect', 'crect', 'rect3', 'crect3', 'parallelogram'] }, 'text', { stack: [{ fly: 'slots', label: 'Slots', items: ['slot', 'cslot', 'aslot3', 'aslot'] }, 'polygon', { fly: 'ellipses', label: 'Ellipses', items: ['ellipse', 'pellipse', 'parabola'] }] }] },
          { name: 'Curves', items: [{ stack: ['intersectCurve', 'projCurve', 'helix'] }] },
          { name: 'Modify', items: ['trim', 'splitEnt', { stack: ['extend', 'joinEnt', 'closeArc'] }, 'skFillet', 'skChamfer', 'offset', 'convert', { stack: ['mirrorEnt'] }] }
        ] },
        { name: 'Solids', groups: [
          { name: 'Create', items: ['extrude', { stack: ['revolve', 'loft', 'sweep'] }, { stack: ['boundary', 'cut', 'revolveCut'] }, { stack: ['sweptCut', 'loftedCut', 'boundaryCut'] }, 'holeWizard', { stack: ['lpattern', 'cpattern', 'mirror'] }] },
          { name: 'Modify', items: [{ stack: ['fillet', 'shell', 'draft'] }, 'chamfer', { stack: ['intersect', 'rib', 'wrap'] }] },
          { name: 'Reference', items: [{ fly: 'refgeo', label: 'Reference\nGeometry', items: ['plane', 'refAxis', 'csys', 'refPoint'] }] }
        ] },
        { name: 'Sheet Metal', sw: 'Sheet Metal', captions: ['Create', 'Flanges', 'Cut', 'Flat Pattern'] },
        { name: 'Drafting', groups: [
          { name: 'Dimension', items: ['dim', { stack: ['horizDim', 'vertDim', { fly: 'dims', label: 'More Dimensions', items: ['angRunDim', 'chamferDim', 'pathLengthDim', 'autodim'] }] }] },
          { name: 'Ordinate', items: [{ stack: ['ordinateDim', 'ordinateH', 'ordinateV'] }] }
        ] },
        { name: 'Transform', sw: 'Transform' },
        { name: 'View', groups: [
          // lane mcpolish: the groups of the user's screenshots, cut to fit a 1600 px window with every label shown:
          // Zoom (Fit; Window, Unzoom 50 %, Unzoom 80 %; Previous View is Alt+P and on More), Appearance (Wireframe,
          // Outline Shaded, Material; Translucency …), Display (Show Axes, Show Gnomons), Grid (Show Grid, Snap to Grid);
          // scene, background, theme, origins and sketch dimensions are Anvil's own toggles and go to More
          { name: 'Zoom', items: ['vZoomFit', { stack: ['zoomArea', { fn: 'action', arg: 'unzoom50' }, { fn: 'action', arg: 'unzoom80' }] }] },
          { name: 'Graphics View', items: ['vTop', { grid: ['vIso', 'vFront', 'vBack', 'vBottom', 'vRight', 'vLeft', 'vNormalTo'] }, 'section'] },
          { name: 'Appearance', items: [{ stack: ['dsWireframe', 'dsShadedEdges', 'dsShaded'] }, { fn: 'action', arg: 'material' }, { stack: [{ fn: 'action', arg: 'translucency' }, 'dsHLR', 'dsHLV'] }] },
          { name: 'Display', items: [{ stack: [{ fn: 'action', arg: 'showAxes' }, { fn: 'action', arg: 'showGnomons' }, 'vPlanes'] }] },
          { name: 'Grid', items: [{ stack: [{ fn: 'action', arg: 'showGrid' }, { fn: 'action', arg: 'snapGrid' }] }] },
          { name: 'Managers', items: [{ stack: [{ fn: 'manager', arg: 'solids', label: 'Solids', icon: 'tree' }, { fn: 'manager', arg: 'planes', label: 'Planes', icon: 'plane' }, { fn: 'manager', arg: 'levels', label: 'Levels', icon: 'levels' }] }, { stack: [{ fn: 'manager', arg: 'recent', label: 'Recent Functions', icon: 'recentFns' }] }] },
          { name: 'Viewsheets', items: [{ stack: [{ fn: 'action', arg: 'vsOnOff' }, { fn: 'action', arg: 'vsNew' }] }, { stack: [{ fn: 'action', arg: 'vsSave' }, { fn: 'action', arg: 'vsRestore' }] }] }   // lane mcpolish
        ] }
      ],
      // lane mcpolish: an assembly keeps SolidWorks' Assembly tab whole (Mastercam has no assemblies), with Home and View
      assembly: [
        { name: 'Home', groups: [
          { name: 'Clipboard', items: [{ fn: 'action', arg: 'copyImage' }] },
          { name: 'Display', items: [{ fn: 'action', arg: 'hideUnhide' }, { stack: [{ fn: 'action', arg: 'blank' }, { fn: 'action', arg: 'unblank' }, 'hideshow'] }] },
          { name: 'Analyze', items: ['measure', { stack: ['mass', 'sectionProps', 'check'] }, { stack: ['interference', 'clearance'] }] }
        ] },
        { name: 'Assembly', sw: 'Assembly', captions: ['Components', 'Position', 'Show', 'Pattern and Move'] },
        { name: 'View', groups: [
          { name: 'Zoom', items: ['vZoomFit', { stack: ['zoomArea', 'prevView'] }, { stack: [{ fn: 'action', arg: 'unzoom50' }, { fn: 'action', arg: 'unzoom80' }] }] },
          { name: 'Graphics View', items: ['vTop', { grid: ['vIso', 'vFront', 'vBack', 'vBottom', 'vRight', 'vLeft', 'vNormalTo'] }, 'section'] },
          { name: 'Appearance', items: [{ stack: ['dsWireframe', 'dsShadedEdges', { fn: 'action', arg: 'material' }] }, { stack: ['dsShaded', 'dsHLR', 'dsHLV'] }, { stack: [{ fn: 'action', arg: 'translucency' }, 'scene'] }] },
          { name: 'Display', items: [{ stack: [{ fn: 'action', arg: 'showAxes' }, { fn: 'action', arg: 'showGnomons' }, 'vOrigins'] }, { stack: ['vPlanes'] }] },
          { name: 'Viewsheets', items: [{ stack: [{ fn: 'action', arg: 'vsOnOff' }, { fn: 'action', arg: 'vsNew' }] }, { stack: [{ fn: 'action', arg: 'vsSave' }, { fn: 'action', arg: 'vsRestore' }] }] }
        ] }
      ],
      drawing: [
        { name: 'View Layout', sw: 'View Layout', captions: ['Views', 'Cut Views', 'Modify Views'] },
        { name: 'Drafting', groups: [
          { name: 'Dimension', items: ['dim', { grid: ['horizDim', 'vertDim', 'baselineDim', 'angRunDim', 'chamferDim', 'pathLengthDim'] }, 'modelItems'] },
          { name: 'Ordinate', items: [{ stack: ['ordinateDim', 'ordinateH', 'ordinateV'] }] },
          { name: 'Annotate', items: ['note', 'holeTable', { grid: ['areaHatch', 'multiJogLeader', 'magLine', 'flagNote', 'centerMark', 'centerline', 'holeCallout'] }] },
          { name: 'Balloons', items: [{ stack: ['balloon', 'autoBalloon', 'stackBalloon'] }] },
          { name: 'Symbols', items: [{ grid: ['surfaceFinish', 'datumFeature', 'gtol', 'weldSymbol', 'datumTarget', 'cosmeticThread', 'dowelPin', 'revisionSymbol', 'revisionCloud'] }] },
          { name: 'Tables', items: [{ grid: ['bom', 'revTable', 'generalTable', 'bendTable', 'punchTable'] }, 'docProps'] }
        ] },
        { name: 'Sketch', sw: 'Sketch' },
        { name: 'Sheet Format', sw: 'Sheet Format' }
      ]
    },
    tabAlias: { part: { Sketch: 'Wireframe', Features: 'Solids', Evaluate: 'Home' }, drawing: { Annotation: 'Drafting' }, assembly: { Evaluate: 'Home' } },
    labels: {
      extrude: 'Extrude', revolve: 'Revolve', sweep: 'Sweep', loft: 'Loft', holeWizard: 'Hole', fillet: 'Constant\nFillet', chamfer: 'One Distance\nChamfer',
      lpattern: 'Rectangular\nPattern', cpattern: 'Circular\nPattern', draft: 'Draft\nFaces',
      line: 'Line\nEndpoints', parallelLine: 'Line Parallel', perpLine: 'Line Perpendicular', bisectorLine: 'Line Bisect',
      point: 'Point\nPosition', rect: 'Rectangle', circle: 'Circle\nCenter Point', pcircle: 'Circle Edge Point', arc: 'Arc Polar', arc3: 'Arc 3 Points', tarc: 'Arc Tangent',
      spline: 'Spline\nManual', text: 'Create\nLetters', trim: 'Dynamic\nTrim', splitEnt: 'Break Two\nPieces', joinEnt: 'Join Entities', skFillet: 'Fillet Entities', skChamfer: 'Chamfer Entities',
      offset: 'Offset\nEntity', convert: 'Project', closeArc: 'Close Arc', showArcCenters: 'Arc Center Points', showEndpoints: 'Endpoints',
      dim: 'Smart\nDimension', horizDim: 'Horizontal', vertDim: 'Vertical', ordinateDim: 'Ordinate', baselineDim: 'Baseline', holeTable: 'Hole\nTable', areaHatch: 'Cross Hatch', multiJogLeader: 'Leader',
      measure: 'Analyze\nDistance', mass: 'Analyze Solid Properties', check: 'Check Solid', sectionProps: '2D Area',
      vZoomFit: 'Fit', zoomArea: 'Window', vTop: 'Top', dsShadedEdges: 'Outline Shaded', vFeatureTree: 'Solids Manager', levels: 'Levels', vLevels: 'Levels Manager'
    },
    // lane mcframe: the window itself (ui-panels.js UI.setFrame)
    frame: {
      ribbon: { tabsOnTop: true, fileTab: true, qat: true, captions: true },
      menubar: false,
      managers: { tabs: ['solids', 'planes', 'levels', 'config', 'recent'], titles: { solids: 'Solids', planes: 'Planes', levels: 'Levels', config: 'Configurations', recent: 'Recent Functions' } },   // lane mcpolish: config (shown while the document has configurations)
      functionTitles: { extrude: 'Solid Extrude', revolve: 'Revolve', cut: 'Solid Extrude', fillet: 'Constant Fillet', chamfer: 'One Distance Chamfer', holeWizard: 'Hole', shell: 'Shell', draft: 'Draft Faces', lpattern: 'Rectangular Pattern', cpattern: 'Circular Pattern' },
      status: ['section', 'selected', 'xyz', 'mode', 'cplane', 'tplane', 'wcs', 'styles'],
      viewsheets: true,   // lane mcpolish: the viewsheet strip under the graphics window (ui-panels.js vsRender)
      // lane mctheme: measured from the user's screenshots (light): File tab / status bar #2b579a, manager title #0d64c8,
      // selected row #0078d4 + white, grounds white, hairlines #d4d4d4, table grid #f0f0f0, boxed tabs #a2a2a2, text #3b3b3b,
      // greyed text #a0a0a0 and fields #f0f0f0. Not in the screenshots (Office-style family, chosen): hover / pressed blues,
      // control borders darkened to 3:1, the whole dark set (Mastercam has no dark theme: its blue, dark grounds).
      theme: { name: 'mastercam', vars: {
        light: { '--mc-blue': '#2b579a', '--mc-blue-text': '#ffffff', '--mc-blue-hover': '#3e6aae', '--mc-blue-press': '#1f4479', '--mc-title': '#0d64c8',
          '--mc-ribbon': '#ffffff', '--mc-strip': '#ffffff', '--mc-line': '#d4d4d4', '--mc-tab-on': '#ffffff', '--mc-tab-line': '#a2a2a2',
          '--mc-hover': '#dce8f6', '--mc-hover-line': '#a9c6e8', '--mc-press': '#c3d9f1', '--mc-press-line': '#7da2ce',
          '--mc-panel': '#ffffff', '--mc-raised': '#ffffff', '--mc-mgr-tab': '#ffffff', '--mc-grid': '#f0f0f0',
          '--mc-text': '#3b3b3b', '--mc-ink': '#000000', '--mc-muted': '#6b6b6b', '--mc-disabled': '#a0a0a0', '--mc-launcher': '#797979',
          '--mc-field': '#ffffff', '--mc-field-line': '#8f8f8f', '--mc-field-off': '#f0f0f0', '--mc-field-ro': '#c0c0c0',
          '--mc-accent': '#0078d4', '--mc-accent-text': '#ffffff', '--mc-accent-hover': '#106ebe', '--mc-focus': '#0078d4',
          '--mc-scroll': '#c1c1c1', '--mc-scroll-hover': '#a6a6a6', '--mc-backdrop': 'rgba(0, 0, 0, 0.3)', '--mc-sheet-bg': '#c8c8c8',
          '--mc-qm': 'rgba(221, 221, 221, 0.35)', '--mc-qm-hover': 'rgba(221, 221, 221, 0.6)', '--mc-qm-on': 'rgba(0, 120, 212, 0.55)', '--mc-qm-ink': '#1f4e8c', '--mc-qm-ink-on': '#ffffff',
          '--mc-msg-bg': '#fff8dc', '--mc-msg-line': '#e6d28a', '--mc-msg-text': '#4a3c00' },
        dark: { '--mc-blue': '#2b579a', '--mc-blue-text': '#ffffff', '--mc-blue-hover': '#3e6aae', '--mc-blue-press': '#1f4479', '--mc-title': '#6aaaf2',
          '--mc-ribbon': '#2b2b2b', '--mc-strip': '#2b2b2b', '--mc-line': '#474747', '--mc-tab-on': '#2b2b2b', '--mc-tab-line': '#6a6a6a',
          '--mc-hover': '#2e4560', '--mc-hover-line': '#4f78a8', '--mc-press': '#2a5384', '--mc-press-line': '#6a9bd4',
          '--mc-panel': '#262626', '--mc-raised': '#2f2f2f', '--mc-mgr-tab': '#262626', '--mc-grid': '#353535',
          '--mc-text': '#e4e4e4', '--mc-ink': '#ffffff', '--mc-muted': '#a8a8a8', '--mc-disabled': '#6e6e6e', '--mc-launcher': '#a0a0a0',
          '--mc-field': '#1e1e1e', '--mc-field-line': '#7a7a7a', '--mc-field-off': '#2c2c2c', '--mc-field-ro': '#3a3a3a',
          '--mc-accent': '#0a6fc2', '--mc-accent-text': '#ffffff', '--mc-accent-hover': '#1a80d6', '--mc-focus': '#4ea3ee',
          '--mc-scroll': '#555555', '--mc-scroll-hover': '#777777', '--mc-backdrop': 'rgba(0, 0, 0, 0.55)', '--mc-sheet-bg': '#3a3a3a',
          '--mc-qm': 'rgba(221, 221, 221, 0.35)', '--mc-qm-hover': 'rgba(221, 221, 221, 0.6)', '--mc-qm-on': 'rgba(0, 120, 212, 0.55)', '--mc-qm-ink': '#1f4e8c', '--mc-qm-ink-on': '#ffffff',
          '--mc-msg-bg': '#3b3520', '--mc-msg-line': '#6b5a1e', '--mc-msg-text': '#f0d27a' }
      } }
    },
    // rfLX: the icons (icons-mastercam.js); applied by applyIcons above
    icons: { set: 'mastercam' },
    // read by lane mcdirect (ui-sketch*.js, ui-core.js); written here only
    wireframe: { direct: true, plane: 'Top' },
    // lane mctheme: gradient #141414 -> #c0c0c0 (linear; measured top, middle, bottom), the Home tab's Attributes swatches
    // (wireframe lime, solid grey, surface orange) and the gnomon's X red / Y green (measured); Z blue is not in the
    // screenshots (from memory)
    viewport: { background: ['#141414', '#c0c0c0'], labels: true, headsUp: false, quickMasks: true, selectionBar: false, contextMenu: 'mastercam',   // user 2026-11-12: no selection bar over the graphics window; a profile that sets it true still gets it
      colors: { wireframe: '#9ef713', solid: '#808080', surface: '#f4844d', gnomon: ['#c90707', '#0b8a09', '#1f5fd0'] } },
    keys: {
      vTop: 'Alt+1', vFront: 'Alt+2', vBack: 'Alt+3', vBottom: 'Alt+4', vRight: 'Alt+5', vLeft: 'Alt+6', vIso: 'Alt+7', prevView: 'Alt+P',
      fit: 'Alt+F1', zoomArea: 'F1', vOrigins: 'F9', levels: 'Alt+Z', vFeatureTree: 'Alt+I', trim: 'Shift+T',
      zoomIn: 'PageUp', zoomOut: ['Alt+F2', 'PageDown']
    },
    mouse: { drag: { 'middle': 'rotate', 'shift+middle': 'pan', 'ctrl+middle': 'pan', 'alt+left': 'rotate', 'right': null }, wheel: { zoom: 1, about: 'cursor' }, middleDouble: 'fit' },
    dock: { tree: 'left' }
  });

  UI.Profiles = { register: register, unregister: unregister, list: list, get: get, def: def, active: active, set: set, onChange: onChange, labelFor: labelFor, tabOf: tabOf, check: check,
    optionsSection: optionsSection, openSetting: openSetting, storageKey: KEY,
    icons: { set: function () { return window.Icons && Icons.sets ? Icons.sets.active() : null; }, redraw: function () { return redrawIcons() + slotIcons(); } } };

  // lane profnav2: the saved profile's mouse at once (ui-core.js has loaded), so the graphics area navigates the
  // profile's way from the first frame; boot below lays out the rest once every file is in
  (function earlyMouse() {
    var id = null;
    try { id = localStorage.getItem(KEY); } catch (e) { }
    if (id && defs[id] && UI.setNavMap) { try { UI.setNavMap(defs[id].mouse || null); } catch (e) { console.warn('setNavMap', e); } }
  })();
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
