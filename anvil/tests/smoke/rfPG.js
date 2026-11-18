  // --- rfPG (2026-11-17, lane shopflow5, test-reports/2026-11-17-shop-flow-5.md) --- the shop audit, round 5: five
  // whole jobs on INCH parts driven like a user (ribbon / menus / PropertyManagers, clicks and Smart Dimension in the
  // viewport): (1) a 16 ga enclosure lid with a Closed Corner, a knockout pattern, its drawing, Hole Table, DXF and PDF;
  // (2) an 11 ga gusset bracket with a Sketched Bend, a Hem and a Mirror, edited after the mirror; (3) a part from a
  // customer DXF and its flat DXF compared entity by entity; (4) job 3 in the Mastercam profile; (5) the lid on a box in
  // an assembly, exploded, with its drawing, BOM and balloons. Self-contained; every setting changed is put back.
  (function () {
    var T16 = 0.0598, R16 = 0.06, K44 = 0.44, T11 = 0.1196, R11 = 0.12;
    var rfPGjob = {};
    function rfPGBD(R, T, K) { return 2 * (R + T) - Math.PI / 2 * (R + K * T); }
    function rfPGScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
    function rfPGEv(type, p, mods) {
      // as a browser sends them: to the element under the pointer (the viewport, bubbling to the window) while inside it
      var r = $('viewport').getBoundingClientRect(), inside = p[0] >= 0 && p[1] >= 0 && p[0] <= r.width && p[1] <= r.height;
      (inside || type === 'mousedown' || type === 'click' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: W, button: 0, detail: type === 'mousemove' ? 0 : 1, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
    }
    // a click as a hand makes it: the pointer comes to rest, then down / up
    async function rfPGClickAt(p, mods) { rfPGEv('mousemove', [p[0] + 3, p[1] + 2], Object.assign({ buttons: 0 }, mods || {})); await wait(15); rfPGEv('mousemove', p, Object.assign({ buttons: 0 }, mods || {})); await wait(15); rfPGEv('mousedown', p, mods); rfPGEv('mouseup', p, mods); rfPGEv('click', p, mods); await wait(25); }
    async function rfPGSk(uv, mods) { await rfPGClickAt(rfPGScr(uv), mods); }
    function rfPGKey(k, mods) { var ev = new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {})); D.dispatchEvent(ev); return ev; }
    function rfPGRibbon(tab, re) {
      UI.setRibbonTab(tab);
      return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim()); })[0];
    }
    function rfPGMenu(name, label) {
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
    async function rfPGSaved(fn) {
      var got = [], sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: text }); };
      UI.download = function (name, data) { got.push(typeof data === 'string' ? { name: name, text: data } : { name: name, bytes: data }); };
      try { await fn(); await idle(); await wait(30); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    function rfPGCheck() {
      if (window.DxfCheck) return Promise.resolve(window.DxfCheck);
      return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '../headless/dxf-check.js'; s.onload = function () { res(window.DxfCheck); }; s.onerror = function () { rej(new Error('dxf-check.js did not load')); }; document.head.appendChild(s); });
    }
    function rfPGErrs() { return anvil.summary().errors || {}; }
    function rfPGLast() { var fs = UI.App.model.features; return fs[fs.length - 1]; }
    function rfPGByName(n) { return UI.App.model.features.filter(function (f) { return f.name === n; })[0]; }
    async function rfPGNewInch() {
      var du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      assert(UI.unitLabel() === 'in', 'an inch part');
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    }
    function rfPGPmOpen(title) { assert(UI.hasPM() && UI.pmTitle() === title, title + ' PM: ' + (UI.hasPM() && UI.pmTitle())); }
    function rfPGSet(key, val) {
      var el = D.querySelector('#pm [data-key="' + key + '"]');
      assert(el, 'PM field ' + key + ': ' + Array.prototype.map.call(D.querySelectorAll('#pm [data-key]'), function (x) { return x.getAttribute('data-key'); }).join(','));
      if (el.type === 'checkbox') { if (!!el.checked !== !!val) el.click(); } else setInput(el, val);
    }
    function rfPGF(x) { return (+x).toFixed(4); }
    function rfPGDone(notes) { if (/rfpgdump/.test(location.search)) assert(false, 'DUMP ' + notes.join('; ')); return notes.join('; '); }
    function rfPGVol() { return K.massProps(UI.App.mesh, 1).volume; }
    async function rfPGView(name) { UI.setView(name); if (UI.zoomToFit) UI.zoomToFit(); for (var i = 0; i < 40 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(25); await idle(); await wait(30); }
    // the sketch view: w x h inches across the viewport, the origin at (ox, oy) of its size
    function rfPGFrame(w, h, ox, oy) {
      var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
      UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(UI.size.w / w, UI.size.h / h));
      var o = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0));
      UI.panView(UI.size.w * ox - o[0], UI.size.h * oy - o[1]);
      UI.updateSketches();
    }
    // Smart Dimension by clicks: the pieces, then where the text goes; the Modify box takes the value
    async function rfPGDim(picks, place, value) {
      UI.setTool('dimension'); await wait(20);
      var dwell = UI.dimMidDwell(); UI.dimMidDwell(1e9);
      try {
        for (var k = 0; k < picks.length; k++) await rfPGSk(picks[k]);
        await rfPGSk(place); await wait(50);
      } finally { UI.dimMidDwell(dwell); }
      var inp = D.querySelector('#dim-edit input');
      assert(inp && !$('dim-edit').hidden, 'Modify box open after dimensioning ' + JSON.stringify(picks) + ' (' + statusText() + ')');
      var shown = inp.value;
      if (value != null) { setInput(inp, value); pressEnter(inp); await wait(60); }
      if (!$('dim-edit').hidden) { rfPGKey('Escape'); await wait(20); }
      return shown;
    }
    function rfPGEnts(f) { return (f || UI.activeSketchFeature()).entities.map(function (e) { return e.t + '(' + ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r'].filter(function (k) { return e[k] != null; }).map(function (k) { return (+e[k]).toFixed(4); }).join(',') + ')'; }).join(' '); }

    // ---- job 1: a 16 ga electrical enclosure lid 10 x 6, 1 in flanges down
    var BD16 = rfPGBD(R16, T16, K44);
    step('rfPG: job 1, 16 ga enclosure lid: Base Flange/Tab ▸ Top Plane, a corner rectangle by two clicks, Smart Dimension 10 and 6 typed, Exit Sketch, T / R / K typed ✓; Edge-Flange on the four edges (1 in, Material Inside) ✓; Corners ▸ Closed Corner on the four corners: the blank 10 + 2 (1 − BD) x 6 + 2 (1 − BD)', async function () {
      var errs0 = errors.length, notes = [];
      await rfPGNewInch();
      var bf = rfPGRibbon('Sheet Metal', /Base Flange/);
      assert(bf, 'Base Flange on the ribbon');
      bf.click(); await wait(30);
      rfPGPmOpen('Base Flange/Tab');
      clickPmButton('Top Plane'); await idle(); await wait(30);
      assert(UI.App.mode === 'sketch', 'sketching on Top');
      var grid = UI.App.view.showGrid; UI.App.view.showGrid = false; UI.App.gridStale = true;
      try {
        rfPGFrame(14, 9, 0.1, 0.15); await wait(30);
        UI.setTool('rect'); await wait(20);
        await rfPGSk([0, 0]); await rfPGSk([9.63, -5.71]); await wait(30);
        rfPGKey('Escape'); await wait(20);
        var sk = UI.activeSketchFeature();
        notes.push('drawn ' + rfPGEnts(sk));
        // Smart Dimension: the top line (y 0), then the right line
        var s10 = await rfPGDim([[4.8, 0]], [4.8, 1.2], '10');
        var s6 = await rfPGDim([[9.6 + (10 - 9.63), -3]], [11.4, -3], '6');
        notes.push('Modify boxes showed ' + s10 + ' / ' + s6);
        notes.push('dimensioned ' + rfPGEnts(sk));
        var an = W.SketchSolver.analyze(sk);
        notes.push('status ' + (an.status || an.state || JSON.stringify(an).slice(0, 80)));
      } finally { UI.App.view.showGrid = grid; UI.App.gridStale = true; }
      UI.setTool('select');
      await UI.exitSketch(); await idle(); await wait(40);
      rfPGPmOpen('Base Flange/Tab');
      setInput(pmField('Thickness'), T16); await wait(10);
      setInput(pmField('Bend radius'), R16); await wait(10);
      var kf = pmField('K-factor'); if (kf) setInput(kf, K44); await wait(10);
      await pmAccept(); await wait(30);
      assert(!Object.keys(rfPGErrs()).length, 'base flange: ' + JSON.stringify(rfPGErrs()));
      var bb = UI.App.build.body.getBounds();
      notes.push('base ' + [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]].map(rfPGF).join(' x '));
      near(bb.max[0] - bb.min[0], 10, 1e-9, 'base X'); near(bb.max[2] - bb.min[2], 6, 1e-9, 'base Z');
      rfPGjob.lidBase = [bb.min.slice(), bb.max.slice()];
      // Edge-Flange: the four bottom edges of the base (the lid's flanges go down), one PM
      await rfPGView('Isometric');
      rfPGRibbon('Sheet Metal', /Edge Flange/).click(); await wait(30);
      rfPGPmOpen('Edge-Flange');
      var mids = [[5, 0, 0], [10, 0, 3], [5, 0, 6], [0, 0, 3]];
      UI.setView('Dimetric');
      for (var i = 0; i < mids.length; i++) {
        var e = edgeNear(mids[i]);
        notes.push('edge ' + i + ' ' + JSON.stringify(e.mid.map(function (x) { return +x.toFixed(3); })));
        await rfPGClickAt(UI.worldToScreen(e.mid)); await idle(); await wait(20);
      }
      var fv = UI.pmSpec().values;
      notes.push('EF values ' + JSON.stringify(fv).slice(0, 600));
      assert(fv.edges.length === 4, 'four edges taken: ' + fv.edges.length + ' ' + statusText());
      setInput(pmField('Position'), 'inside'); await wait(10);
      setInput(pmField('Length'), 1); await wait(10);
      await pmAccept(); await wait(30);
      var f = rfPGLast();
      assert(f.type === 'flange' && !rfPGErrs()[f.id], 'Edge-Flange1: ' + JSON.stringify(rfPGErrs()));
      bb = UI.App.build.body.getBounds();
      notes.push('box ' + JSON.stringify([bb.min, bb.max].map(function (p) { return p.map(rfPGF); })));
      near(bb.max[1] - bb.min[1], 1, 1e-9, 'flanges 1 in outside, down');
      assert(bb.min[1] < -0.9, 'the flanges go down (a lid): ' + bb.min[1]);
      // Corners ▸ Closed Corner: three end faces (the front pair coplanar), looked at from below and outside
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0];
      assert(caret && !caret.disabled, 'the Corners flyout');
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var mi = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf('Closed Corner') >= 0; })[0];
      assert(mi, 'Closed Corner in the flyout'); mi.click(); await wait(30);
      rfPGPmOpen('Closed Corner');
      var y = -0.5, g = R16 + T16, picks = [{ at: [T16 / 2, y, g], from: [-0.15, 0, -1] }, { at: [10 - g, y, 6 - T16 / 2], from: [1, 0, 0.15] }, { at: [T16 / 2, y, 6 - g], from: [-0.15, 0, 1] }];
      for (i = 0; i < picks.length; i++) {
        var c = UI.cam, d = new W.THREE.Vector3(picks[i].from[0], 0.1, picks[i].from[2]).normalize(), P = picks[i].at;
        c.dir.copy(d); c.up.set(0, 1, 0); c.target.set(P[0], P[1], P[2]); c.scale = 0.0015;
        UI.applyCamera(); await idle(); await wait(30);
        var s = UI.worldToScreen(P), pk = UI.pickFace(s[0], s[1]);
        notes.push('corner pick ' + i + ' under the cursor ' + JSON.stringify(pk && pk.point && pk.point.map(rfPGF)));
        await rfPGClickAt(s); await idle(); await wait(20);
        notes.push('faces ' + UI.pmSpec().values.faces.length + ' ' + statusText().slice(0, 300));
      }
      var cv = UI.pmSpec().values, okb = D.querySelector('#pm .pm-ok');
      notes.push('Closed Corner ' + JSON.stringify({ type: cv.cornerType, gap: cv.gap, faces: cv.faces.length, coplanar: cv.coplanar }) + ' ✓ ' + (okb.classList.contains('disabled') ? 'grey: ' + okb.title : 'lit'));
      // the four-edge flange left the corners .0071 open; the default gap (.010) is wider: type .005 (a tighter corner)
      var gp = pmField('Gap distance');
      gp.focus(); gp.select(); setInput(gp, '.005'); pressEnter(gp); await idle();
      if (UI.previewIdle) await UI.previewIdle(); await wait(200); await idle();
      okb = D.querySelector('#pm .pm-ok');
      notes.push('gap .005: ' + statusText().slice(0, 200) + ' ✓ ' + (okb.classList.contains('disabled') ? 'grey: ' + okb.title : 'lit'));
      await pmAccept(); await wait(30);
      var cc = rfPGLast();
      notes.push(cc.name + ' ' + (rfPGErrs()[cc.id] || 'ok') + ' warnings ' + JSON.stringify(anvil.summary().warnings || {}));
      assert(cc.type === 'closedCorner' && cc.faces.length === 3 && !rfPGErrs()[cc.id], 'Closed Corner1: ' + JSON.stringify(rfPGErrs()) + ' | ' + notes.join('; '));
      var fl = anvil.flat();
      notes.push('blank ' + fl.size.map(rfPGF).join(' x ') + ' loops ' + fl.loops.length + ' (hand ' + rfPGF(12 - 2 * BD16) + ' x ' + rfPGF(8 - 2 * BD16) + ')');
      near(Math.max(fl.size[0], fl.size[1]), 12 - 2 * BD16, 1e-6, 'blank length 10 + 2 (1 − BD)');
      near(Math.min(fl.size[0], fl.size[1]), 8 - 2 * BD16, 1e-6, 'blank width 6 + 2 (1 − BD)');
      assert(fl.loops.length === 1, 'one outline: ' + fl.loops.length);
      rfPGjob.lid = true;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });

    async function rfPGLook(P, dir, scale) {
      var c = UI.cam, d = new W.THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
      c.dir.copy(d); c.up.set(0, 1, 0); c.target.set(P[0], P[1], P[2]); c.scale = scale || 0.004;
      UI.applyCamera(); await idle(); await wait(30);
    }
    function rfPGFrom3D(P) { var pl = UI.activePlane(), uv = K.to2D(pl, P); return [uv[0], uv[1]]; }
    function rfPGRowEv(row, type, detail) {
      var r = row.getBoundingClientRect(), nm = row.querySelector('.nm') || row;
      nm.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, view: W, button: 0, detail: detail || 1, clientX: r.left + 40, clientY: r.top + r.height / 2 }));
    }
    function rfPGRow(id) { return D.querySelector('#tree .ti[data-fid="' + id + '"]'); }
    function rfPGClickRow(id) { var row = rfPGRow(id); assert(row, 'tree row ' + id); rfPGRowEv(row, 'mousedown'); rfPGRowEv(row, 'mouseup'); rfPGRowEv(row, 'click'); }
    function rfPGDblRow(id) { rfPGClickRow(id); var row = rfPGRow(id); rfPGRowEv(row, 'mousedown', 2); rfPGRowEv(row, 'mouseup', 2); rfPGRowEv(row, 'click', 2); rfPGRowEv(rfPGRow(id), 'dblclick', 2); }

    step('rfPG: job 1, knockouts: the lid\'s top face clicked, Features ▸ Extruded Cut (a sketch on the face), a circle by two clicks, Smart Dimension Ø.875 and its centre 2 / 3 from the origin, Exit Sketch, Through All ✓; Linear Pattern ×4 at 2 from the PM: four Ø.875 holes in the blank', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfPGjob.lid && rfPGLast().type === 'closedCorner', 'job 1 lid first');
      await rfPGView('Isometric');
      var top = UI.worldToScreen([5, T16, 3]);
      await rfPGClickAt(top); await idle(); await wait(20);
      notes.push('selected ' + JSON.stringify(UI.App.sel && { kind: UI.App.sel.kind, n: UI.App.sel.normal }));
      var ctx = UI.asmPopup && UI.asmPopup();
      notes.push('context toolbar after the face click: ' + (ctx ? ctx.buttons.join(',') : 'none'));
      assert(UI.App.sel && UI.App.sel.kind === 'face' && ctx && ctx.buttons.indexOf('sketch') >= 0, 'the top face selected, its context toolbar shown: ' + notes.join('; '));
      var cutB = rfPGRibbon('Features', /Extruded Cut|Cut-Extrude/);
      assert(cutB, 'Extruded Cut on the Features tab');
      cutB.click(); await idle(); await wait(40);
      notes.push('after Extruded Cut: mode ' + UI.App.mode + ' PM ' + (UI.hasPM() && UI.pmTitle()));
      assert(UI.App.mode === 'sketch', 'a sketch on the top face: ' + UI.App.mode + ' ' + statusText());
      var grid = UI.App.view.showGrid; UI.App.view.showGrid = false; UI.App.gridStale = true;
      var sk = UI.activeSketchFeature();
      try {
        var o = rfPGFrom3D([0, T16, 0]), c = rfPGFrom3D([2, T16, 3]);
        notes.push('plane origin uv ' + o.map(rfPGF) + ' centre uv ' + c.map(rfPGF));
        rfPGFrame(12, 8, 0.2, 0.2); await wait(30);
        UI.setTool('circle'); await wait(20);
        var c0 = [c[0] + 0.07, c[1] - 0.04];
        await rfPGSk(c0); await rfPGSk([c0[0] + 0.41, c0[1]]); await wait(30);
        rfPGKey('Escape'); await wait(20);
        notes.push('drawn ' + rfPGEnts(sk));
        var ci = sk.entities.filter(function (e) { return e.t === 'circle'; })[0];
        assert(ci, 'a circle: ' + rfPGEnts(sk));
        var sd = await rfPGDim([[ci.cx + ci.r * Math.SQRT1_2, ci.cy + ci.r * Math.SQRT1_2]], [ci.cx + 1.2, ci.cy + 1.0], '.875');
        notes.push('diameter box showed ' + sd);
        // the centre from the sketch origin: a horizontal and a vertical dimension (placed below / to the left)
        var org = rfPGFrom3D([0, T16, 0]);
        var sx = await rfPGDim([org, [ci.cx, ci.cy]], [(org[0] + ci.cx) / 2, Math.min(org[1], ci.cy) - 0.9], String(Math.abs(c[0] - o[0])));
        var sy = await rfPGDim([org, [ci.cx, ci.cy]], [Math.min(org[0], ci.cx) - 0.9, (org[1] + ci.cy) / 2], String(Math.abs(c[1] - o[1])));
        notes.push('centre boxes showed ' + sx + ' / ' + sy);
        notes.push('dimensioned ' + rfPGEnts(sk) + ' dims ' + JSON.stringify((sk.dims || []).map(function (d) { return d.k + '=' + d.v; })) + ' rels ' + JSON.stringify((sk.rels || []).map(function (r) { return r.type + (r.v != null ? '=' + r.v : ''); })));
      } finally { UI.App.view.showGrid = grid; UI.App.gridStale = true; }
      UI.setTool('select');
      await UI.exitSketch(); await idle(); await wait(40);
      notes.push('PM ' + (UI.hasPM() && UI.pmTitle()));
      var es = pmField('End condition') || D.querySelector('#pm select');
      if (es) { var opt = Array.prototype.filter.call(es.options, function (x) { return /Through All/i.test(x.textContent); })[0]; if (opt) setInput(es, opt.value); }
      await wait(20);
      var v0 = rfPGVol();
      await pmAccept(); await wait(30);
      var cut = rfPGLast();
      notes.push(cut.name + ' ' + JSON.stringify({ cut: cut.cut, through: cut.through, end: cut.end || cut.endCondition }) + ' removes ' + (v0 - rfPGVol()).toFixed(6) + ' (π·.4375²·T ' + (Math.PI * 0.4375 * 0.4375 * T16).toFixed(6) + ')');
      assert(cut.cut && !rfPGErrs()[cut.id], 'the cut: ' + JSON.stringify(rfPGErrs()) + ' | ' + notes.join('; '));
      var cs = UI.App.model.features.filter(function (f) { return f.id === cut.sketch || f.id === cut.sketchId; })[0] || sk;
      var cc = cs.entities.filter(function (e) { return e.t === 'circle'; })[0], w3 = K.to3D(K.planeOf ? K.planeOf(cs) : UI.App.build.planes && UI.App.build.planes[cs.id] || cs.plane, cc.cx, cc.cy);
      notes.push('circle Ø' + rfPGF(2 * cc.r));
      near(2 * cc.r, 0.875, 1e-9, 'Ø.875');
      near(v0 - rfPGVol(), Math.PI * 0.4375 * 0.4375 * T16, 1e-6, 'one hole through the top');
      // Linear Pattern from the PM, the cut picked in the FeatureManager first
      rfPGClickRow(cut.id); await idle(); await wait(20);
      if (UI.asmPopup && UI.asmPopup()) notes.push('row toolbar ' + UI.asmPopup().buttons.join(','));
      var lpb = rfPGRibbon('Features', /Linear Pattern/);
      assert(lpb, 'Linear Pattern on the Features tab');
      lpb.click(); await idle(); await wait(30);
      rfPGPmOpen('Linear Pattern');
      var lv = UI.pmSpec().values;
      notes.push('LP defaults ' + JSON.stringify({ feature: lv.feature, features: lv.features, d1: lv.d1, s1: lv.s1, n1: lv.n1, d2: lv.d2 }).slice(0, 300));
      rfPGSet('s1', 2); rfPGSet('n1', 4); await wait(20);
      if (lv.d2) { rfPGSet('d2', ''); await wait(20); }
      await pmAccept(); await wait(30);
      var lp = rfPGLast();
      notes.push(lp.name + ' ' + (rfPGErrs()[lp.id] || 'ok'));
      var fl = anvil.flat(), holes = fl.loops.slice(1).map(function (l) { var b = l.reduce(function (a, p) { return [Math.min(a[0], p[0]), Math.max(a[1], p[0]), Math.min(a[2], p[1]), Math.max(a[3], p[1])]; }, [1e9, -1e9, 1e9, -1e9]); return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, b[1] - b[0]]; });
      notes.push('flat holes ' + JSON.stringify(holes.map(function (h) { return h.map(function (x) { return +x.toFixed(4); }); })));
      assert(lp.type === 'lpattern' || /pattern/i.test(lp.type), 'a pattern: ' + lp.type);
      assert(holes.length === 4 && holes.every(function (h) { return Math.abs(h[2] - 0.875) < 2e-3; }), 'four Ø.875 holes in the blank: ' + notes.join('; '));
      var xs = holes.map(function (h) { return h[0]; }).sort(function (a, b) { return a - b; });
      near(xs[3] - xs[0], 6, 1e-6, 'holes 2 apart (6 from first to last)');
      rfPGjob.lidHoles = true;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });

    step('rfPG: job 1, a change from the FeatureManager: double-click Edge-Flange1 shows its dimensions on the model, a click on the flange length opens its Modify box, 1.25 Enter: one rebuild, the Closed Corner and the knockouts follow, the blank grows by 2 × .25; Ctrl+Z puts 1 back', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfPGjob.lidHoles, 'job 1 knockouts first');
      await rfPGView('Isometric');
      var ef = rfPGByName('Edge-Flange1'), fl0 = anvil.flat(), undo0 = UI.App.undo.length;
      rfPGDblRow(ef.id); await idle(); await wait(30);
      notes.push('PM after the double-click ' + (UI.hasPM() && UI.pmTitle()) + ', dims shown for ' + UI.featureDimsShown());
      assert(UI.featureDimsShown() === ef.id, 'Edge-Flange1\'s dimensions shown: ' + notes.join('; '));
      UI.drawDims();
      var hs = anvil.instant3D().handles;
      UI.drawDims();
      notes.push('handles' + hs.map(function (h) { return h.kind + (h.value != null ? '=' + (+h.value).toFixed(4) : ''); }).join(','));
      var texts = Array.prototype.map.call(D.querySelectorAll('#i3d-layer .i3d-dim-text, #i3d-layer .pe-fdim'), function (t) { return t.textContent + '@' + (t.closest('g') && t.closest('g').getAttribute('data-kind')); });
      notes.push('texts ' + texts.join(','));
      var lt = Array.prototype.filter.call(D.querySelectorAll('#i3d-layer g.i3d .pe-fdim, #i3d-layer g.i3d .i3d-dim-text'), function (t) { return Math.abs(parseFloat(t.textContent) - 1) < 1e-9; })[0];
      assert(lt, 'the flange length 1 written on the model: ' + notes.join('; '));
      lt.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, button: 0, buttons: 1 })); await idle();
      var ed = UI.instant3DEditOpen();
      notes.push('Modify box ' + JSON.stringify(ed));
      assert(ed && Math.abs(ed.value - 1) < 1e-9, 'the Modify box of the flange length: ' + notes.join('; '));
      var inp = D.querySelector('#viewport input[aria-label="Instant3D value"]');
      assert(inp && inp.offsetParent !== null, 'the value box on screen');
      inp.focus(); inp.value = '1.25'; inp.dispatchEvent(new W.Event('input', { bubbles: true }));
      pressEnter(inp); await idle(); await wait(60); await idle();
      var fl = anvil.flat();
      notes.push('length ' + rfPGByName('Edge-Flange1').length + ' undo steps ' + (UI.App.undo.length - undo0) + ' errors ' + JSON.stringify(rfPGErrs()) + ' blank ' + fl.size.map(rfPGF).join(' x ') + ' holes ' + (fl.loops.length - 1));
      near(+rfPGByName('Edge-Flange1').length, 1.25, 1e-12, 'Edge-Flange1 1.25');
      near(Math.max(fl.size[0], fl.size[1]), Math.max(fl0.size[0], fl0.size[1]) + 0.5, 1e-6, 'the blank grows by 2 × .25');
      assert(!Object.keys(rfPGErrs()).length && fl.loops.length === 5, 'the corner and holes follow: ' + notes.join('; '));
      assert(UI.App.undo.length === undo0 + 1, 'one undo step: ' + (UI.App.undo.length - undo0));
      rfPGKey('Escape'); await idle();
      rfPGKey('z', { ctrlKey: true }); await idle(); await wait(40);
      near(+rfPGByName('Edge-Flange1').length, 1, 1e-12, 'Ctrl+Z: 1 again');
      near(Math.max(anvil.flat().size[0], anvil.flat().size[1]), Math.max(fl0.size[0], fl0.size[1]), 1e-9, 'Ctrl+Z: the blank as before');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });

    step('rfPG: job 1 outputs: Flatten, File ▸ Make Drawing from Part (the flat with its bend notes), Annotation ▸ Hole Table on the flat (a corner, one knockout: all four), File ▸ Save Drawing as PDF; Flat to DXF ✓ (outline, 4 holes, 4 bend lines)', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfPGjob.lidHoles, 'job 1 knockouts first');
      var fb = rfPGRibbon('Sheet Metal', /^Flatten\b|\bFlatten$/);
      fb.click(); await idle(); await wait(30);
      notes.push('flatten ' + UI.App.model.flatState);
      fb.click(); await idle();
      rfPGMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) { notes.push('modal: ' + $('modal').textContent.replace(/\s+/g, ' ').slice(0, 160)); clickModalButton('OK'); }
      await UI.drawing.ready(); await wait(40);
      var sm = anvil.drawing.summary(), fv = sm.views.filter(function (v) { return v.kind === 'flat'; })[0];
      if (!fv && (sm.sheets || []).length > 1) {
        var tab = D.querySelector('.dw-sheet-tab[data-sheet="1"]');
        if (tab) { tab.click(); await UI.drawing.ready(); await wait(40); }
        fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
      }
      assert(fv, 'Make Drawing adds the flat: ' + JSON.stringify(sm.views.map(function (v) { return v.kind; })));
      var st = UI.drawing.state;
      var notesTxt = (st.sheet.annotations || []).filter(function (a) { return a.type === 'note' || a.type === 'bendNote' || /bend/i.test(a.type); }).map(function (a) { return a.text || a.type; });
      var w = st.sheet.views.filter(function (x) { return x.view.id === fv.id; })[0];
      var bendTexts = (w && w.proj && w.proj.bendNotes || []).map(function (b) { return b.text; });
      notes.push('bend notes ' + JSON.stringify(bendTexts.length ? bendTexts : notesTxt).slice(0, 300));
      var svg0 = anvil.drawing.svg();
      var bn = (svg0.match(/(UP|DOWN)\s+90(\.0+)?°?\s*R\s*\.?\d+/g) || []);
      notes.push('svg bend notes ' + bn.length + ' ' + JSON.stringify(bn.slice(0, 4)));
      assert(bn.length === 4 || bendTexts.length === 4, 'four bend notes: ' + notes.join('; '));
      // Hole Table: Annotation tab, a corner of the blank, one knockout
      UI.drawing.fit(); await wait(20);
      ribbonButton('Hole Table').click(); await idle();
      assert(UI.drawing.state.tool === 'holetable', 'Hole Table tool');
      var cs = w.proj.circles.visible.filter(function (c) { return Math.abs(2 * c.r - 0.875) < 1e-6; });
      notes.push('flat circles ' + cs.length);
      // a corner vertex of the blank: the outline vertex nearest its lower-left (the box corner is notched)
      var org = null;
      (w.flat.lines || []).forEach(function (l) { [[l[0], l[1]], [l[2], l[3]]].forEach(function (q) { if (q && isFinite(q[0]) && (!org || q[0] + q[1] < org[0] + org[1])) org = q; }); });
      notes.push('corner vertex ' + JSON.stringify(org));
      var c0 = w.toSheet(org);
      sheetMouse('mousemove', c0); sheetMouse('mousedown', c0); sheetMouse('mouseup', c0); await idle();
      notes.push('origin ' + JSON.stringify(UI.drawing.state.pending && UI.drawing.state.pending.origin && UI.drawing.state.pending.origin.p));
      var h = cs[0], hp = w.toSheet([h.c[0] + h.r, h.c[1]]);
      sheetMouse('mousemove', hp); sheetMouse('mousedown', hp); sheetMouse('mouseup', hp); await idle();
      await UI.pmOK(); await idle(); await wait(40);
      var ht = anvil.drawing.holeTables();
      notes.push('hole table ' + JSON.stringify(ht.map(function (t) { return t.rows.map(function (r) { return r.tag + ' ' + r.xText + ' ' + r.yText + ' ' + r.size; }); })));
      assert(ht.length === 1 && ht[0].rows.length === 4 && ht[0].rows.every(function (r) { return /^Ø\s?\.875 THRU/.test(r.size); }), 'Hole Table of four Ø.875: ' + notes.join('; '));
      var pdf = (await rfPGSaved(function () { rfPGMenu('File', 'Save Drawing as PDF'); }))[0];
      notes.push('pdf ' + (pdf && pdf.name) + ' ' + (pdf && /^%PDF/.test(pdf.text || '')));
      assert(pdf && /^%PDF/.test(pdf.text || ''), 'a PDF: ' + notes.join('; '));
      anvil.drawing.close(); await idle();
      // Flat to DXF
      var xb = rfPGRibbon('Sheet Metal', /Flat to/);
      xb.click(); await wait(30);
      rfPGPmOpen('DXF/DWG Output');
      var got = await rfPGSaved(function () { return pmAccept(); });
      var dxf = got[got.length - 1];
      var c = (await rfPGCheck()).check(dxf.text, { units: 'in' });
      notes.push('flat dxf ' + dxf.name + ' ok ' + c.ok + ' ' + JSON.stringify(c.counts));
      assert(c.ok && (c.counts['CIRCLE@HOLES'] || 0) === 4, 'flat DXF with four knockouts: ' + notes.join('; '));
      rfPGjob.lidDone = true;
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });

    // ---- job 2: an 11 ga gusset bracket: base 4 x 5, a Sketched Bend 3 from the front (90° up), Edge-Flange1 on the
    // right edge of the horizontal leg (1.5, Material Inside), Hem1 on its top edge, mirrored to the left
    var RFPG_GUS = 'p.name("GUS-11").units("in");\np.sheet(' + T11 + ', ' + R11 + ', ' + K44 + ');\np.sketch("Top").rect(-2, -5, 4, 5).end().baseFlange();\n';
    step('rfPG: job 2, 11 ga gusset: the base\'s top face clicked, Sheet Metal ▸ Sketched Bend (a sketch on the face), a line across by two clicks, Exit Sketch, fixed face clicked, 90° ✓; Edge-Flange1 on the right edge (1.5, Material Inside) ✓; Hem1 on its top edge ✓; the blank against the hand numbers', async function () {
      var errs0 = errors.length, notes = [];
      await rfPGNewInch();
      await anvil.run(RFPG_GUS); await idle();
      assert(!Object.keys(rfPGErrs()).length, 'GUS-11 base: ' + JSON.stringify(rfPGErrs()));
      await rfPGView('Isometric');
      await rfPGClickAt(UI.worldToScreen([0, T11, 2])); await idle(); await wait(20);
      notes.push('selected ' + (UI.App.sel && UI.App.sel.kind));
      var sb = rfPGRibbon('Sheet Metal', /Sketched Bend/);
      assert(sb, 'Sketched Bend on the Sheet Metal tab');
      sb.click(); await idle(); await wait(40);
      notes.push('after Sketched Bend: mode ' + UI.App.mode + ' PM ' + (UI.hasPM() && UI.pmTitle()) + ' ' + statusText().slice(0, 100));
      assert(UI.App.mode === 'sketch', 'a sketch on the face: ' + notes.join('; '));
      var grid = UI.App.view.showGrid; UI.App.view.showGrid = false; UI.App.gridStale = true;
      try {
        rfPGFrame(8, 7, 0.5, 0.15); await wait(30);
        var a = rfPGFrom3D([-2.6, T11, 3]), b = rfPGFrom3D([2.6, T11, 3]);
        UI.setTool('line'); await wait(20);
        await rfPGSk(a); await rfPGSk(b); await wait(20);
        rfPGKey('Escape'); await wait(20); rfPGKey('Escape'); await wait(20);
        notes.push('line ' + rfPGEnts());
      } finally { UI.App.view.showGrid = grid; UI.App.gridStale = true; }
      UI.setTool('select');
      await UI.exitSketch(); await idle(); await wait(40);
      rfPGPmOpen('Sketched Bend');
      // the fixed face: the front part of the base (z < 3)
      await rfPGView('Isometric');
      await rfPGClickAt(UI.worldToScreen([0, T11, 1.2])); await idle(); await wait(20);
      var sv = UI.pmSpec().values;
      notes.push('Sketched Bend ' + JSON.stringify({ fixed: sv.fixed, angle: sv.angle, position: sv.position, reverse: sv.reverse }));
      await pmAccept(); await wait(30);
      var sbf = rfPGLast(), bb = UI.App.build.body.getBounds();
      notes.push(sbf.name + ' ' + (rfPGErrs()[sbf.id] || 'ok') + ' box ' + JSON.stringify([bb.min, bb.max].map(function (p) { return p.map(rfPGF); })));
      assert(sbf.type === 'sketchedBend' && !rfPGErrs()[sbf.id] && bb.max[1] > 1.5, 'the bend goes up: ' + notes.join('; '));
      // Edge-Flange1 on the right edge of the horizontal leg
      await rfPGView('Isometric');
      rfPGRibbon('Sheet Metal', /Edge Flange/).click(); await wait(30);
      rfPGPmOpen('Edge-Flange');
      var e = edgeNear([2, T11, 1.2]);
      await rfPGClickAt(UI.worldToScreen(e.mid)); await idle(); await wait(20);
      notes.push('flange edge ' + JSON.stringify(UI.pmSpec().values.edges));
      setInput(pmField('Position'), 'inside'); await wait(10);
      setInput(pmField('Length'), 1.5); await wait(10);
      await pmAccept(); await wait(30);
      var ef = rfPGLast();
      notes.push(ef.name + ' ' + (rfPGErrs()[ef.id] || 'ok'));
      assert(ef.type === 'flange' && !rfPGErrs()[ef.id], 'Edge-Flange1: ' + notes.join('; '));
      // Hem on its top edge (outside face, x = 2)
      await rfPGView('Isometric');
      rfPGRibbon('Sheet Metal', /^Hem\b|\bHem$/).click(); await wait(30);
      rfPGPmOpen('Hem');
      var he = edgeNear([2, 1.5, 1.2]);
      notes.push('hem edge ' + JSON.stringify(he.mid.map(rfPGF)));
      await rfPGClickAt(UI.worldToScreen(he.mid)); await idle(); await wait(20);
      var hv = UI.pmSpec().values;
      notes.push('hem ' + JSON.stringify({ edges: hv.edges, type: hv.hemType, len: hv.length, pos: hv.hemPosition }));
      await pmAccept(); await wait(30);
      var hm = rfPGLast();
      notes.push(hm.name + ' ' + (rfPGErrs()[hm.id] || 'ok'));
      assert(hm.hem && !rfPGErrs()[hm.id], 'Hem1: ' + notes.join('; '));
      var fl = anvil.flat();
      notes.push('blank ' + fl.size.map(rfPGF).join(' x ') + ' bends ' + (fl.bends || []).length + ' volume ' + rfPGF(rfPGVol()));
      rfPGjob.gus = { flat: fl.size.slice(), vol: rfPGVol(), bends: (fl.bends || []).length, ef: ef.id, hem: hm.id };
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });

    step('rfPG: job 2, Mirror: Edge-Flange1 picked in the FeatureManager, Features ▸ Mirror, Right Plane; then Hem1; Edit Feature on Edge-Flange1 (1.5 → 1.25) after the mirror: does the mirrored side follow, and is it in the flat?', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfPGjob.gus, 'job 2 gusset first');
      var g = rfPGjob.gus;
      // lane PK: the Mirror of Edge-Flange1 is the flange again on the mirrored edge (kernel-rebuild.js bendFamily). It was
      // refused here (rfPG: a plain solid copy, .4782 in³ against the flange's .4465, the blank stayed 3 bends), and before
      // that it was lit and silently short in the flat
      async function mirrorOf(fid) {
        rfPGClickRow(fid); await idle(); await wait(20);
        // Mirror is in the Linear Pattern flyout (as SolidWorks' Features tab has it under the pattern ▾ too)
        // (the flyout's face remembers the last command: 'Mirror options' after the first Mirror, as SolidWorks)
        var caret = rfPGRibbon('Features', /^(Linear Pattern|Mirror) options/);
        assert(caret, 'the Linear Pattern flyout');
        caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
        var mi = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return /^\s*Mirror\b/.test(m.textContent); })[0];
        assert(mi, 'Mirror in the flyout: ' + Array.prototype.map.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.trim(); }).join(' | '));
        mi.click(); await idle(); await wait(40);
        rfPGPmOpen('Mirror');
        var mv = UI.pmSpec().values, okb = D.querySelector('#pm .pm-ok');
        notes.push('Mirror PM ' + JSON.stringify({ feature: mv.feature, plane: mv.plane, body: mv.body }) + ' ✓ ' + (okb.classList.contains('disabled') ? 'grey: ' + okb.title : 'lit'));
        assert(mv.feature === fid && (mv.plane || 'Right') === 'Right' && !okb.classList.contains('disabled'), 'the Mirror of ' + fid + ' about the Right Plane, ✓ lit: ' + notes.join('; '));
        await pmAccept(); await wait(30);
        var mf = rfPGLast();
        notes.push(mf.name + ' ' + (rfPGErrs()[mf.id] || 'ok'));
        assert(mf.type === 'mirror' && !rfPGErrs()[mf.id], 'the mirror builds: ' + notes.join('; '));
        return mf;
      }
      var m1 = await mirrorOf(g.ef), fl1 = anvil.flat();
      notes.push('after ' + m1.name + ': blank ' + fl1.size.map(rfPGF).join(' x ') + ' bends ' + (fl1.bends || []).length);
      assert((fl1.bends || []).length === g.bends + 1, 'the mirrored flange is in the flat: ' + notes.join('; '));
      await rfPGView('Isometric');
      var m2 = await mirrorOf(g.hem);
      var fl = anvil.flat(), bb = UI.App.build.body.getBounds();
      notes.push('both sides: errors ' + JSON.stringify(rfPGErrs()) + ' blank ' + fl.size.map(rfPGF).join(' x ') + ' bends ' + (fl.bends || []).length + ' x ' + rfPGF(bb.min[0]) + '..' + rfPGF(bb.max[0]));
      assert(!Object.keys(rfPGErrs()).length && (fl.bends || []).length === 5, 'two flanges and two hems in the flat: ' + notes.join('; '));
      near(bb.min[0], -bb.max[0], 1e-9, 'symmetric about the Right Plane');
      var wide = Math.max(fl.size[0], fl.size[1]);
      near(wide, 4 + 2 * (g.flat[0] - 4), 1e-6, 'each side develops as the first did');
      // the same part with the flange and the hem picked on both edges (what the refusal used to ask for): equal to 1e-9
      var both = UI.App.model.features.filter(function (f) { return f.id !== m1.id && f.id !== m2.id; }).map(function (f) { return JSON.parse(JSON.stringify(f)); });
      both.forEach(function (f) {
        if (f.id === g.ef || f.id === g.hem) f.edges = f.edges.concat(f.edges.map(function (e) { return { at: [-e.at[0], e.at[1], e.at[2]] }; }));
        delete f.pickRefs;
      });
      var bm = JSON.parse(JSON.stringify(UI.App.model)); bm.features = both;
      var bb2 = K.rebuild(bm), bmesh = K.meshFromBody(bb2.body), bfl = K.flatPattern(bm, bb2, bmesh);
      notes.push('picked on both edges: blank ' + bfl.size.map(rfPGF).join(' x ') + ' volume ' + rfPGF(K.massProps(bmesh, 1).volume));
      near(K.massProps(bmesh, 1).volume, rfPGVol(), 1e-9, 'volume = the flange and hem picked on both edges');
      near(bfl.size[0], fl.size[0], 1e-9, 'blank x'); near(bfl.size[1], fl.size[1], 1e-9, 'blank y');
      // the flat DXF carries both bends of each side
      var dxf = K.exportDXFFlat(fl, 'in').replace(/\r\n/g, '\n').split('\n'), nb = 0, ent = null;
      for (var di = 0; di + 1 < dxf.length; di += 2) { var dc = dxf[di].trim(), dv = dxf[di + 1].trim(); if (dc === '0') ent = dv; else if (dc === '8' && ent === 'LINE' && dv === 'BEND') nb++; }
      notes.push('DXF ' + nb + ' bend lines');
      assert(nb === 5, nb + ' LINEs on BEND in the flat DXF: ' + notes.join('; '));
      // Edit Feature on Edge-Flange1, 1.5 -> 1.25: both flanges and both hems follow
      async function editFromMenu(fid) {
        var row = rfPGRow(fid), rr = row.getBoundingClientRect();
        row.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: W, button: 2, clientX: rr.left + 30, clientY: rr.top + 6 }));
        var it = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /^Edit Feature/.test(m.textContent.trim()); })[0];
        assert(it, 'Edit Feature on the right-click menu'); it.click(); await idle(); await wait(30);
      }
      await editFromMenu(g.ef);
      setInput(pmField('Length'), 1.25); await wait(10);
      await pmAccept(); await wait(30);
      var fl2 = anvil.flat(), bb3 = UI.App.build.body.getBounds();
      notes.push('1.25: errors ' + JSON.stringify(rfPGErrs()) + ' blank ' + fl2.size.map(rfPGF).join(' x ') + ' bends ' + (fl2.bends || []).length);
      near(Math.max(fl2.size[0], fl2.size[1]), wide - 0.5, 1e-6, 'the blank 2 × .25 narrower');
      assert(!Object.keys(rfPGErrs()).length && (fl2.bends || []).length === 5, 'everything follows: ' + notes.join('; '));
      near(bb3.min[0], -bb3.max[0], 1e-9, 'still symmetric');
      notes.push('features ' + UI.App.model.features.map(function (f) { return f.name; }).join(','));
      rfPGjob.gusMirror = notes.slice();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });

    // ---- job 3: a customer's flat part as a DXF (AutoCAD 2000: LINEs and ARCs for an outline with R.25 corners, CIRCLEs,
    // a slot as a closed LWPOLYLINE with bulges), opened, made a 14 ga Base Flange, its flat DXF compared entity by entity
    function rfPGCustomerDxf() {
      var o = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '1', '9', '$MEASUREMENT', '70', '0', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
      function line(a, b) { o.push('0', 'LINE', '8', 'CUT', '10', String(a[0]), '20', String(a[1]), '30', '0', '11', String(b[0]), '21', String(b[1]), '31', '0'); }
      function arc(c, r, a0, a1) { o.push('0', 'ARC', '8', 'CUT', '10', String(c[0]), '20', String(c[1]), '30', '0', '40', String(r), '50', String(a0), '51', String(a1)); }
      function circle(c, r) { o.push('0', 'CIRCLE', '8', 'CUT', '10', String(c[0]), '20', String(c[1]), '30', '0', '40', String(r)); }
      var W0 = 10, H0 = 6, r = 0.25;
      line([r, 0], [W0 - r, 0]); arc([W0 - r, r], r, 270, 360); line([W0, r], [W0, H0 - r]); arc([W0 - r, H0 - r], r, 0, 90);
      line([W0 - r, H0], [r, H0]); arc([r, H0 - r], r, 90, 180); line([0, H0 - r], [0, r]); arc([r, r], r, 180, 270);
      circle([2, 3], 0.25); circle([8.5, 1], 0.1405); circle([8.5, 5], 0.1405);
      o.push('0', 'LWPOLYLINE', '8', 'CUT', '90', '4', '70', '1', '10', '5', '20', '2.875', '42', '0', '10', '6', '20', '2.875', '42', '1', '10', '6', '20', '3.125', '42', '0', '10', '5', '20', '3.125', '42', '1');
      o.push('0', 'ENDSEC', '0', 'EOF');
      return o.join('\n') + '\n';
    }
    // entities read back by the app's own DXF reader, outline and holes only (the BEND / NOTES layers are left out)
    function rfPGEntities(text) {
      var r = W.DxfImport.parse(text), es = (r.entities || r).filter(function (e) { return !e.construction && (e.t === 'line' || e.t === 'arc' || e.t === 'circle'); });
      return { es: es, units: r.units, warnings: r.warnings || [] };
    }
    function rfPGBounds(es) { return W.DxfImport.bounds(es); }
    // every entity of A has one of the same kind and size in B, moved by d (lines either way round)
    function rfPGMatch(A, B, d, tol) {
      var used = [], missing = [];
      A.forEach(function (a) {
        var j = -1;
        for (var k = 0; k < B.length && j < 0; k++) {
          if (used[k] || B[k].t !== a.t) continue;
          var b = B[k];
          if (a.t === 'line') {
            var f = Math.hypot(a.x1 + d[0] - b.x1, a.y1 + d[1] - b.y1) + Math.hypot(a.x2 + d[0] - b.x2, a.y2 + d[1] - b.y2);
            var g = Math.hypot(a.x1 + d[0] - b.x2, a.y1 + d[1] - b.y2) + Math.hypot(a.x2 + d[0] - b.x1, a.y2 + d[1] - b.y1);
            if (Math.min(f, g) < tol) j = k;
          } else {
            if (Math.hypot(a.cx + d[0] - b.cx, a.cy + d[1] - b.cy) > tol || Math.abs(a.r - b.r) > tol) continue;
            if (a.t === 'circle') { j = k; continue; }
            var n = function (x) { x = x % 360; return x < 0 ? x + 360 : x; }, s0 = Math.abs(n(a.a0) - n(b.a0)), s1 = Math.abs(n(a.a1) - n(b.a1));
            if (Math.min(s0, 360 - s0) < 1e-4 && Math.min(s1, 360 - s1) < 1e-4) j = k;
          }
        }
        if (j >= 0) used[j] = true; else missing.push(a);
      });
      return { missing: missing, extra: B.filter(function (b, k) { return !used[k]; }) };
    }
    function rfPGEntTxt(e) { return e.t + '(' + (e.t === 'line' ? [e.x1, e.y1, e.x2, e.y2] : e.t === 'arc' ? [e.cx, e.cy, e.r, e.a0, e.a1] : [e.cx, e.cy, e.r]).map(function (x) { return +(+x).toFixed(4); }).join(',') + ')'; }
    var T14 = 0.0747, R14 = 0.09;
    async function rfPGJob3(notes, profileName) {
      var du = UI.defaultUnits(), text = rfPGCustomerDxf(), inp = rfPGEntities(text);
      notes.push('input: ' + inp.es.length + ' entities, units ' + inp.units);
      UI.setDefaultUnits('in');
      try { await UI.openFileData('PNL-14.dxf', text); await idle(); await wait(30); } finally { UI.setDefaultUnits(du); }
      notes.push('opened ' + UI.App.model.name + ' (' + UI.App.model.units + ') PM ' + (UI.hasPM() && UI.pmTitle()));
      if (UI.hasPM() && UI.pmTitle() === 'DXF/DWG Import') await pmAccept();
      var sk = UI.activeSketchFeature ? UI.activeSketchFeature() : null;
      assert(sk && UI.App.model.units === 'in', 'in the imported sketch, an inch part: ' + notes.join('; '));
      notes.push('sketch ' + sk.entities.length + ' entities: ' + sk.entities.map(function (e) { return e.t; }).join(','));
      return sk;
    }
    async function rfPGFlatDxf(notes) {
      var got = await rfPGSaved(function () { return pmAccept(); });
      var dxf = got.filter(function (g) { return /\.dxf$/i.test(g.name); }).pop();
      assert(dxf, 'a DXF saved: ' + JSON.stringify(got.map(function (g) { return g.name; })));
      return dxf;
    }
    function rfPGCompare(notes, inEs, dxfText) {
      var out = rfPGEntities(dxfText), bi = rfPGBounds(inEs), bo = rfPGBounds(out.es), d = [bo[0] - bi[0], bo[1] - bi[1]];
      var m = rfPGMatch(inEs, out.es, d, 1e-6);
      notes.push('flat DXF: ' + JSON.stringify(out.es.map(function (e) { return e.t; }).reduce(function (a, t) { a[t] = (a[t] || 0) + 1; return a; }, {})) + ', moved by ' + d.map(rfPGF).join(', ') + '; missing ' + m.missing.map(rfPGEntTxt).join(' ') + '; extra ' + m.extra.map(rfPGEntTxt).join(' '));
      return m;
    }

    step('rfPG: job 3, a customer DXF (lines, arcs, circles, a slot LWPOLYLINE): File ▸ Open (DXF/DWG Import ✓, an inch sketch on Top), Exit Sketch, Sheet Metal ▸ Base Flange/Tab (14 ga typed) ✓; Flat to DXF ✓: every input entity comes back once, the same kind and size, to 1e-6', async function () {
      var errs0 = errors.length, notes = [];
      var sk = await rfPGJob3(notes);
      await UI.exitSketch(); await idle(); await wait(30);
      rfPGRibbon('Sheet Metal', /Base Flange/).click(); await wait(30);
      rfPGPmOpen('Base Flange/Tab');
      setInput(pmField('Thickness'), T14); setInput(pmField('Bend radius'), R14); var kf = pmField('K-factor'); if (kf) setInput(kf, K44); await wait(10);
      await pmAccept(); await wait(30);
      assert(!Object.keys(rfPGErrs()).length, 'base flange: ' + JSON.stringify(rfPGErrs()) + ' ' + notes.join('; '));
      near(rfPGVol(), T14 * (60 - (4 - Math.PI) * 0.0625 - Math.PI * (0.0625 + 2 * 0.1405 * 0.1405) - (0.25 + Math.PI * 0.125 * 0.125)), 1e-6, 'the plate volume (rounded corners, three holes, the slot)');
      var xb = rfPGRibbon('Sheet Metal', /Flat to/);
      xb.click(); await wait(30);
      rfPGPmOpen('DXF/DWG Output');
      var dxf = await rfPGFlatDxf(notes);
      var m = rfPGCompare(notes, rfPGEntities(rfPGCustomerDxf()).es, dxf.text);
      rfPGjob.j3 = notes.slice();
      assert(!m.missing.length && !m.extra.length, 'entity by entity: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });

    // ---- job 4: job 3 in the Mastercam interface profile, every command found where a Mastercam user looks for it
    function rfPGVisible(el) { if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && W.getComputedStyle(el).visibility !== 'hidden'; }
    function rfPGTab(name) {
      var t = Array.prototype.filter.call(D.querySelectorAll('[role=tab], .rb-tab, #ribbon-tabs button, #ribbon-tabs li'), function (x) { return x.textContent.trim() === name && rfPGVisible(x); })[0];
      assert(t, 'the ' + name + ' tab: ' + Array.prototype.map.call(D.querySelectorAll('[role=tab], .rb-tab, #ribbon-tabs button, #ribbon-tabs li'), function (x) { return x.textContent.trim(); }).join('|'));
      t.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true })); t.click();
      return t;
    }
    function rfPGVisibleButton(re) {
      return Array.prototype.filter.call(D.querySelectorAll('#ribbon button, .mc-ribbon button, button'), function (b) { return rfPGVisible(b) && re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).replace(/\s+/g, ' ').trim()); })[0];
    }
    function rfPGVisibleLabels() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), rfPGVisible).map(function (b) { return (b.getAttribute('aria-label') || b.textContent).replace(/\s+/g, ' ').trim().slice(0, 30); }).join(', '); }

    step('rfPG: job 4, job 3 in the Mastercam profile: File tab (Open is there), the DXF opened, the sketch ended from what the profile shows, Sheet Metal tab ▸ Base Flange/Tab ✓, Sheet Metal ▸ Flat to DXF ✓; the same entity-by-entity match', async function () {
      var errs0 = errors.length, notes = [], prof = anvil.profile(), lost = [];
      try {
        anvil.profile('mastercam'); await wait(80); await idle();
        // File tab: what a Mastercam user clicks first
        var ft = $('mc-file');
        assert(ft && rfPGVisible(ft), 'the File tab');
        ft.click(); await wait(40);
        var fileText = Array.prototype.filter.call(D.querySelectorAll('button, .mi, li, a, [role=menuitem]'), rfPGVisible).map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }).filter(function (t) { return /^(Open|Save As|Save|Export|Import|Merge|New)\b/.test(t); });
        notes.push('File tab rows ' + fileText.slice(0, 12).join(' | '));
        if (!fileText.some(function (t) { return /^Open\b/.test(t); })) lost.push('Open in the File tab');
        rfPGKey('Escape'); await wait(20); if (UI.closeMenus) UI.closeMenus();
        // (the file picker itself cannot be driven: the file is handed to the app as the picker does)
        var sk = await rfPGJob3(notes);
        // ending the sketch: Mastercam has no sketch mode; the profile's own way out
        var ex = D.querySelector('#exit-sketch .cc-exit');
        notes.push('confirmation corner ' + (ex && rfPGVisible(ex) ? 'shown: ' + ex.title : 'not shown'));
        if (ex && rfPGVisible(ex)) { ex.click(); await idle(); await wait(30); }
        else { lost.push('Exit Sketch (the corner is hidden)'); await UI.exitSketch(); await idle(); }
        assert(UI.App.mode !== 'sketch', 'out of the sketch: ' + statusText() + ' | ' + notes.join('; ') + ' | lost ' + lost.join(', '));
        rfPGTab('Sheet Metal'); await wait(30);
        var bfb = rfPGVisibleButton(/Base Flange/);
        notes.push('Sheet Metal tab: ' + rfPGVisibleLabels().slice(0, 400));
        assert(bfb, 'Base Flange/Tab on the Sheet Metal tab: ' + notes.join('; '));
        bfb.click(); await wait(30);
        notes.push('PM ' + (UI.hasPM() && UI.pmTitle()));
        rfPGPmOpen('Base Flange/Tab');
        setInput(pmField('Thickness'), T14); setInput(pmField('Bend radius'), R14); var kf = pmField('K-factor'); if (kf) setInput(kf, K44); await wait(10);
        var okb = D.querySelector('#pm .pm-ok');
        notes.push('✓ ' + (okb && rfPGVisible(okb) ? 'shown' : 'hidden'));
        await pmAccept(); await wait(30);
        assert(!Object.keys(rfPGErrs()).length && UI.App.model.sheet, 'base flange: ' + JSON.stringify(rfPGErrs()) + ' ' + notes.join('; '));
        rfPGTab('Sheet Metal'); await wait(20);
        var fx = rfPGVisibleButton(/Flat to DXF|Flat to/);
        assert(fx, 'Flat to DXF on the Sheet Metal tab: ' + rfPGVisibleLabels());
        fx.click(); await wait(30);
        rfPGPmOpen('DXF/DWG Output');
        var dxf = await rfPGFlatDxf(notes);
        var m = rfPGCompare(notes, rfPGEntities(rfPGCustomerDxf()).es, dxf.text);
        // where a Mastercam user also looks: File ▸ Save As / Export
        ft = $('mc-file'); ft.click(); await wait(40);
        var exp = Array.prototype.filter.call(D.querySelectorAll('button, .mi, li, a, [role=menuitem]'), rfPGVisible).map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }).filter(function (t) { return /DXF|Export|Save As/i.test(t) && t.length < 60; });
        notes.push('File tab export rows ' + exp.slice(0, 10).join(' | '));
        rfPGKey('Escape'); await wait(20); if (UI.closeMenus) UI.closeMenus();
        notes.push('not found: ' + (lost.join(', ') || 'none'));
        rfPGjob.j4 = notes.slice();
        assert(!m.missing.length && !m.extra.length, 'entity by entity: ' + notes.join('; '));
      } finally { if (UI.hasPM()) UI.pmCancel(); anvil.profile(prof && prof.id ? prof.id : prof || 'solidworks'); await wait(40); await idle(); }
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });

    // ---- job 5: the lid (job 1, as a script) on a 16 ga box 9.875 x 5.875 x 4, two mates, an exploded view, the drawing
    var RFPG_LID = 'p.name("LID-16").units("in");\np.sheet(' + T16 + ', ' + R16 + ', ' + K44 + ');\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
      'p.flange(1, [[5, 0, 0], [10, 0, 3], [5, 0, 6], [0, 0, 3]], { position: "inside", lengthRef: "outer", name: "Edge-Flange1" });\n';
    var RFPG_BOX = 'p.name("BOX-16").units("in");\np.sheet(' + T16 + ', ' + R16 + ', ' + K44 + ');\np.sketch("Top").rect(0, -5.875, 9.875, 5.875).end().baseFlange();\n' +
      'p.flange(4, [[5, ' + T16 + ', 0], [9.875, ' + T16 + ', 3], [5, ' + T16 + ', 5.875], [0, ' + T16 + ', 3]], { position: "inside", lengthRef: "outer", name: "Edge-Flange1" });\n';
    function rfPGMenuClick(name, label) { rfPGMenu(name, label); }
    async function rfPGSaveDoc(notes, name) {
      await rfPGSaved(async function () {
        rfPGMenu('File', 'Save'); await wait(40);
        if (modalOpen()) {
          var inp = D.querySelector('#modal input[type=text], #modal input:not([type])');
          if (inp && name) setInput(inp, name);
          var bs = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); });
          clickModalButton(bs.filter(function (b) { return /Save|OK/.test(b); })[0] || bs[0]); await wait(40);
          if (modalOpen()) { var b2 = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (x) { return x.textContent.trim(); }); clickModalButton(b2.filter(function (b) { return /Replace|Yes|OK|Save/.test(b); })[0] || b2[0]); await wait(40); }
        }
      });
    }
    async function rfPGPickAt(pt, dir, scale, notes, what) {
      await rfPGLook(pt, dir, scale);
      var s = UI.worldToScreen(pt), h = UI.pickFace(s[0], s[1]);
      assert(h && Math.hypot(h.point[0] - pt[0], h.point[1] - pt[1], h.point[2] - pt[2]) < 3e-3, what + ': the face at ' + JSON.stringify(pt) + ' is under the cursor: hit ' + JSON.stringify(h && h.point) + ' | ' + notes.join('; '));
      await rfPGClickAt(s); await idle(); await wait(30);
    }
    function rfPGComp(name) { return anvil.components().filter(function (c) { return c.name === name; })[0]; }
    async function rfPGMateOK(notes, what) {
      var v = UI.pmSpec().values;
      notes.push(what + ': ' + v.type + ' ' + JSON.stringify(v.a && Object.keys(v.a)) + ' / ' + JSON.stringify(v.b && Object.keys(v.b)));
      assert(v.a && v.b && v.type === 'coincident', what + ': two faces, Coincident: ' + notes.join('; '));
      await pmAccept(); await idle(); await wait(40);
    }

    step('rfPG: job 5, the lid on a box: LID-16 and BOX-16 saved, File ▸ New ▸ Assembly, Insert Components (the box fixed, the lid above it), Mate by clicks: Coincident the lid\'s underside on the box rim, Coincident the lid\'s front flange (inside) on the box\'s front wall: the lid sits on the box', async function () {
      var errs0 = errors.length, notes = [];
      var parts = [RFPG_BOX, RFPG_LID];
      for (var i = 0; i < parts.length; i++) {
        await rfPGNewInch(); await anvil.run(parts[i]); await idle();
        assert(!Object.keys(rfPGErrs()).length, 'part ' + i + ' builds: ' + JSON.stringify(rfPGErrs()));
        await rfPGSaveDoc(notes);
      }
      var du = UI.defaultUnits(); UI.setDefaultUnits('in');
      try { rfPGMenu('File', 'New ▸ Assembly'); await idle(); await wait(60); } finally { UI.setDefaultUnits(du); }
      if (modalOpen()) clickModalButton('OK');
      if (UI.hasPM() && UI.pmTitle() === 'Insert Component') UI.pmCancel();
      assert(UI.isAssembly(), 'an assembly');
      var ins = [['BOX-16', null], ['LID-16', [-0.0625, 10, -0.5]]];
      for (i = 0; i < ins.length; i++) {
        rfPGRibbon('Assembly', /Insert Components/).click(); await idle(); await wait(30);
        rfPGPmOpen('Insert Component');
        var sel = D.querySelector('#pm select[data-key="part"]');
        var opt = Array.prototype.filter.call(sel.options, function (o) { return o.textContent.indexOf(ins[i][0]) === 0; })[0];
        assert(opt, ins[i][0] + ' among the parts: ' + Array.prototype.map.call(sel.options, function (o) { return o.textContent; }).join(' | ').slice(0, 300));
        setInput(sel, opt.value); await wait(20);
        if (ins[i][1]) { rfPGSet('x', ins[i][1][0]); rfPGSet('y', ins[i][1][1]); rfPGSet('z', ins[i][1][2]); }
        await pmAccept(); await idle(); await wait(40);
      }
      notes.push('components ' + anvil.components().map(function (c) { return c.name + (c.fixed ? '(f)' : '') + '@' + c.position.map(rfPGF).join(','); }).join(' '));
      var lid = rfPGComp('LID-16<1>');
      assert(lid, 'LID-16<1>');
      // mate 1: the lid's underside (seen from below and in front, under its front flange), the box's front rim
      UI.cmdMate(); await idle(); await wait(20);
      var P = lid.position;
      await rfPGPickAt([P[0] + 5, P[1], P[2] + 3], [0, -1, -1.2], 0.006, notes, 'lid underside');
      await rfPGPickAt([5, 4, T16 / 2], [0.1, 1, -0.3], 0.0012, notes, 'box rim');
      await rfPGMateOK(notes, 'mate 1');
      lid = rfPGComp('LID-16<1>'); P = lid.position;
      notes.push('lid after mate 1 ' + P.map(rfPGF).join(','));
      near(P[1], 4, 1e-6, 'the lid on the rim');
      // mate 2: the lid's front flange inside face (from below, in the gap), the box's front wall outside face
      UI.cmdMate(); await idle(); await wait(20);
      await rfPGPickAt([P[0] + 5, P[1] - 0.5, P[2] + T16], [0.1, -1, 0.05], 0.004, notes, 'lid front flange inside');
      await rfPGPickAt([5, 2, 0], [0.2, 0.2, -1], 0.004, notes, 'box front wall outside');
      await rfPGMateOK(notes, 'mate 2');
      lid = rfPGComp('LID-16<1>'); P = lid.position;
      notes.push('lid at ' + P.map(rfPGF).join(',') + ' dof ' + lid.dof + ' mates ' + anvil.mates().map(function (m) { return m.name + (m.ok ? '' : ' ✗ ' + (m.error || '')); }).join(','));
      near(P[1], 4, 1e-6, 'still on the rim'); near(P[2], -T16, 1e-6, 'its front flange on the box front');
      assert(anvil.mates().length === 2 && anvil.mates().every(function (m) { return m.ok; }), 'two mates: ' + notes.join('; '));
      rfPGjob.asm = notes.slice();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });

    step('rfPG: job 5, Exploded View (the lid clicked, Y, 6 typed) ✓, File ▸ Save as LID-ASM, File ▸ Make Drawing from Assembly: a BOM BOX-16 1 / LID-16 1, Auto Balloon (two balloons), File ▸ Save Drawing as PDF', async function () {
      var errs0 = errors.length, notes = [];
      assert(rfPGjob.asm && UI.isAssembly(), 'job 5 assembly first');
      await rfPGView('Isometric');
      var eb = rfPGRibbon('Assembly', /Exploded View/);
      assert(eb, 'Exploded View on the Assembly tab');
      eb.click(); await idle(); await wait(30);
      notes.push('PM ' + (UI.hasPM() && UI.pmTitle()));
      var lid = rfPGComp('LID-16<1>'), c = W.Assembly.componentCenter(UI.App.model, UI.App.build, lid.id);
      await rfPGClickAt(UI.worldToScreen([lid.position[0] + 5, lid.position[1] + T16, lid.position[2] + 3])); await idle(); await wait(20);
      var es = UI.explodeSession();
      notes.push('step comps ' + JSON.stringify(es && es.values.comps));
      setInput(D.querySelector('#pm select[data-key="dir"]'), 'y'); await wait(10);
      assert(UI.pmSetField('distance', '6'), 'distance');
      await idle();
      await pmAccept(); await idle(); await wait(30);
      var vs = anvil.explodedViews(), ex = anvil.exploded();
      notes.push('exploded views ' + JSON.stringify(vs.map(function (v) { return v.name + ':' + v.steps.map(function (s) { return s.components.join('+') + ' ' + s.direction + ' ' + s.distance; }).join('|'); })) + ' offsets ' + JSON.stringify(ex && ex.offsets));
      assert(vs.length === 1 && vs[0].steps.length === 1 && vs[0].steps[0].distance === 6, 'ExplView1 with the lid 6 up: ' + notes.join('; '));
      await rfPGSaveDoc(notes, 'LID-ASM');
      notes.push('saved as ' + UI.App.model.name + ' file ' + UI.App.fileName);
      rfPGMenu('File', 'Make Drawing from Assembly'); await wait(30);
      if (modalOpen()) { notes.push('modal: ' + $('modal').textContent.replace(/\s+/g, ' ').slice(0, 120)); clickModalButton('OK'); }
      await UI.drawing.ready(); await wait(40);
      var sm = anvil.drawing.summary();
      notes.push('views ' + sm.views.map(function (v) { return v.name + ':' + (v.orient || v.kind) + (v.exploded ? '(exploded)' : ''); }).join(','));
      notes.push('bom ' + JSON.stringify(sm.bom && sm.bom.rows.map(function (r) { return [r.item, r.partNumber, r.qty]; })));
      UI.setRibbonTab('Annotation');
      var ab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button, #ribbon button'), function (x) { return /Auto Balloon/.test(x.textContent.replace(/\s+/g, ' ') + ' ' + (x.title || '')); })[0];
      assert(ab, 'Auto Balloon on the Annotation tab');
      ab.click(); await idle(); await wait(30);
      await UI.pmOK(); await idle(); await wait(40);
      sm = anvil.drawing.summary();
      notes.push('balloons ' + JSON.stringify(sm.balloons.map(function (b) { return b.item + ':' + b.component; })));
      var pdf = (await rfPGSaved(function () { rfPGMenu('File', 'Save Drawing as PDF'); }))[0];
      notes.push('pdf ' + (pdf && pdf.name) + ' ' + (pdf && /^%PDF/.test(pdf.text || '')));
      var bom = sm.bom && sm.bom.rows.map(function (r) { return r.partNumber + ':' + r.qty; }).sort().join(',');
      anvil.drawing.close(); await idle();
      rfPGjob.asmDraw = notes.slice();
      assert(bom === 'BOX-16:1,LID-16:1', 'the BOM: ' + notes.join('; '));
      assert(sm.balloons.length === 2 && pdf && /^%PDF/.test(pdf.text || ''), 'balloons and PDF: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });

    step('rfPG: Extruded Boss/Base with nothing picked and no sketch asks for a plane (it only said "Create a sketch first"): Top Plane, a rectangle by two clicks, Exit Sketch brings the Boss-Extrude PM, ✓ builds it; Esc on the empty sketch reopens nothing', async function () {
      var errs0 = errors.length, notes = [];
      await rfPGNewInch();
      UI.App.sel = null; if (UI.setSelection) UI.setSelection([]);
      var eb = rfPGRibbon('Features', /^Extruded Boss/);
      eb.click(); await idle(); await wait(30);
      rfPGPmOpen('Boss-Extrude');
      var ok = D.querySelector('#pm .pm-ok');
      notes.push('PM ✓ ' + (ok.classList.contains('disabled') ? 'grey: ' + ok.title : 'lit') + '; ' + $('pm').textContent.replace(/\s+/g, ' ').slice(0, 120));
      assert(ok.classList.contains('disabled'), 'waits for a plane');
      clickPmButton('Top Plane'); await idle(); await wait(30);
      assert(UI.App.mode === 'sketch', 'a sketch on Top');
      rfPGFrame(6, 4, 0.2, 0.2); await wait(20);
      UI.setTool('rect'); await wait(20);
      await rfPGSk([0.5, -0.5]); await rfPGSk([2.5, -1.5]); await wait(20);
      rfPGKey('Escape'); await wait(20);
      UI.setTool('select');
      await UI.exitSketch(); await idle(); await wait(40);
      rfPGPmOpen('Boss-Extrude');
      await pmAccept(); await wait(30);
      var bx = rfPGLast(), v = rfPGVol();
      notes.push(bx.name + ' volume ' + rfPGF(v));
      assert(bx.type === 'extrude' && !bx.cut && v > 0.5, 'Boss-Extrude1 built: ' + notes.join('; '));
      // an empty sketch: nothing comes back
      eb.click(); await idle(); await wait(30);
      clickPmButton('Front Plane'); await idle(); await wait(30);
      await UI.exitSketch(); await idle(); await wait(30);
      assert(!UI.hasPM() && UI.App.mode !== 'sketch' && rfPGLast() === bx, 'the empty sketch discarded, no PM: ' + (UI.hasPM() && UI.pmTitle()));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });

    // ---- what landed this round, used the way the shop would
    var RFPG_L = 'p.name("L-14").units("in");\np.sheet(' + T14 + ', ' + R14 + ', ' + K44 + ');\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(1.5, [[3, ' + T14 + ', 0]], { position: "inside", lengthRef: "outer", name: "Edge-Flange1" });\n';
    var RFPG_CH = 'p.name("CHAMF-2").units("in");\np.sketch("Top").rect(0, -2, 3, 2).end().extrude(1);\np.chamfer(0.1, [[1.5, 1, 0]], { d2: 0.3 });\n';
    step('rfPG: this round\'s commands on shop parts: Sheet Metal ▸ Unfold with nothing picked waits (✓ grey), the base clicked in the graphics area, Collect All Bends, ✓: the L lies flat; a drawing\'s Chamfer Dimension by clicks (the chamfer, then the top edge) reads .100 X .300 for a Distance Distance chamfer, .300 X .100 from the other edge', async function () {
      var errs0 = errors.length, notes = [];
      await rfPGNewInch();
      await anvil.run(RFPG_L); await idle();
      await rfPGView('Isometric');
      UI.App.sel = null; if (UI.setSelection) UI.setSelection([]);
      var ub = rfPGRibbon('Sheet Metal', /^Unfold\b/);
      assert(ub, 'Unfold on the Sheet Metal tab');
      ub.click(); await idle(); if (UI.previewIdle) await UI.previewIdle(); await wait(100);
      rfPGPmOpen('Unfold');
      var ok = D.querySelector('#pm .pm-ok');
      notes.push('✓ ' + (ok.classList.contains('disabled') ? 'grey: ' + ok.title : 'lit'));
      assert(ok.classList.contains('disabled'), 'Unfold waits for the fixed face');
      await rfPGClickAt(UI.worldToScreen([3, T14, 2.5])); await idle(); await wait(30);
      ok = D.querySelector('#pm .pm-ok');
      notes.push('fixed face ' + JSON.stringify(UI.pmSpec().values.fixedFace && (UI.pmSpec().values.fixedFace.point || true)) + ' ✓ ' + (ok.classList.contains('disabled') ? 'grey: ' + ok.title : 'lit'));
      clickPmButton('Collect All Bends'); await idle(); if (UI.previewIdle) await UI.previewIdle(); await wait(150); await idle();
      ok = D.querySelector('#pm .pm-ok');
      notes.push('bends ' + UI.pmSpec().values.bends.length + ' ✓ ' + (ok.classList.contains('disabled') ? 'grey: ' + ok.title : 'lit'));
      await pmAccept(); await wait(30); await idle();
      var uf = rfPGLast(), bb = UI.App.build.body.getBounds();
      notes.push(uf.name + ' ' + (rfPGErrs()[uf.id] || 'ok') + ' height ' + rfPGF(bb.max[1] - bb.min[1]) + ' length ' + rfPGF(bb.max[2] - bb.min[2]));
      assert(uf.type === 'unfold' && !rfPGErrs()[uf.id], 'Unfold1: ' + notes.join('; '));
      near(bb.max[1] - bb.min[1], T14, 1e-9, 'lies flat');
      near(bb.max[2] - bb.min[2], 4 + 1.5 - rfPGBD(R14, T14, K44), 1e-6, 'the blank 4 + 1.5 − BD');
      // the drawing's Chamfer Dimension
      await anvil.newPart(); await idle();
      await anvil.run(RFPG_CH); await idle();
      rfPGMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await UI.drawing.ready(); await wait(40);
      var rv = anvil.drawing.summary().views.filter(function (v) { return v.orient === 'Right'; })[0];
      assert(rv, 'a Right view: ' + JSON.stringify(anvil.drawing.summary().views.map(function (v) { return v.orient || v.kind; })));
      var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.id === rv.id; })[0], F = w.frame;
      function at(P) { return w.toSheet([P[0] * F.u[0] + P[1] * F.u[1] + P[2] * F.u[2], P[0] * F.v[0] + P[1] * F.v[1] + P[2] * F.v[2]]); }
      async function chamferDim(lead) {
        UI.setRibbonTab('Annotation'); await wait(20);
        var fw = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-fly'), function (x) { return x._fly && x._fly.fly === 'dwDim'; })[0];
        assert(fw, 'the Smart Dimension flyout');
        var cr = fw.querySelector('.rb-caret'); cr.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); cr.click();
        var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.replace(/\s+/g, ' ').trim().indexOf('Chamfer Dimension') === 0; })[0];
        assert(row, 'Chamfer Dimension in the flyout'); row.click(); if (UI.closeMenus) UI.closeMenus();
        UI.ribbonFlyFace('dwDim', 0);
        // the chamfer's middle (x anywhere: the Right view looks along it), then the lead-in edge, then the place
        var c = at([1.5, 0.85, 0.05]), l = at(lead), pl = at([1.5, 1.4, -0.4]);
        [c, l, pl].forEach(function (p) { sheetMouse('mousemove', p); sheetMouse('mousedown', p); sheetMouse('mouseup', p); });
        await idle(); await wait(30);
        rfPGKey('Escape'); await wait(20);
        var cd = anvil.drawing.summary().dimDetails.filter(function (d) { return d.kind === 'chamfer'; });
        return cd.length ? cd[cd.length - 1].text : 'none: ' + statusText();
      }
      var t1 = await chamferDim([1.5, 1, 1]);   // the top edge
      var t2 = await chamferDim([1.5, 0.3, 0]);   // the front edge
      notes.push('chamfer dimensions ' + t1 + ' / ' + t2);
      anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save");
      assert(t1 === '.100 X .300' && t2 === '.300 X .100', 'D1 X D2: ' + notes.join('; '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfPGDone(notes);
    });
    // head, local-2026-11-17c: ✓+ (OK and start another) on a Cut-Extrude started a Boss-Extrude (the command was run
    // again without its arguments); since rfPG's sketchThen that opened the "pick a plane" PM titled Boss-Extrude
    step('rfPG: ✓+ on a Cut-Extrude starts another Cut-Extrude, not a Boss-Extrude', async function () {
      await rfPGNewInch();
      anvil.run('p.box(4, 3, 1);\np.sketch("Top", 1).circle(1, -1, 0.25);');
      await idle(); await wait(30);
      UI.cmdExtrude(true); await idle(); await wait(20);
      rfPGPmOpen('Cut-Extrude');
      var plus = D.querySelector('#pm .pm-okplus'), n0 = UI.App.model.features.length;
      assert(plus, 'the ✓+ button');
      plus.click(); await idle(); await wait(40);
      var title = UI.hasPM() && UI.pmTitle(), last = rfPGLast(), n1 = UI.App.model.features.length;
      if (UI.hasPM()) UI.pmCancel();
      await idle();
      assert(n1 === n0 + 1 && last.type === 'extrude' && last.cut, 'the first cut was made: ' + (n1 - n0) + ' ' + last.type + ' ' + statusText());
      assert(title === 'Cut-Extrude', 'after ✓+: ' + title);
      return 'after ✓+: ' + title;
    });
  })();
