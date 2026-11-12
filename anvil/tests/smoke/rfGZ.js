  // ---- rfGZ (UI refresh 2026-11-03, lane icons): one crisp icon family. icons.js re-weighs every stroke for the size it
  // is shown at (`Icons.strokeClass`: quiet 1 px outlines, 2 px main lines at 32 px, pixel-snapped), centres the drawings
  // and keeps the secondary ink theme-coloured; drawing-ui.js' DI icons and drawing-ui-sketch.js' SI icons go through the
  // same weighing. These steps check every ribbon button and tree row has an icon, every icon renders at each size the
  // app uses, none is blue, and no stroke at 32 px is heavier than the rule.
  var RFGZ_SIZES = [14, 16, 18, 20, 32];
  function rfGZhue(hex) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex); if (!m) return null;
    var h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
    var r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn, hu = 0;
    if (c > 0) hu = mx === r ? 60 * (((g - b) / c) % 6) : mx === g ? 60 * ((b - r) / c + 2) : 60 * ((r - g) / c + 4);
    return { h: (hu + 360) % 360, chroma: c };
  }
  function rfGZblue(hex) { var k = rfGZhue(hex); return !!k && k.chroma >= 0.04 && k.h >= 190 && k.h <= 250; }
  // every icon name the app can show: icons.js, the ribbon tabs (part, assembly, drawing) and the tree
  function rfGZnames() {
    var seen = {}, out = [];
    function add(n) { if (n && !seen[n]) { seen[n] = 1; out.push(n); } }
    W.Icons.names().forEach(add);
    function walk(items) { (items || []).forEach(function (it) { if (!it) return; add(it.icon); if (it.stack) walk(it.stack); if (it.items) walk(it.items); }); }
    [UI.RIBBON, UI.ASM_RIBBON].forEach(function (set) { Object.keys(set || {}).forEach(function (t) { walk(typeof set[t] === 'function' ? [] : set[t]); }); });
    Array.prototype.forEach.call(D.querySelectorAll('[data-icon]'), function (e) { add(e.dataset.icon); });
    return out;
  }
  // the stroked elements of one rendered icon with their width in CSS px (a <g scale> from the whole-pixel fit counts)
  function rfGZstrokes(svg, size) {
    var out = [];
    Array.prototype.forEach.call(svg.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon'), function (e) {
      var st = e.getAttribute('stroke'); if (!st || st === 'none') return;
      var sc = 1, g = e.parentNode;
      while (g && g !== svg) { var m = /scale\(([\d.]+)\)/.exec(g.getAttribute('transform') || ''); if (m) sc *= +m[1]; g = g.parentNode; }
      var fill = e.getAttribute('fill');
      out.push({ el: e, css: parseFloat(e.getAttribute('stroke-width') || '1') * sc * size / 16, filled: !!fill && fill !== 'none', self: fill === st });
    });
    return out;
  }
  // rfMD (2026-11-12, lane swicons): the default profile now draws its icons with the SolidWorks set
  // (icons-solidworks.js), which is blue on purpose (the user asked for the look of his own SolidWorks). The rules
  // below that are the built-in drawings' own (no blue, the stroke weights by class, the secondary ink at 70 %) are
  // still pinned, on the built-in drawings: the fallback for a name the set does not draw, and what a profile without
  // an icons section shows. They are read with no set in use.
  function rfGZbuiltIn(fn) { var id = W.Icons.sets ? W.Icons.sets.active() : null; if (id) W.Icons.sets.use(null); try { return fn(); } finally { if (id) W.Icons.sets.use(id); } }
  step('rfGZ: every button on every CommandManager tab (part, assembly, drawing) shows its own icon, drawn, not the generic square', async function () {
    await anvil.newPart(); await idle();
    var generic = W.Icons('generic', 32), bad = [], n = 0, placeholders = {};
    function scan(label) {
      Array.prototype.forEach.call($('ribbon-buttons').querySelectorAll('button.rb'), function (b) {
        n++;
        // a SolidWorks command Anvil has not built yet, listed with ribbon id 'generic' and no icon of its own (ui-panels.js)
        var ic = b.dataset.icon; if (ic === 'generic') { placeholders[b.getAttribute('aria-label') || b.textContent] = 1; return; }
        var svg = b.querySelector('svg.ico'), name = label + ' ▸ ' + (b.getAttribute('aria-label') || b.textContent);
        if (!ic || !W.Icons.has(ic)) bad.push(name + ': no icon ' + ic);
        else if (W.Icons(ic, 32) === generic) bad.push(name + ': the generic square');
        else if (!svg || !svg.querySelector('path, rect, circle, ellipse, polygon, polyline, line, text')) bad.push(name + ': nothing drawn');
      });
    }
    var tabs = Array.prototype.map.call($('ribbon-tabs').querySelectorAll('.rtab'), function (t) { return t.textContent; });
    tabs.forEach(function (t) { UI.setRibbonTab(t); scan('Part ' + t); });
    await anvil.newAssembly(); await idle();
    Array.prototype.map.call($('ribbon-tabs').querySelectorAll('.rtab'), function (t) { return t.textContent; }).forEach(function (t) { UI.setRibbonTab(t); scan('Assembly ' + t); });
    await anvil.newPart(); await idle();
    var dw = anvil.drawing.make(); await idle(); await new Promise(function (r) { setTimeout(r, 300); });
    if (dw) Array.prototype.map.call($('ribbon-tabs').querySelectorAll('.rtab'), function (t) { return t.textContent; }).forEach(function (t) { UI.setRibbonTab(t); scan('Drawing ' + t); });
    if (anvil.drawing.close) anvil.drawing.close(); await idle();
    UI.setRibbonTab('Features');
    assert(n > 120 && bad.length === 0, n + ' buttons; ' + bad.join(', '));
    return n + ' ribbon buttons over ' + tabs.length + ' part tabs, the assembly and the drawing, each with its own drawn icon (placeholders with id generic: ' + Object.keys(placeholders).join(', ') + ')';
  });
  step('rfGZ: every FeatureManager row carries a drawn icon', async function () {
    await anvil.newPart(); await idle();
    anvil.run("sketch('Front').rect(0, 0, 2, 1).extrude(0.5)"); await idle();
    UI.setFmTab && UI.setFmTab('tree'); UI.refreshTree(); await idle();
    var rows = D.querySelectorAll('#tree .ti'), bad = [];
    Array.prototype.forEach.call(rows, function (r) {
      var svg = r.querySelector('svg');
      if (!svg || !svg.querySelector('path, rect, circle, ellipse, polygon, line')) bad.push((r.textContent || '?').trim().slice(0, 30));
    });
    assert(rows.length >= 8 && bad.length === 0, rows.length + ' rows; without an icon: ' + bad.join(', '));
    return rows.length + ' tree rows, each with an icon';
  });
  step('rfGZ: every icon renders a well-formed, non-empty 16-grid SVG at 14, 16, 18, 20 and 32 px, weighed (data-wt), and Icons.node / svg / names survive the drawing wrappers', async function () {
    var names = rfGZnames(), parser = new W.DOMParser(), bad = [];
    assert(typeof W.Icons.node === 'function' && typeof W.Icons.svg === 'function' && typeof W.Icons.names === 'function', 'Icons.node / svg / names lost by a wrapper');
    names.forEach(function (n) {
      if (!W.Icons.has(n)) { bad.push(n + ': missing'); return; }
      RFGZ_SIZES.forEach(function (sz) {
        var s = W.Icons(n, sz), doc = parser.parseFromString(s, 'image/svg+xml'), svg = doc.documentElement;
        if (doc.querySelector('parsererror') || svg.nodeName !== 'svg') { bad.push(n + '@' + sz + ': not well-formed'); return; }
        if (svg.getAttribute('viewBox') !== '0 0 16 16' || svg.getAttribute('width') !== String(sz)) bad.push(n + '@' + sz + ': viewBox / width');
        if (svg.getAttribute('data-wt') !== '1') bad.push(n + '@' + sz + ': not weighed');
        if (!svg.querySelector('path, rect, circle, ellipse, polygon, polyline, line, text')) bad.push(n + '@' + sz + ': empty');
      });
      var node = W.Icons.node(n, 16);
      if (!node || node.nodeName.toLowerCase() !== 'svg') bad.push(n + ': Icons.node');
    });
    assert(names.length > 300 && bad.length === 0, names.length + ' icons; ' + bad.slice(0, 12).join(', ') + (bad.length > 12 ? ' (+' + (bad.length - 12) + ')' : ''));
    return names.length + ' icons at ' + RFGZ_SIZES.join(', ') + ' px';
  });
  step('rfGZ: no built-in icon carries a blue fill, stroke or gradient stop (OK-and-new ✓+ is Mastercam\'s blue by the user\'s 2026-10-27 request); the SolidWorks set of the default profile is blue on purpose (rfMD)', async function () {
    var bad = [], n = 0;
    rfGZnames().forEach(function (name) {
      if (name === 'okPlus') return;
      var s = rfGZbuiltIn(function () { return W.Icons(name, 32); }).replace(/<text[\s\S]*?<\/text>/g, ''), re = /(?:fill|stroke|stop-color)="(#[0-9a-f]{3,6})"/gi, m;
      while ((m = re.exec(s))) { n++; if (rfGZblue(m[1])) bad.push(name + ' ' + m[1]); }
    });
    assert(rfGZblue('#2f7bd8') && !rfGZblue('#6d6d6d') && !rfGZblue('#8a5cc2'), 'the blue test itself');
    assert(n > 600 && bad.length === 0, n + ' colours; blue: ' + bad.join(', '));
    return n + ' colours, none blue';
  });
  step('rfGZ: at 32 px no outline is heavier than 1.5 CSS px, no line heavier than 2.5 and no accent heavier than 0.7 of its doubled drawn width; at 16 px outlines are 1 px; filled shapes are edged in the fixed grey, not the ink', async function () {
    var bad = [], n = 0, dpr = W.devicePixelRatio || 1;
    rfGZnames().forEach(function (name) {
      // the widths as drawn on the 16 grid (icons.js names only; the drawing wrappers' icons are checked for outlines)
      var raw = W.Icons.raw(name), drawn = null;
      if (raw) { var rb = D.createElement('div'); rb.innerHTML = '<svg>' + raw + '</svg>'; drawn = rfGZstrokes(rb.firstChild, 16).map(function (s) { return s.css; }); }
      [16, 32].forEach(function (sz) {
        var box = D.createElement('div'); box.innerHTML = rfGZbuiltIn(function () { return W.Icons(name, sz); });   // the built-in drawings' rule (the set's own outlines: rfMD)
        var list = rfGZstrokes(box.firstChild, sz);
        list.forEach(function (s, i) {
          n++;
          if (s.self) return;
          var w0 = drawn && drawn.length === list.length ? drawn[i] : null;
          if (s.filled) {
            var lim = sz === 32 ? 1.5 : Math.max(1, Math.round(dpr) / dpr) + 0.01;
            if (s.css > lim) bad.push(name + '@' + sz + ' outline ' + s.css.toFixed(2) + ' px');
            var soft = /var\(--icon-paper/.test(s.el.getAttribute('style') || '') || s.el.getAttribute('fill') === 'currentColor' || s.el.getAttribute('stroke-opacity');
            if (s.el.getAttribute('stroke') === 'currentColor' && !soft) bad.push(name + '@' + sz + ' outline in the ink');
          } else if (sz === 32 && w0 != null && w0 < 1.9 && s.css > 2.5) bad.push(name + '@32 line ' + s.css.toFixed(2) + ' px (drawn ' + w0 + ')');
          else if (sz === 32 && w0 != null && w0 >= 1.9 && s.css > w0 * 2 * 0.7 + 0.5) bad.push(name + '@32 accent ' + s.css.toFixed(2) + ' px (drawn ' + w0 + ')');
          else if (sz === 32 && s.css > 6.5) bad.push(name + '@32 accent ' + s.css.toFixed(2) + ' px');
        });
      });
    });
    var cl = W.Icons.strokeClass;
    assert(cl(1.25, true, false, 32)[0] === 'outline' && cl(1.5, false, false, 32)[1] === 2 && cl(1.5, false, false, 16)[1] === 1.25 && cl(1, false, false, 16)[1] === 1, 'the weight rule');
    assert(n > 1200 && bad.length === 0, n + ' strokes; ' + bad.slice(0, 12).join(', ') + (bad.length > 12 ? ' (+' + (bad.length - 12) + ')' : ''));
    return n + ' strokes at 16 and 32 px within the rule';
  });
  step('rfGZ: the drawing documents\' own icons (DI, SI) are weighed like the rest, and the secondary ink follows the theme', async function () {
    ['drawing', 'sectionView', 'detailView', 'balloon', 'bom', 'relativeView', 'lineFormat'].forEach(function (n) {
      if (!W.Icons.has(n)) return;
      var s = rfGZbuiltIn(function () { return W.Icons(n, 32); });
      assert(s.indexOf('data-wt="1"') > 0 && W.Icons(n, 32).indexOf('data-wt="1"') > 0, n + ' not weighed');
      assert(!/(fill|stroke)="#6d6d6d"/.test(s), n + ' keeps the fixed #6d6d6d');
    });
    var line = rfGZbuiltIn(function () { return W.Icons('line', 32); });   // the built-in Line; the set draws its points as white squares (rfMD)
    assert(/fill="currentColor" fill-opacity="0\.7"/.test(line), 'sketch points in the theme ink at 70 %: ' + line.slice(0, 300));
    // the head (2026-11-03): the drawing tree's sheet / view icons were white boxes on the dark panel. Paper takes the
    // panel colour and a view's grey is the ink at 35 %, so in the dark theme no drawn fill of those icons is near white.
    var theme0 = D.documentElement.getAttribute('data-theme') || 'light'; UI.setTheme('dark'); await idle();
    try {
      var host = D.createElement('div'); host.className = 'ti'; $('tree').appendChild(host);
      var bright = [];
      ['sheet', 'sheetFormat', 'drawingView', 'drawing', 'note', 'newDoc'].forEach(function (n) {
        host.innerHTML = W.Icons(n, 16);
        Array.prototype.forEach.call(host.querySelectorAll('path, rect, circle'), function (e) {
          var f = W.getComputedStyle(e).fill, op = parseFloat(W.getComputedStyle(e).fillOpacity), m = /rgb\((\d+), (\d+), (\d+)\)/.exec(f);
          if (m && op > 0.5 && (+m[1] + +m[2] + +m[3]) / 3 > 200) bright.push(n + ' ' + f);
        });
      });
      host.remove();
      assert(bright.length === 0, 'white boxes on the dark panel: ' + bright.join(', '));
    } finally { UI.setTheme(theme0); await idle(); }
    return 'drawing icons weighed; secondary ink = currentColor at 70 %; paper follows the panel in the dark theme';
  });
  // --- end rfGZ ---
