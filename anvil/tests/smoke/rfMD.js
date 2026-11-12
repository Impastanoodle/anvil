  // --- rfMD (2026-11-12, lane swicons: the default profile's icon set in SolidWorks' style) ---
  // The default (SolidWorks) profile names an icon set too: `icons: { set: 'solidworks' }`, icons-solidworks.js. What a
  // look can promise without judging taste: under the default profile every icon on every CommandManager tab of a part,
  // an assembly and a drawing, the Quick Access toolbar, the FeatureManager tabs and tree, the Heads-up View toolbar and
  // the Task Pane tabs is drawn by the set and none is empty; the palette is the one measured on the user's SolidWorks
  // screenshots; the sketch blue keeps 3 : 1 on the light and the dark CommandManager; no two different commands on a
  // tab share a drawing (the known shared ones are listed); a greyed button's icon goes flat grey; Mastercam and back
  // leaves the markup identical; a profile with no `icons` section draws the built-in icons. Every step ends on the
  // default profile, the light theme and a new part.
  var RFMD_BOX = "p.sketch('Top').rect(0, 0, 4, 2).extrude(1)";
  function rfMDIcons(root) { return Array.prototype.slice.call((typeof root === 'string' ? D.querySelector(root) : root || D).querySelectorAll('svg.ico')); }
  function rfMDWhere(s) { var p = s.parentNode; return (s.getAttribute('data-ic') || 'unnamed') + ' in ' + (p.id || p.className || p.tagName) + ' / ' + ((p.parentNode && (p.parentNode.id || p.parentNode.className)) || '?'); }
  // the icons under `sel` in panes that are open (a closed drawing keeps a hidden tree in the manager panel): each must
  // be drawn by the set and carry its name, and none may be empty or without a size while shown
  function rfMDCheck(sel, what, min) {
    var root = D.querySelector(sel);
    assert(root, what + ': no ' + sel);
    var all = rfMDIcons(root).filter(function (s) { return !s.closest('[hidden]'); });
    assert(all.length >= (min == null ? 1 : min), what + ': ' + all.length + ' icons in ' + sel);
    var fallback = all.filter(function (s) { return s.getAttribute('data-set') !== 'solidworks' || !s.getAttribute('data-ic'); });
    assert(!fallback.length, what + ': ' + fallback.length + ' icon(s) not from the set: ' + fallback.slice(0, 4).map(rfMDWhere).join('; '));
    var empty = all.filter(function (s) {
      if (!s.children.length) return true;
      if (!s.getClientRects().length) return false;   // not shown now (the » overflow)
      var b = s.getBBox(), r = s.getBoundingClientRect();
      return Math.max(b.width, b.height) < 2 || r.width < 8 || r.height < 8;
    });
    assert(!empty.length, what + ': ' + empty.length + ' empty icon(s): ' + empty.slice(0, 4).map(rfMDWhere).join('; '));
    return all.length;
  }
  function rfMDTabs() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return !t.classList.contains('off'); }).map(function (t) { return t.textContent; }); }
  async function rfMDStart(docType) {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    anvil.profile('solidworks');
    await anvil.newPart(); await idle();
    await anvil.run(RFMD_BOX); await idle();
    if (docType === 'drawing') { UI.makeDrawing({ fresh: true }); await wait(300); await idle(); assert(UI.drawingActive(), 'no drawing'); }
    if (docType === 'assembly') { await anvil.newAssembly(); await idle(); }
    await wait(40);
  }
  async function rfMDReset() {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    if (modalOpen()) UI.closeModal();
    if (UI.closeMenus) UI.closeMenus();
    if (UI.drawingActive && UI.drawingActive()) { UI.closeDrawing(); await idle(); }
    anvil.profile('solidworks');
    if (D.documentElement.getAttribute('data-theme') === 'dark') { UI.setTheme('light'); await wait(300); }
    if (UI.Profiles.def('rfmd-plain')) UI.Profiles.unregister('rfmd-plain');
    await anvil.newPart(); await idle();
  }
  function rfMDRgb(c) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(c);
    if (m) return [+m[1], +m[2], +m[3]];
    m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(c);   // what a color-mix() computes to (the sketch blue follows the ink)
    assert(m, 'not a colour: ' + c);
    return [m[1] * 255, m[2] * 255, m[3] * 255];
  }
  function rfMDLum(c) {
    var v = rfMDRgb(c).map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function rfMDContrast(a, b) { var x = rfMDLum(a), y = rfMDLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function rfMDNear(a, b, tol) { var x = rfMDRgb(a), y = rfMDRgb(b); return Math.max(Math.abs(x[0] - y[0]), Math.abs(x[1] - y[1]), Math.abs(x[2] - y[2])) <= tol; }
  // the first opaque background behind an element
  function rfMDGround(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      var bg = W.getComputedStyle(e).backgroundColor, m = /rgba?\(([^)]+)\)/.exec(bg), p = m ? m[1].split(/[ ,\/]+/).map(Number) : null;
      if (p && (p.length < 4 || p[3] > 0.95)) return bg;
    }
    return 'rgb(255, 255, 255)';
  }

  step('rfMD: the default profile names the solidworks icon set and it is on; with the set off the built-in drawings carry no set mark; a profile with no icons section draws the built-in icons, and the set is back with the default profile', async function () {
    try {
      await rfMDStart();
      var Ic = W.Icons;
      assert(Ic.sets && Ic.sets.list().indexOf('solidworks') >= 0, 'the solidworks set is not registered');
      assert(UI.Profiles.def('solidworks').icons && UI.Profiles.def('solidworks').icons.set === 'solidworks', 'the default profile does not name the set as data');
      assert(Ic.sets.active() === 'solidworks' && UI.Profiles.icons.set() === 'solidworks', 'the set in use under the default profile is ' + Ic.sets.active());
      var set = Ic.sets.get('solidworks'), own = set.own();
      assert(own.length >= 140, 'the set draws only ' + own.length + ' icons itself');
      // the built-in drawings are still there, untouched by the set: off, they carry no mark of it
      var names = Ic.names(), on = names.map(function (n) { return Ic(n, 16); });
      Ic.sets.use(null);
      var off;
      try { off = names.map(function (n) { return Ic(n, 16); }); } finally { Ic.sets.use('solidworks'); }
      var marked = names.filter(function (n, i) { return off[i].indexOf('data-set') >= 0 || off[i].indexOf('data-ic') >= 0; });
      assert(!marked.length, 'built-in drawings with a set mark: ' + marked.slice(0, 5).join());
      var same = names.filter(function (n, i) { return on[i] === off[i]; });
      assert(!same.length, 'the set left ' + same.length + ' names as the built-in drawing: ' + same.slice(0, 5).join());
      names.forEach(function (n, i) { assert(Ic(n, 16) === on[i], 'the set drew ' + n + ' differently the second time'); });
      // a profile without an icons section
      UI.Profiles.register({ id: 'rfmd-plain', name: 'rfMD plain', labels: { extrude: 'Extrude' } });
      anvil.profile('rfmd-plain'); await wait(40);
      assert(Ic.sets.active() === null, 'a profile with no icons section kept the set ' + Ic.sets.active());
      assert(rfMDIcons('#ribbon-buttons').length > 5 && !D.querySelector('#ribbon-buttons svg.ico[data-set], #fm-tree svg.ico[data-set], #std-toolbar svg.ico[data-set], #hud svg.ico[data-set]'), 'set-drawn icons under a profile with no icons section');
      anvil.profile('solidworks'); await wait(40);
      assert(Ic.sets.active() === 'solidworks', 'the set did not come back with the default profile');
      rfMDCheck('#ribbon-buttons', 'the ribbon after coming back', 6);
      return names.length + ' names, ' + own.length + ' drawn for the set';
    } finally { await rfMDReset(); }
  });

  step('rfMD: default profile, a part: every icon on every CommandManager tab, the Quick Access toolbar, the FeatureManager tabs and tree, the Heads-up View toolbar and the Task Pane tabs comes from the set, and none is empty', async function () {
    try {
      await rfMDStart('part');
      var tabs = rfMDTabs(), n = 0;
      assert(tabs.indexOf('Features') >= 0 && tabs.indexOf('Sketch') >= 0 && tabs.indexOf('Sheet Metal') >= 0 && tabs.indexOf('Evaluate') >= 0, 'part tabs: ' + tabs.join());
      for (var i = 0; i < tabs.length; i++) { UI.setRibbonTab(tabs[i]); await wait(20); n += rfMDCheck('#ribbon-buttons', 'tab ' + tabs[i], 6); }
      UI.setRibbonTab('Features');
      n += rfMDCheck('#std-toolbar', 'Quick Access toolbar', 8);
      n += rfMDCheck('#fm-tabs', 'FeatureManager tabs', 5);
      n += rfMDCheck('#fm-tree', 'FeatureManager tree', 8);
      n += rfMDCheck('#hud', 'Heads-up View toolbar', 8);
      n += rfMDCheck('#tp-strip', 'Task Pane tabs', 5);
      n += rfMDCheck('#left', 'the whole manager panel (open panes)', 14);
      // the tree's folders have their own drawings
      var rows = {};
      Array.prototype.forEach.call(D.querySelectorAll('#fm-tree .ti'), function (r) { var s = r.querySelector('svg.ico'), nm = r.querySelector('.nm'); if (s && nm) rows[nm.textContent.replace(/[^A-Za-z].*$/, '')] = s.getAttribute('data-ic'); });
      assert(rows.History === 'folderHistory' && rows.Sensors === 'sensor' && rows.Annotations === 'annotations', 'tree rows: History ' + rows.History + ', Sensors ' + rows.Sensors + ', Annotations ' + rows.Annotations);
      assert(rows.Solid === 'folderSolid', 'Solid Bodies row: ' + rows.Solid);
      return n + ' icons on ' + tabs.length + ' tabs and the chrome, all from the set';
    } finally { await rfMDReset(); }
  });

  step('rfMD: default profile, an assembly and a drawing: every icon on every tab, the toolbars, the manager panel and the Task Pane comes from the set; a PropertyManager header and its OK / Cancel too', async function () {
    try {
      var n = 0, docs = ['assembly', 'drawing'];
      for (var d = 0; d < docs.length; d++) {
        await rfMDStart(docs[d]);
        var tabs = rfMDTabs();
        assert(tabs.length >= 3, docs[d] + ' tabs: ' + tabs.join());
        for (var i = 0; i < tabs.length; i++) { UI.setRibbonTab(tabs[i]); await wait(20); n += rfMDCheck('#ribbon-buttons', docs[d] + ' tab ' + tabs[i], 3); }
        n += rfMDCheck('#std-toolbar', docs[d] + ' Quick Access toolbar', 8);
        n += rfMDCheck('#left', docs[d] + ' manager panel', 6);
        n += rfMDCheck('#tp-strip', docs[d] + ' Task Pane tabs', 5);
        if (docs[d] === 'drawing') { n += rfMDCheck('#drawing-tree', 'the drawing\'s tree', 4); UI.closeDrawing(); await idle(); }
        else n += rfMDCheck('#hud', 'assembly Heads-up View toolbar', 8);
      }
      await rfMDStart('part');
      var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude'; })[0];
      UI.editFeature(f); await wait(200); await idle();
      assert(UI.hasPM(), 'no PropertyManager');
      n += rfMDCheck('#pm', 'the PropertyManager', 3);
      var ok = D.querySelector('#pm .pm-ok svg.ico'), no = D.querySelector('#pm .pm-cancel svg.ico');
      assert(ok && ok.getAttribute('data-ic') === 'ok' && no && no.getAttribute('data-ic') === 'cancel', 'OK / Cancel are ' + (ok && ok.getAttribute('data-ic')) + ' / ' + (no && no.getAttribute('data-ic')));
      UI.closePM();
      return n + ' icons';
    } finally { await rfMDReset(); }
  });

  step('rfMD: the palette is the one measured on the SolidWorks screenshots (outline #323232, navy #003755, blues #95daf4 / #69acca / #3e87a8, part yellow #f7cb20, within 8 levels), Extruded Boss/Base is drawn with it, and the sketch blue keeps 3 : 1 on the light and the dark CommandManager', async function () {
    try {
      await rfMDStart('part');
      var set = W.Icons.sets.get('solidworks'), p = set.palette;
      assert(p, 'the set has no palette');
      var want = [[p.outline, '#323232', 'outline'], [p.navy, '#003755', 'navy outline'], [p.blue[0], '#95daf4', 'lit blue'], [p.blue[1], '#69acca', 'front blue'], [p.blue[2], '#3e87a8', 'side blue'], [p.yellow[2], '#f7cb20', 'part yellow'], [p.line, '#2f7ca3', 'sketch line']];
      want.forEach(function (w) { assert(rfMDNear(w[0], w[1], 8), w[2] + ' is ' + w[0] + ', measured ' + w[1]); });
      UI.setRibbonTab('Features'); await wait(20);
      var ex = D.querySelector('#ribbon-buttons svg.ico[data-ic="extrude"]');
      assert(ex, 'no Extruded Boss/Base icon');
      var fills = {}, strokes = {};
      Array.prototype.forEach.call(ex.querySelectorAll('path, rect'), function (e) { fills[(e.getAttribute('fill') || '').toLowerCase()] = 1; strokes[(e.getAttribute('stroke') || '').toLowerCase()] = 1; });
      assert(fills[p.blue[1].toLowerCase()] && strokes[p.navy.toLowerCase()] && strokes[p.outline.toLowerCase()], 'Extruded Boss/Base: fills ' + Object.keys(fills).join() + ', strokes ' + Object.keys(strokes).join());
      // a body's outline is one CSS pixel at the large and the small size
      [16, 32].forEach(function (sz) {
        var box = D.createElement('div'); box.innerHTML = W.Icons('cut', sz);
        var w = Array.prototype.map.call(box.querySelectorAll('[stroke="' + p.outline + '"]'), function (e) { return parseFloat(e.getAttribute('stroke-width')) * sz / 16 * (W.devicePixelRatio || 1); });
        assert(w.length >= 3 && w.every(function (x) { return Math.abs(x - Math.round(x)) < 0.02 && Math.round(x) >= 1 && Math.round(x) <= 2; }), 'Extruded Cut at ' + sz + ' px: outline widths in device px ' + w.join());
      });
      // the sketch line as it is drawn on the CommandManager, light and dark
      UI.setRibbonTab('Sketch'); await wait(20);
      var res = [];
      var themes = ['light', 'dark'];
      for (var t = 0; t < themes.length; t++) {
        UI.setTheme(themes[t]); await wait(320);
        var ln = D.querySelector('#ribbon-buttons svg.ico[data-ic="line"] path'), ground = rfMDGround(D.getElementById('ribbon-buttons'));
        assert(ln, 'no Line icon on the Sketch tab');
        var c = W.getComputedStyle(ln).stroke, r = rfMDContrast(c, ground);
        assert(r >= 3, themes[t] + ': the sketch line ' + c + ' on ' + ground + ' is ' + r.toFixed(2) + ' : 1');
        res.push(themes[t] + ' ' + r.toFixed(1));
      }
      return 'palette within 8 levels; sketch line ' + res.join(', ');
    } finally { await rfMDReset(); }
  });

  step('rfMD: no two different commands on one CommandManager tab of a part share a drawing, but for the listed ones (a flyout\'s own rows, the three backgrounds, Offset On Surface, a command placed on two tabs)', async function () {
    try {
      await rfMDStart('part');
      // commands that share a drawing on purpose or by a known gap (report: Offset On Surface, the Quick Snaps rows, the backgrounds)
      var SHARED = { quickSnaps: 1, vBackground: 1, offset: 1, dxf: 1 };
      var tabs = rfMDTabs(), n = 0, bad = [];
      tabs.forEach(function (t) {
        var items = UI.RIBBON[t] ? UI.ribbonLeaves(UI.RIBBON[t]) : [], seen = {};
        items.forEach(function (it) {
          var s = UI.ribbonItemState(it), box = D.createElement('div');
          box.innerHTML = W.Icons(s.icon, 32);
          var m = box.firstChild.innerHTML;
          n++;
          if (seen[m] && seen[m].flat !== s.flat && !SHARED[s.icon]) bad.push(t + ': ' + seen[m].flat + ' = ' + s.flat + ' (' + s.icon + ')');
          else if (!seen[m]) seen[m] = s;
        });
      });
      assert(!bad.length, bad.length + ' pair(s) of commands with one drawing: ' + bad.slice(0, 6).join('; '));
      // Swept Cut and Lofted Cut have their own drawings under the set, and go back to Sweep's and Loft's without it
      UI.setRibbonTab('Features'); await wait(20);
      var cut = D.querySelector('#ribbon-buttons .rb[aria-label="Swept Cut"] svg.ico'), boss = D.querySelector('#ribbon-buttons .rb[aria-label="Swept Boss/Base"] svg.ico');
      assert(cut && boss && cut.getAttribute('data-ic') === 'sweptCut' && boss.getAttribute('data-ic') === 'sweep', 'Swept Cut / Swept Boss are ' + (cut && cut.getAttribute('data-ic')) + ' / ' + (boss && boss.getAttribute('data-ic')));
      var ref = D.querySelector('#ribbon-buttons .rb[aria-label="Reference Geometry"] svg.ico');
      assert(ref && ref.getAttribute('data-ic') === 'refgeo', 'the Reference Geometry button shows ' + (ref && ref.getAttribute('data-ic')));
      return n + ' ribbon items on ' + tabs.length + ' tabs';
    } finally { await rfMDReset(); }
  });

  step('rfMD: a greyed button under the set: its icon is a flat grey drawing (a grayscale filter on the set\'s icon), under Mastercam and under a profile without a set it is not filtered', async function () {
    try {
      await rfMDStart('part');
      UI.setRibbonTab('Features'); await wait(20);
      var b = D.querySelector('#ribbon-buttons .rb[aria-label="Extruded Boss/Base"]');
      assert(b && !b.disabled, 'no enabled Extruded Boss/Base button');
      var ico = b.querySelector('svg.ico');
      assert(W.getComputedStyle(ico).filter === 'none', 'an enabled icon is filtered: ' + W.getComputedStyle(ico).filter);
      b.disabled = true;
      var f = W.getComputedStyle(ico).filter;
      b.disabled = false;
      assert(/grayscale\(1\)/.test(f), 'a greyed icon of the set is not grey: filter ' + f);
      UI.refreshRibbon();
      anvil.profile('mastercam'); await wait(60);
      var mb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return x.querySelector('svg.ico') && !x.disabled; })[0];
      assert(mb, 'no ribbon button under Mastercam');
      mb.disabled = true;
      var mf = W.getComputedStyle(mb.querySelector('svg.ico')).filter;
      mb.disabled = false;
      assert(mf === 'none', 'Mastercam: a greyed icon got the filter ' + mf);
      return 'filter ' + f;
    } finally { await rfMDReset(); }
  });

  step('rfMD: default -> Mastercam -> default: the ribbon, the FeatureManager tabs and tree, the toolbars and the Task Pane tabs are exactly what they were', async function () {
    try {
      await rfMDStart('part');
      UI.setRibbonTab('Features'); UI.refreshTree(); await wait(40);
      var snap = function () { return { ribbon: $('ribbon-buttons').innerHTML, tree: $('fm-tree').innerHTML, toolbar: $('std-toolbar').innerHTML, tabs: $('fm-tabs').innerHTML, hud: $('hud').innerHTML, task: $('tp-strip').innerHTML }; };
      var a = snap();
      anvil.profile('mastercam'); await wait(80);
      assert(W.Icons.sets.active() === 'mastercam', 'Mastercam did not turn its set on');
      assert(!D.querySelector('#ribbon-buttons svg.ico[data-set="solidworks"], #std-toolbar svg.ico[data-set="solidworks"]'), 'icons of the solidworks set left on the Mastercam ribbon or toolbar');
      anvil.profile('solidworks'); await wait(80);
      UI.setRibbonTab('Features'); UI.refreshTree(); await wait(40);
      var b = snap();
      Object.keys(a).forEach(function (k) { assert(a[k] === b[k], 'the ' + k + ' markup changed over a round trip through Mastercam'); });
      assert(!D.querySelector('svg.ico[data-set="mastercam"]'), 'icons of the Mastercam set left behind');
      return Object.keys(a).length + ' parts of the window identical';
    } finally { await rfMDReset(); }
  });
