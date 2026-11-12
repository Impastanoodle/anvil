// rfLK (2026-11-11, lane mcframe): choosing Mastercam turns the whole window into Mastercam's (ui-panels.js
// UI.setFrame, the profile's `frame` in ui-profiles.js). The user: "when you click ''mastercam'' setting user should
// have a holy shit this just turned into mastercam experience". By mouse: Mastercam in Tools > Options, no menu bar,
// tabs above the buttons, the File backstage (Open, Save As, Recent, Options), the manager panel with its tabs at the
// bottom (Solids, Planes, Levels, Recent Functions), a Planes click changes the view, Solids > Extrude opens a function
// panel with the Mastercam name and builds the same volume, the status bar (cursor X Y Z, display styles), captions under
// every group, every ribbon and menu command of a part, an assembly and a drawing reachable, and SolidWorks back exactly
// as it was after round trips with a part, a sketch, an assembly, a drawing, a PropertyManager and the backstage open.
(function () {
  var RFLK_BOX = "p.sketch('Front').rect(0, 0, 60, 40).extrude(20)";
  function rfLKEv(el, type, x, y, extra) {
    el.dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' || type === 'click' ? 0 : 1, clientX: x, clientY: y, detail: 1 }, extra || {})));
  }
  // a real click at the middle of an element (press, release, click)
  async function rfLKClick(el, label) {
    assert(el, 'nothing to click: ' + (label || ''));
    var r = el.getBoundingClientRect();
    assert(r.width > 0 && r.height > 0, (label || el.textContent) + ' is not shown');
    var x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    var hit = D.elementFromPoint(x, y);
    assert(hit && (hit === el || el.contains(hit)), (label || el.textContent) + ' is covered by ' + (hit && (hit.id || hit.className || hit.tagName)));
    rfLKEv(el, 'mousedown', x, y); rfLKEv(el, 'mouseup', x, y); rfLKEv(el, 'click', x, y);
    await wait(30);
  }
  function rfLKBtn(label) {
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') === label && b.offsetWidth; })[0] || null;
  }
  function rfLKTabs() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return !t.classList.contains('off'); }); }
  async function rfLKTab(name) { await rfLKClick(rfLKTabs().filter(function (t) { return t.textContent === name; })[0], 'tab ' + name); }
  function rfLKShown(el) { return !!el && el.getClientRects().length > 0 && W.getComputedStyle(el).display !== 'none' && W.getComputedStyle(el).visibility !== 'hidden'; }
  // the state of the window that SolidWorks must get back exactly: every tab's buttons, the tab strip, the menu bar,
  // the FeatureManager tabs, the status bar text, <html> and #app attributes
  async function rfLKState() {
    var out = { tabs: $('ribbon-tabs').innerHTML, by: {}, menus: $('menus').innerHTML, menusShown: rfLKShown($('menus')), fmTabs: $('fm-tabs').innerHTML, fmShown: rfLKShown($('fm-tabs')),
      app: $('app').className, html: [D.documentElement.getAttribute('data-profile'), D.documentElement.getAttribute('style')].join('|'),
      left: Array.prototype.map.call($('left').children, function (c) { return c.id || c.className; }).join(','),
      status: Array.prototype.map.call($('statusbar').children, function (c) { return c.id + ':' + rfLKShown(c); }).join(',') };
    out.fmTabs = Array.prototype.map.call($('fm-tabs').children, function (b) { return b.getAttribute('data-tab') + ':' + b.className; }).join(',');
    var back = UI.App.ribbonTab;
    var names = rfLKTabs().map(function (t) { return t.textContent; });
    for (var i = 0; i < names.length; i++) { await rfLKTab(names[i]); out.by[names[i]] = $('ribbon-buttons').innerHTML; }
    await rfLKTab(back);
    return out;
  }
  function rfLKDiff(a, b) {
    var d = [];
    Object.keys(a).forEach(function (k) {
      if (k === 'by') { Object.keys(a.by).concat(Object.keys(b.by)).forEach(function (t) { if (a.by[t] !== b.by[t]) d.push('tab ' + t); }); }
      else if (a[k] !== b[k]) d.push(k + ': ' + String(a[k]).slice(0, 80) + ' / ' + String(b[k]).slice(0, 80));
    });
    return d;
  }
  function rfLKLeftovers() {
    var ids = ['mc-file', 'mc-backstage', 'mc-mgr-head', 'mc-mgr-tabs', 'mc-solids', 'mc-planes', 'mc-recent', 'mc-status', 'mc-viewsheets'].filter(function (id) { return D.getElementById(id); });
    if (D.querySelector('#ribbon > .mc-captions, .mc-fn-title')) ids.push('captions / fn title');
    if (D.documentElement.hasAttribute('data-profile')) ids.push('html[data-profile]');
    if (/--mc-/.test(D.documentElement.getAttribute('style') || '')) ids.push('html style');
    if (/\bmc-/.test($('app').className) || $('left').classList.contains('mc-fn')) ids.push('#app / #left classes');
    return ids;
  }
  // Tools > Options > Interface by mouse (menu bar) and a profile picked there
  async function rfLKPickInOptions(id) {
    var tools = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (li) { return /^Tools/.test(li.textContent.trim()); })[0];
    assert(tools && rfLKShown(tools), 'no Tools menu');
    var r = tools.getBoundingClientRect();
    rfLKEv(tools, 'mousedown', r.left + 5, r.top + 5);
    var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /^\s*Options…/.test(m.textContent) && m.textContent.indexOf('▸') < 0; })[0];
    assert(row, 'no Tools > Options… row');
    var rr = row.getBoundingClientRect();
    rfLKEv(row, 'mouseup', rr.left + 10, rr.top + 5);
    await wait(60);
    var radio = D.querySelector('[data-role="interface-profiles"] input[data-profile="' + id + '"]');
    await rfLKClick(radio, id + ' radio');
    await wait(60);
  }
  var rfLKSw = null;

  step('rfLK: (a) Mastercam in Tools > Options by mouse: no menu bar, File first and the tabs above the buttons, a caption under every group, the Quick Access Toolbar in the title row, the manager panel with its tabs at the bottom, the blue status bar', async function () {
    anvil.profile('solidworks');
    await anvil.newPart(); await idle(); await anvil.run(RFLK_BOX); await idle();
    UI.App.ribbonTab = 'Features'; UI.refreshRibbon(); await wait(30);
    rfLKSw = await rfLKState();
    assert(!rfLKLeftovers().length, 'frame pieces under SolidWorks: ' + rfLKLeftovers().join(', '));
    await rfLKPickInOptions('mastercam');
    assert(UI.Profiles.active() === 'mastercam' && UI.frameDef(), 'profile ' + UI.Profiles.active());
    if (!$('tp-panel').hidden) UI.closeTaskPane();
    await wait(60);
    assert(!rfLKShown($('menus')), 'the menu bar is still shown');
    var tabs = $('ribbon-tabs').getBoundingClientRect(), btns = $('ribbon-buttons').getBoundingClientRect();
    assert(tabs.bottom <= btns.top + 1, 'tabs not above the buttons: tabs ' + tabs.top + '-' + tabs.bottom + ', buttons from ' + btns.top);
    var file = $('mc-file');
    assert(file && $('ribbon-tabs').firstChild === file && file.textContent === 'File', 'no File tab first');
    var names = rfLKTabs().map(function (t) { return t.textContent; }).join();
    assert(names === 'Home,Wireframe,Solids,Sheet Metal,Drafting,Transform,View,More', 'tabs ' + names);
    var rh = $('ribbon').getBoundingClientRect().height;
    assert(rh > 85 && rh < 125, 'ribbon height ' + rh);
    // the title row: New, Open, Save, Print, Undo, Redo shown; the SolidWorks-only buttons hidden
    ['std-new', 'std-open', 'std-save', 'std-print', 'std-undo', 'std-redo'].forEach(function (id) { assert(rfLKShown($(id)), id + ' hidden'); });
    ['std-select', 'std-rebuild', 'std-options'].forEach(function (id) { assert(!rfLKShown($(id)), id + ' shown'); });
    // the managers: big title on top, tabs at the bottom of the left column
    var L = $('left').getBoundingClientRect(), mt = $('mc-mgr-tabs').getBoundingClientRect(), hd = $('mc-mgr-head').getBoundingClientRect();
    assert(hd.top - L.top < 4 && L.bottom - mt.bottom < 4 && mt.top > L.top + L.height / 2, 'manager tabs at ' + mt.top + ' in ' + L.top + '-' + L.bottom);
    assert(!rfLKShown($('fm-tabs')), 'SolidWorks FeatureManager tabs shown');
    var tabTxt = Array.prototype.filter.call($('mc-mgr-tabs').children, function (b) { return !b.hidden; }).map(function (b) { return b.textContent; }).join();   // lane mcpolish: Configurations only with configurations
    assert(tabTxt === 'Solids,Planes,Levels,Recent Functions', 'manager tabs ' + tabTxt);
    // the look: html data-profile, the File tab and the status bar in the profile's blue
    assert(D.documentElement.getAttribute('data-profile') === 'mastercam', 'data-profile');
    var sb = W.getComputedStyle($('statusbar')).backgroundColor, fb = W.getComputedStyle(file).backgroundColor;
    assert(sb === fb && /rgb\(43, 87, 154\)/.test(sb), 'status bar ' + sb + ', File ' + fb);   // lane mctheme: #2b579a, measured in the user's screenshots (was #1f5aa6)
    var st = UI.frameStatus();
    ['section', 'selected', 'x', 'y', 'z', 'cplane', 'tplane', 'wcs', 'styles'].forEach(function (k) { assert(k in st, 'status bar has no ' + k + ': ' + JSON.stringify(st)); });
    assert(/SECTION VIEW: OFF/.test(st.section) && /SELECTED ENTITIES: \d/.test(st.selected) && /^CPLANE: Top/.test(st.cplane), JSON.stringify(st));
    assert(D.querySelector('#status-right .st-profile'), 'the profile chip');
    // captions on every tab of the part
    var bad = [];
    for (var i = 0; i < rfLKTabs().length; i++) {
      var t = rfLKTabs()[i].textContent;
      await rfLKTab(t); await wait(40);
      var caps = UI.frameCaptions(), items = UI.ribbonShownItems().filter(function (it) { return !it.sep; });
      if (!caps.length || items.some(function (it) { return !it.group; })) bad.push(t + ' (' + caps.join('/') + ')');
    }
    assert(!bad.length, 'tabs without a caption under every group: ' + bad.join(', '));
    await rfLKTab('Home');
    return 'tabs ' + names + ', ribbon ' + Math.round(rh) + ' px, status ' + sb;
  });

  step('rfLK: (b) File opens the backstage over the window; Info, Open (Open… runs File > Open), Save As (runs Save As), Recent (Browse Recent Documents… opens its dialog), Options (the Interface setting), Help; Esc and the back arrow return', async function () {
    var calls = [], o1 = UI.fileOpen, o2 = UI.fileSaveAs;
    UI.fileOpen = function () { calls.push('open'); };
    UI.fileSaveAs = function () { calls.push('saveAs'); };
    try {
      await rfLKClick($('mc-file'), 'File');
      var bs = $('mc-backstage');
      assert(bs && UI.frameBackstage.isOpen(), 'no backstage');
      var r = bs.getBoundingClientRect();
      assert(r.left <= 0 && r.top <= 0 && r.width >= W.innerWidth - 1 && r.height >= W.innerHeight - 1, 'backstage does not cover the window');
      var nav = Array.prototype.map.call(bs.querySelectorAll('.bs-nav-item'), function (b) { return b.textContent; }).join();
      assert(nav === 'Info,New,Open,Save,Save As,Convert / Export,Print,Recent,Options,Help', 'nav ' + nav);
      assert(/Part1|Name/.test(bs.querySelector('.bs-page').textContent), 'Info page');
      function navBtn(t) { return Array.prototype.filter.call(bs.querySelectorAll('.bs-nav-item'), function (b) { return b.textContent === t; })[0]; }
      function rowBtn(t) { return bs.querySelector('.bs-row[data-row="' + t + '"]'); }
      // Open
      await rfLKClick(navBtn('Open'));
      await rfLKClick(rowBtn('Open…'), 'Open…');
      assert(calls.join() === 'open' && !UI.frameBackstage.isOpen(), 'Open…: ' + calls + ' open ' + UI.frameBackstage.isOpen());
      // Save As
      await rfLKClick($('mc-file')); bs = $('mc-backstage');
      await rfLKClick(navBtn('Save As'));
      await rfLKClick(rowBtn('Save As…'), 'Save As…');
      assert(calls.join() === 'open,saveAs', 'Save As…: ' + calls);
      // Recent: the Browse Recent Documents dialog
      await rfLKClick($('mc-file')); bs = $('mc-backstage');
      await rfLKClick(navBtn('Recent'));
      await rfLKClick(rowBtn('Browse Recent Documents…'), 'Browse Recent Documents…');
      await wait(60);
      assert(!$('modal').hidden && !UI.frameBackstage.isOpen(), 'no Recent Documents dialog');
      UI.closeModal(); await wait(20);
      // Convert / Export lists the exports; Help lists Help's rows
      await rfLKClick($('mc-file')); bs = $('mc-backstage');
      await rfLKClick(navBtn('Convert / Export'));
      assert(rowBtn('Export STEP AP214…') && rowBtn('Save As DXF / DWG…') && rowBtn('Export STL…'), 'exports: ' + bs.querySelector('.bs-page').textContent.slice(0, 200));
      await rfLKClick(navBtn('Help'));
      assert(rowBtn('About Anvil') && rowBtn('Keyboard shortcuts'), 'Help page');
      // Options: Configuration with the Interface setting
      await rfLKClick(navBtn('Options'));
      var sec = bs.querySelector('[data-role="interface-profiles"]');
      assert(sec && sec.querySelector('input[data-profile="mastercam"]').checked, 'Options: no Interface setting');
      // Esc returns; the back arrow too
      var ev = new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      (D.activeElement || D.body).dispatchEvent(ev); await wait(20);
      assert(!UI.frameBackstage.isOpen() && !$('mc-backstage'), 'Esc did not close the backstage');
      await rfLKClick($('mc-file'));
      await rfLKClick(D.querySelector('#mc-backstage .bs-back'), 'back arrow');
      assert(!$('mc-backstage'), 'the back arrow did not close it');
      // the status bar chip opens the setting in the backstage
      await rfLKClick(D.querySelector('#status-right .st-profile'), 'profile chip');
      assert(UI.frameBackstage.page() === 'options' && D.querySelector('#mc-backstage [data-role="interface-profiles"]'), 'chip: page ' + UI.frameBackstage.page());
      UI.frameBackstage.close();
    } finally { UI.fileOpen = o1; UI.fileSaveAs = o2; UI.frameBackstage.close(); if (!$('modal').hidden) UI.closeModal(); }
    return calls.join(', ');
  });

  step('rfLK: (c) the managers by mouse: Solids lists the solid and its operations, Planes the plane table (a click in G changes the view, in C the construction plane), Levels the Levels Manager, Recent Functions the last commands (a click runs one again)', async function () {
    var tab = function (n) { return D.querySelector('#mc-mgr-tabs [data-mgr="' + n + '"]'); };
    await rfLKClick(tab('solids'));
    var rows = Array.prototype.map.call(D.querySelectorAll('#mc-solids .mc-sol-row'), function (r) { return r.textContent; });
    assert(rfLKShown($('mc-solids')) && /^Solid/.test(rows[0]) && rows.indexOf('Boss-Extrude1') > 0 && rows.indexOf('Sketch1') > rows.indexOf('Boss-Extrude1'), 'Solids: ' + rows.join(' | '));
    assert(D.querySelector('#mc-mgr-head .mc-mgr-title').textContent === 'Solids', 'title');
    // a click on an operation selects it
    await rfLKClick(D.querySelector('#mc-solids [data-fid]'), 'operation row');
    assert(UI.App.sel && UI.App.sel.kind === 'feature', 'operation not selected');
    assert(/SELECTED ENTITIES: 1/.test(UI.frameStatus().selected), 'status ' + UI.frameStatus().selected);
    UI.App.sel = null; UI.updateHighlights(); UI.refreshTree();
    // Planes
    await rfLKClick(tab('planes'));
    var names = Array.prototype.map.call(D.querySelectorAll('#mc-planes tr[data-plane]'), function (r) { return r.getAttribute('data-plane'); }).join();
    assert(rfLKShown($('mc-planes')) && names === 'Top,Front,Right,Back,Bottom,Left,Isometric', 'planes ' + names);
    var heads = Array.prototype.map.call(D.querySelectorAll('#mc-planes th'), function (t) { return t.textContent; }).join();
    assert(heads === ',Name,G,WCS,C,T', 'columns ' + heads);
    var views = [], orig = UI.setView;
    UI.setView = function (n) { views.push(n); return orig.apply(this, arguments); };
    try { await rfLKClick(D.querySelector('#mc-planes tr[data-plane="Front"] [data-col="g"]'), 'G of Front'); } finally { UI.setView = orig; }
    assert(views.join() === 'Front' && UI.framePlanes().g === 'Front', 'G click: ' + views);
    await rfLKClick(D.querySelector('#mc-planes tr[data-plane="Right"] [data-col="c"]'), 'C of Right');
    assert(UI.framePlanes().c === 'Right' && /CPLANE: Right/.test(UI.frameStatus().cplane), 'C click: ' + JSON.stringify(UI.framePlanes()) + ' ' + UI.frameStatus().cplane);
    assert(D.querySelector('#mc-planes tr[data-plane="Right"]').classList.contains('current'), 'current row');
    await rfLKClick(D.querySelector('#mc-planes tr[data-plane="Top"] [data-col="c"]'), 'C of Top');
    // Levels: the Levels Manager hosted here
    await rfLKClick(tab('levels'));
    assert(rfLKShown($('levels-panel')) && D.querySelector('#levels-panel #lvl-grid') && !rfLKShown($('mc-planes')) && !rfLKShown($('mc-solids')), 'Levels Manager not shown');
    assert(D.querySelector('#mc-mgr-head .mc-mgr-title').textContent === 'Levels', 'Levels title');
    // Recent Functions: Fit then Zoom to Area from the View tab; the list has both, a click runs one again
    await rfLKTab('View');
    await rfLKClick(rfLKBtn('Fit'), 'Fit');
    await rfLKClick(tab('recent'));
    var rec = Array.prototype.map.call(D.querySelectorAll('#mc-recent .mc-recent-row'), function (b) { return b.getAttribute('data-cmd'); });
    assert(rec[0] === 'vZoomFit', 'recent ' + rec.join());
    var fits = 0, zf = UI.zoomToFit;
    UI.zoomToFit = function () { fits++; return zf.apply(this, arguments); };
    try { await rfLKClick(D.querySelector('#mc-recent .mc-recent-row'), 'recent Fit'); } finally { UI.zoomToFit = zf; }
    assert(fits === 1, 'the recent function did not run');
    await rfLKClick(tab('solids'));
    return 'solids ' + rows.length + ' rows, planes ' + names.split(',').length + ', recent ' + rec.join('/');
  });

  step('rfLK: (d) Solids > Extrude opens the function panel titled Solid Extrude (round OK / Cancel at the top, the managers hidden) and its OK builds the same volume as SolidWorks\' Extruded Boss/Base', async function () {
    async function boss(tab, label) {
      await anvil.newPart(); await idle();
      await anvil.run("p.sketch('Front').rect(0, 0, 60, 40)"); await idle();
      var sk = UI.App.model.features[UI.App.model.features.length - 1];
      UI.App.sel = { kind: 'feature', id: sk.id }; UI.refreshTree();
      await rfLKTab(tab);
      await rfLKClick(rfLKBtn(label), label);
      await wait(40);
      assert(UI.hasPM(), label + ': no PropertyManager');
      var title = UI.frameFunctionTitle ? UI.frameFunctionTitle() : null;
      var info = { title: title, fn: $('left').classList.contains('mc-fn'), head: rfLKShown($('mc-mgr-head')), tabs: rfLKShown($('mc-mgr-tabs')) };
      if (UI.frameDef()) {
        var ok = D.querySelector('#pm .pm-ok'), cs = W.getComputedStyle(ok);
        info.round = cs.borderTopLeftRadius === '50%' || parseFloat(cs.borderTopLeftRadius) >= ok.offsetHeight / 2 - 1;
        var oy = ok.getBoundingClientRect().top, fy = D.querySelector('#pm .pm-group') ? D.querySelector('#pm .pm-group').getBoundingClientRect().top : 1e9;
        info.top = oy < fy;
      }
      await rfLKClick(D.querySelector('#pm .pm-ok'), 'OK'); await idle(); await wait(30);
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'extrude' && !f.cut, label + ' made ' + f.type);
      info.v = anvil.summary().volume;
      info.after = { head: rfLKShown($('mc-mgr-head')), solids: rfLKShown($('mc-solids')) };
      return info;
    }
    var m = await boss('Solids', 'Extrude');
    assert(m.title === 'Solid Extrude' && m.fn && !m.head && !m.tabs, 'function panel: ' + JSON.stringify(m));
    assert(m.round && m.top, 'OK button: ' + JSON.stringify(m));
    assert(m.after.head && m.after.solids, 'the managers did not come back: ' + JSON.stringify(m.after));
    anvil.profile('solidworks');
    var s = await boss('Features', 'Extruded Boss/Base');
    anvil.profile('mastercam'); await wait(30);
    near(m.v, s.v, 1e-6, 'Solid Extrude vs Extruded Boss/Base volume');
    assert(s.title === null, 'a function title under SolidWorks');
    return 'Solid Extrude ' + m.v;
  });

  step('rfLK: (e) the status bar: X / Y / Z follow the cursor (five decimals), the display-style buttons change the display, SECTION VIEW toggles the section', async function () {
    await anvil.newPart(); await idle(); await anvil.run(RFLK_BOX); await idle();
    UI.setView('Isometric'); UI.zoomToFit(); await wait(400);
    var vp = $('viewport'), r = vp.getBoundingClientRect();
    var p = [Math.round(r.left + r.width * 0.3), Math.round(r.top + r.height * 0.4)];
    vp.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: p[0], clientY: p[1] }));
    await wait(80);
    var s1 = UI.frameStatus();
    vp.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: p[0] + 60, clientY: p[1] + 30 }));
    await wait(80);
    var s2 = UI.frameStatus();
    assert(/^X: -?\d+\.\d{5}$/.test(s1.x) && /^Z: -?\d+\.\d{5}$/.test(s1.z), 'format ' + s1.x + ' ' + s1.z);
    assert(s1.x !== s2.x || s1.z !== s2.z, 'X / Z did not follow the cursor: ' + s1.x + ' ' + s2.x);
    var btn = function (st) { return D.querySelector('#mc-status .mc-style[data-style="' + st + '"]'); };
    await rfLKClick(btn('wireframe'), 'wireframe');
    assert(UI.App.view.style === 'wireframe' && btn('wireframe').classList.contains('active'), 'style ' + UI.App.view.style);
    await rfLKClick(btn('hlr'), 'hidden lines');
    assert(UI.App.view.style === 'hlr', 'style ' + UI.App.view.style);
    await rfLKClick(btn('shaded'), 'shaded');
    assert(UI.App.view.style === 'shaded', 'style ' + UI.App.view.style);
    await rfLKClick(btn('shadedEdges'), 'shaded with edges');
    assert(UI.App.view.style === 'shadedEdges' && !btn('wireframe').classList.contains('active'), 'style ' + UI.App.view.style);
    await rfLKClick(D.querySelector('#mc-status [data-mc="section"]'), 'SECTION VIEW');
    await wait(60);
    var on = !!UI.App.view.section || UI.hasPM();
    if (UI.hasPM()) await UI.pmOK();
    await idle(); await wait(30);
    assert(on && /SECTION VIEW: ON/.test(UI.frameStatus().section), 'section ' + UI.frameStatus().section);
    if (UI.App.view.section) { UI.cmdSection(); await wait(30); if (UI.hasPM()) UI.pmCancel(); }
    return s1.x + ' ' + s1.y + ' ' + s1.z + ' -> ' + s2.x;
  });

  step('rfLK: (f) every ribbon command and every menu row of a part, an assembly and a drawing is reachable under the frame: the File rows in the backstage, the other menus as buttons on More whose menus have the same rows; a caption under every group of every tab', async function () {
    var msg = [];
    async function check(dt) {
      // the ribbon
      var set = UI.profileRibbon(dt), have = {};
      Object.keys(set).forEach(function (t) { UI.ribbonLeaves(set[t]).forEach(function (it) { have[UI.Commands.cmdOf(it)] = t; }); });
      var missing = UI.Commands.list(dt).filter(function (c) { return !have[c.cmd]; }).map(function (c) { return c.cmd; });
      assert(!missing.length, dt + ': unreachable ' + missing.join(', '));
      // the menus
      var menus = UI.menuModel(), offered = UI.frameBackstage.rows(), inBs = {};
      Object.keys(offered).forEach(function (k) { offered[k].forEach(function (l) { inBs[l] = k; }); });
      var file = menus.filter(function (m) { return m.label === 'File'; })[0];
      var lost = file.items.filter(function (it) { return it && !it.sep && !inBs[it.label]; }).map(function (it) { return it.label; });
      assert(!lost.length, dt + ': File rows not in the backstage: ' + lost.join(', '));
      await rfLKTab('More');
      var nRows = 0;
      for (var i = 0; i < menus.length; i++) {
        var m = menus[i];
        if (m.label === 'File' || !(m.items || []).some(function (it) { return it && !it.sep; })) continue;
        await rfLKClick(rfLKBtn(m.label), dt + ' More > ' + m.label);
        var got = Array.prototype.filter.call(D.querySelectorAll('.menu:not(.menu-sub) > .mi'), function () { return true; }).length;
        var want = m.items.filter(function (it) { return it && !it.sep; }).length;
        if (UI.closeMenus) UI.closeMenus();
        assert(got === want, dt + ' ' + m.label + ': ' + got + ' rows, the menu has ' + want);
        nRows += want;
      }
      // captions
      var bad = [];
      var tabs = rfLKTabs().map(function (t) { return t.textContent; });
      for (var j = 0; j < tabs.length; j++) {
        await rfLKTab(tabs[j]); await wait(40);
        var caps = UI.frameCaptions(), items = UI.ribbonShownItems().filter(function (it) { return !it.sep; });
        if (!caps.length || items.some(function (it) { return !it.group; })) bad.push(tabs[j]);
      }
      assert(!bad.length, dt + ': tabs without captions: ' + bad.join(', '));
      msg.push(dt + ' ' + UI.Commands.list(dt).length + ' cmds, ' + (file.items.length) + ' File rows, ' + nRows + ' menu rows');
    }
    await anvil.newPart(); await idle(); await anvil.run(RFLK_BOX); await idle();
    await check('part');
    UI.makeDrawing({ fresh: true }); await wait(300); await idle();
    try {
      assert(UI.drawingActive(), 'no drawing');
      await check('drawing');
    } finally { UI.closeDrawing(); await idle(); }
    await anvil.newAssembly(); await idle();
    await check('assembly');
    await anvil.newPart(); await idle();
    return msg.join('; ');
  });

  step('rfLK: (g) switching back and forth with a part, a sketch, an assembly, a drawing, a PropertyManager and the backstage open leaves nothing behind: SolidWorks\' ribbon, menu bar, FeatureManager tabs and status bar as before; focus stays on the page', async function () {
    var notes = [];
    // the baseline: SolidWorks after a drawing has been open once (the drawing adds its own tree and status pieces)
    anvil.profile('solidworks');
    await anvil.newPart(); await idle(); await anvil.run(RFLK_BOX); await idle();
    UI.makeDrawing({ fresh: true }); await wait(300); await idle(); UI.closeDrawing(); await idle();
    await anvil.newPart(); await idle(); await anvil.run(RFLK_BOX); await idle();
    UI.App.ribbonTab = 'Features'; UI.refreshRibbon(); await wait(30);
    if (!$('tp-panel').hidden) UI.closeTaskPane();
    var base = await rfLKState();
    async function round(name, setup, teardown) {
      anvil.profile('mastercam'); await wait(30);
      await setup(); await wait(40);
      anvil.profile('solidworks'); await wait(40);
      var left = rfLKLeftovers();
      assert(!left.length, name + ': left behind ' + left.join(', '));
      var a = D.activeElement;
      assert(!a || a === D.body || a.isConnected, name + ': focus on a removed element');
      anvil.profile('mastercam'); await wait(30);
      anvil.profile('solidworks'); await wait(30);
      if (teardown) await teardown();
      notes.push(name);
    }
    anvil.profile('solidworks');
    await anvil.newPart(); await idle(); await anvil.run(RFLK_BOX); await idle();
    await round('part', async function () { UI.frameManager('planes'); });
    await round('sketch', async function () { await UI.newSketchOnPlane('Top'); await idle(); }, async function () { assert(UI.App.mode === 'sketch', 'the sketch closed'); UI.exitSketch(); await idle(); });
    await round('PropertyManager', async function () { UI.App.sel = { kind: 'face', index: faceWithNormal([0, 0, 1]) }; UI.cmdShell(); await wait(40); assert(UI.hasPM(), 'no Shell'); }, async function () { assert(UI.hasPM() && !$('pm').hidden && $('fm-tree').hidden, 'the PropertyManager did not stay'); UI.pmCancel(); await idle(); });
    await round('backstage', async function () { UI.frameBackstage.open('options'); assert($('mc-backstage'), 'no backstage'); });
    // the backstage's own Options: SolidWorks picked there by mouse
    anvil.profile('mastercam'); await wait(30);
    await rfLKClick(D.querySelector('#status-right .st-profile'), 'chip');
    await rfLKClick(D.querySelector('#mc-backstage input[data-profile="solidworks"]'), 'SolidWorks radio in the backstage');
    await wait(60);
    assert(UI.Profiles.active() === 'solidworks' && !rfLKLeftovers().length, 'SolidWorks from the backstage: ' + UI.Profiles.active() + ' ' + rfLKLeftovers().join(', '));
    UI.makeDrawing({ fresh: true }); await wait(300); await idle();
    try { await round('drawing', async function () { assert(UI.drawingActive(), 'no drawing'); }); } finally { UI.closeDrawing(); await idle(); }
    await anvil.newAssembly(); await idle();
    await round('assembly', async function () { });
    await anvil.newPart(); await idle(); await anvil.run(RFLK_BOX); await idle();
    UI.App.ribbonTab = 'Features'; UI.refreshRibbon(); await wait(30);
    if (!$('tp-panel').hidden) UI.closeTaskPane();
    var now = await rfLKState();
    var d = rfLKDiff(base, now);
    assert(!d.length, 'SolidWorks differs after the round trips: ' + d.join('; '));
    return notes.join(', ') + '; SolidWorks identical';
  });

  step('rfLK: reset (SolidWorks profile, nothing stored, no frame)', async function () {
    if (UI.frameBackstage) UI.frameBackstage.close();
    anvil.profile('solidworks');
    try { W.localStorage.removeItem(UI.Profiles.storageKey); } catch (e) { }
    assert(UI.Profiles.active() === 'solidworks' && !UI.frameDef() && !rfLKLeftovers().length, 'not reset');
  });
})();
