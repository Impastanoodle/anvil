  // --- rfNG (2026-11-16, lane uisense): the ribbon, menus, flyouts and tooltips make sense to a SolidWorks / Mastercam
  // user. Under both profiles, with a part, a sheet-metal part, an open sketch, an assembly and a drawing: every ribbon
  // button and flyout item has a tooltip line that is not its name again, no flyout lists a command twice, every menu
  // row has a status-bar help line (a greyed one says why), every key shown runs its command, every enabled button does
  // something; then one step per fix (drawing tooltips, Lofted-Bend, Mastercam frame keys and names, the menu help line,
  // the tree menu's F2 / Del, the face menu). The profile is reset to SolidWorks. ---
  (function () {
    var RFNG_PART = "p.sketch('Front').rect(0, 0, 60, 40).extrude(20)";
    var RFNG_SHEET = 'p.units("in");\np.sheet(0.0598, 0.0598, 0.44);\np.sketch("Top").rect(0, -2, 3, 2).end().baseFlange();\np.flange(1.5, [[3, 0.0598, 1]], { lengthRef: "outer" });\n';
    var RFNG_STATES = ['part', 'sheet', 'sketch', 'assembly', 'drawing'];
    function rfNGFlat(s) { return String(s || '').replace(/\s*\n\s*/g, ' ').trim(); }
    function rfNGSame(a, b) { return String(a).replace(/\W/g, '').toLowerCase() === String(b).replace(/\W/g, '').toLowerCase(); }
    async function rfNGLeave() {
      if (UI.hasPM && UI.hasPM()) { UI.pmCancel(); await idle(); }
      if (UI.closeModal) UI.closeModal();
      if (UI.closeMenus) UI.closeMenus();
      if (UI.drawingActive && UI.drawingActive()) { UI.closeDrawing(); await idle(); }
      if (UI.App.mode === 'sketch') { UI.exitSketch(); await idle(); }
    }
    // opens a document of the kind (part, sheet, sketch, assembly, drawing)
    async function rfNGState(name) {
      await rfNGLeave();
      if (name === 'assembly') { await anvil.newAssembly(); await idle(); return; }
      await anvil.newPart(); await idle();
      await anvil.run(name === 'sheet' ? RFNG_SHEET : RFNG_PART); await idle();
      if (name === 'sketch') {
        var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[0];
        UI.editSketch(sk.id); await idle(); await wait(30);
        assert(UI.App.mode === 'sketch', 'no sketch open');
      }
      if (name === 'drawing') { UI.makeDrawing({ fresh: true }); await wait(300); await idle(); assert(UI.drawingActive(), 'no drawing'); }
      if (modalOpen()) UI.closeModal();   // an AutoRecover offer or the like
    }
    // before a command or a key: a scene in which it has something to change (SolidWorks does nothing visible either for
    // Zoom to Fit on a fitted view, Shaded on a shaded one, Edit Appearance with its pane open): zoomed in, another
    // display style / background than the command's, the Task Pane and the Levels Manager closed
    async function rfNGPrep(cmd) {
      if (UI.closeTaskPane && !$('tp-panel').hidden) UI.closeTaskPane();
      if (UI.setFmTab && !(UI.frameDef && UI.frameDef())) UI.setFmTab(cmd === 'vFeatureTree' ? 'config' : 'tree');
      var lp = $('levels-panel'), tb = D.querySelector('#fm-tabs button[data-tab="tree"]');
      if (lp && !lp.hidden && tb) tb.click();
      if (UI.frameDef && UI.frameDef() && UI.frameManager) UI.frameManager(cmd === 'manager:planes' ? 'solids' : 'planes');
      if (UI.drawingActive && UI.drawingActive()) {
        var h = $('drawing-sheet'), r = h && h.getBoundingClientRect();
        if (h) h.dispatchEvent(new W.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -240, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
        for (var zw = 0; zw < 20 && !(UI.drawingInternal && UI.drawingInternal.D && UI.drawingInternal.D.vb); zw++) await wait(25); await wait(60);
        return;
      }
      if (/^ds/.test(cmd) && UI.setStyle) UI.setStyle(cmd === 'dsWireframe' ? 'shaded' : 'wireframe');
      if (/^vBg/.test(cmd) && UI.setBg) UI.setBg(cmd === 'vBgDark' ? 'plain' : 'dark');
      if (UI.zoomView) UI.zoomView(0.7);
    }
    function rfNGTabs() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return !t.classList.contains('off'); }); }
    async function rfNGTab(name) {
      var t = rfNGTabs().filter(function (x) { return x.textContent === name; })[0];
      assert(t, 'no tab ' + name);
      t.click(); await wait(20);
    }
    // every leaf of the tab shown now: [{ item, fly }]
    function rfNGLeaves() {
      var out = [];
      (function walk(list, fly) {
        (list || []).forEach(function (it) {
          if (!it || it.sep) return;
          if (it.stack) return walk(it.stack, null);
          if (it.grid) return walk(it.grid, null);
          if (it.fly && it.items) return walk(it.items, it);
          out.push({ item: it, fly: fly });
        });
      })(UI.ribbonShownItems() || [], null);
      return out;
    }
    async function rfNGEachTab(fn) {
      var profs = ['solidworks', 'mastercam'];
      for (var p = 0; p < profs.length; p++) {
        UI.Profiles.set(profs[p]); await idle();
        for (var s = 0; s < RFNG_STATES.length; s++) {
          await rfNGState(RFNG_STATES[s]);
          var tabs = rfNGTabs().map(function (t) { return t.textContent; });
          for (var t = 0; t < tabs.length; t++) { await rfNGTab(tabs[t]); await fn(profs[p], RFNG_STATES[s], tabs[t]); }
        }
      }
    }
    // (head, 2026-11-17) What these steps change in the view goes back when they end: a display style a button chose
    // is not a toggle (the group left Hidden Lines Visible behind) and a shortcut hides the origin. Every later group ran
    // in that style: rfNV's "hues on screen", rfNU's pick distances and rfNK's slots failed in each full run since
    // 2026-11-16 and passed alone. rfNGViewKeep() -> a function that puts UI.App.view back as it was.
    function rfNGViewKeep() {
      var v = UI.App.view, was = JSON.stringify(v);
      return function () {
        var o = JSON.parse(was);
        Object.keys(v).forEach(function (k) { if (!(k in o)) delete v[k]; });
        Object.keys(o).forEach(function (k) { if (JSON.stringify(v[k]) !== JSON.stringify(o[k])) v[k] = o[k]; });
        if (UI.applyDisplayStyle) UI.applyDisplayStyle();
        if (UI.updateOrigin) UI.updateOrigin();
        if (UI.refreshHud) UI.refreshHud();
      };
    }
    async function rfNGReset(prof) { await rfNGLeave(); UI.Profiles.set(prof || 'solidworks'); await anvil.newPart(); await idle(); if (UI.featureManagerHidden && UI.featureManagerHidden()) UI.setFeatureManagerHidden(false); var tt = D.querySelector('#fm-tabs button[data-tab="tree"]'); if (tt) tt.click(); else if (UI.setFmTab) UI.setFmTab('tree'); if (UI.closeTaskPane && !$('tp-panel').hidden) UI.closeTaskPane(); }

    step('rfNG: every ribbon button and flyout item has a tooltip line that is not its name again, and no flyout lists a command twice (SolidWorks and Mastercam; part, sheet metal, sketch, assembly, drawing)', async function () {
      var prof = UI.Profiles.active(), bad = [], n = 0;
      try {
        await rfNGEachTab(function (p, s, tab) {
          var seenFly = new Map();
          rfNGLeaves().forEach(function (x) {
            var st = UI.ribbonItemState(x.item), t = st.tip || {}, where = p + '/' + s + '/' + tab + ': ' + st.flat;
            n++;
            if (!t.desc) bad.push(where + ' has no line');
            else if (rfNGSame(t.desc, st.flat)) bad.push(where + ' line = name');
            if (st.disabled && !t.note) bad.push(where + ' greyed with no reason');
            if (x.fly) {
              var seen = seenFly.get(x.fly) || {}, cmd = UI.Commands.cmdOf(x.item);
              if (seen[cmd] || seen['L' + st.flat]) bad.push(where + ' twice in its flyout');
              seen[cmd] = 1; seen['L' + st.flat] = 1; seenFly.set(x.fly, seen);
            }
          });
        });
        assert(!bad.length, bad.length + ' of ' + n + ': ' + bad.slice(0, 12).join(' | '));
      } finally { await rfNGReset(prof); }
      return n + ' buttons and flyout items';
    });

    step('rfNG: every menu row has a status-bar help line (a greyed row says why) and no menu section lists a row twice (SolidWorks and Mastercam; part, sketch, assembly, drawing)', async function () {
      var prof = UI.Profiles.active(), bad = [], n = 0;
      try {
        var profs = ['solidworks', 'mastercam'], docs = ['part', 'sketch', 'assembly', 'drawing'];
        for (var p = 0; p < profs.length; p++) {
          UI.Profiles.set(profs[p]); await idle();
          for (var s = 0; s < docs.length; s++) {
            await rfNGState(docs[s]);
            UI.menuModel().forEach(function (menu) {
              (function walk(items, where) {
                var seen = {};
                (items || []).forEach(function (it) {
                  if (!it) return;
                  if (it.sep) { seen = {}; return; }
                  n++;
                  var h = UI.menuRowHelp(it), w = where + ' ▸ ' + it.label;
                  if (!h) bad.push(w + ': no help line');
                  else if (rfNGSame(h, it.label.split('▸').pop())) bad.push(w + ': help = name');
                  if (it.disabled && !UI.menuRowWhy(it)) bad.push(w + ': greyed with no reason');
                  if (seen[it.label]) bad.push(w + ': twice'); seen[it.label] = 1;
                  if (it.items) walk(it.items, w);
                });
              })(menu.items, profs[p] + '/' + docs[s] + '/' + menu.label);
            });
          }
        }
        assert(!bad.length, bad.length + ' of ' + n + ': ' + bad.slice(0, 12).join(' | '));
      } finally { await rfNGReset(prof); }
      return n + ' menu rows';
    });

    // what a user can see change: PropertyManager, dialog, menu, mode, tool, view settings, camera, panes and bars,
    // the model, the selection, the status line, a toast, a download, a file picker, the focused box, the drawing
    function rfNGSnap() {
      var c = UI.camera, App = UI.App;
      var cam = c ? c.position.toArray().concat(c.quaternion.toArray(), [c.zoom || 1, c.top || 0]).map(function (v) { return Math.round(v * 1000); }).join(',') : '';
      var dom = Array.prototype.map.call(D.querySelectorAll('body > *, #app > *, #main > *, #left > *, #right > *, #viewport > *, #taskpane > *, #tp-body > *, #ribbon-buttons .rb.active, #levels-panel, .tp-page'), function (e) {
        return e.id + '.' + (typeof e.className === 'string' ? e.className : '') + (e.hidden ? 'H' : '') + (e.style && e.style.display === 'none' ? 'N' : '');
      }).join('|');
      var dw = '';
      if (UI.drawingActive && UI.drawingActive() && UI.drawingInternal && UI.drawingInternal.D) { var DD = UI.drawingInternal.D; dw = (DD.tool || '') + '|' + JSON.stringify(DD.vb || null) + '|' + JSON.stringify(DD.doc ? { n: JSON.stringify(DD.doc).length } : {}) + '|' + JSON.stringify(DD.view || DD.cam || null); }
      var t = D.querySelector('.toast:not(.out)');
      return JSON.stringify({ pm: UI.hasPM() ? UI.pmTitle() : '', modal: modalOpen(), menu: UI.menuOpen(), mode: App.mode, tool: App.tool, view: App.view, cam: cam, dom: dom, theme: D.documentElement.getAttribute('data-theme'),
        model: App.model ? JSON.stringify(App.model).length : 0, sel: UI.selection ? UI.selection().length : 0, cmd: !!App.command, status: ($('status-msg') || {}).textContent, toast: t ? t.textContent : '',
        dl: (W.__downloads || []).length, pick: W.__rfNGPick || 0, focus: D.activeElement ? D.activeElement.id || D.activeElement.className : '', dw: dw, zoomArea: !!App.zoomAreaMode });
    }
    async function rfNGChanged(before, ms) {
      var t0 = performance.now();
      while (performance.now() - t0 < (ms || 700)) { if (rfNGSnap() !== before) return true; await wait(25); }
      return rfNGSnap() !== before;
    }
    function rfNGQuiet() { Array.prototype.forEach.call(D.querySelectorAll('.toast'), function (t) { t.remove(); }); UI.setStatus(''); }
    function rfNGStubs() {
      var ic = W.HTMLInputElement.prototype.click, cf = W.confirm, pr = W.prompt, al = W.alert;
      W.__rfNGPick = 0;
      W.HTMLInputElement.prototype.click = function () { if (this.type === 'file') { W.__rfNGPick++; return; } return ic.call(this); };
      W.confirm = function () { W.__rfNGPick++; return false; }; W.prompt = function () { W.__rfNGPick++; return null; }; W.alert = function () { W.__rfNGPick++; };
      return function () { W.HTMLInputElement.prototype.click = ic; W.confirm = cf; W.prompt = pr; W.alert = al; };
    }

    // one step per profile and document (a step has 30 s): every enabled button and flyout item, each command once per
    // profile and document kind, run as its button runs it; what it changed is put back (a PropertyManager cancelled, a
    // toggle run again, the document opened again when the model, the mode or the drawing changed)
    var rfNGDone = {};
    ['solidworks', 'mastercam'].forEach(function (prof) {
      RFNG_STATES.forEach(function (st) {
        step('rfNG: every enabled ribbon button and flyout item does something you can see (a PropertyManager, a dialog, a menu, a mode, a view, a pane, the status line or a message): ' + prof + ', ' + st, async function () {
          var prof0 = UI.Profiles.active(), bad = [], n = 0, unstub = rfNGStubs(), theme = UI.theme ? UI.theme() : 'light', bg = UI.App.view.bg, viewBack = rfNGViewKeep();
          var done = rfNGDone[prof] = rfNGDone[prof] || {};
          try {
            UI.Profiles.set(prof); await idle();
            await rfNGState(st);
            var view0 = JSON.stringify(UI.App.view);
            var tabs = rfNGTabs().map(function (t) { return t.textContent; });
            for (var t = 0; t < tabs.length; t++) {
              await rfNGTab(tabs[t]);
              var leaves = rfNGLeaves();
              for (var i = 0; i < leaves.length; i++) {
                var it = leaves[i].item, ist = UI.ribbonItemState(it), cmd = UI.Commands.cmdOf(it), key = cmd + '|' + (st === 'drawing' ? 'd' : st === 'assembly' ? 'a' : st === 'sketch' ? 's' : 'p');
                if (ist.disabled || done[key]) continue;
                done[key] = 1; n++;
                await rfNGPrep(cmd); ist = UI.ribbonItemState(it);
                rfNGQuiet(); await wait(5);
                var before = rfNGSnap();
                if (it.tool && !it.run) UI.setTool(ist.active ? 'select' : it.tool); else it.run();
                if (!(await rfNGChanged(before, 600))) bad.push(tabs[t] + ' ▸ ' + ist.flat);
                var a = JSON.parse(rfNGSnap()), b = JSON.parse(before), reload = a.mode !== b.mode || a.model !== b.model || a.dw !== b.dw;
                if (UI.menuOpen()) UI.closeMenus();
                if (UI.closeShortcutBar) UI.closeShortcutBar();
                if (modalOpen()) UI.closeModal();
                if (!reload && UI.hasPM()) { UI.pmCancel(); await idle(); }
                if (!reload && UI.App.mode === 'sketch' && UI.App.tool !== b.tool) UI.setTool(b.tool);
                if (UI.App.zoomAreaMode) { UI.App.zoomAreaMode = false; if (UI.refreshHud) UI.refreshHud(); }
                if (UI.theme && UI.theme() !== theme) UI.setTheme(theme);
                if (UI.App.view.bg !== bg && UI.setBg) UI.setBg(bg);
                if (!reload && (JSON.stringify(UI.App.view) !== view0 || JSON.parse(rfNGSnap()).dom !== b.dom) && it.run && !a.pm) { it.run(); await wait(20); if (UI.menuOpen()) UI.closeMenus(); }
                if (reload || UI.hasPM() || JSON.stringify(UI.App.view) !== view0 || UI.App.mode !== b.mode) { await rfNGState(st); view0 = JSON.stringify(UI.App.view); }
                await rfNGTab(tabs[t]);
              }
            }
            assert(!bad.length, bad.length + ' of ' + n + ' did nothing: ' + bad.join(' | '));
          } finally { unstub(); if (UI.theme && UI.theme() !== theme) UI.setTheme(theme); await rfNGReset(prof0); viewBack(); }
          return n + ' commands';
        });
      });
    });

    // a key as the tooltips and menus write it ('Ctrl+1', 'Shift+Ctrl+Z', 'Del', 'F5', 'Alt+Z') pressed on the page
    function rfNGPress(combo) {
      var parts = combo.split('+'), k = parts.pop(), mods = parts.map(function (m) { return m.trim().toLowerCase(); });
      var key = k === 'Del' ? 'Delete' : k === 'Esc' ? 'Escape' : k === 'Space' ? ' ' : k.length === 1 ? (mods.indexOf('shift') >= 0 ? k.toUpperCase() : k.toLowerCase()) : k;
      var init = { key: key, code: k.length === 1 && /[A-Z]/i.test(k) ? 'Key' + k.toUpperCase() : k.length === 1 ? 'Digit' + k : key, ctrlKey: mods.indexOf('ctrl') >= 0, shiftKey: mods.indexOf('shift') >= 0, altKey: mods.indexOf('alt') >= 0, bubbles: true, cancelable: true };
      var target = D.activeElement && D.activeElement !== D.body && !/^(INPUT|TEXTAREA|SELECT)$/.test(D.activeElement.tagName) ? D.activeElement : D.body;
      target.dispatchEvent(new W.KeyboardEvent('keydown', init));
      target.dispatchEvent(new W.KeyboardEvent('keyup', init));
    }
    function rfNGIsKey(text) { return !!text && (UI.keys.canon(text) || /^[A-Z], [A-Z]$/.test(text)); }

    ['solidworks', 'mastercam'].forEach(function (prof) {
      ['part', 'sketch', 'assembly', 'drawing'].forEach(function (doc) {
        step('rfNG: every keyboard shortcut a ribbon tooltip or a menu row shows runs that command: ' + prof + ', ' + doc, async function () {
          var prof0 = UI.Profiles.active(), bad = [], n = 0, unstub = rfNGStubs(), viewBack = rfNGViewKeep();
          try {
            UI.Profiles.set(prof); await idle();
            await rfNGState(doc);
            var seen = {}, keys = [];
            var tabs = rfNGTabs().map(function (t) { return t.textContent; });
            for (var t = 0; t < tabs.length; t++) {
              await rfNGTab(tabs[t]);
              rfNGLeaves().forEach(function (x) { var st = UI.ribbonItemState(x.item); if (!st.disabled && rfNGIsKey(st.tip.key) && !seen[st.tip.key]) { seen[st.tip.key] = 1; keys.push({ key: st.tip.key, what: tabs[t] + ' ▸ ' + st.flat, cmd: UI.Commands.cmdOf(x.item) }); } });
            }
            UI.menuModel().forEach(function (m) {
              (function walk(items) { (items || []).forEach(function (it) { if (!it || it.sep) return; if (it.items) walk(it.items); var k = it.key && UI.menuKeyText ? UI.menuKeyText(it.key) : it.key; if (!it.disabled && rfNGIsKey(k) && !seen[k]) { seen[k] = 1; keys.push({ key: k, what: m.label + ' ▸ ' + it.label }); } }); })(m.items);
            });
            for (var i = 0; i < keys.length; i++) {
              var kk = keys[i], combo = kk.key, seq = /^([A-Z]), \1$/.exec(combo);
              n++;
              // the scene the key needs to change something: another view, zoomed in, a face selected for Normal To / Esc
              if (!(UI.drawingActive && UI.drawingActive())) {
                UI.setView(/Isometric/.test(kk.what) ? 'Front' : 'Top'); UI.setView(/Isometric/.test(kk.what) ? 'Top' : 'Isometric');
                if (UI.zoomView) UI.zoomView(0.6);
                if (UI.viewAnimating) for (var g = 0; g < 40 && UI.viewAnimating(); g++) await wait(25);
                if (doc === 'part' && /Normal To|Clear selection|Esc/.test(kk.what + combo) && UI.App.mesh) { UI.setSelection([{ kind: 'face', index: 0 }]); UI.updateHighlights(); }
              }
              await rfNGPrep(kk.cmd || '');
              rfNGQuiet(); await wait(5);
              var before = rfNGSnap();
              if (seq) { rfNGPress(seq[1]); await wait(30); rfNGPress(seq[1]); } else rfNGPress(combo);
              if (!(await rfNGChanged(before, 700))) bad.push(combo + ' (' + kk.what + ')');
              if (doc === 'sketch' && combo === 'A, A' && UI.App.mode === 'sketch' && UI.App.tool !== 'arc3') bad.push('A, A did not give the 3 Point Arc (' + UI.App.tool + ')');
              if (UI.menuOpen()) UI.closeMenus();
              if (UI.closeShortcutBar) UI.closeShortcutBar();
              await rfNGState(doc);
            }
            assert(n >= 3, 'only ' + n + ' keys found');
            assert(!bad.length, bad.length + ' of ' + n + ' keys did nothing: ' + bad.join(' | '));
          } finally { unstub(); await rfNGReset(prof0); viewBack(); }
          return n + ' keys';
        });
      });
    });

    async function rfNGHoverTip(btn) {
      btn.dispatchEvent(new W.MouseEvent('mouseover', { bubbles: true }));
      for (var i = 0; i < 40; i++) { var t = D.querySelector('.tip'); if (t && !t.hidden && t.textContent) break; await wait(25); }
      var tip = D.querySelector('.tip');
      var out = tip && !tip.hidden ? { name: (tip.querySelector('.tip-head b') || {}).textContent || '', key: (tip.querySelector('.tip-key') || {}).textContent || '', desc: (tip.querySelector('.tip-desc') || {}).textContent || '' } : null;
      btn.dispatchEvent(new W.MouseEvent('mouseout', { bubbles: true }));
      D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
      return out;
    }
    function rfNGBtn(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') === label && b.offsetWidth; })[0] || null; }

    step('rfNG: the drawing commands that showed only their name have a line (Auxiliary View, Note, Hole Table …), and the drawing Sketch tab\'s Centerline says it draws a sketch centerline, not the Annotation tab\'s centerline between two edges', async function () {
      var prof = UI.Profiles.active();
      try {
        UI.Profiles.set('solidworks'); await rfNGState('drawing');
        await rfNGTab('View Layout');
        var aux = rfNGBtn('Auxiliary View'); assert(aux, 'no Auxiliary View button');
        var tip = await rfNGHoverTip(aux);
        assert(tip && /square to a slanted edge/.test(tip.desc), 'Auxiliary View tooltip: ' + JSON.stringify(tip));
        await rfNGTab('Annotation');
        var cl = rfNGLeaves().filter(function (x) { return x.item.id === 'centerline'; })[0];
        assert(cl && /between two edges/.test(UI.ribbonItemState(cl.item).tip.desc), 'Annotation Centerline: ' + (cl && UI.ribbonItemState(cl.item).tip.desc));
        ['Note', 'Hole Table', 'Weld Symbol', 'Bend Table', 'Punch Table'].forEach(function (nm) {
          var x = rfNGLeaves().filter(function (y) { return UI.ribbonItemState(y.item).flat === nm; })[0];
          assert(x && UI.ribbonItemState(x.item).tip.desc.length > 10, nm + ': ' + (x && UI.ribbonItemState(x.item).tip.desc));
        });
        await rfNGTab('Sketch');
        var sk = rfNGLeaves().filter(function (x) { return UI.ribbonItemState(x.item).flat === 'Centerline'; })[0];
        assert(sk && /construction centerline on the sheet/.test(UI.ribbonItemState(sk.item).tip.desc), 'Sketch Centerline: ' + (sk && UI.ribbonItemState(sk.item).tip.desc));
      } finally { await rfNGReset(prof); }
    });

    step('rfNG: Lofted-Bend is named as SolidWorks names it (one word, "Lofted-Bend", not "Lofted- Bend" in its tooltip), and Mastercam\'s Hide/Unhide likewise', async function () {
      var prof = UI.Profiles.active();
      try {
        UI.Profiles.set('solidworks'); await rfNGState('sheet');
        await rfNGTab('Sheet Metal');
        var lb = rfNGBtn('Lofted-Bend'); assert(lb, 'no button named Lofted-Bend');
        var tip = await rfNGHoverTip(lb);
        assert(tip && tip.name === 'Lofted-Bend', 'tooltip name: ' + JSON.stringify(tip));
        UI.Profiles.set('mastercam'); await idle(); await rfNGTab('Home');
        assert(rfNGBtn('Hide/Unhide'), 'no Hide/Unhide on Mastercam Home');
      } finally { await rfNGReset(prof); }
    });

    step('rfNG: Mastercam\'s frame buttons show the key of what they run: the Edit and Insert menu buttons no longer say Ctrl+Z and E, Level: no longer Alt+Z; the Levels manager says Alt+Z and Alt+Z shows it; Delete Entities says Del while something is selected (none when Del would do nothing)', async function () {
      var prof = UI.Profiles.active();
      try {
        UI.Profiles.set('mastercam'); await rfNGState('part');
        await rfNGTab('More');
        var keyOf = function (label) { var x = rfNGLeaves().filter(function (y) { return UI.ribbonItemState(y.item).flat === label; })[0]; assert(x, 'no ' + label); return UI.ribbonItemState(x.item).tip.key; };
        assert(keyOf('Edit') === '' && keyOf('Insert') === '', 'menu buttons: Edit ' + keyOf('Edit') + ', Insert ' + keyOf('Insert'));
        await rfNGTab('Home');
        var lvl = rfNGLeaves().filter(function (y) { return UI.Commands.cmdOf(y.item) === 'action:level'; })[0];
        assert(lvl && !UI.ribbonItemState(lvl.item).tip.key, 'Level: shows ' + (lvl && UI.ribbonItemState(lvl.item).tip.key));
        assert(keyOf('Delete Entities') === '', 'Delete Entities with nothing to delete shows ' + keyOf('Delete Entities'));
        await rfNGState('sketch'); await rfNGTab('Home');
        UI.setSelection([{ kind: 'entity', index: 0 }]); await wait(20);
        assert(keyOf('Delete Entities') === 'Del', 'Delete Entities with an entity selected: ' + keyOf('Delete Entities'));
        UI.setSelection([]); await rfNGState('part');
        await rfNGTab('View');
        var mg = rfNGLeaves().filter(function (y) { return UI.Commands.cmdOf(y.item) === 'manager:levels'; })[0];
        assert(mg && UI.ribbonItemState(mg.item).tip.key === 'Alt+Z', 'Levels manager key: ' + (mg && UI.ribbonItemState(mg.item).tip.key));
        assert(UI.ribbonItemState(mg.item).tip.desc, 'Levels manager has no line');
        if (UI.frameManager) {
          UI.frameShowManager ? UI.frameShowManager('solids') : null;
          rfNGPress('Alt+Z'); await wait(60);
          assert(UI.frameManager() === 'levels' || !$('levels-panel').hidden, 'Alt+Z did not show the Levels manager (' + UI.frameManager() + ')');
        }
      } finally { await rfNGReset(prof); }
    });

    step('rfNG: Mastercam has no two buttons of one name doing different things: Wireframe ▸ Curve All Edges (Convert Entities) beside Transform ▸ Project, View ▸ Show Planes beside the Planes manager', async function () {
      var prof = UI.Profiles.active();
      try {
        UI.Profiles.set('mastercam'); await rfNGState('part');
        var byName = {}, bad = [];
        var tabs = rfNGTabs().map(function (t) { return t.textContent; });
        for (var t = 0; t < tabs.length; t++) {
          await rfNGTab(tabs[t]);
          rfNGLeaves().forEach(function (x) { var f = UI.ribbonItemState(x.item).flat, c = UI.Commands.cmdOf(x.item); (byName[f] = byName[f] || {})[c] = tabs[t]; });
        }
        ['Project', 'Planes', 'Curve All Edges', 'Show Planes'].forEach(function (nm) { if (byName[nm] && Object.keys(byName[nm]).length > 1) bad.push(nm + ': ' + JSON.stringify(byName[nm])); });
        assert(!bad.length, bad.join(' | '));
        assert(byName['Curve All Edges'] && byName['Curve All Edges'].convert === 'Wireframe', 'Curve All Edges: ' + JSON.stringify(byName['Curve All Edges']));
        assert(byName['Project'] && byName['Project'].tProject === 'Transform', 'Project: ' + JSON.stringify(byName['Project']));
        assert(byName['Show Planes'] && byName['Show Planes'].vPlanes, 'Show Planes: ' + JSON.stringify(byName['Show Planes']));
      } finally { await rfNGReset(prof); }
    });

    step('rfNG: a menu row writes its help line in the status bar as SolidWorks does (a greyed row says why), and the status line comes back when the menu closes', async function () {
      var prof = UI.Profiles.active();
      try {
        UI.Profiles.set('solidworks'); await rfNGState('part');
        UI.setStatus('rfNG before');
        var li = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (x) { return /^File/.test(x.textContent); })[0];
        assert(li, 'no File menu');
        li.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, button: 0 })); li.click(); await wait(30);
        var rows = function () { var ms = D.querySelectorAll('body > .menu'), m = ms[ms.length - 1]; return m ? Array.prototype.slice.call(m.querySelectorAll('.mi')) : []; };
        if (!rows().length) { li.click(); await wait(30); }
        var nw = rows().filter(function (r) { return /^New ▸ Part/.test(r.textContent.replace(/^\s*✓?/, '')); })[0] || rows().filter(function (r) { return /New ▸ Part/.test(r.textContent); })[0];
        assert(nw, 'no New ▸ Part row: ' + rows().map(function (r) { return r.textContent; }).join(' | '));
        nw.dispatchEvent(new W.MouseEvent('mouseenter'));
        assert($('status-msg').textContent === 'A new, empty part', 'status: ' + $('status-msg').textContent);
        UI.closeMenus();
        assert($('status-msg').textContent === 'rfNG before', 'status not restored: ' + $('status-msg').textContent);
        var tl = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (x) { return /^Tools/.test(x.textContent); })[0];
        tl.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, button: 0 })); tl.click(); await wait(30);
        if (!rows().length) { tl.click(); await wait(30); }
        var tr = rows().filter(function (r) { return /Sketch Tools ▸ Trim Entities/.test(r.textContent); })[0];
        assert(tr && tr.classList.contains('disabled'), 'Trim Entities row greyed in a part');
        tr.dispatchEvent(new W.MouseEvent('mouseenter'));
        assert(/Trim or extend/.test($('status-msg').textContent) && /Open a sketch first/.test($('status-msg').textContent), 'greyed row: ' + $('status-msg').textContent);
        UI.closeMenus();
      } finally { await rfNGReset(prof); }
    });

    step('rfNG: the FeatureManager right-click menu shows F2 and Del in the key column (Rename tree item, Delete), and both keys work on the selected feature', async function () {
      var prof = UI.Profiles.active();
      try {
        UI.Profiles.set('solidworks'); await rfNGState('part');
        // F2 renames a row you can see: the FeatureManager shown, on its tree, no filter typed (earlier groups change these)
        if (UI.featureManagerHidden && UI.featureManagerHidden()) UI.setFeatureManagerHidden(false);
        var tt = D.querySelector('#fm-tabs button[data-tab="tree"]'); if (tt) tt.click(); else if (UI.setFmTab) UI.setFmTab('tree');   // the tab itself: setFmTab('tree') goes back to a Levels Manager in use
        if ($('tree-filter-input') && $('tree-filter-input').value) { $('tree-filter-input').value = ''; $('tree-filter-input').dispatchEvent(new W.Event('input', { bubbles: true })); }
        UI.refreshTree(); await wait(20);
        var f = UI.App.model.features.filter(function (x) { return x.type !== 'sketch'; })[0];
        var row = D.querySelector('#tree .ti[data-fid="' + f.id + '"]');
        assert(row, 'no tree row');
        var r = row.getBoundingClientRect();
        row.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + 20, clientY: r.top + 5 }));
        var ms = D.querySelectorAll('body > .menu'), m = ms[ms.length - 1];
        var rows = m ? Array.prototype.slice.call(m.querySelectorAll('.mi')) : [];
        var rn = rows.filter(function (x) { return /Rename tree item/.test(x.textContent); })[0], dl = rows.filter(function (x) { return /^\s*Delete/.test(x.querySelector('span:not(.chk):not(.mi-ico)').textContent); })[0];
        assert(rn && rn.querySelector('.key') && rn.querySelector('.key').textContent === 'F2', 'Rename row: ' + (rn && rn.textContent));
        assert(dl && dl.querySelector('.key') && dl.querySelector('.key').textContent === 'Del', 'Delete row: ' + (dl && dl.textContent));
        UI.closeMenus();
        UI.App.sel = { kind: 'feature', id: f.id }; UI.refreshTree(); await wait(20);
        rfNGPress('F2'); await wait(40);
        assert(D.querySelector('#tree input.ti-rename'), 'F2 did not start the rename (modal ' + modalOpen() + ', sel ' + JSON.stringify(UI.App.sel) + ', focus ' + (D.activeElement && D.activeElement.tagName + '#' + D.activeElement.id + '.' + D.activeElement.className) + ', row ' + (D.querySelector('#tree .ti[data-fid="' + f.id + '"]') || { getClientRects: function () { return []; } }).getClientRects().length + ', action ' + UI.keys.actionFor(new W.KeyboardEvent('keydown', { key: 'F2' })) + ', fm hidden ' + (UI.featureManagerHidden && UI.featureManagerHidden()) + ', left ' + ($('left') ? $('left').getBoundingClientRect().width + ' ' + $('left').className : '?') + ', tree ' + ($('tree') ? $('tree').getClientRects().length : '?') + ')');
        var inp = D.querySelector('#tree input.ti-rename');
        inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(20);
        UI.App.sel = { kind: 'feature', id: f.id }; UI.refreshTree(); await wait(20);
        var n0 = UI.App.model.features.length, before = rfNGSnap();
        rfNGPress('Del'); await wait(60);
        assert(UI.App.model.features.length < n0 || modalOpen(), 'Del did nothing to the selected feature');
        if (modalOpen()) UI.closeModal();
      } finally { await rfNGReset(prof); }
    });

    step('rfNG: a right-click on a face selects it and offers Edit Feature, Edit Sketch, Sketch, Normal To, Measure, Appearance as SolidWorks does (Select Other stays first); Edit Feature opens the feature that made the face', async function () {
      var prof = UI.Profiles.active();
      try {
        UI.Profiles.set('solidworks'); await rfNGState('part');
        UI.setView('Front'); if (UI.viewAnimating) for (var g = 0; g < 40 && UI.viewAnimating(); g++) await wait(25);
        var c = UI.worldToScreen([30, 20, 20]), vr = $('viewport').getBoundingClientRect();
        var ev = { bubbles: true, cancelable: true, button: 2, clientX: vr.left + c[0], clientY: vr.top + c[1] };
        $('viewport').dispatchEvent(new W.MouseEvent('mousedown', Object.assign({ buttons: 2 }, ev)));
        W.dispatchEvent(new W.MouseEvent('mouseup', Object.assign({ buttons: 0 }, ev)));
        $('viewport').dispatchEvent(new W.MouseEvent('contextmenu', ev));
        var ms = D.querySelectorAll('body > .menu'), m = ms[ms.length - 1];
        var labels = m ? Array.prototype.map.call(m.querySelectorAll('.mi'), function (x) { return x.querySelector('span:not(.chk):not(.mi-ico)').textContent; }) : [];
        ['Select Other', 'Edit Feature', 'Edit Sketch', 'Sketch', 'Normal To', 'Measure', 'Appearance'].forEach(function (l) { assert(labels.indexOf(l) >= 0, 'no ' + l + ' in ' + labels.join(' | ')); });
        assert(labels[0] === 'Select Other', 'Select Other first: ' + labels.join(' | '));
        var sel = UI.selection();
        assert(sel.length === 1 && sel[0].kind === 'face', 'the face is selected: ' + JSON.stringify(sel));
        var ef = Array.prototype.filter.call(m.querySelectorAll('.mi'), function (x) { return /Edit Feature/.test(x.textContent); })[0];
        ef.click(); await idle(); await wait(50);
        assert(UI.hasPM() && /Extrude/.test(UI.pmTitle()), 'Edit Feature opened: ' + (UI.hasPM() && UI.pmTitle()));
        UI.pmCancel(); await idle();
      } finally { await rfNGReset(prof); }
    });

    step('rfNG: the Shortcut Bar (S) holds the same commands under Mastercam as under SolidWorks (it looked for SolidWorks tab and button names and found almost nothing)', async function () {
      var prof = UI.Profiles.active(), out = {};
      try {
        var docs = ['part', 'sketch', 'assembly', 'drawing'];
        for (var p = 0; p < 2; p++) {
          UI.Profiles.set(p ? 'mastercam' : 'solidworks');
          for (var s = 0; s < docs.length; s++) { await rfNGState(docs[s]); out[docs[s] + p] = UI.shortcutBar.labels(UI.shortcutBar.context()).length; }
        }
        docs.forEach(function (d) { assert(out[d + 1] === out[d + 0] && out[d + 0] > 3, d + ': SolidWorks ' + out[d + 0] + ', Mastercam ' + out[d + 1]); });
      } finally { await rfNGReset(prof); }
      return JSON.stringify(out);
    });

    step('rfNG: L, R, C, A, P, T and D in a part do what their ribbon buttons do (the tooltips show them; with no sketch open the keys did nothing)', async function () {
      var prof = UI.Profiles.active(), bad = [];
      try {
        UI.Profiles.set('solidworks');
        var pairs = [['L', 'line'], ['R', 'rect'], ['C', 'circle'], ['A', 'arc'], ['P', 'polygon'], ['T', 'slot'], ['D', 'dim']];
        for (var i = 0; i < pairs.length; i++) {
          await rfNGState('part');
          var it = UI.ribbonLeaves(UI.RIBBON.Sketch).filter(function (x) { return x.id === pairs[i][1]; })[0];
          assert(it, 'no ribbon ' + pairs[i][1]);
          var before = rfNGSnap();
          rfNGPress(pairs[i][0]); await wait(80); await idle();
          var byKey = JSON.parse(rfNGSnap());
          if (rfNGSnap() === before) { bad.push(pairs[i][0] + ' did nothing'); continue; }
          await rfNGState('part');
          UI.setTool(it.tool); await wait(80); await idle();
          var byBtn = JSON.parse(rfNGSnap());
          if (byKey.pm !== byBtn.pm || byKey.mode !== byBtn.mode || byKey.tool !== byBtn.tool) bad.push(pairs[i][0] + ': key ' + JSON.stringify([byKey.pm, byKey.mode, byKey.tool]) + ' vs button ' + JSON.stringify([byBtn.pm, byBtn.mode, byBtn.tool]));
        }
        assert(!bad.length, bad.join(' | '));
      } finally { await rfNGReset(prof); }
    });

    step('rfNG: commands that shared another\'s picture take their own when the icon set in use draws it (Swept / Lofted Cut, the three backgrounds, Mastercam\'s Level:, Offset On Surface, the Quick Snaps), else the shared one', async function () {
      var prof = UI.Profiles.active(), bad = [], n = 0;
      try {
        var want = { sweptCut: 'sweep', loftedCut: 'loft', vBgGradient: 'vBackground', vBgPlain: 'vBackground', vBgDark: 'vBackground', 'action:level': 'levels', offsetSurface: 'offset', 'qs-point': 'quickSnaps', 'qs-grid': 'quickSnaps' };
        var own = { 'action:level': 'levelMain', 'qs-point': 'qsPoint', 'qs-grid': 'qsGrid' };
        var profs = ['solidworks', 'mastercam'];
        for (var p = 0; p < profs.length; p++) {
          UI.Profiles.set(profs[p]); await rfNGState('part');
          var setId = W.Icons.sets && W.Icons.sets.active(), set = setId ? W.Icons.sets.get(setId) : null;
          var tabs = rfNGTabs().map(function (t) { return t.textContent; });
          for (var t = 0; t < tabs.length; t++) {
            await rfNGTab(tabs[t]);
            rfNGLeaves().forEach(function (x) {
              var c = UI.Commands.cmdOf(x.item);
              if (!want[c]) return;
              n++;
              var name = own[c] || c, ic = UI.ribbonItemState(x.item).icon, exp = set && set.has && set.has(name) ? name : want[c];
              if (ic !== exp) bad.push(profs[p] + ' ' + c + ': ' + ic + ' (want ' + exp + ')');
            });
          }
        }
        assert(n >= 8, 'only ' + n + ' found');
        assert(!bad.length, bad.join(' | '));
      } finally { await rfNGReset(prof); }
      return n + ' checked';
    });

    step('rfNG: Mass Properties of an inch part gives pounds and lb/in³ as SolidWorks does (it gave grams and kg/m³); a millimetre part keeps grams', async function () {
      var prof = UI.Profiles.active();
      try {
        UI.Profiles.set('solidworks');
        await rfNGLeave(); await anvil.newPart(); await idle();
        await anvil.run('p.units("in");\np.material("Plain Carbon Steel");\np.sketch("Front").rect(0, 0, 2, 3).extrude(1);'); await idle();
        assert(UI.App.model.units === 'in', 'not an inch part');
        var kg = anvil.mass().massKg;
        await UI.showMassProperties(); await wait(30);
        var txt = $('modal-body').textContent;
        assert(/lb\/in³/.test(txt) && !/kg\/m³/.test(txt), 'density: ' + txt.slice(0, 200));
        var lb = (kg * 2.20462262185).toFixed(4);
        assert(txt.indexOf('Mass' + lb + ' lb') >= 0 || txt.indexOf(lb + ' lb') >= 0, 'mass ' + lb + ' lb: ' + txt.slice(0, 200));
        UI.closeModal();
        await anvil.newPart(); await idle();
        await anvil.run('p.units("mm");\np.sketch("Front").rect(0, 0, 20, 30).extrude(10);'); await idle();
        await UI.showMassProperties(); await wait(30);
        assert(/ g /.test($('modal-body').textContent + ' ') && /kg\/m³/.test($('modal-body').textContent), 'mm part: ' + $('modal-body').textContent.slice(0, 200));
        UI.closeModal();
        return lb + ' lb';
      } finally { await rfNGReset(prof); }
    });

    step('rfNG: Tools ▸ Options… opens a System Options dialog as SolidWorks does (it opened the Task Pane); its settings work in it and OK closes it', async function () {
      var prof = UI.Profiles.active();
      try {
        UI.Profiles.set('solidworks'); await rfNGState('part');
        if (!$('tp-panel').hidden) UI.closeTaskPane();
        var tools = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (li) { return /^Tools/.test(li.textContent.trim()); })[0];
        tools.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
        var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /^\s*Options…/.test(m.textContent) && m.textContent.indexOf('▸') < 0; })[0];
        assert(row, 'no Tools > Options… row');
        row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
        await wait(40);
        assert(modalOpen() && /System Options/.test($('modal-title').textContent), 'no System Options dialog: ' + $('modal-title').textContent);
        assert($('tp-panel').hidden, 'the Task Pane opened too');
        var sec = $('modal-body').querySelector('[data-role="interface-profiles"]');
        assert(sec, 'no Interface group in the dialog');
        var units = Array.prototype.filter.call($('modal-body').querySelectorAll('select'), function (s) { return Array.prototype.some.call(s.options, function (o) { return o.value === 'mm'; }); })[0];
        assert(units, 'no Units box');
        var was = UI.App.model.units;
        units.value = was === 'in' ? 'mm' : 'in'; units.dispatchEvent(new W.Event('change', { bubbles: true })); await idle();
        assert(UI.App.model.units === units.value, 'Units in the dialog did nothing');
        clickModalButton('OK');
        assert(!modalOpen(), 'OK did not close it');
      } finally { if (modalOpen()) UI.closeModal(); await rfNGReset(prof); }
    });
  })();
  // --- end rfNG ---
