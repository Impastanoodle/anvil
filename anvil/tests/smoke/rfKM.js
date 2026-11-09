  // --- rfKM (2026-11-09, lane shopflow3, test-reports/2026-11-09-shop-flow-2.md) --- the shop audit, round 2, with this
  // round's features, driven as a user drives them: (a) a customer's STEP of a 14 ga U channel opened with File ▸ Open,
  // Insert Bends (base clicked), Flat to DXF ▸ ✓, a drawing with the flat placed by a click, its Bend Table and
  // Autodimension from the Tools menu; (b) a 14 ga 10 x 6 x 2 box (four Edge Flanges, Closed Corners, Corner Relief,
  // a Welded Corner), Make Drawing from Part + the flat, Cut-List Properties typed into the title block, File ▸ Save
  // Drawing as DXF / DWG / PDF; (c) a square-to-round Lofted-Bend and a Swept Flange channel with holes, their flat
  // DXFs. Kernel side: tests/kernel/rfKM.js. Self-contained.
  (function () {
    var T14 = 0.0747, T16 = 0.0598, KF = 0.44;
    var rfKMjob = {};
    function rfKMEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfKMClick(p) { rfKMEv('mousemove', p); rfKMEv('mousedown', p, $('viewport')); rfKMEv('mouseup', p); }
    function rfKMRibbon(tab, re) {
      UI.setRibbonTab(tab);
      return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim()); })[0];
    }
    function rfKMMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
      var hit = rows.filter(function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name + ': ' + rows.map(function (r) { return r.textContent.replace(/\s+/g, ' '); }).join(' | ').slice(0, 600));
      hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    // what a File ▸ Save … / ✓ hands to the save dialog or the download: [{ name, text | bytes }]
    async function rfKMSaved(fn) {
      var got = [], sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: text }); };
      UI.download = function (name, data) { got.push(typeof data === 'string' ? { name: name, text: data } : { name: name, bytes: data }); };
      try { await fn(); await idle(); await wait(30); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    function rfKMCheck() {
      if (window.DxfCheck) return Promise.resolve(window.DxfCheck);
      return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '../headless/dxf-check.js'; s.onload = function () { res(window.DxfCheck); }; s.onerror = function () { rej(new Error('dxf-check.js did not load')); }; document.head.appendChild(s); });
    }
    function rfKMVol() { return K.massProps(UI.App.mesh, 1).volume; }
    function rfKMErrs() { return Object.keys(anvil.summary().errors || {}); }
    // a thin part from its chain (material on the chain's left, T thick) extruded D along +Z, each listed corner
    // filleted r inside and r + T outside: a customer's formed part as a plain solid
    function rfKMThin(chain, D, radii, T) {
      var n = chain.length, segs = [], inner = [], i;
      for (i = 0; i + 1 < n; i++) {
        var a = chain[i], b = chain[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
        segs.push([[a[0] + nx * T, a[1] + ny * T], [b[0] + nx * T, b[1] + ny * T]]);
      }
      inner.push(segs[0][0]);
      for (i = 1; i < segs.length; i++) {
        var p = segs[i - 1][0], r = [segs[i - 1][1][0] - p[0], segs[i - 1][1][1] - p[1]], q = segs[i][0], s = [segs[i][1][0] - q[0], segs[i][1][1] - q[1]];
        var t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / (r[0] * s[1] - r[1] * s[0]);
        inner.push([p[0] + r[0] * t, p[1] + r[1] * t]);
      }
      inner.push(segs[segs.length - 1][1]);
      var code = 'p.units("in");\np.sketch("Front").polyline(' + JSON.stringify(chain.concat(inner.slice().reverse())) + ', true).end().extrude(' + D + ');\n';
      Object.keys(radii).forEach(function (k) {
        k = +k;
        var u = [chain[k][0] - chain[k - 1][0], chain[k][1] - chain[k - 1][1]], v = [chain[k + 1][0] - chain[k][0], chain[k + 1][1] - chain[k][1]];
        var out = u[0] * v[1] - u[1] * v[0] > 0 ? chain[k] : inner[k], inn = out === chain[k] ? inner[k] : chain[k];
        code += 'p.fillet(' + radii[k] + ', [[' + inn[0] + ', ' + inn[1] + ', ' + D / 2 + ']]);\np.fillet(' + (radii[k] + T) + ', [[' + out[0] + ', ' + out[1] + ', ' + D / 2 + ']]);\n';
      });
      return code;
    }
    // job a's customer file: a 14 ga U channel 3 wide x 1.5 tall x 6 long (outside), inside radius .0747, two Ø.281
    // holes in the base and one through both legs
    var RFKM_U = rfKMThin([[0, 1.5], [0, 0], [3, 0], [3, 1.5]], 6, { 1: T14, 2: T14 }, T14) +
      'p.sketch("Top").circle(1.5, -1.5, 0.1405).circle(1.5, -4.5, 0.1405).end().extrude(1, { cut: true, through: true, both: true });\n' +
      'p.sketch("Right", 4).circle(-3, 0.75, 0.1405).end().extrude(5, { cut: true, through: true, reverse: true });\n';
    var RFKM_U_LEN = 2 * (1.5 - 2 * T14) + (3 - 4 * T14) + 2 * Math.PI / 2 * (T14 + KF * T14);   // legs and base less setbacks + 2 BA

    step('rfKM: job a, a customer\'s STEP of a 14 ga U channel: File ▸ Open… (file picked), Insert Bends with the base clicked (K .44), ✓, Flatten, Flat to DXF ▸ ✓: the analytic blank, 4 holes, 2 bend lines', async function () {
      var errs0 = errors.length;
      var m = K.newModel('U'); K.runScript(m, RFKM_U);
      var b = K.rebuild(m), stepText = W.Exchange.exportSTEP(m, b, { faceted: true });
      assert(/CYLINDRICAL_SURFACE/.test(stepText), 'the customer file has its bends as cylinders');
      await anvil.newPart(); await idle();
      rfKMMenu('File', 'Open…'); await wait(30);
      assert(modalOpen(), 'the Open dialog');
      var inp = D.querySelector('#modal .open-input');
      assert(inp, 'its file input');
      var dt = new W.DataTransfer();
      dt.items.add(new W.File([stepText], 'customer-channel.step', { type: 'application/step' }));
      inp.files = dt.files; inp.dispatchEvent(new W.Event('change')); await wait(50);
      clickModalButton('Open');
      for (var i = 0; i < 100 && !(UI.App.model.features || []).some(function (f) { return f.type === 'import'; }); i++) await wait(50);
      await idle(); await wait(30);
      var feats = UI.App.model.features.map(function (f) { return f.type; });
      assert(feats.indexOf('import') >= 0, 'opened: ' + feats.join(','));
      rfKMjob.aUnits = UI.App.model.units;
      // Insert Bends: the base's inside face clicked from above
      UI.setView('Top'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var ib = rfKMRibbon('Sheet Metal', /Insert Bends/);
      assert(ib, 'Insert Bends on the ribbon');
      ib.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Insert Bends', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfKMClick(UI.worldToScreen([0.8, T14, 3])); await idle(); await wait(30);
      var ff = UI.pmSpec().values.fixedFace;
      assert(ff && Math.abs(ff[1] - T14) < 1e-6, 'fixed face on the base: ' + JSON.stringify(ff));
      var kf = pmField('K-Factor') || pmField('K-factor');
      if (kf) setInput(kf, KF);
      var txt = '';
      for (i = 0; i < 60 && !/found/.test(txt); i++) { await wait(50); txt = D.querySelector('#pm').textContent; }
      rfKMjob.aPm = txt.replace(/\s+/g, ' ');
      await pmAccept(); await wait(30);
      assert(!rfKMErrs().length, 'Insert Bends: ' + JSON.stringify(anvil.summary().errors));
      var sh = UI.App.model.sheet, flat = anvil.flat();
      near(+sh.thickness, T14, 1e-9, 'T measured'); near(+sh.kFactor, KF, 1e-12, 'K');
      near(Math.max(flat.size[0], flat.size[1]), 6, 1e-9, 'flat length 6');
      near(Math.min(flat.size[0], flat.size[1]), RFKM_U_LEN, 1e-6, 'flat width = legs + base less setbacks + 2 BA');
      var fb = rfKMRibbon('Sheet Metal', /^Flatten\b|\bFlatten$/);
      fb.click(); await idle(); await wait(30);
      assert(UI.App.model.flatState === true, 'flattened');
      var xb = rfKMRibbon('Sheet Metal', /Flat to/);
      xb.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'PM ' + (UI.hasPM() && UI.pmTitle()));
      var got = await rfKMSaved(function () { return pmAccept(); });
      var dxf = got.length && got[got.length - 1].text;
      assert(dxf && /\.dxf$/i.test(got[got.length - 1].name), 'a DXF saved: ' + JSON.stringify(got.map(function (g) { return g.name; })));
      var c = (await rfKMCheck()).check(dxf, { units: 'in' });
      assert(c.ok, 'DXF: ' + c.errors.join('; '));
      assert((c.counts['CIRCLE@HOLES'] || 0) === 4 && (c.counts['LINE@BEND'] || 0) === 2, 'four holes, two bend lines: ' + JSON.stringify(c.counts));
      rfKMjob.aDxf = { counts: c.counts, ext: c.extents, name: got[got.length - 1].name };
      fb.click(); await idle();
      assert(!UI.App.model.flatState, 'folded again');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'units ' + rfKMjob.aUnits + ', blank ' + RFKM_U_LEN.toFixed(4) + ' x 6, DXF ' + JSON.stringify(c.counts);
    });

    // ---- drawings
    function rfKMBox(p) {
      if (p.k === 'text') return W.Drawing.textRect(p);
      if (p.k === 'line') return { x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), y0: Math.min(p.a[1], p.b[1]), y1: Math.max(p.a[1], p.b[1]) };
      return null;
    }
    function rfKMMeet(a, b) { return a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9; }
    // the sheet's dimensions, tables and notes: [what clashes] (in the title / tolerance block, across another view, off
    // the border, a table over a table); views over views
    function rfKMClashes() {
      var sh = UI.drawing.state.sheet, S = sh.size, tbs = W.Drawing.tbRects(S, sh.units || 'in'), b1 = 10 / 25.4 * (sh.units === 'mm' ? 25.4 : 1), bad = [], items = [];
      (sh.annotations || []).forEach(function (a) { if (a.box && !a.hidden && isFinite(a.box.x0)) items.push({ n: a.type + ' ' + (a.text || ''), b: a.box, view: a.view }); });
      (sh.holeTables || []).forEach(function (t) { items.push({ n: (t.punch ? 'Punch' : 'Hole') + ' Table', b: t.box }); });
      sh.dims.forEach(function (d, i) { sh.prims.forEach(function (p) { if (p.dimIx === i) { var b = rfKMBox(p); if (b) items.push({ n: 'dim ' + d.text, b: b, view: d.view }); } }); });
      items.forEach(function (it, i) {
        tbs.forEach(function (t) { if (rfKMMeet(it.b, t)) bad.push(it.n + ' in the title / tolerance block'); });
        sh.views.forEach(function (w) { if (w.view.id !== it.view && rfKMMeet(it.b, w.box)) bad.push(it.n + ' across ' + w.view.name); });
        if (it.b.x0 < b1 || it.b.y0 < b1 || it.b.x1 > S[0] - b1 || it.b.y1 > S[1] - b1) bad.push(it.n + ' off the sheet ' + [it.b.x0, it.b.y0, it.b.x1, it.b.y1].map(function (x) { return x.toFixed(2); }).join(',') + ' in ' + S.map(function (x) { return x.toFixed(2); }).join('x') + ' views ' + sh.views.map(function (w) { return w.view.name + ' ' + [w.box.x0, w.box.y0, w.box.x1, w.box.y1].map(function (x) { return x.toFixed(2); }).join(','); }).join(' | '));
        items.slice(i + 1).forEach(function (o) { if (!/^dim/.test(it.n) && !/^dim/.test(o.n) && rfKMMeet(it.b, o.b)) bad.push(it.n + ' over ' + o.n); });
      });
      sh.views.forEach(function (w, i) { sh.views.slice(i + 1).forEach(function (o) { if (rfKMMeet(w.box, o.box)) bad.push(w.view.name + ' over ' + o.view.name); }); tbs.forEach(function (t) { if (rfKMMeet(w.box, t)) bad.push(w.view.name + ' on the title block'); }); });
      return bad.filter(function (x, i, a) { return a.indexOf(x) === i; });
    }
    // where a user would click to drop a w x h view (paper units): the free spot farthest from the views, the blocks and
    // the border (a grid search; null when nothing fits)
    function rfKMFreeSpot(w, h, pad) {
      var sh = UI.drawing.state.sheet, S = sh.size, obs = W.Drawing.tbRects(S, sh.units || 'in').concat(sh.views.map(function (x) { return x.box; })), best = null, bs = -Infinity;
      (sh.annotations || []).forEach(function (a) { if (a.box && isFinite(a.box.x0)) obs.push(a.box); });
      for (var i = 1; i < 60; i++) for (var j = 1; j < 40; j++) {
        var c = [S[0] * i / 60, S[1] * j / 40], r = { x0: c[0] - w / 2 - pad, x1: c[0] + w / 2 + pad, y0: c[1] - h / 2 - pad, y1: c[1] + h / 2 + pad };
        var b1 = (sh.units === 'mm' ? 12 : 12 / 25.4); if (r.x0 < b1 || r.y0 < b1 || r.x1 > S[0] - b1 || r.y1 > S[1] - b1) continue;
        if (obs.some(function (o) { return rfKMMeet(r, o); })) continue;
        var d = Math.min.apply(null, obs.map(function (o) { return Math.max(o.x0 - r.x1, r.x0 - o.x1, o.y0 - r.y1, r.y0 - o.y1); }));
        if (d > bs) { bs = d; best = c; }
      }
      return best;
    }
    // Insert ▸ Drawing View ▸ Flat Pattern…: Bend Notes as asked, ✓, then a click on the sheet's free spot
    // (sheet2: when the active sheet has no room for the flat at its scale, Esc, the Add Sheet tab, and again there)
    async function rfKMPlaceFlat(bendNotes, sheet2) {
      async function open() {
        rfKMMenu('Insert', 'Flat Pattern'); await wait(30);
        assert(UI.hasPM() && UI.pmTitle() === 'Model View', 'Model View PM: ' + (UI.hasPM() && UI.pmTitle()));
        var bn = pmField('Bends');
        assert(bn, 'Bend Notes field');
        setInput(bn, bendNotes); await wait(10);
        await UI.pmOK(); await wait(20);
        assert(UI.drawing.state.tool === 'place' && UI.drawing.state.pending, 'placing: ' + UI.drawing.state.tool);
      }
      await open();
      var st = UI.drawing.state, spot = rfKMFreeSpot(st.pending.w, st.pending.h, 0);
      rfKMjob.lastSpot = spot ? 'free on ' + anvil.drawing.summary().sheet.name : 'no room on ' + anvil.drawing.summary().sheet.name + ' for ' + st.pending.w.toFixed(2) + ' x ' + st.pending.h.toFixed(2) + ' of ' + st.sheet.size.join(' x ') + ' (views ' + st.sheet.views.map(function (x) { return x.view.name + ' ' + [x.box.x0, x.box.y0, x.box.x1, x.box.y1].map(function (q) { return q.toFixed(2); }).join(','); }).join(' | ') + ')';
      if (!spot && sheet2) {
        key('Escape'); await wait(20);
        D.querySelector('.dw-add-sheet').click(); await UI.drawing.ready(); await wait(40);
        await open();
        st = UI.drawing.state; spot = rfKMFreeSpot(st.pending.w, st.pending.h, 0);
        rfKMjob.lastSpot += '; ' + (spot ? 'free on ' + anvil.drawing.summary().sheet.name : 'no room on ' + anvil.drawing.summary().sheet.name + ' either');
      }
      if (!spot) spot = [st.sheet.size[0] / 2, st.sheet.size[1] / 2];
      sheetMouse('mousemove', spot); sheetMouse('mousedown', spot); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true })); sheetMouse('click', spot);
      await UI.drawing.ready(); await wait(40);
      var fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
      assert(fv, 'flat view placed: ' + JSON.stringify(anvil.drawing.summary().views.map(function (v) { return v.kind + ' ' + v.name; })));
      return fv;
    }
    function rfKMBendTable() { return (UI.drawing.state.sheet.annotations || []).filter(function (a) { return a.type === 'bendTable'; })[0]; }

    step('rfKM: job a drawing: File ▸ Make Drawing from Part, Insert ▸ Drawing View ▸ Flat Pattern… (Bend Table) placed by a click, Tools ▸ Dimensions ▸ Autodimension… ✓ on it: ordinates to the holes and bend lines, the Bend Table A / B, nothing in the title block', async function () {
      var errs0 = errors.length;
      rfKMMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await UI.drawing.ready(); await wait(40);
      assert(UI.drawingActive && UI.drawingActive(), 'drawing open');
      rfKMjob.aViews0 = anvil.drawing.summary().views.map(function (v) { return v.name + ' ' + (v.orient || v.kind); });
      var fv = await rfKMPlaceFlat('table');
      var st = UI.drawing.state, w = st.sheet.views.filter(function (x) { return x.view.id === fv.id; })[0];
      rfKMjob.aFlatScale = W.Drawing.scaleText ? W.Drawing.scaleText(w.view.scale || st.sheet.scale || [1, 1]) : JSON.stringify(w.view.scale);
      rfKMjob.aSheetScale = JSON.stringify(st.doc ? st.doc.sheet.scale : anvil.drawing.summary().sheet.scale);
      var bt = rfKMBendTable();
      assert(bt && bt.info.rows.length === 2, 'Bend Table with two rows: ' + JSON.stringify(bt && bt.info.rows));
      rfKMjob.aBendTable = bt.info.rows;
      // Tools ▸ Dimensions ▸ Autodimension… with the flat view selected
      st.sel = { kind: 'view', id: fv.id };
      rfKMMenu('Tools', 'Autodimension'); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Autodimension', 'Autodimension PM: ' + (UI.hasPM() && UI.pmTitle()));
      var n0 = st.sheet.dims.length;
      await UI.pmOK(); await UI.drawing.ready(); await wait(40);
      var dims = [].concat.apply([], st.sheet.dims.slice(n0).map(function (d) { return String(d.text).split(/,\s*/); }));
      rfKMjob.aDims = dims;
      assert(dims.length >= 10, 'ordinates: ' + dims.join(' '));
      ['.750', '1.435', '2.870', '4.305', '4.990', '5.740', '1.500', '3.000', '4.500', '6.000'].forEach(function (x) { assert(dims.indexOf(x) >= 0, x + ' among the ordinates: ' + dims.join(' ')); });
      var bad = rfKMClashes();
      rfKMjob.aClashes = bad;
      assert(!bad.length, bad.join('; '));
      var tb = anvil.drawing.summary().titleBlock || {};
      rfKMjob.aTitle = tb;
      anvil.drawing.close(); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'flat at ' + rfKMjob.aFlatScale + ' (sheet ' + rfKMjob.aSheetScale + '), ' + dims.length + ' ordinates, spot ' + rfKMjob.lastSpot;
    });

    // ---- job b: 14 ga box 10 x 6 x 2, R .075, K .44, four Edge Flanges (Material Inside, Outer Virtual Sharp)
    var RB = 0.075, BD_B = 2 * (RB + T14) - Math.PI / 2 * (RB + KF * T14);
    var RFKM_BOX = 'p.name("Box-14GA").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T14 + ', ' + RB + ', ' + KF + ');\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
      [[5, T14, 0], [10, T14, 3], [5, T14, 6], [0, T14, 3]].map(function (e) { return 'p.flange(2, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    function rfKMCaret() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0]; }
    function rfKMMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf(text) >= 0; })[0]; }
    async function rfKMCorners(item) {
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = rfKMCaret();
      assert(caret && !caret.disabled, 'the Corners flyout');
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var mi = rfKMMenuItem(item);
      assert(mi, item + ' in the Corners flyout');
      mi.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === item, item + ' PM: ' + (UI.hasPM() && UI.pmTitle()));
    }
    // look down into a corner gap (camera above the point, tilted toward `from`), zoomed in, and click the face there
    async function rfKMLookClick(P, from, label) {
      var c = UI.cam, d = new W.THREE.Vector3(from[0], 1, from[2]).normalize();
      c.dir.copy(d); c.up.set(0, 1, 0); c.target.set(P[0], P[1], P[2]); c.scale = 0.0015;
      UI.applyCamera(); await idle(); await wait(30);
      var s = UI.worldToScreen(P), pk = UI.pickFace(s[0], s[1]);
      assert(pk && pk.point && Math.hypot(pk.point[0] - P[0], pk.point[1] - P[1], pk.point[2] - P[2]) < 0.02, label + ': the face is under the cursor: ' + JSON.stringify(pk && pk.point));
      rfKMClick(s); await idle(); await wait(20);
    }
    function rfKMArea(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }

    step('rfKM: job b, 14 ga box 10 x 6 x 2: Corners ▸ Closed Corner (three end-face clicks, Butt .010, bend region closed) ✓, Corners ▸ Corner Relief (Collect all corners, Circular) ✓, Corners ▸ Welded Corner (a click down the front-left gap) ✓: closed solid, one blank 10 + 2 (2 − BD) wide, the weld left out of the flat', async function () {
      var errs0 = errors.length;
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(RFKM_BOX); await idle();
      assert(!rfKMErrs().length, 'box: ' + JSON.stringify(anvil.summary().errors));
      var fl0 = anvil.flat();
      // Closed Corner: the front pair share a plane (Coplanar faces takes both), then the two back corners
      await rfKMCorners('Closed Corner');
      var picks = [{ at: [T14 / 2, 1.8, RB + T14], from: [0, 0, -0.25] }, { at: [10 - RB - T14, 1.8, 6 - T14 / 2], from: [0.25, 0, 0] }, { at: [T14 / 2, 1.8, 6 - RB - T14], from: [0, 0, 0.25] }];
      for (var i = 0; i < picks.length; i++) {
        await rfKMLookClick(picks[i].at, picks[i].from, 'end face ' + i);
        assert(UI.pmSpec().values.faces.length === i + 1, 'pick ' + (i + 1) + ': ' + statusText());
      }
      var cv = UI.pmSpec().values;
      rfKMjob.bCC = { cornerType: cv.cornerType, gap: cv.gap, coplanar: cv.coplanar, openBend: cv.openBend };
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, cc = fs[fs.length - 1];
      assert(cc.type === 'closedCorner' && !UI.App.build.errors[cc.id], 'Closed Corner: ' + JSON.stringify(cc) + ' ' + UI.App.build.errors[cc.id]);
      var fl1 = anvil.flat();
      // Butt (SolidWorks 2022, rfDU): both walls stop gap/√2 short of the other's inside face, so the front / back walls lose their corner ends and the side walls run on to the gap; the bend region is closed too (Open bend region off)
      rfKMjob.bCCArea = +(rfKMArea(fl1) - rfKMArea(fl0)).toFixed(5);
      assert(fl1.loops.length === 1 && Math.abs(rfKMArea(fl1) - rfKMArea(fl0)) > 1e-3, 'the blank changes at the corners: ' + fl1.loops.length + ' loops, ' + rfKMjob.bCCArea + ' in²');
      // Corner Relief: Collect all corners, Circular
      await rfKMCorners('Corner Relief');
      clickPmButton('Collect all corners'); await wait(20);
      var nc = UI.pmSpec().values.corners.length;
      rfKMjob.bReliefCorners = nc;
      assert(nc === 4, 'four 2 Bend corners: ' + nc);
      setInput(pmField('Relief type'), 'circular'); await wait(20);
      await pmAccept(); await wait(30);
      fs = UI.App.model.features; var cr = fs[fs.length - 1];
      assert(cr.type === 'cornerRelief' && cr.reliefType === 'circular' && !UI.App.build.errors[cr.id], 'Corner Relief: ' + JSON.stringify(cr) + ' ' + UI.App.build.errors[cr.id]);
      var fl2 = anvil.flat();
      rfKMjob.bRelief = { loops: fl2.loops.length, less: +(rfKMArea(fl1) - rfKMArea(fl2)).toFixed(5) };
      assert(rfKMArea(fl2) < rfKMArea(fl1) - 1e-3, 'the reliefs cut the blank: ' + JSON.stringify(rfKMjob.bRelief));
      // Welded Corner: the left wall's end at the front-left corner (it stops gap/√2 short of the front wall now)
      var v0 = rfKMVol();
      await rfKMCorners('Welded Corner');
      await rfKMLookClick([T14 / 2, 1.2, T14 + 0.01 / Math.SQRT2], [-2, 0, -2], 'weld face');
      assert(UI.pmSpec().values.faces.length === 1, 'the corner taken: ' + statusText());
      await pmAccept(); await wait(30);
      fs = UI.App.model.features; var wc = fs[fs.length - 1];
      assert(wc.type === 'weldedCorner' && !UI.App.build.errors[wc.id], 'Welded Corner: ' + JSON.stringify(wc) + ' ' + UI.App.build.errors[wc.id]);
      assert(rfKMVol() > v0, 'weld metal added');
      var chk = W.Evaluate.checkBody(UI.App.build.body);
      assert(!chk.openEdges.length && !chk.nonManifoldEdges.length, 'closed solid: ' + chk.openEdges.length + ' open, ' + chk.nonManifoldEdges.length + ' non-manifold');
      var fl3 = anvil.flat();
      near(fl3.size[0], 10 + 2 * (2 - BD_B), 1e-6, 'blank width'); near(fl3.size[1], 6 + 2 * (2 - BD_B), 1e-6, 'blank depth');
      near(rfKMArea(fl3), rfKMArea(fl2), 1e-9, 'the weld is not in the flat');
      rfKMjob.bFlat = fl3.size.map(function (x) { return +x.toFixed(5); });
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'blank ' + fl3.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ', Closed Corner ' + rfKMjob.bCCArea + ' in², reliefs ' + JSON.stringify(rfKMjob.bRelief) + ' (loops beyond 1: the sliver TODO in kernel/rfKM.js)';
    });

    step('rfKM: job b drawing: Make Drawing from Part, the flat placed by a click (bend notes on the lines), the blank size typed into the title block as Cut-List links ($PRPSHEET:"Bounding Box Length" X …), File ▸ Save Drawing as DXF / DWG / PDF: the title block reads the blank, the DWG is AutoCAD 2000', async function () {
      var errs0 = errors.length;
      rfKMMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await UI.drawing.ready(); await wait(40);
      var fv = await rfKMPlaceFlat('notes', true);
      // the title block's FINISH field (double-click it, type, Enter): the Cut-List Properties as links
      var st = UI.drawing.state, S = st.sheet.size, f = W.Drawing.TB_FIELDS.filter(function (x) { return x.key === 'finish'; })[0];
      var r = W.Drawing.fieldRect(f, S, st.sheet.units || 'in'), mid = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
      sheetMouse('dblclick', mid); await wait(30);
      var inp = D.querySelector('#dw-edit input');
      assert(inp, 'the title block field opens for editing');
      inp.value = 'BLANK $PRPSHEET:"Bounding Box Length" X $PRPSHEET:"Bounding Box Width"';
      inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await UI.drawing.ready(); await wait(40);
      var tb = W.Drawing.titleBlock(UI.drawing.state.doc || anvil.drawing.doc && anvil.drawing.doc(), UI.App.model, { build: UI.App.build, mesh: UI.App.mesh });
      var want = 'BLANK ' + (10 + 2 * (2 - BD_B)).toFixed(4) + ' X ' + (6 + 2 * (2 - BD_B)).toFixed(4);
      rfKMjob.bTitle = { finish: tb.finish, thickness: tb.thickness, material: tb.material, title: tb.title, mass: tb.mass };
      assert(tb.finish === want, 'FINISH reads the blank: ' + tb.finish + ' (want ' + want + ')');
      assert(/\.0747/.test(tb.thickness) && /Plain Carbon Steel/.test(tb.material), 'THICKNESS / MATERIAL: ' + JSON.stringify(rfKMjob.bTitle));
      var bad = rfKMClashes();
      rfKMjob.bClashes = bad;
      assert(!bad.length, bad.join('; '));
      var dxf = (await rfKMSaved(function () { rfKMMenu('File', 'Save Drawing as DXF'); }))[0];
      var bi = dxf ? dxf.text.indexOf('BLANK') : -1;
      assert(dxf && /\.dxf$/.test(dxf.name) && dxf.text.indexOf(want) >= 0, 'drawing DXF with the blank size in the title block: ' + (dxf && dxf.name) + ' ' + (bi >= 0 ? JSON.stringify(dxf.text.slice(bi - 40, bi + 120)) : 'no BLANK'));
      var dwgs = await rfKMSaved(async function () { rfKMMenu('File', 'Save Drawing as DWG'); for (var k = 0; k < 60 && !(UI.drawing.state.lastDwg); k++) await wait(50); });
      var dwg = dwgs.filter(function (g) { return /\.dwg$/.test(g.name); })[0];
      assert(dwg && dwg.bytes, 'a DWG: ' + JSON.stringify(dwgs.map(function (g) { return g.name; })) + ' ' + JSON.stringify(UI.drawing.state.lastDwg));
      var head = String.fromCharCode.apply(null, new Uint8Array(dwg.bytes.buffer || dwg.bytes).subarray(0, 6));
      assert(head === 'AC1015', 'AutoCAD 2000 DWG: ' + head);
      var pdf = (await rfKMSaved(function () { rfKMMenu('File', 'Save Drawing as PDF'); }))[0];
      assert(pdf && /^%PDF-1\.4/.test(pdf.text) && pdf.text.indexOf('13.7401') >= 0, 'PDF with the blank size: ' + (pdf && pdf.name));
      rfKMjob.bOut = { dxf: dxf.name, dwg: dwg.name + ' ' + (dwg.bytes.byteLength || dwg.bytes.length), pdf: pdf.name };
      anvil.drawing.close(); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return tb.finish + '; ' + JSON.stringify(rfKMjob.bOut);
    });

    // ---- job c: a 14 ga square-to-round transition (6 x 6 to Ø4, 4 tall) and a 16 ga Swept Flange channel with holes
    var RFKM_LOFT = 'p.name("Transition").units("in");\np.sheet(' + T14 + ', ' + T14 + ', 0.5);\n' +
      'var a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.001, -3]], false).id();\n' +
      'var b = p.sketch("Top", 4).arc(0, 0, 2, 270.03, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n' +
      'p.sketch("Right").circle(0, 1, 0.25).end().extrude(4, { cut: true });\n';   // a Ø.5 hole in the +X side facets
    var RFKM_SWEPT = 'p.name("Swept-Channel").units("in");\np.sheet(' + T16 + ', 0.06, ' + KF + ');\nvar path = p.sketch("Top").line(0, 0, 0, -10).id();\n' +
      'var prof = p.sketch("Front").polyline([[0, 1], [0, 0], [2, 0], [2, 1]], false).id();\np.sweptFlange(prof, path);\n' +
      'p.sketch("Top", 0).circle(1, -2, 0.1405).circle(1, -8, 0.1405).end().extrude(1, { cut: true, through: true, both: true });\n';
    async function rfKMFlatDxf(label) {
      var xb = rfKMRibbon('Sheet Metal', /Flat to/);
      assert(xb, 'Flat to DXF');
      xb.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', label + ': PM ' + (UI.hasPM() && UI.pmTitle()));
      var got = await rfKMSaved(function () { return pmAccept(); });
      var d = got[got.length - 1];
      assert(d && /\.dxf$/i.test(d.name), label + ': a DXF ' + JSON.stringify(got.map(function (g) { return g.name; })));
      var c = (await rfKMCheck()).check(d.text, { units: 'in' });
      assert(c.ok, label + ': ' + c.errors.join('; '));
      return c;
    }

    step('rfKM: job c, square-to-round Lofted-Bend (14 ga, 6 x 6 to Ø4 x 4) with a Ø.5 hole and a 16 ga Swept Flange channel with two Ø.281 holes: Flat to DXF ▸ ✓ for each: one closed outline, the bend lines, the holes', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(RFKM_LOFT); await idle();
      assert(!rfKMErrs().length, 'transition: ' + JSON.stringify(anvil.summary().errors));
      var fl = anvil.flat(), c = await rfKMFlatDxf('transition');
      assert(c.loops.filter(function (l) { return l.layer === 'OUTLINE' && l.closed; }).length === 1, 'one closed outline');
      assert((c.counts['LINE@BEND'] || 0) === fl.bends.length && fl.bends.length > 0 && (c.counts['LWPOLYLINE@HOLES'] || c.counts['POLYLINE@HOLES'] || 0) === 1, 'a bend line per fold, the hole: ' + JSON.stringify(c.counts));
      rfKMjob.cLoft = { size: fl.size.map(function (x) { return +x.toFixed(4); }), bends: fl.bends.length, counts: c.counts };
      await anvil.newPart(); await idle();
      await anvil.run(RFKM_SWEPT); await idle();
      assert(!rfKMErrs().length, 'channel: ' + JSON.stringify(anvil.summary().errors));
      var BA = Math.PI / 2 * (0.06 + KF * T16), want = 2 * (1 - 0.06) + (2 - 2 * 0.06) + 2 * BA;   // the sketch is the inside face (T on its right as drawn)
      fl = anvil.flat();
      near(Math.min(fl.size[0], fl.size[1]), want, 1e-6, 'channel blank: inside flats less R at each bend + 2 BA');
      near(Math.max(fl.size[0], fl.size[1]), 10, 1e-9, 'channel length');
      c = await rfKMFlatDxf('channel');
      assert((c.counts['CIRCLE@HOLES'] || 0) === 2 && (c.counts['LINE@BEND'] || 0) === 2, 'two holes, two bend lines: ' + JSON.stringify(c.counts));
      rfKMjob.cSwept = { size: fl.size.map(function (x) { return +x.toFixed(4); }), counts: c.counts };
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'transition ' + rfKMjob.cLoft.size.join(' x ') + ' (' + rfKMjob.cLoft.bends + ' bend lines), channel ' + rfKMjob.cSwept.size.join(' x ');
    });
  })();
  // --- end rfKM ---
