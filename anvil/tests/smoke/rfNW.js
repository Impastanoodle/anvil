  // --- rfNW (2026-11-16, lane shopflow4, test-reports/2026-11-16-shop-flow-4.md) --- the shop audit, round 4: six
  // whole jobs on INCH parts driven like a user (ribbon / menus / PropertyManagers / dialogs, clicks in the viewport):
  // (a) a bracket family by a design table, nested; (b) a sheet-metal assembly with its drawing, BOM and balloons;
  // (c) a panel with Hole Wizard holes, callouts and a hole table; (d) a customer mm part drawn in inches; (e) materials,
  // weight and Measure; (f) everyday editing mistakes. Self-contained; every setting changed is put back.
  (function () {
    var T14 = 0.0747, R14 = 0.09, K14 = 0.42;
    var rfNWjob = {};
    function rfNWBD(R, T, K) { return 2 * (R + T) - Math.PI / 2 * (R + K * T); }
    function rfNWEv(type, p, target, mods) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
    }
    function rfNWClick(p, mods) { rfNWEv('mousemove', p, null, mods); rfNWEv('mousedown', p, $('viewport'), mods); rfNWEv('mouseup', p, null, mods); }
    function rfNWKey(k, mods) { var ev = new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {})); D.dispatchEvent(ev); return ev; }
    function rfNWRibbon(tab, re) {
      UI.setRibbonTab(tab);
      return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim()); })[0];
    }
    function rfNWMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
      var hit = rows.filter(function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name + ': ' + rows.map(function (r) { return r.textContent.replace(/\s+/g, ' '); }).join(' | ').slice(0, 900));
      hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    async function rfNWSaved(fn) {
      var got = [], sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: text }); };
      UI.download = function (name, data) { got.push(typeof data === 'string' ? { name: name, text: data } : { name: name, bytes: data }); };
      try { await fn(); await idle(); await wait(30); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    function rfNWCheck() {
      if (window.DxfCheck) return Promise.resolve(window.DxfCheck);
      return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '../headless/dxf-check.js'; s.onload = function () { res(window.DxfCheck); }; s.onerror = function () { rej(new Error('dxf-check.js did not load')); }; document.head.appendChild(s); });
    }
    function rfNWErrs() { return anvil.summary().errors || {}; }
    function rfNWLast() { var fs = UI.App.model.features; return fs[fs.length - 1]; }
    function rfNWByName(n) { return UI.App.model.features.filter(function (f) { return f.name === n; })[0]; }
    async function rfNWNewInch() {
      var du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      assert(UI.unitLabel() === 'in', 'an inch part');
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    }
    function rfNWPmOpen(title) { assert(UI.hasPM() && UI.pmTitle() === title, title + ' PM: ' + (UI.hasPM() && UI.pmTitle())); }
    function rfNWSet(key, val) {
      var el = D.querySelector('#pm [data-key="' + key + '"]');
      assert(el, 'PM field ' + key + ': ' + Array.prototype.map.call(D.querySelectorAll('#pm [data-key]'), function (x) { return x.getAttribute('data-key'); }).join(','));
      if (el.type === 'checkbox') { if (!!el.checked !== !!val) el.click(); } else setInput(el, val);
    }
    function rfNWBtn(re, root) { return Array.prototype.filter.call((root || D).querySelectorAll('button'), function (b) { return re.test(b.textContent.trim()); })[0]; }
    function rfNWModalText() { return modalOpen() ? $('modal').textContent.replace(/\s+/g, ' ') : ''; }
    function rfNWF(x) { return (+x).toFixed(4); }
    function rfNWDone(notes) { if (/rfnwdump/.test(location.search)) assert(false, 'DUMP ' + notes.join('; ')); return notes.join('; '); }

    // ---- job a: a 14 ga bracket in three sizes from a Design Table (flange length, hole spacing and hole count), each
    // configuration's flat checked against the bend deduction, all three nested with quantities, one DXF per sheet
    var RFNW_A = 'p.name("BRK-14").units("in");\np.sheet(' + T14 + ', ' + R14 + ', ' + K14 + ');\n' +
      'p.sketch("Top").rect(0, -4, 8, 4).end().baseFlange();\n' +
      'p.flange(2, [[4, ' + T14 + ', 0]], { position: "inside", lengthRef: "outer", name: "Edge-Flange1" });\n' +
      'p.sketch("Top", ' + T14 + ').circle(1, -2.5, 0.1405).end().extrude(1, { cut: true, through: true, reverse: true, name: "Mount Hole" });\n' +
      'p.linearPattern({ dir: "x", spacing: 1.25, count: 4, name: "LPattern1" });\n';
    var RFNW_FAM = [['A-SM', 1.5, 1, 3], ['A-MD', 2, 1.25, 4], ['A-LG', 3, 1.5, 5]];
    function rfNWDt() { return UI.designTableState; }
    function rfNWDtCell(r, c, v) {
      var inp = D.querySelector('#dt-grid [data-r="' + r + '"][data-c="' + c + '"] input');
      assert(inp, 'design table cell ' + r + ',' + c);
      setInput(inp, String(v));
    }
    step('rfNW: job a, a bracket family: Insert ▸ Tables ▸ Design Table…, columns added from the list (flange length, hole spacing, hole count), three rows typed, OK; each configuration shown from the ConfigurationManager: the flat is 8 x (4 + L − BD) to 1e-6 and has the right number of holes', async function () {
      var errs0 = errors.length, notes = [];
      await rfNWNewInch();
      await anvil.run(RFNW_A); await idle();
      assert(!Object.keys(rfNWErrs()).length, 'BRK-14 builds: ' + JSON.stringify(rfNWErrs()));
      rfNWMenu('Insert', 'Design Table'); await wait(40);
      assert(D.getElementById('dt-dialog'), 'the Design Table dialog: ' + rfNWModalText().slice(0, 200));
      var sel = D.getElementById('dt-add-col');
      notes.push('column choices ' + Array.prototype.map.call(sel.options, function (o) { return o.value; }).join(',').slice(0, 300));
      ['D1@Edge-Flange1', 'D1@LPattern1', 'D2@LPattern1'].forEach(function (l) {
        var s = D.getElementById('dt-add-col');
        assert(Array.prototype.some.call(s.options, function (o) { return o.value === l; }), l + ' in the column list');
        s.value = l; s.dispatchEvent(new W.Event('change', { bubbles: true }));
      });
      await wait(20);
      D.getElementById('dt-add-row').click(); await wait(10);
      D.getElementById('dt-add-row').click(); await wait(10);
      var g = rfNWDt().grid();
      notes.push('grid ' + JSON.stringify(g));
      var head = g[0];
      RFNW_FAM.forEach(function (row, i) {
        rfNWDtCell(i + 1, 0, row[0]);
        rfNWDtCell(i + 1, head.indexOf('D1@Edge-Flange1'), row[1]);
        rfNWDtCell(i + 1, head.indexOf('D1@LPattern1'), row[2]);
        rfNWDtCell(i + 1, head.indexOf('D2@LPattern1'), row[3]);
      });
      D.getElementById('dt-ok').click(); await idle(); await wait(60);
      notes.push('after OK modal ' + modalOpen() + ' status ' + statusText().slice(0, 160));
      var cf = anvil.configurations();
      notes.push('configs ' + JSON.stringify(cf).slice(0, 400));
      var BD = rfNWBD(R14, T14, K14), dk = (await rfNWCheck());
      UI.setFmTab('config'); await wait(30);
      rfNWjob.aFlats = {};
      for (var i = 0; i < RFNW_FAM.length; i++) {
        var row = D.querySelector('.cfg-row[data-name="' + RFNW_FAM[i][0] + '"]');
        assert(row, 'ConfigurationManager row ' + RFNW_FAM[i][0]);
        row.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true })); await idle(); await wait(60);
        var fl = anvil.flat(), L = RFNW_FAM[i][1];
        var exp = 4 + L - BD;
        notes.push(RFNW_FAM[i][0] + ' active ' + anvil.summary().configuration + ' flat ' + fl.size.map(rfNWF).join(' x ') + ' expect 8 x ' + rfNWF(exp) + ' holes ' + (fl.loops.length - 1) + ' errs ' + JSON.stringify(rfNWErrs()));
        rfNWjob.aFlats[RFNW_FAM[i][0]] = { size: fl.size.slice(), holes: fl.loops.length - 1 };
        near(Math.max(fl.size[0], fl.size[1]), 8, 1e-6, RFNW_FAM[i][0] + ' blank length');
        near(Math.min(fl.size[0], fl.size[1]), exp, 1e-6, RFNW_FAM[i][0] + ' blank width (4 + L − BD)');
        assert(fl.loops.length - 1 === RFNW_FAM[i][3], RFNW_FAM[i][0] + ' holes ' + (fl.loops.length - 1));
      }
      UI.setFmTab('feature'); await wait(20);
      rfNWjob.aNotes = notes;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });
    step('rfNW: job a nest: Geometry Nesting, each configuration shown from the ConfigurationManager and its flat added (quantities 40, 40, 20 typed: two sheets), Nest on 48 x 96, Save DXF: one file per sheet, every part on a sheet once', async function () {
      var errs0 = errors.length, notes = [], prof = anvil.profile();
      assert(rfNWjob.aFlats, 'job a first');
      var qtys = [40, 40, 20];
      try {
        anvil.profile('mastercam'); await wait(40);
        var nb = rfNWRibbon('Transform', /Geometry Nesting/);
        assert(nb, 'Geometry Nesting on the Transform tab');
        nb.click(); await wait(40);
        rfNWPmOpen('Geometry Nesting');
        UI.setFmTab('config'); await wait(30);
        for (var i = 0; i < RFNW_FAM.length; i++) {
          var row = D.querySelector('.cfg-row[data-name="' + RFNW_FAM[i][0] + '"]');
          row.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true })); await idle(); await wait(60);
          notes.push('PM after switch ' + (UI.hasPM() && UI.pmTitle()));
          var add = rfNWBtn(/^Add flat pattern$/, $('pm'));
          assert(add, 'Add flat pattern button');
          add.click(); await wait(30);
          var q = D.querySelector('[data-key="nestqty' + i + '"]');
          assert(q, 'quantity box of part ' + i + ': ' + JSON.stringify(UI.nestState().parts.map(function (p) { return p.name; })));
          setInput(q, qtys[i]); q.dispatchEvent(new W.Event('change', { bubbles: true })); await wait(400);
        }
        UI.setFmTab('feature'); await wait(20);
        var st = UI.nestState();
        notes.push('parts ' + st.parts.map(function (p) { return p.name + ' x' + p.qty + ' ' + (p.part.size || []).map(rfNWF).join('x'); }).join(', '));
        var nest = rfNWBtn(/^Nest$/, $('pm'));
        nest.click(); for (var k = 0; k < 100 && !(UI.nestState().result); k++) await wait(50);
        await idle(); await wait(40);
        st = UI.nestState();
        var r = st.result;
        notes.push('sheets ' + (r && r.sheets.length) + ' per sheet ' + (r && r.sheets.map(function (s) { return s.placements.length; }).join('+')) + ' unplaced ' + (r && r.unplaced && r.unplaced.length));
        var got = await rfNWSaved(function () { rfNWBtn(/^Save DXF$/, $('pm')).click(); });
        var dk = await rfNWCheck(), placed = 0, circ = 0, allOk = true;
        got.forEach(function (gf) { var c = dk.check(gf.text, { units: 'in' }); allOk = allOk && c.ok; circ += c.counts['CIRCLE@CUT'] || 0; notes.push(gf.name + ' ok ' + c.ok + ' ' + JSON.stringify(c.counts)); });
        if (r) r.sheets.forEach(function (s) { placed += s.placements.length; });
        rfNWjob.aNest = { files: got.length, sheets: r && r.sheets.length, placed: placed };
        assert(r && got.length === r.sheets.length && placed === 100 && r.sheets.length >= 2 && allOk && circ === 40 * 3 + 40 * 4 + 20 * 5, 'one DXF per sheet, 100 parts placed, every hole cut once: ' + notes.join('; '));
        assert(st.parts.map(function (p) { return p.name; }).join('|') === 'BRK-14 A-SM|BRK-14 A-MD|BRK-14 A-LG', 'the parts named by configuration: ' + notes.join('; '));
        if (UI.hasPM()) UI.pmCancel();
        await idle();
      } finally { anvil.profile(prof); UI.setFmTab('feature'); await wait(30); }
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });

    // ---- job b: a tray, a cover and four of one bracket (16 ga), mated, checked, drawn with a BOM and balloons
    var T16 = 0.0598, R16 = 0.06, K16 = 0.44;
    var RFNW_HOLES = [[2, 2], [10, 2], [2, 6], [10, 6]], RFNW_TRAYH = RFNW_HOLES.concat([[6, 1], [6, 7]]);
    var RFNW_TRAY = 'p.name("TRAY-16").units("in");\np.sheet(' + T16 + ', ' + R16 + ', ' + K16 + ');\np.sketch("Top").rect(0, -8, 12, 8).end().baseFlange();\n' +
      'p.flange(2, [[6, ' + T16 + ', 0], [12, ' + T16 + ', 4], [6, ' + T16 + ', 8], [0, ' + T16 + ', 4]], { position: "inside", lengthRef: "outer" });\n' +
      'p.sketch("Top", ' + T16 + ')' + RFNW_TRAYH.map(function (h) { return '.circle(' + h[0] + ', ' + (-h[1]) + ', 0.1405)'; }).join('') + '.end().extrude(1, { cut: true, through: true, reverse: true, name: "Holes" });\n';
    var RFNW_COVER = 'p.name("COVER-16").units("in");\np.sheet(' + T16 + ', ' + R16 + ', ' + K16 + ');\np.sketch("Top").rect(0, -8, 12, 8).end().baseFlange();\n' +
      'p.sketch("Top", ' + T16 + ').circle(6, -1, 0.1405).circle(6, -7, 0.1405).end().extrude(1, { cut: true, through: true, reverse: true, name: "Holes" });\n';
    function rfNWBrk(L) {
      return 'p.name("BRK-B").units("in");\np.sheet(' + T16 + ', ' + R16 + ', ' + K16 + ');\np.sketch("Top").rect(0, -1.5, 1.5, 1.5).end().baseFlange();\n' +
        'p.flange(' + L + ', [[0.75, ' + T16 + ', 0]], { position: "inside", lengthRef: "outer", name: "Edge-Flange1" });\n' +
        'p.sketch("Top", ' + T16 + ').circle(0.75, -0.75, 0.1405).end().extrude(1, { cut: true, through: true, reverse: true, name: "Hole" });\n';
    }
    async function rfNWSaveDoc(notes) {
      await rfNWSaved(async function () {
        rfNWMenu('File', 'Save'); await wait(40);
        if (modalOpen()) { notes.push('save dialog: ' + rfNWModalText().slice(0, 120)); var bs = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); }); clickModalButton(bs.filter(function (b) { return /Save/.test(b); })[0] || bs[0]); await wait(40); }
      });
    }
    async function rfNWLook(target, dir, scale) {
      UI.cam.dir.set(dir[0], dir[1], dir[2]).normalize(); UI.cam.target.set(target[0], target[1], target[2]); UI.cam.scale = scale || 0.004; UI.applyCamera(); await idle(); await wait(30);
    }
    // aims at a world point from `dir`, clicks it if the face under the cursor is hit there (within tol)
    async function rfNWPickAt(pt, dir, scale, tol) {
      await rfNWLook(pt, dir, scale);
      var s = UI.worldToScreen(pt), h = UI.pickFace(s[0], s[1]);
      assert(h && Math.hypot(h.point[0] - pt[0], h.point[1] - pt[1], h.point[2] - pt[2]) < (tol || 2e-3), 'a face at ' + JSON.stringify(pt) + ' from ' + JSON.stringify(dir) + ': hit ' + JSON.stringify(h && h.point));
      rfNWClick(s); await idle(); await wait(30);
    }
    // a hole's wall (axis along Y at c = [x, z], radius r, y0..y1): looks in at a slant, clicks a wall point that the ray hits
    async function rfNWPickWall(c, r, y0, y1, below) {
      var ym = (y0 + y1) / 2;
      await rfNWLook([c[0], ym, c[1]], [0.45, below ? -1 : 1, 0.3], 0.0012);
      for (var a = 0; a < 32; a++) {
        var q = [c[0] + r * Math.cos(a * Math.PI / 16), ym, c[1] + r * Math.sin(a * Math.PI / 16)], s = UI.worldToScreen(q), h = UI.pickFace(s[0], s[1]);
        if (h && Math.abs(Math.hypot(h.point[0] - c[0], h.point[2] - c[1]) - r) < 2e-3 && h.point[1] > y0 + 0.2 * (y1 - y0) && h.point[1] < y1 - 0.2 * (y1 - y0)) { rfNWClick(s); await idle(); await wait(30); return true; }
      }
      assert(false, 'no visible wall of the hole at ' + JSON.stringify(c) + ' y ' + y0 + '..' + y1);
    }
    function rfNWComp(name) { return anvil.components().filter(function (c) { return c.name === name; })[0]; }
    async function rfNWMateOK(notes, what) {
      var v = UI.pmSpec().values;
      notes.push(what + ': ' + v.type + ' a ' + JSON.stringify(v.a && Object.keys(v.a)) + ' b ' + JSON.stringify(v.b && Object.keys(v.b)) + ' msg ' + String(UI.pmSpec().message || '').replace(/<[^>]+>/g, '').slice(0, 100));
      assert(v.a && v.b, what + ': two selections ' + notes[notes.length - 1]);
      await pmAccept(); await idle(); await wait(40);
    }
    step('rfNW: job b, three 16 ga parts made and saved (TRAY-16, COVER-16, BRK-B), File ▸ New ▸ Assembly, Insert Component ×6 from the saved documents (the tray fixed), each bracket mated by clicks: Coincident (its bottom on the tray floor) and Concentric (its hole on a tray hole)', async function () {
      var errs0 = errors.length, notes = [];
      var parts = [RFNW_TRAY, RFNW_COVER, rfNWBrk(1.5)];
      for (var i = 0; i < parts.length; i++) {
        await rfNWNewInch(); await anvil.run(parts[i]); await idle();
        assert(!Object.keys(rfNWErrs()).length, 'part ' + i + ' builds: ' + JSON.stringify(rfNWErrs()));
        await rfNWSaveDoc(notes);
      }
      rfNWjob.bBrkVol = K.massProps(UI.App.mesh, 1).volume;
      var du = UI.defaultUnits(); UI.setDefaultUnits('in');
      try { rfNWMenu('File', 'New ▸ Assembly'); await idle(); await wait(60); } finally { UI.setDefaultUnits(du); }
      if (modalOpen()) { notes.push('new asm modal: ' + rfNWModalText().slice(0, 120)); clickModalButton('OK'); await idle(); }
      if (UI.hasPM() && UI.pmTitle() === 'Insert Component') UI.pmCancel();
      assert(UI.isAssembly(), 'an assembly');
      notes.push('assembly units ' + UI.App.model.units);
      var ins = [['TRAY-16', [0, 0, 0]], ['COVER-16', [16, 4, 0]]];
      RFNW_HOLES.forEach(function (h, k) { ins.push(['BRK-B', [h[0] - 0.75 + 0 * k, 3, -4 - 2.5 * k]]); });
      for (i = 0; i < ins.length; i++) {
        rfNWRibbon('Assembly', /Insert Components/).click(); await idle(); await wait(30);
        rfNWPmOpen('Insert Component');
        var sel = D.querySelector('#pm select[data-key="part"]');
        var opt = Array.prototype.filter.call(sel.options, function (o) { return o.textContent.indexOf(ins[i][0]) === 0; })[0];
        assert(opt, ins[i][0] + ' among the parts to insert: ' + Array.prototype.map.call(sel.options, function (o) { return o.textContent; }).join(' | ').slice(0, 400));
        setInput(sel, opt.value); await wait(20);
        if (i) { rfNWSet('x', ins[i][1][0]); rfNWSet('y', ins[i][1][1]); rfNWSet('z', ins[i][1][2]); }
        await pmAccept(); await idle(); await wait(40);
      }
      notes.push('components ' + anvil.components().map(function (c) { return c.name + (c.fixed ? '(f)' : ''); }).join(','));
      assert(anvil.components().length === 6, 'six components');
      // each bracket: Coincident bottom face / tray floor, then Concentric hole / tray hole
      for (var k = 0; k < 4; k++) {
        var c = rfNWComp('BRK-B<' + (k + 1) + '>'), P = c.position, h = RFNW_HOLES[k];
        UI.cmdMate(); await idle(); await wait(20);
        await rfNWPickAt([P[0] + 1.1, P[1], P[2] + 1.1], [0.2, -1, -0.3], 0.004);
        await rfNWPickAt([6, T16, 4], [0.1, 1, 0.2], 0.01);
        var va = UI.pmSpec().values.a, vb = UI.pmSpec().values.b;
        if (va && vb && va.cylinder && vb.cylinder) {
          // B1 (handed on, assembly.js cylinderFromPatch): a flat face next to a bend is taken as a cylinder, so the Mate
          // PM turns Coincident into Concentric. Until it is fixed, the same two picks go in as the face refs they are.
          rfNWjob.b1 = true;
          UI.pmCancel(); await idle();
          await anvil.mate('coincident', { component: va.component, face: va.cylinder }, { component: vb.component, face: vb.cylinder }); await idle(); await wait(30);
          notes.push('bracket ' + (k + 1) + ' coincident: B1 (the picked flat faces came back as cylinders), mated by script');
        } else await rfNWMateOK(notes, 'bracket ' + (k + 1) + ' coincident');
        c = rfNWComp('BRK-B<' + (k + 1) + '>'); P = c.position;
        notes.push('after coincident y ' + rfNWF(P[1]));
        UI.cmdMate(); await idle(); await wait(20);
        await rfNWPickWall([P[0] + 0.75, P[2] + 0.75], 0.1405, P[1], P[1] + T16);
        await rfNWPickWall(h, 0.1405, 0, T16);
        await rfNWMateOK(notes, 'bracket ' + (k + 1) + ' concentric');
        c = rfNWComp('BRK-B<' + (k + 1) + '>');
        notes.push('BRK-B<' + (k + 1) + '> at ' + c.position.map(rfNWF).join(',') + ' dof ' + c.dof);
        assert(Math.abs(c.position[0] - (h[0] - 0.75)) < 1e-6 && Math.abs(c.position[1] - T16) < 1e-6 && Math.abs(c.position[2] - (h[1] - 0.75)) < 1e-6, 'bracket ' + (k + 1) + ' on its hole: ' + notes.join('; '));
      }
      // the cover: Coincident its bottom on the back flange's top edge face, Concentric two holes on the tray's free holes
      UI.cmdMate(); await idle(); await wait(20);
      await rfNWPickAt([16 + 9, 4, 4], [0.2, -1, 0.2], 0.004);
      await rfNWPickAt([6, 2, 8 - T16 / 2], [0.1, 1, 0.3], 0.0012, 5e-3);
      await rfNWMateOK(notes, 'cover coincident');
      var cv = rfNWComp('COVER-16<1>').position;
      notes.push('cover after coincident ' + cv.map(rfNWF).join(','));
      for (k = 0; k < 2; k++) {
        cv = rfNWComp('COVER-16<1>').position;
        var hc = [[6, 1], [6, 7]][k];
        UI.cmdMate(); await idle(); await wait(20);
        await rfNWPickWall([cv[0] + hc[0], cv[2] + hc[1]], 0.1405, cv[1], cv[1] + T16);
        await rfNWPickWall(hc, 0.1405, 0, T16, true);
        await rfNWMateOK(notes, 'cover concentric ' + (k + 1));
      }
      cv = rfNWComp('COVER-16<1>');
      notes.push('cover at ' + cv.position.map(rfNWF).join(',') + ' dof ' + cv.dof + ' mates ' + anvil.mates().map(function (m) { return m.name + (m.ok ? '' : ' ✗ ' + (m.error || '')); }).join(','));
      assert(Math.abs(cv.position[0]) < 1e-6 && Math.abs(cv.position[1] - 2) < 1e-6 && Math.abs(cv.position[2]) < 1e-6, 'the cover on the tray: ' + notes.join('; '));
      // Interference Detection (Evaluate tab): Calculate on the entire assembly
      var ib = rfNWRibbon('Evaluate', /Interference/);
      assert(ib, 'Interference Detection on the Evaluate tab');
      ib.click(); await idle(); await wait(60);
      rfNWPmOpen('Interference Detection');
      var calc = rfNWBtn(/^Calculate$/, $('pm')); calc.click(); await idle(); await wait(80);
      var itxt = $('pm').querySelector('.intf-list') ? $('pm').querySelector('.intf-list').textContent.replace(/\s+/g, ' ') : '';
      var ires = UI.interferenceSession && UI.interferenceSession() && UI.interferenceSession().results ? UI.interferenceSession().results() : null;
      notes.push('interference: ' + itxt.slice(0, 200) + ' msg ' + String(UI.pmSpec().message || '').replace(/<[^>]+>/g, '').slice(0, 120));
      rfNWjob.bIntf = { text: itxt, res: ires && ires.pairs ? ires.pairs.length : null };
      UI.pmCancel(); await idle();
      rfNWjob.bNotes = notes;
      assert(anvil.mates().every(function (m) { return m.ok; }), 'mates ok: ' + JSON.stringify(anvil.mates()));
      assert(/No interference/i.test(itxt + ' ' + UI.pmSpec && '') || (ires && ires.pairs && ires.pairs.length === 0) || /No interference/i.test(notes.join(' ')), 'Interference Detection clean: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });
    async function rfNWSaveAs(name, notes) {
      await rfNWSaved(async function () {
        rfNWMenu('File', 'Save'); await wait(40);
        if (modalOpen()) {
          var inp = D.querySelector('#modal input[type=text], #modal input:not([type])');
          if (inp && name) setInput(inp, name);
          notes.push('save dialog: ' + rfNWModalText().slice(0, 100));
          var bs = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); });
          clickModalButton(bs.filter(function (b) { return /Save|OK/.test(b); })[0] || bs[0]); await wait(40);
          if (modalOpen()) { notes.push('then: ' + rfNWModalText().slice(0, 100)); var b2 = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); }); clickModalButton(b2.filter(function (b) { return /Replace|Yes|OK|Save/.test(b); })[0] || b2[0]); await wait(40); }
        }
      });
    }
    async function rfNWOpenSaved(name) {
      rfNWMenu('File', 'Open…'); await wait(30);
      for (var g = 0; g < 2 && modalOpen() && !D.querySelector('#modal .open-saved'); g++) { var bq = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); }); rfNWjob.openPrompt = rfNWModalText().slice(0, 160) + ' [' + bq.join('|') + ']'; clickModalButton(bq.filter(function (b) { return /Don|Discard|^No/.test(b); })[0] || bq[0]); await wait(40); }
      var sv = Array.prototype.filter.call(D.querySelectorAll('#modal .open-saved'), function (b) { return b.getAttribute('data-name') === name; })[0];
      assert(sv, name + ' among the saved documents (' + rfNWModalText().slice(0, 200) + '): ' + Array.prototype.map.call(D.querySelectorAll('#modal .open-saved'), function (b) { return b.getAttribute('data-name'); }).join(','));
      sv.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true })); await idle(); await wait(60);
      if (modalOpen()) clickModalButton(Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); }).filter(function (b) { return /Don|No|Discard|OK/.test(b); })[0]);
      await idle(); await wait(30);
    }
    function rfNWDwBtn(re) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button, #ribbon button'), function (x) { return re.test(x.textContent.replace(/\s+/g, ' ') + ' ' + (x.title || '')); })[0]; };
      var b = find();
      if (!b) ['Annotation', 'View Layout'].some(function (t) { UI.setRibbonTab(t); b = find(); return !!b; });
      return b;
    }
    step('rfNW: job b drawing: File ▸ Save the assembly as TRAY-ASM, File ▸ Make Drawing from Assembly (three views and the isometric), a Bill of Materials TRAY-16 1 / COVER-16 1 / BRK-B 4, Auto Balloon (three balloons, the items of the BOM), File ▸ Save Drawing as PDF', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfNWjob.bNotes && UI.isAssembly(), 'job b assembly first');
      await rfNWSaveAs('TRAY-ASM', notes);
      notes.push('assembly name ' + UI.App.model.name);
      rfNWMenu('File', 'Make Drawing from Assembly'); await wait(30);
      if (modalOpen()) { notes.push('modal: ' + rfNWModalText().slice(0, 120)); clickModalButton('OK'); }
      await UI.drawing.ready(); await wait(40);
      var sm = anvil.drawing.summary();
      notes.push('views ' + sm.views.map(function (v) { return v.name + ':' + (v.orient || v.kind) + JSON.stringify(v.extents); }).join(','));
      notes.push('bom ' + JSON.stringify(sm.bom && sm.bom.rows.map(function (r) { return [r.item, r.partNumber, r.qty]; })));
      var w0 = UI.drawing.state.sheet.views[0];
      notes.push('view keys ' + Object.keys(w0).join(',') + ' view.view keys ' + Object.keys(w0.view || {}).join(','));
      var ab = rfNWDwBtn(/Auto Balloon/);
      assert(ab, 'Auto Balloon on the ribbon');
      ab.click(); await idle(); await wait(30);
      await UI.pmOK(); await idle(); await wait(40);
      sm = anvil.drawing.summary();
      notes.push('balloons ' + JSON.stringify(sm.balloons.map(function (b) { return b.item + ':' + b.component; })));
      var pdf = (await rfNWSaved(function () { rfNWMenu('File', 'Save Drawing as PDF'); }))[0];
      notes.push('pdf ' + (pdf && pdf.name) + ' ' + (pdf && /^%PDF/.test(pdf.text || '')));
      notes.push('file name ' + UI.App.fileName);
      var fw = UI.drawing.state.sheet.views.filter(function (x) { return x.view.orient === 'Front'; })[0];
      rfNWjob.bFront = fw ? String(typeof fw.content === 'string' ? fw.content : JSON.stringify(fw.content)) : '';
      notes.push('front content ' + typeof fw.content + ' ' + rfNWjob.bFront.length + ' toSheet ' + (fw.toSheet ? JSON.stringify(fw.toSheet([0, 1.5, 0])) : '-'));
      anvil.drawing.close(); await idle();
      await rfNWSaveAs('TRAY-ASM', notes);
      rfNWjob.bDraw = { views: sm.views.length, bom: sm.bom && sm.bom.rows.map(function (r) { return r.partNumber + ':' + r.qty; }).join(','), balloons: sm.balloons.length };
      assert(rfNWjob.bDraw.bom === 'TRAY-16:1,COVER-16:1,BRK-B:4', 'the BOM: ' + notes.join('; '));
      assert(sm.balloons.length === 3 && pdf && /^%PDF/.test(pdf.text || ''), 'balloons and PDF: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });
    step('rfNW: job b change: File ▸ Open BRK-B, Edit Feature on Edge-Flange1 (1.5 → 1.75) ✓, File ▸ Save; File ▸ Open TRAY-ASM: the four brackets follow (volume, mates, no interference); Make Drawing from Assembly: the BOM still BRK-B 4 and the views redrawn', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfNWjob.bDraw, 'job b drawing first');
      var asmFile = UI.App.fileName || 'TRAY-ASM';
      var vb0 = rfNWComp('BRK-B<1>').volume;
      await rfNWOpenSaved('BRK-B');
      assert(!UI.isAssembly() && UI.App.model.name === 'BRK-B', 'BRK-B open: ' + UI.App.model.name);
      var fl = rfNWByName('Edge-Flange1');
      UI.editFeature(fl); await idle(); await wait(30);
      rfNWPmOpen('Edge-Flange1');
      setInput(pmField('Length'), 1.75); await wait(10);
      await pmAccept(); await idle(); await wait(30);
      var flat = anvil.flat(), BD = rfNWBD(R16, T16, K16);
      notes.push('BRK-B flat ' + flat.size.map(rfNWF).join(' x ') + ' expect 1.5 x ' + rfNWF(1.5 + 1.75 - BD));
      near(Math.max(flat.size[0], flat.size[1]), 1.5 + 1.75 - BD, 1e-6, 'BRK-B blank');
      await rfNWSaveAs('BRK-B', notes);
      await rfNWOpenSaved(asmFile);
      assert(UI.isAssembly(), 'the assembly open again');
      var cs = anvil.components().filter(function (c) { return /^BRK-B/.test(c.name); });
      notes.push('brackets ' + cs.map(function (c) { return c.name + ' v ' + c.volume + ' at ' + c.position.map(rfNWF).join(','); }).join('; ') + ' (was v ' + vb0 + ')');
      notes.push('mates ' + anvil.mates().filter(function (m) { return !m.ok; }).map(function (m) { return m.name + ' ' + m.error; }).join(',') + ' all ok ' + anvil.mates().every(function (m) { return m.ok; }));
      var c1 = UI.App.model.components.filter(function (c) { return c.name === 'BRK-B<1>'; })[0];
      notes.push('source ' + JSON.stringify(c1 && c1.source).slice(0, 200));
      try { var sf = JSON.parse(W.localStorage.getItem('anvil.files'))['BRK-B']; notes.push('saved BRK-B flange ' + JSON.stringify(sf.model.features.filter(function (x) { return x.type === 'flange'; }).map(function (x) { return x.length; }))); } catch (e) { notes.push('saved read ' + e.message); }
      var dv = 1.5 * 0.25 * T16;
      assert(cs.length === 4 && cs.every(function (c) { return Math.abs(c.volume - (vb0 + dv)) < 2e-3; }), 'each bracket gained 1.5 x .25 x T: ' + notes.join('; '));
      rfNWMenu('File', 'Make Drawing from Assembly'); await wait(30);
      if (modalOpen()) { notes.push('modal: ' + rfNWModalText().slice(0, 120)); clickModalButton('OK'); }
      await UI.drawing.ready(); await wait(40);
      var sm = anvil.drawing.summary();
      var fw = UI.drawing.state.sheet.views.filter(function (x) { return x.view.orient === 'Front'; })[0];
      var fc = fw ? String(typeof fw.content === 'string' ? fw.content : JSON.stringify(fw.content)) : '';
      notes.push('drawing: sheets ' + (sm.sheets || []).map(function (s) { return s.name + ':' + s.views; }).join(',') + ' bom ' + JSON.stringify(sm.bom && sm.bom.rows.map(function (r) { return [r.item, r.partNumber, r.qty]; })) + ' balloons ' + sm.balloons.length + ' front changed ' + (fc !== rfNWjob.bFront) + ' ' + fc.length + ' vs ' + rfNWjob.bFront.length);
      anvil.drawing.close(); await idle();
      assert(sm.bom && sm.bom.rows.map(function (r) { return r.partNumber + ':' + r.qty; }).join(',') === 'TRAY-16:1,COVER-16:1,BRK-B:4' && sm.balloons.length === 3 && fc !== rfNWjob.bFront, 'the saved drawing follows the part: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });

    // ---- job c: an 11 ga panel with Hole Wizard holes (#10 clearance, #10 countersink, 1/4-20 tapped) and a PEM
    // mounting hole from the Design Library; the flat's DXF holes; a drawing with Hole Callouts and a Hole Table
    var T11 = 0.1196, R11 = 0.125, K11 = 0.44;
    var RFNW_C = 'p.name("PNL-11").units("in");\np.sheet(' + T11 + ', ' + R11 + ', ' + K11 + ');\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
      'p.flange(1, [[5, ' + T11 + ', 0]], { position: "inside", lengthRef: "outer", name: "Edge-Flange1" });\n';
    async function rfNWHoleWizard(spec, pts, notes) {
      rfNWRibbon('Features', /Hole Wizard/).click(); await idle(); await wait(30);
      rfNWPmOpen('Hole Wizard');
      clickPmButton('Type'); await wait(20);
      ['holeType', 'standard', 'sizeType', 'size', 'fit', 'end'].forEach(function (k) {
        if (spec[k] == null) return;
        var el = D.querySelector('#pm [data-key="' + k + '"]');
        if (!el) { notes.push('no ' + k + ' field'); return; }
        var ok = Array.prototype.some.call(el.options || [], function (o) { return o.value === spec[k]; });
        assert(ok, k + ' ' + spec[k] + ' offered: ' + Array.prototype.map.call(el.options || [], function (o) { return o.value; }).join(',').slice(0, 300));
        setInput(el, spec[k]);
      });
      await wait(20);
      var hole = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-row, #pm .pm-field, #pm div'), function (d) { return /^Hole/.test(d.textContent.trim()) && /Ø/.test(d.textContent); }).map(function (d) { return d.textContent.replace(/\s+/g, ' ').trim(); }).sort(function (a, b) { return a.length - b.length; })[0];
      notes.push(spec.holeType + ' ' + spec.size + ': PM shows "' + hole + '"');
      clickPmButton('Positions'); await wait(20);
      for (var i = 0; i < pts.length; i++) await rfNWPickAt([pts[i][0], T11, pts[i][1]], [0.1, 1, 0.25], 0.006, 5e-3);
      await pmAccept(); await idle(); await wait(30);
      var f = rfNWLast();
      notes.push(f.name + ' ' + (rfNWErrs()[f.id] || 'ok'));
      return f;
    }
    function rfNWCircles(text) {
      var lines = text.split(/\r?\n/), out = [], cur = null, layer = null;
      for (var i = 0; i + 1 < lines.length; i += 2) {
        var g = lines[i].trim(), v = lines[i + 1].trim();
        if (g === '0') { if (cur) out.push(cur); cur = v === 'CIRCLE' ? { layer: '' } : null; continue; }
        if (!cur) continue;
        if (g === '8') cur.layer = v; else if (g === '10') cur.x = +v; else if (g === '20') cur.y = +v; else if (g === '40') cur.r = +v;
      }
      if (cur) out.push(cur);
      return out;
    }
    step('rfNW: job c, an 11 ga panel: Hole Wizard from the Features tab (Type tab: Hole #10 Normal Through All, Countersink #10, Straight Tap 1/4-20 UNC Through All; Positions tab: clicks on the face), a PEM Mounting Hole from the Design Library; Flat to DXF: the holes cut at #7 (.201), .201 under the countersink, the tap drill #7 (.201) and the PEM hole', async function () {
      var errs0 = errors.length, notes = [];
      await rfNWNewInch();
      await anvil.run(RFNW_C); await idle();
      assert(!Object.keys(rfNWErrs()).length, 'PNL-11 builds');
      rfNWjob.cHoles = [];
      var h1 = await rfNWHoleWizard({ holeType: 'hole', standard: 'ANSI Inch', sizeType: 'clearance', size: '#10', fit: 'normal', end: 'through' }, [[2, 4], [3, 4]], notes);
      var h2 = await rfNWHoleWizard({ holeType: 'csk', standard: 'ANSI Inch', size: '#10', fit: 'normal', end: 'through' }, [[5, 4]], notes);
      var h3 = await rfNWHoleWizard({ holeType: 'tap', standard: 'ANSI Inch', size: '1/4-20 UNC', end: 'through' }, [[7, 4]], notes);
      notes.push('features ' + UI.App.model.features.filter(function (f) { return f.type === 'hole'; }).map(function (f) { return f.name + ' ' + JSON.stringify({ t: f.holeType, s: f.size, fit: f.fit, end: f.end }); }).join('; '));
      // the PEM mounting hole: the Design Library tile, then a click on the face (the click sets X / Y)
      UI.App.sel = null; UI.App.sel2 = null; if (UI.setSelection) UI.setSelection([]);
      if (UI.openTaskPane) UI.openTaskPane('library');
      await wait(30);
      var tile = D.querySelector('.dl-tile[data-id="pemHole"]');
      assert(tile, 'the PEM Mounting Hole tile');
      tile.click(); await idle(); await wait(30);
      notes.push('library PM ' + (UI.hasPM() && UI.pmTitle()));
      if (UI.hasPM() && UI.pmTitle() === 'PEM Mounting Hole') { await rfNWPickAt([8.5, T11, 2], [0.1, 1, 0.25], 0.01); notes.push('face picked: ' + statusText().slice(0, 100)); }
      var pemOK = false;
      if (UI.hasPM() && UI.pmTitle() === 'PEM Mounting Hole') {
        var v = UI.pmSpec().values;
        notes.push('PEM values ' + JSON.stringify(v).slice(0, 200));
        var sel = D.querySelector('#pm select');
        if (sel) { var o = Array.prototype.filter.call(sel.options, function (x) { return /^S-0420 nut$/.test(x.textContent.trim()); })[0]; if (o) setInput(sel, o.value); notes.push('PEM size ' + (o && o.textContent)); }
        await wait(20);
        var ok = D.querySelector('#pm .pm-ok');
        notes.push('PEM ✓ ' + (ok && ok.classList.contains('disabled') ? 'grey: ' + ok.title : 'live'));
        await pmAccept(); await idle(); await wait(30);
        pemOK = rfNWLast().type !== 'hole';
        notes.push('after PEM ' + rfNWLast().name + ' ' + (rfNWErrs()[rfNWLast().id] || 'ok'));
      }
      // (head, 2026-11-17) the Design Library pane opened above is closed again: left open it narrowed the graphics area for
      // every later group (rfNU's pick distances moved by a pixel and failed in each full run)
      if (UI.closeTaskPane) UI.closeTaskPane();
      rfNWjob.cPem = pemOK;
      // Flat to DXF
      var xb = rfNWRibbon('Sheet Metal', /Flat to/);
      xb.click(); await wait(30);
      rfNWPmOpen('DXF/DWG Output');
      var got = await rfNWSaved(function () { return pmAccept(); });
      var dxf = got[got.length - 1].text;
      var hdr = /\$INSUNITS\s*\n\s*70\s*\n\s*(\d+)/.exec(dxf);
      var circ = rfNWCircles(dxf).map(function (c) { return c.layer + ' Ø' + (2 * c.r).toFixed(4); });
      notes.push('flat DXF $INSUNITS ' + (hdr && hdr[1]) + ' circles ' + circ.join(', '));
      rfNWjob.cNotes = notes; rfNWjob.cCircles = circ;
      var n201 = circ.filter(function (c) { return /Ø0\.2010$/.test(c); }).length;
      assert(circ.filter(function (c) { return /Ø0\.3440$/.test(c); }).length === 1 && pemOK, 'the S-0420 PEM hole cut at .344: ' + notes.join('; '));
      assert(n201 === 4, 'four holes cut at .201 (#10 normal ×2, under the countersink, the 1/4-20 tap drill): ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });
    function rfNWPaper(p) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = anvil.drawing.summary().sheet.size[1] - p[1];
      var q = pt.matrixTransform(m);
      return { clientX: q.x, clientY: q.y };
    }
    function rfNWSheet(type, p) {
      var c = rfNWPaper(p), svg = D.querySelector('#drawing-sheet svg');
      (type === 'mousedown' ? svg : W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c.clientX, clientY: c.clientY }));
    }
    function rfNWToSheet(w, p) { var F = w.frame; return w.toSheet([p[0] * F.u[0] + p[1] * F.u[1] + p[2] * F.u[2], p[0] * F.v[0] + p[1] * F.v[1] + p[2] * F.v[2]]); }
    function rfNWSheetClick(p) { rfNWSheet('mousemove', p); rfNWSheet('mousedown', p); rfNWSheet('mouseup', p); }
    // the world centres of a Hole Wizard / cut feature's holes (its positions sketch)
    function rfNWHoleCentres(f) {
      var sk = K.findFeature(UI.App.model, f.sketch), pl = K.resolvePlane(sk.plane, UI.App.model, UI.App.build.planes);
      return sk.entities.filter(function (e) { return e.t === 'point' || e.t === 'circle'; }).map(function (e) { return e.t === 'circle' ? { p: K.to3D(pl, e.cx, e.cy), r: e.r } : { p: K.to3D(pl, e.x, e.y) }; });
    }
    step('rfNW: job c drawing: File ▸ Make Drawing from Part, Hole Callout (Annotation tab) clicked on each kind of hole in the Top view and placed: 2X Ø.201 THRU ALL, the countersink, the tapped hole, the PEM hole; a Hole Table on the Top view', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfNWjob.cNotes && UI.App.model.name === 'PNL-11', 'job c panel first');
      rfNWMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) { notes.push('modal: ' + rfNWModalText().slice(0, 120)); clickModalButton('OK'); }
      await UI.drawing.ready(); await wait(40);
      var tv = UI.drawing.state.sheet.views.filter(function (x) { return x.view.orient === 'Top'; })[0];
      assert(tv, 'a Top view: ' + anvil.drawing.summary().views.map(function (v) { return v.orient || v.kind; }).join(','));
      var holes = UI.App.model.features.filter(function (f) { return f.type === 'hole' || (f.type === 'extrude' && f.cut && f.sketch && /PEM|Cut-Extrude/.test(f.name)); });
      notes.push('holes ' + holes.map(function (h) { return h.name; }).join(','));
      try {
      var hb = rfNWDwBtn(/Hole Callout/);
      assert(hb, 'Hole Callout on the ribbon');
      var texts = [];
      for (var i = 0; i < holes.length; i++) {
        var cs = rfNWHoleCentres(holes[i]), c0 = cs[0];
        var r = c0.r || ({ hole: 0.1005, csk: 0.1925, tap: 0.1005 })[holes[i].holeType] || 0.1;
        if (holes[i].holeType === 'csk') r = 0.1925;
        hb.click(); await wait(20);
        var e = rfNWToSheet(tv, [c0.p[0] + r, c0.p[1], c0.p[2]]), ctr = rfNWToSheet(tv, c0.p);
        var n0 = anvil.drawing.summary().annotations.filter(function (a) { return a.type === 'holeCallout'; }).length;
        rfNWSheetClick(e); await wait(30);
        rfNWSheetClick([ctr[0] + 15, ctr[1] + 12 + 6 * i]); await wait(40);
        var an = anvil.drawing.summary().annotations.filter(function (a) { return a.type === 'holeCallout'; }).slice(n0);
        texts.push(holes[i].name + ' → ' + JSON.stringify(an.map(function (a) { return a.text; })));
        rfNWKey('Escape'); rfNWKey('Escape'); await wait(20);
      }
      notes.push('callouts: ' + texts.join(' | '));
      var org = tv.toSheet([0, T11, 6]);
      var F = tv.frame, uvs = [[0, T11, 0], [10, T11, 0], [0, T11, 6], [10, T11, 6]].map(function (p) { return [K.vec.dot(p, F.u), K.vec.dot(p, F.v)]; });
      uvs.sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]); });
      notes.push('origin ' + JSON.stringify(uvs[0]));
      var ht = anvil.drawing.holeTable(tv.view.id, { origin: { p: uvs[0] }, all: true }); await UI.drawing.ready(); await wait(30);
      var tabs = anvil.drawing.holeTables();
      notes.push('hole table ' + String(JSON.stringify(ht)).slice(0, 160) + ' rows ' + String(JSON.stringify(tabs && tabs[0] && tabs[0].rows.map(function (q) { return [q.tag, q.x, q.y, q.size]; }))).slice(0, 900) + ' status ' + statusText().slice(0, 160));
      rfNWjob.cDraw = { texts: texts, table: tabs[0] };
      var want = ['[\"2X Ø .201 THRU ALL\"]', '[\"Ø .201 THRU ALL ⌵ Ø .385 X 82°\"]', '[\"Ø .201 THRU ALL 1/4-20 UNC THRU ALL\"]', '[\"Ø.344 THRU ALL\"]'];
      texts.forEach(function (x, i) { assert(x.slice(x.indexOf('→ ') + 2) === want[i], 'callout ' + i + ' as SolidWorks writes it (test-reports/2026-11-02-solidworks-reference-2.md): ' + x); });
      assert(tabs[0] && tabs[0].rows.length === 5, 'a Hole Table row per hole: ' + notes.join('; '));
      } catch (ex) { assert(false, 'EXC ' + (ex.stack || ex).toString().slice(0, 600) + ' :: ' + notes.join('; ')); }
      anvil.drawing.close(); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });

    // ---- job d: a customer bracket modelled in mm (2 mm steel) that the shop draws and cuts in inches
    var RFNW_D = 'p.name("CUST-2MM").units("mm");\np.material("AISI 1020");\np.sheet(2, 2, 0.44);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange();\n' +
      'p.flange(30, [[50, 2, 0]], { position: "inside", lengthRef: "outer", name: "Edge-Flange1" });\n' +
      'p.sketch("Top", 2).circle(20, -40, 3.3).circle(80, -40, 3.3).end().extrude(1, { cut: true, through: true, reverse: true, name: "Holes" });\n';
    function rfNWHeader(dxf, name) { var m = new RegExp('\\$' + name + '\\s*\\n\\s*\\d+\\s*\\n\\s*([^\\n\\r]+)').exec(dxf); return m ? m[1].trim() : null; }
    function rfNWExtents(dxf) {
      var lines = dxf.split(/\r?\n/), xs = [], ys = [], inEnt = false, lay = '', px = [], py = [];
      function flush() { if (lay === 'OUTLINE') { xs = xs.concat(px); ys = ys.concat(py); } px = []; py = []; }
      for (var i = 0; i + 1 < lines.length; i += 2) {
        var g = lines[i].trim(), v = lines[i + 1].trim();
        if (g === '2' && v === 'ENTITIES') inEnt = true;
        if (!inEnt) continue;
        if (g === '0') { flush(); lay = ''; continue; }
        if (g === '8') lay = v;
        if (g === '10' || g === '11') px.push(+v); else if (g === '20' || g === '21') py.push(+v);
      }
      flush();
      return { w: Math.max.apply(null, xs) - Math.min.apply(null, xs), h: Math.max.apply(null, ys) - Math.min.apply(null, ys), digits: Math.max.apply(null, lines.filter(function (l) { return /^-?\d+\.\d+$/.test(l.trim()); }).map(function (l) { return l.trim().split('.')[1].length; })) };
    }
    step('rfNW: job d, a customer part in mm (2 mm steel, AISI 1020): Flat to DXF in mm ($INSUNITS 4, $MEASUREMENT 1, the blank 100 x (60 + 30 − BD) to 1e-9); Tools ▸ Units: inches (IPS) on the open part, then Make Drawing (material and thickness in the title block) and Flat to DXF in inches ($INSUNITS 1, $MEASUREMENT 0, the DXF the same size as the flat the part shows)', async function () {
      var errs0 = errors.length, notes = [], du = UI.defaultUnits();
      UI.setDefaultUnits('mm');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      await anvil.run(RFNW_D); await idle();
      assert(!Object.keys(rfNWErrs()).length && UI.App.model.units === 'mm', 'CUST-2MM builds in mm: ' + JSON.stringify(rfNWErrs()));
      var flMM = anvil.flat(), volMM = K.massProps(UI.App.mesh, 1).volume, BD = rfNWBD(2, 2, 0.44);
      notes.push('mm flat ' + flMM.size.map(rfNWF).join(' x ') + ' (100 x ' + rfNWF(60 + 30 - BD) + ')');
      rfNWRibbon('Sheet Metal', /Flat to/).click(); await wait(30);
      rfNWPmOpen('DXF/DWG Output');
      var gmm = await rfNWSaved(function () { return pmAccept(); });
      var dmm = gmm[gmm.length - 1].text, exm = rfNWExtents(dmm);
      notes.push('mm dxf $INSUNITS ' + rfNWHeader(dmm, 'INSUNITS') + ' $MEASUREMENT ' + rfNWHeader(dmm, 'MEASUREMENT') + ' outline ' + exm.w.toFixed(9) + ' x ' + exm.h.toFixed(9));
      assert(rfNWHeader(dmm, 'INSUNITS') === '4' && rfNWHeader(dmm, 'MEASUREMENT') === '1' && Math.abs(Math.max(exm.w, exm.h) - 100) < 1e-9 && Math.abs(Math.min(exm.w, exm.h) - (90 - BD)) < 1e-9, 'the mm flat DXF: ' + notes.join('; '));
      rfNWMenu('Tools', 'Units: inches (IPS)'); await idle(); await wait(40);
      if (modalOpen()) { notes.push('units modal: ' + rfNWModalText().slice(0, 200)); var bs = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); }); clickModalButton(bs.filter(function (b) { return /OK|Change|Yes|Convert|Keep/.test(b); })[0] || bs[0]); await idle(); await wait(40); }
      var m = UI.App.model, flIN = anvil.flat(), volIN = K.massProps(UI.App.mesh, 1).volume;
      notes.push('units ' + m.units + ' label ' + UI.unitLabel() + ' sheet ' + JSON.stringify(m.sheet) + ' flat ' + flIN.size.map(function (x) { return x.toFixed(9); }).join(' x ') + ' vol ratio ' + (volMM / volIN).toFixed(6));
      var sx = flMM.size[0] / 25.4, sy = flMM.size[1] / 25.4;
      rfNWjob.dUnits = { units: m.units, ok: Math.abs(flIN.size[0] - sx) < 1e-9 && Math.abs(flIN.size[1] - sy) < 1e-9 };
      // the drawing
      rfNWMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) { notes.push('modal: ' + rfNWModalText().slice(0, 120)); clickModalButton('OK'); }
      await UI.drawing.ready(); await wait(40);
      var svg = anvil.drawing.svg(), txt = (svg.match(/<text[^>]*>[^<]*<\/text>/g) || []).map(function (s) { return s.replace(/<[^>]+>/g, ''); });
      notes.push('drawing units ' + (anvil.drawing.summary().units || anvil.drawing.summary().sheet.units) + ' texts with MAT/THK/GA ' + JSON.stringify(txt.filter(function (s) { return /MAT|1020|THICK|THK|GA|\.079|2 ?MM/i.test(s); }).slice(0, 12)));
      var dp = D.querySelector('#ribbon button[title*="Document Properties"], #ribbon-buttons button[title*="Document Properties"]');
      notes.push('Document Properties button ' + !!dp);
      rfNWjob.dTitle = txt;
      anvil.drawing.close(); await idle();
      // flat DXF
      rfNWRibbon('Sheet Metal', /Flat to/).click(); await wait(30);
      rfNWPmOpen('DXF/DWG Output');
      notes.push('DXF PM ' + JSON.stringify(UI.pmSpec().values).slice(0, 200));
      var got = await rfNWSaved(function () { return pmAccept(); });
      var dxf = got[got.length - 1].text, ex = rfNWExtents(dxf);
      notes.push('dxf $INSUNITS ' + rfNWHeader(dxf, 'INSUNITS') + ' $MEASUREMENT ' + rfNWHeader(dxf, 'MEASUREMENT') + ' extents ' + ex.w.toFixed(9) + ' x ' + ex.h.toFixed(9) + ' vs ' + sx.toFixed(9) + ' x ' + sy.toFixed(9) + ' digits ' + ex.digits);
      rfNWjob.dNotes = notes;
      // D1 (handed on, ui-panels.js Tools ▸ Units): the change relabels the numbers instead of converting them, so the 100 mm
      // bracket becomes 100 in. Until it converts, the inch DXF is checked against the flat the part now shows.
      if (!rfNWjob.dUnits.ok) notes.push('D1: Tools ▸ Units relabels (flat ' + flIN.size.map(rfNWF).join(' x ') + ' in, should be ' + rfNWF(sx) + ' x ' + rfNWF(sy) + ')');
      var fx = rfNWjob.dUnits.ok ? [sx, sy] : flIN.size;
      assert(m.units === 'in' && /AISI 1020/.test(txt.join('|')) && /THICKNESS/.test(txt.join('|')), 'inch document, the material in the title block: ' + notes.join('; '));
      assert(rfNWHeader(dxf, 'INSUNITS') === '1' && rfNWHeader(dxf, 'MEASUREMENT') === '0' && Math.abs(Math.max(ex.w, ex.h) - Math.max(fx[0], fx[1])) < 1e-9 && Math.abs(Math.min(ex.w, ex.h) - Math.min(fx[0], fx[1])) < 1e-9, 'the flat DXF in inches: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });

    // ---- job e: materials from the library, weight in lb, the title block's linked material and weight, Measure
    var RFNW_E = 'p.name("WT-11").units("in");\np.sheet(' + T11 + ', ' + R11 + ', ' + K11 + ');\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
      'p.flange(1, [[5, ' + T11 + ', 0]], { position: "inside", lengthRef: "outer", name: "Edge-Flange1" });\n' +
      'p.sketch("Top", ' + T11 + ').circle(3, -4, 0.25).end().extrude(1, { cut: true, through: true, reverse: true, name: "Hole" });\n';
    async function rfNWMaterial(name, notes) {
      var mrow = D.querySelector('#tree .material-row');
      assert(mrow, 'the Material row in the FeatureManager');
      mrow.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true })); await wait(40);
      assert(D.getElementById('mat-dialog'), 'Edit Material from a double-click on the Material row');
      var it = D.querySelector('#mat-dialog .mat-item[data-material="' + name + '"]');
      if (!it) { Array.prototype.forEach.call(D.querySelectorAll('#mat-dialog .mat-class:not(.open)'), function (c) { c.click(); }); await wait(20); it = D.querySelector('#mat-dialog .mat-item[data-material="' + name + '"]'); }
      assert(it, name + ' in the material library');
      it.click(); await wait(20);
      D.getElementById('mat-apply').click(); await idle(); await wait(40);
      if (modalOpen()) { var c = D.getElementById('mat-close'); if (c) c.click(); else UI.closeModal(); }
      await idle();
    }
    function rfNWLb(volIn3, rho) { return volIn3 * Math.pow(0.0254, 3) * rho / 0.45359237; }
    step('rfNW: job e, materials and weight: Edit ▸ Material (AISI 1018 cold rolled, then 5052-H32, then AISI 304) on an 11 ga panel; Tools ▸ Mass Properties reads pounds = in³ × density; the drawing title block\'s MATERIAL and WEIGHT follow each change', async function () {
      var errs0 = errors.length, notes = [];
      await rfNWNewInch();
      await anvil.run(RFNW_E); await idle();
      var vol = K.massProps(UI.App.mesh, 1).volume;
      notes.push('volume ' + vol.toFixed(6) + ' in³');
      var mats = [['AISI 1018 Steel, cold rolled', 7870], ['5052-H32', 2680], ['AISI 304', 8000]], seen = [];
      for (var i = 0; i < mats.length; i++) {
        await rfNWMaterial(mats[i][0], notes);
        notes.push('material ' + anvil.material());
        rfNWMenu('Tools', 'Mass Properties'); await wait(60);
        var mt = rfNWModalText() || ($('pm') && UI.hasPM() ? $('pm').textContent.replace(/\s+/g, ' ') : '');
        var lbm = /Mass\s*=?\s*([\d.,]+)\s*(pounds|lb)/i.exec(mt), lb = rfNWLb(vol, mats[i][1]);
        notes.push(mats[i][0] + ': dialog "' + mt.slice(0, 160) + '" expect ' + lb.toFixed(4) + ' lb');
        seen.push({ got: lbm ? +lbm[1].replace(/,/g, '') : null, want: lb });
        if (modalOpen()) { var bs = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); }); clickModalButton(bs.filter(function (b) { return /Close|OK/.test(b); })[0] || bs[0]); }
        if (UI.hasPM() && UI.pmTitle() === 'Mass Properties') UI.pmCancel();
        await idle();
        // the drawing: its title block
        rfNWMenu('File', 'Make Drawing from Part'); await wait(30);
        if (modalOpen()) clickModalButton('OK');
        await UI.drawing.ready(); await wait(40);
        var txt = (anvil.drawing.svg().match(/<text[^>]*>[^<]*<\/text>/g) || []).map(function (s) { return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'); });
        var mi = txt.indexOf('MATERIAL'), wi = txt.indexOf('WEIGHT');
        notes.push('title block: ' + JSON.stringify(txt.filter(function (s) { return /1018|5052|304|lb|LB|\d\.\d{2,}/.test(s); }).slice(0, 8)));
        seen[i].title = txt.join('|');
        anvil.drawing.close(); await idle();
      }
      rfNWjob.eSeen = seen;
      seen.forEach(function (s, k) {
        assert(s.got != null && Math.abs(s.got - s.want) < 0.0005 + 1e-4 * s.want, mats[k][0] + ' mass in lb: ' + notes.join('; '));
        assert(s.title.indexOf(mats[k][0].replace(/, cold rolled/, '')) >= 0 || s.title.indexOf(mats[k][0]) >= 0, mats[k][0] + ' in the title block: ' + notes.join('; '));
      });
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });
    step('rfNW: job e, Measure (Evaluate tab): the base\'s top and bottom faces (Ctrl+click) read the thickness .1196 (0.12 at 3 places); the Ø.5 hole\'s edge and the front edge read the hole centre to the edge, 2.000', async function () {
      var errs0 = errors.length, notes = [];
      assert(UI.App.model.name === 'WT-11', 'job e part first');
      try {
      var mb = rfNWRibbon('Evaluate', /^Measure|Measure$/);
      assert(mb, 'Measure on the Evaluate tab');
      mb.click(); await idle(); await wait(30);
      rfNWPmOpen('Measure');
      await rfNWPickAt([7, T11, 3], [0.1, 1, 0.25], 0.01);
      await rfNWLook([7, 0, 3], [0.1, -1, 0.25], 0.01);
      var s = UI.worldToScreen([7, 0, 3]); rfNWClick(s, { ctrlKey: true }); await idle(); await wait(30);
      var t1 = $('pm').textContent.replace(/\s+/g, ' ');
      notes.push('faces: ' + t1.slice(t1.indexOf('Results'), t1.indexOf('Results') + 260));
      UI.App.sel = null; UI.App.sel2 = null; if (UI.setSelection) UI.setSelection([]); await wait(20);
      // the hole wall, then Ctrl+click the panel's front top edge (z = 6)
      await rfNWLook([3, T11, 4], [0.1, 1, 0.6], 0.003);
      var rim = edgeNear([3, T11, 4.25]), sr = UI.worldToScreen(rim.mid);
      rfNWClick(sr); await idle(); await wait(30);
      if (!UI.App.sel) { await wait(400); rfNWClick(sr); await idle(); await wait(30); notes.push('(clicked the rim twice)'); }
      notes.push('wall click: sel ' + JSON.stringify(UI.App.sel && { kind: UI.App.sel.kind, index: UI.App.sel.index }) + ' filter ' + JSON.stringify(UI.selectionFilter ? UI.selectionFilter() : null));
      await rfNWLook([6, T11, 6], [0.1, 1, 0.6], 0.004);
      var ee = edgeNear([6, T11, 6]), se = UI.worldToScreen(ee.mid);
      rfNWClick(se, { ctrlKey: true }); await idle(); await wait(30);
      var t2 = $('pm').textContent.replace(/\s+/g, ' ');
      notes.push('hole + edge: sel ' + JSON.stringify([UI.App.sel && UI.App.sel.kind, UI.App.sel2 && UI.App.sel2.kind]) + ' ' + t2.slice(t2.indexOf('Results'), t2.indexOf('Results') + 300));
      var se2 = UI.App.sel && UI.App.sel.edge;
      notes.push('first pick ' + JSON.stringify(se2 && { faces: se2.faces, surf: se2.faces && se2.faces.map(function (fi) { var fc = UI.App.mesh.faces[fi]; return fc && fc.polys && fc.polys[0] && fc.polys[0].surf ? JSON.stringify(fc.polys[0].surf).slice(0, 160) : null; }) }));
      rfNWjob.eMeasure = [t1, t2];
      UI.pmCancel(); await idle();
      } catch (ex) { if (/^EXC|assert/i.test(String(ex && ex.message))) throw ex; assert(false, 'EXC ' + (ex.stack || ex).toString().slice(0, 500) + ' :: ' + notes.join('; ')); }
      assert(/Parallel distance\s*0\.12 in/.test(t1), 'the thickness (.1196 at the measure\'s 3 places): ' + notes.join('; '));
      assert(/Circle Ø0?\.5(?!\d)/.test(t2) && /Center distance\s*2 in/i.test(t2), 'hole centre to the edge (z 4 to 6): ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });

    // ---- job f: everyday mistakes on a 16 ga bracket (base 6 x 4, Flange A with a hem, Hole 1 near the right end)
    var RFNW_F = 'p.name("OOPS-16").units("in");\np.sheet(' + T16 + ', ' + R16 + ', ' + K16 + ');\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(2, [[3, ' + T16 + ', 0]], { position: "inside", lengthRef: "outer", name: "Flange A" });\n' +
      'p.hem(0.375, [[3, 2, 0]], { name: "Hem1" });\n' +
      'p.sketch("Top", ' + T16 + ').circle(5, -2.5, 0.1405).end().extrude(1, { cut: true, through: true, reverse: true, name: "Hole 1" });\n';
    function rfNWNames() { return UI.App.model.features.map(function (f) { return f.name + (f.suppressed ? '(s)' : ''); }).join(','); }
    function rfNWVol() { return K.massProps(UI.App.mesh, 1).volume; }
    step('rfNW: job f, mistakes: Delete the sketch Hole 1 is cut from (Confirm Delete names Hole 1), Ctrl+Z; Edit Sketch on the base (6 → 4 wide) so Hole 1 falls off the part: the FeatureManager and What\'s Wrong say so and Edit there fixes it; Ctrl+Z', async function () {
      var errs0 = errors.length, notes = [];
      await rfNWNewInch();
      await anvil.run(RFNW_F); await idle();
      assert(!Object.keys(rfNWErrs()).length, 'OOPS-16 builds: ' + JSON.stringify(rfNWErrs()));
      var vol0 = rfNWVol(), script0 = anvil.script(), names0 = rfNWNames();
      rfNWjob.f0 = { vol: vol0, script: script0, names: names0 };
      notes.push('features ' + names0);
      // 1. Delete the hole's sketch (FeatureManager right-click ▸ Delete)
      var h1 = rfNWByName('Hole 1'), hs = K.findFeature(UI.App.model, h1.sketch);
      UI.deleteFeature(hs.id); await wait(30);
      var dt = rfNWModalText();
      notes.push('delete ' + hs.name + ': ' + dt.slice(0, 260));
      assert(/Hole 1/.test(dt), 'Confirm Delete names Hole 1, cut from the sketch: ' + dt);
      clickModalButton('Delete'); await idle(); await wait(30);
      notes.push('after delete: ' + rfNWNames() + ' errors ' + JSON.stringify(rfNWErrs()));
      rfNWKey('z', { ctrlKey: true }); await idle(); await wait(30);
      notes.push('Ctrl+Z: ' + rfNWNames() + ' errors ' + JSON.stringify(rfNWErrs()));
      assert(rfNWNames() === names0 && Math.abs(rfNWVol() - vol0) < 1e-9, 'Ctrl+Z brings the sketch and Hole 1 back: ' + notes.join('; '));
      // 2. Edit Sketch on the base flange's sketch: 6 → 4 wide, Hole 1 (x = 5) is now off the part
      var bs = UI.App.model.features[0];
      notes.push('undo depth ' + UI.App.undo.length);
      UI.editSketch(bs.id); await idle(); await wait(30);
      assert(UI.App.mode === 'sketch', 'editing ' + bs.name);
      var sk = UI.activeSketchFeature();
      notes.push('base sketch ' + JSON.stringify(sk.entities).slice(0, 160));
      UI.pushUndo();   // (what the dimension edit does: one undo step)
      sk.entities.forEach(function (e) { if (e.t === 'rect') e.w = 4; else { ['x1', 'x2'].forEach(function (k) { if (e[k] != null && Math.abs(e[k] - 6) < 1e-9) e[k] = 4; }); } });
      UI.updateSketches();
      await UI.exitSketch(); await idle(); await wait(40);
      var errs = rfNWErrs(), warns = anvil.summary().warnings || {};
      var row = D.querySelector('#tree .ti[data-fid="' + h1.id + '"]');
      notes.push('after the edit: errors ' + JSON.stringify(errs) + ' warnings ' + JSON.stringify(warns) + ' Hole 1 row ' + (row ? row.className + ' "' + (row.title || '').slice(0, 120) + '"' : 'none') + ' status ' + statusText().slice(0, 140));
      notes.push('undo depth after the edit ' + UI.App.undo.length);
      UI.whatsWrong(); await wait(30);
      var ww = Array.prototype.map.call(D.querySelectorAll('#whats-wrong .ww-row'), function (r) { return r.textContent.replace(/\s+/g, ' ').trim(); });
      notes.push('What\'s Wrong: ' + JSON.stringify(ww));
      var hr = D.querySelector('#whats-wrong .ww-row[data-id="' + h1.id + '"]');
      rfNWjob.fWW = { rows: ww, hole: !!hr };
      if (hr) {
        notes.push('Hole 1 row buttons ' + Array.prototype.map.call(hr.querySelectorAll('button'), function (b) { return b.textContent; }).join('/'));
        var esb = hr.querySelector('.ww-edit-sketch');
        assert(esb, 'What\'s Wrong offers Edit Sketch for Hole 1: ' + notes.join('; '));
        esb.click(); await idle(); await wait(40);
        var hk = UI.activeSketchFeature();
        notes.push('Edit Sketch opens ' + (UI.App.mode === 'sketch' && hk ? hk.name : UI.App.mode));
        assert(hk && hk.id === h1.sketch, 'the hole\'s sketch open: ' + notes.join('; '));
        UI.pushUndo();   // (the circle dragged back on the part: one undo step)
        hk.entities.forEach(function (e) { if (e.t === 'circle') e.cx = 3; });
        UI.updateSketches();
        await UI.exitSketch(); await idle(); await wait(40);
        notes.push('fixed there: errors ' + JSON.stringify(rfNWErrs()));
        assert(!Object.keys(rfNWErrs()).length, 'Hole 1 rebuilds once its sketch is fixed: ' + notes.join('; '));
      } else if (modalOpen()) clickModalButton('Close');
      if (modalOpen()) clickModalButton('Close');
      rfNWKey('z', { ctrlKey: true }); await idle(); await wait(30);
      notes.push('Ctrl+Z: errors ' + JSON.stringify(rfNWErrs()));
      rfNWKey('z', { ctrlKey: true }); await idle(); await wait(30);
      notes.push('Ctrl+Z: errors ' + JSON.stringify(rfNWErrs()) + ' volume back ' + (Math.abs(rfNWVol() - vol0) < 1e-9));      rfNWjob.fNotes = notes;
      assert(hr, 'What\'s Wrong lists Hole 1 once it is off the part: ' + notes.join('; '));
      assert(!Object.keys(rfNWErrs()).length && Math.abs(rfNWVol() - vol0) < 1e-9, 'Ctrl+Z undoes the sketch edit: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });
    step('rfNW: job f, Suppress Flange A (Hem1 is on its edge: suppressed with it, no error), Unsuppress, Unsuppress with Dependents; Ctrl+Z through all of it to the start; File ▸ Save, File ▸ New, File ▸ Open: the same part', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfNWjob.f0 && UI.App.model.name === 'OOPS-16', 'job f part first');
      var A = rfNWByName('Flange A'), H = rfNWByName('Hem1'), vol0 = rfNWjob.f0.vol;
      var d0 = UI.App.undo.length;
      await UI.setSuppression([A.id], true); await idle(); await wait(30);
      notes.push('suppress Flange A: ' + rfNWNames() + ' suppressed ' + JSON.stringify(anvil.suppressed && anvil.suppressed()) + ' errors ' + JSON.stringify(rfNWErrs()) + ' warnings ' + JSON.stringify(anvil.summary().warnings || {}));
      var sup1 = anvil.suppressed ? anvil.suppressed() : [];
      assert(sup1.indexOf('Hem1') >= 0 && !Object.keys(rfNWErrs()).length, 'Hem1 suppressed with Flange A, no error: ' + notes.join('; '));
      await UI.setSuppression([A.id], false); await idle(); await wait(30);
      notes.push('unsuppress: ' + JSON.stringify(anvil.suppressed()) + ' errors ' + JSON.stringify(rfNWErrs()));
      await UI.setSuppression([A.id], false, undefined, true); await idle(); await wait(30);
      notes.push('unsuppress with dependents: ' + JSON.stringify(anvil.suppressed()) + ' volume back ' + (Math.abs(rfNWVol() - vol0) < 1e-9));
      // Ctrl+Z through everything this job did (both steps), back to the script's part
      var n = UI.App.undo.length;
      for (var k = 0; k < n; k++) { rfNWKey('z', { ctrlKey: true }); await idle(); }
      await wait(30);
      notes.push('Ctrl+Z x' + n + ': ' + rfNWNames() + ' same script ' + (anvil.script() === rfNWjob.f0.script) + ' errors ' + JSON.stringify(rfNWErrs()));
      assert(anvil.script() === rfNWjob.f0.script && Math.abs(rfNWVol() - vol0) < 1e-9, 'Ctrl+Z back to the start: ' + notes.join('; '));
      // Save, New, Open
      await rfNWSaveAs('OOPS-16', notes);
      var s1 = anvil.script(), fl1 = anvil.flat();
      await anvil.newPart(); await idle();
      await rfNWOpenSaved('OOPS-16');
      var fl2 = anvil.flat();
      notes.push('reopened ' + UI.App.model.name + ' same script ' + (anvil.script() === s1) + ' flat ' + fl2.size.map(rfNWF).join(' x ') + ' vs ' + fl1.size.map(rfNWF).join(' x ') + ' prompt ' + (rfNWjob.openPrompt || '-'));
      assert(anvil.script() === s1 && Math.abs(fl2.size[0] - fl1.size[0]) < 1e-9 && Math.abs(fl2.size[1] - fl1.size[1]) < 1e-9 && Math.abs(rfNWVol() - vol0) < 1e-9, 'the same part after Open: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfNWDone(notes);
    });
  })();
