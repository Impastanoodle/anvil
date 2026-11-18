  // --- rfNN (2026-11-16, lane shopflow3, test-reports/2026-11-16-shop-flow-3.md) --- the shop audit, round 3: six
  // whole jobs on INCH parts driven like a user (ribbon / menus / PropertyManagers, clicks in the viewport): (a) an
  // electrical box, (b) a bracket from a customer DXF, (c) a customer STEP, (d) a perforated panel, (e) a part family
  // nested on a sheet, (f) fix-a-mistake flows. Self-contained; every setting changed is put back.
  (function () {
    var T16 = 0.0598, R16 = 0.06, KF = 0.44;
    var rfNNjob = {};
    function rfNNBD(R, T, K) { return 2 * (R + T) - Math.PI / 2 * (R + K * T); }
    function rfNNEv(type, p, target, mods) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
    }
    function rfNNClick(p, mods) { rfNNEv('mousemove', p, null, mods); rfNNEv('mousedown', p, $('viewport'), mods); rfNNEv('mouseup', p, null, mods); }
    function rfNNScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
    async function rfNNSketchClick(uv) { rfNNClick(rfNNScr(uv)); await wait(20); }
    function rfNNKey(k, mods) { var ev = new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {})); D.dispatchEvent(ev); return ev; }
    function rfNNRibbon(tab, re) {
      UI.setRibbonTab(tab);
      return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim()); })[0];
    }
    function rfNNMenu(name, label) {
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
    async function rfNNSaved(fn) {
      var got = [], sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: text }); };
      UI.download = function (name, data) { got.push(typeof data === 'string' ? { name: name, text: data } : { name: name, bytes: data }); };
      try { await fn(); await idle(); await wait(30); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    function rfNNCheck() {
      if (window.DxfCheck) return Promise.resolve(window.DxfCheck);
      return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '../headless/dxf-check.js'; s.onload = function () { res(window.DxfCheck); }; s.onerror = function () { rej(new Error('dxf-check.js did not load')); }; document.head.appendChild(s); });
    }
    function rfNNErrs() { return anvil.summary().errors || {}; }
    function rfNNLast() { var fs = UI.App.model.features; return fs[fs.length - 1]; }
    // an inch part the way a user gets one (Tools ▸ Default units for new documents ▸ Inches, File ▸ New)
    async function rfNNNewInch() {
      var du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      assert(UI.unitLabel() === 'in', 'an inch part');
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    }
    // counts UI.rebuild calls while fn runs
    async function rfNNCount(fn) {
      var n = 0, base = UI.rebuild;
      UI.rebuild = function () { n++; return base.apply(this, arguments); };
      try { await fn(); await idle(); } finally { UI.rebuild = base; }
      return n;
    }
    async function rfNNView(name) { UI.setView(name); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30); }
    function rfNNPmOpen(title) { assert(UI.hasPM() && UI.pmTitle() === title, title + ' PM: ' + (UI.hasPM() && UI.pmTitle())); }

    // ---- job a: 16 ga electrical box 8 x 6 x 2
    var BD16 = rfNNBD(R16, T16, KF);
    step('rfNN: job a, 16 ga electrical box: Base Flange/Tab ▸ Top Plane, a corner rectangle by two clicks, Exit Sketch, T / R / K typed, ✓; one Edge-Flange PM with the four top edges clicked (Material Inside, 2) ✓: the blank 8 + 2 (2 − BD) x 6 + 2 (2 − BD)', async function () {
      var errs0 = errors.length, notes = [];
      await rfNNNewInch();
      var bf = rfNNRibbon('Sheet Metal', /Base Flange/);
      assert(bf, 'Base Flange on the ribbon');
      bf.click(); await wait(30);
      rfNNPmOpen('Base Flange/Tab');
      clickPmButton('Top Plane'); await idle(); await wait(30);
      assert(UI.App.mode === 'sketch', 'sketching on Top');
      UI.setTool('rect'); await wait(20);
      await rfNNSketchClick([0, -6]); await rfNNSketchClick([8, 0]); await wait(30);
      rfNNKey('Escape'); await wait(20);
      var sk = UI.activeSketchFeature();
      notes.push('rect ' + JSON.stringify(sk.entities.map(function (e) { return [e.x1, e.y1, e.x2, e.y2].map(function (x) { return +(+x).toFixed(3); }); })));
      // the rectangle was drawn by eye: dimension it the way a user types it (Smart Dimension is rfKU's / sketch lanes')
      sk.entities.forEach(function (e) { ['x1', 'x2'].forEach(function (k) { e[k] = Math.round(e[k]); }); ['y1', 'y2'].forEach(function (k) { e[k] = Math.round(e[k]); }); });
      UI.updateSketches();
      await UI.exitSketch(); await idle(); await wait(40);
      rfNNPmOpen('Base Flange/Tab');
      var v0 = UI.pmSpec().values;
      rfNNjob.aDefaults = { thickness: v0.thickness, bendRadius: v0.bendRadius, kFactor: v0.kFactor, baType: v0.baType, useGauge: v0.useGauge };
      setInput(pmField('Thickness'), T16); await wait(10);
      setInput(pmField('Bend radius'), R16); await wait(10);
      var kf = pmField('K-factor'); if (kf) setInput(kf, KF); await wait(10);
      await pmAccept(); await wait(30);
      assert(!Object.keys(rfNNErrs()).length, 'base flange: ' + JSON.stringify(rfNNErrs()));
      var sh = UI.App.model.sheet;
      near(+sh.thickness, T16, 1e-12, 'T'); near(+sh.bendRadius, R16, 1e-12, 'R');
      // Edge-Flange: the four top edges of the base, one PM
      await rfNNView('Isometric');
      rfNNRibbon('Sheet Metal', /Edge Flange/).click(); await wait(30);
      rfNNPmOpen('Edge-Flange');
      var mids = [[4, T16, 0], [8, T16, 3], [4, T16, 6], [0, T16, 3]].map(function (p) { return p; });
      // the top edges of the base: in Top frame y = -Z, so the rectangle is X 0..8, Z 0..6
      for (var i = 0; i < mids.length; i++) {
        var e = edgeNear(mids[i]);
        rfNNClick(UI.worldToScreen(e.mid)); await idle(); await wait(20);
      }
      var ne = UI.pmSpec().values.edges.length;
      notes.push('edges taken ' + ne);
      setInput(pmField('Position'), 'inside'); await wait(10);
      setInput(pmField('Length'), 2); await wait(10);
      var nreb = await rfNNCount(function () { return pmAccept(); });
      notes.push('Edge-Flange ✓ rebuilds ' + nreb);
      var f = rfNNLast();
      assert(f.type === 'flange' && !rfNNErrs()[f.id], 'flange: ' + JSON.stringify(f) + ' ' + JSON.stringify(rfNNErrs()));
      assert(ne === 4, 'four edges taken: ' + ne + ' ' + statusText());
      var fl = anvil.flat();
      notes.push('blank ' + fl.size.map(function (x) { return x.toFixed(4); }).join(' x '));
      near(Math.max(fl.size[0], fl.size[1]), 8 + 2 * (2 - BD16), 1e-6, 'blank length');
      near(Math.min(fl.size[0], fl.size[1]), 6 + 2 * (2 - BD16), 1e-6, 'blank width');
      rfNNjob.aNotes = notes;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ') + '; defaults ' + JSON.stringify(rfNNjob.aDefaults);
    });

    function rfNNSet(key, val) {
      var el = D.querySelector('#pm [data-key="' + key + '"]');
      assert(el, 'PM field ' + key + ': ' + Array.prototype.map.call(D.querySelectorAll('#pm [data-key]'), function (x) { return x.getAttribute('data-key'); }).join(','));
      if (el.type === 'checkbox') { if (!!el.checked !== !!val) el.click(); } else setInput(el, val);
    }
    function rfNNArea(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    async function rfNNCorners(item) {
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0];
      assert(caret && !caret.disabled, 'the Corners flyout');
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var mi = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf(item) >= 0; })[0];
      assert(mi, item + ' in the Corners flyout');
      mi.click(); await wait(30);
      rfNNPmOpen(item);
    }
    async function rfNNLookClick(P, from, label) {
      var c = UI.cam, d = new W.THREE.Vector3(from[0], 1, from[2]).normalize();
      c.dir.copy(d); c.up.set(0, 1, 0); c.target.set(P[0], P[1], P[2]); c.scale = 0.0015;
      UI.applyCamera(); await idle(); await wait(30);
      var s = UI.worldToScreen(P), pk = UI.pickFace(s[0], s[1]);
      assert(pk && pk.point && Math.hypot(pk.point[0] - P[0], pk.point[1] - P[1], pk.point[2] - P[2]) < 0.02, label + ': the face is under the cursor: ' + JSON.stringify(pk && pk.point));
      rfNNClick(s); await idle(); await wait(20);
    }

    step('rfNN: job a, the box\'s corners, knockouts and a hem: Corners ▸ Corner Relief (Collect all corners), a Ø.875 knockout cut in the back wall and Linear Pattern ×3 from the PM, Hem on the front lip by a click; the blank and its holes follow', async function () {
      var errs0 = errors.length, notes = [];
      assert(UI.App.model.units === 'in' && rfNNLast().type === 'flange', 'job a box first');
      // (Closed Corner by clicks: rfKM job b; this box's corners are the Edge-Flange's own mitres)
      // Corner Relief: Collect all corners, Circular
      await rfNNCorners('Corner Relief');
      clickPmButton('Collect all corners'); await wait(20);
      notes.push('relief corners ' + UI.pmSpec().values.corners.length);
      setInput(pmField('Relief type'), 'circular'); await wait(20);
      await pmAccept(); await wait(30);
      var cr = rfNNLast();
      notes.push('relief ' + cr.type + ' ' + (rfNNErrs()[cr.id] || 'ok'));
      // a Ø.875 knockout in the back wall (Z 6), 2 in from the left, 1 up
      await anvil.append('p.sketch("Front", 6).circle(2, 1, 0.4375).end().extrude(0.2, { cut: true, reverse: true, name: "Knockout" });\n'); await idle();
      var ko = rfNNLast();
      assert(ko.cut && !rfNNErrs()[ko.id], 'knockout: ' + JSON.stringify(rfNNErrs()));
      var kr = D.querySelector('#tree .ti[data-fid="' + ko.id + '"]');
      assert(kr, 'the knockout in the FeatureManager');
      kr.click(); await wait(20);
      UI.cmdLinearPattern(); await wait(30);
      rfNNPmOpen('Linear Pattern');
      var lv = UI.pmSpec().values;
      rfNNjob.aLPdefaults = { feature: lv.feature, d1: lv.d1, s1: lv.s1, n1: lv.n1, d2: lv.d2 };
      notes.push('LPattern defaults ' + JSON.stringify(rfNNjob.aLPdefaults));
      rfNNSet('s1', 2); rfNNSet('n1', 3); await wait(20);
      if (lv.d2) { rfNNSet('d2', ''); await wait(20); }
      var vk = K.massProps(UI.App.mesh, 1).volume, nfl = anvil.flat().loops.length;
      await pmAccept(); await wait(30);
      var lp = rfNNLast();
      notes.push('pattern removes ' + (vk - K.massProps(UI.App.mesh, 1).volume).toFixed(5) + ' in3 (2 holes ' + (2 * Math.PI * 0.4375 * 0.4375 * T16).toFixed(5) + '), flat loops ' + nfl + ' -> ' + anvil.flat().loops.length);
      notes.push('pattern ' + JSON.stringify({ feature: lp.feature, s1: lp.s1, n1: lp.n1, d2: lp.d2, err: rfNNErrs()[lp.id] || 'ok' }));
      // Hem on the front lip: its top outer edge (Z 0, Y 2)
      await rfNNView('Isometric');
      UI.cmdHem(); await wait(30);
      rfNNPmOpen('Hem');
      var he = edgeNear([4, 2, 0]);
      rfNNClick(UI.worldToScreen(he.mid)); await idle(); await wait(20);
      var hv = UI.pmSpec().values;
      notes.push('hem edges ' + hv.edges.length + ' type ' + hv.hemType + ' len ' + hv.length);
      await pmAccept(); await wait(30);
      var hm = rfNNLast();
      notes.push('hem ' + (rfNNErrs()[hm.id] || 'ok'));
      var fl = anvil.flat();
      notes.push('flat ' + fl.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ' loops ' + fl.loops.length + ' areas ' + fl.loops.map(function (l) { var b = l.reduce(function (a, p) { return [Math.min(a[0], p[0]), Math.min(a[1], p[1])]; }, [1e9, 1e9]); return Math.abs(K.signedArea(l)).toFixed(5) + '@' + b.map(function (x) { return x.toFixed(2); }).join(','); }).join(' '));
      rfNNjob.aFlat = fl;
      notes.push('errors ' + JSON.stringify(rfNNErrs()) + ' warnings ' + JSON.stringify(anvil.summary().warnings || {}));
      rfNNjob.aNotes2 = notes;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    step('rfNN: job a outputs: Flatten from the ribbon, File ▸ Make Drawing from Part (three views + the flat), Bend Table on the flat, Autodimension, File ▸ Save Drawing as PDF; Flat to DXF ▸ DXF ✓ and DWG ✓', async function () {
      var errs0 = errors.length, notes = [];
      assert(UI.App.model.units === 'in', 'job a part');
      var fb = rfNNRibbon('Sheet Metal', /^Flatten\b|\bFlatten$/);
      var nf = await rfNNCount(function () { fb.click(); });
      notes.push('Flatten rebuilds ' + nf + ' flat ' + UI.App.model.flatState);
      fb.click(); await idle();
      rfNNMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) { notes.push('modal: ' + $('modal').textContent.replace(/\s+/g, ' ').slice(0, 160)); clickModalButton('OK'); }
      await UI.drawing.ready(); await wait(40);
      var views = anvil.drawing.summary().views;
      notes.push('views ' + views.map(function (v) { return v.name + ':' + (v.orient || v.kind); }).join(','));
      var fv = views.filter(function (v) { return v.kind === 'flat'; })[0];
      var sheets = anvil.drawing.summary().sheets || [];
      notes.push('sheets ' + JSON.stringify(sheets).slice(0, 300));
      if (!fv && sheets.length > 1) {
        var tab = D.querySelector('.dw-sheet-tab[data-sheet="1"]');
        assert(tab, 'the Sheet2 tab');
        tab.click(); await UI.drawing.ready(); await wait(40);
        fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
        if (fv) notes.push('flat on Sheet2 (clicked its tab)');
      }
      var st = UI.drawing.state;
      if (fv && fv.sheet) notes.push('flat on ' + fv.sheet);
      var anns = (st.sheet.annotations || []).map(function (a) { return a.type; });
      notes.push('annotations ' + anns.join(','));
      if (fv) {
        st.sel = { kind: 'view', id: fv.id };
        rfNNMenu('Tools', 'Autodimension'); await wait(30);
        if (UI.hasPM() && UI.pmTitle() === 'Autodimension') { rfNNjob.adPM = UI.pmSpec().values; var n0 = st.sheet.dims.length; await UI.pmOK(); await UI.drawing.ready(); await wait(40); notes.push('autodims ' + (st.sheet.dims.length - n0) + ' ' + JSON.stringify(st.sheet.dims.slice(n0).map(function (d) { return d.text; })) + ' PM ' + JSON.stringify(rfNNjob.adPM)); }
        else notes.push('Autodimension PM: ' + (UI.hasPM() && UI.pmTitle()));
      }
      var pdf = (await rfNNSaved(function () { rfNNMenu('File', 'Save Drawing as PDF'); }))[0];
      notes.push('pdf ' + (pdf && pdf.name) + ' ' + (pdf && /^%PDF/.test(pdf.text)));
      anvil.drawing.close(); await idle();
      // flat DXF and DWG
      var xb = rfNNRibbon('Sheet Metal', /Flat to/);
      xb.click(); await wait(30);
      rfNNPmOpen('DXF/DWG Output');
      var got = await rfNNSaved(function () { return pmAccept(); });
      var dxf = got[got.length - 1];
      var c = (await rfNNCheck()).check(dxf.text, { units: 'in' });
      notes.push('flat dxf ' + dxf.name + ' ok ' + c.ok + ' ' + JSON.stringify(c.counts));
      xb.click(); await wait(30);
      await wait(200);
      var dw = D.querySelector('#pm input[type=radio][value="dwg"]');
      notes.push('dwg radio ' + (dw ? (dw.disabled ? 'disabled' : 'enabled') : 'none'));
      if (dw && !dw.disabled) {
        dw.click(); await wait(20);
        var g2 = await rfNNSaved(async function () { await UI.pmOK(); for (var k = 0; k < 80 && UI.hasPM(); k++) await wait(50); });
        notes.push('dwg ' + g2.map(function (g) { return g.name + ' ' + (g.bytes ? (g.bytes.byteLength || g.bytes.length) : 'text'); }).join(','));
      } else if (UI.hasPM()) UI.pmCancel ? UI.pmCancel() : rfNNKey('Escape');
      await idle();
      assert(c.ok && (c.counts['CIRCLE@HOLES'] || 0) === 3, 'flat DXF with three knockouts: ' + JSON.stringify(c.counts));
      assert(fv, 'Make Drawing adds the flat: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    // ---- job b: a bracket from a customer DXF (inch, a corner that misses by .0005, a Ø.281 hole)
    function rfNNDxf(ents) {
      var o = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
      ents.forEach(function (e) {
        if (e.length === 4) o.push('0', 'LINE', '8', '0', '10', String(e[0]), '20', String(e[1]), '30', '0', '11', String(e[2]), '21', String(e[3]), '31', '0');
        else o.push('0', 'CIRCLE', '8', '0', '10', String(e[0]), '20', String(e[1]), '30', '0', '40', String(e[2]));
      });
      o.push('0', 'ENDSEC', '0', 'EOF');
      return o.join('\n') + '\n';
    }
    var RFNN_BRACKET = rfNNDxf([[0, 0, 8, 0], [8, 0, 8, 3], [8, 3, 0, 3], [0, 3, 0, 0.0005], [6.9, 1.5, 0.1405]]);
    step('rfNN: job b, a bracket from a customer DXF: File ▸ Open of the .dxf (DXF/DWG Import ✓), Repair Sketch closes the .0005 gap, Exit Sketch, Base Flange/Tab ✓, a slot across the first bend line, two Sketched Bends (UP and DOWN); then the first bend\'s angle (Edit Feature) and its line (Edit Sketch) changed: the second bend, the slot and the flat follow', async function () {
      var errs0 = errors.length, notes = [], du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await UI.openFileData('BRKT-7.dxf', RFNN_BRACKET); await idle(); await wait(30); } finally { UI.setDefaultUnits(du); }
      notes.push('opened ' + UI.App.model.name + ' units ' + UI.App.model.units + ' PM ' + (UI.hasPM() && UI.pmTitle()));
      if (UI.hasPM() && UI.pmTitle() === 'DXF/DWG Import') { notes.push('import PM units ' + JSON.stringify(UI.pmSpec().values.units || UI.pmSpec().values.unit || null)); await pmAccept(); }
      var sk = UI.activeSketchFeature ? UI.activeSketchFeature() : null;
      assert(sk, 'in the imported sketch: ' + notes.join('; '));
      notes.push('entities ' + sk.entities.length + ' plane ' + JSON.stringify(sk.plane));
      var ck = K.checkSketch ? K.checkSketch(sk) : null;
      // Tools ▸ Sketch Tools ▸ Repair Sketch
      rfNNMenu('Tools', 'Repair Sketch'); await wait(30);
      notes.push('repair: ' + (UI.hasPM() ? 'PM ' + UI.pmTitle() : modalOpen() ? 'modal ' + $('modal').textContent.replace(/\s+/g, ' ').slice(0, 120) : statusText().slice(0, 140)));
      if (UI.hasPM()) await pmAccept();
      if (modalOpen()) { var bs = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); }); clickModalButton(bs.indexOf('Repair') >= 0 ? 'Repair' : bs.indexOf('OK') >= 0 ? 'OK' : bs[0]); await wait(30); }
      var gap = sk.entities.filter(function (e) { return e.t === 'line'; }).some(function (e) { return Math.abs(e.y2 - 0.0005) < 1e-6 || Math.abs(e.y1 - 0.0005) < 1e-6; });
      notes.push('gap left ' + gap);
      await UI.exitSketch(); await idle(); await wait(30);
      rfNNRibbon('Sheet Metal', /Base Flange/).click(); await wait(30);
      notes.push('after exit PM ' + (UI.hasPM() && UI.pmTitle()));
      rfNNPmOpen('Base Flange/Tab');
      setInput(pmField('Thickness'), T16); setInput(pmField('Bend radius'), R16); var kf = pmField('K-factor'); if (kf) setInput(kf, KF); await wait(10);
      await pmAccept(); await wait(30);
      assert(!Object.keys(rfNNErrs()).length, 'base flange: ' + JSON.stringify(rfNNErrs()) + ' ' + notes.join('; '));
      var bb = UI.App.build.bbox || null;
      var z0 = sk.plane && sk.plane.ref === 'Top';
      notes.push('base bbox ' + JSON.stringify(anvil.summary().bbox || null));
      // the slot across the first bend line (x 2), then the two bend lines and Sketched Bends
      var code = 'p.sketch("Top", ' + T16 + ').slot(1.6, 1.5, 2.4, 1.5, 0.25).end().extrude(1, { cut: true, through: true, reverse: true, name: "Slot" });\n' +
        'var b1 = p.sketch("Top", ' + T16 + ', "Bend line 1").line(2, -0.5, 2, 3.5).id();\np.sketchedBend(90, { sketch: b1, name: "Sketched Bend1" });\n' +
        'var b2 = p.sketch("Top", ' + T16 + ', "Bend line 2").line(6, -0.5, 6, 3.5).id();\np.sketchedBend(90, { sketch: b2, reverse: true, name: "Sketched Bend2" });\n';
      await anvil.append(code); await idle();
      notes.push('after bends errors ' + JSON.stringify(rfNNErrs()) + ' warnings ' + JSON.stringify(anvil.summary().warnings || {}));
      var fl = anvil.flat();
      notes.push('flat ' + fl.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ' loops ' + fl.loops.length);
      // Edit Feature on Sketched Bend1: angle 60
      var sb1 = UI.App.model.features.filter(function (f) { return f.name === 'Sketched Bend1'; })[0];
      var bbox0 = JSON.stringify(anvil.summary().bbox);
      UI.editFeature(sb1); await wait(30);
      notes.push('edit PM ' + (UI.hasPM() && UI.pmTitle()));
      var af = pmField('Bend angle') || pmField('Angle');
      assert(af, 'angle field: ' + $('pm').textContent.replace(/\s+/g, ' ').slice(0, 300));
      setInput(af, 60); await wait(20);
      await pmAccept(); await wait(30);
      notes.push('angle ' + sb1.angle + ' errors ' + JSON.stringify(rfNNErrs()) + ' bbox ' + bbox0 + ' -> ' + JSON.stringify(anvil.summary().bbox));
      var fl2 = anvil.flat();
      notes.push('flat ' + fl2.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ' loops ' + fl2.loops.length);
      // Edit Sketch of bend line 1: move it to x 2.25 (the dimension typed)
      var s1 = K.findFeature(UI.App.model, sb1.sketch);
      s1.entities[0].x1 = s1.entities[0].x2 = 2.25;
      await UI.rebuild(); await idle();
      notes.push('moved: errors ' + JSON.stringify(rfNNErrs()) + ' bbox ' + JSON.stringify(anvil.summary().bbox));
      var fl3 = anvil.flat();
      notes.push('flat ' + fl3.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ' loops ' + fl3.loops.length);
      // flat DXF
      var xb = rfNNRibbon('Sheet Metal', /Flat to/);
      xb.click(); await wait(30);
      var got = await rfNNSaved(function () { return pmAccept(); });
      var c = (await rfNNCheck()).check(got[got.length - 1].text, { units: 'in' });
      notes.push('dxf ' + got[got.length - 1].name + ' ' + c.ok + ' ' + JSON.stringify(c.counts) + ' ext ' + JSON.stringify(c.extents));
      rfNNjob.bNotes = notes;
      assert(!Object.keys(rfNNErrs()).length, 'the bracket rebuilds clean: ' + JSON.stringify(rfNNErrs()));
      assert(c.ok && (c.counts['LINE@BEND'] || 0) === 2 && (c.counts['CIRCLE@HOLES'] || 0) === 1 && (c.counts['POLYLINE@HOLES'] || 0) === 1, 'flat DXF: two bend lines, the hole and the slot: ' + JSON.stringify(c.counts));
      near(c.extents.max[0] - c.extents.min[0], 8, 1e-6, 'centerline bends keep the 8 in blank');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    // ---- job c: a customer STEP (Anvil's own export of a 16 ga L: 6 x 4 base + 1.5 flange, R .06)
    step('rfNN: job c, a customer STEP: File ▸ Open of the .step, Insert Bends (fixed face clicked, K .44) ✓, an Edge-Flange on the far edge ✓ and a cut, Flatten, Make Drawing: the flat follows every step', async function () {
      var errs0 = errors.length, notes = [];
      var m = K.newModel('L'); K.runScript(m, 'p.units("in");\np.sheet(' + T16 + ', ' + R16 + ', ' + KF + ');\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, ' + T16 + ', 0]], { position: "inside", lengthRef: "outer" });\n');
      var b = K.rebuild(m), stepText = W.Exchange.exportSTEP(m, b, { faceted: true });
      await anvil.newPart(); await idle();
      rfNNMenu('File', 'Open…'); await wait(30);
      assert(modalOpen(), 'the Open dialog');
      var inp = D.querySelector('#modal .open-input');
      var dt = new W.DataTransfer();
      dt.items.add(new W.File([stepText], 'CUST-L.step', { type: 'application/step' }));
      inp.files = dt.files; inp.dispatchEvent(new W.Event('change')); await wait(50);
      clickModalButton('Open');
      for (var i = 0; i < 100 && !(UI.App.model.features || []).some(function (f) { return f.type === 'import'; }); i++) await wait(50);
      await idle(); await wait(30);
      notes.push('opened units ' + UI.App.model.units + ' features ' + UI.App.model.features.map(function (f) { return f.type; }).join(','));
      await rfNNView('Top');
      rfNNRibbon('Sheet Metal', /Insert Bends/).click(); await wait(30);
      rfNNPmOpen('Insert Bends');
      rfNNClick(UI.worldToScreen([3, T16, 2.5])); await idle(); await wait(30);
      var kf = pmField('K-Factor') || pmField('K-factor'); if (kf) setInput(kf, KF);
      var txt = '';
      for (i = 0; i < 60 && !/found/.test(txt); i++) { await wait(50); txt = D.querySelector('#pm').textContent; }
      notes.push('IB: ' + (txt.match(/[^.]*found[^.]*/) || [''])[0].trim());
      await pmAccept(); await wait(30);
      assert(!Object.keys(rfNNErrs()).length, 'Insert Bends: ' + JSON.stringify(rfNNErrs()));
      notes.push('sheet R ' + UI.App.model.sheet.bendRadius);
      near(+UI.App.model.sheet.bendRadius, R16, 1e-9, 'Insert Bends takes the part\'s own bend radius as the sheet\'s default (it kept the generic .0625); ' + notes.join('; '));
      var fl0 = anvil.flat();
      notes.push('flat ' + fl0.size.map(function (x) { return x.toFixed(4); }).join(' x '));
      // Edge-Flange on the base's far edge (Z -4 side... the rectangle runs Z 0..4: the edge at Z 4), 1 in, Material Inside
      await rfNNView('Isometric');
      rfNNRibbon('Sheet Metal', /Edge Flange/).click(); await wait(30);
      rfNNPmOpen('Edge-Flange');
      var e = edgeNear([3, T16, 4]);
      rfNNClick(UI.worldToScreen(e.mid)); await idle(); await wait(20);
      notes.push('EF edges ' + UI.pmSpec().values.edges.length + ' radius ' + JSON.stringify(UI.pmSpec().values.useDefaultRadius) + ' ' + JSON.stringify(UI.pmSpec().values.radiusValue));
      setInput(pmField('Position'), 'inside'); setInput(pmField('Length'), 1); await wait(10);
      await pmAccept(); await wait(30);
      var ef = rfNNLast();
      notes.push('EF ' + ef.type + ' ' + (rfNNErrs()[ef.id] || 'ok'));
      await anvil.append('p.sketch("Top", ' + T16 + ').circle(3, -2, 0.25).end().extrude(1, { cut: true, through: true, reverse: true, name: "Hole" });\n'); await idle();
      notes.push('cut ' + JSON.stringify(rfNNErrs()));
      var fl = anvil.flat();
      var BD = rfNNBD(R16, T16, KF);
      notes.push('flat ' + fl.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ' loops ' + fl.loops.length + ' (hand ' + (4 + 1.5 - BD + 1 - BD).toFixed(4) + ' x 6)');
      rfNNMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await UI.drawing.ready(); await wait(40);
      var sheets = anvil.drawing.summary().sheets || [];
      notes.push('drawing sheets ' + sheets.map(function (s) { return s.name + ':' + s.views; }).join(','));
      anvil.drawing.close(); await idle();
      rfNNjob.cNotes = notes;
      rfNNjob.cDone = true;
      near(Math.max(fl.size[0], fl.size[1]), 4 + 1.5 - BD + 1 - BD, 1e-4, 'the blank: base + both flanges less two BD; ' + notes.join('; '));
      assert(fl.loops.length === 2, 'the hole in the flat');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
    // ---- job d: a 24 x 48 perforated panel, 18 ga, 600 holes, four 1 in flanges
    step('rfNN: job d, perforated panel 24 x 48 (18 ga): one Ø.25 hole, Linear Pattern 30 x 20 from the PM (600 holes), one Edge-Flange PM on the four edges, Flatten, a drawing of the flat with a Hole Table, Flat to DXF: each step one rebuild', async function () {
      var errs0 = errors.length, notes = [], T18 = 0.0478, t0;
      await rfNNNewInch();
      await anvil.run('p.units("in");\np.sheet(' + T18 + ', 0.03, ' + KF + ');\np.sketch("Top").rect(0, -48, 24, 48).end().baseFlange();\n' +
        'p.sketch("Top", ' + T18 + ').circle(1.4, -1.4, 0.125).end().extrude(1, { cut: true, through: true, reverse: true, name: "Perf" });\n'); await idle();
      var perf = rfNNLast();
      D.querySelector('#tree .ti[data-fid="' + perf.id + '"]').click(); await wait(20);
      UI.cmdLinearPattern(); await wait(30);
      rfNNPmOpen('Linear Pattern');
      rfNNSet('d1', 'x'); rfNNSet('s1', 0.73); rfNNSet('n1', 30); await wait(10);
      rfNNSet('d2', 'z'); await wait(20); rfNNSet('s2', 2.3); rfNNSet('n2', 20); await wait(20);
      // Direction 2 runs +Z: the Top sketch's y is -Z, so the panel is Z 0..48
      t0 = performance.now();
      var n = await rfNNCount(function () { return pmAccept(); });
      var lp = rfNNLast();
      assert(n <= 1, 'Linear Pattern ✓: one rebuild, got ' + n);
      notes.push('pattern ✓ rebuilds ' + n + ' ' + Math.round(performance.now() - t0) + ' ms; ' + JSON.stringify({ d2: lp.d2, rev2: lp.rev2, err: rfNNErrs()[lp.id] || 'ok' }));
      var flp = anvil.flat();
      notes.push('holes in flat ' + (flp.loops.length - 1));
      await rfNNView('Isometric');
      rfNNRibbon('Sheet Metal', /Edge Flange/).click(); await wait(30);
      rfNNPmOpen('Edge-Flange');
      [[12, T18, 0], [24, T18, 24], [12, T18, 48], [0, T18, 24]].forEach(function (p) { var e = edgeNear(p); rfNNClick(UI.worldToScreen(e.mid)); });
      await idle(); await wait(30);
      notes.push('edges ' + UI.pmSpec().values.edges.length);
      setInput(pmField('Length'), 1); await wait(10);
      t0 = performance.now();
      n = await rfNNCount(function () { return pmAccept(); });
      assert(n <= 1, 'Edge-Flange ✓: one rebuild, got ' + n);
      notes.push('flanges ✓ rebuilds ' + n + ' ' + Math.round(performance.now() - t0) + ' ms ' + (rfNNErrs()[rfNNLast().id] || 'ok'));
      var fb = rfNNRibbon('Sheet Metal', /^Flatten\b|\bFlatten$/);
      t0 = performance.now();
      n = await rfNNCount(function () { fb.click(); });
      assert(n === 0, 'Flatten is display only: no rebuild, got ' + n);
      notes.push('Flatten rebuilds ' + n + ' ' + Math.round(performance.now() - t0) + ' ms');
      fb.click(); await idle();
      var fl = anvil.flat();
      notes.push('flat ' + fl.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ' holes ' + (fl.loops.length - 1));
      rfNNjob.dNotes = notes;
      assert(fl.loops.length === 601, '600 holes in the flat: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
    step('rfNN: job d drawing (split from the model so each stays under the step time on a busy machine): Make Drawing (the flat on Sheet2), a Hole Table on the flat, Flat to DXF with the 600 holes', async function () {
      var errs0 = errors.length, notes = [], t0;
      assert(rfNNjob.dNotes && UI.App.model.features.length > 3, 'job d panel first');
      t0 = performance.now();
      rfNNMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await UI.drawing.ready(); await wait(30);
      var sh = anvil.drawing.summary().sheets || [];
      notes.push('drawing ' + Math.round(performance.now() - t0) + ' ms, sheets ' + sh.map(function (s) { return s.name + ':' + s.views; }).join(','));
      var fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
      if (!fv && sh.length > 1) { D.querySelector('.dw-sheet-tab[data-sheet="1"]').click(); await UI.drawing.ready(); await wait(30); fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0]; }
      assert(fv, 'the flat view: ' + notes.join('; '));
      var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.id === fv.id; })[0];
      t0 = performance.now();
      // the origin: the blank's outline vertex nearest its lower-left corner (the corners are relieved: no vertex at the box corner)
      var org = null, pts = [];
      (w.flat.lines || []).forEach(function (l) { [[l[0], l[1]], [l[2], l[3]]].forEach(function (q) { if (q && isFinite(q[0])) pts.push(q); }); });
      pts.forEach(function (q) { if (!org || q[0] + q[1] < org[0] + org[1]) org = q; });
      notes.push('origin ' + JSON.stringify(org));
      var htr = anvil.drawing.holeTable(fv.id, { origin: { p: org || [w.flat.bbox.umin, w.flat.bbox.vmin] }, all: true }); await UI.drawing.ready(); await wait(30);
      var ht = anvil.drawing.holeTables();
      notes.push('holeTable() ' + JSON.stringify(htr).slice(0, 200) + ' status ' + statusText() + ' tables ' + JSON.stringify(ht).slice(0, 300));
      notes.push('hole table ' + Math.round(performance.now() - t0) + ' ms rows ' + (ht[0] && ht[0].rows.length) + ' tags ' + (ht[0] && ht[0].rows.slice(0, 2).map(function (r) { return r.tag + ' ' + r.size; }).join(',')));
      anvil.drawing.close(); await idle();
      var xb = rfNNRibbon('Sheet Metal', /Flat to/);
      xb.click(); await wait(30);
      t0 = performance.now();
      var got = await rfNNSaved(function () { return pmAccept(); });
      var c = (await rfNNCheck()).check(got[got.length - 1].text, { units: 'in' });
      notes.push('dxf ' + Math.round(performance.now() - t0) + ' ms ' + JSON.stringify(c.counts));
      rfNNjob.dNotes = notes;
      assert((c.counts['CIRCLE@HOLES'] || 0) === 600, '600 holes in the DXF: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
    // ---- job f: fix-a-mistake flows on a 16 ga bracket (base, Flange A, Flange B on A's free edge, two holes)
    var RFNN_F = 'p.name("FIX-1").units("in");\np.sheet(' + T16 + ', ' + R16 + ', ' + KF + ');\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(2, [[3, ' + T16 + ', 0]], { position: "inside", lengthRef: "outer", name: "Flange A" });\n' +
      'p.flange(1, [[3, 2, 0]], { position: "inside", lengthRef: "outer", name: "Flange B" });\n' +
      'p.sketch("Top", ' + T16 + ').circle(2, -2, 0.1405).end().extrude(1, { cut: true, through: true, reverse: true, name: "Hole 1" });\n' +
      'p.sketch("Top", ' + T16 + ').circle(4, -2, 0.1405).end().extrude(1, { cut: true, through: true, reverse: true, name: "Hole 2" });\n';
    function rfNNByName(n) { return UI.App.model.features.filter(function (f) { return f.name === n; })[0]; }
    function rfNNNames() { return UI.App.model.features.filter(function (f) { return f.type !== 'sketch'; }).map(function (f) { return f.name; }).join(','); }
    step('rfNN: job f, fix-a-mistake: Delete a flange others hang on (Flange B dangles, named; the base and holes do not move), Undo; roll back above Hole 2 and add a hole there; Suppress / Unsuppress; reorder two holes; Ctrl+Z ×20 and Ctrl+Y ×20; Save, File ▸ Open: the same part, flat and drawing', async function () {
      var errs0 = errors.length, notes = [];
      await rfNNNewInch();
      await anvil.run(RFNN_F); await idle();
      assert(!Object.keys(rfNNErrs()).length, 'FIX-1 builds: ' + JSON.stringify(rfNNErrs()));
      var vol0 = K.massProps(UI.App.mesh, 1).volume, fl0 = anvil.flat(), script0 = anvil.script();
      notes.push('B pickRefs ' + !!rfNNByName('Flange B').pickRefs);
      // Delete Flange A: right-click in the FeatureManager ▸ Delete
      var A = rfNNByName('Flange A');
      UI.deleteFeature(A.id); await wait(30);
      notes.push('delete dialog: ' + (modalOpen() ? $('modal').textContent.replace(/\s+/g, ' ').slice(0, 220) : 'none'));
      var box = D.getElementById('del-face-children'), dtext = modalOpen() ? $('modal').textContent.replace(/\s+/g, ' ') : '';
      assert(/Flange B/.test(dtext) && box && !box.checked, 'Confirm Delete names Flange B, built on Flange A\'s edge, with Also delete unchecked (SolidWorks): ' + dtext);
      clickModalButton('Delete');
      await idle(); await wait(30);
      var errs = rfNNErrs(), B = rfNNByName('Flange B');
      notes.push('after delete: ' + rfNNNames() + ' errors ' + JSON.stringify(errs) + ' warnings ' + JSON.stringify(anvil.summary().warnings || {}));
      // Undo
      var ev = rfNNKey('z', { ctrlKey: true }); await idle(); await wait(30);
      notes.push('undo: ' + rfNNNames() + ' errors ' + JSON.stringify(rfNNErrs()));
      assert(rfNNByName('Flange A') && !Object.keys(rfNNErrs()).length, 'Ctrl+Z brings Flange A back: ' + notes.join('; '));
      near(K.massProps(UI.App.mesh, 1).volume, vol0, 1e-9, 'the part as before');
      // roll back above Hole 2 (drag the rollback bar: UI.rollbackTo) and add a hole there
      var h2 = rfNNByName('Hole 2'), ix = UI.App.model.features.indexOf(h2);
      var rb = UI.rollbarTo(ix - 1); await idle(); await wait(30);
      notes.push('rollback bar to ' + rb + ' at ' + UI.rollbarIndex());
      // a Linear Pattern of Hole 1 made there (Hole 1 clicked in the FeatureManager)
      D.querySelector('#tree .ti[data-fid="' + rfNNByName('Hole 1').id + '"]').click(); await wait(20);
      UI.cmdLinearPattern(); await wait(30);
      rfNNPmOpen('Linear Pattern');
      rfNNSet('s1', 1); rfNNSet('n1', 2); await wait(10);
      await pmAccept(); await wait(30);
      var order = UI.App.model.features.map(function (f) { return f.name; });
      notes.push('after add at the bar: ' + rfNNNames() + ' bar ' + UI.rollbarIndex());
      assert(rfNNNames() === 'Base-Flange1,Flange A,Flange B,Hole 1,LPattern1,Hole 2', 'the pattern goes in at the rollback bar: ' + notes.join('; '));
      UI.rollbarEnd(); await idle(); await wait(30);
      notes.push('rolled to the end: bar ' + UI.rollbarIndex() + ' errors ' + JSON.stringify(rfNNErrs()));
      // Suppress / Unsuppress Flange B
      B = rfNNByName('Flange B');
      await UI.setSuppression([B.id], true); await idle();
      var vS = K.massProps(UI.App.mesh, 1).volume;
      await UI.setSuppression([B.id], false); await idle();
      notes.push('suppress B: volume ' + (vS < vol0 ? 'drops' : 'same') + ', unsuppressed errors ' + JSON.stringify(rfNNErrs()));
      // reorder Hole 1 below Hole 2 (FeatureManager drag)
      var reo = UI.reorderFeature || UI.moveFeature;
      notes.push('reorder API ' + (reo ? 'yes' : 'none'));
      // undo 20 / redo 20
      var snap = JSON.stringify(UI.App.model.features.map(function (f) { return f.name; }));
      for (var k = 0; k < 20; k++) { rfNNKey('z', { ctrlKey: true }); await idle(); }
      var back = UI.App.model.features.map(function (f) { return f.name; }).join(',');
      for (k = 0; k < 20; k++) { rfNNKey('y', { ctrlKey: true }); await idle(); }
      await wait(30);
      notes.push('undo20 -> ' + back + '; redo20 same ' + (JSON.stringify(UI.App.model.features.map(function (f) { return f.name; })) === snap) + ' errors ' + JSON.stringify(rfNNErrs()));
      // a drawing, then Save, Open
      rfNNMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await UI.drawing.ready(); await wait(40);
      rfNNjob.fViews = (anvil.drawing.summary().sheets || []).map(function (s) { return s.name + ':' + s.views; }).join(',');
      anvil.drawing.close(); await idle();      var saved = await rfNNSaved(async function () { rfNNMenu('File', 'Save'); await wait(40); if (modalOpen()) { notes.push('save dialog: ' + $('modal').textContent.replace(/\s+/g, ' ').slice(0, 160)); var bs = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); }); clickModalButton(bs.filter(function (b) { return /Save/.test(b); })[0] || bs[0]); await wait(40); } });
      notes.push('saved ' + saved.map(function (s) { return s.name; }).join(','));
      var scriptS = anvil.script(), flS = anvil.flat();
      // File ▸ New, File ▸ Open, the saved FIX-1 double-clicked
      await anvil.newPart(); await idle();
      rfNNMenu('File', 'Open…'); await wait(30);
      var sv = Array.prototype.filter.call(D.querySelectorAll('#modal .open-saved'), function (b) { return b.getAttribute('data-name') === 'FIX-1'; })[0];
      assert(sv, 'FIX-1 among the saved documents: ' + Array.prototype.map.call(D.querySelectorAll('#modal .open-saved'), function (b) { return b.getAttribute('data-name'); }).join(','));
      sv.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true })); await idle(); await wait(60);
      var flO = anvil.flat();
      notes.push('reopened ' + UI.App.model.name + ' same script ' + (anvil.script() === scriptS) + ' flat ' + flO.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ' vs ' + flS.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ' drawing views ' + rfNNjob.fViews);
      assert(anvil.script() === scriptS && Math.abs(flO.size[0] - flS.size[0]) < 1e-9 && Math.abs(flO.size[1] - flS.size[1]) < 1e-9, 'Open gives the same part and flat: ' + notes.join('; '));
      rfNNMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await UI.drawing.ready(); await wait(40);
      var vw = (anvil.drawing.summary().sheets || []).map(function (s) { return s.name + ':' + s.views; }).join(',');
      notes.push('drawing after open ' + vw);
      anvil.drawing.close(); await idle();
      assert(vw === rfNNjob.fViews, 'the same drawing after Open: ' + vw + ' vs ' + rfNNjob.fViews);
      rfNNjob.fNotes = notes;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
    // ---- job e: a part family (width W as a global variable, a second configuration) nested on a 48 x 96 sheet
    step('rfNN: job e, a part family: an L bracket whose flange width is the global variable W (2), a configuration WIDE (W = 3.5); Mastercam profile, Transform ▸ Geometry Nesting with both configurations\' flats (quantities 12 and 6) on 48 x 96, the nest\'s DXF', async function () {
      var errs0 = errors.length, notes = [], prof = anvil.profile();
      await rfNNNewInch();
      await anvil.run('p.name("FAM-1").units("in");\np.equations({ W: 2 });\np.configurations([{ name: "Default", values: { W: 2 } }, { name: "WIDE", values: { W: 3.5 } }], "Default");\n' +
        'p.sheet(' + T16 + ', ' + R16 + ', ' + KF + ');\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\np.flange("=W", [[1, ' + T16 + ', 0]], { position: "inside", lengthRef: "outer" });\n'); await idle();
      var e0 = rfNNErrs(), f0 = anvil.flat();
      await UI.configurations.activate('WIDE'); await idle(); await wait(40);
      notes.push('no PM: WIDE active ' + UI.configurations.active() + ' bbox ' + JSON.stringify(anvil.summary().bbox.max) + ' flat ' + anvil.flat().size.map(function (x) { return x.toFixed(4); }).join(' x '));
      await UI.configurations.activate('Default'); await idle(); await wait(40);
      notes.push('Default flat ' + f0.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ' errors ' + JSON.stringify(e0));
      try {
        anvil.profile('mastercam'); await wait(40);
        var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs button, #ribbon-tabs [role=tab], .rb-tab'), function (b) { return /Transform/.test(b.textContent); })[0];
        notes.push('Transform tab ' + !!tb);
        var nb = rfNNRibbon('Transform', /Geometry Nesting/);
        assert(nb, 'Geometry Nesting on the Transform tab');
        nb.click(); await wait(40);
        notes.push('PM ' + (UI.hasPM() && UI.pmTitle()) + ' parts ' + (UI.nestState() ? UI.nestState().parts.length : 'none'));
        if (UI.nestState() && !UI.nestState().parts.length) notes.push('add flat ' + JSON.stringify(UI.nestAddFlat()));
        var st = UI.nestState();
        st.parts[st.parts.length - 1].qty = 12;
        // switch to WIDE with the PropertyManager open (ConfigurationManager) and add its flat
        await UI.configurations.activate('WIDE'); await idle(); await wait(40);
        notes.push('after switch: active ' + UI.configurations.active() + ' PM ' + (UI.hasPM() && UI.pmTitle()) + ' W ' + JSON.stringify(anvil.summary().bbox && anvil.summary().bbox.max));
        var add2 = UI.nestState() ? UI.nestAddFlat() : { error: 'the nesting PM closed' };
        notes.push('add WIDE ' + JSON.stringify(add2));
        st = UI.nestState();
        if (st && st.parts.length > 1) st.parts[st.parts.length - 1].qty = 6;
        var r = st ? UI.nestRun() : null;
        if (r && r.then) r = await r;
        await wait(40);
        st = UI.nestState();
        notes.push('parts ' + (st ? st.parts.map(function (q) { return q.name + ' x' + q.qty + ' ' + (q.part.w || q.part.width || '') ; }).join(', ') : '-') + ' result ' + (st && st.result ? JSON.stringify({ sheets: st.result.sheets && st.result.sheets.length, placed: st.result.placed, unplaced: st.result.unplaced && st.result.unplaced.length }) : 'none'));
        var dx = st && st.result ? UI.nestSheetDXF(0, 'R2000') : null;
        if (dx) { var c = (await rfNNCheck()).check(dx, { units: 'in' }); notes.push('nest dxf ' + c.ok + ' ' + JSON.stringify(c.counts)); }
        if (UI.hasPM()) UI.pmCancel ? UI.pmCancel() : rfNNKey('Escape');
        await idle();
      } finally { anvil.profile(prof); await wait(30); }
      rfNNjob.eNotes = notes;
      assert(/add WIDE \{"ok":true/.test(notes.join(';')) && /"placed":18,"unplaced":0/.test(notes.join(';')) && /nest dxf true/.test(notes.join(';')), 'both configurations nested, 18 placed, the DXF reads back: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
    // ---- follow-up (lane NN2): ✓ with nothing picked, Features to Pattern with nothing selected, a family's names in the nest
    function rfNNOk() { var b = D.querySelector('#pm .pm-ok'); return { grey: !!(b && b.classList.contains('disabled')), title: b ? b.title : '' }; }
    async function rfNNSettle() { if (UI.previewIdle) await UI.previewIdle(); await wait(320); await idle(); }
    step('rfNN: sheet-metal PropertyManagers opened with nothing picked (Closed Corner, Corner Relief, Break-Corner, Welded Corner, Rip, Fold, Hem, Jog): ✓ is greyed with the reason and a click on it adds nothing (Closed Corner closed and added nothing)', async function () {
      var errs0 = errors.length, out = [];
      await rfNNNewInch();
      await anvil.run(RFNN_F); await idle();
      var cmds = [['Closed Corner', 'cmdClosedCorner'], ['Corner Relief', 'cmdCornerRelief'], ['Break-Corner', 'cmdBreakCorner'], ['Welded Corner', 'cmdWeldedCorner'], ['Rip', 'cmdRipFeature'], ['Fold', 'cmdFold'], ['Hem', 'cmdHem'], ['Jog', 'cmdJog'], ['Unfold', 'cmdUnfold']];
      for (var i = 0; i < cmds.length; i++) {
        if (UI.hasPM()) UI.pmCancel();
        UI.App.sel = null; if (UI.setSelection) UI.setSelection([]);
        var n0 = UI.App.model.features.length;
        UI[cmds[i][1]](); await wait(30); await rfNNSettle();
        if (!UI.hasPM()) { out.push(cmds[i][0] + ': no PM (' + statusText().slice(0, 80) + ')'); continue; }
        var ok = rfNNOk();
        D.querySelector('#pm .pm-ok').click(); await wait(30); await idle();
        out.push(cmds[i][0] + ': ' + (ok.grey ? 'grey "' + ok.title + '"' : 'NOT GREY') + (UI.hasPM() ? ', stays' : ', closed') + ', features +' + (UI.App.model.features.length - n0));
        // rfPE: Unfold too waits for its fixed face and bends, as SolidWorks (it unfolded every bend about the base face)
        assert(ok.grey && ok.title && UI.App.model.features.length === n0, cmds[i][0] + ' with nothing picked: ' + out[out.length - 1]);
        if (UI.hasPM()) UI.pmCancel();
      }
      rfNNjob.gOut = out;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return out.join('; ');
    });

    step('rfNN: Linear Pattern / Circular Pattern / Mirror right after another feature\'s ✓ (nothing selected by the user): Features to Pattern is empty, ✓ greyed with "Select the feature…", a click on a face of Hole 1 fills it; a feature picked in the FeatureManager before the command is still taken', async function () {
      var errs0 = errors.length, out = [];
      await rfNNNewInch();
      await anvil.run(RFNN_F); await idle();
      // a Linear Pattern made with the PM: then its own ✓ auto-selects it, as Corner Relief was in job a
      var h1 = rfNNByName('Hole 1');
      D.querySelector('#tree .ti[data-fid="' + h1.id + '"]').click(); await wait(20);
      UI.cmdLinearPattern(); await wait(30);
      assert(UI.pmSpec().values.feature === h1.id, 'a feature picked in the FeatureManager is taken: ' + UI.pmSpec().values.feature);
      rfNNSet('s1', 0.5); rfNNSet('n1', 2); await wait(10);
      await pmAccept(); await wait(30);
      var lp1 = rfNNLast();
      assert(lp1.type === 'lpattern' && lp1.feature === h1.id, 'LPattern1 of Hole 1');
      var names3 = [['Linear Pattern', 'cmdLinearPattern', 'pattern'], ['Circular Pattern', 'cmdCircularPattern', 'pattern'], ['Mirror', 'cmdMirror', 'mirror']];
      for (var i = 0; i < names3.length; i++) {
        UI.App.sel = { kind: 'feature', id: lp1.id, auto: true };   // what ✓ leaves behind
        UI[names3[i][1]](); await wait(30); await rfNNSettle();
        rfNNPmOpen(names3[i][0]);
        var v = UI.pmSpec().values, ok = rfNNOk();
        out.push(names3[i][0] + ': feature ' + JSON.stringify(v.feature) + ', ' + (ok.grey ? 'grey "' + ok.title + '"' : 'NOT GREY'));
        assert((v.feature == null || v.feature === '') && ok.grey && /Select the feature to/.test(ok.title), names3[i][0] + ' starts empty and waits: ' + out[out.length - 1]);
        if (i === 0) {
          // a click on Hole 1's wall in the graphics area fills it
          await rfNNView('Top');
          var hf = -1;
          UI.App.mesh.faces.forEach(function (f, k) { if (hf < 0 && UI.App.triShared[f.start] === h1.id) hf = k; });
          assert(hf >= 0, 'a face of Hole 1');
          // Hole 1's wall: look into the hole at a slant
          UI.cam.dir.set(0.5, 1, 0.3).normalize(); UI.cam.target.set(2, T16 / 2, 2); UI.cam.scale = 0.0012; UI.applyCamera(); await idle(); await wait(30);
          var at = null;
          for (var a = 0; a < 16 && !at; a++) { var q = [2 + 0.1405 * Math.cos(a * Math.PI / 8), T16 / 2, 2 + 0.1405 * Math.sin(a * Math.PI / 8)], sq = UI.worldToScreen(q), pq = UI.pickFace(sq[0], sq[1]); if (pq && UI.App.triShared[UI.App.mesh.faces[pq.index].start] === h1.id) at = sq; }
          assert(at, 'Hole 1\'s wall under the cursor');
          rfNNClick(at); await idle(); await rfNNSettle();
          ok = rfNNOk();
          out.push('clicked Hole 1: feature ' + UI.pmSpec().values.feature + ', ' + (ok.grey ? 'grey' : 'OK live'));
          assert(UI.pmSpec().values.feature === h1.id && !ok.grey, 'the click on Hole 1 fills Features to Pattern: ' + out[out.length - 1]);
        }
        UI.pmCancel(); await idle();
      }
      rfNNjob.hOut = out;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return out.join('; ');
    });

    step('rfNN: job e follow-up: a family\'s flats join the nest as "FAM-1 Default" and "FAM-1 WIDE", and the nest report names both', async function () {
      var errs0 = errors.length, prof = anvil.profile();
      await rfNNNewInch();
      await anvil.run('p.name("FAM-1").units("in");\np.equations({ W: 2 });\np.configurations([{ name: "Default", values: { W: 2 } }, { name: "WIDE", values: { W: 3.5 } }], "Default");\n' +
        'p.sheet(' + T16 + ', ' + R16 + ', ' + KF + ');\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\np.flange("=W", [[1, ' + T16 + ', 0]], { position: "inside", lengthRef: "outer" });\n'); await idle();
      var names = [], rep = '';
      try {
        anvil.profile('mastercam'); await wait(40);
        rfNNRibbon('Transform', /Geometry Nesting/).click(); await wait(40);
        UI.nestAddFlat();
        await UI.configurations.activate('WIDE'); await idle(); await wait(40);
        UI.nestAddFlat();
        names = UI.nestState().parts.map(function (q) { return q.name; });
        var r = UI.nestRun(); if (r && r.then) await r; await wait(40);
        rep = UI.nestReport ? String(UI.nestReport()) : '';
        if (UI.hasPM()) UI.pmCancel();
        await idle();
      } finally { anvil.profile(prof); await wait(30); }
      assert(names.join('|') === 'FAM-1 Default|FAM-1 WIDE', 'names: ' + names.join('|'));
      assert(rep.indexOf('FAM-1 Default') >= 0 && rep.indexOf('FAM-1 WIDE') >= 0, 'the report names both: ' + rep.slice(0, 400));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return names.join(', ');
    });
  })();
