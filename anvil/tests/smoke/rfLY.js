  // --- rfLY (lane mctheme, 2026-11-12): under the Mastercam profile the whole window takes Mastercam's colours ---
  // The colours are the profile's data (ui-profiles.js frame.theme.vars, viewport.colors), measured from the user's
  // screenshots; style.css / drawing.css block "lane mctheme" routes Anvil's tokens to them. Checked: every --mc-* the
  // sheets use resolves in both themes; text on each ground 4.5 : 1, icons and control borders 3 : 1 (computed styles of
  // real elements); the selected row, the default button and a ticked check box use the profile's accent; a sketch line
  // and a solid draw in the profile's wireframe / solid colours and go back to Anvil's; the Options gear opens File >
  // Options; SolidWorks' chrome colours are exactly what they were before the switch.
  var RFLY_BOX = "p.sketch('Front').rect(0, 0, 60, 40).extrude(20)";
  function rfLYrgb(s) {
    var m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/.exec(s || '');
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
    m = /#([0-9a-f]{6})\b/i.exec(s || '');
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
    return null;
  }
  function rfLYlum(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function rfLYcontrast(a, b) { var x = rfLYlum(a), y = rfLYlum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function rfLYground(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var c = rfLYrgb(W.getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  // a CSS colour as the browser resolves it (a probe element in the document)
  function rfLYresolve(css) {
    var p = D.createElement('div'); p.style.color = css; D.body.appendChild(p);
    var v = W.getComputedStyle(p).color; p.remove(); return v;
  }
  function rfLYshown(el) { return !!el && el.getClientRects().length > 0 && W.getComputedStyle(el).visibility !== 'hidden'; }
  async function rfLYsettle() { await idle(); await wait(320); }   // buttons and tabs fade colours in 90 ms (rfGX)
  async function rfLYMastercam() {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    anvil.profile('mastercam');
    await anvil.newPart(); await idle();
    await anvil.run(RFLY_BOX); await idle();
    if (!$('tp-panel').hidden) UI.closeTaskPane();
    UI.setView('Isometric'); await rfLYsettle();
  }
  async function rfLYReset(theme) {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    if (modalOpen()) UI.closeModal();
    if (UI.closeMenus) UI.closeMenus();
    if (UI.frameBackstage && UI.frameBackstage.isOpen()) UI.frameBackstage.close();
    anvil.profile('solidworks');
    if (theme) UI.setTheme(theme);
    await rfLYsettle();
  }
  function rfLYtheme() { return D.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
  // every --mc-* name the style sheets read
  function rfLYsheetVars() {
    var names = {};
    Array.prototype.forEach.call(D.styleSheets, function (sh) {
      var rules; try { rules = sh.cssRules; } catch (e) { return; }
      Array.prototype.forEach.call(rules || [], function (r) { (r.cssText.match(/var\(--mc-[a-z0-9-]+/g) || []).forEach(function (m) { names[m.slice(4)] = 1; }); });
    });
    return Object.keys(names);
  }

  step('rfLY: (a) every --mc-* colour the sheets read resolves under the profile, light and dark, and the dark data has every light key', async function () {
    var prev = rfLYtheme(), bad = [];
    try {
      var def = UI.Profiles.def('mastercam'), vars = def.frame.theme.vars;
      Object.keys(vars.light).forEach(function (k) { if (!(k in vars.dark)) bad.push('dark has no ' + k); });
      Object.keys(vars.dark).forEach(function (k) { if (!(k in vars.light)) bad.push('light has no ' + k); });
      await rfLYMastercam();
      var names = rfLYsheetVars().filter(function (n) { return !/^--mc-[ld]-/.test(n); });
      assert(names.length > 30, 'only ' + names.length + ' --mc-* names read by the sheets');
      ['light', 'dark'].forEach(function (th) {
        UI.setTheme(th);
        var cs = W.getComputedStyle(D.documentElement);
        names.forEach(function (n) { if (!cs.getPropertyValue(n).trim()) bad.push(th + ' ' + n + ' is empty'); });
      });
      assert(!bad.length, bad.slice(0, 12).join('; '));
      return names.length + ' names, both themes';
    } finally { await rfLYReset(prev); }
  });

  step('rfLY: (b) contrast under the profile, light and dark: text 4.5 : 1 on its ground, icons and control borders 3 : 1', async function () {
    var prev = rfLYtheme(), bad = [], n = 0;
    try {
      await rfLYMastercam();
      for (var t = 0; t < 2; t++) {
        var th = ['light', 'dark'][t];
        UI.setTheme(th); await rfLYsettle();
        var text = function (label, el) {
          if (!el || !rfLYshown(el)) { bad.push(th + ' ' + label + ': not shown'); return; }
          var k = rfLYcontrast(rfLYrgb(W.getComputedStyle(el).color), rfLYground(el)); n++;
          if (k < 4.5) bad.push(th + ' ' + label + ' ' + k.toFixed(2));
        };
        var edge = function (label, el, prop) {
          if (!el || !rfLYshown(el)) { bad.push(th + ' ' + label + ': not shown'); return; }
          var c = rfLYrgb(W.getComputedStyle(el)[prop]), g = rfLYground(el.parentElement);
          var k = rfLYcontrast(c, g); n++;
          if (k < 3) bad.push(th + ' ' + label + ' ' + k.toFixed(2));
        };
        UI.setRibbonTab('Home'); await rfLYsettle();
        text('ribbon label', D.querySelector('#ribbon-buttons .rb > span'));
        text('active tab', D.querySelector('#ribbon-tabs .rtab.active'));
        text('tab', D.querySelector('#ribbon-tabs .rtab:not(.active):not(.off)'));
        text('caption', D.querySelector('#ribbon > .mc-captions .mc-caption'));
        text('File tab', $('mc-file'));
        edge('Options gear', D.querySelector('#mc-tabtools [data-tt="options"]'), 'color');
        UI.frameManager('planes'); await rfLYsettle();
        text('manager title', D.querySelector('#mc-mgr-head .mc-mgr-title'));
        text('table row', D.querySelector('table.mc-planes tr:not(.current) td.mc-pl-name'));
        text('selected row', D.querySelector('table.mc-planes tr.current td.mc-pl-name'));
        text('manager tab', D.querySelector('#mc-mgr-tabs button.active'));
        UI.frameManager('solids'); await rfLYsettle();
        text('status bar item', D.querySelector('#mc-status .mc-st'));
        text('viewsheet tab', D.querySelector('#mc-viewsheets .vs-tab.active'));
        UI.showMenu(200, 200, [{ label: 'rfLY row', action: function () { } }, { label: 'rfLY off', disabled: true }]); await wait(30);
        text('menu item', D.querySelector('.menu .mi'));
        UI.closeMenus();
        UI.editFeature(UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[0]); await rfLYsettle();
        text('function panel label', D.querySelector('#pm .pm-row.pm-field > label'));
        text('function panel group', D.querySelector('#pm .pm-group > h4'));
        edge('function panel field border', D.querySelector('#pm .pm-num-wrap'), 'borderTopColor');
        edge('function panel check box', D.querySelector('#pm input[type=checkbox]:not(:checked)'), 'borderTopColor');
        UI.closePM(); await idle();
        UI.frameBackstage.open('info'); await rfLYsettle();
        text('backstage nav', D.querySelector('#mc-backstage .bs-nav-item:not(.active)'));
        text('backstage nav (active)', D.querySelector('#mc-backstage .bs-nav-item.active'));
        text('backstage page', D.querySelector('#mc-backstage .bs-page h2'));
        UI.frameBackstage.close(); await idle();
      }
      assert(!bad.length, bad.join('; '));
      return n + ' pairs';
    } finally { await rfLYReset(prev); }
  });

  step('rfLY: (c) the selected row, the default button and a ticked check box are the profile\'s accent blue, in both themes', async function () {
    var prev = rfLYtheme(), bad = [];
    try {
      await rfLYMastercam();
      for (var t = 0; t < 2; t++) {
        var th = ['light', 'dark'][t];
        UI.setTheme(th); await rfLYsettle();
        var acc = rfLYresolve('var(--mc-accent)'), want = UI.Profiles.def('mastercam').frame.theme.vars[th]['--mc-accent'];
        if (acc !== rfLYresolve(want)) bad.push(th + ' --mc-accent ' + acc + ' is not the data ' + want);
        UI.frameManager('planes'); await rfLYsettle();
        var sel = D.querySelector('table.mc-planes tr.current td');
        if (!sel || W.getComputedStyle(sel).backgroundColor !== acc) bad.push(th + ' selected plane row ' + (sel && W.getComputedStyle(sel).backgroundColor));
        UI.frameManager('solids'); await rfLYsettle();
        var row = D.querySelector('.mc-sol-row:not(.mc-sol-body)');
        if (row) { row.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true })); row.click(); await rfLYsettle(); }
        row = D.querySelector('.mc-sol-row.selected');
        if (!row || W.getComputedStyle(row).backgroundColor !== acc) bad.push(th + ' selected Solids row ' + (row && W.getComputedStyle(row).backgroundColor));
        else if (rfLYcontrast(rfLYrgb(W.getComputedStyle(row.querySelector('span') || row).color), rfLYrgb(acc)) < 4.5) bad.push(th + ' selected row text');
        UI.confirmDialog('rfLY', 'The default button.', function () { }); await wait(60);
        var def = D.querySelector('#modal-buttons .btn.primary');
        if (!def || W.getComputedStyle(def).backgroundColor !== acc) bad.push(th + ' default button ' + (def && W.getComputedStyle(def).backgroundColor));
        UI.closeModal(); await idle();
        UI.editFeature(UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[0]); await rfLYsettle();
        var cb = D.querySelector('#pm input[type=checkbox]:checked');
        if (!cb || W.getComputedStyle(cb).backgroundColor !== acc) bad.push(th + ' ticked check box ' + (cb && W.getComputedStyle(cb).backgroundColor));
        if (W.getComputedStyle(D.documentElement).accentColor !== acc) bad.push(th + ' accent-color ' + W.getComputedStyle(D.documentElement).accentColor);
        UI.closePM(); await idle();
      }
      assert(!bad.length, bad.join('; '));
      return 'accent in both themes';
    } finally { await rfLYReset(prev); }
  });

  step('rfLY: (d) a sketch line and a solid draw in the profile\'s wireframe and solid colours, the gnomon in its X / Y colours, and all go back to Anvil\'s', async function () {
    var prev = rfLYtheme();
    try {
      var hex = function (m) { return '#' + m.color.getHexString(); };
      var before = { sketch: hex(UI.mats.sketch), part: hex(UI.mats.part), gnomon: null };
      await rfLYMastercam();
      var c = UI.Profiles.def('mastercam').viewport.colors;
      for (var k = 0; k < 40 && hex(UI.mats.sketch) !== c.wireframe.toLowerCase(); k++) await wait(50);
      assert(hex(UI.mats.sketch) === c.wireframe.toLowerCase(), 'sketch line ' + hex(UI.mats.sketch) + ', want ' + c.wireframe);
      assert(hex(UI.mats.part) === c.solid.toLowerCase(), 'solid ' + hex(UI.mats.part) + ', want ' + c.solid);
      var pv = UI.profileViewportColors();
      assert(pv && pv.gnomon[0] === c.gnomon[0] && pv.gnomon[1] === c.gnomon[1], 'gnomon ' + JSON.stringify(pv));
      // a theme switch resets the line tables: the profile's colour is back within a frame or two
      UI.setTheme(prev === 'dark' ? 'light' : 'dark'); await rfLYsettle();
      assert(hex(UI.mats.sketch) === c.wireframe.toLowerCase() && hex(UI.mats.sketchFull) === c.wireframe.toLowerCase(), 'after a theme switch: ' + hex(UI.mats.sketch));
      UI.setTheme(prev); await rfLYsettle();
      // a sketch being edited draws its lines in the material checked above
      var s = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[0];
      UI.editSketch(s.id); await rfLYsettle();
      assert(UI.App.mode === 'sketch' && hex(UI.mats.sketch) === c.wireframe.toLowerCase(), 'in the sketch: ' + hex(UI.mats.sketch));
      await UI.exitSketch(true); await idle();
      await rfLYReset(prev);
      assert(!UI.profileViewportColors(), 'still in force under SolidWorks');
      assert(hex(UI.mats.sketch) === before.sketch, 'sketch line back ' + hex(UI.mats.sketch) + ' / ' + before.sketch);
      assert(hex(UI.mats.part) === before.part, 'solid back ' + hex(UI.mats.part) + ' / ' + before.part);
      return 'wireframe ' + c.wireframe + ', solid ' + c.solid;
    } finally { await rfLYReset(prev); }
  });

  step('rfLY: (e) the Options gear at the right end of the tab row opens File > Options; Help opens File > Help', async function () {
    try {
      await rfLYMastercam();
      var tabs = $('ribbon-tabs'), tt = $('mc-tabtools');
      assert(tt && tabs.lastChild === tt, 'the tools are not last in the tab row');
      var gear = tt.querySelector('[data-tt="options"]'), help = tt.querySelector('[data-tt="help"]');
      var r = gear.getBoundingClientRect(), tr = tabs.getBoundingClientRect();
      assert(r.width > 0 && tr.right - r.right < 40, 'gear at ' + r.right + ' of ' + tr.right);
      assert(gear.querySelector('svg') && help.querySelector('svg'), 'icons');
      var hit = D.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      assert(hit && gear.contains(hit), 'the gear is covered by ' + (hit && (hit.id || hit.className)));
      gear.click(); await idle();
      assert(UI.frameBackstage.isOpen() && UI.frameBackstage.page() === 'options', 'Options page: ' + UI.frameBackstage.page());
      assert(D.querySelector('#mc-backstage [data-role="interface-profiles"]'), 'the Interface section');
      UI.frameBackstage.close(); await idle();
      help.click(); await idle();
      assert(UI.frameBackstage.isOpen() && UI.frameBackstage.page() === 'help', 'Help page: ' + UI.frameBackstage.page());
      UI.frameBackstage.close(); await idle();
      await rfLYReset();
      assert(!$('mc-tabtools'), 'the tools stay under SolidWorks');
      return 'gear and help';
    } finally { await rfLYReset(); }
  });

  step('rfLY: (f) SolidWorks: the computed colours of the chrome are what they were before a Mastercam round trip, light and dark', async function () {
    var prev = rfLYtheme(), bad = [];
    var SEL = ['#menubar', '#ribbon', '#ribbon-tabs', '#ribbon-tabs .rtab', '#ribbon-tabs .rtab.active', '#ribbon-buttons .rb', '#left', '#tree', '#tree .ti', '#fm-tabs', '#statusbar', '#status-msg', '#viewport', '#tp-strip'];
    var TOK = ['--c-sunken', '--c-panel', '--c-raised', '--c-field', '--c-line', '--c-hover', '--c-press', '--c-sel', '--c-text', '--c-muted', '--c-default', '--c-focus', '--panel', '--text', '--sw-panel', '--sw-group-head', '--cm-bg', '--dw-desk', '--dw-tab-on'];
    function snap() {
      var out = {}, cs = W.getComputedStyle(D.documentElement);
      TOK.forEach(function (t) { out[t] = cs.getPropertyValue(t).trim(); });
      out['accent-color'] = cs.accentColor;
      SEL.forEach(function (s) { var e = D.querySelector(s); if (!e) { out[s] = 'missing'; return; } var c = W.getComputedStyle(e); out[s] = [c.color, c.backgroundColor, c.backgroundImage, c.borderTopColor].join('|'); });
      return out;
    }
    try {
      await rfLYReset();
      await anvil.newPart(); await idle(); await anvil.run(RFLY_BOX); await idle();
      for (var t = 0; t < 2; t++) {
        var th = ['light', 'dark'][t];
        UI.setTheme(th); await rfLYsettle();
        var a = snap();
        anvil.profile('mastercam'); await rfLYsettle();
        UI.setTheme(th === 'light' ? 'dark' : 'light'); await rfLYsettle(); UI.setTheme(th); await rfLYsettle();
        anvil.profile('solidworks'); await rfLYsettle();
        var b = snap();
        Object.keys(a).forEach(function (k) { if (a[k] !== b[k]) bad.push(th + ' ' + k + ': ' + a[k] + ' -> ' + b[k]); });
        if (D.documentElement.hasAttribute('data-profile')) bad.push(th + ' data-profile left');
      }
      assert(!bad.length, bad.slice(0, 8).join('; '));
      return SEL.length + ' elements, ' + TOK.length + ' tokens';
    } finally { await rfLYReset(prev); }
  });
