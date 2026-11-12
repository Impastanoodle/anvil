  // ---- rfMC (2026-11-12, lane swcolors): the default (SolidWorks) profile in the colours of the user's own SolidWorks
  // 2024 ("colors and all"). The light values were sampled with GetPixel from the user's five screenshots (table in
  // docs/areas/ui-core.md, "Look: SolidWorks colours"). Checked: computed colours of real elements within 3 levels per
  // channel of the measured ones, the graphics area's gradient at its corners within 6, text 4.5 : 1 (greyed text is
  // exempt and is SolidWorks' grey), the new tokens resolve everywhere, and the dark default look and the Mastercam
  // profile (light and dark) are exactly what they were before this lane (726c95c).
  var RFMC_BOX = "p.sketch('Front').rect(0, 0, 60, 40).extrude(20)";
  function rfMCrgb(s) {
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/.exec(s || '');
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
    m = /#([0-9a-f]{6})\b/i.exec(s || '');
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
    return null;
  }
  function rfMChex(c) { return c ? '#' + [c.r, c.g, c.b].map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join('') : 'none'; }
  function rfMCnear(c, hex, tol) { var w = rfMCrgb(hex); return !!(c && c.a > 0.98 && Math.abs(c.r - w.r) <= tol && Math.abs(c.g - w.g) <= tol && Math.abs(c.b - w.b) <= tol); }
  function rfMClum(c) { function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); } return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b); }
  function rfMCratio(a, b) { var x = rfMClum(a), y = rfMClum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function rfMCground(el) { for (var e = el; e && e.nodeType === 1; e = e.parentElement) { var c = rfMCrgb(W.getComputedStyle(e).backgroundColor); if (c && c.a > 0.98) return c; } return { r: 255, g: 255, b: 255, a: 1 }; }
  function rfMCtheme() { return D.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
  async function rfMCsettle() { await idle(); await wait(320); }   // buttons and tabs fade colours in 90 ms (rfGX)
  async function rfMCpart() {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    await anvil.newPart(); await idle(); await anvil.run(RFMC_BOX); await idle();
    UI.setRibbonTab('Features'); UI.App.sel = null; UI.refreshTree(); await rfMCsettle();
  }
  async function rfMCreset(theme) {
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    anvil.profile('solidworks'); UI.setTheme(theme || 'light'); await rfMCsettle();
  }

  step('rfMC: light default look — menu row, CommandManager, its labels (greyed #808080), tabs, FeatureManager, tree text, lines, splitter, rollback bar and status bar are SolidWorks\' measured colours within 3 levels', async function () {
    var prev = rfMCtheme(), bad = [], n = 0;
    try {
      await rfMCreset('light'); await rfMCpart();
      function chk(sel, prop, hex, label, pseudo) {
        var e = typeof sel === 'string' ? D.querySelector(sel) : sel;
        if (!e) { bad.push(label + ' missing'); return; }
        var c = rfMCrgb(W.getComputedStyle(e, pseudo || null)[prop]); n++;
        if (!rfMCnear(c, hex, 3)) bad.push(label + ' ' + rfMChex(c) + ' (SolidWorks ' + hex + ')');
      }
      chk('#menubar', 'backgroundColor', '#d7dade', 'menu row');
      chk('#menubar #menus > li', 'color', '#000000', 'menu text');
      chk('#menubar', 'borderBottomColor', '#c0c0c0', 'line under the menu row');
      chk('#menubar #search', 'backgroundColor', '#ffffff', 'Search Commands');
      chk('#menubar #search', 'borderTopColor', '#c6c6c6', 'Search Commands frame');
      chk('#ribbon', 'backgroundColor', '#d7dade', 'CommandManager');
      chk('#ribbon', 'borderBottomColor', '#838383', 'CommandManager bottom line');
      chk('#ribbon .rb-sep', 'backgroundColor', '#c6c6c6', 'group separator');
      chk('#ribbon-buttons .rb:not(:disabled) span', 'color', '#000000', 'button label');
      chk('#ribbon .rtab.active', 'backgroundColor', '#d7dade', 'active tab');
      chk('#ribbon .rtab:not(.active):not(.off)', 'backgroundColor', '#abadb0', 'inactive tab');
      chk('#ribbon .rtab:not(.active):not(.off)', 'color', '#000000', 'inactive tab text');
      chk('#left', 'backgroundColor', '#d7dade', 'FeatureManager');
      chk('#tree', 'backgroundColor', '#d7dade', 'tree ground');
      chk('#left', 'borderRightColor', '#838383', 'splitter');
      chk('#fm-tabs', 'backgroundColor', '#abadb0', 'FeatureManager tab row');
      chk('#fm-tabs button.active', 'backgroundColor', '#d7dade', 'active FeatureManager tab');
      chk('#tree-filter input', 'backgroundColor', '#efefef', 'filter box');
      var row = [].slice.call(D.querySelectorAll('#tree .ti')).filter(function (t) { return !/\b(dim|rolled|suppressed|hidden|selected)\b/.test(t.className); })[0];
      chk(row && row.querySelector('.nm'), 'color', '#000000', 'tree row');
      chk('#tree .rollbar', 'backgroundColor', '#368ec4', 'rollback bar', '::before');
      chk('#statusbar', 'backgroundColor', '#d7dade', 'status bar');
      chk('#tp-strip', 'backgroundColor', '#abadb0', 'Task Pane strip');
      // a greyed CommandManager button: the label SolidWorks' #808080, the button itself not faded
      var rb = D.querySelector('#ribbon-buttons > .rb:not(:disabled)');
      rb.disabled = true; await wait(250);
      chk(rb.querySelector('span'), 'color', '#808080', 'greyed label');
      if (Number(W.getComputedStyle(rb).opacity) !== 1) bad.push('greyed button faded as a whole: ' + W.getComputedStyle(rb).opacity);
      rb.disabled = false;
      // the state tokens are SolidWorks' (hover sw-03, pressed sw-02, boxed tree row sw-04, selection sw-05)
      var cs = W.getComputedStyle(D.documentElement);
      [['--c-hover', '#edeff2'], ['--c-hover-line', '#b1b1b1'], ['--c-press', '#a2a7ae'], ['--c-press-line', '#6e6e6e'], ['--c-row-hover', '#fefefe'], ['--c-row-hover-line', '#838383'],
        ['--c-sel', '#b4d2e8'], ['--c-sel-line', '#85a4c7'], ['--c-caret', '#3c3f42'], ['--c-twisty', '#636262'], ['--msg-bg', '#ffff80'], ['--msg-line', '#acacac']].forEach(function (p) {
        n++; if (!rfMCnear(rfMCrgb(cs.getPropertyValue(p[0])), p[1], 0)) bad.push(p[0] + ' ' + cs.getPropertyValue(p[0]).trim() + ' (SolidWorks ' + p[1] + ')');
      });
      // no accent bar on the active tabs: SolidWorks marks them by the lighter ground
      [['#ribbon .rtab.active', 'CommandManager'], ['#fm-tabs button.active', 'FeatureManager']].forEach(function (p) {
        var sh = W.getComputedStyle(D.querySelector(p[0])).boxShadow; n++;
        (sh.match(/rgba?\([^)]*\)/g) || []).forEach(function (c) { var k = rfMCrgb(c); if (k.a > 0 && k.b - k.r > 40) bad.push(p[1] + ' active tab still has a blue bar: ' + sh); });
      });
    } finally { await rfMCreset(prev); }
    assert(!bad.length, bad.join('; '));
    return n + ' colours';
  });

  step('rfMC: the graphics area\'s Gradient is SolidWorks\' — white at the top left, pale blue-grey toward the lower right (within 6 levels of sw-01 at the corners and the cloud), two layers mixed with darken', async function () {
    var prev = rfMCtheme(), bad = [], got = [];
    try {
      await rfMCreset('light'); await rfMCpart();
      var bgWas = UI.App.view.bg; UI.setBackground('gradient', true); await wait(50);
      var vp = $('viewport'), cs = W.getComputedStyle(vp);
      if (!vp.classList.contains('vp-light')) bad.push('no vp-light');
      if (!/darken/.test(cs.backgroundBlendMode)) bad.push('blend ' + cs.backgroundBlendMode);
      var img = cs.backgroundImage;
      // the strength at (u, v) of the box: the larger of the two layers, each read from the computed gradients
      var rad = /radial-gradient\(\s*([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%\s*,\s*(rgba?\([^)]*\))\s*0%\s*,\s*rgba?\([^)]*\)\s*([\d.]+)%\s*,\s*(rgba?\([^)]*\))\s*100%/.exec(img);
      var lin = /linear-gradient\(\s*(rgba?\([^)]*\))\s*0%\s*,\s*rgba?\([^)]*\)\s*([\d.]+)%\s*,\s*(rgba?\([^)]*\))\s*([\d.]+)%\s*,\s*rgba?\([^)]*\)\s*([\d.]+)%\s*\)/.exec(img);
      if (!rad || !lin) bad.push('gradient not the two-layer form: ' + img.slice(0, 200));
      else {
        var K = rfMCrgb(rad[5]), Wt = rfMCrgb(rad[7]), B = rfMCrgb(lin[3]);
        function mix(a, b, t) { return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: 1 }; }
        function at(u, v) {
          var dx = (u - rad[3] / 100) / (rad[1] / 100), dy = (v - rad[4] / 100) / (rad[2] / 100), r = Math.sqrt(dx * dx + dy * dy), p = rad[6] / 100;
          var c1 = r <= p ? K : r >= 1 ? Wt : mix(K, Wt, (r - p) / (1 - p));
          var a = lin[2] / 100, m = lin[4] / 100, e = lin[5] / 100;
          var c2 = v <= a ? Wt : v < m ? mix(Wt, B, (v - a) / (m - a)) : v < e ? mix(B, Wt, (v - m) / (e - m)) : Wt;
          return { r: Math.min(c1.r, c2.r), g: Math.min(c1.g, c2.g), b: Math.min(c1.b, c2.b), a: 1 };
        }
        // sw-01's graphics area (x 334..1878, y 128..727): top left #fefefe, bottom right #f8f9fb, the cloud #d9dde9 at (1486, 443)
        [[0, 0, '#fefefe', 'top left'], [1, 1, '#f8f9fb', 'bottom right'], [0.746, 0.526, '#d9dde9', 'the cloud']].forEach(function (p) {
          var c = at(p[0], p[1]); got.push(p[3] + ' ' + rfMChex(c));
          if (!rfMCnear(c, p[2], 6)) bad.push(p[3] + ' ' + rfMChex(c) + ' (SolidWorks ' + p[2] + ')');
        });
      }
      UI.setBackground(bgWas, true);
    } finally { await rfMCreset(prev); }
    assert(!bad.length, bad.join('; '));
    return got.join(', ');
  });

  step('rfMC: text keeps 4.5 : 1 on SolidWorks\' greys (menu row, button label, both tabs, tree row, status bar, a menu, the PropertyManager message); greyed text is SolidWorks\' #808080', async function () {
    var prev = rfMCtheme(), bad = [], worst = 99, n = 0;
    try {
      await rfMCreset('light'); await rfMCpart();
      function txt(sel, label) {
        var e = typeof sel === 'string' ? D.querySelector(sel) : sel;
        if (!e) { bad.push(label + ' missing'); return; }
        var k = rfMCratio(rfMCrgb(W.getComputedStyle(e).color), rfMCground(e)); n++; worst = Math.min(worst, k);
        if (k < 4.5) bad.push(label + ' ' + k.toFixed(2));
      }
      txt('#menubar #menus > li', 'menu row');
      txt('#ribbon-buttons .rb:not(:disabled) span', 'button label');
      txt('#ribbon .rtab.active', 'active tab');
      txt('#ribbon .rtab:not(.active):not(.off)', 'inactive tab');
      txt('#tree .ti .nm', 'tree row');
      txt('#status-msg', 'status bar');
      txt('#status-right > span', 'status chip');
      UI.showMenu(200, 120, [{ label: 'Edit Feature', key: 'Ctrl+E', action: function () { } }]); await wait(30);
      txt('.menu .mi', 'menu item'); txt('.menu .mi .key', 'menu key');
      UI.closeMenus();
      var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude'; })[0];
      UI.editFeature(f); await idle(); await wait(120);
      var msg = D.querySelector('#pm .pm-msg, #pm .pm-group-msg .pm-fields');
      if (msg) txt(msg, 'PropertyManager message');
      txt('#pm .pm-row label', 'PropertyManager label');
      UI.pmCancel(); await idle();
      var dimRow = W.getComputedStyle(D.documentElement).getPropertyValue('--c-greyed').trim();
      if (!rfMCnear(rfMCrgb(dimRow), '#808080', 0)) bad.push('--c-greyed ' + dimRow);
    } finally { await rfMCreset(prev); }
    assert(!bad.length, bad.join('; '));
    return n + ' texts, lowest ' + worst.toFixed(2);
  });

  // (swDark: the tab strip and the FeatureManager tabs carry the values after lane swribbon, same round, which boxed the
  // inactive tabs and opened the active one in both themes: their borders changed, the dark palette did not)
  // what the dark default look and the Mastercam profile computed at 726c95c (before this lane): a 6-hex djb2 of each
  // value in RFMC_KEYS order (tokens, then color | background | image | borders | shadow | opacity of each element)
  var RFMC_KEYS = ['--c-sunken', '--c-panel', '--c-raised', '--c-field', '--c-field-line', '--c-line-soft', '--c-line', '--c-line-strong', '--c-hover', '--c-hover-line', '--c-press', '--c-press-line', '--c-sel', '--c-sel-line', '--c-text', '--c-muted', '--c-disabled', '--c-default', '--c-default-hover', '--c-focus', '--c-accent', '--c-accent-hover', '--c-accent-text', '--c-ok', '--c-warn', '--c-err', '--c-info', '--msg-bg', '--msg-line', '--msg-text', '--msg-head', '--sw-msg-bg', '--sw-msg-head', '--sw-msg-line', '--sw-twisty', '--dw-tab-line', '--dw-tab-muted', '--menu-bg', '--sw-menu-gutter',
    '#menubar', '#ribbon', '#ribbon-tabs', '#ribbon-tabs .rtab:not(.active)', '#ribbon-tabs .rtab.active', '#ribbon-buttons .rb', '#ribbon-buttons .rb span', '#left', '#tree', '#tree .ti .nm', '#tree .ti .tw', '#fm-tabs', '#fm-tabs button.active', '#fm-tabs button:not(.active)', '#tree-filter input', '#statusbar', '#status-msg', '#viewport', '#tp-strip', '#menubar #search'];
  var RFMC_BEFORE = {
    swDark: '5ec398982d5cc63c2b2adabb1b166e000370e86a73764c24edeaefc76cb3eafe13923d42a2b5b598641a8663e70c10f6f8e423ecad6191bb9db7cb7bb7cb7b7fb1d489dc2ecdfd0ebadfef67ca0489dc2ef744a7f8928c80662c71222bf744a771222bf8928c0c10f650eaaf2ac9e8c63c2bc63c2bf4643cf4643c47c97ffc36fde940581124515662b718313ecba4695662b7e3fa2f63ce3543c3d06a425f9e4ca9cde5355662b71b28bc1265809e4ca9',
    mcLight: '538d6c538d6c538d6c538d6ced0122817c4a1e8510ed012271a2687901f8b75972894b5eb75972894b5ef80467f923d0d4f29b71464fc6a1eb71464f3c81fa1fbe923c81fa51b8e873dde046b27b3c81fa52c97997d0b23b183352c97952c97952c97997d0b2f923d0f92c21f80467538d6c538d6c15155f15155f294bb6f0b0c6f2251af1fb6c646e0333179fee6eca646e0308ce1b15155f92a489cfc4a976422483d2aa7b22cb5d3133ee6eca764224',
    mcDark: 'a24f44a24f44eac25082f06a3cbc30c8f62042e4c93cbc30d8f26e9713aa91148fe8b63291148fe8b632743a3365d8b32f7a19e82e2a3d89fc9bee7fb7cb7b7fb1d489dc2ecdfd0ebadfef67ca0489dc2ef744a7f8928c80662cf744a7f744a7f744a7f8928c65d8b3e7070d743a33eac250eac2502ba3972ba3970515872816a4587eca7eec96852e4bd702c30765bf852e4ba150ef2ba397b41acdfe091d8ea4c883d2aa7b22cb43cd7b1b86b38ea4c8'
  };
  function rfMChash(s) { var x = 5381; for (var i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return ('00000000' + (x >>> 0).toString(16)).slice(-6); }
  function rfMCsnap() {
    var cs = W.getComputedStyle(D.documentElement);
    return RFMC_KEYS.map(function (k) {
      if (k.indexOf('--') === 0) return cs.getPropertyValue(k).trim();
      var e = D.querySelector(k); if (!e) return 'missing';
      var c = W.getComputedStyle(e);
      return [c.color, c.backgroundColor, c.backgroundImage, c.borderTopColor, c.borderRightColor, c.borderBottomColor, c.boxShadow, c.opacity].join('|');
    });
  }
  function rfMCcompare(name, vals, bad) {
    var want = RFMC_BEFORE[name];
    vals.forEach(function (v, i) { if (rfMChash(v) !== want.slice(i * 6, i * 6 + 6)) bad.push(name + ' ' + RFMC_KEYS[i] + ' [' + rfMChash(v) + '] = ' + v.slice(0, 90)); });
  }

  step('rfMC: the dark default look and the Mastercam profile (light and dark) are exactly what they were before SolidWorks\' colours (40 tokens, 20 elements each), and every token this lane added resolves in all four', async function () {
    var prev = rfMCtheme(), bad = [];
    var NEW = ['--c-popup', '--c-field-quiet', '--c-line-bar', '--c-row-hover', '--c-row-hover-line', '--c-caret', '--c-twisty', '--c-rollback', '--c-status', '--c-tabstrip', '--c-tab', '--c-tab-line', '--c-tab-text', '--c-tab-mark', '--c-off-opacity', '--c-off-text', '--c-off-icon', '--c-greyed', '--c-search-line', '--c-group-sep'];
    function resolves(where) { var cs = W.getComputedStyle(D.documentElement); NEW.forEach(function (t) { if (!cs.getPropertyValue(t).trim()) bad.push(where + ' ' + t + ' empty'); }); }
    try {
      await rfMCreset('light'); await anvil.newPart(); await idle(); await anvil.run(RFMC_BOX); await idle(); await rfMCsettle();
      resolves('light');
      UI.setTheme('dark'); await rfMCsettle();
      resolves('dark'); rfMCcompare('swDark', rfMCsnap(), bad);
      anvil.profile('mastercam'); await wait(600);
      UI.setTheme('light'); await rfMCsettle();
      resolves('mastercam light'); rfMCcompare('mcLight', rfMCsnap(), bad);
      UI.setTheme('dark'); await rfMCsettle();
      resolves('mastercam dark'); rfMCcompare('mcDark', rfMCsnap(), bad);
    } finally { await rfMCreset(prev); }
    assert(!bad.length, bad.slice(0, 12).join('; ') + (bad.length > 12 ? ' (+' + (bad.length - 12) + ')' : ''));
    return RFMC_KEYS.length + ' values x 3 unchanged';
  });
