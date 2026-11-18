  // --- rfOJ (2026-11-18, lane drawflow5): shop drawings made the way the shop makes them, driven with the mouse.
  // Model Items on a press-brake bracket kept on the paper; a 40-hole Hole Table split by right-click ▸ Split; a BOM
  // sorted by right-click ▸ Sort; Undo takes back a DESCRIPTION written into a linked part document; Scale output 1:1
  // for the drawing DXF; the PDF named after the part's configuration ---
  (function () {
    var T = 0.0747;
    var RFOJ_BRKT = 'p.name("PB-BRKT").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').circle(1.5, -1.5, 0.1405).circle(4.5, -1.5, 0.1405).circle(3, -1.5, 0.25).cut("through", { reverse: true });\n' +
      'p.flange(1.5, [[6, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(1, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n' +
      'p.flange(1, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer", angle: 45 });\n' +
      'p.flange(1.25, [[3, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });\n' +
      'p.hem(0.375, [[3, 1.25, ' + (3 - T / 2) + ']], { gap: 0.0299 });\n';
    function rfOJPlate() {
      var c = 'p.name("LASER-PLT").units("in");\np.sheet(0.1196, 0.06, 0.44);\np.sketch("Top").rect(0, -12, 20, 12).end().baseFlange();\nvar s = p.sketch("Top", 0.1196);\n', sz = [0.1405, 0.1695, 0.2015, 0.2655];
      for (var i = 0; i < 4; i++) for (var j = 0; j < 10; j++) c += 's.circle(' + (1 + j * 1.5) + ', ' + (-1 - i * 1.25) + ', ' + (sz[i] / 2) + ');\n';
      for (var q = 0; q < 6; q++) c += 's.slot(' + (3 + (q % 3)) + ', ' + (-8 - Math.floor(q / 3)) + ', ' + (3 + (q % 3)) + ', ' + (-8.5 - Math.floor(q / 3)) + ', 0.25);\n';
      return c + 's.cut("through", { reverse: true });\n';
    }
    async function rfOJDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    async function rfOJClose() { if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); } }
    function rfOJMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, buttons: type === 'mouseup' || type === 'mousemove' ? 0 : 1, clientX: q.x, clientY: q.y, detail: type === 'dblclick' ? 2 : 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfOJClick(p) { rfOJMouse('mousemove', p); rfOJMouse('mousedown', p); rfOJMouse('mouseup', p); }
    async function rfOJDbl(p) { rfOJClick(p); await wait(10); rfOJClick(p); rfOJMouse('dblclick', p); await wait(40); }
    function rfOJRows() { return Array.prototype.slice.call(D.querySelectorAll('.menu .mi')); }
    function rfOJRow(label) { return rfOJRows().filter(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().indexOf(label) === 0; })[0] || null; }
    // a right-click at paper point p, then the menu rows path[0] ▸ path[1] … clicked
    async function rfOJMenu(p, path) {
      rfOJMouse('mousemove', p); rfOJMouse('contextmenu', p); await wait(30);
      for (var i = 0; i < path.length; i++) {
        var r = rfOJRow(path[i]);
        assert(r, path[i] + ' in the menu: ' + rfOJRows().map(function (x) { return x.textContent.trim(); }).join(' | '));
        assert(!r.classList.contains('disabled') && !r.hasAttribute('aria-disabled') || r.getAttribute('aria-disabled') === 'false', path[i] + ' is enabled');
        r.dispatchEvent(new W.MouseEvent('mouseenter', { bubbles: true })); r.click(); await wait(30);
      }
      if (UI.closeMenus) UI.closeMenus();
      await rfOJDone();
    }
    function rfOJClash() {
      var sh = UI.drawing.state.sheet, b = 10 / 25.4, S = sh.size, over = [], out = [];
      var R = sh.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null; }).map(function (p) { return { t: p.text, d: p.dimIx, r: W.Drawing.textRect(p) }; });
      R.forEach(function (x, i) {
        if (x.r.x0 < b || x.r.y0 < b || x.r.x1 > S[0] - b || x.r.y1 > S[1] - b) out.push(x.t);
        for (var j = i + 1; j < R.length; j++) if (R[j].d !== x.d && x.r.x0 < R[j].r.x1 - 1e-3 && R[j].r.x0 < x.r.x1 - 1e-3 && x.r.y0 < R[j].r.y1 - 1e-3 && R[j].r.y0 < x.r.y1 - 1e-3) over.push(x.t + ' x ' + R[j].t);
      });
      return { n: R.length, over: over, out: out };
    }

    step('rfOJ: press-brake print: Insert Model Items on a 14 ga bracket with five bends (ANSI B 1 : 1): every value clear of the others and inside the border (the Right view\'s 1.340 sat on the Front view\'s 1.500, a third row of hole locations ran past the border)', async function () {
      var errs0 = errors.length;
      await rfOJClose();
      await anvil.newPart(); await idle(); await anvil.run(RFOJ_BRKT); await idle();
      anvil.drawing.make({ fresh: true }); await rfOJDone();
      try {
        anvil.drawing.modelItems({}); await rfOJDone();
        var c = rfOJClash();
        assert(c.n >= 10, 'model items: ' + c.n);
        assert(!c.over.length, 'values on each other: ' + c.over.join(' | '));
        assert(!c.out.length, 'past the border: ' + c.out.join(' | '));
      } finally { UI.markClean(); anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return c.n + ' values, clear';
    });

    step('rfOJ: laser print: a 40-hole Hole Table with no clear paper warns; right-click a row ▸ Split ▸ Horizontally Below makes two columns (one undo step); Split ▸ Join puts it back', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfOJClose();
      await anvil.newPart(); await idle(); await anvil.run(rfOJPlate()); await idle();
      anvil.drawing.make({ fresh: true }); await rfOJDone();
      UI.drawing.fit(); await wait(20);
      try {
        var top = anvil.drawing.summary().views.filter(function (v) { return v.orient === 'Top'; })[0];
        var id = anvil.drawing.holeTable(top.id, { origin: { x: { a: [0, -12], b: [20, -12] }, y: { a: [0, -12], b: [0, 0] } }, all: true });
        await rfOJDone();
        var ht = st.sheet.holeTables[0];
        assert(ht && ht.rows.length === 40 && ht.pieces.length === 1, 'a 40-row table');
        assert(st.sheet.warnings.some(function (x) { return /no clear paper for its 40 rows/.test(x); }), 'warned: ' + JSON.stringify(st.sheet.warnings));
        // row 20 (B10): its TAG cell, right-click ▸ Split ▸ Horizontally Below
        var pc = ht.pieces[0], y20 = (pc.rowY[20] + pc.rowY[21]) / 2, n0 = UI.App.undo.length;
        await rfOJMenu([ht.colX[0] + 0.1, y20], ['Split', 'Horizontally Below']);
        ht = st.sheet.holeTables[0];
        assert(ht.pieces.length === 2 && ht.pieces[0].i1 === 20 && ht.pieces[1].i0 === 20, 'two pieces: ' + JSON.stringify(ht.pieces.map(function (p) { return [p.i0, p.i1]; })));
        assert(UI.App.undo.length === n0 + 1, 'one undo step');
        assert(Math.abs((ht.pieces[1].box.x1 - ht.pieces[1].box.x0) - (ht.pieces[0].box.x1 - ht.pieces[0].box.x0)) < 1e-9, 'the same width');
        var tags = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.holeTable === id && p.text === 'TAG'; });
        assert(tags.length === 2, 'a header on each piece');
        await rfOJMenu([ht.pieces[1].box.x0 + 0.1, (ht.pieces[1].rowY[2] + ht.pieces[1].rowY[3]) / 2], ['Split', 'Join']);
        assert(st.sheet.holeTables[0].pieces.length === 1, 'joined');
        await UI.undo(); await rfOJDone(); await rfOJDone();
        assert(st.sheet.holeTables[0].pieces.length === 2, 'undo: split again');
      } finally { if (UI.closeMenus) UI.closeMenus(); UI.markClean(); anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return '40 rows -> 20 + 20 -> 40';
    });

    step('rfOJ: Document Properties ▸ Export ▸ Scale output 1:1 ticked: File ▸ Save as DXF writes the 1 : 4 laser blank at its true size (the 20 in edge 20 in, was 5); untick, 5 again', async function () {
      var errs0 = errors.length, got = [], ex0 = UI.exportDialog;
      await rfOJClose();
      await anvil.newPart(); await idle(); await anvil.run(rfOJPlate()); await idle();
      anvil.drawing.make({ fresh: true }); await rfOJDone();
      function longest(t) {
        var L = t.split(/\r?\n/), best = 0;
        for (var i = 0; i < L.length - 1; i++) if (L[i].trim() === '0' && L[i + 1].trim() === 'LINE') {
          var g = {}; for (var j = i + 2; j + 1 < L.length && L[j].trim() !== '0'; j += 2) g[L[j].trim()] = L[j + 1].trim();
          if (g['8'] === 'TOP') best = Math.max(best, Math.hypot(+g['11'] - +g['10'], +g['21'] - +g['20']));
        }
        return best;
      }
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: String(text) }); };
      try {
        UI.drawing.docProps(); await wait(30);
        var cb = D.getElementById('dw-opt-dxf11');
        assert(cb && !cb.checked, 'the Scale output 1:1 box, off');
        cb.click(); D.getElementById('dw-opt-ok').click(); await rfOJDone();
        assert(anvil.drawing.options().dxf11 === true, 'stored');
        UI.drawing.exportAs('dxf', { version: 'R2000' }); await idle();
        assert(got.length === 1 && Math.abs(longest(got[0].text) - 20) < 1e-6, '1:1: ' + (got[0] && longest(got[0].text)));
        UI.drawing.docProps(); await wait(30);
        D.getElementById('dw-opt-dxf11').click(); D.getElementById('dw-opt-ok').click(); await rfOJDone();
        UI.drawing.exportAs('dxf', { version: 'R2000' }); await idle();
        assert(got.length === 2 && Math.abs(longest(got[1].text) - 5) < 1e-6, 'paper scale: ' + (got[1] && longest(got[1].text)));
      } finally { UI.exportDialog = ex0; if (modalOpen()) UI.closeModal(); UI.markClean(); anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return '20 in at 1:1, 5 in at 1:4';
    });

    step('rfOJ: an assembly print: right-click the BOM ▸ Sort ▸ PART NUMBER (A to Z): ANGLE, BASE, GUSSET numbered 1 2 3, the balloons follow; Assembly order puts them back; each one undo step', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfOJClose();
      await anvil.newAssembly('WELD-ASM');
      await anvil.insert({ script: 'p.name("BASE-300"); p.box(200, 100, 2);' });
      await anvil.insert({ script: 'p.name("GUSSET-200"); p.box(50, 50, 2);' }, { position: [20, 2, 20] });
      await anvil.insert({ script: 'p.name("ANGLE-100"); p.box(100, 25, 2);' }, { position: [50, 2, 50] });
      await anvil.insert({ script: 'p.name("ANGLE-100"); p.box(100, 25, 2);' }, { position: [50, 2, 80] });
      await idle();
      anvil.drawing.make({ fresh: true }); await rfOJDone();
      UI.drawing.fit(); await wait(20);
      try {
        var iso = anvil.drawing.summary().views.filter(function (v) { return v.orient === 'Isometric'; })[0];
        anvil.drawing.autoBalloon(iso.id, {}); await rfOJDone();
        function pns() { return st.sheet.bom.rows.map(function (r) { return r.item + ' ' + r.partNumber; }).join(', '); }
        function ballOf(pn) { var r = st.sheet.bom.rows.filter(function (x) { return x.partNumber === pn; })[0]; return st.sheet.balloons.filter(function (b) { return b.key === r.key; }).map(function (b) { return String(b.item); })[0]; }
        assert(pns() === '1 BASE-300, 2 GUSSET-200, 3 ANGLE-100', 'assembly order: ' + pns());
        var bb = st.sheet.bom.box, n0 = UI.App.undo.length;
        await rfOJMenu([(bb.x0 + bb.x1) / 2, bb.y1 - 1.5 * bb.rowH], ['Sort', 'PART NUMBER (A to Z']);
        assert(pns() === '1 ANGLE-100, 2 BASE-300, 3 GUSSET-200', 'sorted: ' + pns());
        assert(ballOf('ANGLE-100') === '1' && ballOf('BASE-300') === '2', 'balloons follow: ' + ballOf('ANGLE-100') + ' ' + ballOf('BASE-300'));
        assert(UI.App.undo.length === n0 + 1, 'one undo step');
        bb = st.sheet.bom.box;
        await rfOJMenu([(bb.x0 + bb.x1) / 2, bb.y1 - 1.5 * bb.rowH], ['Sort', 'Assembly order']);
        assert(pns() === '1 BASE-300, 2 GUSSET-200, 3 ANGLE-100', 'back: ' + pns());
        await UI.undo(); await rfOJDone(); await rfOJDone();
        assert(/^1 ANGLE-100/.test(pns()), 'undo: sorted again: ' + pns());
      } finally { if (UI.closeMenus) UI.closeMenus(); UI.markClean(); anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'sorted A-Z, back, undone';
    });

    step('rfOJ: a DESCRIPTION typed into the BOM of an assembly whose part is a linked document: Enter writes it into the document; Undo puts the document back as it was (it stayed changed), Redo writes it again', async function () {
      var st = UI.drawing.state, errs0 = errors.length, Dm = W.Assembly.Documents, f = 'RFOJ-CLIP';
      await rfOJClose();
      var pm = W.Kernel.newModel(); W.Kernel.runScript(pm, 'p.name("RFOJ-CLIP"); p.box(40, 20, 3); p.property("Description", "CLIP, 14 GA");');
      Dm.put(f, JSON.parse(JSON.stringify(pm)));
      await anvil.newAssembly('RFOJ-LINKED');
      await anvil.insert({ file: f });
      await anvil.insert({ script: 'p.name("Spacer"); p.box(10, 10, 10);' }, { position: [60, 0, 0] });
      await idle();
      anvil.drawing.make({ fresh: true }); await rfOJDone();
      UI.drawing.fit(); await wait(20);
      function descOf() { return W.Materials.sheetProperty(Dm.get(f), 'Description'); }
      try {
        var bom = st.sheet.bom, cols = bom.columns.map(function (x) { return x.title; }), dc = cols.indexOf('DESCRIPTION'), bb = bom.box;
        var row = bom.rows.map(function (r) { return r.partNumber; }).indexOf('RFOJ-CLIP') + 1;
        assert(dc >= 0 && row >= 1, 'the linked part\'s row');
        await rfOJDbl([(bb.cols[dc] + bb.cols[dc + 1]) / 2, bb.y1 - (row + 0.5) * bb.rowH]);
        var inp = D.querySelector('#dw-edit input');
        assert(inp && inp.value === 'CLIP, 14 GA', 'typed in place: ' + (inp && inp.value));
        setInput(inp, 'CLIP, 14 GA, ZINC');
        inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await rfOJDone();
        assert(descOf() === 'CLIP, 14 GA, ZINC' && Dm.isDirty(f), 'written into the document (unsaved): ' + descOf());
        await UI.undo(); await rfOJDone(); await rfOJDone();
        assert(descOf() === 'CLIP, 14 GA' && !Dm.isDirty(f), 'undo: the document back: ' + descOf());
        assert(st.sheet.bom.cells[row - 1][dc] === 'CLIP, 14 GA', 'the table shows it: ' + st.sheet.bom.cells[row - 1][dc]);
        await UI.redo(); await rfOJDone(); await rfOJDone();
        assert(descOf() === 'CLIP, 14 GA, ZINC', 'redo: written again: ' + descOf());
      } finally { UI.markClean(); anvil.drawing.close(); await idle(); Dm.remove(f); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'Description undone in the linked document';
    });

    step('rfOJ: the PDF of a drawing of a part in a configuration that is not its default is named PART_CONFIG.pdf (as the flat DXF since rfPP); in the default configuration PART.pdf', async function () {
      var errs0 = errors.length, got = [], ex0 = UI.exportDialog, fn0 = UI.App.fileName;
      await rfOJClose();
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in"); p.name("LBRK-14"); p.sketch("Front").rect(0, 0, 4, 2).extrude(0.25);'); await idle();
      UI.App.model.configurations = [{ name: 'Default', values: {} }, { name: 'LB-4', values: {} }];
      UI.App.model.activeConfiguration = 'LB-4';
      UI.App.fileName = 'LBRK-14';
      anvil.drawing.make({ fresh: true }); await rfOJDone();
      UI.exportDialog = function (title, name) { got.push(name); };
      try {
        UI.drawing.exportAs('pdf'); await idle();
        UI.App.model.activeConfiguration = 'Default';
        UI.drawing.exportAs('pdf'); await idle();
        assert(got[0] === 'LBRK-14_LB-4.pdf' && got[1] === 'LBRK-14.pdf', 'names: ' + got.join(', '));
      } finally { UI.exportDialog = ex0; UI.App.fileName = fn0; UI.markClean(); anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return got.join(', ');
    });
  })();
