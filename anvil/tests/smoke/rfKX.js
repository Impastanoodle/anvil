  // --- rfKX (2026-11-11, lane drawflow2, test-reports/2026-11-11-drawing-flow.md *Left*) --- as SolidWorks 2024, with
  // mouse and key events: the Hole Callout follows the pointer after the hole is clicked and a second click places it
  // (Esc drops the pick, the tool stays); Delete on a view with views made from it asks (Confirm Delete) and takes the
  // views, dimensions and the notes / symbols on them in one undo step, a sheet note stays; Tolerance precision in the
  // Dimension PM and in Document Properties (+.010 / -.005 under a 2-place nominal). Self-contained.
  (function () {
    var RFKX_PLATE = 'p.name("KXPlate").units("in");\np.sketch("Top").rect(0, -4, 6, 4).end().extrude(0.125, { reverse: true });\n' +
      'p.hole("Top", 1.5, -1, 0.281);\np.hole("Top", 4.5, -1, 0.281);\np.hole("Top", 3, -2.5, 0.5);';
    function rfKXMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: type === 'dblclick' ? 2 : 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfKXClick(p) { rfKXMouse('mousemove', p); rfKXMouse('mousedown', p); rfKXMouse('mouseup', p); }
    function rfKXKey(k) { W.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
    function rfKXMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var hit = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name);
      hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    function rfKXRibbon(label) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) ['Annotation', 'View Layout'].some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    function rfKXW(o) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.orient === o; })[0]; }
    function rfKXEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }
    async function rfKXDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    function rfKXModalText() { return D.querySelector('#modal') ? D.querySelector('#modal').textContent : ''; }
    function rfKXModalButton(text) { return Array.prototype.filter.call(D.querySelectorAll('#modal button'), function (b) { return b.textContent.trim() === text; })[0]; }
    async function rfKXDrawing() {
      await anvil.newPart(); await idle();
      await anvil.run(RFKX_PLATE); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      rfKXMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfKXDone(); await wait(20);
      assert(UI.drawingActive(), 'drawing open');
    }
    function rfKXCallouts() { return (UI.drawing.state.sheet.annotations || []).filter(function (a) { return a.type === 'holeCallout'; }); }

    step('rfKX: Hole Callout — a click on the Ø.281\'s edge picks it (nothing placed), the callout follows the pointer, Esc drops the pick and the tool stays; click the hole, then the spot: placed there, one undo step; the tool stays for the next hole; Esc ends', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfKXDrawing();
      var T = rfKXW('Top'), n0 = rfKXCallouts().length, u0 = UI.App.undo.length;
      var E = T.toSheet([1.5 + 0.1405, -1]), c = T.toSheet([1.5, -1]), S = [c[0] - 1.1, c[1] + 0.9];
      rfKXRibbon('Hole Callout').click(); await wait(10);
      assert(st.tool === 'holecallout', 'tool on');
      rfKXClick(E); await wait(10);
      assert(st.pending && st.pending.pick && UI.App.undo.length === u0 && rfKXCallouts().length === n0, 'picked, nothing placed');
      rfKXMouse('mousemove', S); await wait(10);
      var pt = D.querySelector('#dw-overlay .dw-sdprev-text');
      assert(pt && pt.textContent === '2X Ø.281 THRU ALL', 'the preview reads the callout: ' + (pt && pt.textContent));
      var sw = UI.drawing.state.sheet.units === 'in' ? 1 / 25.4 : 1;
      var at = st.pending.at;
      assert(Math.abs(at[0] - S[0]) < 0.05 && Math.abs(+pt.getAttribute('x') - (at[0] - 5 * sw)) < 1e-6 && pt.getAttribute('text-anchor') === 'end', 'the preview text follows the pointer: ' + pt.getAttribute('x') + ' vs ' + (at[0] - 5 * sw));
      rfKXKey('Escape'); await wait(10);
      assert(st.tool === 'holecallout' && !(st.pending && st.pending.pick) && !D.querySelector('#dw-overlay .dw-sdprev-text') && UI.App.undo.length === u0, 'Esc drops the pick, the tool stays');
      rfKXClick(E); await wait(10);
      rfKXClick(S); await rfKXDone();
      var cs = rfKXCallouts();
      assert(cs.length === n0 + 1 && UI.App.undo.length === u0 + 1, 'placed, one undo step: ' + cs.length + ' +' + (UI.App.undo.length - u0));
      var an = anvil.drawing.doc().views.filter(function (v) { return v.orient === 'Top'; })[0].annotations.filter(function (a) { return a.type === 'holeCallout'; }).pop();
      assert(an.lead && Math.abs(an.lead[0] - (S[0] - c[0])) < 0.05 && Math.abs(an.lead[1] - (S[1] - c[1])) < 0.05, 'the leader ends at the click: ' + JSON.stringify(an.lead));
      var tx = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text' && p.text === '2X Ø.281 THRU ALL' && p.layer === 'ANNOTATIONS'; })[0];
      assert(tx && Math.abs(tx.p[0] - (c[0] + an.lead[0] - 5 * sw)) < 1e-6 && Math.abs(c[0] + an.lead[0] - at[0]) < 1e-6, 'the text where the preview showed it');
      assert(st.tool === 'holecallout', 'the tool stays on for the next hole');
      rfKXKey('Escape'); await wait(10);
      assert(!st.tool, 'Esc ends the tool');
      await UI.undo(); await rfKXDone();
      assert(rfKXCallouts().length === n0, 'Ctrl+Z takes it off');
      anvil.drawing.close(); await idle();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return an.lead.map(fmt).join(', ');
    });

    step('rfKX: Delete on the Front view asks (Confirm Delete lists Top and Right); No keeps all; Yes deletes Front, Top, Right with their dimensions, the note and datum on Top in one undo step; the sheet note stays; Ctrl+Z brings all back; a lone view goes at once with its note', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfKXDrawing();
      var T = rfKXW('Top'), F = rfKXW('Front'), tip = T.toSheet([3, -4]);
      anvil.drawing.note({ p: [tip[0] + 0.5, tip[1] - 0.7], text: 'DEBURR', leader: tip });
      anvil.drawing.note({ p: [1, 1.6], text: 'SHEET NOTE' });
      anvil.drawing.symbol({ type: 'datum', p: [tip[0] - 0.6, tip[1] - 0.5], leader: [tip[0] - 0.6, tip[1]] });
      await rfKXDone();
      var ns = anvil.drawing.notes(), nv = anvil.drawing.summary().views.length;
      assert(ns[0].view === T.view.id && !ns[1].view && anvil.drawing.symbols()[0].view === T.view.id, 'attached to Top: ' + JSON.stringify([ns[0].view, ns[1].view]));
      var dims0 = st.sheet.dims.length, u0 = UI.App.undo.length;
      rfKXClick(F.toSheet([0.6, -0.06])); await wait(10);
      assert(st.sel && st.sel.kind === 'view' && st.sel.id === F.view.id, 'Front selected: ' + JSON.stringify(st.sel));
      rfKXKey('Delete'); await wait(10);
      assert(modalOpen() && /Confirm Delete/.test(rfKXModalText()) && rfKXModalText().indexOf(T.view.name + ' (dependent view)') >= 0 && rfKXModalText().indexOf(rfKXW('Right').view.name + ' (dependent view)') >= 0 && /note/.test(rfKXModalText()), 'Confirm Delete lists the dependents: ' + rfKXModalText());
      rfKXModalButton('No').click(); await rfKXDone();
      assert(!modalOpen() && anvil.drawing.summary().views.length === nv && UI.App.undo.length === u0, 'No keeps everything');
      rfKXClick(F.toSheet([0.6, -0.06])); await wait(10);
      rfKXKey('Delete'); await wait(10);
      rfKXModalButton('Yes').click(); await rfKXDone();
      var s = anvil.drawing.summary(), left = s.views.map(function (v) { return v.orient; });
      assert(s.views.length === nv - 3 && left.indexOf('Front') < 0 && left.indexOf('Top') < 0 && left.indexOf('Right') < 0, 'Front, Top, Right gone: ' + left);
      assert(anvil.drawing.notes().length === 1 && anvil.drawing.notes()[0].text === 'SHEET NOTE' && !anvil.drawing.symbols().length, 'the note and datum on Top went, the sheet note stays');
      assert(st.sheet.dims.every(function (d) { return d.view !== T.view.id && d.view !== F.view.id; }) && UI.App.undo.length === u0 + 1, 'their dimensions went, one undo step (+' + (UI.App.undo.length - u0) + ')');
      await UI.undo(); await rfKXDone();
      assert(anvil.drawing.summary().views.length === nv && anvil.drawing.notes().length === 2 && anvil.drawing.symbols().length === 1 && st.sheet.dims.length === dims0, 'one Ctrl+Z brings it all back');
      // the Isometric (nothing made from it): Delete at once, with the note placed on it
      var I = rfKXW('Isometric');
      assert(I, 'an Isometric view');
      {
        anvil.drawing.note({ p: [(I.box.x0 + I.box.x1) / 2, (I.box.y0 + I.box.y1) / 2], text: 'ISO NOTE' }); await rfKXDone();
        var u1 = UI.App.undo.length;
        rfKXClick([(I.box.x0 + I.box.x1) / 2 + 0.05, (I.box.y0 + I.box.y1) / 2 - 0.3]); await wait(10);
        assert(st.sel && st.sel.kind === 'view' && st.sel.id === I.view.id, 'Isometric selected: ' + JSON.stringify(st.sel));
        rfKXKey('Delete'); await rfKXDone();
        assert(!modalOpen() && !anvil.drawing.summary().views.some(function (v) { return v.orient === 'Isometric'; }) && !anvil.drawing.notes().some(function (n) { return n.text === 'ISO NOTE'; }) && UI.App.undo.length === u1 + 1, 'no question; the view and its note went in one step');
      }
      anvil.drawing.close(); await idle();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return nv + ' views, ' + dims0 + ' dims';
    });

    step('rfKX: Tolerance precision — a dimension\'s PM: bilateral +.010 / -.005 at Unit precision .12 reads +.01/-.01, Tolerance precision .123 reads +.010/-.005 (one undo step); Document Properties > Tolerance precision .123 does it for a dimension left at (Document); in the DXF', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfKXDrawing();
      var T = rfKXW('Top');
      anvil.drawing.doc().views.filter(function (v) { return v.id === T.view.id; })[0];
      // a Smart Dimension by clicks: the two Ø.281 centres
      rfKXRibbon('Smart Dimension').click(); await wait(10);
      var a = T.toSheet([1.5, -1]), b = T.toSheet([4.5, -1]);
      rfKXClick(a); await wait(10); rfKXClick(b); await wait(10);
      rfKXClick([(a[0] + b[0]) / 2, a[1] + 0.45]); await rfKXDone();
      rfKXEnd(); await rfKXDone();
      function dim() { return st.sheet.dims.filter(function (d) { return !d.auto && /^3\.0/.test(d.text); })[0]; }
      var d0 = dim();
      assert(d0 && d0.text === '3.000', 'the 3.000: ' + st.sheet.dims.map(function (d) { return d.text; }).join(' | '));
      var tp = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null && p.text === '3.000'; })[0], u0 = UI.App.undo.length;
      rfKXMouse('dblclick', tp.p.slice()); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Dimension', 'Dimension PM');
      setInput(D.querySelector('#pm select[data-key="tolType"]'), 'bilateral'); await wait(10);
      setInput(pmField('Maximum variation'), '0.01'); setInput(pmField('Minimum variation'), '0.005');
      setInput(D.querySelector('#pm select[data-key="prec"]'), '2'); await rfKXDone();
      var tps = D.querySelector('#pm select[data-key="tolPrec"]');
      assert(tps && tps.value === 'auto' && /Same as nominal \(Document\)/.test(tps.options[tps.selectedIndex].textContent), 'Tolerance precision box, (Document) = Same as nominal');
      assert(dim().text === '3.00 +.01/-.01', 'same as nominal: ' + dim().text);
      setInput(tps, '3'); await rfKXDone();
      assert(dim().text === '3.00 +.010/-.005', 'tolerance precision .123: ' + dim().text);
      await UI.pmOK(); await rfKXDone();
      assert(dim().text === '3.00 +.010/-.005' && UI.App.undo.length === u0 + 1, 'one undo step: +' + (UI.App.undo.length - u0));
      // back to (Document), then Document Properties > Tolerance precision .123
      tp = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null && /^3\.00/.test(p.text); })[0];
      rfKXMouse('dblclick', tp.p.slice()); await wait(20);
      setInput(D.querySelector('#pm select[data-key="tolPrec"]'), 'auto'); await rfKXDone();
      await UI.pmOK(); await rfKXDone();
      assert(dim().text === '3.00 +.01/-.01', '(Document): ' + dim().text);
      rfKXRibbon('Document Properties').click(); await wait(20);
      var sel = D.getElementById('dw-opt-tolprec');
      assert(modalOpen() && sel && sel.value === '', 'Document Properties: Tolerance precision Same as nominal');
      sel.value = '3'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
      D.getElementById('dw-opt-ok').click(); await rfKXDone();
      assert(dim().text === '3.00 +.010/-.005' && anvil.drawing.summary().options.tolPrec === 3, 'the document\'s .123: ' + dim().text);
      var dxf = anvil.drawing.dxf();
      assert(dxf.indexOf('.010') >= 0 && dxf.indexOf('.005') >= 0, 'in the DXF');
      await UI.undo(); await rfKXDone();
      assert(dim().text === '3.00 +.01/-.01', 'Ctrl+Z: ' + dim().text);
      anvil.drawing.close(); await idle();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return dim().text;
    });
  })();
  // --- end rfKX ---
