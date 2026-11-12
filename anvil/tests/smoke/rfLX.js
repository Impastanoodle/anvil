  // --- rfLX (2026-11-12, lane mcicons: the Mastercam profile's icon set) ---
  // An interface profile may name an icon set (`icons: { set: 'mastercam' }`, icons-mastercam.js, Icons.sets). What a
  // look can promise without judging taste: under Mastercam every icon of every tab of a part, an assembly and a
  // drawing, the Quick Access Toolbar, the managers, the status bar and the Quick Masks is drawn by the set and none
  // is empty; SolidWorks is untouched (no set, the same markup before and after a round trip); a profile with no
  // `icons` section draws the built-in icons; the icons already on screen follow a switch; the set's lines keep
  // 3 : 1 against the profile's light and dark ribbon. Every step ends on SolidWorks with a new part.
  var RFLX_BOX = "p.sketch('Top').rect(0, 0, 4, 2).extrude(1)";
  function rfLXIcons(root) { return Array.prototype.slice.call((typeof root === 'string' ? D.querySelector(root) : root || D).querySelectorAll('svg.ico')); }
  function rfLXWhere(s) { var p = s.parentNode; return (p.id || p.className || p.tagName) + ' in ' + ((p.parentNode && (p.parentNode.id || p.parentNode.className)) || '?'); }
  // the icons under `sel` that the set did not draw, and the ones that are empty or have no size while shown. `open`:
  // leave out what sits in a closed pane (an element with `hidden`): the manager panel also holds the panes of the
  // other managers and the tree of a drawing that was closed (`#drawing-tree`, kept with its last rows by any earlier
  // step that had a drawing open, rfLV (g) for one). A closed pane is drawn again when it opens (the drawing step).
  function rfLXCheck(sel, what, min, open) {
    var root = D.querySelector(sel);
    assert(root, what + ': no ' + sel);
    var all = rfLXIcons(root).filter(function (s) { return !open || !s.closest('[hidden]'); });
    assert(all.length >= (min == null ? 1 : min), what + ': ' + all.length + ' icons in ' + sel);
    var fallback = all.filter(function (s) { return s.getAttribute('data-set') !== 'mastercam' || !s.getAttribute('data-ic'); });
    assert(!fallback.length, what + ': ' + fallback.length + ' icon(s) not from the set: ' + fallback.slice(0, 4).map(rfLXWhere).join('; '));
    var empty = all.filter(function (s) {
      if (!s.children.length) return true;
      if (!s.getClientRects().length) return false;   // not shown now (the » overflow, a hidden pane)
      var b = s.getBBox(), r = s.getBoundingClientRect();
      return Math.max(b.width, b.height) < 2 || r.width < 8 || r.height < 8;
    });
    assert(!empty.length, what + ': ' + empty.length + ' empty icon(s): ' + empty.slice(0, 4).map(function (s) { return s.getAttribute('data-ic') + ' (' + rfLXWhere(s) + ')'; }).join('; '));
    return all.length;
  }
  function rfLXTabs() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return !t.classList.contains('off'); }).map(function (t) { return t.textContent; }); }
  async function rfLXStart(profile, docType) {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    await anvil.newPart(); await idle();
    await anvil.run(RFLX_BOX); await idle();
    anvil.profile(profile);
    if (docType === 'drawing') { UI.makeDrawing({ fresh: true }); await wait(300); await idle(); assert(UI.drawingActive(), 'no drawing'); }
    if (docType === 'assembly') { await anvil.newAssembly(); await idle(); }
    await wait(60);   // the Quick Masks are built by the viewport's own tick
  }
  async function rfLXReset() {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    if (modalOpen()) UI.closeModal();
    if (UI.closeMenus) UI.closeMenus();
    anvil.profile('solidworks');
    ['rflx-plain', 'rflx-icons'].forEach(function (id) { if (UI.Profiles.def(id)) UI.Profiles.unregister(id); });
    await anvil.newPart(); await idle();
  }
  function rfLXLum(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    assert(m, 'not a colour: ' + hex);
    var c = [m[1], m[2], m[3]].map(function (h) { var v = parseInt(h, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function rfLXContrast(a, b) { var x = rfLXLum(a), y = rfLXLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  step('rfLX: SolidWorks has no icon set: no icon carries a set mark, Icons() gives the same markup with the Mastercam set registered as without any; a profile with no icons section draws the built-in icons too', async function () {
    try {
      await rfLXStart('solidworks');
      var Ic = W.Icons;
      assert(Ic.sets && Ic.sets.list().indexOf('mastercam') >= 0, 'the mastercam set is not registered');
      assert(Ic.sets.active() === null && UI.Profiles.icons.set() === null, 'a set is in use under SolidWorks: ' + Ic.sets.active());
      assert(!D.querySelector('svg.ico[data-set], svg.ico[data-ic], [data-ic-slot]'), 'a set mark under SolidWorks');
      // the built-in drawing of every name, with the set off, on, and off again
      var names = Ic.names(), before = names.map(function (n) { return Ic(n, 16) + Ic(n, 32); });
      Ic.sets.use('mastercam');
      var changed = 0;
      try { names.forEach(function (n, i) { if (Ic(n, 16) + Ic(n, 32) !== before[i]) changed++; }); } finally { Ic.sets.use(null); }
      assert(changed === names.length, 'the set left ' + (names.length - changed) + ' of ' + names.length + ' names as the built-in drawing');
      names.forEach(function (n, i) { assert(Ic(n, 16) + Ic(n, 32) === before[i], 'the built-in ' + n + ' changed after the set was used'); });
      assert(Ic.has('extrude') && !Ic.has('rebuildSel'), 'has() answers for the set while it is off');
      // a profile without an icons section
      UI.Profiles.register({ id: 'rflx-plain', name: 'rfLX plain', labels: { extrude: 'Extrude' } });
      anvil.profile('rflx-plain'); await wait(30);
      assert(Ic.sets.active() === null, 'a profile with no icons section turned a set on');
      assert(rfLXIcons('#ribbon-buttons').length > 5 && !D.querySelector('svg.ico[data-set]'), 'set-drawn icons under a profile with no icons section');
      return names.length + ' built-in names unchanged';
    } finally { await rfLXReset(); }
  });

  step('rfLX: Mastercam, a part: every icon on every tab, the Quick Access Toolbar, the Solids / Planes / Levels managers, the status bar and the Quick Masks comes from the set, and none is empty', async function () {
    try {
      await rfLXStart('mastercam', 'part');
      assert(W.Icons.sets.active() === 'mastercam', 'the Mastercam profile did not turn its set on');
      var tabs = rfLXTabs(), n = 0;
      assert(tabs.join() === 'Home,Wireframe,Solids,Sheet Metal,Drafting,Transform,View,More', 'part tabs: ' + tabs.join());
      for (var i = 0; i < tabs.length; i++) { UI.setRibbonTab(tabs[i]); await wait(20); n += rfLXCheck('#ribbon-buttons', 'tab ' + tabs[i], 6); }
      n += rfLXCheck('#std-toolbar', 'Quick Access Toolbar', 4);
      ['planes', 'levels', 'solids'].forEach(function (m) { assert(UI.frameManager(m) === m, 'the ' + m + ' manager did not open'); n += rfLXCheck('#left', 'the ' + m + ' manager', 2, true); });
      assert(rfLXIcons('#levels-panel .lvl-tools').length === 3, 'the Levels tool row has ' + rfLXIcons('#levels-panel .lvl-tools').length + ' icons');
      assert(rfLXIcons('#mc-solids').length >= 3, 'the Solids history shows ' + rfLXIcons('#mc-solids').length + ' icons');
      n += rfLXCheck('#mc-status', 'status bar', 5);
      var masks = Array.prototype.slice.call(D.querySelectorAll('#vp-qmask button[data-qmask]'));
      assert(masks.length >= 9, masks.length + ' Quick Mask buttons');
      masks.forEach(function (b) { assert(b.querySelector('svg.ico[data-set="mastercam"]'), 'Quick Mask ' + b.getAttribute('data-qmask') + ' is not drawn by the set'); });
      n += rfLXCheck('#vp-qmask', 'Quick Masks', 9);
      // the two regenerate buttons of the Solids manager are two drawings
      var regen = Array.prototype.slice.call(D.querySelectorAll('#mc-mgr-head .mc-tool svg.ico')).map(function (s) { return s.getAttribute('data-ic'); });
      assert(regen[0] === 'rebuild' && regen[1] === 'rebuildSel', 'Solids tool row starts ' + regen.slice(0, 2).join());
      return n + ' icons, all from the set';
    } finally { await rfLXReset(); }
  });

  step('rfLX: Mastercam, an assembly and a drawing: every icon on every tab, the toolbar, the managers and the status bar comes from the set', async function () {
    try {
      var n = 0, docs = ['assembly', 'drawing'];
      for (var d = 0; d < docs.length; d++) {
        await rfLXStart('mastercam', docs[d]);
        var tabs = rfLXTabs();
        assert(tabs.length >= 4, docs[d] + ' tabs: ' + tabs.join());
        for (var i = 0; i < tabs.length; i++) { UI.setRibbonTab(tabs[i]); await wait(20); n += rfLXCheck('#ribbon-buttons', docs[d] + ' tab ' + tabs[i], 3); }
        n += rfLXCheck('#std-toolbar', docs[d] + ' Quick Access Toolbar', 4);
        n += rfLXCheck('#left', docs[d] + ' manager panel', 2, true);
        n += rfLXCheck('#mc-status', docs[d] + ' status bar', 5);
        if (docs[d] === 'drawing') n += rfLXCheck('#drawing-tree', 'the open drawing\'s tree', 4);
        anvil.profile('solidworks'); await anvil.newPart(); await idle();
      }
      // a drawing made and closed under SolidWorks keeps its tree, hidden, in the manager panel; opened again under
      // Mastercam the tree is the set's (its rows are drawn on opening, not carried over)
      await rfLXStart('solidworks', 'drawing');
      UI.closeDrawing(); await idle();
      assert($('drawing-tree').hidden && rfLXIcons('#drawing-tree').length >= 4, 'the closed drawing kept no hidden tree (' + rfLXIcons('#drawing-tree').length + ' icons): this part of the step no longer tests anything');
      anvil.profile('mastercam'); await wait(60);
      rfLXCheck('#left', 'the manager panel with a closed drawing behind it', 2, true);
      UI.openDrawing(); await wait(300); await idle();
      assert(UI.drawingActive() && !$('drawing-tree').hidden, 'the drawing did not open again');
      n += rfLXCheck('#drawing-tree', 'the reopened drawing\'s tree', 4);
      UI.closeDrawing(); await idle();
      return n + ' icons';
    } finally { await rfLXReset(); }
  });

  step('rfLX: SolidWorks -> Mastercam -> SolidWorks: the ribbon, the FeatureManager tree, the toolbar and the Quick Masks are exactly what they were, and nothing of the set is left', async function () {
    try {
      await rfLXStart('solidworks');
      UI.setRibbonTab('Features'); UI.refreshTree(); await wait(30);
      var snap = function () { return { ribbon: $('ribbon-buttons').innerHTML, tree: $('fm-tree').innerHTML, toolbar: $('std-toolbar').innerHTML, tabs: $('fm-tabs') ? $('fm-tabs').innerHTML : '' }; };
      var a = snap();
      anvil.profile('mastercam'); await wait(80);
      assert(rfLXIcons('#std-toolbar').every(function (s) { return s.getAttribute('data-set') === 'mastercam'; }), 'the toolbar was not redrawn on the switch');
      var masks0 = Array.prototype.map.call(D.querySelectorAll('#vp-qmask button[data-qmask]'), function (b) { return !!b.querySelector('svg.ico[data-set]'); });
      assert(masks0.length && masks0.every(Boolean), 'the Quick Masks were not redrawn');
      anvil.profile('solidworks'); await wait(80);
      UI.setRibbonTab('Features'); UI.refreshTree(); await wait(30);
      var b = snap();
      Object.keys(a).forEach(function (k) { assert(a[k] === b[k], 'the ' + k + ' is not what it was before the switch (' + a[k].length + ' / ' + b[k].length + ' characters)'); });
      assert(W.Icons.sets.active() === null, 'the set is still on');
      var left = D.querySelectorAll('svg.ico[data-set], svg.ico[data-ic], [data-ic-slot]');
      assert(!left.length, left.length + ' set mark(s) left, first in ' + (left.length ? rfLXWhere(left[0]) : ''));
      Array.prototype.forEach.call(D.querySelectorAll('#vp-qmask button[data-qmask]'), function (q) { assert(q.querySelector('svg[viewBox="0 0 24 24"]'), 'Quick Mask ' + q.getAttribute('data-qmask') + ' did not get its own drawing back'); });
      return 'identical';
    } finally { await rfLXReset(); }
  });

  step('rfLX: the icons already on screen follow the switch: an open PropertyManager, the task pane strip and the FeatureManager tabs are redrawn by the set, and drawn back when it goes (a profile with only an icons section)', async function () {
    try {
      await rfLXStart('solidworks');
      UI.Profiles.register({ id: 'rflx-icons', name: 'rfLX icons', icons: { set: 'mastercam' } });
      var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude'; })[0];
      UI.editFeature(f); await idle(); await wait(60);
      assert(UI.hasPM(), 'no PropertyManager');
      var pm0 = $('pm').innerHTML, n0 = rfLXIcons('#pm').length, rb0 = $('ribbon-buttons').innerHTML;
      assert(n0 >= 3, n0 + ' icons in the PropertyManager');
      anvil.profile('rflx-icons'); await wait(60);
      assert(W.Icons.sets.active() === 'mastercam', 'the icons-only profile did not turn the set on');
      assert(UI.hasPM(), 'the switch closed the PropertyManager');
      var pm = rfLXIcons('#pm'), plain = pm.filter(function (s) { return s.getAttribute('data-set') !== 'mastercam'; });
      assert(pm.length === n0 && !plain.length, plain.length + ' of ' + pm.length + ' PropertyManager icons were not redrawn: ' + plain.slice(0, 3).map(rfLXWhere).join('; '));
      assert(D.querySelector('#pm .pm-ok svg.ico').getAttribute('data-ic') === 'ok' && D.querySelector('#pm .pm-cancel svg.ico').getAttribute('data-ic') === 'cancel', 'OK / Cancel are not the set\'s');
      rfLXCheck('#ribbon-buttons', 'ribbon under the icons-only profile', 6);
      rfLXCheck('#std-toolbar', 'toolbar under the icons-only profile', 4);
      rfLXCheck('#fm-tree', 'tree under the icons-only profile', 2);
      var strip = rfLXIcons('#tp-strip').concat(rfLXIcons('#fm-tabs'));
      assert(strip.length >= 4 && strip.every(function (s) { return s.getAttribute('data-set') === 'mastercam'; }), 'the task pane strip / FeatureManager tabs were not redrawn (' + strip.length + ' icons)');
      anvil.profile('solidworks'); await wait(60);
      assert($('pm').innerHTML === pm0, 'the PropertyManager is not what it was');
      assert($('ribbon-buttons').innerHTML === rb0, 'the ribbon is not what it was');
      assert(!D.querySelector('svg.ico[data-set], svg.ico[data-ic]'), 'set marks left');
      UI.pmCancel(); await idle();
      return n0 + ' PropertyManager icons there and back';
    } finally { await rfLXReset(); }
  });

  step('rfLX: the set itself: every name the tabs use is drawn at 16, 24 and 32 px with no placeholder left in the markup, a drawing made for the set differs from Anvil\'s, two different icons on one tab never look the same, and the line colours keep 3 : 1 on the light and the dark ribbon', async function () {
    try {
      await rfLXStart('mastercam', 'part');
      var Ic = W.Icons, set = Ic.sets.get('mastercam'), own = set.own(), used = {}, same = [];
      assert(own.length >= 150, 'the set has ' + own.length + ' drawings of its own');
      function namesOf(items, acc) {
        (items || []).forEach(function (it) {
          if (!it || it.sep) return;
          if (it.stack) return namesOf(it.stack, acc);
          if (it.fly) return namesOf(it.items, acc);
          acc.push(it.icon || it.id);
        });
        return acc;
      }
      ['part', 'assembly', 'drawing'].forEach(function (dt) {
        var tabs = UI.profileRibbon(dt);
        assert(tabs, 'no ' + dt + ' tabs under Mastercam');
        Object.keys(tabs).forEach(function (t) {
          var seen = {};
          namesOf(tabs[t], []).forEach(function (n) {
            used[n] = 1;
            var m = Ic(n, 16).replace(/ data-ic="[^"]*"/, '');
            if (seen[m] && seen[m] !== n) same.push(dt + ' ' + t + ': ' + seen[m] + ' = ' + n);
            seen[m] = n;
          });
        });
      });
      assert(!same.length, 'two icons on one tab look the same: ' + same.join('; '));
      var names = Object.keys(used).concat(own).filter(function (n, i, a) { return a.indexOf(n) === i; });
      names.forEach(function (n) {
        [16, 24, 32].forEach(function (sz) {
          var h = Ic(n, sz);
          assert(/ data-set="mastercam"/.test(h) && h.indexOf(' data-ic="' + n + '"') > 0, n + ' at ' + sz + ' is not marked as the set\'s');
          assert(h.indexOf('@') < 0 && h.indexOf('NaN') < 0 && h.indexOf('undefined') < 0, n + ' at ' + sz + ' has a placeholder left: ' + (/.{20}(@|NaN|undefined).{20}/.exec(h) || [''])[0]);
        });
      });
      // a drawing of the set's own is not Anvil's drawing
      Ic.sets.use(null);
      var builtin = {};
      try { own.forEach(function (n) { if (Ic.names().indexOf(n) >= 0) builtin[n] = Ic(n, 32); }); } finally { Ic.sets.use('mastercam'); }
      Object.keys(builtin).forEach(function (n) { assert(Ic(n, 32).replace(/ data-(set|ic)="[^"]*"/g, '') !== builtin[n], n + ' is Anvil\'s drawing'); });
      // a main line is whole device pixels wide at the sizes the chrome shows (16 small, 32 large under the frame: lane mcribbon, measured; was 24)
      var dpr = W.devicePixelRatio || 1, soft = [];
      ['line', 'circle', 'rect', 'spline', 'offset', 'skFillet', 'parallelLine'].forEach(function (n) {
        [16, 32].forEach(function (sz) {
          var box = D.createElement('div'); box.innerHTML = Ic(n, sz);
          Array.prototype.forEach.call(box.querySelectorAll('[stroke="' + set.palette.line + '"], [stroke="' + set.palette.slate + '"]'), function (e) {
            var w = parseFloat(e.getAttribute('stroke-width')) * sz / 16 * dpr;
            if (Math.abs(w - Math.round(w)) > 0.02 || w < 1) soft.push(n + '@' + sz + ' ' + w.toFixed(2));
          });
        });
      });
      assert(!soft.length, 'lines that are not whole device pixels: ' + soft.join(', '));
      // contrast on the profile's own ribbon colours
      var vars = UI.Profiles.get('mastercam').frame.theme.vars, low = [];
      [['light', vars.light['--mc-ribbon']], ['dark', vars.dark['--mc-ribbon']]].forEach(function (g) {
        [['line', set.palette.line], ['slate', set.palette.slate], ['red', set.palette.red], ['green', set.palette.green]].forEach(function (c) {
          var r = rfLXContrast(c[1], g[1]);
          if (r < 3) low.push(c[0] + ' ' + c[1] + ' on the ' + g[0] + ' ribbon ' + g[1] + ': ' + r.toFixed(2));
        });
      });
      assert(!low.length, 'under 3 : 1: ' + low.join('; '));
      return names.length + ' names, ' + own.length + ' drawn for the set';
    } finally { await rfLXReset(); }
  });
