  // --- rfNE (2026-11-16, lane swparticons: under the SolidWorks profile every part, sheet-metal, assembly and drawing
  // icon shows its own command) ---
  // The user, with a screenshot of the Fillet / Chamfer flyout: "chamfer preview has no chamfer". The groups a user
  // compares by eye are a tab's button group, a flyout, a menu section, a toolbar, the tree's row types: in each of
  // those (every tab but Sketch, which is lane swsketchicons', rfND) no two commands may share a drawing and every pair
  // must differ clearly at the size it is shown. "Clearly" is measured: both icons rasterized on SolidWorks' chrome
  // grey (#d7dade) at 16 and at 32 px, a pixel counts when its colour differs by more than 72 (|dR| + |dG| + |dB|; the
  // gap between the two lightest feature blues is 132, so a change of blue counts). The threshold, 16 px at
  // 16 and 48 px at 32 (a 4 x 4 block at 16; lines double and areas quadruple at 32), comes from the survey of
  // 2026-11-16: the old Fillet / Chamfer pair scored 4 / 32 (a thin sliver apart; step 2 measures it again), and Hidden Lines
  // Removed / Visible, Edge Flange / Fold, Sketched Bend / Insert Bends, the Corners flyout and the three backgrounds
  // (one drawing) were under it too; after the redraw the closest pair is Hidden Lines
  // Removed / Visible at 20 / 85 and the new Fillet / Chamfer pair 57 / 208. Every step ends on the
  // default profile, the light theme and a new part.
  var RFNE_BOX = "p.sketch('Top').rect(0, 0, 4, 2).extrude(1)";
  var RFNE_MIN16 = 16, RFNE_MIN32 = 48;
  // the drawings of Fillet and Chamfer before this lane (16-grid bodies, kept to prove the threshold catches them)
  var RFNE_OLD = {
    fillet: '<path d="M1.5 8.5 H10.5 V14.5 H1.5 z" fill="#f0f0f0" stroke="#323232" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><path d="M10.5 8.5 C10.5 7 11.5 6.5 12.5 6.5 L14.5 4.5 V10.5 L10.5 14.5 z" fill="#d6d6d6" stroke="#323232" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><path d="M3.5 6.5 L5.5 4.5 H14.5 L12.5 6.5 z" fill="#fefefe" stroke="#323232" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><path d="M1.5 8.5 C1.5 7 2.5 6.5 3.5 6.5 H12.5 C11.5 6.5 10.5 7 10.5 8.5 z" fill="#69acca" stroke="#003755" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><path d="M3 7 H11.4 L11 7.6 H2.4 z" fill="#95daf4" stroke="none"/>',
    chamfer: '<path d="M1.5 8.5 H10.5 V14.5 H1.5 z" fill="#f0f0f0" stroke="#323232" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><path d="M10.5 8.5 L12.5 6.5 L14.5 4.5 V10.5 L10.5 14.5 z" fill="#d6d6d6" stroke="#323232" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><path d="M3.5 6.5 L5.5 4.5 H14.5 L12.5 6.5 z" fill="#fefefe" stroke="#323232" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><path d="M1.5 8.5 L3.5 6.5 H12.5 L10.5 8.5 z" fill="#69acca" stroke="#003755" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>'
  };
  // the tree's row types (ui-panels.js featureIcon / FEATURE_ICON, the folders and the part rows) and an assembly's rows
  var RFNE_TREE = ['sketch', 'planeSmall', 'origin', 'extrude', 'cut', 'flange', 'revolve', 'revolveCut', 'boundary', 'boundaryCut', 'bend', 'miter', 'hem', 'jog', 'sketchedBend', 'breakCorner', 'closedCorner', 'unfold', 'fold',
    'lpattern', 'cpattern', 'mirror', 'chamfer', 'fillet', 'sweep', 'loft', 'shell', 'imported', 'holeWizard', 'refAxis', 'refPoint', 'csys', 'rip', 'vent', 'crossBreak', 'cornerRelief', 'weldedCorner',
    'sweptFlange', 'formingTool', 'draft', 'splitLine', 'sketch3d', 'helix', 'projCurve', 'compositeCurve', 'xyzCurve', 'refPtCurve', 'wrap', 'insertBends', 'convertSM', 'rib', 'intersect', 'deleteBody',
    'folderHistory', 'sensor', 'annotations', 'equations', 'folderSolid', 'folderCut', 'folderFlat', 'material', 'body', 'part', 'flatten', 'error', 'warn'];
  var RFNE_ASM_ROWS = ['matesFolder', 'component', 'assembly', 'part', 'origin', 'planeSmall', 'folderHistory'];
  var RFNE_DRW_ROWS = ['drawing', 'sheet', 'sheetFormat', 'drawingView', 'part', 'annotations'];
  var RFNE_PM_TYPES = [['Chamfer Type', ['chamferAngleDistance', 'chamferDistanceDistance', 'chamferVertex', 'chamferOffsetFace', 'chamferFaceFace']],
    ['Fillet Type', ['filletConstant', 'filletVariable', 'filletFace', 'filletFullRound']], ['Rib thickness', ['ribFirstSide', 'ribBothSides', 'ribSecondSide']],
    ['Flange Position', ['flangePosMaterialInside', 'flangePosMaterialOutside', 'flangePosBendOutside']]];
  function rfNETabs() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return !t.classList.contains('off'); }).map(function (t) { return t.textContent; }); }
  // the groups of one document's CommandManager (every tab but Sketch): its button groups (between separators, or a
  // View-tab caption), each flyout, the whole tab; `sk` collects the Sketch tab's names (lane swsketchicons')
  function rfNERibbon(doc, out, sk) {
    rfNETabs().forEach(function (t) {
      UI.setRibbonTab(t);
      var list = UI.ribbonShownItems() || [];
      if (t === 'Sketch') { UI.ribbonLeaves(list).forEach(function (it) { sk[UI.ribbonItemState(it).icon] = 1; }); return; }
      var all = [], sec = [], cap = null, n = 0;
      function push(where, items) { if (items.length) out.push({ where: where, items: items }); }
      function add(it, into) {
        if (!it || it.sep) return;
        if (it.stack) { it.stack.forEach(function (x) { add(x, into); }); return; }
        if (it.items) { var g = []; it.items.forEach(function (x) { add(x, g); }); push(doc + ' ' + t + ' flyout ' + (it.fly || '?'), g); g.forEach(function (x) { into.push(x); }); return; }
        if (it.grid) { it.grid.forEach(function (x) { add(x, into); }); return; }
        if (it.label) { var s = UI.ribbonItemState(it); into.push({ label: s.flat, icon: s.icon }); }
      }
      list.forEach(function (it) {
        if (!it) return;
        if (it.sep || (it.group && cap !== null && it.group !== cap)) { push(doc + ' ' + t + ' group ' + (cap || n), sec); sec = []; n++; }
        if (it.group) cap = it.group;
        var tmp = []; add(it, tmp); tmp.forEach(function (x) { sec.push(x); all.push(x); });
      });
      push(doc + ' ' + t + ' group ' + (cap || n), sec);
      var seen = {};
      push(doc + ' ' + t + ' tab', all.filter(function (x) { var k = x.label + '|' + x.icon; if (seen[k]) return false; seen[k] = 1; return true; }));
    });
  }
  // a toolbar or a tab row as it is drawn: each shown icon with its button's name
  function rfNEDom(where, sel, out) {
    var root = D.querySelector(sel);
    assert(root, where + ': no ' + sel);
    var items = Array.prototype.filter.call(root.querySelectorAll('svg.ico'), function (s) { return !s.closest('[hidden]'); }).map(function (s) {
      var b = s.closest('button, [title], [aria-label]');
      return { label: b ? (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').trim() : '', icon: s.getAttribute('data-ic') || '', svg: s };
    });
    out.push({ where: where, items: items });
  }
  // the menus' sections (rows with an icon, between separators; a submenu is its own); Tools' sketch rows are lane
  // swsketchicons' and Tools > Blocks shares one drawing (reported to that lane), so the Tools menu is left to rfND
  function rfNEMenus(doc, out) {
    (UI.menuModel ? UI.menuModel() : []).forEach(function (m) {
      if (m.label === 'Tools') return;
      (function walk(items, where) {
        var sec = [], n = 0;
        (items || []).forEach(function (it) {
          if (!it) return;
          if (it.sep) { if (sec.length) out.push({ where: where + ' section ' + n, items: sec }); sec = []; n++; return; }
          if (it.items && it.items.length) walk(it.items, where + ' > ' + it.label);
          if (it.icon) sec.push({ label: it.label, icon: it.icon });
        });
        if (sec.length) out.push({ where: where + ' section ' + n, items: sec });
      })(m.items, doc + ' menu ' + m.label);
    });
  }
  async function rfNEStart(docType) {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    anvil.profile('solidworks');
    await anvil.newPart(); await idle();
    await anvil.run(RFNE_BOX); await idle();
    if (docType === 'drawing') { UI.makeDrawing({ fresh: true }); await wait(300); await idle(); assert(UI.drawingActive(), 'no drawing'); }
    if (docType === 'assembly') { await anvil.newAssembly(); await idle(); }
    await wait(40);
  }
  async function rfNEReset() {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    if (modalOpen()) UI.closeModal();
    if (UI.closeMenus) UI.closeMenus();
    if (UI.drawingActive && UI.drawingActive()) { UI.closeDrawing(); await idle(); }
    anvil.profile('solidworks');
    if (D.documentElement.getAttribute('data-theme') === 'dark') { UI.setTheme('light'); await wait(300); }
    await anvil.newPart(); await idle();
  }
  // every group of mine, in a part, an assembly and a drawing; and the Sketch tab's names (not mine)
  async function rfNEGroups() {
    var out = [], sk = {};
    await rfNEStart('part');
    rfNERibbon('part', out, sk);
    UI.setRibbonTab('Features'); await wait(20);
    rfNEDom('part Quick Access toolbar', '#std-toolbar', out);
    rfNEDom('part FeatureManager tabs', '#fm-tabs', out);
    rfNEDom('part Task Pane tabs', '#tp-strip', out);
    rfNEDom('part Heads-up View toolbar', '#hud', out);
    rfNEMenus('part', out);
    out.push({ where: 'part tree row types', items: RFNE_TREE.map(function (n) { return { label: n, icon: n }; }) });
    var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude'; })[0];
    UI.editFeature(f); await wait(200); await idle();
    assert(UI.hasPM(), 'no PropertyManager');
    rfNEDom('a PropertyManager', '#pm', out);
    UI.closePM(); await idle();
    await rfNEStart('assembly');
    rfNERibbon('assembly', out, sk);
    rfNEMenus('assembly', out);
    out.push({ where: 'assembly tree row types', items: RFNE_ASM_ROWS.map(function (n) { return { label: n, icon: n }; }) });
    await rfNEStart('drawing');
    rfNERibbon('drawing', out, sk);
    rfNEMenus('drawing', out);
    out.push({ where: 'drawing tree row types', items: RFNE_DRW_ROWS.map(function (n) { return { label: n, icon: n }; }) });
    UI.closeDrawing(); await idle();
    // the PropertyManagers' type buttons (lane pmsense asks the set for these names; each row is one group)
    RFNE_PM_TYPES.forEach(function (g) { out.push({ where: 'PropertyManager ' + g[0] + ' buttons', items: g[1].map(function (n) { return { label: n, icon: n }; }) }); });
    return { groups: out, sketch: sk };
  }
  // an icon rasterized on the chrome grey (markup: a name, or an <svg> string)
  function rfNERaster(markup, size) {
    return new Promise(function (res) {
      var s = markup.charAt(0) === '<' ? markup : W.Icons(markup, size);
      if (s.indexOf('xmlns=') < 0) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      s = s.replace('<svg', '<svg style="color:#3e3e3e"').replace(/width="[^"]*"/, 'width="' + size + '"').replace(/height="[^"]*"/, 'height="' + size + '"');
      var img = new W.Image(), c = D.createElement('canvas'); c.width = c.height = size;
      var x = c.getContext('2d');
      img.onload = function () { x.fillStyle = '#d7dade'; x.fillRect(0, 0, size, size); x.drawImage(img, 0, 0, size, size); res(x.getImageData(0, 0, size, size).data); };
      img.onerror = function () { res(null); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    });
  }
  function rfNEDiff(a, b) {
    var n = 0;
    for (var i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 72) n++;
    return n;
  }
  // pixels within 60 (|dR| + |dG| + |dB|) of one of the feature blues
  function rfNEBlue(a) {
    var blues = [[0x95, 0xda, 0xf4], [0x69, 0xac, 0xca], [0x3e, 0x87, 0xa8]], n = 0;
    for (var i = 0; i < a.length; i += 4) if (blues.some(function (c) { return Math.abs(a[i] - c[0]) + Math.abs(a[i + 1] - c[1]) + Math.abs(a[i + 2] - c[2]) <= 60; })) n++;
    return n;
  }
  async function rfNEScore(a, b) {
    return [rfNEDiff(await rfNERaster(a, 16), await rfNERaster(b, 16)), rfNEDiff(await rfNERaster(a, 32), await rfNERaster(b, 32))];
  }

  step('rfNE: SolidWorks profile: every icon of the part, assembly and drawing tabs but Sketch (buttons, flyouts), the menus but Tools, the Quick Access and Heads-up toolbars, the FeatureManager and Task Pane tabs, a PropertyManager, the Fillet / Chamfer / Rib / flange-position type buttons and every tree row type is drawn by the set and is not empty', async function () {
    try {
      var r = await rfNEGroups(), names = {}, bad = [], empty = [];
      assert(r.groups.length >= 40, 'only ' + r.groups.length + ' groups');
      r.groups.forEach(function (g) { g.items.forEach(function (it) { if (!r.sketch[it.icon]) names[it.icon] = g.where; }); });
      var list = Object.keys(names);
      assert(list.length >= 200, 'only ' + list.length + ' names');
      var host = D.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#d7dade;color:#3e3e3e';
      D.body.appendChild(host);
      try {
        list.forEach(function (n) {
          if (!n) { bad.push('an unnamed icon in ' + names[n]); return; }
          var s = W.Icons(n, 32);
          if (s.indexOf('data-set="solidworks"') < 0 || !W.Icons.has(n)) bad.push(n + ' (' + names[n] + ')');
          host.innerHTML = s;
          var b = host.firstChild.getBBox();
          if (!host.firstChild.children.length || Math.max(b.width, b.height) < 4) empty.push(n);
        });
      } finally { host.remove(); }
      assert(!bad.length, bad.length + ' icon(s) not drawn by the set: ' + bad.slice(0, 6).join('; '));
      assert(!empty.length, 'empty icons: ' + empty.slice(0, 6).join(', '));
      return list.length + ' names in ' + r.groups.length + ' groups, all from the set';
    } finally { await rfNEReset(); }
  });

  step('rfNE: in every tab, flyout, button group, toolbar, menu section and tree of mine no two commands share a drawing and every pair differs in at least 16 px at 16 px and 48 px at 32 px; the old Fillet / Chamfer pair fails that test', async function () {
    try {
      // the threshold catches what the user saw: the old Fillet / Chamfer drawings (4 / 32 when this test was written)
      var old = await rfNEScore(W.Icons.svg(RFNE_OLD.fillet, 16), W.Icons.svg(RFNE_OLD.chamfer, 16));
      var old32 = rfNEDiff(await rfNERaster(W.Icons.svg(RFNE_OLD.fillet, 32), 32), await rfNERaster(W.Icons.svg(RFNE_OLD.chamfer, 32), 32));
      assert(old[0] < RFNE_MIN16 && old32 < RFNE_MIN32, 'the old Fillet / Chamfer pair passes the threshold: ' + old[0] + ' / ' + old32);
      var r = await rfNEGroups(), cache = {}, done = {}, low = [], same = [], pairs = 0, worst = null;
      async function ras(n, sz) { var k = n + '@' + sz; if (!cache[k]) cache[k] = await rfNERaster(n, sz); return cache[k]; }
      for (var g = 0; g < r.groups.length; g++) {
        var it = r.groups[g].items;
        for (var i = 0; i < it.length; i++) for (var j = i + 1; j < it.length; j++) {
          var a = it[i], b = it[j];
          if (a.label === b.label && a.icon === b.icon) continue;   // one command placed twice
          if (r.sketch[a.icon] && r.sketch[b.icon]) continue;      // both lane swsketchicons' (rfND)
          if (a.icon === b.icon) { same.push(r.groups[g].where + ': ' + a.label + ' = ' + b.label + ' (' + a.icon + ')'); continue; }
          var key = [a.icon, b.icon].sort().join('|');
          if (done[key]) continue;
          done[key] = 1; pairs++;
          var d16 = rfNEDiff(await ras(a.icon, 16), await ras(b.icon, 16)), d32 = rfNEDiff(await ras(a.icon, 32), await ras(b.icon, 32));
          if (!worst || d16 < worst[0]) worst = [d16, d32, a.icon + ' / ' + b.icon];
          if (d16 < RFNE_MIN16 || d32 < RFNE_MIN32) low.push(r.groups[g].where + ': ' + a.label + ' [' + a.icon + '] / ' + b.label + ' [' + b.icon + '] ' + d16 + ' / ' + d32);
        }
      }
      assert(!same.length, same.length + ' pair(s) of commands with one drawing: ' + same.slice(0, 5).join('; '));
      assert(!low.length, low.length + ' pair(s) too alike: ' + low.slice(0, 5).join('; '));
      assert(pairs > 1500, 'only ' + pairs + ' pairs compared');
      return pairs + ' pairs; the closest ' + worst[2] + ' ' + worst[0] + ' / ' + worst[1] + '; old Fillet / Chamfer ' + old[0] + ' / ' + old32;
    } finally { await rfNEReset(); }
  });

  step('rfNE: the Fillet / Chamfer flyout shows two drawings told apart at 16 px; Chamfer shows its bevel and Fillet its round: the feature blue covers at least 160 px of each at 32 px (208 each now, the old Chamfer 51)', async function () {
    try {
      await rfNEStart('part');
      UI.setRibbonTab('Features'); await wait(20);
      var fl = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-fly'), function (w) { return w._fly && w._fly.fly === 'fillet'; })[0];
      assert(fl, 'no Fillet flyout on the Features tab');
      var caret = fl.querySelector('.rb-caret');
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click();
      var m = D.querySelector('.menu');
      assert(m, 'the flyout did not open');
      var rows = Array.prototype.map.call(m.querySelectorAll('.mi'), function (row) { var s = row.querySelector('svg.ico'); return { label: row.textContent.trim(), icon: s && s.getAttribute('data-ic'), svg: s && s.outerHTML }; });
      UI.closeMenus();
      assert(rows.length === 2 && rows[0].icon === 'fillet' && rows[1].icon === 'chamfer', 'flyout rows: ' + rows.map(function (x) { return x.label + ' ' + x.icon; }).join(', '));
      var d = rfNEDiff(await rfNERaster(rows[0].svg, 16), await rfNERaster(rows[1].svg, 16));
      assert(d >= RFNE_MIN16, 'the flyout\'s Fillet and Chamfer rows differ in ' + d + ' px at 16');
      var face = fl.querySelector('.rb svg.ico');
      assert(face && /^(fillet|chamfer)$/.test(face.getAttribute('data-ic')), 'the flyout face shows ' + (face && face.getAttribute('data-ic')));
      var ch = rfNEBlue(await rfNERaster('chamfer', 32)), fi = rfNEBlue(await rfNERaster('fillet', 32));
      var oldCh = rfNEBlue(await rfNERaster(W.Icons.svg(RFNE_OLD.chamfer, 32), 32));
      assert(ch >= 160, 'the Chamfer bevel covers ' + ch + ' px at 32');
      assert(fi >= 160, 'the Fillet round covers ' + fi + ' px at 32');
      assert(oldCh < 160, 'the old Chamfer bevel (' + oldCh + ' px) would pass');
      return 'rows differ in ' + d + ' px at 16; blue: Chamfer ' + ch + ', Fillet ' + fi + ' (old Chamfer ' + oldCh + ')';
    } finally { await rfNEReset(); }
  });
