  // ---- rfIL (2026-11-05, lane icon polish): pixel-sharp icon sizes. icons.js hints every vertex of a stroked path or
  // rect (and every filled rect) onto the device pixel grid at any size and devicePixelRatio, so 24 px icons are sharp
  // at 100 % and 16 px ones at 125 / 150 %; the PropertyManager header and ✓ ✗ draw at 24 px, the Heads-up toolbar,
  // Shortcut Bar and FeatureManager tabs at 16 (no 20 px icons left in ui-panels.js / ui-commands.js); the greyed
  // Smart Fasteners, Bill of Materials and Hole Alignment buttons have their own icons; an audit renders every icon at
  // 16 / 24 / 32 / 48 px on the light and the dark panel.
  var RFIL_SIZES = [16, 24, 32, 48], RFIL_DPRS = [1, 1.25, 1.5, 2];
  // run fn with window.devicePixelRatio reading `dpr` (icons.js reads it per call), then restore it
  function rfILAtDpr(dpr, fn) {
    var had = Object.getOwnPropertyDescriptor(W, 'devicePixelRatio');
    Object.defineProperty(W, 'devicePixelRatio', { value: dpr, configurable: true, writable: true });
    try { return fn(); } finally { if (had) Object.defineProperty(W, 'devicePixelRatio', had); else delete W.devicePixelRatio; }
  }
  // the horizontal / vertical stroke edges of one weighed icon that miss the device pixel grid: [missed, total]
  function rfILMisses(svgText, size, dpr) {
    var k = size / 16 * dpr, miss = 0, tot = 0, names = [];
    var fit = /<g transform="translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)">/.exec(svgText);
    var ox = fit ? +fit[1] : 0, oy = fit ? +fit[2] : 0, sc = fit ? +fit[3] : 1;
    var cg = /<g transform="translate\((-?\d+) (-?\d+)\)">/.exec(svgText), cx = cg ? +cg[1] : 0, cy = cg ? +cg[2] : 0;
    function on(c, axis, want) {
      var dev = ((c + (axis ? cy : cx)) * sc + (axis ? oy : ox)) * k - want; tot++;
      if (Math.abs(dev - Math.round(dev)) > 0.03) miss++;
    }
    svgText.replace(/<(path|rect)\b([^>]*)>/g, function (all, tag, a) {
      if (/\stransform=/.test(a)) return;
      var sw = /stroke-width="([\d.]+)"/.exec(a), stroked = /\sstroke="(?!none)/.test(a);
      var dw = stroked && sw ? +sw[1] * k * sc : 0;
      if (stroked && Math.abs(dw - Math.round(dw)) > 0.03) return;   // a hairline or a self-stroked fill keeps its drawn width
      var want = stroked && Math.round(dw) % 2 ? 0.5 : 0;
      if (tag === 'rect') {
        if (/\srx=/.test(a) || (!stroked && /fill="none"/.test(a))) return;
        var g = function (n) { var m = new RegExp('\\s' + n + '="(-?[\\d.]+)"').exec(a); return m ? +m[1] : NaN; };
        var x = g('x'), y = g('y'), w = g('width'), h = g('height'); if ([x, y, w, h].some(isNaN)) return;
        on(x, 0, want); on(x + w, 0, want); on(y, 1, want); on(y + h, 1, want); return;
      }
      if (!stroked) return;
      var d = (/\sd="([^"]*)"/.exec(a) || [])[1] || '';
      if (/[a-z]/.test(d.replace(/e-/g, ''))) return;   // not hinted (relative commands left as drawn)
      var t = d.match(/[A-Z]|-?[\d.]+/g) || [], i = 0, c = null, X = 0, Y = 0;
      while (i < t.length) {
        if (/[A-Z]/.test(t[i])) c = t[i++];
        if (c === 'Z') continue;
        var nx = X, ny = Y;
        if (c === 'H') nx = +t[i++]; else if (c === 'V') ny = +t[i++];
        else if (c === 'M' || c === 'L') { nx = +t[i++]; ny = +t[i++]; }
        else return;
        if (c === 'H' || (c === 'L' && Math.abs(ny - Y) < 1e-6)) on(ny, 1, want);
        if (c === 'V' || (c === 'L' && Math.abs(nx - X) < 1e-6)) on(nx, 0, want);
        X = nx; Y = ny;
      }
    });
    return [miss, tot];
  }
  step('rfIL: no 20 px icons left in ui-panels.js / ui-commands.js; PropertyManager header and ✓ ✗ draw 24 px icons, the Heads-up toolbar and FeatureManager tabs 32 px (SolidWorks large buttons), at whole pixels, every button its size', async function () {
    var bad = [];
    for (var fi = 0, files = ['ui-panels.js', 'ui-commands.js']; fi < files.length; fi++) {
      var src = await (await fetch('../' + files[fi], { cache: 'no-store' })).text(), re = /Icons(?:\.node)?\(([^;]*?),\s*(\d+)\)/g, m;
      while ((m = re.exec(src))) if (+m[2] % 8 !== 0 && +m[2] !== 14) bad.push(files[fi] + ': Icons(' + m[1].slice(-30) + ', ' + m[2] + ')');
    }
    assert(!bad.length, bad.join('; '));
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(0, -20, 40, 20).extrude(10);'); await idle();
    var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude'; })[0];
    UI.editFeature(f); await idle();
    try {
      var head = D.querySelector('#pm .pm-head'), hs = head.querySelector(':scope > svg'), hr = head.getBoundingClientRect(), hsr = hs.getBoundingClientRect();
      assert(hs.getAttribute('width') === '24', 'PM header icon drawn at ' + hs.getAttribute('width'));
      near(hsr.width, 24, 0.01, 'PM header icon width'); near(hr.height, 36, 0.01, 'PM title row height');
      // whole px inside the panel (the CommandManager's 99.28 px leaves the panel at a .28 offset; Chrome snaps replaced content)
      near(hsr.left - hr.left, 8, 0.01, 'PM header icon x in its row'); near(hsr.top - hr.top, 6, 0.01, 'PM header icon y in its row');
      var acts = D.querySelectorAll('#pm .pm-actions button.pm-ok, #pm .pm-actions button.pm-cancel');
      assert(acts.length === 2, '✓ and ✗');
      Array.prototype.forEach.call(acts, function (b) {
        var r = b.getBoundingClientRect(), s = b.querySelector('svg'), q = s.getBoundingClientRect();
        near(r.width, 32, 0.01, b.className + ' width'); near(r.height, 28, 0.01, b.className + ' height');
        assert(s.getAttribute('width') === '24', b.className + ' icon drawn at ' + s.getAttribute('width'));
        near(q.left - r.left, 4, 0.01, b.className + ' icon x in its button'); near(q.top - r.top, 2, 0.01, b.className + ' icon y in its button');
      });
      near(acts[0].querySelector('svg').getBoundingClientRect().left, hsr.left, 0.01, '✓ starts on the header icon\'s left edge');
    } finally { UI.pmCancel(); await idle(); }
    var hud = D.querySelectorAll('#hud button'), n = 0;
    assert(hud.length > 6, 'Heads-up toolbar buttons');
    Array.prototype.forEach.call(hud, function (b) {
      var s = b.querySelector('svg.ico'); if (!s) return; n++;
      var r = b.getBoundingClientRect(), q = s.getBoundingClientRect();
      // lane swribbon (2026-11-12): SolidWorks' measured Heads-up toolbar: 32 px icons in 36 px buttons (48 with the caret)
      // on a 38 px pitch (was 16 px icons in 28 x 26 buttons)
      near(r.width, b.classList.contains('hud-dd') ? 48 : 36, 0.01, 'HUD button width'); near(r.height, 36, 0.01, 'HUD button height');
      assert(s.getAttribute('width') === '32' && Math.abs(q.width - 32) < 0.01, 'HUD icon ' + s.getAttribute('width') + ' / ' + q.width);
      near(q.left - r.left, Math.round(q.left - r.left), 0.01, 'HUD icon x in its button'); near(q.top - r.top, 2, 0.01, 'HUD icon y in its button');
    });
    Array.prototype.forEach.call(D.querySelectorAll('#fm-tabs button svg.ico'), function (s) { assert(s.getAttribute('width') === '32', 'FeatureManager tab icon drawn at ' + s.getAttribute('width')); });
    return 'PM header / ✓ ✗ at 24 px, ' + n + ' HUD icons at 32 px in 36 × 36 buttons, all on whole pixels';
  });
  step('rfIL: every ribbon item (part and assembly, stacks and flyouts included) has a drawn icon of its own: Smart Fasteners, Bill of Materials and Hole Alignment are no longer the generic square', async function () {
    var bad = [], n = 0, generic = W.Icons('generic', 32);
    function walk(items, where) {
      (items || []).forEach(function (it) {
        if (!it || it.sep) return;
        if (it.stack) return walk(it.stack, where);
        if (it.fly || it.items) return walk(it.items, where);   // a flyout's face is its last-used item
        if (!it.label && !it.id) return;
        var ic = it.icon || it.id; n++;
        if (!ic || ic === 'generic' || !W.Icons.has(ic) || W.Icons(ic, 32) === generic) bad.push(where + ' ▸ ' + String(it.label || it.fly).replace(/\n/g, ' ') + ' [' + ic + ']');
      });
    }
    [['Part', UI.RIBBON], ['Assembly', UI.ASM_RIBBON]].forEach(function (s) { Object.keys(s[1] || {}).forEach(function (t) { if (typeof s[1][t] !== 'function') walk(s[1][t], s[0] + ' ' + t); }); });
    await anvil.newAssembly(); await idle();
    Array.prototype.map.call($('ribbon-tabs').querySelectorAll('.rtab'), function (t) { return t.textContent; }).forEach(function (t) {
      UI.setRibbonTab(t);
      Array.prototype.forEach.call($('ribbon-buttons').querySelectorAll('button.rb'), function (b) { n++; if (!b.dataset.icon || b.dataset.icon === 'generic') bad.push('Assembly ' + t + ' ▸ ' + (b.getAttribute('aria-label') || b.textContent) + ' (shown)'); });
    });
    await anvil.newPart(); await idle(); UI.setRibbonTab('Features');
    assert(!bad.length, bad.join('; '));
    ['smartFasteners', 'holeAlignment', 'bom'].forEach(function (k) { assert(W.Icons.has(k) && W.Icons(k, 32) !== generic, k); });
    return n + ' ribbon items checked, none generic';
  });
  step('rfIL: pixel hinting: the horizontal and vertical strokes and filled rects of every icon land on whole device pixels at 16 / 24 / 32 / 48 px and devicePixelRatio 1, 1.25, 1.5 and 2', async function () {
    var names = W.Icons.names(), out = [], worst = [];
    RFIL_DPRS.forEach(function (dpr) {
      rfILAtDpr(dpr, function () {
        RFIL_SIZES.forEach(function (sz) {
          var miss = 0, tot = 0;
          names.forEach(function (nm) { var r = rfILMisses(W.Icons(nm, sz), sz, dpr); miss += r[0]; tot += r[1]; if (r[0] && worst.length < 8) worst.push(nm + '@' + sz + '×' + dpr); });
          out.push(sz + '@' + dpr + ': ' + miss + '/' + tot);
          assert(tot > 500, 'too few edges checked at ' + sz + ' px × ' + dpr + ': ' + tot);
          assert(miss === 0, miss + ' of ' + tot + ' edges off the pixel grid at ' + sz + ' px × ' + dpr + ' (' + worst.join(', ') + ')');
        });
      });
    });
    near(W.devicePixelRatio, 1, 1e-9, 'devicePixelRatio restored');
    // the hinted path keeps its drawing: a rect outline at 24 px, 1x moves no vertex more than half a device pixel
    var g = rfILAtDpr(1, function () { return W.Icons('smartFasteners', 24); });
    assert(/<path d="M[\d.]+ [\d.]+ H[\d.]+ V[\d.]+ H[\d.]+ Z"/.test(g), 'Smart Fasteners head hinted to absolute H / V: ' + g.slice(0, 200));
    return out.join(', ');
  });
  step('rfIL: audit: every icon renders at 16 / 24 / 32 / 48 px on the light and the dark panel, inside its 16-grid box (not clipped) and with ink that reads on both panels', async function () {
    var names = W.Icons.names(), bad = [], host = D.createElement('div');
    var PANELS = [['light', '#f0f0f0', '#3e3e3e'], ['dark', '#323232', '#d6d6d6']];
    function rgb(c, ink, panel) {
      if (!c || c === 'none') return null;
      if (c === 'currentColor') c = ink;
      if (/^var\(/.test(c)) c = panel;
      var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c); if (!m) return null;
      var h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
      return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; });
    }
    function lum(c) { var l = c.map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; }
    function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;z-index:99999;display:flex;flex-wrap:wrap;gap:4px;padding:4px;';
    D.body.appendChild(host);
    try {
      PANELS.forEach(function (pn) {
        host.style.background = pn[1]; host.style.color = pn[2];
        host.style.setProperty('--icon-ink', pn[2]); host.style.setProperty('--panel', pn[1]); host.style.setProperty('--icon-paper', pn[1]);
        RFIL_SIZES.forEach(function (sz) {
          host.innerHTML = names.map(function (nm) { return '<span data-n="' + nm + '" style="display:inline-block;line-height:0">' + W.Icons(nm, sz) + '</span>'; }).join('');
          Array.prototype.forEach.call(host.children, function (sp) {
            var nm = sp.dataset.n, s = sp.firstChild, r = s.getBoundingClientRect();
            if (Math.abs(r.width - sz) > 0.01 || Math.abs(r.height - sz) > 0.01) { bad.push(nm + '@' + sz + ': box ' + r.width + '×' + r.height); return; }
            if (sz !== 16) return;
            var bb = s.getBBox();
            if (bb.x < -0.6 || bb.y < -0.6 || bb.x + bb.width > 16.6 || bb.y + bb.height > 16.6) bad.push(nm + ': clipped (' + [bb.x, bb.y, bb.x + bb.width, bb.y + bb.height].map(function (v) { return v.toFixed(1); }).join(' ') + ')');
            // the strongest paint against the panel: an icon whose every colour sinks into the dark (or light) panel is unreadable
            var best = 0, panel = rgb(pn[1]);
            if (s.querySelector('linearGradient, radialGradient')) best = 99;   // shaded spheres / grounds: light-to-dark stops read on both
            Array.prototype.forEach.call(s.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text'), function (e) {
              var cs = W.getComputedStyle(e);
              [[cs.fill, cs.fillOpacity], [cs.stroke, cs.strokeOpacity]].forEach(function (pc) {
                var m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(pc[0]);
                // rfMD: a color-mix() (the SolidWorks set's sketch blue follows the ink) computes to color(srgb r g b [/ a]), 0-1
                var cm = m ? null : /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(pc[0]);
                if (cm) m = [cm[0], cm[1] * 255, cm[2] * 255, cm[3] * 255, cm[4]];
                if (!m) return;
                var a = (m[4] != null ? +m[4] : 1) * (+pc[1] || 0); if (a < 0.3) return;
                var c = [m[1] / 255, m[2] / 255, m[3] / 255].map(function (v, i) { return v * a + panel[i] * (1 - a); });
                best = Math.max(best, contrast(c, panel));
              });
            });
            // 3:1 for the ink; 2.8 lets SolidWorks' red ✗ (#d9453b, 2.97 on #323232) stand, as rfDA pins that red
            if (best < 2.8) bad.push(nm + ' on the ' + pn[0] + ' panel: strongest contrast ' + best.toFixed(2));
          });
        });
      });
    } finally { host.remove(); }
    assert(!bad.length, bad.length + ' problems: ' + bad.slice(0, 14).join('; '));
    return names.length + ' icons × ' + RFIL_SIZES.length + ' sizes × 2 panels: whole-size boxes, inside the grid, readable ink on both panels';
  });
