  // --- rfMV (2026-11-15, lane MV: shop drawings audit round 2, test-reports/2026-11-15-shop-drawing-audit-2.md) ---
  // A hole through a bend seen end-on picked by the mouse as a hole (Hole Callout, Center Mark), and the five shop
  // drawings made like a user: File ▸ Make Drawing from Part, Sheet2's flat, Tools ▸ Dimensions ▸ Autodimension,
  // Insert ▸ Bend Table, a Note, File ▸ Save Drawing as DXF / PDF / DWG; then the part changed and the drawing read
  // again. Self-contained.
  (function () {
    var T16 = 0.0598, T14 = 0.0747, T18 = 0.0478;
    var RFMV = {
      channel: 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[4, 0.06, 1.5]]);\np.flange(1, [[0, 0.06, 1.5]]);\n' +
        'p.sketch("Top").circle(4.02, -1.5, 0.1).cut("through", { both: true });',
      tray: 'p.name("Tray").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T16 + ', 0.06, 0.44, { relief: "rect" });\n' +
        'p.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
        'p.flange(1.5, [[5, ' + T16 + ', 0], [5, ' + T16 + ', 6], [0, ' + T16 + ', 3], [10, ' + T16 + ', 3]], { position: "inside", lengthRef: "outer" });\n' +
        'p.cornerRelief([[0.1198, ' + T16 + ', 0.1198], [9.8802, ' + T16 + ', 5.8802], [0.1198, ' + T16 + ', 5.8802], [9.8802, ' + T16 + ', 0.1198]], null, { reliefType: "circular" });\n' +
        'p.sketch("Top", ' + T16 + ').circle(3, -2, 0.1285).end().cut("through", { reverse: true });\n' +
        'p.linearPattern({ dir: "x", spacing: 2, count: 3, dir2: "z", spacing2: 2, count2: 2 });\n',
      bracket: 'p.name("Bracket").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T14 + ', 0.075, 0.44);\n' +
        'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        'p.flange(2, [[4, ' + T14 + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
        'p.flange(1.5, [[0, ' + T14 + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n' +
        'p.sketch("Top", ' + T14 + ').slot(3.6, -1.5, 4.3, -1.5, 0.375).end().cut("through", { reverse: true });\n' +
        'p.hem(0.5, [[4, 2, 1.5]], { gap: ' + T14 + ' });\n',
      panel: 'p.name("Perf Panel").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T18 + ', ' + T18 + ', 0.5);\n' +
        'p.sketch("Top").rect(0, 0, 24, 30).end().baseFlange();\n' +
        'p.flange(0.75, [[0, ' + T18 + ', -15], [24, ' + T18 + ', -15]], { position: "inside", lengthRef: "outer" });\n' +
        'p.sketch("Top", ' + T18 + ').circle(1.5, 1.5, 0.094).end().cut("through", { reverse: true });\n' +
        'p.linearPattern({ dir: "x", spacing: 0.75, count: 30, dir2: "z", spacing2: 1.4, count2: 20, reverse2: true });\n',
      hat: 'p.name("Hat Channel").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T16 + ', 0.06, 0.44);\n' +
        'p.sketch("Top").rect(0, -12, 2, 12).end().baseFlange();\n' +
        'p.flange(1.5, [[0, ' + T16 + ', 6], [2, ' + T16 + ', 6]], { position: "inside", lengthRef: "outer" });\n' +
        'p.flange(0.75, [[-' + T16 + ' / 2, 1.5, 6], [2 + ' + T16 + ' / 2, 1.5, 6]], { position: "inside", lengthRef: "outer" });\n' +
        'p.jog(0.25, 0.5, [[-0.6902, 1.5 - ' + T16 + ' / 2, 6]]);\n',
      loft: 'p.name("Transition").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T16 + ', ' + T16 + ', 0.5);\n' +
        'var a = p.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).id();\n' +
        'var b = p.sketch("Top", 3).arc(0, 0, 1, 270.03, 360).arc(0, 0, 1, 0, 90).arc(0, 0, 1, 90, 180).arc(0, 0, 1, 180, 270).id();\n' +
        'p.loftedBend([a, b]);\n'
    };
    function rfMVMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfMVClick(p) { rfMVMouse('mousemove', p); rfMVMouse('mousedown', p); rfMVMouse('mouseup', p); }
    function rfMVMenu(name, label) {
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
    function rfMVRibbon(label) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) ['Annotation', 'View Layout', 'Sheet Format'].some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    function rfMVTab(i) { return D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="' + i + '"]'); }
    function rfMVW(o) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.orient === o || (o === 'flat' && w.view.kind === 'flat'); })[0]; }
    function rfMVEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }
    async function rfMVDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    async function rfMVSaved(fn) {
      var got = [], sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: text }); };
      UI.download = function (name, data) { got.push(typeof data === 'string' ? { name: name, text: data } : { name: name, bytes: data }); };
      try { await fn(); await idle(); await wait(30); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    function rfMVLoadCheck() {
      if (window.DxfCheck) return Promise.resolve(window.DxfCheck);
      return new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = '../headless/dxf-check.js'; sc.onload = function () { res(window.DxfCheck); }; sc.onerror = function () { rej(new Error('dxf-check.js did not load')); }; document.head.appendChild(sc); });
    }
    async function rfMVPart(code) {
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
    }
    async function rfMVChange(fn) {
      UI.markClean();
      rfMVMenu('Window', '(part)'); await idle(); await wait(20);
      assert(!UI.drawingActive(), 'the part shows');
      UI.pushUndo(); fn(UI.App.model); await UI.rebuild(); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'rebuild: ' + JSON.stringify(anvil.summary().errors));
      rfMVMenu('Window', 'Draw'); await rfMVDone(); await wait(30);
      assert(UI.drawingActive(), 'the drawing opens again');
    }
    function rfMVMeet(a, b) { return a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9; }
    // texts (dimensions, notes, bend notes / tags) in the title block, on another view or on each other
    function rfMVClashes() {
      var sh = UI.drawing.state.sheet, tbs = W.Drawing.tbRects(sh.size, sh.units || 'in'), bad = [], items = [];
      sh.prims.forEach(function (p) {
        if (p.k !== 'text' || !/^(DIMENSIONS|NOTES|BEND_NOTES|ANNOTATIONS)$/.test(p.layer)) return;
        items.push({ t: p.text, b: W.Drawing.textRect(p), view: p.view, dim: p.dimIx });
      });
      items.forEach(function (it, i) {
        tbs.forEach(function (t) { if (rfMVMeet(it.b, t)) bad.push(it.t + ' in a block'); });
        sh.views.forEach(function (w) { if (it.view != null && w.view.id !== it.view && rfMVMeet(it.b, w.box)) bad.push(it.t + ' on ' + w.view.name); });
        items.slice(i + 1).forEach(function (o) { if ((it.dim == null || it.dim !== o.dim) && rfMVMeet(it.b, o.b)) bad.push(it.t + ' over ' + o.t); });
      });
      return bad.filter(function (x, i, a) { return a.indexOf(x) === i; });
    }

    step('rfMV: a hole through a bend seen end-on (Top) is one circle on the sheet: Hole Callout (click the circle, click to place) reads Ø.200 THRU ALL, Center Mark on it by a click', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfMVPart(RFMV.channel);
      anvil.drawing.make({ fresh: true }); await rfMVDone();
      UI.drawing.fit(); await wait(20);
      var w = rfMVW('Top');
      var circ = st.sheet.prims.filter(function (p) { return p.layer === w.layer && p.k === 'circle' && Math.abs(p.r - 0.1 * w.scale) < 1e-6; });
      assert(circ.length === 1, 'one circle of the hole in Top: ' + circ.length);
      assert(!st.sheet.prims.some(function (p) { return p.layer === w.layer && p.bz; }), 'no Bézier pieces in Top');
      var C = circ[0].c, R = circ[0].r, onC = [C[0] + R * Math.cos(2.2), C[1] + R * Math.sin(2.2)];
      // Hole Callout: the circle, then where the text goes
      rfMVRibbon('Hole Callout').click(); await wait(10);
      rfMVClick(onC); await wait(10);
      rfMVMouse('mousemove', [C[0] - 0.9, C[1] + 0.7]); await wait(10);
      rfMVClick([C[0] - 0.9, C[1] + 0.7]); await rfMVDone();
      rfMVEnd();
      var texts = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'ANNOTATIONS'; }).map(function (p) { return p.text; });
      assert(texts.indexOf('Ø.200 THRU ALL') >= 0, 'callout: ' + texts.join(' | '));
      var cm0 = (st.sheet.annotations || []).filter(function (a) { return a.type === 'centerMark'; }).length;
      rfMVRibbon('Center Mark').click(); await wait(10);
      rfMVClick(onC); await rfMVDone();
      rfMVEnd();
      var cm = (st.sheet.annotations || []).filter(function (a) { return a.type === 'centerMark'; });
      assert(cm.length === cm0 + 1 && cm.some(function (a) { return Math.hypot(a.c ? a.c[0] - C[0] : 1, a.c ? a.c[1] - C[1] : 1) < 1e-6 || a.box && a.box.x0 < C[0] && a.box.x1 > C[0] && a.box.y0 < C[1] && a.box.y1 > C[1]; }), 'a centre mark on the hole: ' + cm0 + ' -> ' + cm.length);
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return texts.join(' | ');
    });

    // one shop drawing made with the menus, ribbon and mouse; edit(model) then changes the part
    async function rfMVShop(name, edit) {
      var st = UI.drawing.state, Chk = await rfMVLoadCheck(), out = { name: name };
      await rfMVPart(RFMV[name]);
      rfMVMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfMVDone(); await wait(20);
      assert(UI.drawingActive(), name + ': drawing open');
      out.sheet1 = st.sheet.views.map(function (w) { return w.view.kind === 'flat' ? 'Flat' : w.view.orient; }).join(',');
      out.clash1 = rfMVClashes();
      var t1 = rfMVTab(1);
      if (t1) { t1.click(); await rfMVDone(); }
      var fw = rfMVW('flat');
      assert(fw, name + ': a flat view (' + out.sheet1 + ')');
      out.notes = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'BEND_NOTES'; }).map(function (p) { return p.text; });
      // Tools ▸ Dimensions ▸ Autodimension, the flat picked, OK
      rfMVMenu('Tools', 'Dimensions ▸ Autodimension'); await wait(10);
      assert(st.tool === 'autodim' && st.pending && st.pending.view === fw.view.id, name + ': the flat is picked');
      await UI.pmOK();
      await rfMVDone(); rfMVEnd();
      out.ords = st.sheet.dims.filter(function (d) { return d.kind === 'ordinate'; }).length;
      // Insert ▸ Bend Table
      rfMVMenu('Insert', 'Bend Table'); await rfMVDone(); rfMVEnd();
      var bt = (st.sheet.annotations || []).filter(function (a) { return a.type === 'bendTable'; })[0];
      out.tableRows = bt ? bt.info.rows.length : 0;
      // a Note from the ribbon on free paper left of the title block
      rfMVRibbon('Note').click(); await wait(10);
      rfMVClick([1.2, 2.4]); await wait(10);
      assert(st.inline, name + ': the note box');
      st.inline.inp.value = 'NOTES:\n1. BREAK ALL SHARP EDGES.\n2. MATERIAL: $PRPSHEET:"Material" $PRPSHEET:"Thickness"';
      D.querySelector('#dw-edit .dw-edit-btn.ok').click(); await rfMVDone();
      rfMVEnd();
      out.clash2 = rfMVClashes();
      out.warnings = (st.sheet.warnings || []).slice();
      // File ▸ Save Drawing as DXF / PDF / DWG
      var dxf = (await rfMVSaved(function () { rfMVMenu('File', 'Save Drawing as DXF'); }))[0];
      var pdf = (await rfMVSaved(function () { rfMVMenu('File', 'Save Drawing as PDF'); }))[0];
      var dwgs = await rfMVSaved(async function () { st.lastDwg = null; rfMVMenu('File', 'Save Drawing as DWG'); for (var k = 0; k < 60 && !st.lastDwg; k++) await wait(50); });
      assert(dxf && dxf.text && pdf && pdf.text, name + ': DXF and PDF saved');
      out.audit = Chk.audit(dxf.text).errors.filter(function (e) { return !/^duplicate SOLID on /.test(e); });
      out.pdfPages = (pdf.text.match(/\/Type\s*\/Page\b/g) || []).length;
      out.pdfBox = (pdf.text.match(/\/MediaBox\s*\[([^\]]*)\]/) || [])[1];
      var dwg = dwgs.filter(function (g) { return g.bytes; })[0];
      out.dwg = dwg ? String.fromCharCode.apply(null, new Uint8Array(dwg.bytes.buffer || dwg.bytes).subarray(0, 6)) : null;
      out.dims = anvil.drawing.summary().dims.slice();
      if (edit) {
        await rfMVChange(edit);
        var t1b = rfMVTab(1);
        if (t1b) { t1b.click(); await rfMVDone(); }
        out.dims2 = anvil.drawing.summary().dims.slice();
        out.notes2 = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'BEND_NOTES'; }).map(function (p) { return p.text; });
        out.dangling = st.sheet.dims.filter(function (d) { return d.dangling; }).length;
        out.clash3 = rfMVClashes();
        rfMVTab(0).click(); await rfMVDone();
        out.clash4 = rfMVClashes();
      }
      UI.markClean(); anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); await idle();
      return out;
    }
    function rfMVCheck(o, opt) {
      opt = opt || {};
      var skip = opt.skip || function () { return false; };
      assert(/^Front,Top,Right,Isometric/.test(o.sheet1), o.name + ': Sheet1 ' + o.sheet1);
      [o.clash1, o.clash2, o.clash3 || [], o.clash4 || []].forEach(function (c, i) { c = c.filter(function (x) { return !skip(x); }); assert(!c.length, o.name + ' clash ' + i + ': ' + c.slice(0, 5).join('; ')); });
      assert(o.notes.length > 0 || o.tableRows > 0, o.name + ': bend notes');
      assert(o.ords === 2 || opt.noOrd, o.name + ': Autodimension ordinates ' + o.ords);
      assert(o.tableRows === opt.bends, o.name + ': Bend Table ' + o.tableRows + ' rows');
      assert(!o.audit.length, o.name + ': DXF audit ' + JSON.stringify(o.audit).slice(0, 300));
      assert(o.pdfPages >= 1 && /0 0 1224 792/.test(String(o.pdfBox).replace(/\s+/g, ' ')), o.name + ': PDF ' + o.pdfPages + ' ' + o.pdfBox);
      assert(o.dwg === 'AC1015', o.name + ': DWG ' + o.dwg);
      if (o.dims2) {
        assert(!o.dangling, o.name + ': dangling after the edit');
        assert(JSON.stringify(o.dims2) !== JSON.stringify(o.dims), o.name + ': the dimensions follow the change');
      }
    }
    step('rfMV: shop drawings a / b — tray and bracket made with the menus and the mouse (Make Drawing from Part, Sheet2, Autodimension, Bend Table, Note, Save as DXF / PDF / DWG), then a flange and a hole / slot changed: nothing on the blocks or on each other, dimensions follow', async function () {
      var errs0 = errors.length;
      var a = await rfMVShop('tray', function (m) {
        m.features.filter(function (f) { return f.type === 'flange'; })[0].length = 2;
        m.features.forEach(function (f) { if (f.type === 'sketch') f.entities.forEach(function (e) { if (e.t === 'circle') e.r = 0.1435; }); });
      });
      rfMVCheck(a, { bends: 4 });
      var b = await rfMVShop('bracket', function (m) {
        m.features.filter(function (f) { return f.type === 'flange'; })[1].length = 2;
        m.features.forEach(function (f) { if (f.type === 'sketch') f.entities.forEach(function (e) { if (e.t === 'slot') e.w = 0.405; }); });
      });
      rfMVCheck(b, { bends: 3 });
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'tray ' + a.dims2.slice(0, 2).join(' | ') + '; bracket ' + b.notes.join(' | ');
    });
    step('rfMV: shop drawings c / d / e — perforated panel (600 holes: flat on Sheet2, the Hole Table not asked), hat channel with a jog, square-to-round Lofted-Bend; the hat\'s jog changed', async function () {
      var errs0 = errors.length;
      var c = await rfMVShop('panel');
      // (600 centre marks at 1:8 and the tags among them are not asked here: no Center Mark / Hole Table in this flow)
      rfMVCheck(c, { bends: 2 });
      var d = await rfMVShop('hat', function (m) { m.features.filter(function (f) { return f.type === 'jog'; })[0].length = 0.75; });
      rfMVCheck(d, { bends: 6 });
      var e = await rfMVShop('loft');
      rfMVCheck(e, { bends: 20, noOrd: true });
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'panel ' + c.sheet1 + '; hat ' + d.notes.length + ' bends; loft ' + e.tableRows + ' rows, ' + e.ords + ' ordinate sets';
    });
  })();
