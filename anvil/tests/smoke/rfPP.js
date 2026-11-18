  // --- rfPP (2026-11-18, lane shopflow6, test-reports/2026-11-18-shop-flow-6.md) --- the shop audit, round 6: five more
  // whole jobs on INCH parts driven like a user (ribbon / menus / PropertyManagers / Design Library / ConfigurationManager,
  // clicks in the viewport and on the drawing sheet): (1) a 14 ga chassis with Hole Wizard holes, a PEM hole from the
  // Design Library and a louver, its drawing with a Hole Table and dual dimensions, the flat DXF with FORM lines; (2) an
  // L bracket family by Design Table, each configuration's flat DXF and PDF; (3) a bracket whose Edge-Flanges and Hem are
  // mirrored and patterned, edited at the source; (4) a box of four parts in an assembly, Interference Detection, the BOM
  // edited by double-click; (5) a STEP sheet-metal part read back, Insert Bends, flat and DXF. Self-contained; every
  // setting changed is put back. `?only=rfPP&rfppdump` makes every step fail with its full notes.
  (function () {
    var T14 = 0.0747, R14 = 0.09, K44 = 0.44;
    var rfPPjob = {};
    function rfPPBD(R, T, K) { return 2 * (R + T) - Math.PI / 2 * (R + K * T); }
    function rfPPScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
    function rfPPEv(type, p, mods) {
      var r = $('viewport').getBoundingClientRect(), inside = p[0] >= 0 && p[1] >= 0 && p[0] <= r.width && p[1] <= r.height;
      (inside || type === 'mousedown' || type === 'click' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: W, button: 0, detail: type === 'mousemove' ? 0 : 1, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
    }
    async function rfPPClickAt(p, mods) { rfPPEv('mousemove', [p[0] + 3, p[1] + 2], Object.assign({ buttons: 0 }, mods || {})); await wait(15); rfPPEv('mousemove', p, Object.assign({ buttons: 0 }, mods || {})); await wait(15); rfPPEv('mousedown', p, mods); rfPPEv('mouseup', p, mods); rfPPEv('click', p, mods); await wait(25); }
    async function rfPPSk(uv, mods) { await rfPPClickAt(rfPPScr(uv), mods); }
    function rfPPKey(k, mods) { var ev = new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {})); D.dispatchEvent(ev); return ev; }
    function rfPPRibbon(tab, re) {
      UI.setRibbonTab(tab);
      return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim()); })[0];
    }
    async function rfPPFly(tab, caretRe, itemRe) {
      UI.setRibbonTab(tab); await wait(20);
      var caret = Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return caretRe.test(b.getAttribute('aria-label') || ''); })[0] || Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return / options$/.test(b.getAttribute('aria-label') || '') && caretRe.test(b.getAttribute('aria-label') || ''); })[0];
      assert(caret && !caret.disabled, 'the flyout ' + caretRe + ': ' + Array.prototype.map.call(D.querySelectorAll('#ribbon button'), function (b) { return (b.getAttribute('aria-label') || '') + (b.disabled ? '(off)' : ''); }).join(',').slice(0, 300));
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var mi = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return itemRe.test(m.textContent); })[0];
      assert(mi, itemRe + ' in the flyout: ' + Array.prototype.map.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent; }).join(' | '));
      mi.click(); await idle(); await wait(30);
    }
    function rfPPMenuRows(name) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      return Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
    }
    function rfPPMenu(name, label) {
      var rows = rfPPMenuRows(name);
      var hit = rows.filter(function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name + ': ' + rows.map(function (r) { return r.textContent.replace(/\s+/g, ' '); }).join(' | ').slice(0, 900));
      hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    async function rfPPSaved(fn) {
      var got = [], sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: text }); };
      UI.download = function (name, data) { got.push(typeof data === 'string' ? { name: name, text: data } : { name: name, bytes: data }); };
      try { await fn(); await idle(); await wait(30); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    function rfPPCheck() {
      if (window.DxfCheck) return Promise.resolve(window.DxfCheck);
      return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '../headless/dxf-check.js'; s.onload = function () { res(window.DxfCheck); }; s.onerror = function () { rej(new Error('dxf-check.js did not load')); }; document.head.appendChild(s); });
    }
    function rfPPErrs() { return anvil.summary().errors || {}; }
    function rfPPLast() { var fs = UI.App.model.features; return fs[fs.length - 1]; }
    function rfPPByName(n) { return UI.App.model.features.filter(function (f) { return f.name === n; })[0]; }
    async function rfPPNewInch() {
      var du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      assert(UI.unitLabel() === 'in', 'an inch part');
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    }
    function rfPPPmOpen(title) { assert(UI.hasPM() && UI.pmTitle() === title, title + ' PM: ' + (UI.hasPM() && UI.pmTitle())); }
    function rfPPSet(key, val) {
      var el = D.querySelector('#pm [data-key="' + key + '"]');
      assert(el, 'PM field ' + key + ': ' + Array.prototype.map.call(D.querySelectorAll('#pm [data-key]'), function (x) { return x.getAttribute('data-key'); }).join(','));
      if (el.type === 'checkbox') { if (!!el.checked !== !!val) el.click(); } else setInput(el, val);
    }
    function rfPPF(x) { return (+x).toFixed(4); }
    function rfPPDone(notes) { if (/rfppdump/.test(location.search)) assert(false, 'DUMP ' + notes.join('; ')); return notes.join('; '); }
    function rfPPVol() { return K.massProps(UI.App.mesh, 1).volume; }
    async function rfPPView(name) { UI.setView(name); if (UI.zoomToFit) UI.zoomToFit(); for (var i = 0; i < 40 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(25); await idle(); await wait(30); }
    function rfPPFrame(w, h, ox, oy) {
      var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
      UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(UI.size.w / w, UI.size.h / h));
      var o = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0));
      UI.panView(UI.size.w * ox - o[0], UI.size.h * oy - o[1]);
      UI.updateSketches();
    }
    // the sketch view: w x h across the viewport, centred on the sketch point c
    function rfPPFrameAt(c, w, h) {
      var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
      UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(UI.size.w / w, UI.size.h / h));
      var o = UI.worldToScreen(K.to3D(UI.activePlane(), c[0], c[1]));
      UI.panView(UI.size.w / 2 - o[0], UI.size.h / 2 - o[1]);
      UI.updateSketches();
    }
    async function rfPPDim(picks, place, value) {
      UI.setTool('dimension'); await wait(20);
      var dwell = UI.dimMidDwell(); UI.dimMidDwell(1e9);
      try {
        for (var k = 0; k < picks.length; k++) await rfPPSk(picks[k]);
        await rfPPSk(place); await wait(50);
      } finally { UI.dimMidDwell(dwell); }
      var inp = D.querySelector('#dim-edit input');
      assert(inp && !$('dim-edit').hidden, 'Modify box open after dimensioning ' + JSON.stringify(picks) + ' (' + statusText() + ')');
      var shown = inp.value;
      if (value != null) { setInput(inp, value); pressEnter(inp); await wait(60); }
      if (!$('dim-edit').hidden) { rfPPKey('Escape'); await wait(20); }
      return shown;
    }
    function rfPPEnts(f) { return (f || UI.activeSketchFeature()).entities.map(function (e) { return e.t + '(' + ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'x', 'y'].filter(function (k) { return e[k] != null; }).map(function (k) { return (+e[k]).toFixed(4); }).join(',') + ')'; }).join(' '); }
    async function rfPPLook(P, dir, scale) {
      var c = UI.cam, d = new W.THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
      c.dir.copy(d); c.up.set(0, 1, 0); c.target.set(P[0], P[1], P[2]); c.scale = scale || 0.004;
      UI.applyCamera(); await idle(); await wait(30);
    }
    // a face clicked as a user does: looked at from `dir`, the point under the cursor checked first
    async function rfPPPickAt(pt, dir, scale, notes, what) {
      await rfPPLook(pt, dir, scale);
      var s = UI.worldToScreen(pt), h = UI.pickFace(s[0], s[1]);
      assert(h && Math.hypot(h.point[0] - pt[0], h.point[1] - pt[1], h.point[2] - pt[2]) < 3e-3, what + ': the face at ' + JSON.stringify(pt) + ' is under the cursor: hit ' + JSON.stringify(h && h.point) + ' | ' + notes.join('; '));
      await rfPPClickAt(s); await idle(); await wait(30);
    }
    function rfPPBox() { var bb = UI.App.build.body.getBounds(); return [bb.min.slice(), bb.max.slice()]; }
    function rfPPBoxText(b) { return JSON.stringify(b.map(function (p) { return p.map(rfPPF); })); }
    function rfPPHoles(fl) {
      return fl.loops.slice(1).map(function (l) { var b = l.reduce(function (a, p) { return [Math.min(a[0], p[0]), Math.max(a[1], p[0]), Math.min(a[2], p[1]), Math.max(a[3], p[1])]; }, [1e9, -1e9, 1e9, -1e9]); return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, b[1] - b[0], b[3] - b[2]]; });
    }

    // ---- job 1: a 14 ga electronics chassis 16 x 10, 2 in walls (Material Inside)
    var BD14 = rfPPBD(R14, T14, K44);
    step('rfPP: job 1, 14 ga chassis: Sheet Metal ▸ Base Flange/Tab ▸ Top Plane, a corner rectangle by two clicks, Smart Dimension 16 and 10, T / R / K typed ✓; Edge-Flange up on the four top edges (2 in, Material Inside) ✓: the blank 16 + 2 (2 − BD) x 10 + 2 (2 − BD); is there a Tab and Slot command?', async function () {
      var errs0 = errors.length, notes = [];
      await rfPPNewInch();
      var bf = rfPPRibbon('Sheet Metal', /Base Flange/);
      bf.click(); await wait(30);
      rfPPPmOpen('Base Flange/Tab');
      clickPmButton('Top Plane'); await idle(); await wait(30);
      assert(UI.App.mode === 'sketch', 'sketching on Top');
      var grid = UI.App.view.showGrid; UI.App.view.showGrid = false; UI.App.gridStale = true;
      try {
        rfPPFrame(22, 14, 0.1, 0.15); await wait(30);
        UI.setTool('rect'); await wait(20);
        await rfPPSk([0, 0]); await rfPPSk([15.4, -9.6]); await wait(30);
        rfPPKey('Escape'); await wait(20);
        var sk = UI.activeSketchFeature();
        var s16 = await rfPPDim([[7.7, 0]], [7.7, 1.5], '16');
        var s10 = await rfPPDim([[15.4 + 0.6, -4.8]], [18, -4.8], '10');
        notes.push('Modify boxes showed ' + s16 + ' / ' + s10 + '; ' + rfPPEnts(sk));
      } finally { UI.App.view.showGrid = grid; UI.App.gridStale = true; }
      UI.setTool('select');
      await UI.exitSketch(); await idle(); await wait(40);
      rfPPPmOpen('Base Flange/Tab');
      setInput(pmField('Thickness'), T14); await wait(10);
      setInput(pmField('Bend radius'), R14); await wait(10);
      var kf = pmField('K-factor'); if (kf) setInput(kf, K44); await wait(10);
      await pmAccept(); await wait(30);
      assert(!Object.keys(rfPPErrs()).length, 'base flange: ' + JSON.stringify(rfPPErrs()));
      var b = rfPPBox();
      notes.push('base ' + rfPPBoxText(b));
      near(b[1][0] - b[0][0], 16, 1e-9, 'base X'); near(b[1][2] - b[0][2], 10, 1e-9, 'base Z');
      // Edge-Flange: the four TOP edges of the base, flanges up
      await rfPPView('Isometric');
      rfPPRibbon('Sheet Metal', /Edge Flange/).click(); await wait(30);
      rfPPPmOpen('Edge-Flange');
      UI.setView('Dimetric');
      var mids = [[8, T14, 0], [16, T14, 5], [8, T14, 10], [0, T14, 5]];
      for (var i = 0; i < mids.length; i++) { var e = edgeNear(mids[i]); await rfPPClickAt(UI.worldToScreen(e.mid)); await idle(); await wait(20); }
      var fv = UI.pmSpec().values;
      notes.push('EF edges ' + fv.edges.length + ' ' + statusText().slice(0, 120));
      assert(fv.edges.length === 4, 'four edges taken: ' + notes.join('; '));
      setInput(pmField('Position'), 'inside'); await wait(10);
      setInput(pmField('Length'), 2); await wait(10);
      await pmAccept(); await wait(30);
      var f = rfPPLast();
      assert(f.type === 'flange' && !rfPPErrs()[f.id], 'Edge-Flange1: ' + JSON.stringify(rfPPErrs()));
      b = rfPPBox();
      notes.push('chassis ' + rfPPBoxText(b));
      near(b[1][1] - b[0][1], 2, 1e-9, 'walls 2 in outside');
      assert(b[1][1] > 1.9, 'the walls go up');
      var fl = anvil.flat();
      notes.push('blank ' + fl.size.map(rfPPF).join(' x ') + ' (hand ' + rfPPF(20 - 2 * BD14) + ' x ' + rfPPF(14 - 2 * BD14) + ') loops ' + fl.loops.length + ' bends ' + (fl.bends || []).length);
      near(Math.max(fl.size[0], fl.size[1]), 20 - 2 * BD14, 1e-6, 'blank 16 + 2 (2 − BD)');
      near(Math.min(fl.size[0], fl.size[1]), 14 - 2 * BD14, 1e-6, 'blank 10 + 2 (2 − BD)');
      // Tab and Slot (SolidWorks 2024 Sheet Metal tab, between Hem and Jog): look for it on the ribbon and in the menus
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var rib = Array.prototype.map.call(D.querySelectorAll('#ribbon button'), function (x) { return ((x.getAttribute('aria-label') || '') + ' ' + x.textContent).replace(/\s+/g, ' ').trim(); });
      var tsRib = rib.filter(function (t) { return /Tab and Slot/i.test(t); });
      var tsMenu = rfPPMenuRows('Insert').filter(function (r) { return /Tab and Slot/i.test(r.textContent); }); if (UI.closeMenus) UI.closeMenus();
      notes.push('Tab and Slot: ribbon ' + tsRib.length + ', Insert menu ' + tsMenu.length);
      rfPPjob.chassis = true;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPPDone(notes);
    });

    step('rfPP: job 1, hardware: Features ▸ Hole Wizard, Type Hole / ANSI Inch / #10 Normal / Up To Next, two clicks on the front wall ✓; Design Library ▸ Features ▸ Holes ▸ PEM Mounting Hole (S-632 nut) on the right wall ✓; Sheet Metal ▸ Forming Tool ▸ Louver on the floor ✓: the holes in the blank, the louver on the FORM layer', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfPPjob.chassis && rfPPLast().type === 'flange', 'job 1 chassis first');
      var fl0 = anvil.flat(), h0 = fl0.loops.length;
      var hw = rfPPRibbon('Features', /Hole Wizard/);
      assert(hw, 'Hole Wizard on the Features tab');
      hw.click(); await idle(); await wait(30);
      rfPPPmOpen('Hole Wizard');
      clickPmButton('Type'); await wait(20);
      rfPPSet('holeType', 'hole'); await wait(10);
      rfPPSet('standard', 'ANSI Inch'); await wait(10);
      var sz = D.querySelector('#pm [data-key="size"]');
      notes.push('sizes ' + Array.prototype.map.call(sz.options, function (o) { return o.value; }).join(',').slice(0, 200));
      rfPPSet('size', '#10'); await wait(10);
      rfPPSet('end', 'next'); await wait(10);
      notes.push('spec ' + ($('pm').textContent.match(/Ø[^·(]*\(/) || [''])[0]); var v0 = rfPPVol();
      clickPmButton('Positions'); await wait(20);
      await rfPPPickAt([4, 1.25, 0], [0.15, 0.2, -1], 0.006, notes, 'front wall at x 4');
      await rfPPPickAt([12, 1.25, 0], [0.15, 0.2, -1], 0.006, notes, 'front wall at x 12');
      var hv = UI.pmSpec().values;
      notes.push('hole points ' + JSON.stringify(hv.points));
      assert(hv.points.length === 2, 'two hole positions: ' + notes.join('; ') + ' | ' + statusText());
      await pmAccept(); await wait(30);
      var hf = rfPPLast();
      notes.push(hf.name + ' ' + JSON.stringify({ type: hf.type, holeType: hf.holeType, size: hf.size, d: hf.diameter || hf.dia, end: hf.end }) + ' ' + (rfPPErrs()[hf.id] || 'ok'));
      assert(!rfPPErrs()[hf.id], 'the holes build: ' + notes.join('; '));
      assert(/end: ?["']next/.test(anvil.script()), 'the script keeps Up To Next: ' + (anvil.script().match(/holeWizard\([^\n]*/) || [''])[0]);
      notes.push('removed ' + (v0 - rfPPVol()).toFixed(6) + ' (2 π .1005² T ' + (2 * Math.PI * 0.1005 * 0.1005 * T14).toFixed(6) + ')');
      near(v0 - rfPPVol(), 2 * Math.PI * 0.1005 * 0.1005 * T14, 2e-5, 'two Ø.201 holes through one wall');
      var fl1 = anvil.flat(), hs = rfPPHoles(fl1);
      notes.push('flat holes ' + JSON.stringify(hs.map(function (q) { return q.map(rfPPF); })));
      assert(fl1.loops.length === h0 + 2, 'two holes in the blank: ' + notes.join('; '));
      // the PEM hole from the Design Library on the right wall
      UI.designLibrary.open('features/Holes'); await wait(30);
      var tile = D.querySelector('.dl-tile[data-id="pemHole"]');
      assert(tile && !tile.hidden, 'the PEM Mounting Hole tile');
      tile.click(); await idle(); await wait(30);
      rfPPPmOpen('PEM Mounting Hole');
      await rfPPPickAt([16, 1, 5], [1, 0.2, 0.2], 0.006, notes, 'right wall');
      var pv = UI.pmSpec().values;
      notes.push('PEM ' + JSON.stringify({ pem: pv.pem, x: pv.x, y: pv.y }));
      await pmAccept(); await wait(30);
      var pc = rfPPLast();
      notes.push(pc.name + ' ' + JSON.stringify({ end: pc.end, depth: pc.depth, linkT: pc.linkT }) + ' ' + (rfPPErrs()[pc.id] || 'ok'));
      assert(/linkT: true/.test(anvil.script()), 'the script keeps Link to thickness');
      var fl2 = anvil.flat();
      var pemD = W.AnvilLibrary.pemHoles.filter(function (p) { return p.label === pv.pem; })[0].hole;
      var pemH = rfPPHoles(fl2).filter(function (q) { return Math.abs(q[2] - pemD) < 2e-3; });
      notes.push('PEM hole Ø' + pemD + ' in the blank ' + pemH.length);
      assert(fl2.loops.length === h0 + 3 && pemH.length === 1, 'the PEM hole in the blank: ' + notes.join('; '));
      // the louver on the floor (inside face, y = T)
      await rfPPFly('Sheet Metal', /Forming/, /Louver/);
      rfPPPmOpen('Forming Tool');
      await rfPPPickAt([8, T14, 5], [0.1, 1, 0.3], 0.01, notes, 'floor');
      var lv = UI.pmSpec().values;
      notes.push('louver ' + JSON.stringify({ tool: lv.tool, at: [lv.atU, lv.atV], flip: lv.flip }));
      await pmAccept(); await wait(30);
      var lf = rfPPLast();
      notes.push(lf.name + ' ' + (rfPPErrs()[lf.id] || 'ok'));
      assert(lf.type === 'formingTool' && !rfPPErrs()[lf.id], 'Louver1: ' + notes.join('; '));
      var fl3 = anvil.flat();
      notes.push('flat form marks ' + JSON.stringify((fl3.forms || fl3.form || []).length) + ' keys ' + Object.keys(fl3).join(','));
      rfPPjob.hardware = true;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPPDone(notes);
    });

    function rfPPMenuItem(re) {
      var mi = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi, .ctx-menu .mi, .menu .mi'), function (m) { return re.test(m.textContent); })[0];
      assert(mi, re + ' in the menu: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent; }).join(' | ').slice(0, 400));
      mi.click();
    }
    step('rfPP: job 1, outputs: the floor clicked, Sketch; Levels Manager ▸ Add preset level ETCH, the status-bar level chip ▸ ETCH, an alignment cross by two lines, Exit Sketch; Flatten; Make Drawing from Part, Document Properties ▸ Dual dimensions display, Hole Table on the flat; PDF; Flat to DXF: holes, FORM and ETCH layers', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfPPjob.hardware, 'job 1 hardware first');
      await rfPPPickAt([12, T14, 7], [0.1, 1, 0.3], 0.01, notes, 'floor');
      notes.push('selected ' + JSON.stringify(UI.App.sel && UI.App.sel.kind));
      // (the Sketch flyout's face is the last command used from it, 3D Sketch after another job: open the list)
      await rfPPFly('Sketch', /^(3D )?Sketch( On Plane)? options$/, /^\s*Sketch\s*(S, S)?\s*$/);
      assert(UI.App.mode === 'sketch', 'a sketch on the floor: ' + statusText());
      var sk = UI.activeSketchFeature();
      UI.showLevelsManager(); await wait(30);
      var lp = $('levels-panel'), r = lp.getBoundingClientRect();
      lp.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: W, button: 2, clientX: r.left + 20, clientY: r.bottom - 10 })); await wait(20);
      rfPPMenuItem(/Add preset level ETCH/); await idle(); await wait(20);
      var chip = D.querySelector('#status-right [data-lvl]');
      assert(chip, 'the level chip on the status bar');
      chip.click(); await wait(20);
      var row = Array.prototype.filter.call(D.querySelectorAll('.lvl-pop-row'), function (x) { return /ETCH/.test(x.textContent); })[0];
      assert(row, 'ETCH in the chip popup: ' + (D.querySelector('.lvl-pop') || {}).textContent);
      row.click(); await wait(20);
      notes.push('main level ' + D.querySelector('#status-right [data-lvl]').textContent);
      var o = K.to2D(UI.activePlane(), [12, T14, 7]);
      var grid = UI.App.view.showGrid; UI.App.view.showGrid = false; UI.App.gridStale = true;
      try {
        var cen = K.to2D(UI.activePlane(), [12, T14, 7]);
        rfPPFrameAt(cen, 4, 3); await wait(20);
        UI.setTool('line'); await wait(20);
        await rfPPSk([cen[0] - 0.5, cen[1]]); await rfPPSk([cen[0] + 0.5, cen[1]]); rfPPKey('Escape'); await wait(20);
        UI.setTool('line'); await wait(20);
        await rfPPSk([cen[0], cen[1] - 0.5]); await rfPPSk([cen[0], cen[1] + 0.5]); rfPPKey('Escape'); await wait(20);
      } finally { UI.App.view.showGrid = grid; UI.App.gridStale = true; }
      notes.push('same sketch object ' + (sk === UI.activeSketchFeature())); sk = UI.activeSketchFeature();
      notes.push('etch sketch ' + rfPPEnts(sk) + ' layers ' + JSON.stringify(sk.entities.map(function (e) { return e.layer || '0'; })) + ' status ' + statusText().slice(0, 100));
      UI.setTool('select');
      await UI.exitSketch(); await idle(); await wait(30);
      if (UI.hasPM()) { notes.push('PM after exit ' + UI.pmTitle()); UI.pmCancel(); }
      // main level back to 1 for the rest
      UI.levels.op('makeMain', 1);
      var fl = anvil.flat();
      notes.push('flat etch ' + (fl.etch || []).length + ' layer ' + JSON.stringify(fl.etchLayer));
      // Flatten, the drawing
      var fb = rfPPRibbon('Sheet Metal', /^Flatten\b|\bFlatten$/);
      fb.click(); await idle(); await wait(30); fb.click(); await idle();
      rfPPMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) { notes.push('modal: ' + $('modal').textContent.replace(/\s+/g, ' ').slice(0, 160)); clickModalButton('OK'); }
      await UI.drawing.ready(); await wait(40);
      var sm = anvil.drawing.summary(), fv = sm.views.filter(function (v) { return v.kind === 'flat'; })[0];
      if (!fv && (sm.sheets || []).length > 1) {
        var tab = D.querySelector('.dw-sheet-tab[data-sheet="1"]');
        if (tab) { tab.click(); await UI.drawing.ready(); await wait(40); }
        fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
      }
      assert(fv, 'Make Drawing adds the flat: ' + JSON.stringify(sm.views.map(function (v) { return v.kind; })));
      notes.push('views ' + anvil.drawing.summary().views.map(function (v) { return v.name + ':' + (v.orient || v.kind); }).join(','));
      // Document Properties ▸ Dual dimensions display
      ribbonButton('Document Properties').click(); await wait(20);
      assert(modalOpen() && $('dw-opt-dual'), 'Document Properties with the dual rows');
      $('dw-opt-dual').click(); await wait(10);
      $('dw-opt-ok').click(); await UI.drawing.ready(); await wait(30);
      var st = UI.drawing.state, w = st.sheet.views.filter(function (x) { return x.view.id === fv.id; })[0];
      UI.drawing.fit(); await wait(20);
      ribbonButton('Hole Table').click(); await idle();
      assert(UI.drawing.state.tool === 'holetable', 'Hole Table tool');
      var cs = w.proj.circles.visible;
      notes.push('flat circles ' + cs.map(function (c) { return (2 * c.r).toFixed(3); }).join(','));
      var org = null;
      (w.flat.lines || []).forEach(function (l) { [[l[0], l[1]], [l[2], l[3]]].forEach(function (q) { if (q && isFinite(q[0]) && (!org || q[0] + q[1] < org[0] + org[1])) org = q; }); });
      var c0 = w.toSheet(org);
      sheetMouse('mousemove', c0); sheetMouse('mousedown', c0); sheetMouse('mouseup', c0); await idle();
      var h = cs.filter(function (c) { return Math.abs(2 * c.r - 0.201) < 1e-6; })[0];
      assert(h, 'a Ø.201 hole in the flat view');
      var hp = w.toSheet([h.c[0] + h.r, h.c[1]]);
      sheetMouse('mousemove', hp); sheetMouse('mousedown', hp); sheetMouse('mouseup', hp); await idle();
      await UI.pmOK(); await idle(); await wait(40);
      var ht = anvil.drawing.holeTables();
      notes.push('hole table ' + JSON.stringify(ht.map(function (t) { return t.rows.map(function (r) { return r.tag + ' ' + r.xText + ' ' + r.yText + ' ' + r.size; }); })));
      var dims = anvil.drawing.summary().dimDetails.map(function (d) { return d.text; });
      notes.push('dims ' + JSON.stringify(dims).slice(0, 400));
      var pdf = (await rfPPSaved(function () { rfPPMenu('File', 'Save Drawing as PDF'); }))[0];
      notes.push('pdf ' + (pdf && pdf.name) + ' ' + (pdf && /^%PDF/.test(pdf.text || '')));
      anvil.drawing.close(); await idle();
      var xb = rfPPRibbon('Sheet Metal', /Flat to/);
      xb.click(); await wait(30);
      rfPPPmOpen('DXF/DWG Output');
      var got = await rfPPSaved(function () { return pmAccept(); });
      var dxf = got[got.length - 1];
      var c = (await rfPPCheck()).check(dxf.text, { units: 'in' });
      notes.push('flat dxf ' + dxf.name + ' ok ' + c.ok + ' ' + JSON.stringify(c.counts));
      assert(sk.entities.length === 2 && sk.entities.every(function (e) { return e.layer === 'ETCH'; }), 'two lines on ETCH: ' + notes.join('; '));
      assert(ht.length === 1 && ht[0].rows.length === 2 && ht[0].rows.every(function (r) { return /^Ø\s?\.201/.test(r.size); }), 'Hole Table of the two Ø.201: ' + notes.join('; '));
      assert(pdf && /^%PDF/.test(pdf.text || ''), 'a PDF');
      assert(c.ok && c.counts['CIRCLE@HOLES'] === 3 && c.counts['LINE@ETCH'] === 2 && c.counts['POLYLINE@FORM'] === 1 && c.counts['LINE@BEND'] === 4, 'the flat DXF: ' + notes.join('; '));
      rfPPjob.chassisDone = true;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPPDone(notes);
    });

    // ---- job 2: an L bracket family (14 ga): base W x 2.5, flange L up (Material Inside), N Ø.281 holes 2 apart
    var RFPP_LBRK = 'p.name("LBRK-14").units("in");\np.sheet(' + T14 + ', ' + R14 + ', ' + K44 + ');\n' +
      'p.sketch("Top").rect(0, -2.5, 6, 2.5).dim(0, "w", { value: 6 }).dim(0, "h", { value: 2.5 }).end().baseFlange();\n' +
      'p.flange(1.5, [[3, ' + T14 + ', 0]], { position: "inside", lengthRef: "outer" });\n' +
      'p.sketch("Top", ' + T14 + ').circle(1, -1.5, 0.1405).end().cut("through", { reverse: true });\n' +
      'p.linearPattern({ dir: "x", spacing: 2, count: 3 });\n';
    var RFPP_SIZES = [['LB-4', 4, 1, 2], ['LB-6', 6, 1.5, 3], ['LB-10', 10, 2, 5]];
    function rfPPCfgTab() { var b = D.querySelector('#fm-tabs button[data-tab="config"]'); assert(b, 'the ConfigurationManager tab: ' + Array.prototype.map.call(D.querySelectorAll('#fm-tabs button'), function (x) { return x.dataset.tab; }).join(',')); b.click(); }
    function rfPPDtCell(r, c) { return D.querySelector('#dt-grid [data-r="' + r + '"][data-c="' + c + '"] input'); }
    step('rfPP: job 2, L bracket family: Insert ▸ Tables ▸ Design Table, columns width (D1@Sketch1), flange length (D1@Edge-Flange1) and hole count (LPattern1) from Add Column, three rows typed (LB-4 / LB-6 / LB-10), OK; each configuration shown by a double-click in the ConfigurationManager: its blank W x (2.5 + L − BD) and N holes, Flat to DXF and a drawing PDF named for it', async function () {
      var errs0 = errors.length, notes = [];
      await rfPPNewInch(); await anvil.run(RFPP_LBRK); await idle();
      assert(!Object.keys(rfPPErrs()).length, 'the bracket builds: ' + JSON.stringify(rfPPErrs()));
      var lp = rfPPByName('LPattern1');
      rfPPMenu('Insert', 'Design Table'); await wait(30);
      assert(modalOpen() && $('dt-grid'), 'the Design Table dialog');
      notes.push('grid at start ' + JSON.stringify(UI.designTableState.grid()));
      var sel = $('dt-add-col'), opts = Array.prototype.map.call(sel.querySelectorAll('option'), function (o) { return o.value; });
      // which LPattern column is the count: the one whose value is the pattern's count now
      var cntCol = opts.filter(function (o) { return /@LPattern1$/.test(o) && /^D/.test(o); }).filter(function (o) { try { return +K.designTableCell(UI.App.model, o, null) === 3; } catch (e) { return false; } })[0];
      notes.push('count column ' + cntCol);
      assert(cntCol, 'a count column for LPattern1: ' + opts.join(','));
      ['D1@Sketch1', 'D1@Edge-Flange1', cntCol].forEach(function (c) { setInput(sel, c); });
      await wait(20);
      var g = UI.designTableState.grid();
      notes.push('headers ' + JSON.stringify(g[0]) + ' rows ' + (g.length - 1));
      while (UI.designTableState.grid().length < 4) { $('dt-add-row').click(); await wait(10); }
      var hdr = UI.designTableState.grid()[0], ci = { w: hdr.indexOf('D1@Sketch1'), l: hdr.indexOf('D1@Edge-Flange1'), n: hdr.indexOf(cntCol) };
      notes.push('which width: ' + K.designTableCell(UI.App.model, 'D1@Sketch1', null) + ' (6 is the width)');
      RFPP_SIZES.forEach(function (s, i) {
        var r = i + 1;
        setInput(rfPPDtCell(r, 0), s[0]); setInput(rfPPDtCell(r, ci.w), String(s[1])); setInput(rfPPDtCell(r, ci.l), String(s[2])); setInput(rfPPDtCell(r, ci.n), String(s[3]));
      });
      notes.push('typed ' + JSON.stringify(UI.designTableState.grid()));
      $('dt-ok').click(); await idle(); await wait(60); await idle();
      notes.push('after OK: modal ' + modalOpen() + ' ' + ($('dt-msg') ? $('dt-msg').textContent : '') + ' | ' + statusText().slice(0, 150));
      assert(!modalOpen(), 'the table applied: ' + notes.join('; '));
      var cfg = anvil.configurations();
      notes.push('configurations ' + JSON.stringify(cfg.list.map(function (c) { return c.name; })) + ' active ' + cfg.active);
      rfPPCfgTab(); await wait(30);
      var outs = [];
      for (var i = 0; i < RFPP_SIZES.length; i++) {
        var s = RFPP_SIZES[i];
        var row = D.querySelector('#cfg-list .cfg-row[data-name="' + s[0] + '"]');
        assert(row, 'row ' + s[0] + ' in the ConfigurationManager');
        row.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); row = D.querySelector('#cfg-list .cfg-row[data-name="' + s[0] + '"]');
        row.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, detail: 2 })); await idle(); await wait(40); await idle();
        assert(anvil.configurations().active === s[0], s[0] + ' active: ' + anvil.configurations().active);
        var fl = anvil.flat(), hs = rfPPHoles(fl);
        var want = [s[1], 2.5 + s[2] - BD14];
        notes.push(s[0] + ': blank ' + fl.size.map(rfPPF).join(' x ') + ' (hand ' + want.map(rfPPF).join(' x ') + ') holes ' + hs.length + ' errors ' + JSON.stringify(rfPPErrs()));
        near(Math.max(fl.size[0], fl.size[1]), Math.max(want[0], want[1]), 1e-6, s[0] + ' blank long side');
        near(Math.min(fl.size[0], fl.size[1]), Math.min(want[0], want[1]), 1e-6, s[0] + ' blank short side');
        assert(hs.length === s[3], s[0] + ': ' + s[3] + ' holes: ' + hs.length);
        var xb = rfPPRibbon('Sheet Metal', /Flat to/);
        xb.click(); await wait(30);
        rfPPPmOpen('DXF/DWG Output');
        var got = await rfPPSaved(function () { return pmAccept(); });
        var dxf = got[got.length - 1], c = (await rfPPCheck()).check(dxf.text, { units: 'in' });
        rfPPMenu('File', 'Make Drawing from Part'); await wait(30);
        if (modalOpen()) clickModalButton('OK');
        await UI.drawing.ready(); await wait(40);
        var pdf = (await rfPPSaved(function () { rfPPMenu('File', 'Save Drawing as PDF'); }))[0];
        var dsum = anvil.drawing.summary();
        anvil.drawing.close(); await idle();
        outs.push(dxf.name + ' ' + JSON.stringify(c.counts) + ' / ' + (pdf && pdf.name));
        notes.push(s[0] + ' dxf ' + dxf.name + ' holes ' + c.counts['CIRCLE@HOLES'] + ' pdf ' + (pdf && pdf.name) + ' ' + (pdf && /^%PDF/.test(pdf.text || '')) + ' title ' + JSON.stringify((dsum.title || dsum.titleBlock || {})).slice(0, 120));
        assert(c.ok && c.counts['CIRCLE@HOLES'] === s[3], s[0] + ' DXF holes: ' + notes.join('; '));
        assert(pdf && /^%PDF/.test(pdf.text || ''), s[0] + ' PDF');
        assert(dxf.name === 'LBRK-14_' + s[0] + '_flat.dxf', 'the DXF named for the configuration: ' + dxf.name);
        if (UI.App.activeTab !== 'config') rfPPCfgTab();
        await wait(20);
      }
      rfPPjob.family = outs;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPPDone(notes);
    });

    // ---- job 3: a 14 ga comb bracket: a 9 x 4 plate with three 1 in tabs on its front edge (x −3, 0, 3); an
    // Edge-Flange (1 in up, Material Inside) and a Hem on the first tab, mirrored to the third, patterned to the second
    var RFPP_COMB_PTS = [[-4.5, 0], [4.5, 0], [4.5, -4], [3.5, -4], [3.5, -5], [2.5, -5], [2.5, -4], [0.5, -4], [0.5, -5], [-0.5, -5], [-0.5, -4], [-2.5, -4], [-2.5, -5], [-3.5, -5], [-3.5, -4], [-4.5, -4]];
    var RFPP_COMB = 'p.name("COMB-14").units("in");\np.sheet(' + T14 + ', ' + R14 + ', ' + K44 + ');\np.sketch("Top").polyline(' + JSON.stringify(RFPP_COMB_PTS) + ', true).end().baseFlange();\n';
    function rfPPRowEv(row, type, detail, mods) {
      var r = row.getBoundingClientRect(), nm = row.querySelector('.nm') || row;
      nm.dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: W, button: 0, detail: detail || 1, clientX: r.left + 40, clientY: r.top + r.height / 2 }, mods || {})));
    }
    function rfPPRow(id) { return D.querySelector('#tree .ti[data-fid="' + id + '"]'); }
    function rfPPClickRow(id, mods) { var row = rfPPRow(id); assert(row, 'tree row ' + id); rfPPRowEv(row, 'mousedown', 1, mods); rfPPRowEv(row, 'mouseup', 1, mods); rfPPRowEv(row, 'click', 1, mods); }
    step('rfPP: job 3, comb bracket: Edge-Flange on the first tab (1 in) and a Hem on its top edge by clicks; both picked in the FeatureManager, Linear Pattern flyout ▸ Mirror, Right Plane (built, or refused with the reason while the kernel cannot mirror a bend); Linear Pattern X 3 in: the flanges and hems on the tabs in the blank as if made on each tab', async function () {
      var errs0 = errors.length, notes = [];
      await rfPPNewInch(); await anvil.run(RFPP_COMB); await idle();
      assert(!Object.keys(rfPPErrs()).length, 'the comb builds: ' + JSON.stringify(rfPPErrs()));
      var v00 = rfPPVol();
      rfPPRibbon('Sheet Metal', /Edge Flange/).click(); await wait(30);
      rfPPPmOpen('Edge-Flange');
      await rfPPLook([-3, T14, 5], [0.3, 0.6, 1], 0.004);
      var e = edgeNear([-3, T14, 5]);
      await rfPPClickAt(UI.worldToScreen(e.mid)); await idle(); await wait(20);
      assert(UI.pmSpec().values.edges.length === 1, 'the tab edge taken: ' + statusText());
      setInput(pmField('Position'), 'inside'); await wait(10);
      setInput(pmField('Length'), 1); await wait(10);
      await pmAccept(); await wait(30);
      var ef = rfPPLast();
      assert(ef.type === 'flange' && !rfPPErrs()[ef.id], 'Edge-Flange1: ' + JSON.stringify(rfPPErrs()));
      rfPPRibbon('Sheet Metal', /^Hem\b/).click(); await wait(30);
      rfPPPmOpen('Hem');
      await rfPPLook([-3, 1, 5], [0.3, 0.6, 1], 0.003);
      e = edgeNear([-3, 1, 5]);
      notes.push('hem edge ' + JSON.stringify(e.mid.map(rfPPF)));
      await rfPPClickAt(UI.worldToScreen(e.mid)); await idle(); await wait(20);
      var hv = UI.pmSpec().values;
      notes.push('Hem values ' + JSON.stringify({ edges: (hv.edges || []).length, type: hv.hemType || hv.type, length: hv.length, gap: hv.gap }));
      await pmAccept(); await wait(30);
      var hm = rfPPLast();
      notes.push(hm.name + ' ' + (rfPPErrs()[hm.id] || 'ok'));
      assert(/flange|hem/.test(hm.type) && !rfPPErrs()[hm.id], 'Hem1: ' + notes.join('; '));
      var v1 = rfPPVol(), fl1 = anvil.flat();
      notes.push('one tab: blank ' + fl1.size.map(rfPPF).join(' x ') + ' bends ' + fl1.bends.length);
      // Mirror: the two features picked in the FeatureManager, then the flyout
      rfPPClickRow(ef.id); await wait(10); rfPPClickRow(hm.id, { ctrlKey: true }); await wait(10);
      await rfPPFly('Features', /^(Linear Pattern|Mirror) options/, /^\s*Mirror\b/);
      rfPPPmOpen('Mirror');
      var mv = UI.pmSpec().values;
      notes.push('Mirror picked ' + JSON.stringify({ feature: mv.feature, features: mv.features, plane: mv.plane }));
      assert((mv.plane || 'Right') === 'Right', 'the Right Plane (the default)');
      if (UI.previewIdle) await UI.previewIdle();
      var okb = D.querySelector('#pm .pm-ok'), mirrored = !okb.classList.contains('disabled');
      notes.push('Mirror ✓ ' + (mirrored ? 'lit' : 'grey: ' + okb.title));
      if (mirrored) { await pmAccept(); await wait(30); notes.push('Mirror1 ' + (rfPPErrs()[rfPPLast().id] || 'ok')); }
      else { assert(/bend|flange|hem/i.test(okb.title), 'refused with the reason: ' + okb.title); UI.pmCancel(); await idle(); }
      // Linear Pattern of the flange and the hem: X, 3 in, to the middle tab (count 2), or to both (count 3) without the mirror
      rfPPClickRow(ef.id); await wait(10); rfPPClickRow(hm.id, { ctrlKey: true }); await wait(10);
      await rfPPFly('Features', /^(Linear Pattern|Mirror) options/, /^\s*Linear Pattern/);
      rfPPPmOpen('Linear Pattern');
      var lv = UI.pmSpec().values;
      notes.push('LPattern picked ' + JSON.stringify(lv.feature) + ' ' + JSON.stringify(lv.features || null) + ' d1 ' + lv.d1);
      setInput(pmField('Spacing'), 3); await wait(10);
      setInput(pmField('Number of instances') || pmField('Instances'), mirrored ? 2 : 3); await wait(10);
      await pmAccept(); await wait(30);
      var lp = rfPPLast();
      notes.push(lp.name + ' ' + JSON.stringify({ feature: lp.feature, features: lp.features, n1: lp.n1, s1: lp.s1 }) + ' ' + (rfPPErrs()[lp.id] || 'ok'));
      assert(lp.type === 'lpattern' && !rfPPErrs()[lp.id], 'LPattern1: ' + notes.join('; '));
      var v3 = rfPPVol(), fl3 = anvil.flat();
      notes.push('three tabs: added ' + rfPPF(v3 - v00) + ' (one tab ' + rfPPF(v1 - v00) + ' x 3 = ' + rfPPF(3 * (v1 - v00)) + ') blank ' + fl3.size.map(rfPPF).join(' x ') + ' bends ' + fl3.bends.length);
      if (!/rfppdump/.test(location.search)) near(v3 - v00, 3 * (v1 - v00), 1e-6, 'three flanges and hems');
      assert(fl3.bends.length === 3 * fl1.bends.length, 'every bend in the blank: ' + notes.join('; '));
      var nm = UI.App.model.features.map(function (g) { return g.name; });
      assert(nm.indexOf('Mirror2') >= 0 === mirrored && nm.indexOf('LPattern2') >= 0, 'one Mirror / LPattern per picked feature: ' + nm.join(','));
      rfPPjob.comb = { ef: ef.id, hm: hm.id, one: fl1, three: fl3, mirrored: mirrored, v: v3 };
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPPDone(notes);
    });

    async function rfPPDwDone() { await idle(); if (UI.drawing && UI.drawing.ready) await UI.drawing.ready(); await wait(30); }
    function rfPPDwMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: 1 }, extra || {});
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfPPDwClick(p) { rfPPDwMouse('mousemove', p, { buttons: 0 }); rfPPDwMouse('mousedown', p); rfPPDwMouse('mouseup', p); }
    function rfPPFlatW() { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.kind === 'flat'; })[0]; }
    step('rfPP: job 3, the source edited: right-click Edge-Flange1 ▸ Edit Feature, 1 → 1.25 ✓: the mirrored and patterned flanges follow; double-click Edge-Flange1 shows its dimensions; Make Drawing (the flat with six bend notes), Break (Zig Zag) out the middle tab, a Detail View of a hem, PDF', async function () {
      var errs0 = errors.length, notes = [];
      var g = rfPPjob.comb;
      assert(g && K.findFeature(UI.App.model, g.ef), 'job 3 comb first');
      var v0 = rfPPVol(), fl0 = anvil.flat();
      var row = rfPPRow(g.ef), rr = row.getBoundingClientRect();
      row.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: W, button: 2, clientX: rr.left + 30, clientY: rr.top + 6 }));
      var it = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /^Edit Feature/.test(m.textContent.trim()); })[0];
      assert(it, 'Edit Feature on the right-click menu'); it.click(); await idle(); await wait(30);
      setInput(pmField('Length'), 1.25); await wait(10);
      await pmAccept(); await wait(30);
      var v1 = rfPPVol(), fl1 = anvil.flat();
      notes.push('Edit Feature 1 → 1.25: volume +' + rfPPF(v1 - v0) + ' (3 × .25 × T × 1 = ' + rfPPF(3 * 0.25 * T14) + ') blank ' + fl0.size.map(rfPPF).join(' x ') + ' → ' + fl1.size.map(rfPPF).join(' x ') + ' bends ' + fl1.bends.length + ' errors ' + JSON.stringify(rfPPErrs()));
      near(v1 - v0, 3 * 0.25 * T14, 1e-6, 'all three flanges 1/4 longer');
      near(Math.max(fl1.size[0], fl1.size[1]) - Math.max(fl0.size[0], fl0.size[1]) + Math.min(fl1.size[0], fl1.size[1]) - Math.min(fl0.size[0], fl0.size[1]), 0.25, 1e-6, 'the blank 1/4 longer');
      assert(!Object.keys(rfPPErrs()).length && fl1.bends.length === fl0.bends.length, 'no errors, every bend kept');
      // double-click Edge-Flange1: its dimensions on the model
      rfPPClickRow(g.ef); row = rfPPRow(g.ef);
      rfPPRowEv(row, 'mousedown', 2); rfPPRowEv(row, 'mouseup', 2); rfPPRowEv(row, 'click', 2); rfPPRowEv(rfPPRow(g.ef), 'dblclick', 2); await idle(); await wait(30);
      var shown = UI.featureDimsShown ? UI.featureDimsShown() : null;
      var labels = Array.prototype.map.call(D.querySelectorAll('.dim-label, .feat-dim, #viewport .dim-text'), function (x) { return x.textContent; });
      notes.push('double-click: PM ' + (UI.hasPM() && UI.pmTitle()) + ' dims shown for ' + JSON.stringify(shown) + ' labels ' + JSON.stringify(labels.slice(0, 6)));
      rfPPKey('Escape'); await wait(20);
      // the drawing of the flat
      rfPPMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfPPDwDone();
      var fw = rfPPFlatW();
      if (!fw) { var t1 = D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="1"]'); if (t1) { t1.click(); await rfPPDwDone(); } fw = rfPPFlatW(); }
      assert(fw, 'a flat view: ' + UI.drawing.state.sheet.views.map(function (w) { return w.view.kind || w.view.orient; }).join(','));
      UI.drawing.fit(); await wait(20);
      var bn = (fw.proj && fw.proj.bendNotes || []).map(function (b) { return b.text; });
      var svg0 = anvil.drawing.svg(), bnSvg = svg0.match(/(UP|DOWN)\s+(90|180)(\.0+)?°/g) || [];
      notes.push('bend notes ' + JSON.stringify(bn.length ? bn : bnSvg));
      var nNotes = bn.length || bnSvg.length;
      // Break: Zig Zag, out the middle tab (x −.5 .. .5 of the part)
      var bb = fw.flat.bbox, um = (bb.umin + bb.umax) / 2, vm = (bb.vmin + bb.vmax) / 2, w0 = fw.box.x1 - fw.box.x0;
      notes.push('flat bbox u ' + rfPPF(bb.umin) + '..' + rfPPF(bb.umax) + ' v ' + rfPPF(bb.vmin) + '..' + rfPPF(bb.vmax));
      ribbonButton('Break').click(); await wait(30);
      var sel = D.querySelector('#pm select[data-key="style"]');
      assert(sel, 'Break line style list');
      setInput(sel, Array.prototype.filter.call(sel.options, function (o) { return /^Zig Zag/.test(o.textContent); })[0].value);
      await UI.pmOK(); await wait(20);
      rfPPDwClick(fw.toSheet([um - 0.9, vm])); await wait(20);
      rfPPDwClick(fw.toSheet([um + 0.9, vm])); await rfPPDwDone();
      var vb = anvil.drawing.doc().views.filter(function (x) { return x.id === fw.view.id; })[0];
      fw = rfPPFlatW();
      var bn2 = (fw.proj && fw.proj.bendNotes || []).filter(function (b) { return !b.hidden && !b.removed; }).length;
      var svg1 = anvil.drawing.svg(), bnSvg1 = (svg1.match(/(UP|DOWN)\s+(90|180)(\.0+)?°/g) || []).length;
      notes.push('break ' + JSON.stringify(vb.breaks) + ' paper ' + rfPPF(w0) + ' → ' + rfPPF(fw.box.x1 - fw.box.x0) + ' bend notes on the sheet ' + bnSvg1 + ' (were ' + bnSvg.length + ')');
      assert(vb.breaks && vb.breaks.length === 1 && fw.box.x1 - fw.box.x0 < w0 - 0.1, 'the flat broken: ' + notes.join('; '));
      for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand();
      // Detail View round the first tab's hem bend line
      var hb = fw.flat.bends.filter(function (b) { return Math.abs(b.angle || 0) > 170 || /180/.test(K.bendNoteText ? K.bendNoteText(b, 'in') : ''); })[0] || fw.flat.bends[0];
      var mid = [(hb.a[0] + hb.b[0]) / 2, (hb.a[1] + hb.b[1]) / 2];
      var n0 = anvil.drawing.doc().views.length, S = UI.drawing.state.sheet.size;
      ribbonButton('Detail View').click(); await wait(30);
      rfPPDwClick(fw.toSheet(mid)); await wait(10);
      rfPPDwClick(fw.toSheet([mid[0] + 0.5, mid[1]])); await wait(10);
      var place = [Math.min(S[0] - 2.5, fw.box.x1 + 2.2), fw.box.y1 - 0.5];
      rfPPDwMouse('mousemove', place, { buttons: 0 }); await wait(20);
      rfPPDwClick(place); await rfPPDwDone();
      var views = anvil.drawing.doc().views, dv = views[views.length - 1];
      notes.push('detail ' + JSON.stringify(dv && { kind: dv.kind, parent: dv.parent === fw.view.id, r: dv.detail && +dv.detail.r.toFixed(3), label: dv.label }));
      assert(views.length === n0 + 1 && dv.kind === 'detail', 'a detail of the flat: ' + notes.join('; '));
      for (i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand();
      var pdf = (await rfPPSaved(function () { rfPPMenu('File', 'Save Drawing as PDF'); }))[0];
      notes.push('pdf ' + (pdf && pdf.name) + ' ' + (pdf && /^%PDF/.test(pdf.text || '')));
      assert(pdf && /^%PDF/.test(pdf.text || ''), 'a PDF');
      UI.markClean(); anvil.drawing.close(); await idle();
      if (modalOpen()) clickModalButton("Don't Save");
      assert(nNotes === 6, 'six bend notes on the flat: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPPDone(notes);
    });

    // ---- job 4: a weld-free 16 ga box, four parts riveted together: TRAY (a U 10 x 6, 4 in walls), END-A / END-B (end
    // plates 6 + 2T x 4 with 3/4 flanges round the tray walls, one each way), LID (10 x 6 + 2T, 3/4 flanges down)
    var T16 = 0.0598, R16 = 0.06;
    var RFPP_SM16 = 'p.sheet(' + T16 + ', ' + R16 + ', ' + K44 + ');\n';
    var RFPP_BOXP = {
      'TRAY-16': 'p.name("TRAY-16").units("in");\n' + RFPP_SM16 + 'p.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\np.flange(4, [[5, ' + T16 + ', 0], [5, ' + T16 + ', 6]], { position: "inside", lengthRef: "outer" });\n',
      'END-A': 'p.name("END-A").units("in");\n' + RFPP_SM16 + 'p.sketch("Right").rect(' + (-(6 + T16)) + ', 0, ' + (6 + 2 * T16) + ', 4).end().baseFlange();\np.flange(0.75, [[' + T16 + ', 2, ' + (-T16) + '], [' + T16 + ', 2, ' + (6 + T16) + ']], { position: "inside", lengthRef: "outer" });\n',
      'END-B': 'p.name("END-B").units("in");\n' + RFPP_SM16 + 'p.sketch("Right").rect(' + (-(6 + T16)) + ', 0, ' + (6 + 2 * T16) + ', 4).end().baseFlange();\np.flange(0.75, [[0, 2, ' + (-T16) + '], [0, 2, ' + (6 + T16) + ']], { position: "inside", lengthRef: "outer" });\n',
      'LID-B16': 'p.name("LID-B16").units("in");\n' + RFPP_SM16 + 'p.sketch("Top").rect(0, ' + (-(6 + T16)) + ', 10, ' + (6 + 2 * T16) + ').end().baseFlange();\np.flange(0.75, [[5, 0, ' + (-T16) + '], [5, 0, ' + (6 + T16) + ']], { position: "inside", lengthRef: "outer" });\n'
    };
    async function rfPPSaveDoc(notes, name) {
      await rfPPSaved(async function () {
        rfPPMenu('File', 'Save'); await wait(40);
        if (modalOpen()) {
          var inp = D.querySelector('#modal input[type=text], #modal input:not([type])');
          if (inp && name) setInput(inp, name);
          var bs = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); });
          clickModalButton(bs.filter(function (b) { return /Save|OK/.test(b); })[0] || bs[0]); await wait(40);
          if (modalOpen()) { var b2 = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); }); clickModalButton(b2.filter(function (b) { return /Replace|Yes|OK|Save/.test(b); })[0] || b2[0]); await wait(40); }
        }
      });
    }
    // File ▸ Properties ▸ Custom: the values typed into the rows of those names, OK
    async function rfPPProps(vals, notes) {
      rfPPMenu('File', 'Properties'); await wait(30);
      assert(modalOpen() && D.querySelector('#fp-dialog'), 'File Properties');
      Object.keys(vals).forEach(function (k) {
        var row = Array.prototype.filter.call(D.querySelectorAll('#fp-dialog .fp-row'), function (r) { return r.querySelector('.fp-name').value === k; })[0];
        assert(row, 'property row ' + k);
        setInput(row.querySelector('.fp-value'), vals[k]);
      });
      D.querySelector('#fp-ok').click(); await idle(); await wait(30);
      notes.push('properties ' + JSON.stringify(vals));
    }
    function rfPPComp(name) { return anvil.components().filter(function (c) { return c.name === name; })[0]; }
    async function rfPPInsert(part, at) {
      rfPPRibbon('Assembly', /Insert Components/).click(); await idle(); await wait(30);
      rfPPPmOpen('Insert Component');
      var sel = D.querySelector('#pm select[data-key="part"]');
      var opt = Array.prototype.filter.call(sel.options, function (o) { return o.textContent.indexOf(part) === 0; })[0];
      assert(opt, part + ' among the parts: ' + Array.prototype.map.call(sel.options, function (o) { return o.textContent; }).join(' | ').slice(0, 300));
      setInput(sel, opt.value); await wait(20);
      if (at) { rfPPSet('x', at[0]); rfPPSet('y', at[1]); rfPPSet('z', at[2]); }
      await pmAccept(); await idle(); await wait(40);
      if (UI.hasPM() && UI.pmTitle() === 'Insert Component') UI.pmCancel();
    }
    step('rfPP: job 4, a box of four parts: TRAY-16, END-A, END-B and LID-B16 saved; File ▸ New ▸ Assembly, Insert Components (END-A floating, END-B and the lid in place); one Mate PM kept open for three mates of END-A by clicks; Interference Detection: the corner clashes of the design (end bends into the wall ends, lid flanges over the end flanges)', async function () {
      var errs0 = errors.length, notes = [];
      var names = Object.keys(RFPP_BOXP);
      for (var i = 0; i < names.length; i++) {
        await rfPPNewInch(); await anvil.run(RFPP_BOXP[names[i]]); await idle();
        assert(!Object.keys(rfPPErrs()).length, names[i] + ' builds: ' + JSON.stringify(rfPPErrs()));
        var b = rfPPBox(); notes.push(names[i] + ' ' + rfPPBoxText(b));
        if (names[i] === 'TRAY-16') await rfPPProps({ 'Description': 'TRAY, 16 GA CRS', 'Part Number': '100-0042' }, notes);
        await rfPPSaveDoc(notes);
      }
      var du = UI.defaultUnits(); UI.setDefaultUnits('in');
      try { rfPPMenu('File', 'New ▸ Assembly'); await idle(); await wait(60); } finally { UI.setDefaultUnits(du); }
      if (modalOpen()) clickModalButton('OK');
      if (UI.hasPM() && UI.pmTitle() === 'Insert Component') UI.pmCancel();
      assert(UI.isAssembly(), 'an assembly');
      await rfPPInsert('TRAY-16', null);
      await rfPPInsert('END-A', [-3, 1, 8]);
      await rfPPInsert('END-B', [10, 0, 0]);
      await rfPPInsert('LID-B16', [0, 4, 0]);
      notes.push('components ' + anvil.components().map(function (c) { return c.name + (c.fixed ? '(f)' : '') + '@' + c.position.map(rfPPF).join(','); }).join(' '));
      // one Mate PM, three mates of END-A, each ✓ keeps it open
      UI.cmdMate(); await idle(); await wait(20);
      rfPPPmOpen('Mate');
      async function mate(pa, da, pb, db, what) {
        await rfPPPickAt(pa, da, 0.002, notes, what + ' (END-A)');
        await rfPPPickAt(pb, db, 0.002, notes, what + ' (TRAY)');
        var v = UI.pmSpec().values;
        notes.push(what + ': ' + v.type + ' ' + !!v.a + '/' + !!v.b);
        assert(v.a && v.b, what + ': two faces: ' + notes.join('; '));
        await pmAccept(); await idle(); await wait(40);
        notes.push('PM after ✓ ' + (UI.hasPM() && UI.pmTitle()));
        assert(UI.hasPM() && UI.pmTitle() === 'Mate', 'the Mate PM stays open after ' + what);
      }
      var A = rfPPComp('END-A<1>').position;
      // 1: END-A's inside face (part x = T, seen from +x) on the tray's end (the base's end face x = 0, seen from −x below)
      await mate([A[0] + T16, A[1] + 2, A[2] + 3], [1, 0.15, 0.1], [0, T16 / 2, 3], [-1, -0.2, 0.1], 'mate 1');
      A = rfPPComp('END-A<1>').position; notes.push('END-A after mate 1 ' + A.map(rfPPF).join(','));
      // 2: END-A's front flange inside face (z = 0, seen from +z) on the tray's front wall outside face (z = 0, seen from −z)
      await mate([A[0] + T16 + 0.4, A[1] + 2, A[2]], [0.2, 0.1, 1], [5, 2, 0], [0.1, 0.1, -1], 'mate 2');
      A = rfPPComp('END-A<1>').position; notes.push('END-A after mate 2 ' + A.map(rfPPF).join(','));
      // 3: END-A's bottom edge face (y = 0 of the plate, seen from below) on the tray's bottom face
      await mate([A[0] + T16 / 2, A[1], A[2] + 3], [-0.05, -1, 0.1], [5, 0, 3], [0.1, -1, 0.1], 'mate 3');
      UI.pmCancel(); await idle();
      A = rfPPComp('END-A<1>').position;
      notes.push('END-A at ' + A.map(rfPPF).join(',') + ' mates ' + anvil.mates().map(function (m) { return m.name + (m.ok ? '' : ' ✗ ' + (m.error || '')); }).join(','));
      near(A[0], -T16, 1e-6, 'END-A on the tray end'); near(A[1], 0, 1e-6, 'END-A on the floor'); near(A[2], 0, 1e-6, 'END-A round the walls');
      assert(anvil.mates().length === 3 && anvil.mates().every(function (m) { return m.ok; }), 'three mates from one PM: ' + notes.join('; '));
      // Interference Detection (Evaluate tab): the sunk lid
      rfPPRibbon('Evaluate', /Interference/).click(); await idle(); await wait(40);
      rfPPPmOpen('Interference Detection');
      var res = UI.interferenceSession && UI.interferenceSession() ? UI.interferenceSession().results() : null;
      if (!res) { clickPmButton('Calculate'); await idle(); await wait(60); res = UI.interferenceSession().results(); }
      var pairs = (res && res.pairs || []).map(function (p) { return p.aName + ' / ' + p.bName + ' ' + rfPPF(p.volume || 0); });
      notes.push('interference ' + JSON.stringify(pairs));
      // what it finds is the box's own design (all measured, all real): each end's bend runs into the square end of the
      // tray walls (the flange's inside radius, .0061 each), the lid's bends into the wall tops (.0155), and the lid's
      // flanges lie where the ends' flanges are at the four corners (.0562 each end): the parts need corner notches
      var res0 = (res.pairs || []).map(function (p) { return [p.aName, p.bName].sort().join(' / '); }).sort();
      UI.pmCancel(); await idle();
      assert(res0.join(', ') === 'END-A<1> / LID-B16<1>, END-A<1> / TRAY-16<1>, END-B<1> / LID-B16<1>, END-B<1> / TRAY-16<1>, LID-B16<1> / TRAY-16<1>', 'the corner clashes: ' + notes.join('; '));
      (res.pairs || []).forEach(function (p) { if (/TRAY/.test(p.aName + p.bName) && /END/.test(p.aName + p.bName)) near(p.volume, 0.0061, 5e-4, p.aName + ' / ' + p.bName); });      await rfPPSaveDoc(notes, 'BOX-ASM');
      rfPPjob.box = true;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPPDone(notes);
    });

    step('rfPP: job 4, File ▸ Make Drawing from Assembly: the BOM lists the four parts, the tray with the PART NUMBER and DESCRIPTION typed in its File ▸ Properties; a double-click on a BOM cell; Save Drawing as PDF carries them', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfPPjob.box && UI.isAssembly(), 'job 4 assembly first');
      rfPPMenu('File', 'Make Drawing from Assembly'); await wait(30);
      if (modalOpen()) { notes.push('modal: ' + $('modal').textContent.replace(/\s+/g, ' ').slice(0, 120)); clickModalButton('OK'); }
      await rfPPDwDone();
      var sm = anvil.drawing.summary();
      notes.push('views ' + sm.views.map(function (v) { return v.name + ':' + (v.orient || v.kind); }).join(','));
      notes.push('bom ' + JSON.stringify(sm.bom && sm.bom.rows.map(function (r) { return [r.item, r.partNumber, r.description, r.qty]; })) + ' cols ' + JSON.stringify(sm.bom && (sm.bom.columns || sm.bom.headers)));
      assert(sm.bom && sm.bom.rows.length === 4, 'a BOM of four parts: ' + notes.join('; '));
      var tray = sm.bom.rows.filter(function (r) { return r.partNumber === '100-0042'; })[0];
      assert(tray && tray.description === 'TRAY, 16 GA CRS', 'the tray row from its File ▸ Properties: ' + notes.join('; '));
      // a double-click on a BOM cell (SolidWorks edits the cell in place): here it opens the Bill of Materials PM
      var st = UI.drawing.state, cell = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.text === 'END-A'; })[0];
      assert(cell, 'the END-A cell on the sheet');
      rfPPDwMouse('mousemove', cell.p, { buttons: 0 }); rfPPDwMouse('mousedown', cell.p); rfPPDwMouse('mouseup', cell.p); rfPPDwMouse('click', cell.p);
      rfPPDwMouse('dblclick', cell.p, { detail: 2 }); await wait(40);
      var ed = D.querySelector('#drawing-sheet input, #drawing-sheet textarea, .dw-inline-edit input, .dw-cell-edit');
      notes.push('double-click on END-A: PM ' + (UI.hasPM() && UI.pmTitle()) + ', inline editor ' + !!ed);
      for (var i = 0; i < 3 && UI.hasPM(); i++) UI.pmCancel();
      await idle();
      var pdf = (await rfPPSaved(function () { rfPPMenu('File', 'Save Drawing as PDF'); }))[0];
      notes.push('pdf ' + (pdf && pdf.name) + ' ' + (pdf && /^%PDF/.test(pdf.text || '')) + ' has 100-0042 ' + (pdf && (pdf.text || '').indexOf('100-0042') >= 0));
      assert(pdf && /^%PDF/.test(pdf.text || '') && pdf.text.indexOf('100-0042') >= 0 && pdf.text.indexOf('TRAY, 16 GA CRS') >= 0, 'the PDF carries the BOM: ' + notes.join('; '));      rfPPjob.bomEdit = notes.slice();
      rfPPjob.boxDone = true;
      UI.markClean(); anvil.drawing.close(); await idle();
      if (modalOpen()) clickModalButton("Don't Save");
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPPDone(notes);
    });
    // ---- job 5: a customer's STEP of a 14 ga U bracket (written by Anvil's own exporter from a sheet-metal part: base
    // 5 x 3, two 1.5 flanges up, a Ø.281 hole), opened as a new part, Insert Bends, flat and DXF
    var RFPP_U = 'p.name("UBRK-14").units("in");\np.sheet(' + T14 + ', ' + R14 + ', ' + K44 + ');\np.sketch("Top").rect(0, -3, 5, 3).end().baseFlange();\n' +
      'p.sketch("Top", ' + T14 + ').circle(2.5, -1.5, 0.1405).end().cut("through", { reverse: true });\n' +
      'p.flange(1.5, [[2.5, ' + T14 + ', 0], [2.5, ' + T14 + ', 3]], { position: "inside", lengthRef: "outer" });\n';
    step('rfPP: job 5, a STEP sheet-metal part: File ▸ Save As STEP of a 14 ga U bracket, File ▸ Open of that file (a new inch part, Imported1), Sheet Metal ▸ Insert Bends, the floor clicked, ✓: the blank as the original\'s, Flat to DXF with its hole and two bend lines', async function () {
      var errs0 = errors.length, notes = [];
      await rfPPNewInch(); await anvil.run(RFPP_U); await idle();
      assert(!Object.keys(rfPPErrs()).length, 'the U builds');
      var fl0 = anvil.flat(), v0 = rfPPVol();
      notes.push('original blank ' + fl0.size.map(rfPPF).join(' x ') + ' (hand 3 + 2 (1.5 − BD) = ' + rfPPF(6 - 2 * BD14) + ') volume ' + v0.toFixed(6));
      // File ▸ Save As ▸ STEP AP214: the browser download is caught at its blob
      var blobs = [], ocu = W.URL.createObjectURL, aclick = W.HTMLAnchorElement.prototype.click;
      W.URL.createObjectURL = function (b) { blobs.push(b); return ocu.call(W.URL, b); };
      W.HTMLAnchorElement.prototype.click = function () { if (this.download) blobs.push(this.download); else return aclick.call(this); };
      try {
        rfPPMenu('File', 'Save As'); await wait(30);
        assert(modalOpen(), 'the Save As dialog');
        var sel = D.querySelector('#modal select[aria-label="Save as type"]');
        setInput(sel, 'step'); await wait(10);
        clickModalButton('Save'); await idle(); await wait(40);
      } finally { W.URL.createObjectURL = ocu; W.HTMLAnchorElement.prototype.click = aclick; }
      var bl = blobs.filter(function (b) { return typeof b !== 'string'; })[0], bn = blobs.filter(function (b) { return typeof b === 'string'; })[0];
      var stp = bl ? { name: bn, text: await bl.text() } : null;
      notes.push('saved ' + (stp && stp.name) + ' ' + (stp && (stp.text || '').length) + ' chars');
      assert(stp && /ISO-10303-21/.test(stp.text || ''), 'a STEP file: ' + bn);
      var cyl = ((stp.text || '').match(/CYLINDRICAL_SURFACE/g) || []).length;
      notes.push('cylinders in the file ' + cyl);
      await UI.openFileData('UBRK-14.step', new W.TextEncoder().encode(stp.text).buffer); await idle(); await wait(60);
      if (modalOpen()) { notes.push('import modal: ' + $('modal').textContent.replace(/\s+/g, ' ').slice(0, 200)); var bs = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); }); clickModalButton(bs.filter(function (b) { return /OK|Open|Import/.test(b); })[0] || bs[0]); await idle(); await wait(60); }
      if (UI.hasPM()) { notes.push('PM after open ' + UI.pmTitle()); if (/Import/i.test(UI.pmTitle())) { await pmAccept(); await wait(40); } }
      var feats = UI.App.model.features.map(function (f) { return f.name + ':' + f.type; });
      var v1 = rfPPVol();
      notes.push('opened: units ' + UI.unitLabel() + ' features ' + feats.join(',') + ' volume ' + v1.toFixed(6) + ' errors ' + JSON.stringify(rfPPErrs()));
      assert(UI.unitLabel() === 'in' && Math.abs(v1 - v0) < 1e-3 * v0, 'the bracket read back in inches: ' + notes.join('; '));
      // Insert Bends: the floor (top face of the base, y = T) is the fixed face
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var ib = rfPPRibbon('Sheet Metal', /Insert\s*Bends/);
      assert(ib && !ib.disabled, 'Insert Bends on the ribbon');
      ib.click(); await idle(); await wait(30);
      rfPPPmOpen('Insert Bends');
      await rfPPPickAt([1, T14, 0.75], [0.2, 1, 0.4], 0.006, notes, 'floor');
      var iv = UI.pmSpec().values;
      notes.push('Insert Bends ' + JSON.stringify({ fixed: iv.fixedFace && iv.fixedFace.map(rfPPF), R: iv.bendRadius, K: iv.kFactor || iv.k }) + ' | ' + $('pm').textContent.replace(/\s+/g, ' ').slice(0, 300));
      var kf = pmField('K-factor'); if (kf) setInput(kf, K44);
      await wait(20);
      await pmAccept(); await wait(40);
      var f = rfPPLast();
      notes.push(f.name + ' ' + (rfPPErrs()[f.id] || 'ok') + ' sheet ' + JSON.stringify(UI.App.model.sheet));
      assert(f.type === 'insertBends' && !rfPPErrs()[f.id], 'Insert Bends: ' + notes.join('; '));
      var fl = anvil.flat();
      notes.push('blank ' + fl.size.map(rfPPF).join(' x ') + ' bends ' + fl.bends.length + ' loops ' + fl.loops.length);
      var xb = rfPPRibbon('Sheet Metal', /Flat to/);
      xb.click(); await wait(30);
      rfPPPmOpen('DXF/DWG Output');
      var got2 = await rfPPSaved(function () { return pmAccept(); });
      var dxf = got2[got2.length - 1], c = (await rfPPCheck()).check(dxf.text, { units: 'in' });
      notes.push('flat dxf ' + dxf.name + ' ' + JSON.stringify(c.counts));
      near(Math.max(fl.size[0], fl.size[1]), Math.max(fl0.size[0], fl0.size[1]), 1e-4, 'blank length as the original');
      near(Math.min(fl.size[0], fl.size[1]), Math.min(fl0.size[0], fl0.size[1]), 1e-4, 'blank width as the original');
      assert(fl.bends.length === 2 && c.ok && c.counts['CIRCLE@HOLES'] === 1 && c.counts['LINE@BEND'] === 2, 'the flat DXF: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPPDone(notes);
    });
    step('rfPP: this round\'s additions on a shop part: the U bracket\'s floor clicked (its context toolbar), Sheet Metal ▸ Extruded Cut opens a sketch on it, a circle by two clicks, Exit Sketch, ✓+ makes the cut and opens the next Cut-Extrude; Esc; a double-click on Cut-Extrude2 shows its dimensions on the model', async function () {
      var errs0 = errors.length, notes = [];
      await rfPPNewInch(); await anvil.run(RFPP_U); await idle();
      await rfPPPickAt([1, T14, 0.75], [0.2, 1, 0.4], 0.006, notes, 'floor');
      var ctx = UI.asmPopup && UI.asmPopup();
      notes.push('context toolbar ' + (ctx ? ctx.buttons.join(',') : 'none'));
      assert(ctx && ctx.buttons.indexOf('sketch') >= 0, 'the context toolbar on the floor: ' + notes.join('; '));
      rfPPRibbon('Sheet Metal', /Extruded Cut|Cut-Extrude/).click(); await idle(); await wait(40);
      assert(UI.App.mode === 'sketch', 'a sketch on the floor: ' + statusText());
      var c = K.to2D(UI.activePlane(), [1, T14, 0.75]);
      var grid = UI.App.view.showGrid; UI.App.view.showGrid = false; UI.App.gridStale = true;
      try {
        rfPPFrameAt(c, 3, 2); await wait(20);
        UI.setTool('circle'); await wait(20);
        await rfPPSk(c); await rfPPSk([c[0] + 0.25, c[1]]); await wait(20); rfPPKey('Escape'); await wait(20);
      } finally { UI.App.view.showGrid = grid; UI.App.gridStale = true; }
      UI.setTool('select');
      await UI.exitSketch(); await idle(); await wait(40);
      rfPPPmOpen('Cut-Extrude');
      var n0 = UI.App.model.features.length, v0 = rfPPVol(), plus = D.querySelector('#pm .pm-okplus');
      assert(plus, 'the ✓+ button');
      plus.click(); await idle(); await wait(40);
      var title = UI.hasPM() && UI.pmTitle(), cut = UI.App.model.features.filter(function (g) { return g.type === 'extrude' && g.cut; }).pop();
      notes.push('after ✓+: ' + title + ', ' + cut.name + ' removed ' + (v0 - rfPPVol()).toFixed(6) + ' (π .25² T ' + (Math.PI * 0.0625 * T14).toFixed(6) + ')');
      if (UI.hasPM()) UI.pmCancel();
      if (UI.App.mode === 'sketch') await UI.exitSketch(true);
      await idle();
      assert(title === 'Cut-Extrude' && UI.App.model.features.length >= n0 + 1, 'the cut made, the next Cut-Extrude open: ' + notes.join('; '));
      near(v0 - rfPPVol(), Math.PI * 0.0625 * T14, 1e-6, 'a Ø.5 hole through the floor only');
      var row = rfPPRow(cut.id);
      rfPPClickRow(cut.id); rfPPRowEv(row, 'mousedown', 2); rfPPRowEv(row, 'mouseup', 2); rfPPRowEv(row, 'click', 2); rfPPRowEv(rfPPRow(cut.id), 'dblclick', 2); await idle(); await wait(30);
      var shown = UI.featureDimsShown ? UI.featureDimsShown() : null;
      notes.push('double-click ' + cut.name + ': dims shown for ' + JSON.stringify(shown) + ', PM ' + (UI.hasPM() && UI.pmTitle()));
      assert(shown === cut.id && !UI.hasPM(), 'its dimensions on the model, no PM: ' + notes.join('; '));
      rfPPKey('Escape'); await wait(20);
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPPDone(notes);
    });
  })();