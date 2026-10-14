  // --- rfCC ---
  // (2026-10-14, lane CC) Mastercam's View tab (ui-panels.js viewTab): the view commands Anvil already had (View menu,
  // heads-up toolbar) in groups Zoom | Orientation | Appearance | Show / Hide | Section | Managers with their captions;
  // real button clicks set the view, the display style and the show / hide toggles, the pressed state follows them.
  async function rfCCWidth(px, fn) {
    var f = document.getElementById('app'), old = [f.style.width, f.style.minWidth];
    f.style.minWidth = '0'; f.style.width = px + 'px'; void f.offsetWidth;
    await wait(40); UI.fitWorkspace(); UI.refreshRibbon(); await wait(40);
    try { return await fn(); }
    finally { f.style.width = old[0]; f.style.minWidth = old[1]; void f.offsetWidth; await wait(40); UI.fitWorkspace(); }
  }
  function rfCCTab(name) {
    var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return t.textContent === (name || 'View'); })[0];
    assert(tab, 'a ' + (name || 'View') + ' tab');
    tab.click();
    return tab;
  }
  function rfCCBtn(label) {   // 'Background': the flyout's face, named by the background it sets
    var b = label === 'Background' ? D.querySelector('#ribbon-buttons .rb-fly-small > .rb[aria-label$=" Background"]') : D.querySelector('#ribbon-buttons .rb[aria-label="' + label + '"]');
    assert(b, 'View tab button ' + label);
    return b;
  }
  async function rfCCClick(label) { var b = rfCCBtn(label); assert(!b.disabled, label + ' is enabled'); b.click(); await idle(); await wait(20); return b; }
  function rfCCDir(want, what) {
    var d = UI.cam.dir, n = Math.hypot(want[0], want[1], want[2]);
    assert(Math.abs(d.x - want[0] / n) < 1e-6 && Math.abs(d.y - want[1] / n) < 1e-6 && Math.abs(d.z - want[2] / n) < 1e-6, what + ': camera direction ' + [d.x, d.y, d.z].map(function (x) { return x.toFixed(4); }).join(', '));
  }
  function rfCCOn(label) { return rfCCBtn(label).classList.contains('active'); }
  var RFCC_BUTTONS = ['Zoom to Fit', 'Zoom to Area', 'Previous View', 'Front', 'Back', 'Left', 'Right', 'Top', 'Bottom', 'Isometric', 'Normal To',
    'Shaded With Edges', 'Shaded', 'Hidden Lines Removed', 'Hidden Lines Visible', 'Wireframe', 'Edit Appearance', 'Apply Scene', 'Background', 'Dark Theme',
    'Planes', 'Origins', 'All Sketches', 'Sketch Grid', 'Sketch Regions', 'Sketch Dimensions', 'Show Endpoints', 'Snap to Model', 'Section View',
    'FeatureManager', 'Levels Manager', 'Selection Filter'];

  step('rfCC: the View tab after Transform — Zoom, Orientation, Appearance, Show / Hide, Section and Managers with their captions under them; at 1400 px everything fits with labels (only the Managers may go to »); tooltips with shortcuts; Search Commands finds Wireframe and Section View (View)', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    var names = Array.prototype.map.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return t.textContent; });
    assert(names.indexOf('View') === names.indexOf('Transform') + 1 && names.indexOf('Transform') > 0, 'tab order: ' + names.join(', '));
    rfCCTab(); await wait(40);
    // every button, in order (the Background flyout's face is named by the background it sets)
    var got = Array.prototype.map.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { var l = b.getAttribute('aria-label'); return /Background$/.test(l) ? 'Background' : l; });
    assert(got.join('|') === RFCC_BUTTONS.join('|'), 'buttons: ' + got.join(', '));
    assert(rfCCBtn('Front').closest('.rb-grid') && rfCCBtn('Front').closest('.rb-grid') === rfCCBtn('Normal To').closest('.rb-grid'), 'the eight orientations in one icon grid');
    assert(D.querySelector('#ribbon-buttons .rb-fly-small .rb-caret'), 'Background is a flyout with its ▾');
    // the HUD's icons for the same commands
    var icons = Array.prototype.map.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.dataset.icon; });
    ['vZoomFit', 'zoomArea', 'prevView', 'vFront', 'vTop', 'vIso', 'vNormalTo', 'dsShadedEdges', 'dsWireframe', 'appearance', 'scene', 'vBackground', 'vTheme', 'vPlanes', 'vGrid', 'showEndpoints', 'vSnapModel', 'section', 'vFeatureTree', 'levels', 'filter'].forEach(function (n) { assert(icons.indexOf(n) >= 0, 'icon ' + n + ' in ' + icons.join(',')); });
    await rfCCWidth(1400, async function () {
      var over = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons > .rb-over'), function (c) { return !c.classList.contains('rb-sep'); });
      assert(over.every(function (c) { return c.contains(rfCCBtn('FeatureManager')); }), 'at 1400 px only the Managers may overflow: ' + over.map(function (c) { return c.textContent; }).join(' | '));
      assert(!$('ribbon').classList.contains('fit-1') && !$('ribbon').classList.contains('fit-2'), 'labels kept at 1400 px: ' + $('ribbon').className);
      UI.transformCaptions(); await wait(30);
      var caps = Array.prototype.map.call(D.querySelectorAll('#ribbon .rb-caption'), function (c) { return { t: c.textContent, r: c.getBoundingClientRect() }; });
      var capNames = caps.map(function (c) { return c.t; }).join(',');
      assert(/^Zoom,Orientation,Appearance,Show \/ Hide,Section(,Managers)?$/.test(capNames), 'captions: ' + capNames);
      function under(i, label) { var r = rfCCBtn(label).getBoundingClientRect(); return r.left >= caps[i].r.left - 1 && r.right <= caps[i].r.right + 1 && caps[i].r.top >= r.bottom - 2; }
      assert(under(0, 'Zoom to Fit') && under(0, 'Previous View') && under(1, 'Front') && under(1, 'Normal To') && under(2, 'Wireframe') && under(2, 'Dark Theme') && under(3, 'Planes') && under(3, 'Snap to Model') && under(4, 'Section View') && !under(0, 'Front'), 'captions sit under their groups');
      return capNames;
    });
    // tooltips: name, shortcut and a line of description
    var tip = rfCCBtn('Top')._tip, tip2 = rfCCBtn('Wireframe')._tip, tip3 = rfCCBtn('Zoom to Fit')._tip;
    assert(tip && tip.name === 'Top' && tip.key === 'Ctrl+5' && /top/.test(tip.desc), 'Top tooltip ' + JSON.stringify(tip));
    assert(tip2 && tip2.desc && tip3 && tip3.key === 'F' && rfCCBtn('Selection Filter')._tip.key === 'F5', 'tooltips ' + JSON.stringify([tip2, tip3]));
    RFCC_BUTTONS.forEach(function (l) { var b = rfCCBtn(l), t = b._tip; assert(t && t.desc, l + ' has a description'); assert(!b.disabled, l + ' is enabled'); });
    // Search Commands
    var hits = UI.searchCommands('wireframe').map(function (h) { return h.name + '@' + h.where; });
    assert(hits.indexOf('Wireframe@View') >= 0 || hits.indexOf('Wireframe (View)@View') >= 0, 'search wireframe: ' + hits.join(', '));
    hits = UI.searchCommands('section view').map(function (h) { return h.name; });
    assert(hits.indexOf('Section View (View)') >= 0, 'search section view: ' + hits.join(', '));
    assert(UI.searchCommands('levels manager').some(function (h) { return h.name === 'Levels Manager' && h.where === 'View'; }), 'search Levels Manager');
    // away and back: the captions come back (the cleared layer used to keep its old text and skip the redraw)
    UI.transformCaptions(); await wait(20);
    var caps0 = Array.prototype.map.call(D.querySelectorAll('#ribbon .rb-caption'), function (c) { return c.textContent; }).join(',');
    rfCCTab('Features'); await wait(30); UI.transformCaptions(); await wait(20);
    assert(!D.querySelector('#ribbon .rb-caption'), 'no captions on the Features tab');
    rfCCTab(); await wait(30); UI.transformCaptions(); await wait(20);
    var caps1 = Array.prototype.map.call(D.querySelectorAll('#ribbon .rb-caption'), function (c) { return c.textContent; }).join(',');
    assert(caps1 && caps1 === caps0, 'captions back on the View tab: ' + caps1 + ' / ' + caps0);
    UI.App.ribbonTab = 'Features'; UI.refreshRibbon(); await wait(30);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return got.length + ' buttons';
  });

  step('rfCC: View tab buttons — Top / Front / Isometric / Previous View set the camera; Wireframe / Shaded With Edges set App.view.style with the pressed button moving (also when the HUD changes it); Planes, Sketch Grid and Show Endpoints toggle on and off pressed; Section View opens its PM; Levels Manager and FeatureManager switch the left pane', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.box(4, 2, 1);'); await idle();
    rfCCTab(); await wait(30);
    // orientation
    await rfCCClick('Top'); rfCCDir([0, 1, 0], 'Top');
    await rfCCClick('Front'); rfCCDir([0, 0, 1], 'Front');
    await rfCCClick('Isometric'); rfCCDir([1, 1, 1], 'Isometric');
    await rfCCClick('Previous View'); rfCCDir([0, 0, 1], 'Previous View (back to Front)');
    await rfCCClick('Right'); rfCCDir([1, 0, 0], 'Right');
    await rfCCClick('Zoom to Fit');
    // Zoom to Area: a toggle, pressed while armed (the HUD's button too)
    await rfCCClick('Zoom to Area');
    assert(UI.App.zoomAreaMode === true && rfCCOn('Zoom to Area') && D.querySelector('#hud [data-hud="Zoom to Area"]').classList.contains('active'), 'Zoom to Area armed and pressed');
    await rfCCClick('Zoom to Area');
    assert(!UI.App.zoomAreaMode && !rfCCOn('Zoom to Area'), 'Zoom to Area off');
    // display style
    var style0 = UI.App.view.style;
    await rfCCClick('Wireframe');
    assert(UI.App.view.style === 'wireframe' && rfCCOn('Wireframe') && !rfCCOn('Shaded With Edges') && !rfCCOn('Shaded'), 'Wireframe pressed, style ' + UI.App.view.style);
    await rfCCClick('Hidden Lines Removed');
    assert(UI.App.view.style === 'hlr' && rfCCOn('Hidden Lines Removed') && !rfCCOn('Wireframe'), 'HLR pressed');
    UI.setStyle('shaded'); await wait(20);   // the heads-up toolbar / View menu path: the tab follows
    assert(rfCCOn('Shaded') && !rfCCOn('Hidden Lines Removed'), 'Shaded pressed after a HUD change');
    await rfCCClick('Shaded With Edges');
    assert(UI.App.view.style === 'shadedEdges' && rfCCOn('Shaded With Edges') && !rfCCOn('Shaded'), 'Shaded With Edges pressed');
    UI.setStyle(style0); await wait(20);
    // show / hide toggles
    var toggles = [['Planes', function () { return !!UI.App.view.showPlanes; }], ['Sketch Grid', function () { return !!UI.App.view.showGrid; }], ['Show Endpoints', function () { return UI.App.view.showEndpoints !== false; }],
      ['Origins', function () { return !!UI.App.view.showOrigin; }], ['Sketch Dimensions', function () { return !!UI.App.view.showDims; }], ['Snap to Model', function () { return UI.App.view.snapModel !== false; }]];
    for (var i = 0; i < toggles.length; i++) {
      var l = toggles[i][0], st = toggles[i][1], s0 = st();
      assert(rfCCOn(l) === s0, l + ' pressed state matches ' + s0);
      await rfCCClick(l);
      assert(st() === !s0 && rfCCOn(l) === !s0, l + ' toggled to ' + !s0 + ' (pressed ' + rfCCOn(l) + ')');
      await rfCCClick(l);
      assert(st() === s0 && rfCCOn(l) === s0, l + ' back to ' + s0);
    }
    // the planes really hide: the View menu's Planes and the tab agree
    var pl0 = UI.App.view.showPlanes, viewMenu = UI.menuModel().filter(function (m) { return m.label === 'View'; })[0];
    assert(viewMenu.items.filter(function (it) { return it.label === 'Planes'; })[0].checked === pl0, 'View ▸ Planes check mark agrees');
    // Section View: its PropertyManager, pressed while the section is on; ✗ turns it off
    await rfCCClick('Section View');
    assert(UI.pmTitle() === 'Section View' && UI.App.view.section && rfCCOn('Section View'), 'Section View PM ' + UI.pmTitle());
    UI.pmCancel(); await idle(); await wait(20);
    assert(!UI.App.view.section && !rfCCOn('Section View'), 'section off after ✗');
    // managers
    await rfCCClick('Levels Manager');
    assert(UI.App.fmTab === 'levels' && !$('levels-panel').hidden && rfCCOn('Levels Manager') && !rfCCOn('FeatureManager'), 'Levels Manager shown, fmTab ' + UI.App.fmTab);
    await rfCCClick('FeatureManager');
    assert(UI.App.fmTab === 'tree' && !$('fm-tree').hidden && $('levels-panel').hidden && rfCCOn('FeatureManager') && !rfCCOn('Levels Manager'), 'FeatureManager shown, fmTab ' + UI.App.fmTab);
    var sf0 = !!UI.selectionFilterBarShown();
    await rfCCClick('Selection Filter');
    assert(!!UI.selectionFilterBarShown() === !sf0 && rfCCOn('Selection Filter') === !sf0, 'Selection Filter toggled');
    await rfCCClick('Selection Filter');
    assert(!!UI.selectionFilterBarShown() === sf0, 'Selection Filter back');
    // Background flyout and Dark Theme
    var bg0 = UI.App.view.bg, th0 = UI.theme();
    var caret = D.querySelector('#ribbon-buttons .rb-fly-small .rb-caret');
    caret.click(); await wait(20);
    var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.indexOf('Dark Background') >= 0; })[0];
    assert(row, 'Background ▾ lists Dark Background');
    row.click(); await idle(); await wait(20);
    assert(UI.App.view.bg === 'dark' && rfCCOn('Dark Background'), 'dark background, face pressed: ' + UI.App.view.bg);
    await rfCCClick('Dark Theme');
    assert(UI.theme() === (th0 === 'dark' ? 'light' : 'dark') && rfCCOn('Dark Theme') === (UI.theme() === 'dark'), 'theme toggled');
    await rfCCClick('Dark Theme');
    assert(UI.theme() === th0, 'theme back');
    UI.setBg(bg0);
    UI.App.ribbonTab = 'Features'; UI.refreshRibbon(); await wait(30);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfCC: an assembly has the View tab too (without the Levels Manager), with its captions', async function () {
    var errs0 = errors.length;
    await anvil.newAssembly('rfCCAsm'); await idle();
    rfCCTab(); await wait(40);
    assert(!D.querySelector('#ribbon-buttons .rb[aria-label="Levels Manager"]'), 'no Levels Manager in an assembly');
    await rfCCClick('Top'); rfCCDir([0, 1, 0], 'Top in an assembly');
    await rfCCClick('Wireframe');
    assert(UI.App.view.style === 'wireframe' && rfCCOn('Wireframe'), 'Wireframe in an assembly');
    await rfCCClick('Shaded With Edges');
    UI.transformCaptions(); await wait(30);
    var caps = Array.prototype.map.call(D.querySelectorAll('#ribbon .rb-caption'), function (c) { return c.textContent; }).join(',');
    assert(/^Zoom,Orientation,Appearance,Show \/ Hide,Section/.test(caps), 'captions in an assembly: ' + caps);
    await anvil.newPart(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
