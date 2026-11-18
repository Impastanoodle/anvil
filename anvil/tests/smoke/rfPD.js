  // --- rfPD (2026-11-17, lane drawchamfer: the drawing's Chamfer Dimension in SolidWorks' text formats) ---
  (function () {
    // a 3 x 1 x 2 inch block, a Distance Distance chamfer (D1 .1, D2 .3) on its top edge along x
    var RFPD_BLOCK = 'p.name("CHAMF-1").units("in");\np.sketch("Top").rect(0, -2, 3, 2).end().extrude(1);\np.chamfer(0.1, [[1.5, 1, 0]], { d2: 0.3 });';
    async function rfPDDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    function rfPDMouse(type, p) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: type === 'dblclick' ? 2 : 1 };
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfPDRibbon(label) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) ['Annotation', 'View Layout'].some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    function rfPDChamfer() { return anvil.drawing.summary().dimDetails.filter(function (d) { return d.kind === 'chamfer'; }); }
    function rfPDTextPrim(re) { return UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null && re.test(p.text); })[0]; }

    step('rfPD: Model Items brings a chamfer feature onto the drawing as .100 X .300; Document Properties > Chamfer text display 1 X 45° makes it .100 X 71.57° (one undo step); the Dimension PM\'s Chamfer Text Format 1 X 1 brings .100 X .300 back for it alone; Ctrl+Z; dual reads [2.54 X 7.62]', async function () {
      var errs0 = errors.length;
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newPart(); await idle();
      await anvil.run(RFPD_BLOCK); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      anvil.drawing.make(); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfPDDone();
      assert(!rfPDChamfer().length, 'a new drawing\'s default items: no chamfer dimension');
      // Annotation > Model Items, Entire model, OK: the chamfer feature comes as one chamfer dimension
      rfPDRibbon('Model Items').click(); await wait(30);
      assert(UI.hasPM() && /Model Items/.test(UI.pmTitle()), 'Model Items PM: ' + (UI.hasPM() && UI.pmTitle()));
      await UI.pmOK(); await rfPDDone();
      var c = rfPDChamfer();
      assert(c.length === 1 && c[0].text === '.100 X .300', 'model item: ' + JSON.stringify(c.map(function (d) { return d.text; })));
      // Document Properties > Dimensions > Chamfer > Text display
      rfPDRibbon('Document Properties').click(); await wait(20);
      var sel = D.getElementById('dw-opt-chamfer');
      assert(modalOpen() && sel && sel.value === 'auto', 'Chamfer text display row, From the feature');
      var u0 = UI.App.undo.length;
      setInput(sel, 'dxa');
      D.getElementById('dw-opt-ok').click(); await rfPDDone();
      c = rfPDChamfer();
      assert(c[0].text === '.100 X 71.57°', '1 X 45° form: ' + c[0].text);
      assert(UI.App.undo.length === u0 + 1, 'one undo step: +' + (UI.App.undo.length - u0));
      assert(anvil.drawing.summary().options.chamferText === 'dxa', 'summary options');
      // the Dimension PM of the chamfer (double-click its text): Chamfer Text Format 1 X 1
      var t = rfPDTextPrim(/^\.100 X 71\.57/);
      assert(t, 'its text on the sheet');
      rfPDMouse('dblclick', [t.p[0] + 0.02, t.p[1] + t.h / 2]); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Dimension', 'Dimension PM: ' + (UI.hasPM() && UI.pmTitle()));
      var f = D.querySelector('#pm select[data-key="chform"]');
      assert(f && f.value === 'auto', 'Chamfer Text Format, the document\'s: ' + (f && f.value));
      var u1 = UI.App.undo.length;
      setInput(f, 'dxd'); await rfPDDone();
      assert(rfPDChamfer()[0].text === '.100 X .300', 'live: ' + rfPDChamfer()[0].text);
      await UI.pmOK(); await rfPDDone();
      assert(rfPDChamfer()[0].text === '.100 X .300', 'after OK: ' + rfPDChamfer()[0].text);
      assert(UI.App.undo.length === u1 + 1, 'one undo step: +' + (UI.App.undo.length - u1));
      await UI.undo(); await rfPDDone();
      assert(rfPDChamfer()[0].text === '.100 X 71.57°', 'Ctrl+Z: ' + rfPDChamfer()[0].text);
      anvil.drawing.options({ chamferText: '', dual: true }); await rfPDDone();
      assert(rfPDChamfer()[0].text === '.100 X .300 [2.54 X 7.62]', 'dual: ' + rfPDChamfer()[0].text);
      assert(anvil.drawing.svg().indexOf('[2.54 X 7.62]') >= 0 && anvil.drawing.pdf().indexOf('[2.54 X 7.62]') >= 0, 'SVG and PDF');
      anvil.drawing.options({ dual: '' }); await rfPDDone();
      anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save");
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return c[0].text;
    });
  })();
