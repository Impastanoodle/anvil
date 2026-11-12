  // ---- rfGX (2026-11-03, lane chrome): the application chrome refurbish — one grey ramp (--c-*), a 4 px spacing scale,
  // one type scale. Checks the measurable parts: the tokens are neutral greys in both themes, controls sit on the row
  // grid (24 px controls on the 28 px menu bar, 22 px tree rows, 24 px status bar), the CommandManager keeps its height
  // with 32 px / 16 px icons and aligned labels, menu labels align with and without icons, text contrast, dialogs.
  function rfGXrgb(s) {
    var m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/.exec(s || '');
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
    m = /#([0-9a-f]{6})\b/i.exec(s || '');
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
    return null;
  }
  function rfGXlum(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function rfGXcontrast(a, b) { var x = rfGXlum(a), y = rfGXlum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // the first opaque background behind an element
  function rfGXground(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var c = rfGXrgb(W.getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  function rfGXbox(sel) { var e = typeof sel === 'string' ? D.querySelector(sel) : sel; return e ? e.getBoundingClientRect() : null; }
  function rfGXtheme() { return D.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
  var RFGX_TOKENS = ['--c-sunken', '--c-panel', '--c-raised', '--c-field', '--c-field-line', '--c-line-soft', '--c-line', '--c-line-strong', '--c-hover', '--c-hover-line',
    '--c-press', '--c-press-line', '--c-sel', '--c-sel-line', '--c-text', '--c-muted', '--c-disabled', '--c-default', '--c-default-hover', '--c-default-text', '--c-focus'];

  // swtheme (2026-11-12, user: "any colors that look clean and professional"): the neutrals carry a slight cool tint
  // (chroma at most 25 levels, hue blue-grey) and the state tokens are the accent's family
  var RFGX_STATE = ['--c-press', '--c-press-line', '--c-sel', '--c-sel-line', '--c-default', '--c-default-hover', '--c-focus'];
  function rfGXhue(c) { var mx = Math.max(c.r, c.g, c.b), d = mx - Math.min(c.r, c.g, c.b), h = 0; if (d > 0) { h = mx === c.r ? ((c.g - c.b) / d) % 6 : mx === c.g ? (c.b - c.r) / d + 2 : (c.r - c.g) / d + 4; h *= 60; if (h < 0) h += 360; } return { h: h, d: d }; }
  step('rfGX: the chrome ramp is set in both themes, every neutral token a grey with at most a slight cool tint, the state tokens in the accent\'s blue, and the old chrome variables follow it', async function () {
    var prev = rfGXtheme(), bad = [];
    try {
      ['light', 'dark'].forEach(function (th) {
        UI.setTheme(th);
        var root = W.getComputedStyle(D.documentElement);
        RFGX_TOKENS.forEach(function (v) {
          var c = rfGXrgb(root.getPropertyValue(v).trim());
          if (!c) bad.push(th + ' ' + v + ' unset');
          // swcolors (2026-11-12): in the light theme pressed / checked is SolidWorks' grey (#a2a7ae + #6e6e6e, measured), a neutral
          else if (RFGX_STATE.indexOf(v) >= 0 && !(th === 'light' && /^--c-press/.test(v))) { var a = rfGXhue(rfGXrgb(root.getPropertyValue('--c-accent').trim())), k = rfGXhue(c); if (!(k.d > 20 && Math.abs(k.h - a.h) < 12)) bad.push(th + ' ' + v + ' not in the accent family: ' + root.getPropertyValue(v)); }
          else { var kn = rfGXhue(c); if (kn.d > 25 || (kn.d > 2 && !(kn.h >= 195 && kn.h <= 230))) bad.push(th + ' ' + v + ' not a (cool) grey: ' + root.getPropertyValue(v)); }
        });
        // the ramp is ordered: sunken < panel < raised in the light theme, the other way round where it matters in the dark
        var L = function (v) { return rfGXlum(rfGXrgb(root.getPropertyValue(v).trim())); };
        // swcolors: SolidWorks' FeatureManager is the CommandManager's own ground (#d7dade), so panel = raised in the light theme
        if (th === 'light' && !(L('--c-sunken') < L('--c-panel') && L('--c-panel') <= L('--c-raised'))) bad.push('light ramp out of order');
        if (th === 'dark' && !(L('--c-sunken') < L('--c-panel') && L('--c-panel') < L('--c-raised'))) bad.push('dark ramp out of order');
        if (!(L('--c-line-soft') !== L('--c-line') && Math.abs(L('--c-line-strong') - L('--c-raised')) > Math.abs(L('--c-line') - L('--c-raised')))) bad.push(th + ' line steps');
        [['--cm-bg', '--c-panel'], ['--sw-panel', '--c-raised'], ['--line', '--c-line'], ['--text', '--c-text'], ['--muted', '--c-muted'], ['--menu-bg', '--c-popup']]   // swcolors: menus have their own ground (--c-popup) now that the FeatureManager is SolidWorks' grey
          .forEach(function (p) {
          if (root.getPropertyValue(p[0]).trim() !== root.getPropertyValue(p[1]).trim()) bad.push(th + ' ' + p[0] + ' does not follow ' + p[1]);
        });
        ['--sp-1', '--sp-2', '--sp-3', '--sp-4'].forEach(function (v, i) { if (root.getPropertyValue(v).trim() !== (4 * (i + 1)) + 'px') bad.push(v + ' = ' + root.getPropertyValue(v)); });
      });
    } finally { UI.setTheme(prev); }
    assert(!bad.length, bad.join('; '));
  });

  step('rfGX: menu bar — the mark, menus, quick-access buttons and Search Commands are 24 px tall and centred on the 28 px row', async function () {
    var bar = rfGXbox('#menubar'), mid = bar.top + bar.height / 2, bad = [];
    assert(Math.round(bar.height) === 28, 'menu bar 28 px: ' + bar.height);
    var items = [].slice.call(D.querySelectorAll('#menus > li')).concat([].slice.call(D.querySelectorAll('#std-toolbar .std-btn:not(:disabled)')).filter(function (b) { return b.id !== 'std-undo' && b.id !== 'std-redo'; })).concat([D.getElementById('search')]);
    items.forEach(function (e) {
      var r = e.getBoundingClientRect();
      if (!r.width) return;
      if (Math.abs(r.height - 24) > 0.5) bad.push((e.id || e.textContent) + ' h ' + r.height);
      if (Math.abs(r.top + r.height / 2 - mid) > 0.6) bad.push((e.id || e.textContent) + ' off centre ' + (r.top + r.height / 2 - mid).toFixed(1));
    });
    var logo = rfGXbox('#logo');
    assert(logo && Math.round(logo.width) === 25 && Math.round(logo.height) === 16 && D.querySelector('#logo svg polygon'), 'the mark is a 16 px tall anvil');
    assert(Math.abs(logo.top + 8 - mid) <= 0.6, 'the mark is centred');
    var brand = W.getComputedStyle(D.getElementById('brand'));
    assert(brand.fontStyle === 'normal' && +brand.fontWeight >= 600, 'the name is upright semibold: ' + brand.fontStyle + ' ' + brand.fontWeight);
    D.querySelectorAll('#std-toolbar .std-btn .ico').forEach(function (i) { var r = i.getBoundingClientRect(); if (r.width && Math.round(r.width) !== 16) bad.push('std icon ' + r.width); });
    assert(!bad.length, bad.join('; '));
  });

  step('rfGX: CommandManager — height kept (76 + 22 px), 32 px large and 16 px small icons, labels of plain and flyout buttons on one line', async function () {
    UI.setRibbonTab('Features'); await idle();
    var rb = rfGXbox('#ribbon-buttons'), tabs = rfGXbox('#ribbon-tabs'), bad = [];
    assert(Math.round(rb.height) === 76, 'ribbon buttons row 76 px: ' + rb.height);
    assert(Math.round(tabs.height) === 22, 'tab strip 22 px: ' + tabs.height);
    // the graphics area starts where it did before the refurbish (tests pick there by pixel): CommandManager 99.28 px
    assert(Math.abs(rfGXbox('#ribbon').height - 99.28) < 0.05 && Math.round(rfGXbox('#statusbar').height) === 22, 'outer bar sizes kept: ribbon ' + rfGXbox('#ribbon').height);
    var plain = D.querySelector('#ribbon-buttons > .rb:not(:disabled)'), fly = D.querySelector('#ribbon-buttons > .rb-fly:not(.rb-fly-small) > .rb');
    assert(plain && fly, 'a plain and a flyout button on the Features tab');
    [plain, fly].forEach(function (b) { var i = b.querySelector('.ico').getBoundingClientRect(); if (Math.round(i.width) !== 32 || Math.round(i.height) !== 32) bad.push('large icon ' + i.width); });
    var pi = plain.querySelector('.ico').getBoundingClientRect(), fi = fly.querySelector('.ico').getBoundingClientRect();
    var ps = plain.querySelector('span').getBoundingClientRect(), fs = fly.querySelector('span').getBoundingClientRect();
    if (Math.abs(pi.top - fi.top) > 0.5) bad.push('icon tops ' + pi.top + ' / ' + fi.top);
    if (Math.abs(ps.top - fs.top) > 0.5) bad.push('label tops ' + ps.top + ' / ' + fs.top);
    D.querySelectorAll('#ribbon-buttons .rb-stack:not(.rb-grid) .rb .ico').forEach(function (i) { var r = i.getBoundingClientRect(); if (r.width && Math.round(r.width) !== 16) bad.push('small icon ' + r.width); });
    D.querySelectorAll('#ribbon-buttons .rb-stack:not(.rb-grid) > .rb').forEach(function (b) { var r = b.getBoundingClientRect(); if (r.width && Math.round(r.height) !== 22) bad.push('small button ' + r.height); });
    var lab = W.getComputedStyle(plain.querySelector('span'));
    assert(lab.fontSize === '11px' && lab.textAlign !== 'left', 'labels 11 px centred: ' + lab.fontSize);
    var act = D.querySelector('#ribbon .rtab.active'), off = D.querySelector('#ribbon .rtab:not(.active)');
    assert(rfGXground(act).r !== rfGXground(off).r || W.getComputedStyle(act).fontWeight !== W.getComputedStyle(off).fontWeight, 'the active tab stands out');
    assert(Math.abs(rfGXlum(rfGXground(act)) - rfGXlum(rfGXground(plain))) < 0.005, 'the active tab is the CommandManager grey, joined to it');
    assert(!bad.length, bad.join('; '));
  });

  step('rfGX: menus — 24 px rows, labels aligned with and without an icon, keys right-aligned, one popup style', async function () {
    var f = function () { };
    UI.showMenu(200, 200, [{ label: 'With icon', icon: 'extrude', action: f }, { label: 'Plain', action: f, key: 'Ctrl+H' }, { label: 'Checked', checked: true, action: f }, { sep: true }, { label: 'Greyed', disabled: true, action: f }]);
    var m = D.querySelector('.menu');
    try {
      assert(m, 'menu opened');
      var rows = m.querySelectorAll('.mi'), bad = [];
      rows.forEach(function (r) { var h = r.getBoundingClientRect().height; if (Math.abs(h - 24) > 0.5) bad.push('row ' + h); });
      var lefts = [].map.call(rows, function (r) { return Math.round(r.children[r.children.length - (r.querySelector('.key') ? 2 : 1)].getBoundingClientRect().left); });
      if (lefts.some(function (x) { return Math.abs(x - lefts[0]) > 0.5; })) bad.push('labels at ' + lefts.join(','));
      var key = m.querySelector('.key').getBoundingClientRect(), mr = rows[1].getBoundingClientRect();
      if (mr.right - key.right > 13) bad.push('key not at the right: ' + (mr.right - key.right));
      var cs = W.getComputedStyle(m);
      if (cs.borderRadius !== '3px') bad.push('radius ' + cs.borderRadius);
      var tipShadow = W.getComputedStyle(D.documentElement).getPropertyValue('--shadow-pop').trim();
      if (!tipShadow || cs.boxShadow === 'none') bad.push('no popup shadow');
      assert(!bad.length, bad.join('; '));
    } finally { UI.closeMenus(); }
  });

  step('rfGX: text contrast in the chrome is at least 4.5 : 1 (muted text 3 : 1), in the light and the dark theme', async function () {
    var prev = rfGXtheme(), bad = [];
    try {
      for (var ti = 0; ti < 2; ti++) {
        var th = ['light', 'dark'][ti];
        UI.setTheme(th);
        await wait(300);   // hover colours fade in 90 ms: read them settled
        var checks = [['#menus > li', 4.5], ['#doc-title', 4.5], ['#ribbon .rb span', 4.5], ['#ribbon .rtab.active', 4.5], ['#ribbon .rtab:not(.active)', 3], ['#tree .ti .nm', 4.5],
          ['#tree .ti.dim .nm', 3], ['#status-msg', 4.5], ['#status-right > span', 4.5]];
        checks.forEach(function (c) {
          var e = D.querySelector(c[0]);
          if (!e) return;
          var k = rfGXcontrast(rfGXrgb(W.getComputedStyle(e).color), rfGXground(e));
          if (k < c[1]) bad.push(th + ' ' + c[0] + ' ' + k.toFixed(2));
        });
      }
    } finally { UI.setTheme(prev); }
    assert(!bad.length, bad.join('; '));
  });

  step('rfGX: rows and bars — tree rows 22 px, filter box 22 px, status bar 22 px (outer bar sizes kept), Task Pane buttons 32 px', async function () {
    var bad = [];
    var ti = D.querySelector('#tree .ti'); if (Math.round(ti.getBoundingClientRect().height) !== 22) bad.push('tree row ' + ti.getBoundingClientRect().height);
    var fi = rfGXbox('#tree-filter input'); if (Math.round(fi.height) !== 22) bad.push('filter ' + fi.height);
    var sb = rfGXbox('#statusbar'); if (Math.round(sb.height) !== 22) bad.push('status bar ' + sb.height);
    var tp = D.querySelector('#tp-strip button'); if (tp && Math.round(tp.getBoundingClientRect().height) !== 32) bad.push('task pane button ' + tp.getBoundingClientRect().height);
    D.querySelectorAll('#fm-tabs button .ico, #tp-strip button .ico').forEach(function (i) { var r = i.getBoundingClientRect(); if (r.width && Math.round(r.width) !== 16) bad.push('pane icon ' + r.width); });
    assert(!bad.length, bad.join('; '));
  });

  step('rfGX: dialogs — 12 px body (tables too), a 24 px button row with one default button that stands out, in both themes', async function () {
    var prev = rfGXtheme(), bad = [];
    try {
      for (var ti = 0; ti < 2; ti++) {
        var th = ['light', 'dark'][ti];
        UI.setTheme(th);
        UI.showModal({ title: 'rfGX', body: '<p>Body</p><table><tr><th>Mass</th><td>1 kg</td></tr></table>', buttons: [{ label: 'OK', primary: true, onclick: function () { } }, { label: 'Cancel', onclick: function () { } }] });
        await wait(300);
        var td = D.querySelector('#modal-body td');
        if (W.getComputedStyle(td).fontSize !== '12px') bad.push(th + ' table text ' + W.getComputedStyle(td).fontSize);
        var btns = D.querySelectorAll('#modal-buttons .btn');
        btns.forEach(function (b) { if (Math.round(b.getBoundingClientRect().height) !== 24) bad.push(th + ' button h ' + b.getBoundingClientRect().height); });
        var p = D.querySelector('#modal-buttons .btn.primary'), o = [].filter.call(btns, function (b) { return !b.classList.contains('primary'); })[0];
        if (!p || !o) bad.push(th + ' no default / other button');
        else {
          var pb = rfGXrgb(W.getComputedStyle(p).backgroundColor), ob = rfGXrgb(W.getComputedStyle(o).backgroundColor);
          if (rfGXcontrast(pb, ob) < 3) bad.push(th + ' default button does not stand out ' + rfGXcontrast(pb, ob).toFixed(2));
          if (rfGXcontrast(pb, rfGXrgb(W.getComputedStyle(p).color)) < 4.5) bad.push(th + ' default button text');
        }
        UI.closeModal();
      }
    } finally { UI.closeModal(); UI.setTheme(prev); }
    assert(!bad.length, bad.join('; '));
  });
