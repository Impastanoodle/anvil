  // --- rfOK (2026-11-18, lane shopflow7, test-reports/2026-11-18-shop-flow-7.md) --- the shop audit, round 7: more jobs
  // driven like a user (ribbon, flyouts, PropertyManagers, the ConfigurationManager, the Modify box, real mouse / key
  // events in the viewport): (1) a hat channel from one open profile, 14 ga from the gauge table, thickness reversed,
  // Bend Deduction .135 typed, a Sketch Fillet for one bend's radius, 11 ga picked, undo / redo, Save and Open; a Z with
  // a 135 and a 30 degree bend typed in the Line chain; the shop's bend deduction per gauge in Edit gauge table (fix A1);
  // (2) a tray: four Edge-Flanges in one feature, Closed Corner, Break-Corner on four faces, the flat DXF R12 / R2000;
  // (5) a bracket in three configurations, the flange length per configuration through the Modify box (fix A2), mass and
  // cut-list properties per configuration. Every setting changed is put back.
  (function () {
    var T14 = 0.0747, R09 = 0.09, K44 = 0.44;
    var rfOKjob = {};
    function rfOKBD(R, T, Kf, deg) { var A = deg * Math.PI / 180; return 2 * (R + T) * Math.tan(A / 2) - A * (R + Kf * T); }
    function rfOKScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
    function rfOKEv(type, p, mods) {
      var r = $('viewport').getBoundingClientRect();
      $('viewport').dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: W, button: 0, detail: type === 'mousemove' ? 0 : 1, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
    }
    async function rfOKClickAt(p, mods) { rfOKEv('mousemove', [p[0] + 3, p[1] + 2], Object.assign({ buttons: 0 }, mods || {})); await wait(15); rfOKEv('mousemove', p, Object.assign({ buttons: 0 }, mods || {})); await wait(15); rfOKEv('mousedown', p, mods); rfOKEv('mouseup', p, mods); rfOKEv('click', p, mods); await wait(25); }
    async function rfOKSk(uv) { await rfOKClickAt(rfOKScr(uv)); }
    function rfOKKey(k, mods) { var ev = new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {})); D.dispatchEvent(ev); return ev; }
    function rfOKRibbon(tab, re) {
      UI.setRibbonTab(tab);
      return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim()); })[0];
    }
    async function rfOKFly(tab, caretRe, itemRe) {
      UI.setRibbonTab(tab); await wait(20);
      var caret = Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret, #ribbon button'), function (b) { return caretRe.test(b.getAttribute('aria-label') || ''); })[0];
      assert(caret, 'the flyout ' + caretRe);
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var mi = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return itemRe.test(m.textContent); })[0];
      assert(mi, itemRe + ' in the flyout');
      mi.click(); await idle(); await wait(30);
    }
    function rfOKMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var hit = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name);
      hit.click(); if (UI.closeMenus) UI.closeMenus();
    }
    async function rfOKSaved(fn) {
      var got = [], sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: text }); };
      UI.download = function (name, data) { got.push(typeof data === 'string' ? { name: name, text: data } : { name: name, bytes: data }); };
      try { await fn(); await idle(); await wait(40); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    function rfOKCheck() {
      if (window.DxfCheck) return Promise.resolve(window.DxfCheck);
      return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '../headless/dxf-check.js'; s.onload = function () { res(window.DxfCheck); }; s.onerror = function () { rej(new Error('dxf-check.js did not load')); }; document.head.appendChild(s); });
    }
    function rfOKErrs() { return anvil.summary().errors || {}; }
    function rfOKByName(n) { return UI.App.model.features.filter(function (f) { return f.name === n; })[0]; }
    async function rfOKNewInch() {
      var du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    }
    function rfOKSet(key, val) {
      var el = D.querySelector('#pm [data-key="' + key + '"]');
      assert(el, 'PM field ' + key);
      if (el.type === 'checkbox') { if (!!el.checked !== !!val) el.click(); } else setInput(el, val);
    }
    function rfOKPmVal(key) { var el = D.querySelector('#pm [data-key="' + key + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value) : null; }
    function rfOKF(x) { return (+x).toFixed(6); }
    function rfOKLong(fl, w) { return Math.abs(fl.size[0] - w) < 1e-9 ? fl.size[1] : fl.size[0]; }
    function rfOKFrameAt(c, w, h) {
      var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
      UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(UI.size.w / w, UI.size.h / h));
      var o = UI.worldToScreen(K.to3D(UI.activePlane(), c[0], c[1]));
      UI.panView(UI.size.w / 2 - o[0], UI.size.h / 2 - o[1]);
      UI.updateSketches();
    }
    async function rfOKLook(P, dir, scale) {
      var c = UI.cam, d = new W.THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
      c.dir.copy(d); c.up.set(0, 1, 0); c.target.set(P[0], P[1], P[2]); c.scale = scale || 0.004;
      UI.applyCamera(); await idle(); await wait(30);
    }
    async function rfOKPickAt(pt, dir, scale, what) {
      await rfOKLook(pt, dir, scale);
      var s = UI.worldToScreen(pt), h = UI.pickFace(s[0], s[1]);
      assert(h && Math.hypot(h.point[0] - pt[0], h.point[1] - pt[1], h.point[2] - pt[2]) < 3e-3, what + ': the face at ' + JSON.stringify(pt) + ' is under the cursor: hit ' + JSON.stringify(h && h.point));
      await rfOKClickAt(s); await idle(); await wait(30);
    }
    // File > Save (into this browser), a new part, File > Open of the saved row: the same blank comes back
    async function rfOKSaveOpen(notes) {
      var name = UI.App.model.name, fl0 = anvil.flat(), n0 = UI.App.model.features.length;
      rfOKMenu('File', 'Save'); await idle(); await wait(60);
      var saveNote = modalOpen() ? $('modal').textContent.replace(/\s+/g, ' ').slice(0, 160) : 'no dialog';
      if (modalOpen()) {
        var sb = Array.prototype.filter.call(D.querySelectorAll('#modal-buttons button'), function (x) { return /^(Save|OK)$/.test(x.textContent.trim()); })[0];
        if (sb) sb.click(); else clickModalButton('Cancel');
        await idle(); await wait(40);
      }
      notes.push('Save: ' + saveNote);
      await anvil.newPart(); await idle();
      rfOKMenu('File', 'Open'); await wait(40);
      assert(modalOpen(), 'the Open dialog');
      var row = Array.prototype.filter.call(D.querySelectorAll('#modal .open-saved-text b'), function (b) { return b.textContent.trim() === String(name); })[0];
      assert(row, 'the saved part in the Open dialog: ' + name + ' | ' + notes.join('; ') + ' | rows ' + Array.prototype.map.call(D.querySelectorAll('#modal .open-saved-text b'), function (b) { return b.textContent; }).join(','));
      row.click(); await wait(30);
      if (modalOpen()) clickModalButton('Open');
      for (var i = 0; i < 80 && UI.App.model.features.length !== n0; i++) await wait(50);
      await idle(); await wait(40);
      var fl = anvil.flat();
      notes.push('saved and opened ' + name + ': ' + UI.App.model.features.length + ' features, blank ' + fl.size.map(rfOKF).join(' x '));
      near(fl.size[0], fl0.size[0], 1e-9, 'opened blank X'); near(fl.size[1], fl0.size[1], 1e-9, 'opened blank Y');
    }

    // ---- job 1: a hat channel from one open profile
    var HAT_PTS = [[0, 0], [1, 0], [1, 2], [4, 2], [4, 0], [5, 0]];
    step('rfOK: job 1, hat channel: Sheet Metal ▸ Base Flange/Tab ▸ Front Plane, five lines clicked; Depth 10, Use gauge table 14 ga, Reverse direction, Bend Allowance ▸ Bend Deduction .135 typed ✓: blank 9 + 4 T − 4 x .135; undo / redo; Sketch Fillet R.25 on one corner: that bend R.250, the blank stays (a typed BD); Edit Feature ▸ 11 ga: T and R follow; Save, Open', async function () {
      var errs0 = errors.length, notes = [];
      await rfOKNewInch();
      rfOKRibbon('Sheet Metal', /Base Flange/).click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Base Flange/Tab', 'Base Flange/Tab PM');
      clickPmButton('Front Plane'); await idle(); await wait(30);
      var grid = UI.App.view.showGrid; UI.App.view.showGrid = false; UI.App.gridStale = true;
      try {
        rfOKFrameAt([2.5, 1], 8, 5); await wait(30);
        UI.setTool('line'); await wait(20);
        for (var i = 0; i < HAT_PTS.length; i++) await rfOKSk(HAT_PTS[i]);
        rfOKKey('Escape'); await wait(30);
      } finally { UI.App.view.showGrid = grid; UI.App.gridStale = true; }
      var sk = UI.activeSketchFeature();
      assert(sk.entities.length === 5, 'five lines: ' + sk.entities.length);
      UI.setTool('select');
      await UI.exitSketch(); await idle(); await wait(40);
      assert(UI.hasPM() && UI.pmTitle() === 'Base Flange/Tab', 'the PM came back');
      rfOKSet('depth', 10); rfOKSet('useGauge', true); await wait(20);
      rfOKSet('gauge', '14'); await wait(20);
      notes.push('14 ga: T ' + rfOKPmVal('thickness') + ' R ' + rfOKPmVal('bendRadius'));
      rfOKSet('flip', true); rfOKSet('baType', 'deduction'); await wait(20);
      rfOKSet('bendDeduction', '.135'); await wait(10);
      await pmAccept(); await wait(40);
      assert(!Object.keys(rfOKErrs()).length, 'base flange: ' + JSON.stringify(rfOKErrs()));
      var fl = anvil.flat(), L = rfOKLong(fl, 10), want = 9 + 4 * T14 - 4 * 0.135;
      notes.push('blank ' + fl.size.map(rfOKF).join(' x ') + ' (9 + 4 T - 4 BD = ' + rfOKF(want) + ')');
      near(L, want, 1e-6, 'hat blank'); assert(fl.bends.length === 4, '4 bends');
      var v0 = K.massProps(UI.App.mesh, 1).volume;
      rfOKKey('z', { ctrlKey: true }); await idle(); await wait(40);
      var afterUndo = UI.App.model.features.map(function (f) { return f.name; }).join(',');
      rfOKKey('y', { ctrlKey: true }); await idle(); await wait(40);
      notes.push('undo: ' + afterUndo + '; redo: vol ' + rfOKF(K.massProps(UI.App.mesh, 1).volume));
      near(K.massProps(UI.App.mesh, 1).volume, v0, 1e-9, 'redo gives the part back');
      // one bend's radius: a Sketch Fillet in the profile (SolidWorks: an arc in the open profile is that bend's radius)
      UI.editSketch(sk.id); await idle(); await wait(30);
      rfOKFrameAt([2.5, 1], 8, 5); await wait(30);
      UI.cmdSketchFillet(); UI.pmSetField('r', '.25'); await wait(20);
      await rfOKSk([1.02, 1.98]); await wait(20);
      UI.pmOK(); await wait(20);
      await UI.exitSketch(); await idle(); await wait(40);
      fl = anvil.flat();
      var r25 = fl.bends.filter(function (b) { return /R\.250/.test(b.label); });
      notes.push('after the fillet: ' + fl.bends.map(function (b) { return b.label + ' ba ' + rfOKF(b.ba); }).join(', '));
      assert(r25.length === 1, 'one bend R.250');
      near(r25[0].ba, 2 * (0.25 + T14) - 0.135, 1e-9, 'its BA = 2 (R + T) - BD');
      near(rfOKLong(fl, 10), want, 1e-6, 'a typed BD: the blank stays');
      // 11 ga: right-click ▸ Edit Feature, the gauge list
      UI.editFeature(rfOKByName('Base-Flange1')); await idle(); await wait(30);
      rfOKSet('gauge', '11'); await wait(20);
      notes.push('11 ga: T ' + rfOKPmVal('thickness') + ' R ' + rfOKPmVal('bendRadius') + ' ' + rfOKPmVal('baType') + ' K ' + rfOKPmVal('kFactor'));
      await pmAccept(); await wait(40);
      var s11 = UI.App.model.sheet, T = s11.thickness, R = s11.bendRadius, Kf = s11.kFactor;
      near(T, 0.1196, 1e-12, '11 ga T'); near(R, 0.1196, 1e-12, '11 ga R (the table)');
      fl = anvil.flat();
      // K-factor blank: flats + BA, the filleted corner (inside, R .25) keeps its own radius
      var bd90 = function (r) { return 2 * (r + T) - Math.PI / 2 * (r + Kf * T); };
      var want11 = 9 + 4 * T - 3 * bd90(R) - bd90(0.25);
      // the filleted corner: its sketch arc R .25 is the inside face; outside sharp still at the lines' corner + T: BD(.25)
      notes.push('11 ga blank ' + fl.size.map(rfOKF).join(' x ') + ' (closed form ' + rfOKF(want11) + ')');
      near(rfOKLong(fl, 10), want11, 1e-6, '11 ga blank');
      await rfOKSaveOpen(notes);
      rfOKjob.hat = true;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    step('rfOK: job 1, a Z from one sketch: Base Flange ▸ Front Plane, the Line chain typed 3 < 0, 2 < 135, 1.5 < 105 (a 135 and a 30 degree bend), T .0747 R .09 K .44 ✓: the blank to the closed form', async function () {
      var errs0 = errors.length, notes = [];
      await rfOKNewInch();
      rfOKRibbon('Sheet Metal', /Base Flange/).click(); await wait(30);
      clickPmButton('Front Plane'); await idle(); await wait(30);
      rfOKFrameAt([2, 1], 8, 5); await wait(30);
      UI.setTool('line'); await wait(20);
      async function seg(Lt, A) {
        rfOKEv('mousemove', rfOKScr([0.5, 0.3]), { buttons: 0 }); await wait(20);
        rfOKKey(String(Lt).charAt(0)); await wait(30);
        var a = D.activeElement;
        assert(a && a.tagName === 'INPUT', 'the on-screen box opened on the first key');
        setInput(a, String(Lt)); a.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await wait(20);
        a = D.activeElement; setInput(a, String(A)); pressEnter(a); await wait(60);
      }
      await rfOKSk([0, 0]);
      await seg('3', 0); await seg('2', 135); await seg('1.5', 105);
      rfOKKey('Escape'); await wait(30); rfOKKey('Escape'); await wait(30);
      UI.setTool('select');
      await UI.exitSketch(); await idle(); await wait(40);
      rfOKSet('depth', 6); setInput(pmField('Thickness'), T14); setInput(pmField('Bend radius'), R09); setInput(pmField('K-factor'), K44); await wait(20);
      await pmAccept(); await wait(40);
      assert(!Object.keys(rfOKErrs()).length, 'Z: ' + JSON.stringify(rfOKErrs()));
      var fl = anvil.flat(), A1 = 135 * Math.PI / 180;
      var want = 6.5 - (rfOKBD(R09, T14, K44, 135) - 2 * T14 * Math.tan(A1 / 2)) - rfOKBD(R09, T14, K44, 30);
      notes.push('Z blank ' + fl.size.map(rfOKF).join(' x ') + ' (closed form ' + rfOKF(want) + '); ' + fl.bends.map(function (b) { return b.label; }).join(', '));
      near(rfOKLong(fl, 6), want, 1e-6, 'Z blank');
      assert(fl.bends.length === 2 && /135°/.test(fl.bends[0].label + fl.bends[1].label) && /30°/.test(fl.bends[0].label + fl.bends[1].label), 'a 135 and a 30 degree bend');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    step('rfOK: fix A1, a hat (the profile of job 1) by script, 14 ga: Edit Feature, Use gauge table, Edit gauge table… has a Bend deduction column: the shop types .135 for 14 ga and .21 for 11 ga; picking 14 then 11 gives Bend Deduction .135 then .21 (it used to drop a typed BD for the example K .5); the blank 9 + 4 T − 4 BD', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfOKjob.hat, 'job 1 first');
      await rfOKNewInch();
      await anvil.run('p.units("in");\np.sheet(0.0747, 0.0747, 0.5);\np.sketch("Front").polyline([[0, 0], [1, 0], [1, 2], [4, 2], [4, 0], [5, 0]], false).end().baseFlange(null, { depth: 10, flip: true });\n'); await idle();
      UI.editFeature(rfOKByName('Base-Flange1')); await idle(); await wait(30);
      rfOKSet('useGauge', true); await wait(20);
      assert(Array.prototype.some.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent.trim() === 'Edit gauge table…'; }), 'the button: ' + (UI.hasPM() && UI.pmTitle()) + ' ' + JSON.stringify(UI.App.model.sheet));
      clickPmButton('Edit gauge table…'); await wait(40);
      assert(modalOpen() && $('gt-dialog'), 'the Gauge Table dialog');
      var heads = Array.prototype.map.call(D.querySelectorAll('#gt-dialog th'), function (t) { return t.textContent; });
      notes.push('columns ' + heads.join(' | '));
      assert(heads.some(function (h) { return /Bend deduction/.test(h); }), 'a Bend deduction column');
      Array.prototype.forEach.call(D.querySelectorAll('#gt-dialog tr.grid-row'), function (tr) {
        var g = tr.querySelector('[data-col="gauge"]').value, bd = tr.querySelector('[data-col="bendDeduction"]');
        if (g === '14') setInput(bd, '.135'); if (g === '11') setInput(bd, '.21');
      });
      clickModalButton('OK'); await wait(30);
      rfOKSet('gauge', '14'); await wait(20);
      notes.push('14: ' + rfOKPmVal('baType') + ' ' + rfOKPmVal('bendDeduction'));
      assert(rfOKPmVal('baType') === 'deduction' && Math.abs(rfOKPmVal('bendDeduction') - 0.135) < 1e-9, '14 ga: BD .135 from the table');
      rfOKSet('gauge', '11'); await wait(20);
      notes.push('11: ' + rfOKPmVal('baType') + ' ' + rfOKPmVal('bendDeduction'));
      assert(rfOKPmVal('baType') === 'deduction' && Math.abs(rfOKPmVal('bendDeduction') - 0.21) < 1e-9, '11 ga: BD .21 from the table');
      await pmAccept(); await wait(40);
      var sh = UI.App.model.sheet, fl = anvil.flat();
      assert(sh.bendAllowanceType === 'deduction' && Math.abs(sh.bendDeduction - 0.21) < 1e-12, 'the sheet: ' + JSON.stringify(sh).slice(0, 200));
      near(rfOKLong(fl, 10), 9 + 4 * 0.1196 - 4 * 0.21, 1e-6, '11 ga blank with the shop BD');
      notes.push('blank ' + fl.size.map(rfOKF).join(' x '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    // ---- job 2: a tray 10 x 6, 1.5 walls
    step('rfOK: job 2, tray: a 10 x 6 base, Edge-Flange on its four edges in one feature (Material Inside, 1.5, Custom relief Obround) ✓; Closed Corner on two corners (Overlap, gap .02) ✓; Break-Corner Fillet .125 on the four walls ✓; Flat to DXF R12 and R2000: one closed outline, the fillets as ARCs, 4 BEND lines', async function () {
      var errs0 = errors.length, notes = [];
      await rfOKNewInch();
      await anvil.run('p.units("in");\np.sheet(0.0747, 0.09, 0.44);\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n'); await idle();
      UI.setView('Isometric'); await wait(30);
      rfOKRibbon('Sheet Metal', /Edge Flange/).click(); await wait(30);
      UI.setView('Isometric');
      var mids = [[5, T14, 0], [10, T14, 3], [5, T14, 6], [0, T14, 3]];
      for (var i = 0; i < 4; i++) { var e = edgeNear(mids[i]); await rfOKClickAt(UI.worldToScreen(e.mid)); await idle(); await wait(20); }
      assert(UI.pmSpec().values.edges.length === 4, 'four edges');
      rfOKSet('position', 'inside'); rfOKSet('length', 1.5); rfOKSet('useCustomRelief', true); await wait(20);
      rfOKSet('relief', 'obround'); await wait(10);
      await pmAccept(); await wait(40);
      var fl = anvil.flat(), bd = rfOKBD(R09, T14, K44, 90);
      notes.push('blank ' + fl.size.map(rfOKF).join(' x '));
      near(fl.size[0], 10 + 2 * (1.5 - bd), 1e-6, 'blank X'); near(fl.size[1], 6 + 2 * (1.5 - bd), 1e-6, 'blank Y');
      var v0 = K.massProps(UI.App.mesh, 1).volume;
      await rfOKFly('Sheet Metal', /Corner.* options/, /^Closed Corner/);
      assert(UI.hasPM() && UI.pmTitle() === 'Closed Corner', 'Closed Corner PM');
      await rfOKPickAt([0.0818, 0.8, 0.0374], [-1, 0.3, -0.2], 0.003, 'front wall end at x 0');
      await rfOKPickAt([9.9182, 0.8, 5.9626], [1, 0.3, 0.2], 0.003, 'back wall end at x 10');
      D.querySelector('#pm [data-key="cornerType:overlap"]').click(); await wait(10);
      rfOKSet('gap', '.02'); await wait(10);
      await pmAccept(); await wait(40);
      var cc = rfOKByName('Closed Corner1');
      assert(cc && cc.cornerType === 'overlap' && cc.gap === 0.02 && !rfOKErrs()[cc.id], 'Closed Corner1: ' + JSON.stringify(rfOKErrs()));
      notes.push('Closed Corner dV ' + rfOKF(K.massProps(UI.App.mesh, 1).volume - v0));
      var v1 = K.massProps(UI.App.mesh, 1).volume;
      await rfOKFly('Sheet Metal', /Corner.* options/, /^Break-Corner/);
      await rfOKPickAt([5, 1.0, 0], [0.2, 0.3, -1], 0.006, 'front wall');
      await rfOKPickAt([10, 1.0, 3], [1, 0.3, 0.2], 0.006, 'right wall');
      await rfOKPickAt([5, 1.0, 6], [0.2, 0.3, 1], 0.006, 'back wall');
      await rfOKPickAt([0, 1.0, 3], [-1, 0.3, 0.2], 0.006, 'left wall');
      D.querySelector('#pm [data-key="kind:fillet"]').click(); await wait(10); rfOKSet('size', '.125'); await wait(10);
      await pmAccept(); await wait(40);
      var bc = rfOKByName('Break-Corner1');
      assert(bc && !rfOKErrs()[bc.id], 'Break-Corner1: ' + JSON.stringify(rfOKErrs()));
      notes.push('Break-Corner dV ' + rfOKF(K.massProps(UI.App.mesh, 1).volume - v1) + ' (one corner r² (1 − π/4) T = ' + rfOKF(0.125 * 0.125 * (1 - Math.PI / 4) * T14) + ')');
      var chk = await rfOKCheck();
      var vers = ['R12', 'R2000'];
      for (var k = 0; k < vers.length; k++) {
        rfOKRibbon('Sheet Metal', /Flat to DXF/).click(); await wait(40);
        rfOKSet('version', vers[k]); rfOKSet('style', 'entities'); await wait(20);
        var got = await rfOKSaved(async function () { await pmAccept(); });
        var t = got[0] && got[0].text, c = chk.check(t, { units: 'in' });
        var acad = (/\$ACADVER\s*\r?\n\s*1\s*\r?\n(\S+)/.exec(t) || [])[1];
        notes.push(vers[k] + ' ' + acad + ' ' + JSON.stringify(c.counts));
        assert(c.ok && acad === (k ? 'AC1015' : 'AC1009'), vers[k] + ' read back: ' + JSON.stringify(c.errors || ''));
        assert((c.counts['ARC@OUTLINE'] || 0) >= 8 && (c.counts['LINE@BEND'] || 0) === 4, vers[k] + ' fillets as arcs, 4 bend lines: ' + JSON.stringify(c.counts));
        near(c.extents.max[0] - c.extents.min[0], fl.size[0], 1e-6, vers[k] + ' extents X');
      }
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    // ---- job 3 (part): a cut across a bend made in the flat
    step('rfOK: job 3, a panel 12 x 8 with two 1.5 flanges: Sheet Metal ▸ Unfold, the base clicked, Collect All Bends ✓; a 2 x 1 cut across the front bend in the unfolded state; Sheet Metal ▸ Fold, Collect All Bends ✓: the flat holds the 2 x 1 cut where it was drawn, the blank unchanged', async function () {
      var errs0 = errors.length, notes = [];
      await rfOKNewInch();
      await anvil.run('p.units("in");\np.sheet(0.0747, 0.09, 0.44);\np.sketch("Top").rect(0, -8, 12, 8).end().baseFlange();\np.flange(1.5, [[6, 0.0747, 0], [6, 0.0747, 8]], { position: "inside", lengthRef: "outer" });\n'); await idle();
      var fl0 = anvil.flat(), bd = rfOKBD(R09, T14, K44, 90);
      near(rfOKLong(fl0, 12), 8 + 2 * (1.5 - bd), 1e-6, 'blank 8 + 2 (1.5 - BD)');
      rfOKRibbon('Sheet Metal', /^Unfold/).click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Unfold', 'the Unfold PM: ' + (UI.hasPM() && UI.pmTitle()));
      await rfOKPickAt([6, T14, 4], [0.1, 1, 0.2], 0.01, 'the base, from above');
      clickPmButton('Collect All Bends'); await idle(); await wait(30);
      notes.push('Unfold: ' + statusText().slice(0, 120));
      await pmAccept(); await wait(40);
      assert(!Object.keys(rfOKErrs()).length, 'Unfold1: ' + JSON.stringify(rfOKErrs()));
      var bb = UI.App.build.body.getBounds();
      notes.push('unfolded z ' + rfOKF(bb.min[2]) + ' .. ' + rfOKF(bb.max[2]) + ' y ' + rfOKF(bb.max[1]));
      assert(bb.max[1] < 0.08, 'lies flat');
      // the cut: 2 x 1 across the front bend strip (its middle at z = zb), through all
      var zb = bb.min[2] + (1.5 - (R09 + T14)) + (Math.PI / 2 * (R09 + K44 * T14)) / 2;
      await anvil.append('p.sketch("Top").rect(5, ' + (-(zb + 0.5)) + ', 2, 1).end();\np.extrude(1, { cut: true, end: "through" });\n'); await idle();
      rfOKRibbon('Sheet Metal', /^Fold/).click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Fold', 'the Fold PM');
      clickPmButton('Collect All Bends'); await idle(); await wait(30);
      await pmAccept(); await wait(40);
      assert(!Object.keys(rfOKErrs()).length, 'Fold1: ' + JSON.stringify(rfOKErrs()));
      bb = UI.App.build.body.getBounds();
      near(bb.max[1], 1.5, 1e-6, 'folded again, walls 1.5');
      var fl = anvil.flat(), holes = fl.loops.slice(1).map(function (l) { l = l.pts || l; var b = l.reduce(function (a, p) { return [Math.min(a[0], p[0]), Math.max(a[1], p[0]), Math.min(a[2], p[1]), Math.max(a[3], p[1])]; }, [1e9, -1e9, 1e9, -1e9]); return [b[1] - b[0], b[3] - b[2]]; });
      notes.push('flat ' + fl.size.map(rfOKF).join(' x ') + ' holes ' + JSON.stringify(holes.map(function (h) { return h.map(rfOKF); })));
      near(rfOKLong(fl, 12), rfOKLong(fl0, 12), 1e-9, 'blank unchanged');
      assert(holes.length === 1, 'one cut in the blank');
      var hw = Math.max(holes[0][0], holes[0][1]), hh = Math.min(holes[0][0], holes[0][1]);
      near(hw, 2, 1e-6, 'cut 2 long'); near(hh, 1, 1e-6, 'cut 1 across the bend, as drawn in the flat');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    // ---- job 5: a family in three configurations
    step('rfOK: job 5, a bracket family: ConfigurationManager ▸ Add… BR-A, BR-B, BR-C; in BR-C and BR-B the flange length typed in the Modify box with This configuration (fix A2: it went to every configuration); All configurations; Cut-Extrude1 suppressed in BR-A only; AISI 1020: mass = density x volume and the cut-list per configuration', async function () {
      var errs0 = errors.length, notes = [], tab0 = 'tree';
      await rfOKNewInch();
      await anvil.run('p.units("in");\np.sheet(0.0747, 0.09, 0.44);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, 0.0747, 0]], { position: "inside", lengthRef: "outer" });\np.sketch("Top").circle(3, -2, 0.25).end();\np.extrude(1, { cut: true, end: "through" });\n'); await idle();
      try {
        D.querySelector('[data-tab="config"]').click(); await wait(30);
        var names = ['BR-A', 'BR-B', 'BR-C'];
        for (var i = 0; i < names.length; i++) {
          $('cfg-add').click(); await wait(30);
          var inp = D.querySelector('#modal input'); setInput(inp, names[i]); clickModalButton('OK'); await idle(); await wait(30);
        }
      } finally { D.querySelector('[data-tab="' + tab0 + '"]').click(); await wait(20); }
      var ef = rfOKByName('Edge-Flange1'), scope0 = UI.configDimScope(), i3dWas = UI.instant3DOn();
      async function typeLength(v, scope) {
        UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(40);
        UI.showFeatureDims(ef); await idle();
        var t = null;
        for (var q = 0; q < 80 && !t && !D.querySelector('#i3d-layer .i3d-handle[data-kind="fparam"]'); q++) { UI.drawDims(); await wait(25); t = D.querySelector('#i3d-layer g.i3d[data-kind="fparam"] .pe-fdim'); }
        if (!t) { UI.drawDims(); t = D.querySelector('#i3d-layer g.i3d[data-kind="fparam"] .pe-fdim'); }
        var hg = D.querySelector('#i3d-layer .i3d-handle[data-kind="fparam"]');
        assert(t || hg, 'the flange length shown on the model: shown ' + UI.featureDimsShown() + ' handles ' + JSON.stringify(anvil.instant3D().handles) + ' layer ' + D.querySelectorAll('#i3d-layer g').length + ' flanges ' + Object.keys((UI.App.build && UI.App.build.flanges) || {}).join(',') + ' ef ' + ef.id + ' same ' + (rfOKByName('Edge-Flange1') === ef) + ' mode ' + UI.App.mode + ' i3d ' + UI.instant3DOn() + ' anim ' + (UI.viewAnimating && UI.viewAnimating()) + ' sel ' + JSON.stringify(UI.App.sel) + ' fh ' + JSON.stringify((UI.instant3DFeatureHandles(ef, null) || []).map(function (x) { return x.key; })) + ' len ' + ef.length);
        if (t) t.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, button: 0, buttons: 1 }));
        else {   // the arrow itself: a press and release without moving opens its Modify box (ui-select.js)
          var sh = hg.querySelector('.i3d-shaft'), lr = D.getElementById('i3d-layer').getBoundingClientRect();
          var gx = lr.left + (+sh.getAttribute('x1') + +sh.getAttribute('x2')) / 2, gy = lr.top + (+sh.getAttribute('y1') + +sh.getAttribute('y2')) / 2;
          hg.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, button: 0, buttons: 1, clientX: gx, clientY: gy }));
          W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, view: W, button: 0, buttons: 0, clientX: gx, clientY: gy }));
        }
        await idle();
        var sc = D.querySelector('#i3d-edit .cfg-scope');
        assert(UI.instant3DEditOpen() && sc && !sc.hidden, 'the Modify box with its configuration choice');
        if (sc.getAttribute('data-scope') !== scope) sc.click();
        var shown = sc.textContent;
        await UI.instant3DEdit(String(v)); await idle(); await wait(30);
        return shown + ' -> ' + statusText();
      }
      try {
        notes.push(await typeLength(3.5, 'this'));   // BR-C is active (the last added)
        await anvil.activateConfiguration('BR-B'); await idle();
        notes.push(await typeLength(2.5, 'this'));
        var bd = rfOKBD(R09, T14, K44, 90), want = { 'BR-A': 1.5, 'BR-B': 2.5, 'BR-C': 3.5 }, vols = {};
        for (var n in want) {
          await anvil.activateConfiguration(n); await idle();
          var fl = anvil.flat(); vols[n] = K.massProps(UI.App.mesh, 1).volume;
          notes.push(n + ' blank ' + fl.size.map(rfOKF).join(' x '));
          near(rfOKLong(fl, 6), 4 + want[n] - bd, 1e-6, n + ' blank 4 + L - BD');
        }
        // All configurations
        await anvil.activateConfiguration('BR-A'); await idle();
        notes.push(await typeLength(2, 'all'));
        for (n in want) { await anvil.activateConfiguration(n); await idle(); near(rfOKLong(anvil.flat(), 6), 4 + 2 - bd, 1e-6, n + ' all: L 2'); }
        // Suppress in BR-A only (right-click ▸ Suppress: This configuration)
        await anvil.activateConfiguration('BR-A'); await idle();
        await UI.suppressFeature(rfOKByName('Cut-Extrude1').id, 'this'); await idle();
        notes.push('BR-A holes ' + (anvil.flat().loops.length - 1));
        assert(anvil.flat().loops.length === 1, 'BR-A without the hole');
        await anvil.activateConfiguration('BR-B'); await idle();
        assert(anvil.flat().loops.length === 2, 'BR-B keeps the hole');
        // mass with the library material, per configuration; the cut-list properties
        await anvil.material('AISI 1020'); await idle();
        for (n in want) {
          await anvil.activateConfiguration(n); await idle();
          var mp = anvil.mass(), cl = anvil.cutList(), vals = cl.values || {};
          near(mp.massKg, mp.volume * Math.pow(0.0254, 3) * 7900, 1e-6 * mp.massKg, n + ' mass = density x volume');
          notes.push(n + ' ' + rfOKF(mp.massKg / 0.45359237) + ' lb, BB ' + rfOKF(vals['Bounding Box Length']) + ' x ' + rfOKF(vals['Bounding Box Width']) + ', bends ' + vals.Bends + ', cut outs ' + vals['Cut Outs']);
          near(Math.max(vals['Bounding Box Length'], vals['Bounding Box Width']), 6, 1e-6, n + ' cut-list width');
        }
      } finally { UI.configDimScope(scope0); if (!i3dWas) UI.toggleInstant3D(false); }
      assert(!Object.keys(rfOKErrs()).length, JSON.stringify(rfOKErrs()));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      rfOKjob.family = true;
      return notes.join('; ');
    });

    step('rfOK: fix A4, Insert ▸ Tables ▸ Design Table left open: a double click on the flange shows its dimensions, a double click on its length adds the column D1@Edge-Flange1 (the dialog was modal: the model could not be reached); OK keeps the three configurations', async function () {
      var errs0 = errors.length, notes = [], i3dWas = UI.instant3DOn();
      assert(rfOKjob.family, 'job 5 first');
      if (!i3dWas) UI.toggleInstant3D(true);
      try {
        UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(40);
        rfOKMenu('Insert', 'Design Table'); await wait(30);
        assert(modalOpen() && $('dt-grid'), 'the Design Table dialog');
        var cols0 = UI.designTableState.grid()[0].slice();
        notes.push('columns at start ' + JSON.stringify(cols0));
        // a double click on the flange's outside face, through the open dialog
        var P = [3, 1.0, 0], s = UI.worldToScreen(P), vr = $('viewport').getBoundingClientRect(), card = $('modal-card').getBoundingClientRect();
        // the part moved below / left of the dialog card, as a user pans it
        UI.zoomView(0.6); s = UI.worldToScreen(P);
        UI.panView(Math.min(UI.size.w * 0.2, card.left - vr.left - 60) - s[0], Math.max(UI.size.h * 0.8, card.bottom - vr.top + 60) - s[1]); await idle(); await wait(30);
        s = UI.worldToScreen(P);
        notes.push('card ' + [card.left, card.top, card.right, card.bottom].map(Math.round) + ' point ' + s.map(Math.round));
        var under = D.elementFromPoint(vr.left + s[0], vr.top + s[1]);
        assert(under && under.closest && under.closest('#viewport'), 'the model is reachable under the dialog: ' + (under && (under.id || under.className)));
        rfOKEv('mousedown', s); rfOKEv('mouseup', s); rfOKEv('click', s); rfOKEv('mousedown', s); rfOKEv('mouseup', s); rfOKEv('click', s, { detail: 2 });
        under.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true, view: W, button: 0, detail: 2, clientX: vr.left + s[0], clientY: vr.top + s[1] })); await idle();
        notes.push('after the face: ' + statusText().slice(0, 100));
        var t = null;
        for (var q = 0; q < 80 && !t; q++) { UI.drawDims(); await wait(25); t = D.querySelector('#i3d-layer g.i3d[data-kind="fparam"] .pe-fdim'); }
        assert(t, 'the flange length shown on the model: ' + statusText());
        t.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, button: 0, buttons: 1 })); await idle();
        t.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true, view: W, button: 0, detail: 2 })); await idle(); await wait(20);
        var cols = UI.designTableState.grid()[0];
        notes.push('columns ' + JSON.stringify(cols) + ' | ' + statusText().slice(0, 100));
        assert(cols.indexOf('D1@Edge-Flange1') >= 0, 'the column was added');
        assert(modalOpen() && !UI.instant3DEditOpen(), 'the dialog stays, no Modify box left open');
        clickModalButton('OK'); await idle(); await wait(30);
        assert(!modalOpen(), 'applied: ' + ($('dt-msg') ? $('dt-msg').textContent : ''));
        assert(anvil.configurations().list.length === 4, 'the configurations kept: ' + JSON.stringify(anvil.configurations()));
      } finally { if (modalOpen()) clickModalButton('Cancel'); if (!i3dWas) UI.toggleInstant3D(false); }
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
  })();
