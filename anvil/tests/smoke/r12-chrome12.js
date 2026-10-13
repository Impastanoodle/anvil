  // --- r12/chrome12 ---
  // the frame is narrowed for a moment (its normal 880 px layout is restored at the end of each step)
  async function withFrameWidth(px, fn) {
    var f = document.getElementById('app'), old = [f.style.width, f.style.minWidth];
    f.style.minWidth = '0'; f.style.width = px + 'px'; void f.offsetWidth;
    await wait(40); UI.fitWorkspace();
    try { return await fn(); }
    finally { f.style.width = old[0]; f.style.minWidth = old[1]; void f.offsetWidth; await wait(40); UI.fitWorkspace(); }
  }
  function visibleOverflow() {
    var Wd = W.innerWidth, bad = [];
    Array.prototype.forEach.call(D.querySelectorAll('#app *'), function (e) {
      if (e.offsetParent === null || e.closest('.rb-over') || e.closest('#ribbon-tabs')) return;
      var b = e.getBoundingClientRect();
      if (b.width && b.right > Wd + 1) bad.push((e.id || e.className || e.tagName) + ' ' + Math.round(b.right));
    });
    return bad;
  }
  step('r12/chrome12: narrow windows — nothing scrolls sideways or sits off-screen; the CommandManager drops labels, then moves buttons into a » menu that runs them', async function () {
    await anvil.newPart(); await idle();
    UI.App.ribbonTab = 'Features'; UI.refreshRibbon();
    var out = [];
    await withFrameWidth(1000, async function () {
      var bar = $('ribbon-buttons');
      assert(D.documentElement.scrollWidth <= W.innerWidth, 'page scrolls sideways at 1000: ' + D.documentElement.scrollWidth);
      assert(bar.scrollWidth <= bar.clientWidth + 1, 'ribbon overflows at 1000');
      assert(visibleOverflow().length === 0, 'off-screen at 1000: ' + visibleOverflow().join(', '));
      out.push('1000: ' + ($('ribbon').className || 'full labels'));
    });
    await withFrameWidth(640, async function () {
      var bar = $('ribbon-buttons'), more = bar.querySelector('.rb-more');
      assert(D.documentElement.scrollWidth <= W.innerWidth, 'page scrolls sideways at 640: ' + D.documentElement.scrollWidth);
      assert(bar.scrollWidth <= bar.clientWidth + 1, 'ribbon overflows at 640');
      assert(visibleOverflow().length === 0, 'off-screen at 640: ' + visibleOverflow().join(', '));
      assert($('ribbon').classList.contains('fit-1'), 'stack labels still shown at 640');
      assert(more && !more.hidden, '» overflow button missing at 640');
      var hidden = D.querySelectorAll('#ribbon-buttons > .rb-over').length;
      assert(hidden > 0, 'no button moved to the » menu');
      // every button is still in the DOM (lookups by label keep working)
      assert(Array.prototype.some.call(D.querySelectorAll('#ribbon-buttons button'), function (b) { return b.getAttribute('aria-label') === 'Instant3D'; }), 'Instant3D button left the DOM');
      var vp = $('viewport').getBoundingClientRect();
      assert(vp.width >= 300, 'graphics area only ' + vp.width + ' px wide');
      more.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); more.click();
      var menu = D.querySelector('.menu');
      assert(menu && /Instant3D/.test(menu.textContent), 'the » menu does not list Instant3D: ' + (menu && menu.textContent));
      var on = !!(UI.instant3DOn && UI.instant3DOn());
      var row = Array.prototype.filter.call(menu.querySelectorAll('.mi'), function (r) { return /Instant3D/.test(r.textContent); })[0];
      row.click();
      assert(!D.querySelector('.menu'), 'menu still open after a pick');
      assert(!!(UI.instant3DOn && UI.instant3DOn()) !== on, 'the » menu row did not run Instant3D');
      if (UI.toggleInstant3D) UI.toggleInstant3D();   // back as it was
      out.push('640: ' + $('ribbon').className + ', ' + hidden + ' in », graphics ' + Math.round(vp.width) + ' px');
    });
    return out.join('; ');
  });
  step('r12/chrome12: the FeatureManager and Task Pane resize by their drag handles, keep the width (localStorage), give way to the graphics area and reset on double-click', async function () {
    var split = D.querySelector('#left > .split');
    assert(split, 'FeatureManager drag handle missing');
    assert(D.querySelector('#tp-panel > .split'), 'Task Pane drag handle missing');
    function fmW() { return Math.round($('left').getBoundingClientRect().width); }
    var w0 = fmW(), r = split.getBoundingClientRect(), x = r.left + 3, y = r.top + 40;
    function pe(type, cx) { split.dispatchEvent(new W.PointerEvent(type, { bubbles: true, clientX: cx, clientY: y, button: 0, pointerId: 1, isPrimary: true })); }
    pe('pointerdown', x); pe('pointermove', x - 30); pe('pointermove', x - 60); pe('pointerup', x - 60);
    var w1 = fmW();
    near(w1, w0 - 60, 1, 'FeatureManager width after a 60 px drag');
    assert(W.localStorage.getItem('anvil.fmWidth') === String(w1), 'width not kept: ' + W.localStorage.getItem('anvil.fmWidth'));
    var cw = UI.renderer.domElement.style.width, vw = Math.round($('viewport').getBoundingClientRect().width);
    assert(cw === vw + 'px', 'canvas ' + cw + ' vs graphics area ' + vw + ' px (not resized with the drag)');
    // the window gets narrow: the FeatureManager gives way, the stored width stays
    await withFrameWidth(600, async function () {
      assert($('viewport').getBoundingClientRect().width >= 320 || fmW() <= 200, 'graphics area squeezed below 320 px');
      assert(W.localStorage.getItem('anvil.fmWidth') === String(w1), 'a narrow window overwrote the kept width');
      // Task Pane: too narrow to dock, it slides out over the graphics area
      UI.openTaskPane('home');
      await wait(30);
      assert($('taskpane').classList.contains('tp-overlay'), 'Task Pane docked in a 600 px window');
      assert(D.documentElement.scrollWidth <= W.innerWidth, 'page scrolls sideways with the Task Pane open');
      UI.closeTaskPane();
      await wait(30);
    });
    assert(fmW() === w1, 'width not restored after the window widened: ' + fmW());
    split.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true }));
    assert(fmW() === 296, 'double-click did not reset to 296: ' + fmW());
    assert(W.localStorage.getItem('anvil.fmWidth') == null, 'reset width still stored');
    return 'FeatureManager ' + w0 + ' → ' + w1 + ' → 296 px';
  });
  // --- end r12/chrome12 ---
