  // ---- rfBQ: no blue in the chrome (style.css, drawing.css, icons.js). The user: "get rid of the blue hue everywhere,
  // replace with grey-black". A colour counts as blue when its hue is 190-250 degrees and its chroma (max - min channel)
  // is at least 4 % (a neutral grey has none); light and dark theme alike. The graphics-area ground and the sketch
  // colours (dimension / inference / Under Defined blue) are not chrome and are not checked here.
  function rfBQparse(s) {
    var out = [], re = /#([0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/gi, m;
    while ((m = re.exec(s || ''))) {
      if (m[1]) { var x = m[1]; if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2]; out.push({ r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16), a: 1, s: m[0] }); }
      else out.push({ r: +m[2], g: +m[3], b: +m[4], a: m[5] == null ? 1 : +m[5], s: m[0] });
    }
    return out;
  }
  function rfBQhue(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h: h, chroma: d };
  }
  function rfBQblue(c) { var k = rfBQhue(c); return c.a > 0 && k.chroma >= 0.04 && k.h >= 190 && k.h <= 250; }
  // every colour in a computed style / variable string that reads as blue, as "label: value"
  // swtheme (2026-11-12): the user lifted the no-blue rule for the chrome ("any colors that look clean and
  // professional"). The chrome now has one accent; a STRAY blue is a clear blue (chroma >= 0.1: the neutrals' slight cool
  // tint is less) that is not the accent's family (within 12 degrees of --c-accent's hue). Icons keep the old rule.
  function rfBQaccentHue() { var p = D.createElement('i'); p.style.color = 'var(--c-accent)'; D.body.appendChild(p); var c = rfBQparse(W.getComputedStyle(p).color)[0]; p.remove(); return c ? rfBQhue(c).h : -99; }
  function rfBQstrays(label, s) { var ah = rfBQaccentHue(); return rfBQparse(s).filter(function (c) { var k = rfBQhue(c); return rfBQblue(c) && k.chroma >= 0.1 && Math.abs(k.h - ah) >= 12; }).map(function (c) { return label + ': ' + c.s; }); }
  function rfBQaccentish(c) { var k = c && rfBQhue(c); return !!(k && k.chroma >= 0.12 && Math.abs(k.h - rfBQaccentHue()) < 12); }
  function rfBQblues(label, s) { return rfBQparse(s).filter(rfBQblue).map(function (c) { return label + ': ' + c.s; }); }
  function rfBQstyle(el, props) {
    var cs = W.getComputedStyle(el);
    return props.map(function (p) { return cs[p]; }).join(' ');
  }
  var RFBQ_PROPS = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'boxShadow', 'outlineColor'];
  var RFBQ_VARS = ['--blue', '--blue-hover', '--blue-soft', '--blue-line', '--sel', '--hover', '--group', '--group-text', '--pick-bg', '--pick-filled',
    '--bg', '--panel', '--panel-2', '--line', '--line-2', '--text', '--muted', '--input-line', '--btn-face', '--icon-ink', '--menu-bg', '--toast-bg', '--overlay',
    '--cm-bg', '--cm-strip', '--cm-tab', '--cm-line', '--cm-hover', '--cm-hover-line', '--cm-press', '--cm-press-line', '--cm-down',
    '--sw-chrome', '--sw-chrome-line', '--sw-panel', '--sw-row-hover', '--sw-row-sel', '--sw-row-sel-line', '--sw-group-head', '--sw-group-line',
    '--sw-pick', '--sw-pick-line', '--sw-help', '--sw-rollbar', '--sw-btn', '--sw-btn-hover', '--sw-default', '--sw-default-hover', '--sw-toast',
    '--dw-desk', '--dw-tabbar', '--dw-tab', '--dw-tab-on', '--dw-tab-line'];
  function rfBQtheme() { return D.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }

  step('rfBQ: the chrome colour variables (ribbon, FeatureManager, PropertyManager, buttons, menus, toasts, drawing tabs, HUD) hold no blue but the accent\'s, in the light and the dark theme', async function () {
    var prev = rfBQtheme(), bad = [], n = 0;
    try {
      ['light', 'dark'].forEach(function (th) {
        UI.setTheme(th);
        var root = W.getComputedStyle(D.documentElement), vp = W.getComputedStyle($('viewport'));
        RFBQ_VARS.forEach(function (v) { n++; bad = bad.concat(rfBQstrays(th + ' ' + v, root.getPropertyValue(v))); });
        ['--hud-hover', '--hud-hover-line', '--hud-on', '--hud-on-line'].forEach(function (v) { n++; bad = bad.concat(rfBQblues(th + ' ' + v, vp.getPropertyValue(v))); });   // the graphics area keeps the old rule (rfBR)
      });
    } finally { UI.setTheme(prev); }
    assert(bad.length === 0, 'blue left: ' + bad.join(', '));
    return n + ' variables checked';
  });

  step('rfBQ: a selected FeatureManager row, the active ribbon tab, a PropertyManager pick box, the PM OK button and a dialog\'s default button carry no blue but the accent\'s (light and dark theme); the default button is the accent; the active pick box stays magenta', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(-20, -10, 40, 20).extrude(10);'); await idle();
    UI.setRibbonTab('Sketch'); await idle();
    UI.cmdFillet(); await UI.previewIdle();
    assert(UI.hasPM() && D.querySelector('#pm .pm-pick') && D.querySelector('#pm .pm-ok'), 'Fillet PropertyManager with a pick box');
    UI.showModal({ title: 'rfBQ', body: '<p>default button</p>', buttons: [{ label: 'OK', primary: true, action: UI.closeModal }, { label: 'Cancel', action: UI.closeModal }] });
    var prev = rfBQtheme(), bad = [], dflt = {}, magenta = {};
    var row = D.querySelector('#tree .ti'), hadSel = row && row.classList.contains('selected');
    var pick = D.querySelector('#pm .pm-pick'), wasActive = pick.classList.contains('active');
    try {
      assert(row, 'a FeatureManager row');
      row.classList.add('selected');
      ['light', 'dark'].forEach(function (th) {
        UI.setTheme(th);
        bad = bad.concat(rfBQstrays(th + ' selected row', rfBQstyle(row, RFBQ_PROPS)));
        var tab = D.querySelector('#ribbon-tabs .rtab.active');
        assert(tab, 'an active ribbon tab');
        bad = bad.concat(rfBQstrays(th + ' active tab', rfBQstyle(tab, RFBQ_PROPS)));
        pick.classList.add('active');
        magenta[th] = rfBQparse(W.getComputedStyle(pick).borderTopColor)[0];
        pick.classList.remove('active');
        bad = bad.concat(rfBQstrays(th + ' pick box', rfBQstyle(pick, RFBQ_PROPS)));
        bad = bad.concat(rfBQstrays(th + ' PM OK', rfBQstyle(D.querySelector('#pm .pm-ok'), RFBQ_PROPS)));
        // the browser's own blue: a checkbox's accent and the selected text in a value box
        var cb = D.querySelector('#pm input[type=checkbox]'), num = D.querySelector('#pm input[type=number], #pm input[type=text]');
        if (cb) { var acc = W.getComputedStyle(cb).accentColor; if (acc === 'auto') bad.push(th + ' checkbox accent: the browser default'); bad = bad.concat(rfBQstrays(th + ' checkbox accent', acc)); }
        if (num) bad = bad.concat(rfBQstrays(th + ' selected text', W.getComputedStyle(num, '::selection').backgroundColor));
        var btn = D.querySelector('#modal-buttons .btn.primary');
        assert(btn, 'the dialog has a default button');
        bad = bad.concat(rfBQstrays(th + ' default button', rfBQstyle(btn, RFBQ_PROPS)));
        dflt[th] = rfBQparse(W.getComputedStyle(btn).backgroundColor)[0];
      });
    } finally {
      UI.setTheme(prev);
      if (row && !hadSel) row.classList.remove('selected');
      pick.classList.toggle('active', wasActive);
      UI.closeModal();
      if (UI.hasPM()) UI.pmCancel();
      UI.setRibbonTab('Features');
    }
    assert(bad.length === 0, 'stray blue: ' + bad.join(', '));
    var dl = dflt.light;
    assert(rfBQaccentish(dl) && rfBQaccentish(dflt.dark), 'the default button is the accent: ' + dl.s + ' / ' + dflt.dark.s);
    ['light', 'dark'].forEach(function (th) {
      var m = magenta[th], k = rfBQhue(m);
      assert(m && k.chroma > 0.3 && k.h > 290 && k.h < 345, th + ' active pick box magenta: ' + (m && m.s));
    });
    return 'default button ' + dl.s + ' (light), ' + dflt.dark.s + ' (dark)';
  });

  step('rfBQ: the ribbon icons of the Part tabs carry no blue fill or stroke, and a rendered sketch icon computes to greys (light and dark theme)', async function () {
    await anvil.newPart(); await idle();
    var bad = [], n = 0, seen = {};
    ['Features', 'Sketch', 'Evaluate', 'Sheet Metal'].forEach(function (tab) {
      UI.setRibbonTab(tab);
      Array.prototype.forEach.call($('ribbon-buttons').querySelectorAll('button.rb'), function (b) {
        var ic = b.dataset.icon;
        if (!ic || seen[ic]) return;
        seen[ic] = 1; n++;
        var svg = W.Icons(ic, 16), cols = [], re = /(?:fill|stroke|stop-color)="([^"]+)"/g, m;
        while ((m = re.exec(svg))) cols.push(m[1]);
        bad = bad.concat(rfBQblues(tab + ' ▸ ' + ic, cols.join(' ')));
      });
    });
    UI.setRibbonTab('Sketch'); await idle();
    var btn = Array.prototype.filter.call($('ribbon-buttons').querySelectorAll('button.rb'), function (b) { return /point|line|rect/i.test(b.dataset.icon || ''); })[0];
    assert(btn && btn.querySelector('svg.ico'), 'a sketch icon in the ribbon');
    var prev = rfBQtheme(), parts = 0;
    try {
      ['light', 'dark'].forEach(function (th) {
        UI.setTheme(th);
        Array.prototype.forEach.call(btn.querySelectorAll('svg.ico *'), function (e) { parts++; bad = bad.concat(rfBQblues(th + ' ' + btn.dataset.icon + ' <' + e.tagName + '>', rfBQstyle(e, ['fill', 'stroke', 'color']))); });
      });
    } finally { UI.setTheme(prev); UI.setRibbonTab('Features'); }
    assert(n > 40 && bad.length === 0, n + ' icons; blue left: ' + bad.join(', '));
    return n + ' icons, ' + btn.dataset.icon + ' rendered with ' + parts / 2 + ' parts';
  });
