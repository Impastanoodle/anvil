  // --- rfLG (2026-11-11, lane drawflow4, test-reports/2026-11-11-drawing-flow.md *Round 4*) --- Make Drawing from Part's
  // own layout (a plate's face + edge view; Front / Top / Right + isometric + the flat), Rotate View at 30° with its
  // dimensions, and four more shop drawings made with mouse and key events (the console builds the parts, changes the
  // model as its PropertyManagers would and reads the results). Self-contained.
  (function () {
    var RFLG_BRACKET = 'p.name("Bracket").units("in");\np.material("Plain Carbon Steel");\np.property("Description", "Formed bracket");\np.property("Part Number", "BR-100");\np.property("Revision", "A");\n' +
      'p.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.flange(1.5, [[0, 0.0598, 1.5]]);\np.flange(2, [[6, 0.0598, 1.5]], { angle: 120 });\n' +
      'p.hole("Top", 1.5, -0.75, 0.281, { offset: 0.0598 });\np.hole("Top", 4.5, -0.75, 0.281, { offset: 0.0598 });\np.hole("Top", 3, -1.5, 0.5, { offset: 0.0598 });';
    var RFLG_PLATE = 'p.name("Blank").units("in");\np.material("Plain Carbon Steel");\np.property("Part Number", "BL-10");\np.sheet(0.0598, 0.06, 0.71);\n' +
      'p.sketch("Top").rect(0, -4, 10, 4).end().baseFlange();\np.hole("Top", 2, -2, 0.5, { offset: 0.0598 });\np.hole("Top", 8, -2, 0.5, { offset: 0.0598 });';
    function rfLGMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: type === 'dblclick' ? 2 : 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfLGClick(p) { rfLGMouse('mousemove', p); rfLGMouse('mousedown', p); rfLGMouse('mouseup', p); }
    async function rfLGDrag(a, b) {
      rfLGMouse('mousemove', a); rfLGMouse('mousedown', a); await wait(10);
      for (var i = 1; i <= 5; i++) { rfLGMouse('mousemove', [a[0] + (b[0] - a[0]) * i / 5, a[1] + (b[1] - a[1]) * i / 5]); await wait(5); }
      rfLGMouse('mouseup', b); await wait(10);
    }
    function rfLGKey(k, extra) { W.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {}))); }
    function rfLGMenu(name, label) {
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
    function rfLGRibbon(label) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) ['Annotation', 'View Layout', 'Sheet Format', 'Sheet Metal'].some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    function rfLGCtx(p, re) {
      rfLGMouse('mousemove', p); rfLGMouse('contextmenu', p, { button: 2 });
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), mi = rows.filter(function (m) { return re.test(m.textContent); })[0];
      assert(mi, re + ' in the menu: ' + rows.map(function (m) { return m.textContent; }).join(' | '));
      mi.click(); if (UI.closeMenus) UI.closeMenus();
    }
    function rfLGW(o) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.orient === o || (o === 'flat' && w.view.kind === 'flat'); })[0]; }
    function rfLGEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }
    async function rfLGDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    function rfLGTab(i) { return D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="' + i + '"]'); }
    function rfLGOrients() { return UI.drawing.state.sheet.views.map(function (w) { return w.view.kind === 'flat' ? 'Flat' : w.view.orient; }).join(','); }
    async function rfLGPart(code) {
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
    }
    async function rfLGDrawing(code) {
      await rfLGPart(code);
      rfLGMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfLGDone(); await wait(20);
      assert(UI.drawingActive(), 'drawing open');
    }
    async function rfLGClose() { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); await idle(); }
    // the ENTITIES of a DXF as { type, layer, text, x, y } (group code / value pairs)
    function rfLGDxfEnts(dxf) {
      var L = dxf.replace(/\r/g, '').split('\n'), out = [], cur = null, inEnt = false;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1];
        if (c === '2' && v === 'ENTITIES') inEnt = true;
        if (!inEnt) continue;
        if (c === '0') { if (v === 'ENDSEC') break; cur = { type: v, layer: null, text: '' }; out.push(cur); }
        else if (cur && c === '8') cur.layer = v;
        else if (cur && (c === '1' || c === '3')) cur.text += v;
        else if (cur && c === '10' && cur.x == null) cur.x = +v;
        else if (cur && c === '20' && cur.y == null) cur.y = +v;
        else if (cur && c === '11') cur.x11 = +v;
        else if (cur && c === '21') cur.y11 = +v;
        else if (cur && c === '50') cur.ang = +v;
      }
      return out;
    }

    step('rfLG: 0. File ▸ Make Drawing from Part lays out the part\'s own views — a 16 ga blank: its face (Top) and one edge view (Front), no isometric; a formed bracket: Front / Top / Right, the isometric upper right, its flat pattern with bend notes on Sheet2 (Sheet1 shown); one undo step each', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfLGPart(RFLG_PLATE);
      var u0 = UI.App.undo.length;
      rfLGMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfLGDone();
      assert(rfLGOrients() === 'Front,Top', 'the blank: ' + rfLGOrients());
      assert(D.querySelectorAll('#drawing-tree .dw-view').length === 2 && UI.App.undo.length === u0 + 1, 'two tree rows, one undo step');
      var T = rfLGW('Top'), F = rfLGW('Front');
      assert(T.box.y0 > F.box.y1 && Math.abs((T.box.x0 + T.box.x1) / 2 - (F.box.x0 + F.box.x1) / 2) < 1e-6, 'Top above Front, aligned');
      assert(anvil.drawing.summary().sheet.scale === '1:1', 'scale ' + anvil.drawing.summary().sheet.scale);
      await rfLGClose();
      await rfLGDrawing(RFLG_BRACKET);
      assert(rfLGOrients() === 'Front,Top,Right,Isometric', 'the bracket\'s Sheet1: ' + rfLGOrients());
      assert(rfLGTab(1) && rfLGTab(0).classList.contains('active'), 'Sheet2 tab, Sheet1 shown');
      rfLGTab(1).click(); await rfLGDone();
      var fw = rfLGW('flat');
      assert(rfLGOrients() === 'Flat' && fw && Math.abs(fw.scale - 1) < 1e-12, 'Sheet2 holds the flat at 1:1: ' + rfLGOrients());
      assert(st.sheet.prims.filter(function (p) { return p.layer === 'BEND_NOTES' && p.k === 'text'; }).length === 2, 'two bend notes');
      rfLGTab(0).click(); await rfLGDone();
      await rfLGClose();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'blank: Front, Top; bracket: F / T / R / Iso + Sheet2 flat';
    });

    step('rfLG: 1. Rotate View 30° on a dimensioned Top view (right-click ▸ Rotate View): the 3.000 and the .750 turn with the holes and read the same, texts horizontal; dragging the 3.000 moves it across its turned line; one undo step; Ctrl+Z turns it back', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfLGDrawing(RFLG_BRACKET);
      var T = rfLGW('Top');
      UI.drawing.smartDimension(); await wait(10);
      rfLGClick(T.toSheet([1.5, -0.75])); await wait(10); rfLGClick(T.toSheet([4.5, -0.75])); await wait(10); rfLGClick(T.toSheet([3.2, 0.9])); await rfLGDone();
      rfLGClick(T.toSheet([1.5, -0.75])); await wait(10); rfLGClick(T.toSheet([2.2, 0])); await wait(10); rfLGClick(T.toSheet([0.6, 0.45])); await rfLGDone();
      rfLGEnd();
      var mine = function () { return st.sheet.dims.filter(function (d) { return !d.auto && d.view === rfLGW('Top').view.id; }); };
      assert(mine().map(function (d) { return d.text; }).join() === '3.000,.750', 'the dimensions: ' + mine().map(function (d) { return d.text; }));
      var u0 = UI.App.undo.length;
      rfLGCtx(T.toSheet([4, -1.5]), /Rotate View/); await wait(20);
      assert(modalOpen() && /Rotate Drawing View/.test(D.querySelector('#modal').textContent), 'Rotate Drawing View dialog');
      D.getElementById('dw-rotate-angle').value = '30';
      clickModalButton('Apply'); await rfLGDone();
      T = rfLGW('Top');
      assert(!modalOpen() && T.view.rotate === 30 && UI.App.undo.length === u0 + 1, 'turned 30°, one step (refused before: steps of 90)');
      assert(mine().map(function (d) { return d.text + ':' + d.kind + (d.dangling ? '?' : ''); }).join() === '3.000:h,.750:v', 'the same values on the turned geometry: ' + mine().map(function (d) { return d.text + ':' + d.kind; }));
      var tx = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS' && (p.text === '3.000' || p.text === '.750'); });
      assert(tx.length === 2 && tx.every(function (p) { return !p.rot; }), 'texts horizontal: ' + tx.map(function (p) { return p.rot; }));
      // the 3.000's extension lines start at the two hole centres on the turned sheet
      var d3 = mine()[0], hv = T.view.dims.filter(function (d) { return d.kind === 'h'; })[0], c1 = T.toSheet(hv.a), c2 = T.toSheet(hv.b), turned = W.Drawing.rotateFrame ? T.toSheet([1.5 * Math.cos(Math.PI / 6) + 0.75 * Math.sin(Math.PI / 6), 1.5 * Math.sin(Math.PI / 6) - 0.75 * Math.cos(Math.PI / 6)]) : null;
      assert(Math.hypot(turned[0] - c1[0], turned[1] - c1[1]) < 1e-6, 'the first centre turned 30° with the view');
      assert(Math.hypot(d3.dxf.p13[0] - c1[0], d3.dxf.p13[1] - c1[1]) < 1e-9 && Math.hypot(d3.dxf.p14[0] - c2[0], d3.dxf.p14[1] - c2[1]) < 1e-9 && Math.abs(d3.dxf.ang - 30) < 1e-9, 'on the centres, at 30°: ' + JSON.stringify([d3.dxf, c1, c2]));
      // drag its text 0.4 in out across the line (the line moves along the turned normal)
      var tb = d3.tbox, from = [(tb.x0 + tb.x1) / 2, (tb.y0 + tb.y1) / 2], nrm = [-Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)], at0 = T.view.dims.filter(function (d) { return d.kind === 'h'; })[0].at;
      var u1 = UI.App.undo.length;
      await rfLGDrag(from, [from[0] + nrm[0] * 0.4, from[1] + nrm[1] * 0.4]); await rfLGDone();
      var at1 = rfLGW('Top').view.dims.filter(function (d) { return d.kind === 'h'; })[0].at;
      assert(Math.abs(at1 - at0 - 0.4 / rfLGW('Top').scale) < 0.02 && UI.App.undo.length === u1 + 1, 'dragged across its turned line: ' + at0 + ' -> ' + at1);
      await UI.undo(); await rfLGDone();
      await UI.undo(); await rfLGDone();
      assert(!rfLGW('Top').view.rotate && mine().map(function (d) { return d.text + ':' + d.kind; }).join() === '3.000:h,.750:v' && mine().every(function (d) { return !rfLGW('Top').view.dims.some(function (x) { return x.rot; }); }), 'Ctrl+Z: back square');
      var pdf = anvil.drawing.pdf();
      assert(pdf.indexOf('%PDF') === 0, 'PDF');
      await rfLGClose();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return '30°: ' + mine().map(function (d) { return d.text; }).join(', ');
    });

    function rfLGLoadCheck() {
      if (window.DxfCheck) return Promise.resolve(window.DxfCheck);
      return new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = '../headless/dxf-check.js'; sc.onload = function () { res(window.DxfCheck); }; sc.onerror = function () { rej(new Error('dxf-check.js did not load')); }; document.head.appendChild(sc); });
    }
    async function rfLGSaved(fn) {
      var got = [], sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: text }); };
      UI.download = function (name, data) { got.push(typeof data === 'string' ? { name: name, text: data } : { name: name, bytes: data }); };
      try { await fn(); await idle(); await wait(30); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    function rfLGPdfText(t) { return '(' + String(t).replace(/[\\()]/g, function (c) { return '\\' + c; }).replace(/Ø/g, '\\330').replace(/±/g, '\\261').replace(/°/g, '\\260') + ')'; }

    step('rfLG: a. a flat-pattern drawing for the laser and the brake — Sheet2\'s flat (made by Make Drawing from Part): Autodimension ordinates from the lower-left corner, the overall size by Smart Dimension clicks, Bend Table, a material / thickness / grain note linked to the part\'s properties; File ▸ Save Drawing as DXF / DWG / PDF: the DXF passes DxfCheck.audit, its texts and dimensions are where they were on the sheet, the PDF has them, the DWG is AutoCAD 2000', async function () {
      var errs0 = errors.length, st = UI.drawing.state, Chk = await rfLGLoadCheck();
      await rfLGDrawing(RFLG_BRACKET);
      rfLGTab(1).click(); await rfLGDone();
      var fw = rfLGW('flat'), b;
      assert(fw, 'the flat on Sheet2');
      // Autodimension (Tools ▸ Dimensions): ordinates both ways from the lower-left, bend lines included
      rfLGMenu('Tools', 'Dimensions ▸ Autodimension'); await wait(10);
      assert(st.tool === 'autodim' && st.pending.view === fw.view.id, 'the flat is picked');
      await UI.pmOK(); await rfLGDone();
      var ords = st.sheet.dims.filter(function (d) { return d.kind === 'ordinate'; });
      assert(ords.length === 2, 'two ordinate sets: ' + anvil.drawing.summary().dims.join(' | '));
      // the overall size: Smart Dimension on the blank's left and right edges, then its bottom and top
      fw = rfLGW('flat'); b = fw.proj.bounds;
      var midV = (b.vmin + b.vmax) / 2, midU = (b.umin + b.umax) / 2;
      UI.drawing.smartDimension(); await wait(10);
      rfLGClick(fw.toSheet([b.umin, b.vmin + (b.vmax - b.vmin) * 0.15])); await wait(10); rfLGClick(fw.toSheet([b.umax, b.vmin + (b.vmax - b.vmin) * 0.15])); await wait(10);
      rfLGClick(fw.toSheet([midU, b.vmax + 1.1])); await rfLGDone();
      rfLGClick(fw.toSheet([b.umin + (b.umax - b.umin) * 0.2, b.vmin])); await wait(10); rfLGClick(fw.toSheet([b.umin + (b.umax - b.umin) * 0.2, b.vmax])); await wait(10);
      rfLGClick(fw.toSheet([b.umax + 1.1, midV])); await rfLGDone();
      rfLGEnd();
      var sm = anvil.drawing.summary(), W0 = (b.umax - b.umin).toFixed(3), H0 = (b.vmax - b.vmin).toFixed(3);
      assert(sm.dims.indexOf(W0) >= 0 && sm.dims.indexOf(H0.replace(/^0/, '')) >= 0, 'overall ' + W0 + ' x ' + H0 + ': ' + sm.dims.join(' | '));
      // Bend Table
      rfLGMenu('Insert', 'Bend Table'); await rfLGDone();
      var bt = (st.sheet.annotations || []).filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(bt && bt.info.rows.length === 2, 'Bend Table of two bends');
      // the note, its values from the part's properties
      rfLGRibbon('Note').click(); await wait(10);
      fw = rfLGW('flat');
      rfLGClick([fw.box.x0, fw.box.y0 - 1.4]); await wait(10);
      assert(st.inline, 'the note box');
      st.inline.inp.value = 'MATERIAL: $PRPSHEET:"Material"\nTHICKNESS: $PRPSHEET:"Thickness"\nGRAIN DIRECTION →';
      D.querySelector('#dw-edit .dw-edit-btn.ok').click(); await rfLGDone();
      rfLGEnd();
      var nt = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'NOTES'; }).map(function (p) { return p.text; });
      assert(nt.some(function (t) { return /^MATERIAL: Plain Carbon Steel/i.test(t); }) && nt.some(function (t) { return /^THICKNESS: .*\.0598/.test(t); }), 'the note reads the properties: ' + nt.join(' | '));
      // File ▸ Save Drawing as DXF / PDF / DWG
      var dxf = (await rfLGSaved(function () { rfLGMenu('File', 'Save Drawing as DXF'); }))[0];
      var pdf = (await rfLGSaved(function () { rfLGMenu('File', 'Save Drawing as PDF'); }))[0];
      var dwgs = await rfLGSaved(async function () { rfLGMenu('File', 'Save Drawing as DWG'); for (var k = 0; k < 60 && !st.lastDwg; k++) await wait(50); });
      assert(dxf && dxf.text && pdf && pdf.text, 'DXF and PDF saved');
      var au = Chk.audit(dxf.text);
      var fills = {}, dup = [];
      st.sheet.prims.forEach(function (p, i) { if (p.k === 'fill' && p.layer === 'DIMENSIONS') { var key = p.pts.map(function (q) { return q.map(function (x) { return x.toFixed(4); }); }).join(';'); if (fills[key] != null) dup.push([fills[key], i, p.dimIx, st.sheet.prims[fills[key]].dimIx]); else fills[key] = i; } });
      // (DxfCheck's duplicate test gives a SOLID no points, so any two arrowheads on one layer read as duplicates: the
      // SOLIDs are compared here by their corners instead; reported to the headless lane)
      var raw = dxf.text.replace(/\r/g, '').split('\n'), sols = [], cur = null, inE = false;
      for (var ri = 0; ri + 1 < raw.length; ri += 2) {
        var gc = raw[ri].trim(), gv = raw[ri + 1].trim();
        if (gc === '2' && gv === 'ENTITIES') inE = true;
        if (!inE) continue;
        if (gc === '0') { cur = gv === 'SOLID' ? { k: [] } : null; if (cur) sols.push(cur); }
        else if (cur && /^(8|1[0-3]|2[0-3])$/.test(gc)) cur.k.push(gc + '=' + gv);
      }
      var sk = sols.map(function (x) { return x.k.join(' '); }), dupS = sk.filter(function (x, i) { return sk.indexOf(x) !== i; });
      assert(!dupS.length && !dup.length, 'duplicate arrowheads: ' + dupS.slice(0, 3).join(' | '));
      var aerr = au.errors.filter(function (e) { return !/^duplicate SOLID on /.test(e); });
      assert(!aerr.length, 'DxfCheck.audit: ' + JSON.stringify(aerr).slice(0, 400));
      var ents = rfLGDxfEnts(dxf.text), sh = st.sheet;
      // (R12, File ▸ Save Drawing as DXF's default) every note line, bend note and dimension text is a TEXT at its sheet place
      var miss = [];
      sh.prims.filter(function (p) { return p.k === 'text' && (p.layer === 'NOTES' || p.layer === 'BEND_NOTES' || p.layer === 'DIMENSIONS'); }).forEach(function (p) {
        var hit = ents.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && ((Math.abs(e.x - p.p[0]) < 2e-3 && Math.abs(e.y - p.p[1]) < 2e-3) || (Math.abs(e.x11 - p.p[0]) < 2e-3 && Math.abs(e.y11 - p.p[1]) < 2e-3)); });
        if (!hit.length) miss.push(p.text + ' @' + p.p.map(function (x) { return x.toFixed(3); }));
      });
      assert(!miss.length, 'not where they were on the sheet in the DXF: ' + miss.join(' | '));
      ['GRAIN DIRECTION ->', W0, '90%%d'].forEach(function (t) { assert(dxf.text.indexOf(t) >= 0, t + ' in the DXF'); });
      [W0, 'GRAIN DIRECTION ->'].forEach(function (t) { assert(pdf.text.indexOf(rfLGPdfText(t)) > 0, t + ' in the PDF'); });
      var dwg = dwgs.filter(function (g) { return g.bytes; })[0];
      assert(dwg && String.fromCharCode.apply(null, new Uint8Array(dwg.bytes.buffer || dwg.bytes).subarray(0, 6)) === 'AC1015', 'AutoCAD 2000 DWG');
      rfLGTab(0).click(); await rfLGDone();
      await rfLGClose();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'flat ' + W0 + ' x ' + H0 + ', ' + ords.length + ' ordinate sets, DXF ' + ents.length + ' entities';
    });

    step('rfLG: b. an assembly drawing — the Pinned plate assembly exploded (the cap up 40), File ▸ Make Drawing from Assembly: Front / Top / Right + the exploded isometric and the Bill of Materials; Auto Balloon by its PM; a third pin inserted (the quantity changes): the BOM reads QTY 3, the balloons keep their items and stay attached; Ctrl+Z back to 2', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      if (UI.drawingActive()) await rfLGClose();
      var ex = W.AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0];
      var r = await UI.openExample(ex); await idle();
      assert(!r.error && UI.isAssembly(), 'the assembly opened: ' + r.error);
      var flatH = UI.App.mesh.bounds ? null : null; void flatH;
      // Insert ▸ Exploded View as its PropertyManager makes it: the cap 40 up
      UI.pushUndo();
      W.Assembly.addExplodeStep(UI.App.model, null, 'Cap<1>', 'y', 40);
      W.Assembly.setExploded(UI.App.model, UI.App.model.explodedViews[0].id);
      await UI.rebuild(); await idle();
      rfLGMenu('File', 'Make Drawing from Assembly'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfLGDone();
      assert(UI.drawingActive() && rfLGOrients() === 'Front,Top,Right,Isometric', 'views: ' + rfLGOrients());
      var F = rfLGW('Front'), I = rfLGW('Isometric');
      // the cap 40 up: the Front view is 8 + 40 + 5 + … tall, more than the collapsed 20
      assert(F.proj.bounds.vmax - F.proj.bounds.vmin > 50, 'the views show the exploded state: ' + (F.proj.bounds.vmax - F.proj.bounds.vmin));
      var sm = anvil.drawing.summary();
      assert(sm.bom && sm.bom.rows.map(function (x) { return x.partNumber + ':' + x.qty; }).join(' ') === 'Plate:1 Pin:2 Cap:1', 'BOM ' + JSON.stringify(sm.bom && sm.bom.rows));
      // Auto Balloon (Annotation ▸ Auto Balloon, ✓) on the isometric
      rfLGRibbon('Auto Balloon').click(); await wait(10);
      var vs = D.querySelector('#pm select[data-key="view"]');
      if (vs) setInput(vs, String(I.view.id));
      await UI.pmOK(); await rfLGDone();
      sm = anvil.drawing.summary();
      var items = sm.balloons.map(function (b) { return b.item; }).sort().join();
      assert(items === '1,2,3', 'balloons ' + items);
      // a third pin (Insert Components): the quantity changes, the BOM and the balloons follow
      UI.markClean();
      await anvil.insert({ script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [150, 0, 0] }); await idle(); await wait(60);
      if (!UI.drawingActive()) { rfLGMenu('Window', 'Draw'); await rfLGDone(); }
      sm = anvil.drawing.summary();
      assert(sm.bom.rows[1].qty === 3 && sm.bom.rows.length === 3, 'QTY 3: ' + JSON.stringify(sm.bom.rows));
      assert(sm.balloons.map(function (b) { return b.item; }).sort().join() === '1,2,3' && sm.balloons.every(function (b) { return !b.dangling; }), 'balloons follow: ' + JSON.stringify(sm.balloons));
      var bomTx = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'BOM'; }).map(function (p) { return p.text; });
      assert(bomTx.indexOf('3') >= 0, 'the table on the sheet reads 3: ' + bomTx.join(' | '));
      await UI.undo(); await idle(); await wait(60);
      if (!UI.drawingActive()) { rfLGMenu('Window', 'Draw'); await rfLGDone(); }
      assert(anvil.drawing.summary().bom.rows[1].qty === 2, 'Ctrl+Z: QTY 2');
      await rfLGClose();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'exploded, BOM ' + sm.bom.rows.map(function (x) { return x.partNumber + ' ' + x.qty; }).join(', ') + ', balloons ' + items;
    });

    var rfLGAuxLog = [];
    function rfLGMeet(a, b) { return a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9; }
    function rfLGFree(w, h) {
      var sh = UI.drawing.state.sheet, S = sh.size, obs = W.Drawing.tbRects(S, sh.units || 'in').concat(sh.views.map(function (x) { return x.box; })), best = null, bs = -Infinity;
      (sh.annotations || []).concat(sh.notes || []).concat(sh.dims || []).forEach(function (a) { if (a.box && isFinite(a.box.x0)) obs.push(a.box); });
      for (var i = 1; i < 60; i++) for (var j = 1; j < 40; j++) {
        var c = [S[0] * i / 60, S[1] * j / 40], r = { x0: c[0] - w / 2, x1: c[0] + w / 2, y0: c[1] - h / 2, y1: c[1] + h / 2 }, b1 = 0.6;
        if (r.x0 < b1 || r.y0 < b1 || r.x1 > S[0] - b1 || r.y1 > S[1] - b1) continue;
        if (obs.some(function (o) { return rfLGMeet(r, o); })) continue;
        var d = Math.min.apply(null, obs.map(function (o) { return Math.max(o.x0 - r.x1, r.x0 - o.x1, o.y0 - r.y1, r.y0 - o.y1); }));
        if (d > bs) { bs = d; best = c; }
      }
      return best;
    }
    function rfLGVW(pred) { return UI.drawing.state.sheet.views.filter(function (w) { return pred(w.view); })[0]; }
    // Smart Dimension on a view's longest visible straight edge: a click on it, then a click 0.45 in out from the view
    async function rfLGEdgeDim(pred, lineOk) {
      var w = rfLGVW(pred), best = null, bl = 0;
      (w.proj.lines.visible || []).forEach(function (l) {
        if (lineOk && !lineOk(l)) return;
        var a = w.toSheet([l[0], l[1]]), b = w.toSheet([l[2], l[3]]), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L > bl) { bl = L; best = [a, b]; }
      });
      assert(best, 'an edge in ' + w.view.name);
      var m = [(best[0][0] * 0.4 + best[1][0] * 0.6), (best[0][1] * 0.4 + best[1][1] * 0.6)], t = [(best[1][0] - best[0][0]) / bl, (best[1][1] - best[0][1]) / bl], n = [-t[1], t[0]];
      var cc = [(w.box.x0 + w.box.x1) / 2, (w.box.y0 + w.box.y1) / 2];
      if ((m[0] - cc[0]) * n[0] + (m[1] - cc[1]) * n[1] < 0) n = [-n[0], -n[1]];
      var n0 = UI.drawing.state.sheet.dims.filter(function (d) { return !d.auto; }).length;
      UI.drawing.smartDimension(); await wait(10);
      rfLGClick(m); await wait(10);
      var dd = 0.45, inBox = function (q) { return q[0] > w.box.x0 - 0.1 && q[0] < w.box.x1 + 0.1 && q[1] > w.box.y0 - 0.1 && q[1] < w.box.y1 + 0.1; };
      if (lineOk) dd = 0.1;   // (a slanted edge: square off it and near, so the dimension is aligned, as SolidWorks)
      else { while (inBox([m[0] + n[0] * dd, m[1] + n[1] * dd]) && dd < 20) dd += 0.2; dd += 0.3; }   // (placed outside the view, clear of its other edges)
      var had = UI.drawing.state.sheet.dims.slice();
      rfLGClick([m[0] + n[0] * dd, m[1] + n[1] * dd]); await rfLGDone();
      rfLGEnd();
      var mine = UI.drawing.state.sheet.dims.filter(function (d) { return !d.auto; });
      assert(mine.length === n0 + 1, 'a dimension in ' + w.view.name + ': ' + mine.map(function (d) { return d.text; }).join(' | ') + ' clicks ' + JSON.stringify([m, best, w.box]) + ' ' + (D.getElementById('status') ? D.getElementById('status').textContent : ''));
      return UI.drawing.state.sheet.dims.filter(function (d) { return !d.auto && d.view === w.view.id && had.indexOf(d) < 0; })[0] || mine[mine.length - 1];
    }
    async function rfLGChange(fn) {
      UI.markClean();
      rfLGMenu('Window', '(part)'); await idle(); await wait(20);
      assert(!UI.drawingActive(), 'the part shows');
      UI.pushUndo(); fn(UI.App.model); await UI.rebuild(); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'rebuild: ' + JSON.stringify(anvil.summary().errors));
      rfLGMenu('Window', 'Draw'); await rfLGDone(); await wait(30);
      assert(UI.drawingActive(), 'the drawing opens again');
    }

    step('rfLG: c. a two-sheet part drawing — sheet C; Section View A-A through the holes, a Detail View of the left bend, an Auxiliary View off the 120° flange, a Break on the Top view, a Crop View on the Isometric, a dimension in each by clicks, the flat with a dimension on Sheet2; then the 120° flange 2 → 2.5 and the Ø.500 hole deleted: every view is worked out again, every dimension follows or dangles (none dropped)', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfLGDrawing(RFLG_BRACKET);
      // right-click the sheet ▸ Properties: ANSI C (room for the extra views), scale kept
      rfLGCtx([0.4, 0.4], /^Properties/); await wait(20);
      var sels = D.querySelectorAll('#modal select');
      sels[0].value = 'ANSI C'; sels[0].dispatchEvent(new W.Event('change', { bubbles: true }));
      sels[1].value = '1:1'; sels[1].dispatchEvent(new W.Event('change', { bubbles: true }));
      clickModalButton('Apply Changes'); await rfLGDone();
      assert(anvil.drawing.summary().sheet.format === 'ANSI C' && anvil.drawing.summary().sheet.scale === '1:1', 'sheet C at 1:1');
      // the Isometric to Sheet2 (right-click ▸ Move to Sheet ▸ Sheet2), next to the flat
      var I0 = rfLGW('Isometric');
      rfLGCtx([(I0.box.x0 + I0.box.x1) / 2, (I0.box.y0 + I0.box.y1) / 2], /Move to Sheet . Sheet2/); await rfLGDone();
      assert(rfLGOrients() === 'Front,Top,Right', 'the Isometric went to Sheet2: ' + rfLGOrients());
      var T = rfLGW('Top');
      // Section View: ✓ the PM (a horizontal line), click on the Top view through the Ø.281 holes, place it above
      rfLGRibbon('Section View').click(); await wait(20);
      await UI.pmOK(); await wait(10);
      rfLGClick(T.toSheet([2.5, -0.75])); await wait(10);
      var sp = [T.view.x, T.box.y1 + 1.6];
      rfLGMouse('mousemove', sp); rfLGClick(sp); await rfLGDone();
      rfLGEnd();
      var S = rfLGVW(function (v) { return v.kind === 'section'; });
      assert(S && st.sheet.prims.some(function (p) { return p.k === 'text' && /^SECTION A-A/.test(p.text); }), 'Section View A-A');
      // Detail View of the left bend (Front view), placed in a free spot
      var F = rfLGW('Front');
      rfLGRibbon('Detail View').click(); await wait(20);
      F = rfLGW('Front');
      rfLGClick(F.toSheet([0, 0.06])); await wait(10);
      rfLGClick(F.toSheet([0.3, 0.06])); await wait(10);
      var dsp = rfLGFree(2.4, 2.8);
      assert(dsp, 'room for the detail');
      rfLGClick(dsp); await rfLGDone();
      rfLGEnd();
      var Dv = rfLGVW(function (v) { return v.kind === 'detail'; });
      assert(Dv && Dv.proj.lines.visible.length + Dv.proj.arcs.visible.length > 2, 'Detail View');
      // Auxiliary View off the 120° flange's slanted edge in the Front view
      F = rfLGW('Front');
      var sl = F.proj.lines.visible.filter(function (l) { var dx = l[2] - l[0], dy = l[3] - l[1]; return Math.abs(dx) > 1e-3 && Math.abs(dy) > 1e-3 && Math.hypot(dx, dy) > 1; })[0];
      assert(sl, 'a slanted edge in the Front view');
      rfLGRibbon('Auxiliary View').click(); await wait(10);
      var ep = F.toSheet([(sl[0] + sl[2]) / 2, (sl[1] + sl[3]) / 2]);
      rfLGClick(ep); await wait(10);
      // along its projection direction, the first spot where it covers no other view (as a user drags it there)
      var sa = F.toSheet([sl[0], sl[1]]), sb = F.toSheet([sl[2], sl[3]]), sL = Math.hypot(sb[0] - sa[0], sb[1] - sa[1]), nn = [-(sb[1] - sa[1]) / sL, (sb[0] - sa[0]) / sL], to = null;
      [1, -1].forEach(function (sg) { [1.6, 2, 2.4, 2.8, 3.2, 3.6, 4, 4.4, 4.8, 5.2, 5.6, 6, 6.4, 6.8, 7.2, 7.6, 8].forEach(function (dd) {
        if (to) return;
        var q = [ep[0] + sg * nn[0] * dd, ep[1] + sg * nn[1] * dd];
        rfLGMouse('mousemove', q);
        var pv = st.preview;
        rfLGAuxLog.push(pv ? [pv.kind, +(pv.x || 0).toFixed(2), +(pv.y || 0).toFixed(2), +(pv.w || 0).toFixed(2), +(pv.h || 0).toFixed(2)] : null);
        if (!pv || pv.kind !== 'aux') return;
        var bx = { x0: pv.x - pv.w / 2 - 0.2, x1: pv.x + pv.w / 2 + 0.2, y0: pv.y - pv.h / 2 - 0.2, y1: pv.y + pv.h / 2 + 0.2 }, S2 = st.sheet.size;
        if (bx.x0 < 0.5 || bx.y0 < 0.5 || bx.x1 > S2[0] - 0.5 || bx.y1 > S2[1] - 0.5) return;
        if (st.sheet.views.map(function (w) { return w.box; }).concat(W.Drawing.tbRects(S2, 'in')).some(function (b) { return rfLGMeet(bx, b); })) return;
        to = q;
      }); });
      assert(to, 'a free spot for the auxiliary view: ' + JSON.stringify(rfLGAuxLog.slice(0, 40)) + JSON.stringify(st.sheet.views.map(function (w) { return w.box; })));
      rfLGMouse('mousemove', to); await wait(10);
      rfLGClick(to); await rfLGDone();
      rfLGEnd();
      var A = rfLGVW(function (v) { return v.kind === 'aux'; });
      assert(A && A.proj.lines.visible.length > 3, 'Auxiliary View');
      // Break on the Top view between the holes (3.5 … 4.1)
      T = rfLGW('Top');
      var tw0 = T.box.x1 - T.box.x0;
      rfLGRibbon('Break').click(); await UI.pmOK(); await idle();
      rfLGClick(T.toSheet([3.5, -2.4])); await wait(10); rfLGClick(T.toSheet([4.1, -2.4])); await rfLGDone();
      rfLGEnd();
      T = rfLGW('Top');
      assert(T.view.breaks && T.view.breaks.length === 1 && T.box.x1 - T.box.x0 < tw0, 'broken Top view');
      // a dimension in each: section, detail, auxiliary, broken Top (the 6.000 across the break), cropped isometric
      await rfLGEdgeDim(function (v) { return v.kind === 'section'; });
      await rfLGEdgeDim(function (v) { return v.kind === 'detail'; });
      await rfLGEdgeDim(function (v) { return v.kind === 'aux'; });
      T = rfLGW('Top');
      UI.drawing.smartDimension(); await wait(10);
      rfLGClick(T.toSheet([0, -2.4])); await wait(10); rfLGClick(T.toSheet([6, -2.4])); await wait(10); rfLGClick(T.toSheet([2, 0.9])); await rfLGDone();
      // the Ø.500 in the Top view, and the 120° flange's slanted edge in the Front view
      rfLGClick(T.toSheet([3 + 0.25 * Math.SQRT1_2, -1.5 - 0.25 * Math.SQRT1_2])); await wait(10); rfLGClick(T.toSheet([4.4, -2.6])); await rfLGDone();
      rfLGEnd();
      var slant = await rfLGEdgeDim(function (v) { return v.orient === 'Front' && !v.kind; }, function (l) { var dx = l[2] - l[0], dy = l[3] - l[1]; return Math.abs(dx) > 1e-3 && Math.abs(dy) > 1e-3; });
      var slant0 = +slant.value;
      // Sheet2: the Isometric cropped and the flat, a dimension on each
      rfLGTab(1).click(); await rfLGDone();
      // Crop View on the Isometric
      var I = rfLGW('Isometric'), ib = I.box;
      rfLGRibbon('Crop View').click(); await UI.pmOK(); await idle();
      rfLGClick([ib.x0 + (ib.x1 - ib.x0) * 0.2, ib.y0 + (ib.y1 - ib.y0) * 0.2]); await wait(10);
      rfLGClick([ib.x0 + (ib.x1 - ib.x0) * 0.8, ib.y0 + (ib.y1 - ib.y0) * 0.8]); await rfLGDone();
      rfLGEnd();
      I = rfLGW('Isometric');
      assert(I.view.crop, 'cropped Isometric: ' + JSON.stringify(st.sheet.views.map(function (w) { return [w.view.name, w.view.orient, !!w.view.crop, w.box]; })) + ' ' + JSON.stringify(ib) + ' ' + (D.getElementById('status') ? D.getElementById('status').textContent : ''));
      await rfLGEdgeDim(function (v) { return v.orient === 'Isometric'; });
      await rfLGEdgeDim(function (v) { return v.kind === 'flat'; });
      var flat0 = st.sheet.dims.filter(function (d) { return !d.auto; }).map(function (d) { return d.text; });
      rfLGTab(0).click(); await rfLGDone();
      var mine = function () { return st.sheet.dims.filter(function (d) { return !d.auto; }); };
      var before = mine().map(function (d) { return d.text + (d.dangling ? '?' : ''); });
      assert(before.length === 6 && before.indexOf('6.000') >= 0 && before.indexOf('Ø.500') >= 0 && before.every(function (t) { return !/\?$/.test(t); }), 'Sheet1 dimensions: ' + before.join(' | '));
      var nViews = st.sheet.views.length;
      // the part changes: the 120° flange 2 → 2.5, the Ø.500 hole deleted
      await rfLGChange(function (m) {
        m.features.filter(function (f) { return f.name === 'Edge-Flange2'; })[0].length = 2.5;
        var h = m.features.filter(function (f) { return f.name === 'Cut-Extrude3'; })[0];
        if (h) W.Kernel.setSuppressed(m, h.id, true);
      });
      var after = mine().map(function (d) { return d.text + (d.dangling ? '?' : ''); });
      assert(st.sheet.views.length === nViews && after.length === before.length, 'nothing dropped: ' + after.join(' | '));
      assert(after.indexOf('6.000') >= 0, 'the 6.000 across the break: ' + after.join(' | '));
      assert(after.indexOf('Ø.500?') >= 0, 'the Ø.500 dangles (hole gone): ' + after.join(' | '));
      var slant1 = mine().filter(function (d) { return d.view === slant.view && !d.dangling && d.kind === 'aligned'; })[0];
      assert(slant1 && Math.abs(+slant1.value - slant0 - 0.5) < 1e-6, 'the slanted flange edge 0.5 longer: ' + slant0 + ' -> ' + (slant1 && slant1.value) + ' ' + JSON.stringify(mine().map(function (d) { return [d.view, d.kind, d.text, d.dangling]; })) + ' slant ' + JSON.stringify([slant.view, slant.kind, slant.text]));
      assert(st.sheet.views.every(function (w) { return !w.proj.pending && (w.proj.lines.visible.length > 0); }), 'every view worked out again');
      rfLGTab(1).click(); await rfLGDone();
      var flat1 = st.sheet.dims.filter(function (d) { return !d.auto; }).map(function (d) { return d.text + (d.dangling ? '?' : ''); });
      assert(flat1.length === flat0.length, 'the flat dimension kept: ' + flat0 + ' -> ' + flat1);
      rfLGTab(0).click(); await rfLGDone();
      await rfLGClose();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'before ' + before.join(', ') + '; after ' + after.join(', ') + '; flat ' + flat0 + ' -> ' + flat1;
    });

    step('rfLG: d. a revision — File ▸ Properties (Drawn by) into the linked title block, the sheet format edited (COMPANY dragged); a model dimension changed by double-click (2X Ø.281 → Ø.344 drives the part); a Revision Table row by right-click ▸ Add Revision, a Revision Symbol with a leader on the changed dimension and a Revision Cloud round it; saved with the part and opened again: the row, the symbol, the cloud, the linked fields and the edited format all kept', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfLGDrawing(RFLG_BRACKET);
      // File ▸ Properties: Drawn by -> the DRAWN cell ($PRP:"DrawnBy")
      rfLGMenu('File', 'Properties'); await wait(20);
      assert(UI.hasPM() && pmField('Drawn by'), 'the drawing\'s Properties PM');
      setInput(pmField('Drawn by'), 'LT');
      await UI.pmOK(); await rfLGDone();
      assert(anvil.drawing.summary().titleBlock.drawnBy === 'LT', 'DRAWN reads LT: ' + JSON.stringify(anvil.drawing.summary().titleBlock));
      // right-click the sheet ▸ Edit Sheet Format; drag COMPANY 1 in left; right-click ▸ Edit Sheet
      rfLGCtx([0.4, 8], /^Edit Sheet Format/); await wait(20);
      assert(st.formatEdit, 'editing the sheet format');
      var comp = anvil.drawing.summary().format.items.filter(function (it) { return it.id === 'field:company'; })[0];
      var cm = [(comp.box[0] + comp.box[2]) / 2, (comp.box[1] + comp.box[3]) / 2];
      await rfLGDrag(cm, [cm[0] - 1, cm[1]]); await rfLGDone();
      var comp2 = anvil.drawing.summary().format.items.filter(function (it) { return it.id === 'field:company'; })[0];
      assert(Math.abs(comp2.box[0] - comp.box[0] + 1) < 0.05, 'COMPANY moved: ' + JSON.stringify([comp.box, comp2.box]));
      rfLGCtx([0.4, 8], /^Edit Sheet$/); await wait(20);
      assert(!st.formatEdit, 'back on the sheet');
      // the holes' 2X Ø.281 (a model item): double-click, .344, ✓ -> the part changes
      var d15 = st.sheet.dims.filter(function (d) { return d.auto && d.text === '2X Ø.281' && d.tbox; })[0];
      assert(d15, 'the 2X Ø.281 model dimension: ' + anvil.drawing.summary().dims.join(' | '));
      var tc = [(d15.tbox.x0 + d15.tbox.x1) / 2, (d15.tbox.y0 + d15.tbox.y1) / 2];
      rfLGMouse('dblclick', tc); await wait(20);
      var vin = D.querySelector('#pm input[data-key="value"]');
      assert(UI.hasPM() && vin, 'the Dimension PM with its value');
      setInput(vin, '0.344');
      await UI.pmOK(); await idle(); await rfLGDone(); await wait(30);
      var d20 = st.sheet.dims.filter(function (d) { return d.auto && d.text === '2X Ø.344' && d.tbox; })[0];
      assert(d20, 'the dimension reads 2X Ø.344 (the part changed): ' + anvil.drawing.summary().dims.join(' | '));
      // Insert ▸ Revision Table, right-click it ▸ Add Revision
      rfLGMenu('Insert', 'Revision Table'); await rfLGDone();
      var rv = st.sheet.revisions;
      assert(rv && rv.box, 'Revision Table');
      rfLGCtx([(rv.box.x0 + rv.box.x1) / 2, (rv.box.y0 + rv.box.y1) / 2], /^Add Revision/); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Add Revision', 'Add Revision PM');
      setInput(pmField('DESCRIPTION'), '2X Ø.344 WAS Ø.281');
      await UI.pmOK(); await rfLGDone();
      var s1 = anvil.drawing.summary();
      assert(s1.revisions.rows.length === 1 && s1.titleBlock.rev === s1.revisions.rows[0].rev, 'a row, the REV cell follows: ' + JSON.stringify(s1.revisions.rows));
      // Revision Symbol: its leader on the 2.000's text, the triangle beside it
      d20 = st.sheet.dims.filter(function (d) { return d.auto && d.text === '2X Ø.344' && d.tbox; })[0];
      var tb2 = d20.tbox, tip = [tb2.x1 + 0.05, (tb2.y0 + tb2.y1) / 2];
      rfLGRibbon('Revision Symbol').click(); await wait(10);
      rfLGClick(tip); await wait(10); rfLGClick([tip[0] + 0.6, tip[1] + 0.4]); await rfLGDone();
      rfLGEnd();
      // Revision Cloud round the dimension (two corners)
      rfLGRibbon('Revision Cloud').click(); await wait(10);
      if (UI.hasPM() && UI.pmTitle() === 'Revision Cloud' && !st.tool) await UI.pmOK();
      rfLGClick([tb2.x0 - 0.25, tb2.y0 - 0.25]); await wait(10); rfLGClick([tb2.x1 + 0.25, tb2.y1 + 0.25]); await rfLGDone();
      rfLGEnd();
      var syms = anvil.drawing.doc().symbols || [];
      var rs = syms.filter(function (x) { return x.type === 'revision'; })[0], rc = syms.filter(function (x) { return x.type === 'revCloud'; })[0];
      assert(rs && rs.rev === s1.revisions.rows[0].rev && rs.leader, 'Revision Symbol ' + JSON.stringify(rs));
      assert(rc, 'Revision Cloud ' + JSON.stringify(syms.map(function (x) { return x.type; })));
      // saved with the part (File ▸ Save keeps the drawings in the part file) and opened again
      var json = JSON.stringify(UI.App.model);
      await rfLGClose();
      await anvil.newPart(); await idle();
      await anvil.load(JSON.parse(json)); await idle();
      rfLGMenu('Window', 'Draw'); await rfLGDone();
      assert(UI.drawingActive(), 'the drawing opens again');
      var s2 = anvil.drawing.summary(), sy2 = anvil.drawing.doc().symbols || [];
      var comp3 = s2.format.items.filter(function (it) { return it.id === 'field:company'; })[0];
      assert(s2.revisions.rows.length === 1 && s2.titleBlock.rev === s1.titleBlock.rev && s2.titleBlock.drawnBy === 'LT', 'row and linked fields kept: ' + JSON.stringify(s2.titleBlock));
      assert(sy2.some(function (x) { return x.type === 'revision'; }) && sy2.some(function (x) { return x.type === 'revCloud'; }), 'symbol and cloud kept');
      assert(comp3 && Math.abs(comp3.box[0] - comp2.box[0]) < 1e-6, 'the edited sheet format kept: ' + JSON.stringify(comp3 && comp3.box));
      assert(s2.dims.indexOf('2X Ø.344') >= 0, 'the changed dimension: ' + s2.dims.join(' | '));
      await rfLGClose();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'REV ' + s2.titleBlock.rev + ', DRAWN ' + s2.titleBlock.drawnBy + ', symbol + cloud, format kept';
    });
  })();
  // --- end rfLG ---
