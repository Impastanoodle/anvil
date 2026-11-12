  // --- rfMA (lane mcribbon, 2026-11-12): the Mastercam frame's ribbon has Mastercam's geometry ---
  // Measured on the user's screenshots at 100 %: large icons 32 px, the buttons 96 px high under a 31 px tab row,
  // 12 px labels, small buttons in labelled rows of 22 px. Small buttons keep their labels whenever the tab fits;
  // otherwise whole groups collapse, last first (ui-panels.js frameFit). Checked at 1900 x 1000 (the screenshots' width)
  // and at 1920, 1600, 1366 for every tab of a part, an assembly and a drawing: nothing overlaps or leaves the bar.
  var RFMA_BOX = "p.sketch('Front').rect(0, 0, 60, 40).extrude(20)";
  var RFMA_BODY = 96, RFMA_TABS = 31;   // measured (mc-02: tab row y 0-30 with its line, buttons y 31-126)
  function rfMAFrame(w, h, fn) {
    var f = document.getElementById('app'), old = [f.style.width, f.style.minWidth, f.style.height, f.style.minHeight];
    f.style.minWidth = '0'; f.style.minHeight = '0'; f.style.width = w + 'px'; f.style.height = h + 'px'; void f.offsetWidth;
    return (async function () {
      await wait(80); UI.fitWorkspace(); UI.refreshRibbon(); await wait(80);
      try { return await fn(); }
      finally { f.style.width = old[0]; f.style.minWidth = old[1]; f.style.height = old[2]; f.style.minHeight = old[3]; void f.offsetWidth; await wait(60); UI.fitWorkspace(); UI.refreshRibbon(); await wait(30); }
    })();
  }
  function rfMATabs() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return !t.classList.contains('off') && t.offsetWidth; }).map(function (t) { return t.textContent; }); }
  async function rfMATab(name) { UI.setRibbonTab(name); await wait(60); UI.refreshRibbon(); await wait(40); }
  function rfMAShown(e) { return !!e && e.getClientRects().length > 0 && W.getComputedStyle(e).display !== 'none' && W.getComputedStyle(e).visibility !== 'hidden'; }
  async function rfMAOpen(docType) {
    if (UI.drawingActive && UI.drawingActive()) { UI.closeDrawing(); await idle(); }
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    anvil.profile('mastercam');
    await anvil.newPart(); await idle(); await anvil.run(RFMA_BOX); await idle();
    if (!$('tp-panel').hidden) UI.closeTaskPane();
    if (docType === 'drawing') { UI.makeDrawing({ fresh: true }); await wait(300); await idle(); assert(UI.drawingActive(), 'no drawing'); }
    if (docType === 'assembly') { await anvil.newAssembly(); await idle(); }
  }
  async function rfMAReset() {
    if (UI.closeMenus) UI.closeMenus();
    if (UI.drawingActive && UI.drawingActive()) { UI.closeDrawing(); await idle(); }
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    anvil.profile('solidworks'); await idle();
    if (UI.Commands.docType() === 'assembly') { await anvil.newPart(); await idle(); }
  }
  // what is wrong with the bar now: overlaps between the visible top-level nodes, nodes past the bar's right edge,
  // small buttons outside their stack, labels cut by their button
  function rfMALayout() {
    var bar = $('ribbon-buttons'), br = bar.getBoundingClientRect(), bad = [];
    var kids = Array.prototype.filter.call(bar.children, function (c) { return rfMAShown(c); }).map(function (c) { return { el: c, r: c.getBoundingClientRect() }; });
    kids.sort(function (a, b) { return a.r.left - b.r.left; });
    function nm(e) { return e.getAttribute('aria-label') || e.className; }
    kids.forEach(function (k, i) {
      if (k.r.right > br.right + 0.5) bad.push(nm(k.el) + ' past the right edge');
      if (i && k.r.left < kids[i - 1].r.right - 0.5) bad.push(nm(kids[i - 1].el) + ' overlaps ' + nm(k.el));
      if (k.r.top < br.top - 3 || k.r.bottom > br.bottom + 0.5) bad.push(nm(k.el) + ' out of the bar vertically');
    });
    Array.prototype.forEach.call(bar.querySelectorAll(':scope > .rb-stack'), function (st) {
      if (!rfMAShown(st)) return;
      var sr = st.getBoundingClientRect();
      Array.prototype.forEach.call(st.querySelectorAll('.rb'), function (b) {
        if (!rfMAShown(b)) return;
        var r = b.getBoundingClientRect(), s = b.querySelector(':scope > span');
        if (r.left < sr.left - 0.5 || r.right > sr.right + 0.5 || r.bottom > sr.bottom + 0.5) bad.push(nm(b) + ' outside its stack');
        if (s && rfMAShown(s) && s.getBoundingClientRect().right > r.right + 0.5) bad.push(nm(b) + ' label cut');
      });
    });
    return bad;
  }

  step('rfMA: (a) at 1900 x 1000 under Mastercam: 32 px large icons, a 96 px button bar under a 31 px tab row, 12 px labels and captions, 22 px small rows', async function () {
    try {
      await rfMAOpen('part');
      return await rfMAFrame(1900, 1000, async function () {
        await rfMATab('Wireframe');
        var big = D.querySelector('#ribbon-buttons > .rb:not(.mc-colbtn) > svg.ico, #ribbon-buttons .rb-fly:not(.rb-fly-small) > .rb > svg.ico');
        var ir = big.getBoundingClientRect();
        assert(Math.abs(ir.width - 32) < 0.5 && Math.abs(ir.height - 32) < 0.5, 'large icon ' + ir.width + ' x ' + ir.height);
        var bh = $('ribbon-buttons').getBoundingClientRect().height, th = $('ribbon-tabs').getBoundingClientRect().height;
        assert(Math.abs(bh - RFMA_BODY) <= 3, 'button bar ' + bh + ' (Mastercam ' + RFMA_BODY + ')');
        assert(Math.abs(th - RFMA_TABS) <= 2, 'tab row ' + th + ' (Mastercam ' + RFMA_TABS + ')');
        var lab = D.querySelector('#ribbon-buttons > .rb > span'), cap = D.querySelector('#ribbon > .mc-captions .mc-caption'), sm = D.querySelector('#ribbon-buttons .rb-stack > .rb');
        assert(W.getComputedStyle(lab).fontSize === '12px' && W.getComputedStyle(cap).fontSize === '12px', 'label / caption font ' + W.getComputedStyle(lab).fontSize + ' / ' + W.getComputedStyle(cap).fontSize);
        assert(Math.abs(sm.getBoundingClientRect().height - 22) < 0.5 && Math.abs(sm.querySelector('svg').getBoundingClientRect().width - 16) < 0.5, 'small row ' + sm.getBoundingClientRect().height);
        assert($('mc-file').getBoundingClientRect().width === 60, 'File tab ' + $('mc-file').getBoundingClientRect().width);
        // the caption sits under the buttons, inside the ribbon
        var cr = cap.getBoundingClientRect(), rr = $('ribbon').getBoundingClientRect(), lr = lab.getBoundingClientRect();
        assert(cr.top >= lr.bottom && cr.bottom <= rr.bottom, 'caption at ' + cr.top + '-' + cr.bottom + ', labels end ' + lr.bottom + ', ribbon ' + rr.bottom);
        return 'icon 32, bar ' + bh + ', tabs ' + th;
      });
    } finally { await rfMAReset(); }
  });

  step('rfMA: (b) at 1900 wide the Wireframe, Solids and View tabs show every small button with its label, no group collapsed, nothing in the » menu', async function () {
    try {
      await rfMAOpen('part');
      return await rfMAFrame(1900, 1000, async function () {
        var bad = [], n = 0;
        for (var t of ['Wireframe', 'Solids', 'View']) {
          await rfMATab(t);
          var col = UI.frameRibbonCollapsed();
          if (col.length) bad.push(t + ': collapsed ' + col.join(', '));
          if (D.querySelector('#ribbon-buttons > .rb-over')) bad.push(t + ': buttons in the » menu');
          Array.prototype.forEach.call(D.querySelectorAll('#ribbon-buttons .rb-stack .rb'), function (b) {
            n++;
            var s = b.querySelector(':scope > span');
            if (!rfMAShown(b) || !s || !rfMAShown(s) || !s.getBoundingClientRect().width) bad.push(t + ': ' + (b.getAttribute('aria-label') || '?') + ' has no visible label');
          });
          rfMALayout().forEach(function (x) { bad.push(t + ': ' + x); });
        }
        assert(!bad.length, bad.slice(0, 10).join('; '));
        return n + ' small buttons labelled';
      });
    } finally { await rfMAReset(); }
  });

  [['part', 1920], ['part', 1600], ['part', 1366], ['assembly', 1920], ['assembly', 1600], ['assembly', 1366], ['drawing', 1920], ['drawing', 1600], ['drawing', 1366]].forEach(function (c) {
    step('rfMA: (c) ' + c[0] + ' at ' + c[1] + ' wide: on every tab nothing overlaps, leaves the bar or cuts a label; groups collapse last first', async function () {
      try {
        await rfMAOpen(c[0]);
        return await rfMAFrame(c[1], 1000, async function () {
          var bad = [], out = [];
          for (var t of rfMATabs()) {
            await rfMATab(t);
            rfMALayout().forEach(function (x) { bad.push(t + ': ' + x); });
            var col = UI.frameRibbonCollapsed();
            // collapsed groups are the last ones: no expanded group after a collapsed one
            var seen = false;
            Array.prototype.forEach.call(D.querySelectorAll('#ribbon-buttons > *'), function (e) {
              if (!rfMAShown(e) || e.classList.contains('rb-sep') || e.classList.contains('rb-more')) return;
              if (e.classList.contains('mc-colbtn')) seen = true; else if (seen) bad.push(t + ': an expanded button after a collapsed group (' + (e.getAttribute('aria-label') || e.className) + ')');
            });
            if (col.length) out.push(t + ' [' + col.join(', ') + ']');
          }
          assert(!bad.length, bad.slice(0, 10).join('; '));
          return out.join(' ') || 'nothing collapsed';
        });
      } finally { await rfMAReset(); }
    });
  });

  step('rfMA: (d) a collapsed group opens a menu of its commands, and the command runs from it', async function () {
    try {
      await rfMAOpen('part');
      return await rfMAFrame(1366, 1000, async function () {
        await rfMATab('Wireframe');
        var b = D.querySelector('#ribbon-buttons > .mc-colbtn:not(.rb-over)');
        assert(b, 'no collapsed group at 1366: ' + UI.frameRibbonCollapsed());
        assert(b.querySelector('svg') && b.querySelector('.mc-caret'), 'the collapsed button has its icon and caret');
        b.click(); await wait(40);
        var rows = D.querySelectorAll('.menu .mi');
        assert(rows.length >= 2, 'menu rows ' + rows.length);
        var name = b.getAttribute('data-group');
        UI.closeMenus();
        return name + ': ' + rows.length + ' rows';
      });
    } finally { await rfMAReset(); }
  });

  step('rfMA: (e) back on SolidWorks the ribbon, its bar and its first button have the boxes they had before', async function () {
    function box(e) { var r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(function (v) { return Math.round(v * 100) / 100; }).join(','); }
    function snap() { var b = D.querySelector('#ribbon-buttons > .rb'), s = D.querySelector('#ribbon-buttons .rb-stack .rb'); return [box($('ribbon')), box($('ribbon-buttons')), box($('ribbon-tabs')), b ? box(b) : '', s ? box(s) : '', $('ribbon').className].join(' | '); }
    try {
      await rfMAReset();
      await anvil.newPart(); await idle(); await anvil.run(RFMA_BOX); await idle();
      UI.setRibbonTab('Sketch'); await wait(60);
      var a = snap();
      anvil.profile('mastercam'); await idle(); await wait(60);
      anvil.profile('solidworks'); await idle(); UI.setRibbonTab('Sketch'); await wait(60);
      var b = snap();
      assert(a === b, 'before ' + a + '\nafter ' + b);
      return 'same';
    } finally { await rfMAReset(); }
  });
