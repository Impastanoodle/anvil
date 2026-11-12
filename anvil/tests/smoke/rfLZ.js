  // ---- rfLZ (2026-11-12, lane swtheme): the colour scheme of the default (SolidWorks) look. The user lifted the old
  // "grey, no blue" rule: "the color scheme on solidworks side to general improvement on looks, you can use any colors
  // that look clean and professional". What a look can promise without judging taste: every custom property the
  // stylesheets use resolves in both themes, text 4.5 : 1 and icon ink / control borders 3 : 1 measured on real
  // elements, the accent marks selection / focus / the default button, hover and pressed come from one set of state
  // tokens, and the layout did not move (colours only).
  function rfLZrgb(s) {
    s = String(s || '').trim();
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/.exec(s);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
    m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (m) { var x = m[1]; if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2]; return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16), a: 1 }; }
    return null;
  }
  function rfLZlum(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function rfLZratio(a, b) { var x = rfLZlum(a), y = rfLZlum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function rfLZhue(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h: h, chroma: d };
  }
  // the colour an element's text sits on: its own background or the first opaque one behind it, translucent ones blended
  function rfLZground(el) {
    var stack = [];
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var c = rfLZrgb(W.getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a > 0.98) break; }
    }
    var base = { r: 255, g: 255, b: 255, a: 1 };
    if (stack.length && stack[stack.length - 1].a > 0.98) base = stack.pop();
    while (stack.length) { var t = stack.pop(); base = { r: base.r + (t.r - base.r) * t.a, g: base.g + (t.g - base.g) * t.a, b: base.b + (t.b - base.b) * t.a, a: 1 }; }
    return base;
  }
  function rfLZtok(name) { return rfLZrgb(W.getComputedStyle(D.documentElement).getPropertyValue(name)); }
  function rfLZsame(a, b) { return !!(a && b && Math.abs(a.r - b.r) < 1.5 && Math.abs(a.g - b.g) < 1.5 && Math.abs(a.b - b.b) < 1.5); }
  // a colour in the accent's family: a clear blue within 12 degrees of the accent's hue
  function rfLZaccentish(c) { var a = rfLZhue(rfLZtok('--c-accent')), k = c && rfLZhue(c); return !!(k && k.chroma > 0.12 && Math.abs(k.h - a.h) < 12); }
  function rfLZtheme() { return D.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
  async function rfLZpart() {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(-20, -10, 40, 20).extrude(10);\np.sketch("Front").circle(0, 5, 3).extrude(5);'); await idle();
  }
  function rfLZsheetRules() {
    var out = [];
    Array.prototype.forEach.call(D.styleSheets, function (sh) {
      var n = String(sh.href || '').replace(/[?#].*$/, '').split('/').pop();
      if (n !== 'style.css' && n !== 'drawing.css') return;
      (function walk(list) { Array.prototype.forEach.call(list || [], function (r) { if (r.style) out.push({ sheet: n, rule: r }); if (r.cssRules && r.cssRules.length) walk(r.cssRules); }); })(sh.cssRules);
    });
    return out;
  }
  // the outer boxes in the ui-smoke frame: colours only, so they do not move with a colour change. Measured at 92921d5;
  // re-measured for lane swribbon (2026-11-12), which gave the default profile SolidWorks' real sizes (title row 44,
  // CommandManager 117 + tab strip 23, FeatureManager tabs under a 24 px grip band): ribbon / tree / PM moved, status kept
  var RFLZ_BOXES = { ribbon: [0, 44.28, 1528, 140], tree: [0, 184.28, 296, 410.72], pm: [-0.31, 246.28, 295, 348.72], status: [0, 595, 1528, 22] };   // (the smoke frame starts the app 0.28 px down: ui-smoke.html SMOKE_PHASE)
  function rfLZboxes() {
    var o = {};
    [['ribbon', '#ribbon'], ['tree', '#left'], ['pm', '#pm'], ['status', '#statusbar']].forEach(function (p) {
      var e = D.querySelector(p[1]), r = e && e.getBoundingClientRect();
      o[p[0]] = r ? [Math.round(r.left * 100) / 100, Math.round(r.top * 100) / 100, Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100] : null;
    });
    return o;
  }

  step('rfLZ: every custom property style.css and drawing.css use resolves — root tokens in the light and the dark theme, element tokens on their real elements (PropertyManager, graphics area); Mastercam\'s own (set by its profile) left out', async function () {
    var used = {}, declared = {}, rootish = {}, prev = rfLZtheme(), bad = [];
    rfLZsheetRules().forEach(function (x) {
      var r = x.rule, sel = r.selectorText || '', t = r.style.cssText, m, re = /var\(\s*(--[\w-]+)\s*(,)?/g;
      var profile = /data-profile|\.mc-/.test(sel);
      while ((m = re.exec(t))) if (!m[2] && !profile && !used[m[1]]) used[m[1]] = x.sheet + ' ' + sel.slice(0, 60);
      for (var i = 0; i < r.style.length; i++) {
        var n = r.style[i];
        if (n.indexOf('--') !== 0) continue;
        declared[n] = true;
        if (/^:root(\[data-theme="dark"\])?(, :root\[data-theme="dark"\])?$/.test(sel)) rootish[n] = true;
      }
    });
    await rfLZpart();
    UI.editFeature(UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[0]); await idle();
    var holders = ['#pm', '#viewport', '#hud', '#tree', '#ribbon', '#statusbar', '#drawing-tabs'].map(function (s) { return D.querySelector(s); }).filter(Boolean);
    try {
      ['light', 'dark'].forEach(function (th) {
        UI.setTheme(th);
        Object.keys(used).forEach(function (n) {
          if (rootish[n]) { if (!W.getComputedStyle(D.documentElement).getPropertyValue(n).trim()) bad.push(th + ' ' + n + ' (root) empty'); return; }
          var ok = W.getComputedStyle(D.documentElement).getPropertyValue(n).trim() || holders.some(function (h) { return W.getComputedStyle(h).getPropertyValue(n).trim(); });
          if (!ok && !declared[n]) bad.push(th + ' ' + n + ' never declared (' + used[n] + ')');
        });
      });
    } finally { UI.setTheme(prev); if (UI.hasPM()) UI.pmCancel(); await idle(); }
    assert(Object.keys(used).length > 150, 'tokens found: ' + Object.keys(used).length);
    assert(!bad.length, bad.slice(0, 10).join('; ') + (bad.length > 10 ? ' (+' + (bad.length - 10) + ')' : ''));
    return Object.keys(used).length + ' tokens';
  });

  step('rfLZ: contrast from computed styles of real elements, light and dark — text 4.5 : 1 (ribbon label, tabs, tree row, selected row, muted key, menu item, PM label and field, status bar, tooltip, dialog and default buttons); icon ink and control borders 3 : 1', async function () {
    var prev = rfLZtheme(), bad = [], n = 0, worst = 99;
    await rfLZpart();
    var cut = UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[1] || UI.App.model.features[0];
    try {
      for (var ti = 0; ti < 2; ti++) {
        var th = ['light', 'dark'][ti];
        UI.setTheme(th); await wait(250);   // buttons and tabs fade colours in 90 ms
        var checks = [];
        function txt(sel, min, label) { var e = typeof sel === 'string' ? D.querySelector(sel) : sel; if (!e) { bad.push(th + ' ' + label + ' missing'); return; } checks.push([e, min, label]); }
        txt('#ribbon .rb span', 4.5, 'ribbon label');
        txt('#ribbon .rtab.active', 4.5, 'active tab');
        txt('#ribbon .rtab:not(.active):not(.off)', 4.5, 'tab');
        UI.App.sel = { kind: 'feature', id: cut.id }; UI.refreshTree();
        txt('#tree .ti:not(.selected) .nm', 4.5, 'tree row');
        txt('#tree .ti.selected .nm', 4.5, 'selected tree row');
        txt('#status-msg', 4.5, 'status message');
        txt('#status-right > span', 4.5, 'status chip');
        UI.showMenu(200, 120, [{ label: 'Edit Feature', key: 'Ctrl+E', action: function () { } }, { label: 'Suppress', action: function () { } }, { label: 'Off', disabled: true, action: function () { } }]);
        await wait(30);
        txt('.menu .mi:not(.disabled)', 4.5, 'menu item');
        txt('.menu .mi .key', 4.5, 'muted key in a menu');
        checks.forEach(function (c) { var k = rfLZratio(rfLZrgb(W.getComputedStyle(c[0]).color), rfLZground(c[0])); n++; worst = Math.min(worst, k); if (k < c[1]) bad.push(th + ' ' + c[2] + ' ' + k.toFixed(2)); });
        checks = [];
        UI.closeMenus();
        UI.App.sel = null; UI.refreshTree();
        // tooltip
        var btn = D.querySelector('#ribbon-buttons .rb');
        btn.dispatchEvent(new W.MouseEvent('mouseover', { bubbles: true, clientX: 1, clientY: 1 }));
        var tip = null;
        for (var i = 0; i < 40 && !tip; i++) { var t = D.querySelector('.tip'); if (t && !t.hidden && t.textContent) tip = t; else await wait(50); }
        if (tip) { txt(tip.querySelector('b') || tip, 4.5, 'tooltip title'); if (tip.querySelector('.tip-desc')) txt(tip.querySelector('.tip-desc'), 4.5, 'tooltip text'); }
        else bad.push(th + ' no tooltip');
        checks.forEach(function (c) { var k = rfLZratio(rfLZrgb(W.getComputedStyle(c[0]).color), rfLZground(c[0])); n++; worst = Math.min(worst, k); if (k < c[1]) bad.push(th + ' ' + c[2] + ' ' + k.toFixed(2)); });
        checks = [];
        btn.dispatchEvent(new W.MouseEvent('mouseout', { bubbles: true, clientX: 1, clientY: 1 }));
        // the PropertyManager
        UI.editFeature(UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[0]); await idle(); await wait(120);
        txt('#pm .pm-row label', 4.5, 'PM label');
        txt('#pm input.pm-num, #pm input[type=number], #pm input[type=text]', 4.5, 'PM field');
        txt('#pm .pm-group > h4', 4.5, 'PM group title');
        var box = D.querySelector('#pm input[type=checkbox]');
        if (box) { var bl = rfLZrgb(W.getComputedStyle(box).borderTopColor); n++; if (bl && bl.a > 0.5) { var kb = rfLZratio(bl, rfLZground(box.parentElement)); if (kb < 3) bad.push(th + ' PM check box border ' + kb.toFixed(2)); } }
        var fld = D.querySelector('#pm .pm-num-wrap, #pm select');
        if (fld) { var fl = rfLZrgb(W.getComputedStyle(fld).borderTopColor), kf = rfLZratio(fl, rfLZground(fld.parentElement)); n++; if (kf < 3) bad.push(th + ' PM field border ' + kf.toFixed(2)); }
        checks.forEach(function (c) { var k = rfLZratio(rfLZrgb(W.getComputedStyle(c[0]).color), rfLZground(c[0])); n++; worst = Math.min(worst, k); if (k < c[1]) bad.push(th + ' ' + c[2] + ' ' + k.toFixed(2)); });
        checks = [];
        UI.pmCancel(); await idle();
        // a dialog: a plain and a default button
        UI.showModal({ title: 'rfLZ', body: '<p>Body text</p>', buttons: [{ label: 'OK', primary: true, action: UI.closeModal }, { label: 'Cancel', action: UI.closeModal }] });
        await wait(150);
        txt('#modal-body p', 4.5, 'dialog text');
        txt('#modal-buttons .btn:not(.primary)', 4.5, 'dialog button');
        txt('#modal-buttons .btn.primary', 4.5, 'default button');
        var plain = D.querySelector('#modal-buttons .btn:not(.primary)');
        if (plain) { var pl = rfLZrgb(W.getComputedStyle(plain).borderTopColor), kp = rfLZratio(pl, rfLZground(plain.parentElement)); n++; if (kp < 3) bad.push(th + ' button border ' + kp.toFixed(2)); }
        checks.forEach(function (c) { var k = rfLZratio(rfLZrgb(W.getComputedStyle(c[0]).color), rfLZground(c[0])); n++; worst = Math.min(worst, k); if (k < c[1]) bad.push(th + ' ' + c[2] + ' ' + k.toFixed(2)); });
        checks = [];
        UI.closeModal();
        // icon ink on the panels; the filter box's border
        var ink = W.getComputedStyle(D.querySelector('#tree .ti .ico, #tree .ti svg') || D.body).color;
        ['--c-raised', '--c-panel', '--c-sunken'].forEach(function (g) { var k = rfLZratio(rfLZtok('--icon-ink'), rfLZtok(g)); n++; if (k < 3) bad.push(th + ' icon ink on ' + g + ' ' + k.toFixed(2)); });
        var fi = D.querySelector('#tree-filter input');
        if (fi) { var k2 = rfLZratio(rfLZrgb(W.getComputedStyle(fi).borderTopColor), rfLZground(fi.parentElement)); n++; if (k2 < 3) bad.push(th + ' filter box border ' + k2.toFixed(2)); }
        if (!rfLZrgb(ink)) bad.push(th + ' tree icon colour unreadable');
      }
    } finally { UI.setTheme(prev); UI.closeMenus(); UI.closeModal(); if (UI.hasPM()) UI.pmCancel(); UI.App.sel = null; UI.refreshTree(); await idle(); }
    assert(!bad.length, bad.join('; '));
    return n + ' checks, lowest text ratio ' + worst.toFixed(2);
  });

  step('rfLZ: the drawing document — sheet tabs, the drawing tree and the drawing\'s properties keep 4.5 : 1 text in both themes, and the active sheet tab is marked in the accent', async function () {
    var prev = rfLZtheme(), bad = [], n = 0;
    await rfLZpart();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(80);
    try {
      for (var ti = 0; ti < 2; ti++) {
        var th = ['light', 'dark'][ti];
        UI.setTheme(th); await wait(120);
        var els = [].slice.call(D.querySelectorAll('#drawing-tabs .dw-tab, #drawing-tree .ti .nm, .dw-props label, .dw-props span, .dw-props .dw-tb-head')).filter(function (e) { return e.getClientRects().length && e.textContent.trim(); }).slice(0, 30);
        if (els.length < 3) bad.push(th + ' drawing text found: ' + els.length);
        els.forEach(function (e) { var k = rfLZratio(rfLZrgb(W.getComputedStyle(e).color), rfLZground(e)); n++; if (k < 4.5) bad.push(th + ' ' + (e.className || e.tagName) + ' "' + e.textContent.trim().slice(0, 16) + '" ' + k.toFixed(2)); });
        var act = D.querySelector('#drawing-tabs .dw-tab.active');
        var sh = act ? W.getComputedStyle(act).boxShadow : '';
        if (!act || !rfLZaccentish(rfLZrgb(sh))) bad.push(th + ' active sheet tab mark ' + sh);
      }
    } finally { UI.setTheme(prev); anvil.drawing.close(); await idle(); }
    assert(!bad.length, bad.join('; '));
    return n + ' texts';
  });

  step('rfLZ: the accent marks state — a selected tree row, the dialog\'s default button, a focus ring, check boxes (accent-color) and the active CommandManager tab are in the accent\'s blue, in both themes; hover never is', async function () {
    var prev = rfLZtheme(), bad = [], seen = [];
    await rfLZpart();
    var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude'; })[0];
    try {
      for (var ti = 0; ti < 2; ti++) {
        var th = ['light', 'dark'][ti];
        UI.setTheme(th); await wait(250);
        var acc = rfLZtok('--c-accent');
        if (!acc || rfLZhue(acc).chroma < 0.3) bad.push(th + ' --c-accent is not a clear colour: ' + W.getComputedStyle(D.documentElement).getPropertyValue('--c-accent'));
        UI.App.sel = { kind: 'feature', id: f.id }; UI.refreshTree();
        var row = D.querySelector('#tree .ti.selected');
        if (!row) bad.push(th + ' no selected row');
        else {
          var cs = W.getComputedStyle(row);
          if (!rfLZaccentish(rfLZrgb(cs.backgroundColor)) && !rfLZaccentish(rfLZrgb(cs.boxShadow))) bad.push(th + ' selected row ' + cs.backgroundColor + ' / ' + cs.boxShadow);
          if (!rfLZsame(rfLZrgb(cs.backgroundColor), rfLZtok('--c-sel'))) bad.push(th + ' selected row not --c-sel');
        }
        UI.showModal({ title: 'rfLZ', body: '<p>x</p>', buttons: [{ label: 'OK', primary: true, action: UI.closeModal }, { label: 'Cancel', action: UI.closeModal }] });
        await wait(150);
        var p = D.querySelector('#modal-buttons .btn.primary'), pb = p && rfLZrgb(W.getComputedStyle(p).backgroundColor);
        if (!rfLZaccentish(pb)) bad.push(th + ' default button ' + (p && W.getComputedStyle(p).backgroundColor));
        if (!rfLZsame(pb, rfLZtok('--c-default'))) bad.push(th + ' default button not --c-default');
        UI.closeModal();
        var fi = D.querySelector('#tree-filter input');
        fi.focus(); await wait(30);
        var fc = rfLZrgb(W.getComputedStyle(fi).borderTopColor);
        if (!rfLZaccentish(fc) || !rfLZaccentish(rfLZtok('--c-focus'))) bad.push(th + ' focus ring ' + W.getComputedStyle(fi).borderTopColor);
        fi.blur();
        var cb = D.createElement('input'); cb.type = 'checkbox'; D.querySelector('#tree').appendChild(cb);
        var ac = rfLZrgb(W.getComputedStyle(cb).accentColor); cb.remove();
        if (!rfLZaccentish(ac)) bad.push(th + ' accent-color ' + (ac && JSON.stringify(ac)));
        var tab = D.querySelector('#ribbon .rtab.active');
        // swcolors (2026-11-12): SolidWorks marks the active tab by its lighter ground only (sw-01..03): no bar in the light theme
        if (th === 'light') { var itab = D.querySelector('#ribbon .rtab:not(.active):not(.off)'); if (!tab || !itab || !(rfLZlum(rfLZrgb(W.getComputedStyle(tab).backgroundColor)) > rfLZlum(rfLZrgb(W.getComputedStyle(itab).backgroundColor)) + 0.1)) bad.push(th + ' active tab not lighter than the others'); }
        else if (!tab || !rfLZaccentish(rfLZrgb((W.getComputedStyle(tab).boxShadow.match(/rgba?\([^)]*\)[^,]*-2px/) || [''])[0]))) bad.push(th + ' active tab bar ' + (tab && W.getComputedStyle(tab).boxShadow));
        if (rfLZaccentish(rfLZtok('--c-hover')) || rfLZaccentish(rfLZtok('--c-hover-line'))) bad.push(th + ' hover is in the accent');
        seen.push(th + ' ' + W.getComputedStyle(D.documentElement).getPropertyValue('--c-accent').trim());
      }
    } finally { UI.setTheme(prev); UI.closeModal(); UI.App.sel = null; UI.refreshTree(); }
    assert(!bad.length, bad.join('; '));
    return seen.join(', ');
  });

  step('rfLZ: hover and pressed of a ribbon button, a toolbar button and a tree row come from the same state tokens (--c-hover / --c-press), and the status colours are the tokens', async function () {
    var want = [
      ['#ribbon .rb:hover:not(:disabled)', 'var(--c-hover)'], ['#ribbon .rb:active:not(:disabled)', 'var(--c-press)'],
      ['#menubar .std-btn:hover:not(:disabled)', 'var(--c-hover)'], ['#menubar .std-btn:active:not(:disabled)', 'var(--c-press)'],
      ['#tree .ti:hover, #tree .ti.hover-sync', 'var(--c-row-hover)'],   // swcolors: sw-04's boxed row (an alias of --c-hover outside the light default look)
      ['.menu .mi:hover:not(.disabled)', 'var(--c-hover)'], ['#ribbon .rtab:not(.active):not(.off):hover', 'var(--c-hover)'],
      ['#status-right .sk-state.over, #status-right .sk-state.conflict', 'var(--c-err)', 'color'], ['#status-right .sk-state.under', 'var(--c-info)', 'color']
    ];
    var rules = rfLZsheetRules(), bad = [];
    want.forEach(function (w) {
      var hits = rules.filter(function (x) { return x.rule.selectorText === w[0]; });
      if (!hits.length) { bad.push('no rule ' + w[0]); return; }
      var last = hits[hits.length - 1].rule.style, v = (w[2] === 'color' ? last.color : (last.backgroundColor || last.background)).trim();
      if (v !== w[1]) bad.push(w[0] + ' = ' + v);
    });
    // and in the page: a hovered tree row and a pressed (checked) ribbon button paint the resolved tokens
    await rfLZpart();
    var row = D.querySelector('#tree .ti:not(.selected)');
    row.classList.add('hover-sync');
    if (!rfLZsame(rfLZrgb(W.getComputedStyle(row).backgroundColor), rfLZtok('--c-row-hover'))) bad.push('hovered tree row ' + W.getComputedStyle(row).backgroundColor);
    row.classList.remove('hover-sync');
    var rb = D.querySelector('#ribbon-buttons > .rb:not(:disabled)');
    rb.classList.add('active'); await wait(200);
    if (!rfLZsame(rfLZrgb(W.getComputedStyle(rb).backgroundColor), rfLZtok('--c-press'))) bad.push('pressed ribbon button ' + W.getComputedStyle(rb).backgroundColor);
    rb.classList.remove('active');
    assert(!bad.length, bad.join('; '));
  });

  step('rfLZ: colours only — the CommandManager, the FeatureManager, the PropertyManager and the status bar keep the boxes they had before the new colours (measured at 92921d5)', async function () {
    await rfLZpart();
    UI.setRibbonTab('Features');
    UI.editFeature(UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[0]); await idle(); await wait(120);
    var now = rfLZboxes();
    UI.pmCancel(); await idle();
    if (!RFLZ_BOXES) return 'measured (no reference yet): ' + JSON.stringify(now);
    var bad = [];
    Object.keys(RFLZ_BOXES).forEach(function (k) {
      var a = RFLZ_BOXES[k], b = now[k];
      // (the PropertyManager slides in by a fraction of a pixel: its left edge within 0.5 px, the rest exact)
      if (!b || a.some(function (v, i) { return Math.abs(v - b[i]) > (k === 'pm' && i === 0 ? 0.5 : 0.01); })) bad.push(k + ' ' + JSON.stringify(b) + ' (was ' + JSON.stringify(a) + ')');
    });
    assert(!bad.length, bad.join('; '));
    return JSON.stringify(now);
  });
