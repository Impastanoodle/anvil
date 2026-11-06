  // --- rfJQ (2026-11-06, lane shopflow, test-reports/2026-11-06-shop-flow.md) --- three shop jobs start to finish in
  // the app: (a) 16 ga L-bracket 4 x 3 + 2 (Edge-Flange PM with a clicked edge, two Ø.281 holes, a slot), Flatten,
  // DXF/DWG Output R2000 ✓, a drawing (Standard 3 View, flat view with Bend Table + Hole Table), Save Drawing as DXF /
  // PDF from the File menu; (b) 14 ga open box 10 x 6 x 2 with a hem and two corner reliefs, flat DXF + drawing; (c)
  // 18 ga 12 x 8 panel with a louver row and a Punch Table from the Annotation tab. Each drawing: nothing in the title
  // block / tolerance block, no annotation across another view or off the border. Self-contained.
  (function () {
    var T16 = 0.0598, T14 = 0.0747, T18 = 0.0478;
    function rfJQBD(R, T, K) { return 2 * (R + T) - Math.PI / 2 * (R + K * T); }   // 90° bend deduction
    function rfJQEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfJQClick(p) { rfJQEv('mousemove', p); rfJQEv('mousedown', p, $('viewport')); rfJQEv('mouseup', p); }
    function rfJQMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
      var hit = rows.filter(function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name); hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    // the text a File ▸ Save … command hands to the save dialog / download
    async function rfJQSaved(fn) {
      var got = null, sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got = { name: name, text: text }; };
      UI.download = function (name, text) { got = { name: name, text: text }; };
      try { await fn(); await idle(); await wait(20); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    // the ENTITIES section as [{ type, layer, x: [10s], y: [20s] }] (code / value pairs)
    function rfJQEntities(t) {
      var L = t.split(/\r?\n/), out = [], cur = null, inE = false;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = +L[i], v = L[i + 1].trim();
        if (c === 2 && v === 'ENTITIES') { inE = true; continue; }
        if (!inE) continue;
        if (c === 0) { if (v === 'ENDSEC') break; cur = { type: v, layer: '', x: [], y: [] }; out.push(cur); continue; }
        if (!cur) continue;
        if (c === 8) cur.layer = v; else if (c === 10) cur.x.push(+v); else if (c === 20) cur.y.push(+v);
      }
      return out;
    }
    function rfJQCount(t, type, layer) { return rfJQEntities(t).filter(function (e) { return e.type === type && e.layer === layer; }).length; }
    function rfJQBox(p) {
      if (p.k === 'text') return W.Drawing.textRect(p);
      if (p.k === 'line') return { x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), y0: Math.min(p.a[1], p.b[1]), y1: Math.max(p.a[1], p.b[1]) };
      return null;
    }
    function rfJQMeet(a, b) { return a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9; }
    // the sheet's dimensions, tables, flat notes and notes: [what clashes]
    function rfJQClashes() {
      var sh = UI.drawing.state.sheet, S = sh.size, tbs = W.Drawing.tbRects(S, 'in'), b1 = 10 / 25.4, bad = [];
      var items = [];
      (sh.annotations || []).forEach(function (a) { if (a.box && !a.hidden) items.push({ n: a.type + ' ' + (a.text || ''), b: a.box, view: a.view, own: a.flat }); });
      (sh.holeTables || []).forEach(function (t) { items.push({ n: (t.punch ? 'Punch' : 'Hole') + ' Table', b: t.box }); });
      sh.dims.forEach(function (d, i) { sh.prims.forEach(function (p) { if (p.dimIx === i) { var b = rfJQBox(p); if (b) items.push({ n: 'dim ' + d.text, b: b, view: d.view }); } }); });
      items.forEach(function (it, i) {
        tbs.forEach(function (t) { if (rfJQMeet(it.b, t)) bad.push(it.n + ' in the title / tolerance block'); });
        sh.views.forEach(function (w) { if (w.view.id !== it.view && rfJQMeet(it.b, w.box)) bad.push(it.n + ' across ' + w.view.name); });
        if (it.b.x0 < b1 || it.b.y0 < b1 || it.b.x1 > S[0] - b1 || it.b.y1 > S[1] - b1) bad.push(it.n + ' off the sheet');
        items.slice(i + 1).forEach(function (o) { if (!/^dim/.test(it.n) && !/^dim/.test(o.n) && rfJQMeet(it.b, o.b)) bad.push(it.n + ' over ' + o.n); });
      });
      return bad.filter(function (x, i, a) { return a.indexOf(x) === i; });
    }
    async function rfJQFlatDxf(expectW, expectH, label) {
      UI.cmdDxfOutput(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'DXF/DWG Output PM');
      setInput(D.querySelector('#pm select[data-key="version"]'), 'R2000'); await wait(10);
      var t0 = performance.now();
      var got = await rfJQSaved(function () { return pmAccept(); });
      var ms = performance.now() - t0;
      assert(got && /_flat\.dxf$/.test(got.name), label + ': downloaded ' + (got && got.name));
      var t = got.text;
      assert(/\$ACADVER\n1\nAC1015\n/.test(t) && /\$INSUNITS\n70\n1\n/.test(t), label + ': R2000 inch header');
      // the blank's size from its OUTLINE polyline (the header extents take the bend-note texts too)
      var outl = rfJQEntities(t).filter(function (e) { return e.type === 'LWPOLYLINE' && e.layer === 'OUTLINE'; })[0];
      assert(outl, label + ': an OUTLINE polyline');
      var xs = outl.x, ys = outl.y;
      near(Math.max.apply(null, xs) - Math.min.apply(null, xs), expectW, 1e-4, label + ': blank width');
      near(Math.max.apply(null, ys) - Math.min.apply(null, ys), expectH, 1e-4, label + ': blank height');
      assert(Math.abs(Math.min.apply(null, xs)) < 1e-9 && Math.abs(Math.min.apply(null, ys)) < 1e-9, label + ': the blank at 0,0');
      assert(ms < 3000, label + ': DXF Output took ' + Math.round(ms) + ' ms');
      return t;
    }
    async function rfJQDrawingOut(label) {
      var dxf = await rfJQSaved(function () { rfJQMenu('File', 'Save Drawing as DXF'); });
      assert(dxf && /\.dxf$/.test(dxf.name) && /\nENTITIES\n/.test(dxf.text), label + ': Save Drawing as DXF');
      var pdf = await rfJQSaved(function () { rfJQMenu('File', 'Save Drawing as PDF'); });
      assert(pdf && /\.pdf$/.test(pdf.name) && /^%PDF-1\.4/.test(pdf.text) && /%%EOF\s*$/.test(pdf.text), label + ': Save Drawing as PDF');
      return { dxf: dxf.text, pdf: pdf.text };
    }

    step('rfJQ: job a, 16 ga L-bracket: Edge-Flange PM on a clicked edge (Material Inside, 2 in) ✓, holes + slot, Flatten 4 x 4.896, DXF/DWG Output R2000 ✓ (inch, blank size, 2 holes + slot), drawing: Standard 3 View + flat with Bend Table and Hole Table, nothing in the title block, File ▸ Save Drawing as DXF / PDF', async function () {
      var errs0 = errors.length, R = 0.06, Kf = 0.44, BD = rfJQBD(R, T16, Kf);
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run('p.name("L-Bracket").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T16 + ', ' + R + ', ' + Kf + ');\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n'); await idle();
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      UI.cmdEdgeFlange(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Edge-Flange', 'Edge-Flange PM');
      var e = edgeNear([2, T16, 3]), s = UI.worldToScreen(e.mid);
      rfJQClick(s); await idle(); await wait(20);
      assert(UI.pmSpec().values.edges.length === 1, 'edge taken: ' + statusText());
      setInput(pmField('Position'), 'inside'); await wait(10);
      setInput(pmField('Length'), 2); await wait(10);
      var t0 = performance.now();
      await pmAccept(); await wait(30);
      assert(performance.now() - t0 < 3000, 'Edge-Flange ✓ took ' + Math.round(performance.now() - t0) + ' ms');
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'flange' && f.lengthRef === 'outer' && !UI.App.build.errors[f.id], 'flange: ' + JSON.stringify(f));
      await anvil.append('p.sketch("Top", ' + T16 + ').circle(1, -1, 0.1405).circle(3, -1, 0.1405).end().cut("through", { reverse: true });\np.sketch("Front").slot(1.5, 1.2, 2.5, 1.2, 0.281).end().cut("through");\n'); await idle();
      assert(!Object.keys(anvil.summary().errors).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      // Flatten (Sheet Metal ribbon)
      UI.toggleFlatten(true); await idle(); await wait(20);
      assert(UI.App.flat && !UI.App.flatError, 'Flatten: ' + UI.App.flatError);
      var fp = K.flatPattern(UI.App.model, UI.App.build, UI.App.mesh);
      near(fp.size[0], 4, 1e-6, 'flat width'); near(fp.size[1], 3 + 2 - BD, 1e-6, 'flat length 3 + 2 − BD');
      UI.toggleFlatten(false); await idle();
      var t = await rfJQFlatDxf(4, 3 + 2 - BD, 'flat');
      assert(rfJQCount(t, 'CIRCLE', 'HOLES') === 2 && rfJQCount(t, 'LWPOLYLINE', 'HOLES') === 1 && rfJQCount(t, 'LWPOLYLINE', 'OUTLINE') === 1, 'two holes, a slot, one blank');
      // drawing
      anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
      anvil.drawing.flatView({ bendNotes: 'table' }); await UI.drawing.ready(); await wait(30);
      var fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
      assert(fv, 'flat view');
      var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.id === fv.id; })[0];
      assert(anvil.drawing.holeTable(fv.id, { origin: { p: [w.flat.bbox.umin, w.flat.bbox.vmin] }, all: true }) != null, 'Hole Table');
      await UI.drawing.ready(); await wait(20);
      var ht = anvil.drawing.holeTables();
      assert(ht.length === 1 && ht[0].rows.length === 2 && ht[0].rows.every(function (r) { return /^Ø\.281/.test(r.size); }), 'two Ø.281 rows: ' + JSON.stringify(ht.map(function (x) { return x.rows.map(function (r) { return r.size; }); })));
      var anns = UI.drawing.state.sheet.annotations.map(function (a) { return a.type; });
      assert(anns.indexOf('bendTable') >= 0, 'Bend Table: ' + anns.join(','));
      var bad = rfJQClashes();
      assert(!bad.length, bad.join('; '));
      var tb = anvil.drawing.summary().titleBlock || {};
      assert(/L-BRACKET/.test(JSON.stringify(tb)) && /\.0598/.test(JSON.stringify(tb)), 'title block: ' + JSON.stringify(tb).slice(0, 300));
      var out = await rfJQDrawingOut('a');
      assert(out.dxf.indexOf('Ø.281') >= 0 || out.dxf.indexOf('%%c.281') >= 0, 'hole sizes in the drawing DXF');
      anvil.drawing.close(); await idle();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'blank 4 x ' + (3 + 2 - BD).toFixed(4);
    });

    step('rfJQ: job b, 14 ga open box 10 x 6 x 2 (four flanges, a hem, two circular Corner Reliefs) and job c, 18 ga 12 x 8 panel with four louvers: flat DXFs to size, drawings with Bend Table / Punch Table (Annotation ribbon) clear of the title block and the views', async function () {
      var errs0 = errors.length, R = 0.075, Kf = 0.44, BD = rfJQBD(R, T14, Kf);
      await anvil.newPart(); await idle();
      var t0 = performance.now();
      await anvil.run('p.name("Open-Box").units("in");\np.sheet(' + T14 + ', ' + R + ', ' + Kf + ', { relief: "rect" });\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
        'p.flange(2, [[5, ' + T14 + ', 0], [5, ' + T14 + ', 6], [0, ' + T14 + ', 3], [10, ' + T14 + ', 3]], { position: "inside", lengthRef: "outer" });\n' +
        'p.cornerRelief([[9.8503, 0.0747, 0.1497], [0.1497, 0.0747, 5.8503]], null, { reliefType: "circular" });\n' +
        'p.hem(0.375, [[5, 2, 0]], { gap: 0.0299 });\n'); await idle();
      var buildMs = performance.now() - t0;
      assert(!Object.keys(anvil.summary().errors).length, 'box: ' + JSON.stringify(anvil.summary().errors));
      var fp = K.flatPattern(UI.App.model, UI.App.build, UI.App.mesh);
      near(fp.size[0], 10 + 2 * (2 - BD), 1e-6, 'box blank width 10 + 2 (2 − BD)');
      assert(fp.loops.length === 1, 'one blank, the reliefs in its mitred corners: ' + fp.loops.length);
      await rfJQFlatDxf(fp.size[0], fp.size[1], 'box flat');
      anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
      anvil.drawing.flatView({ bendNotes: 'table' }); await UI.drawing.ready(); await wait(30);
      var bad = rfJQClashes();
      assert(!bad.length, 'box sheet ' + (anvil.drawing.summary().sheet || {}).name + ': ' + bad.join('; '));
      await rfJQDrawingOut('b');
      anvil.drawing.close(); await idle();
      // job c
      await anvil.newPart(); await idle();
      var code = 'p.name("Panel").units("in");\np.sheet(' + T18 + ', 0.05, 0.44);\np.sketch("Top").rect(0, -8, 12, 8).end().baseFlange();\n';
      [3, 5, 7, 9].forEach(function (x) { code += 'p.formingTool("louver", [' + x + ', ' + T18 + ', 4], { angle: 90 });\n'; });
      await anvil.run(code); await idle();
      assert(!Object.keys(anvil.summary().errors).length, 'panel: ' + JSON.stringify(anvil.summary().errors));
      var t = await rfJQFlatDxf(12, 8, 'panel flat');
      assert(rfJQCount(t, 'LWPOLYLINE', 'FORM') === 4, 'four louver outlines on FORM');
      anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
      anvil.drawing.flatView({}); await UI.drawing.ready(); await wait(30);
      var fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
      assert(fv, 'flat view');
      UI.drawing.state.sel = { kind: 'view', id: fv.id };
      ribbonButton('Punch Table').click(); await idle();
      assert(UI.drawing.state.tool === 'punchtable' && UI.pmTitle() === 'Punch Table', 'Punch Table PM');
      await UI.pmOK(); await idle(); await wait(40);
      var ht = anvil.drawing.holeTables();
      assert(ht.length === 1 && ht[0].punch && ht[0].rows.length === 4 && ht[0].rows.every(function (r) { return /^LOUVER /.test(r.size); }), 'four louvers: ' + JSON.stringify(ht.map(function (x) { return x.rows.map(function (r) { return r.tag + ' ' + r.size; }); })));
      bad = rfJQClashes();
      assert(!bad.length, 'panel sheet: ' + bad.join('; '));
      var out = await rfJQDrawingOut('c');
      assert(out.dxf.indexOf('PUNCH ID') >= 0, 'Punch Table in the drawing DXF');
      anvil.drawing.close(); await idle();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'box build ' + Math.round(buildMs) + ' ms, blank ' + fp.size.map(function (x) { return x.toFixed(4); }).join(' x ');
    });
  })();
