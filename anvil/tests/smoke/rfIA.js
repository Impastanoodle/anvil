// rfIA (2026-11-05, lane ribbonsize): the CommandManager is enlarged by dragging its bottom edge down (user: "make the
// top menu able to be enlarged by dragging downwards, the icons have to keep their sharpness while being enlarged").
// A real drag of #ribbon-grip makes the ribbon about as much taller as the drag; icons are drawn again at the new
// whole-pixel size (no transform / zoom anywhere above them); the graphics area gives the height; the size is kept
// (a second app frame reads it); a drawing document's ribbon scales too; narrow windows still fit; up past the
// default clamps; double-click restores the default layout exactly. The setting is reset at the end.
(function () {
  function rfIADrag(dy, steps) {
    var g = $('ribbon-grip'), r = g.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 2;
    steps = steps || 10;
    g.dispatchEvent(new W.PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 9, isPrimary: true, clientX: x, clientY: y }));
    for (var i = 1; i <= steps; i++) g.dispatchEvent(new W.PointerEvent('pointermove', { bubbles: true, pointerId: 9, isPrimary: true, clientX: x, clientY: y + dy * i / steps }));
    g.dispatchEvent(new W.PointerEvent('pointerup', { bubbles: true, pointerId: 9, isPrimary: true, clientX: x, clientY: y + dy }));
  }
  function rfIAH() { return $('ribbon').getBoundingClientRect().height; }
  // the first large button with an icon (not in the » menu)
  function rfIABig() {
    var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons > .rb, #ribbon-buttons > .rb-fly > .rb'), function (b) { return b.querySelector('svg') && b.getBoundingClientRect().width > 0; })[0];
    return b && b.querySelector('svg');
  }
  function rfIASmall() {
    var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-stack .rb'), function (b) { return b.querySelector('svg') && b.getBoundingClientRect().width > 0; })[0];
    return b && b.querySelector('svg');
  }
  // every ribbon box, for the "default is exactly as before" comparison
  function rfIALayout() {
    return Array.prototype.map.call(D.querySelectorAll('#ribbon, #ribbon-buttons, #ribbon-tabs, #ribbon .rb, #ribbon .rb svg, #ribbon .rtab, #ribbon .rb-caret'), function (e) {
      var r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(function (v) { return Math.round(v * 100) / 100; }).join(',') + (e.tagName === 'svg' ? '|' + e.getAttribute('width') : '');
    }).join(';');
  }
  function rfIANoTransform(node) {
    for (var e = node; e && e.nodeType === 1; e = e.parentElement) {
      var cs = W.getComputedStyle(e);
      assert(cs.transform === 'none' || !cs.transform, 'transform on ' + (e.id || e.className.baseVal || e.className || e.tagName) + ': ' + cs.transform);
      assert(!cs.zoom || cs.zoom === '1' || cs.zoom === 'normal', 'zoom on ' + (e.id || e.tagName) + ': ' + cs.zoom);
      assert(!cs.scale || cs.scale === 'none', 'scale on ' + (e.id || e.tagName) + ': ' + cs.scale);
    }
  }
  function rfIAKey() { return UI.ribbonScaleLimits.key; }
  async function rfIAWidth(px, fn) {
    var f = document.getElementById('app'), old = [f.style.width, f.style.minWidth];
    f.style.minWidth = '0'; f.style.width = px + 'px'; void f.offsetWidth;
    await wait(40); UI.fitWorkspace();
    try { return await fn(); }
    finally { f.style.width = old[0]; f.style.minWidth = old[1]; void f.offsetWidth; await wait(40); UI.fitWorkspace(); }
  }
  var rfIA0 = null;   // the default layout, taken in the first step

  step('rfIA: the CommandManager\'s grip: a 60 px drag down makes the ribbon ~60 px taller, icons redrawn at larger whole-pixel sizes with no transform / zoom, the graphics area shrinks by the same, the size is kept', async function () {
    UI.setRibbonScale(1); await idle();
    await anvil.newPart(); await idle();
    UI.App.ribbonTab = 'Sketch'; UI.refreshRibbon(); await wait(30);
    var grip = $('ribbon-grip');
    assert(grip, 'no grip on the CommandManager');
    assert(W.getComputedStyle(grip).cursor === 'row-resize', 'grip cursor ' + W.getComputedStyle(grip).cursor);
    near(grip.getBoundingClientRect().bottom, $('ribbon').getBoundingClientRect().bottom - 1, 0.5, 'grip on the bottom edge (inside the 1 px border)');
    assert(!$('ribbon-scale') || !$('ribbon-scale').textContent, 'a scale sheet at the default size');
    var big0 = rfIABig(), small0 = rfIASmall();
    assert(big0.getAttribute('width') === '32' && small0.getAttribute('width') === '18', 'default icon sizes ' + big0.getAttribute('width') + ' / ' + small0.getAttribute('width'));
    near(big0.getBoundingClientRect().width, 32, 0.01, 'default large icon box');
    near(small0.getBoundingClientRect().width, 16, 0.01, 'default small icon box');
    rfIA0 = { layout: rfIALayout(), h: rfIAH() };
    var big0Name = big0.parentNode.getAttribute('aria-label'), w0 = Math.max.apply(null, Array.prototype.map.call(big0.querySelectorAll('[stroke-width]'), function (e) { return parseFloat(e.getAttribute('stroke-width')) * 2; }));
    var vp0 = $('viewport').getBoundingClientRect().height, tab0 = $('ribbon-tabs').getBoundingClientRect().height;
    var font0 = parseFloat(W.getComputedStyle(D.querySelector('#ribbon-buttons > .rb span')).fontSize);
    rfIADrag(60); await wait(60);
    var h1 = rfIAH(), s = UI.ribbonScale();
    near(h1 - rfIA0.h, 60, 4, 'ribbon growth for a 60 px drag');
    assert(s > 1.3 && s < 2.5, 'scale ' + s);
    var big = rfIABig(), small = rfIASmall(), bw = +big.getAttribute('width'), sw = +small.getAttribute('width');
    assert(bw > 32 && bw === Math.round(bw) && +big.getAttribute('height') === bw, 'large icon size ' + bw);
    assert(sw > 16 && sw === Math.round(sw), 'small icon size ' + sw);
    var br = big.getBoundingClientRect(), sr = small.getBoundingClientRect();
    near(br.width, bw, 0.01, 'large icon box = its drawn size'); near(br.height, bw, 0.01, 'large icon box height');
    near(sr.width, sw, 0.01, 'small icon box = its drawn size');
    near(br.left, Math.round(br.left), 0.01, 'large icon on a whole pixel (x)'); near(br.top, Math.round(br.top), 0.01, 'large icon on a whole pixel (y)');
    rfIANoTransform(big); rfIANoTransform(small);
    // the strokes grew with the icon (a scaled-up drawing, not 2 px hairlines on a big icon)
    function wmax(svg) { var n = +svg.getAttribute('width'); return Math.max.apply(null, Array.prototype.map.call(svg.querySelectorAll('[stroke-width]'), function (e) { return parseFloat(e.getAttribute('stroke-width')) * n / 16; })); }
    assert(big.parentNode.getAttribute('aria-label') === big0Name, 'not the same button');
    assert(wmax(big) >= 1.3 * w0, 'strokes stayed thin: ' + w0.toFixed(2) + ' px at 32 -> ' + wmax(big).toFixed(2) + ' px at ' + bw);
    var font1 = parseFloat(W.getComputedStyle(D.querySelector('#ribbon-buttons > .rb span')).fontSize);
    assert(font1 > font0, 'label font ' + font0 + ' -> ' + font1);
    assert($('ribbon-tabs').getBoundingClientRect().height > tab0, 'the tab strip did not grow');
    var vp1 = $('viewport').getBoundingClientRect().height;
    near(vp0 - vp1, h1 - rfIA0.h, 1, 'graphics area height given to the ribbon');
    var ch = parseFloat(UI.renderer.domElement.style.height);
    near(ch, vp1, 1, 'canvas follows the graphics area');
    assert(D.documentElement.scrollHeight <= W.innerHeight + 1, 'the page scrolls: ' + D.documentElement.scrollHeight);
    var kept = null; try { kept = W.localStorage.getItem(rfIAKey()); } catch (e) { }
    assert(kept === String(s), 'scale kept: ' + kept + ' vs ' + s);
    return 'ribbon ' + rfIA0.h.toFixed(1) + ' -> ' + h1.toFixed(1) + ' px, scale ' + s + ', icons 32 -> ' + bw + ' / 16 -> ' + sw + ', label ' + font0 + ' -> ' + font1 + ' px';
  });

  step('rfIA: the enlarged size survives a reload (a second app frame reads it)', async function () {
    var s = UI.ribbonScale();
    assert(s > 1, 'not enlarged: ' + s);
    var f = document.createElement('iframe');   // in the test page (a frame under /tests/ uses the test key, as the app frame does)
    f.style.cssText = 'position:fixed;left:-2000px;top:0;width:880px;height:560px;border:0;';
    f.src = '../index.html';
    document.body.appendChild(f);
    try {
      var t0 = Date.now(), w2 = null;
      while (Date.now() - t0 < 20000) {
        await wait(200);
        w2 = f.contentWindow;
        if (w2 && w2.UI && w2.UI.ribbonScale && w2.document.querySelector('#ribbon-buttons .rb svg')) break;
      }
      assert(w2 && w2.UI && w2.UI.ribbonScale, 'the second frame did not boot');
      assert(w2.UI.ribbonScale() === s, 'reloaded scale ' + w2.UI.ribbonScale() + ' vs ' + s);
      var svg = w2.document.querySelector('#ribbon-buttons > .rb svg, #ribbon-buttons > .rb-fly > .rb svg');
      assert(+svg.getAttribute('width') === Math.round(32 * s), 'reloaded icon ' + svg.getAttribute('width'));
      near(svg.getBoundingClientRect().width, Math.round(32 * s), 0.01, 'reloaded icon box');
      return 'scale ' + s + ' after reload, icon ' + svg.getAttribute('width') + ' px';
    } finally { f.src = 'about:blank'; await wait(50); f.remove(); }
  });

  step('rfIA: a drawing document\'s CommandManager scales the same way', async function () {
    UI.setRibbonScale(1); await wait(30);
    await anvil.newPart(); await idle();
    await anvil.run("p.sketch('Front').rect(0, 0, 60, 40).extrude(20)"); await idle();
    UI.makeDrawing({ fresh: true }); await wait(300); await idle();
    try {
      assert(UI.drawingActive(), 'no drawing open');
      var h0 = rfIAH(), big0 = rfIABig();
      assert(big0 && big0.getAttribute('width') === '32', 'drawing ribbon icon ' + (big0 && big0.getAttribute('width')));
      rfIADrag(60); await wait(60);
      var h1 = rfIAH(), big = rfIABig(), bw = +big.getAttribute('width');
      near(h1 - h0, 60, 4, 'drawing ribbon growth');
      assert(bw === Math.round(32 * UI.ribbonScale()) && bw > 32, 'drawing icon ' + bw);
      near(big.getBoundingClientRect().width, bw, 0.01, 'drawing icon box');
      rfIANoTransform(big);
      // another tab of the drawing ribbon is built at the same size
      var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab:not(.off)'), function (t) { return !t.classList.contains('active'); })[0];
      if (tab) { tab.click(); await wait(40); var b2 = rfIABig(); assert(b2 && +b2.getAttribute('width') === bw, 'tab ' + tab.textContent + ' icon ' + (b2 && b2.getAttribute('width'))); }
      return 'drawing ribbon ' + h0.toFixed(1) + ' -> ' + h1.toFixed(1) + ' px, icon ' + bw;
    } finally { UI.closeDrawing(); await idle(); }
  });

  step('rfIA: an enlarged CommandManager in a narrow window still fits (fit levels at the enlarged sizes, » menu)', async function () {
    UI.App.ribbonTab = 'Features'; UI.refreshRibbon(); await wait(30);
    if (UI.ribbonScale() < 1.5) UI.setRibbonScale(1.8);
    var s = UI.ribbonScale(), out = [];
    await rfIAWidth(560, async function () {
      var bar = $('ribbon-buttons'), rib = $('ribbon');
      assert(bar.scrollWidth <= bar.clientWidth + 1, 'ribbon overflows at 560: ' + bar.scrollWidth + ' > ' + bar.clientWidth);
      assert(D.documentElement.scrollWidth <= W.innerWidth, 'page scrolls sideways');
      assert(rib.classList.contains('fit-1') || rib.classList.contains('fit-2'), 'no fit level at 560: ' + rib.className);
      var more = bar.querySelector('.rb-more');
      assert(more && !more.hidden, '» missing');
      var big = rfIABig();
      assert(+big.getAttribute('width') === Math.round(32 * s), 'icon at fit level ' + big.getAttribute('width'));
      near(more.getBoundingClientRect().width, Math.round(20 * s), 1, '» width scaled');
      out.push(rib.className.replace(/\s*rb-\S+/g, '') + ', » ' + Math.round(more.getBoundingClientRect().width) + ' px');
    });
    // fit-2 (large labels gone) at a width where the enlarged ribbon needs it
    await rfIAWidth(760, async function () {
      var bar = $('ribbon-buttons');
      assert(bar.scrollWidth <= bar.clientWidth + 1, 'ribbon overflows at 760');
      out.push('760: ' + $('ribbon').className.replace(/\s*rb-\S+/g, ''));
    });
    return 'scale ' + s + ': 560 ' + out.join('; ');
  });

  step('rfIA: dragging up past the default clamps; down past 2.5x clamps; the grip shows in both themes; double-click restores the default layout exactly', async function () {
    UI.App.ribbonTab = 'Sketch'; UI.refreshRibbon(); await wait(30);
    rfIADrag(-400); await wait(40);
    assert(UI.ribbonScale() === 1, 'drag up: scale ' + UI.ribbonScale());
    near(rfIAH(), rfIA0.h, 0.01, 'drag up: default height');
    rfIADrag(600, 6); await wait(40);
    assert(UI.ribbonScale() === UI.ribbonScaleLimits.max, 'drag far down: scale ' + UI.ribbonScale());
    var hMax = rfIAH();
    assert(hMax < rfIA0.h * 2.7, 'max height ' + hMax);
    // the grip line (shown on hover / while dragging) reads on the tab strip in both themes
    var prev = D.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', grip = $('ribbon-grip'), msg = [];
    try {
      for (var th of ['light', 'dark']) {
        UI.setTheme(th); await wait(300);
        grip.classList.add('dragging'); await wait(150);
        var c = W.getComputedStyle(grip, '::after').backgroundColor, g = W.getComputedStyle($('ribbon-tabs')).backgroundColor;
        grip.classList.remove('dragging');
        function lum(s) { var m = /(\d+)\D+(\d+)\D+(\d+)/.exec(s); return m ? (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 : -1; }
        assert(Math.abs(lum(c) - lum(g)) > 0.3, th + ': grip line ' + c + ' on ' + g);
        msg.push(th + ' ' + c);
      }
    } finally { UI.setTheme(prev); await wait(200); }
    grip.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true })); await wait(60);
    assert(UI.ribbonScale() === 1, 'double-click: scale ' + UI.ribbonScale());
    assert(!$('ribbon-scale') || !$('ribbon-scale').isConnected || !$('ribbon-scale').textContent, 'scale sheet left behind');
    var kept = 'x'; try { kept = W.localStorage.getItem(rfIAKey()); } catch (e) { }
    assert(kept === null, 'setting not cleared: ' + kept);
    var lay = rfIALayout();
    assert(lay === rfIA0.layout, 'default layout differs after reset');
    return 'max ' + hMax.toFixed(1) + ' px; ' + msg.join(', ') + '; default restored to the hundredth';
  });

  step('rfIA: reset (CommandManager at its default size, setting cleared)', async function () {
    UI.setRibbonScale(1);
    try { W.localStorage.removeItem(rfIAKey()); } catch (e) { }
    assert(UI.ribbonScale() === 1 && rfIABig().getAttribute('width') === '32', 'not reset');
  });
})();
