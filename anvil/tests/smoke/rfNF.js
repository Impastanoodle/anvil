  // --- rfNF (2026-11-16, lane mcicons2: under the Mastercam profile every icon shows its own command) ---
  // The user (SolidWorks profile): Circle and Perimeter Circle look the same, Chamfer shows no chamfer. The same audit
  // under Mastercam (icons-mastercam.js): every pair of items inside one ribbon group, one drop-down and one strip of
  // the chrome is rasterized at 16 and 32 px (1x, white ground, the ink #3b3b3b) and compared. The score of a pair is
  // the mean, over the pixels either icon inks, of the largest channel difference (0 = the same picture, 1 = every
  // inked pixel black against white). The survey scored the old set (16 px / 32 px):
  //   Straight Slot / Centerpoint Straight Slot 0.032 / 0.029, Hidden Lines Removed / Visible 0.047 / 0.044,
  //   Closed / Welded Corner 0.051 / 0.035, Display-Delete / Add Relation 0.053 / 0.053, Constant Fillet / One Distance
  //   Chamfer 0.057 / 0.072, Dimple / Lance 0.110, Dimple / Louver 0.128, Bookmark Save / Restore 0.132,
  //   Blank / Unblank 0.137, Move Up / Move Down 0.141, Louver / Rib 0.148, Louver / Lance 0.150, the view cubes 0.146.
  // Every pair the survey judged confusable at a glance scored 0.150 or less at 16 px, so the bar is 0.155 at 16 px
  // (where a stack or a drop-down shows them side by side) and 0.10 at 32 px; after the redraw the closest pair is
  // Unzoom 50 % / Unzoom 80 % at 0.161, then Constant Fillet / One Distance Chamfer 0.173.
  // Pairs whose ribbon items carry the same icon name (Sweep / Swept Cut, Loft / Lofted Cut, Level / Levels, the More
  // tab's snaps and backgrounds) are not the set's to tell apart: they are listed and may only shrink (lane uisense).
  var RFNF_BAR16 = 0.155, RFNF_BAR32 = 0.10, RFNF_INK = '#3b3b3b';
  var RFNF_SHARED = ['part / Home / Organize: levels', 'part / Solids / Create: loft', 'part / Solids / Create: sweep', 'part / More / Sketch: quickSnaps',
    'part / More / View: vBackground', 'assembly / More / View: vBackground'];
  // the tabs and groups Mastercam itself has: every icon there is drawn for the set (Sheet Metal, Assembly, View
  // Layout, the drawing's Sketch / Sheet Format and More are Anvil's or SolidWorks' tabs kept whole: restyled)
  var RFNF_OWN_TABS = ['part / Home', 'part / Wireframe', 'part / Solids', 'part / Drafting', 'part / Transform', 'part / View', 'assembly / Home', 'assembly / View',
    'drawing / Drafting / Dimension', 'drawing / Drafting / Ordinate', 'drawing / Drafting / Annotate'];
  function rfNFGroups() {
    var groups = [];
    ['part', 'assembly', 'drawing'].forEach(function (dt) {
      var tabs = UI.profileRibbon(dt);
      assert(tabs, 'no ' + dt + ' ribbon under Mastercam');
      Object.keys(tabs).forEach(function (t) {
        var g = {}, order = [];
        function add(k, it) { if (!g[k]) { g[k] = []; order.push(k); } g[k].push({ n: it.icon || it.id, l: String(it.label || '').replace(/\n/g, ' ') }); }
        function walk(items, gname) {
          (items || []).forEach(function (it) {
            if (!it || it.sep) return;
            var gg = it.group || gname;
            if (it.stack) return walk(it.stack, gg);
            // a drop-down is compared inside itself and with the rest of its group (its face shows any of them)
            if (it.fly && it.items) { it.items.forEach(function (x) { add(gg, x); add(gg + ' > ' + String(it.label || it.fly).replace(/\n/g, ' '), x); }); return; }
            add(gg, it);
          });
        }
        walk(tabs[t], t);
        order.forEach(function (k) { groups.push({ where: dt + ' / ' + t + ' / ' + k, items: g[k] }); });
      });
    });
    return groups;
  }
  var rfNFCache = {};
  function rfNFPixels(name, size) {
    var key = name + '@' + size;
    if (rfNFCache[key]) return Promise.resolve(rfNFCache[key]);
    var svg = W.Icons(name, size).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" style="color:' + RFNF_INK + '" ');
    return new Promise(function (res) {
      var im = new W.Image(), c = D.createElement('canvas'), x;
      c.width = c.height = size; x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, size, size);
      im.onload = function () { x.drawImage(im, 0, 0, size, size); res(rfNFCache[key] = x.getImageData(0, 0, size, size).data); };
      im.onerror = function () { res(rfNFCache[key] = x.getImageData(0, 0, size, size).data); };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function rfNFInked(a, i) { return Math.max(255 - a[i], 255 - a[i + 1], 255 - a[i + 2]) > 24; }
  function rfNFInk(a) { var n = 0; for (var i = 0; i < a.length; i += 4) if (rfNFInked(a, i)) n++; return n; }
  function rfNFDist(a, b) {
    var s = 0, n = 0;
    for (var i = 0; i < a.length; i += 4) {
      if (!rfNFInked(a, i) && !rfNFInked(b, i)) continue;
      n++; s += Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) / 255;
    }
    return n ? s / n : 0;
  }
  // every pair in every group: { low: pairs under the bar, shared: 'where: name' of items that share a name, min }
  async function rfNFPairs(groups) {
    var low = [], shared = [], min = null, n = 0;
    for (var gi = 0; gi < groups.length; gi++) {
      var it = groups[gi].items;
      for (var i = 0; i < it.length; i++) for (var j = i + 1; j < it.length; j++) {
        var a = it[i].n, b = it[j].n;
        if (a === b) { var k = groups[gi].where.replace(/ > .*$/, '') + ': ' + a; if (shared.indexOf(k) < 0) shared.push(k); continue; }
        var d16 = rfNFDist(await rfNFPixels(a, 16), await rfNFPixels(b, 16)), d32 = rfNFDist(await rfNFPixels(a, 32), await rfNFPixels(b, 32));
        n++;
        var p = groups[gi].where + ': ' + a + ' / ' + b + ' ' + d16.toFixed(3) + ' / ' + d32.toFixed(3);
        if (!min || d16 < min.d) min = { d: d16, p: p };
        if (d16 < RFNF_BAR16 || d32 < RFNF_BAR32) low.push(p);
      }
    }
    return { low: low, shared: shared, min: min, n: n };
  }
  async function rfNFStart(docType) {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    await anvil.newPart(); await idle();
    await anvil.run("p.sketch('Top').rect(0, 0, 4, 2).extrude(1)"); await idle();
    anvil.profile('mastercam');
    if (docType === 'assembly') { await anvil.newAssembly(); await idle(); }
    await wait(60);
  }
  async function rfNFReset() {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    if (modalOpen()) UI.closeModal();
    if (UI.closeMenus) UI.closeMenus();
    anvil.profile('solidworks');
    await anvil.newPart(); await idle();
  }

  step('rfNF: Mastercam, every ribbon group and drop-down of a part, an assembly and a drawing: no two items share an icon (beyond the items that share an icon name, a list that only shrinks) and every pair differs by more than 0.155 at 16 px and 0.10 at 32 px', async function () {
    try {
      await rfNFStart('part');
      assert(W.Icons.sets.active() === 'mastercam', 'the Mastercam set is not on');
      var groups = rfNFGroups(), r = await rfNFPairs(groups);
      assert(groups.length >= 60 && r.n >= 1200, groups.length + ' groups, ' + r.n + ' pairs: the ribbon was not read');
      var extra = r.shared.filter(function (k) { return RFNF_SHARED.indexOf(k) < 0; });
      assert(!extra.length, 'two items of one group now share an icon name: ' + extra.join('; '));
      assert(!r.low.length, r.low.length + ' pair(s) under the bar: ' + r.low.slice(0, 8).join('; '));
      return r.n + ' pairs in ' + groups.length + ' groups; closest ' + r.min.p;
    } finally { await rfNFReset(); }
  });

  step('rfNF: Mastercam, the chrome: the Quick Access Toolbar, each manager\'s tool row, the Levels tools, the status bar\'s display styles and the Quick Masks repeat no icon, every icon is the set\'s own drawing and not empty, and every pair differs by more than the bar', async function () {
    try {
      await rfNFStart('part');
      var set = W.Icons.sets.get('mastercam'), strips = [], names = function (sel) { return Array.prototype.map.call(D.querySelectorAll(sel), function (s) { return s.getAttribute('data-ic') || ''; }); };
      strips.push({ where: 'Quick Access Toolbar', items: names('#std-toolbar svg.ico') });
      ['solids', 'planes', 'levels'].forEach(function (m) {
        assert(UI.frameManager(m) === m, 'the ' + m + ' manager did not open');
        strips.push({ where: 'the ' + m + ' manager tool row', items: names('#mc-mgr-head .mc-tool svg.ico') });
      });
      strips.push({ where: 'the Levels tools', items: names('#levels-panel .lvl-tools svg.ico') });
      UI.frameManager('solids');
      strips.push({ where: 'the status bar', items: names('#mc-status svg.ico') });
      strips.push({ where: 'the Quick Masks', items: names('#vp-qmask svg.ico') });
      var total = 0, bad = [];
      strips.forEach(function (s) {
        total += s.items.length;
        s.items.forEach(function (n, i) {
          if (!n) bad.push(s.where + ': an icon with no name');
          else if (!set.has(n)) bad.push(s.where + ': ' + n + ' is Anvil\'s drawing restyled');
          if (s.items.indexOf(n) !== i) bad.push(s.where + ': ' + n + ' twice');
        });
      });
      assert(strips[0].items.length >= 8 && strips[1].items.length >= 5 && strips[4].items.length === 3 && strips[5].items.length === 5 && strips[6].items.length >= 9,
        'strips: ' + strips.map(function (s) { return s.where + ' ' + s.items.length; }).join(', '));
      assert(!bad.length, bad.slice(0, 6).join('; '));
      for (var i = 0; i < strips.length; i++) for (var j = 0; j < strips[i].items.length; j++) {
        var n = strips[i].items[j];
        assert(rfNFInk(await rfNFPixels(n, 16)) >= 12 && rfNFInk(await rfNFPixels(n, 32)) >= 40, strips[i].where + ': ' + n + ' draws (almost) nothing');
      }
      var r = await rfNFPairs(strips.map(function (s) { return { where: s.where, items: s.items.map(function (n) { return { n: n }; }) }; }));
      assert(!r.low.length, r.low.length + ' pair(s) under the bar: ' + r.low.slice(0, 6).join('; '));
      return total + ' icons in ' + strips.length + ' strips; closest ' + (r.min ? r.min.p : '-');
    } finally { await rfNFReset(); }
  });

  step('rfNF: Mastercam, every icon on the tabs Mastercam has (Home, Wireframe, Solids, Drafting, Transform, View; an assembly\'s Home and View; a drawing\'s Dimension, Ordinate and Annotate) is drawn for the set, not Anvil\'s drawing restyled, and inks at 16 and 32 px; every other tab\'s icon inks too', async function () {
    try {
      await rfNFStart('part');
      var set = W.Icons.sets.get('mastercam'), groups = rfNFGroups(), seen = {}, notOwn = [], empty = [], own = 0;
      for (var gi = 0; gi < groups.length; gi++) {
        var g = groups[gi], mine = RFNF_OWN_TABS.some(function (t) { return g.where.indexOf(t + ' / ') === 0 || g.where === t; });
        for (var i = 0; i < g.items.length; i++) {
          var n = g.items[i].n;
          if (mine && !set.has(n) && notOwn.indexOf(g.where + ': ' + n) < 0) notOwn.push(g.where + ': ' + n);
          if (mine && set.has(n)) own++;
          if (seen[n]) continue;
          seen[n] = 1;
          if (rfNFInk(await rfNFPixels(n, 16)) < 12 || rfNFInk(await rfNFPixels(n, 32)) < 40) empty.push(g.where + ': ' + n);
        }
      }
      assert(!notOwn.length, notOwn.length + ' icon(s) on Mastercam\'s own tabs are Anvil\'s drawing restyled: ' + notOwn.slice(0, 8).join('; '));
      assert(!empty.length, 'icons that draw (almost) nothing: ' + empty.slice(0, 8).join('; '));
      assert(own >= 250, own + ' items drawn for the set on Mastercam\'s own tabs');
      return own + ' items on Mastercam\'s tabs, ' + Object.keys(seen).length + ' names checked';
    } finally { await rfNFReset(); }
  });

  step('rfNF: SolidWorks -> Mastercam -> SolidWorks leaves every SolidWorks part tab\'s markup identical, and Mastercam -> SolidWorks -> Mastercam every Mastercam tab\'s', async function () {
    try {
      if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
      await anvil.newPart(); await idle();
      await anvil.run("p.sketch('Top').rect(0, 0, 4, 2).extrude(1)"); await idle();
      var tabsNow = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return !t.classList.contains('off'); }).map(function (t) { return t.textContent; }); };
      async function snap() { var o = {}, ts = tabsNow(); for (var i = 0; i < ts.length; i++) { UI.setRibbonTab(ts[i]); await wait(15); o[ts[i]] = $('ribbon-buttons').innerHTML; } return o; }
      function same(a, b, what) {
        assert(Object.keys(a).join() === Object.keys(b).join(), what + ': the tabs changed: ' + Object.keys(a).join() + ' / ' + Object.keys(b).join());
        Object.keys(a).forEach(function (t) { assert(a[t] === b[t], what + ': the ' + t + ' tab is not what it was (' + a[t].length + ' / ' + b[t].length + ' characters)'); });
      }
      anvil.profile('solidworks'); await wait(60);
      var sw = await snap();
      anvil.profile('mastercam'); await wait(80);
      var mc = await snap();
      anvil.profile('solidworks'); await wait(80);
      same(sw, await snap(), 'SolidWorks');
      assert(!D.querySelector('#ribbon-buttons svg.ico[data-set="mastercam"]'), 'a Mastercam icon left on the SolidWorks ribbon');
      anvil.profile('mastercam'); await wait(80);
      same(mc, await snap(), 'Mastercam');
      return Object.keys(sw).length + ' SolidWorks and ' + Object.keys(mc).length + ' Mastercam tabs identical';
    } finally { await rfNFReset(); }
  });
