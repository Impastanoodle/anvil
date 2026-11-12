  // --- rfME (lane swribbon, 2026-11-12): the default (SolidWorks) profile has the sizes of the user's own SolidWorks ---
  // Measured on the user's SolidWorks 2024 screenshots at 100 % (large buttons): title row 43 px + 1 px line; the
  // CommandManager 117 px with 32 px icons in large buttons (114 px boxes) and in 38 px small rows, 12 px labels on a 13 px
  // pitch; the tab strip under it 22 px + 1 px line, the active tab open at the top; FeatureManager tabs 52 x 37 with
  // 32 px icons, 22 px tree rows; the Heads-up View toolbar 32 px icons on a 38 px pitch. Checked at 1900 x 1000 (the
  // screenshots' width) and, for overlap / overflow, at 1920, 1600 and 1366 for every tab of a part, an assembly and a
  // drawing. The Mastercam profile keeps its own sizes (style.css rules are scoped :root:not([data-profile])).
  var RFME_BOX = "p.sketch('Front').rect(0, 0, 60, 40).extrude(20)";
  var RFME = { title: 44, cm: 117, tabs: 22, big: 32, row: 38, small: 32, fmTabW: 52, fmTabH: 37, treeRow: 22, hud: 32, hudPitch: 38 };
  // the Mastercam ribbon box at 1900 x 1000, measured at 726c95c (before this lane): [left, top, width, height]
  var RFME_MC_RIBBON = [0, 28, 1900, 128];
  function rfMEFrame(w, h, fn) {
    var f = document.getElementById('app'), old = [f.style.width, f.style.minWidth, f.style.height, f.style.minHeight];
    f.style.minWidth = '0'; f.style.minHeight = '0'; f.style.width = w + 'px'; f.style.height = h + 'px'; void f.offsetWidth;
    return (async function () {
      await wait(80); UI.fitWorkspace(); UI.refreshRibbon(); await wait(80);
      try { return await fn(); }
      finally { f.style.width = old[0]; f.style.minWidth = old[1]; f.style.height = old[2]; f.style.minHeight = old[3]; void f.offsetWidth; await wait(60); UI.fitWorkspace(); UI.refreshRibbon(); await wait(30); }
    })();
  }
  function rfMEShown(e) { return !!e && e.getClientRects().length > 0 && W.getComputedStyle(e).display !== 'none' && W.getComputedStyle(e).visibility !== 'hidden'; }
  function rfMETabs() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return !t.classList.contains('off') && t.offsetWidth; }).map(function (t) { return t.textContent; }); }
  async function rfMETab(name) { UI.setRibbonTab(name); await wait(60); UI.refreshRibbon(); await wait(40); }
  function rfMEBox(e) { var r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(function (v) { return Math.round(v * 100) / 100; }); }
  async function rfMEOpen(docType) {
    if (UI.drawingActive && UI.drawingActive()) { UI.closeDrawing(); await idle(); }
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    anvil.profile('solidworks'); await idle();
    await anvil.newPart(); await idle(); await anvil.run(RFME_BOX); await idle();
    if (!$('tp-panel').hidden) UI.closeTaskPane();
    if (docType === 'drawing') { UI.makeDrawing({ fresh: true }); await wait(300); await idle(); assert(UI.drawingActive(), 'no drawing'); }
    if (docType === 'assembly') { await anvil.newAssembly(); await idle(); }
  }
  async function rfMEReset() {
    if (UI.closeMenus) UI.closeMenus();
    if ($('modal') && !$('modal').hidden && UI.closeModal) UI.closeModal();
    if (UI.drawingActive && UI.drawingActive()) { UI.closeDrawing(); await idle(); }
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    anvil.profile('solidworks'); await idle();
    if (UI.Commands.docType() === 'assembly') { await anvil.newPart(); await idle(); }
  }
  // what is wrong with the bar now: overlaps between the visible top-level nodes, nodes past the bar's right edge or out
  // of it vertically, buttons outside their stack or group box, labels cut by their button
  function rfMELayout() {
    var bar = $('ribbon-buttons'), br = bar.getBoundingClientRect(), bad = [];
    var kids = Array.prototype.filter.call(bar.children, function (c) { return rfMEShown(c); }).map(function (c) { return { el: c, r: c.getBoundingClientRect() }; });
    kids.sort(function (a, b) { return a.r.left - b.r.left; });
    function nm(e) { return e.getAttribute('aria-label') || e.className; }
    kids.forEach(function (k, i) {
      if (k.r.right > br.right + 0.5) bad.push(nm(k.el) + ' past the right edge');
      if (i && k.r.left < kids[i - 1].r.right - 0.5) bad.push(nm(kids[i - 1].el) + ' overlaps ' + nm(k.el));
      if (k.r.top < br.top - 0.5 || k.r.bottom > br.bottom + 0.5) bad.push(nm(k.el) + ' out of the bar vertically');
    });
    Array.prototype.forEach.call(bar.querySelectorAll(':scope > .rb-stack, :scope > .rb-fly'), function (st) {
      if (!rfMEShown(st)) return;
      var sr = st.getBoundingClientRect();
      Array.prototype.forEach.call(st.querySelectorAll('.rb, .rb-caret'), function (b) {
        if (!rfMEShown(b)) return;
        var r = b.getBoundingClientRect(), s = b.querySelector(':scope > span');
        if (r.left < sr.left - 0.5 || r.right > sr.right + 0.5 || r.top < sr.top - 0.5 || r.bottom > sr.bottom + 0.5) bad.push(nm(b) + ' outside its group');
        if (s && rfMEShown(s) && s.getBoundingClientRect().width && (s.getBoundingClientRect().right > r.right + 0.5 || s.scrollWidth > s.clientWidth + 1)) bad.push(nm(b) + ' label cut');
      });
    });
    Array.prototype.forEach.call(bar.querySelectorAll(':scope > .rb'), function (b) {
      if (!rfMEShown(b)) return;
      var s = b.querySelector(':scope > span');
      if (s && rfMEShown(s) && s.getBoundingClientRect().width && (s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1)) bad.push(nm(b) + ' label cut');
    });
    return bad;
  }
  function rfMENear(bad, what, v, want, tol) { if (!(Math.abs(v - want) <= (tol == null ? 2 : tol))) bad.push(what + ' ' + Math.round(v * 100) / 100 + ' (SolidWorks ' + want + ')'); }

  step('rfME: (a) at 1900 x 1000 the title row, CommandManager, tab strip, FeatureManager and Heads-up toolbar have SolidWorks\' measured sizes', async function () {
    try {
      await rfMEOpen('part');
      if (UI.setTheme) UI.setTheme('light');
      return await rfMEFrame(1900, 1000, async function () {
        await rfMETab('Features');
        var bad = [], mb = $('menubar').getBoundingClientRect(), bb = $('ribbon-buttons').getBoundingClientRect(), tb = $('ribbon-tabs').getBoundingClientRect();
        rfMENear(bad, 'title row', mb.height, RFME.title);
        rfMENear(bad, 'CommandManager', bb.height, RFME.cm);
        rfMENear(bad, 'tab strip', tb.height, RFME.tabs);
        if (tb.top < bb.bottom - 0.5) bad.push('the tab strip is not under the CommandManager (' + tb.top + ' < ' + bb.bottom + ')');
        var big = D.querySelector('#ribbon-buttons > .rb > svg.ico');
        rfMENear(bad, 'large icon', big.getBoundingClientRect().width, RFME.big, 0.5);
        rfMENear(bad, 'large icon height', big.getBoundingClientRect().height, RFME.big, 0.5);
        var bbx = D.querySelector('#ribbon-buttons > .rb').getBoundingClientRect();
        rfMENear(bad, 'large button box', bbx.height, 114);
        rfMENear(bad, 'large icon from the CommandManager top', big.getBoundingClientRect().top - bb.top, 6);
        var lab = D.querySelector('#ribbon-buttons > .rb > span'), cs = W.getComputedStyle(lab);
        if (cs.fontSize !== '12px' || cs.lineHeight !== '13px') bad.push('large label ' + cs.fontSize + ' / ' + cs.lineHeight);
        var sm = D.querySelector('#ribbon-buttons .rb-stack:not(.rb-grid) > .rb');
        rfMENear(bad, 'small row', sm.getBoundingClientRect().height, RFME.row);
        rfMENear(bad, 'small icon', sm.querySelector('svg').getBoundingClientRect().width, RFME.small, 0.5);
        if (W.getComputedStyle(sm.querySelector('span')).fontSize !== '12px') bad.push('small label ' + W.getComputedStyle(sm.querySelector('span')).fontSize);
        var act = D.querySelector('#ribbon-tabs .rtab.active'), ac = W.getComputedStyle(act);
        if (!(parseFloat(ac.borderTopWidth) === 0 || /rgba\(0, 0, 0, 0\)|transparent/.test(ac.borderTopColor))) bad.push('the active tab has a top border ' + ac.borderTopWidth + ' ' + ac.borderTopColor);
        var ina = D.querySelector('#ribbon-tabs .rtab:not(.active)');
        if (!(parseFloat(W.getComputedStyle(ina).borderTopWidth) >= 1)) bad.push('an inactive tab is not boxed');
        if (W.getComputedStyle(act).fontSize !== '12px') bad.push('tab font ' + W.getComputedStyle(act).fontSize);
        var ft = D.querySelectorAll('#fm-tabs button[data-tab]')[1].getBoundingClientRect();
        rfMENear(bad, 'FeatureManager tab width', ft.width, RFME.fmTabW);
        rfMENear(bad, 'FeatureManager tab height', ft.height, RFME.fmTabH);
        rfMENear(bad, 'FeatureManager tab icon', D.querySelector('#fm-tabs button[data-tab] svg').getBoundingClientRect().width, 32, 0.5);
        var row = D.querySelector('#tree .ti');
        rfMENear(bad, 'tree row', row.getBoundingClientRect().height, RFME.treeRow, 0.5);
        var hs = D.querySelectorAll('#hud > button');
        rfMENear(bad, 'Heads-up icon', hs[0].querySelector('svg').getBoundingClientRect().width, RFME.hud, 0.5);
        rfMENear(bad, 'Heads-up pitch', hs[1].getBoundingClientRect().left - hs[0].getBoundingClientRect().left, RFME.hudPitch);
        var hr = $('hud').getBoundingClientRect(), vr = $('viewport').getBoundingClientRect();
        rfMENear(bad, 'Heads-up toolbar centred', (hr.left + hr.right) / 2, (vr.left + vr.right) / 2, 2);
        var tp = D.querySelector('#tp-strip button');
        rfMENear(bad, 'Task Pane tab', tp.getBoundingClientRect().height, 36);
        rfMENear(bad, 'Task Pane icon', tp.querySelector('svg').getBoundingClientRect().width, 32, 0.5);
        assert(!bad.length, bad.join('; '));
        return 'title ' + mb.height + ', CommandManager ' + bb.height + ', tabs ' + tb.height + ', FeatureManager tab ' + ft.width + ' x ' + ft.height;
      });
    } finally { await rfMEReset(); }
  });

  step('rfME: (b) at 1900 wide every small button of the Features, Sketch and Sheet Metal tabs shows its label; nothing in the » menu', async function () {
    try {
      await rfMEOpen('part');
      return await rfMEFrame(1900, 1000, async function () {
        var bad = [], n = 0;
        for (var t of ['Features', 'Sketch', 'Sheet Metal']) {
          await rfMETab(t);
          if ($('ribbon').classList.contains('fit-1') || $('ribbon').classList.contains('fit-2')) bad.push(t + ': labels dropped (' + $('ribbon').className + ')');
          if (D.querySelector('#ribbon-buttons > .rb-over')) bad.push(t + ': buttons in the » menu');
          Array.prototype.forEach.call(D.querySelectorAll('#ribbon-buttons .rb-stack:not(.rb-grid) .rb'), function (b) {
            n++;
            var s = b.querySelector(':scope > span');
            if (!rfMEShown(b) || !s || !rfMEShown(s) || !s.getBoundingClientRect().width) bad.push(t + ': ' + (b.getAttribute('aria-label') || '?') + ' has no visible label');
          });
          rfMELayout().forEach(function (x) { bad.push(t + ': ' + x); });
        }
        assert(!bad.length, bad.slice(0, 10).join('; '));
        return n + ' small buttons labelled';
      });
    } finally { await rfMEReset(); }
  });

  [['part', 1920], ['part', 1600], ['part', 1366], ['assembly', 1920], ['assembly', 1600], ['assembly', 1366], ['drawing', 1920], ['drawing', 1600], ['drawing', 1366]].forEach(function (c) {
    step('rfME: (c) ' + c[0] + ' at ' + c[1] + ' wide: on every tab nothing overlaps, leaves the bar or cuts a label', async function () {
      try {
        await rfMEOpen(c[0]);
        return await rfMEFrame(c[1], 1000, async function () {
          var bad = [], out = [];
          for (var t of rfMETabs()) {
            await rfMETab(t);
            rfMELayout().forEach(function (x) { bad.push(t + ': ' + x); });
            var rib = $('ribbon'), lv = rib.classList.contains('fit-2') ? 'no labels' : rib.classList.contains('fit-1') ? 'no small labels' : '';
            var over = D.querySelectorAll('#ribbon-buttons > .rb-over').length;
            if (lv || over) out.push(t + ' [' + [lv, over ? over + ' in »' : ''].filter(Boolean).join(', ') + ']');
          }
          assert(!bad.length, bad.slice(0, 10).join('; '));
          return out.join(' ') || 'every label shown';
        });
      } finally { await rfMEReset(); }
    });
  });

  step('rfME: (d) at 1366 x 768 a PropertyManager, a menu and a dialog open and lie inside the window', async function () {
    try {
      await rfMEOpen('part');
      return await rfMEFrame(1366, 768, async function () {
        var bad = [], ar = $('app').getBoundingClientRect();
        function inside(what, e) { var r = e.getBoundingClientRect(); if (!r.width || !r.height) bad.push(what + ' not shown'); else if (r.left < ar.left - 0.5 || r.top < ar.top - 0.5 || r.right > ar.right + 0.5 || r.bottom > ar.bottom + 0.5) bad.push(what + ' at ' + rfMEBox(e) + ' outside ' + rfMEBox($('app'))); }
        UI.editFeature(UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[0]); await idle(); await wait(600);   // (the PropertyManager slides in)
        assert(UI.hasPM(), 'no PropertyManager');
        inside('the PropertyManager', $('pm'));
        var pt = $('pm').getBoundingClientRect(), fb = $('fm-tabs').getBoundingClientRect();
        if (pt.top < fb.bottom - 0.5) bad.push('the PropertyManager starts above the FeatureManager tabs');
        UI.closePM(); await idle();
        var li = D.querySelector('#menus > li');
        li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); li.click(); await wait(60);
        var m = D.querySelector('.menu');
        if (!m) bad.push('the File menu did not open'); else inside('the File menu', m);
        UI.closeMenus(); await wait(30);
        D.querySelector('#std-options').click(); await wait(200);
        if ($('modal') && !$('modal').hidden) inside('the Options dialog', D.querySelector('#modal .modal-box') || $('modal-body'));
        else if (!$('tp-panel').hidden) inside('the Options pane', $('tp-panel'));
        else bad.push('Options opened nothing');
        assert(!bad.length, bad.join('; '));
        return 'inside';
      });
    } finally { if (!$('tp-panel').hidden) UI.closeTaskPane(); await rfMEReset(); }
  });

  step('rfME: (e) under Mastercam the ribbon keeps its box, and the chrome icons are back to their small sizes', async function () {
    try {
      await rfMEOpen('part');
      anvil.profile('mastercam'); await idle(); await wait(60);
      return await rfMEFrame(1900, 1000, async function () {
        await rfMETab('Wireframe');
        var bad = [], box = rfMEBox($('ribbon'));
        if (RFME_MC_RIBBON && box.some(function (v, i) { return Math.abs(v - RFME_MC_RIBBON[i]) > 0.01; })) bad.push('Mastercam ribbon ' + JSON.stringify(box) + ' (was ' + JSON.stringify(RFME_MC_RIBBON) + ')');
        var sm = D.querySelector('#ribbon-buttons .rb-stack > .rb svg');
        if (sm && Math.abs(sm.getBoundingClientRect().width - 16) > 0.5) bad.push('Mastercam small icon ' + sm.getBoundingClientRect().width);
        var std = D.querySelector('#std-new svg');
        if (std && std.getAttribute('width') !== '16') bad.push('Quick Access icon drawn at ' + std.getAttribute('width'));
        assert(!bad.length, bad.join('; '));
        return 'Mastercam ribbon ' + JSON.stringify(box);
      });
    } finally { await rfMEReset(); }
  });
