  // --- rfOC (2026-11-17, lane drawdual: dual dimensions as SolidWorks 2024, exports named after the saved document,
  // the drawing tree's filter box) ---
  (function () {
    var RFOC_PLATE = 'p.name("BRKT-7").units("in");\np.sketch("Front").rect(0, 0, 4, 2).circle(1, 1, 0.1405).circle(3, 1, 0.1405).circle(2, 1.5, 0.25).extrude(0.25);';
    async function rfOCDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    function rfOCMouse(type, p) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: type === 'dblclick' ? 2 : 1 };
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfOCMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
      var hit = rows.filter(function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name);
      hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    function rfOCRibbon(label) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) ['Annotation', 'View Layout'].some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    // the file name and text a File command hands to the save dialog / download
    async function rfOCSaved(fn) {
      var got = null, sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got = { name: name, text: text }; };
      UI.download = function (name, text) { got = { name: name, text: text }; };
      try { await fn(); await idle(); await wait(30); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    async function rfOCDrawing() {
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newPart(); await idle();
      await anvil.run(RFOC_PLATE); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      anvil.drawing.make(); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfOCDone();
      assert(UI.drawingActive(), 'drawing open');
    }
    function rfOCTexts() { return anvil.drawing.summary().dimDetails.map(function (d) { return d.text; }); }
    function rfOCTextPrim(t) { return UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null && p.text === t; })[0]; }
    function rfOCClashes() {
      var t = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null; }).map(function (p) { return { p: p, r: W.Drawing.textRect(p) }; }), out = [];
      for (var i = 0; i < t.length; i++) for (var j = i + 1; j < t.length; j++) {
        var a = t[i].r, b = t[j].r;
        if (t[i].p.dimIx !== t[j].p.dimIx && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) out.push(t[i].p.text + ' / ' + t[j].p.text);
      }
      return out;
    }
    async function rfOCDocProps() {
      rfOCRibbon('Document Properties').click(); await wait(20);
      assert(modalOpen() && D.getElementById('dw-opt-dual'), 'Document Properties with the dual rows');
    }

    step('rfOC: a. Document Properties: Dual dimensions display off by default (Bottom, Dual Dimension Length millimetres .12); ticked + OK: every length reads value over [mm] on the sheet, one undo step, no texts meet; SVG / PDF / DXF carry it (R2000 text override 4.000\\X[101.60])', async function () {
      var errs0 = errors.length;
      await rfOCDrawing();
      assert(rfOCTexts().join(' ').indexOf('[') < 0, 'no dual before: ' + rfOCTexts().join(' | '));
      await rfOCDocProps();
      var on = D.getElementById('dw-opt-dual'), pos = D.querySelector('#dw-opt-dualpos input:checked');
      assert(!on.checked && pos && pos.value === 'bottom' && D.getElementById('dw-opt-dualunit').value === 'mm' && D.getElementById('dw-opt-dualprec').value === '2', 'defaults: off, Bottom, mm, .12');
      assert(D.getElementById('dw-opt-dualunits').disabled, 'Show units greyed while off');
      var u0 = UI.App.undo.length;
      on.click(); await wait(10);
      assert(!D.getElementById('dw-opt-dualunits').disabled, 'Show units live once on');
      D.getElementById('dw-opt-ok').click(); await rfOCDone();
      var tx = rfOCTexts();
      ['4.000 [101.60]', '2.000 [50.80]', '2X Ø.281 [7.14]', 'Ø.500 [12.70]'].forEach(function (t) { assert(tx.indexOf(t) >= 0, t + ' in ' + tx.join(' | ')); });
      assert(UI.App.undo.length === u0 + 1, 'one undo step: +' + (UI.App.undo.length - u0));
      var a = rfOCTextPrim('4.000'), b = rfOCTextPrim('[101.60]');
      assert(a && b && b.p[1] < a.p[1] && Math.abs(a.p[0] - b.p[0]) < 1e-6, 'the dual value under the value on the sheet');
      assert(D.querySelector('#drawing-sheet svg').textContent.indexOf('[101.60]') >= 0, 'on screen');
      var c = rfOCClashes();
      assert(!c.length, 'no texts meet: ' + c.join('; '));
      assert(anvil.drawing.svg().indexOf('[101.60]') >= 0, 'SVG');
      assert(anvil.drawing.pdf().indexOf('[101.60]') >= 0, 'PDF');
      var dxf = anvil.drawing.dxf({ version: 'R2000' });
      assert(dxf.indexOf('4.000\\X[101.60]') >= 0, 'R2000 DIMENSION text override');
      assert(anvil.drawing.summary().options.dual === true, 'summary options.dual');
      await rfOCDocProps();
      assert(D.getElementById('dw-opt-dual').checked, 'the box shows it on');
      clickModalButton('Cancel'); await wait(10);
      await UI.undo(); await rfOCDone();
      assert(rfOCTexts().join(' ').indexOf('[') < 0, 'Ctrl+Z: off again ' + rfOCTexts().join(' | '));
      await UI.redo(); await rfOCDone();
      assert(rfOCTexts().indexOf('4.000 [101.60]') >= 0, 'redo: on');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return tx.join(' | ');
    });

    step('rfOC: b. Right position and Show units by the dialog; the Dimension PM\'s Dual Dimension box turns it off for one dimension only (one undo step), and back', async function () {
      var errs0 = errors.length;
      if (!UI.drawingActive() || !anvil.drawing.summary().options.dual) { await rfOCDrawing(); anvil.drawing.options({ dual: true }); await rfOCDone(); }
      await rfOCDocProps();
      D.querySelector('#dw-opt-dualpos input[value="right"]').click();
      D.getElementById('dw-opt-dualunits').click();
      D.getElementById('dw-opt-ok').click(); await rfOCDone();
      var tx = rfOCTexts();
      assert(tx.indexOf('4.000 [101.60mm]') >= 0, 'Right + units: ' + tx.join(' | '));
      var a = rfOCTextPrim('4.000'), b = rfOCTextPrim('[101.60mm]');
      assert(a && b && Math.abs(a.p[1] - b.p[1]) < 1e-6 && b.p[0] > a.p[0], 'one line, the dual value to the right');
      assert(!rfOCClashes().length, 'no texts meet: ' + rfOCClashes().join('; '));
      // the Dimension PM of the 2.000 (double-click its text)
      var t2 = rfOCTextPrim('2.000'), u0 = UI.App.undo.length;
      rfOCMouse('dblclick', [t2.p[0] + 0.02, t2.p[1] + t2.h / 2]); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Dimension', 'Dimension PM: ' + (UI.hasPM() && UI.pmTitle()));
      var box = D.querySelector('#pm input[data-key="dual"]');
      assert(box && box.checked, 'Dual Dimension box ticked (the document\'s)');
      box.click(); await rfOCDone();
      await UI.pmOK(); await rfOCDone();
      tx = rfOCTexts();
      assert(tx.indexOf('2.000') >= 0 && tx.indexOf('4.000 [101.60mm]') >= 0, 'off for that one only: ' + tx.join(' | '));
      assert(UI.App.undo.length === u0 + 1, 'one undo step: +' + (UI.App.undo.length - u0));
      t2 = rfOCTextPrim('2.000');
      rfOCMouse('dblclick', [t2.p[0] + 0.02, t2.p[1] + t2.h / 2]); await wait(30);
      box = D.querySelector('#pm input[data-key="dual"]');
      assert(box && !box.checked, 'the PM shows it off');
      await UI.pmCancel(); await rfOCDone();
      await UI.undo(); await rfOCDone();
      assert(rfOCTexts().indexOf('2.000 [50.80mm]') >= 0, 'Ctrl+Z: dual again ' + rfOCTexts().join(' | '));
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return tx.join(' | ');
    });

    step('rfOC: c. File > Save Drawing As keeps the dual setting; the drawing opened again shows it', async function () {
      var errs0 = errors.length;
      if (!UI.drawingActive() || !anvil.drawing.summary().options.dual) { await rfOCDrawing(); anvil.drawing.options({ dual: true }); await rfOCDone(); }
      var before = rfOCTexts().slice().sort().join(' | ');
      var f = await rfOCSaved(function () { rfOCMenu('File', 'Save Drawing As'); });
      assert(f && /\.drawing$/.test(f.name) && JSON.parse(f.text).drawing.options.dual === true, 'saved with options.dual: ' + (f && f.name));
      anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save");
      UI.App.model.drawings = [];
      await UI.openDrawingFile(f.name, f.text); await rfOCDone();
      assert(UI.drawingActive() && anvil.drawing.summary().options.dual === true, 'opened with it on');
      assert(rfOCTexts().slice().sort().join(' | ') === before, 'same texts: ' + rfOCTexts().join(' | '));
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return f.name;
    });

    step('rfOC: d. export names follow the saved document: never saved Draw1_BRKT-7; the part saved as TRAY-ASM: TRAY-ASM.pdf / .dxf / .svg / .dwg / .drawing; the drawing saved as its own file (Windows app): that file\'s name', async function () {
      var errs0 = errors.length, A = UI.App, fn0 = A.fileName, fp0 = A.filePath, dp0 = A.drawingPath;
      if (!UI.drawingActive()) await rfOCDrawing();
      var dn = anvil.drawing.summary().name, out = [];
      try {
        A.fileName = null; A.filePath = null; A.drawingPath = null;
        var g = await rfOCSaved(function () { rfOCMenu('File', 'Save Drawing as PDF'); });
        assert(g && g.name === dn + '_BRKT-7.pdf', 'unsaved: ' + (g && g.name));
        out.push(g.name);
        A.fileName = 'TRAY-ASM';
        var want = { 'Save Drawing as PDF': 'TRAY-ASM.pdf', 'Save Drawing as DXF': 'TRAY-ASM.dxf', 'Save Drawing as SVG': 'TRAY-ASM.svg', 'Save Drawing As…': 'TRAY-ASM.drawing' };
        for (var k in want) {
          g = await rfOCSaved(function () { rfOCMenu('File', k); });
          assert(g && g.name === want[k], k + ': ' + (g && g.name));
          out.push(g.name);
        }
        g = await rfOCSaved(function () { return UI.drawing.saveDWG ? UI.drawing.saveDWG() : UI.drawingInternal.exportAs('dwg'); });
        assert(!g || g.name === 'TRAY-ASM.dwg', 'DWG: ' + (g && g.name));
        if (g) out.push(g.name);
        A.fileName = null; A.filePath = 'C:\\Jobs\\TRAY-ASM.anvil.json';
        g = await rfOCSaved(function () { rfOCMenu('File', 'Save Drawing as DXF'); });
        assert(g && g.name === 'TRAY-ASM.dxf', 'Windows app part file: ' + (g && g.name));
        A.drawingPath = { path: 'C:\\Jobs\\TRAY-ASM DWG.drawing', name: dn };
        g = await rfOCSaved(function () { rfOCMenu('File', 'Save Drawing as PDF'); });
        assert(g && g.name === 'TRAY-ASM DWG.pdf', 'the drawing\'s own file: ' + (g && g.name));
        out.push(g.name);
      } finally { A.fileName = fn0; A.filePath = fp0; A.drawingPath = dp0; }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return out.join(', ');
    });

    step('rfOC: e. the drawing FeatureManager reads the filter box: typing keeps the matching sheets / views / annotations with the rows they sit under, x and Esc clear it; the box goes back over the part tree when the drawing closes', async function () {
      var errs0 = errors.length;
      if (!UI.drawingActive()) await rfOCDrawing();
      var inp = D.getElementById('tree-filter-input'), tree = D.getElementById('drawing-tree');
      assert(inp && inp.offsetParent !== null && inp.closest('#tree-filter').nextElementSibling === tree, 'the filter box shows over the drawing tree');
      function shown() { return Array.prototype.filter.call(tree.querySelectorAll('.ti'), function (r) { return r.style.display !== 'none'; }).map(function (r) { return r.querySelector('.nm').textContent; }); }
      var all = shown();
      assert(all.indexOf('Drawing View1') >= 0 && all.indexOf('Drawing View2') >= 0, 'views listed: ' + all.join(', '));
      setInput(inp, 'view2'); await wait(20);
      var s = shown(), sheetName = anvil.drawing.summary().sheet.name;
      assert(s.indexOf('Drawing View2') >= 0 && s.indexOf('Drawing View1') < 0 && s.indexOf(sheetName) >= 0 && s.length === 3, 'a view with its sheet and the drawing: ' + s.join(', '));
      setInput(inp, 'center'); await wait(20);
      s = shown();
      assert(s.every(function (n, i) { return i === 0 || /center/i.test(n) || /Sheet|Drawing View/.test(n); }), 'annotation rows with their views: ' + s.join(', '));
      var esc = new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      inp.dispatchEvent(esc); await rfOCDone();
      assert(inp.value === '' && shown().length === all.length, 'Esc clears it: ' + shown().length + ' / ' + all.length);
      setInput(inp, 'sheet'); await wait(20);
      var x = D.querySelector('#tree-filter .tree-filter-clear');
      assert(x && !x.hidden, 'the x shows');
      x.click(); await rfOCDone();
      assert(inp.value === '' && shown().length === all.length, 'x clears it');
      setInput(inp, 'view1'); await wait(20);
      anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save");
      await idle();
      assert(inp.value === '' && inp.closest('#tree-filter').nextElementSibling === D.getElementById('tree'), 'back over the part tree, empty');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return s.join(', ');
    });
  })();
  // --- end rfOC ---
