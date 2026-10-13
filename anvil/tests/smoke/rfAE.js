  // ---- rfAE: Edit Sheet Format, drawing templates, General Table, the .drawing document
  var RFAE_PART = 'p.name("AEBracket").units("in");\np.sketch("Front").polyline([[0, 0], [4, 0], [4, 2], [0, 2]], true).end().extrude(0.25);';
  async function rfAEDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(RFAE_PART); await idle();
    anvil.drawing.make(); await idle(); await wait(40);
    await UI.drawing.ready();
    return anvil.drawing.summary();
  }
  function rfAEModalButton(text) { return Array.prototype.filter.call(D.querySelectorAll('#modal button'), function (b) { return b.textContent.trim() === text; })[0]; }
  function rfAEPrompt(value) {
    var inp = D.querySelector('#modal input[type="text"]');
    assert(modalOpen() && inp, 'a text prompt is open');
    inp.value = value;
    rfAEModalButton('OK').click();
  }
  function rfAEItem(id) { return anvil.drawing.summary().format.items.filter(function (it) { return it.id === id; })[0]; }
  function rfAEMid(it) { return it.box ? [(it.box[0] + it.box[2]) / 2, (it.box[1] + it.box[3]) / 2] : [(it.a[0] + it.b[0]) / 2, (it.a[1] + it.b[1]) / 2]; }
  function rfAEDrag(a, b) {
    sheetMouse('mousedown', a);
    W.dispatchEvent(new W.MouseEvent('mousemove', Object.assign({ bubbles: true }, paperToClient([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]))));
    W.dispatchEvent(new W.MouseEvent('mousemove', Object.assign({ bubbles: true }, paperToClient(b))));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true }));
  }
  function rfAEMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent.indexOf(text) >= 0; })[0]; }
  function rfAEContext(p) { var c = paperToClient(p); D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: c.clientX, clientY: c.clientY })); }
  function rfAEStubDownload() { var got = [], orig = UI.download; UI.download = function (name, text) { got.push({ name: name, text: text }); }; return { got: got, restore: function () { UI.download = orig; } }; }
  step('rfAE: right-click the sheet ▸ Edit Sheet Format: the Sheet Format tab, the views greyed; drag the COMPANY field, Delete a title block line, Line and Note ($PRP link) add to the format, double-click edits the note; Edit Sheet goes back; undo steps', async function () {
    var errs0 = errors.length, st = UI.drawing.state;
    var s0 = await rfAEDrawing();
    anvil.drawing.properties({ CompanyName: 'Acme Sheet Metal' });
    rfAEContext([0.8, 10]); await wait(20);
    var mi = rfAEMenuItem('Edit Sheet Format');
    assert(mi, 'sheet menu has Edit Sheet Format');
    mi.click(); UI.closeMenus(); await wait(20);
    assert(st.formatEdit && UI.App.ribbonTab === 'Sheet Format' && D.querySelector('#drawing-sheet').classList.contains('dw-fmt-edit'), 'editing the sheet format');
    assert(ribbonTabs().indexOf('Sheet Format') >= 0, 'Sheet Format tab: ' + ribbonTabs().join(','));
    // drag COMPANY 30 mm left, 20 mm up (paper units: inch sheet)
    var comp = rfAEItem('field:company'), at = rfAEMid(comp), u0 = UI.App.undo.length;
    rfAEDrag(at, [at[0] - 1.2, at[1] + 0.8]); await wait(60);
    var comp2 = rfAEItem('field:company');
    assert(comp2 && Math.abs(comp2.box[0] - comp.box[0] + 1.2) < 0.05 && Math.abs(comp2.box[1] - comp.box[1] - 0.8) < 0.05, 'COMPANY moved: ' + JSON.stringify([comp.box, comp2.box]));
    assert(UI.App.undo.length === u0 + 1, 'one undo step for the drag');
    // a click on the title block's first row line, Delete
    var row1 = rfAEItem('tb-row1');
    sheetMouse('mousedown', [row1.a[0] + 0.3, row1.a[1]]); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true })); await wait(20);
    assert(st.sel && st.sel.kind === 'fmt' && st.sel.id === 'tb-row1', 'row line picked: ' + JSON.stringify(st.sel));
    key('Delete'); await wait(40);
    assert(!rfAEItem('tb-row1') && anvil.drawing.doc().format.hide['tb-row1'], 'row line deleted');
    // Line: two clicks; Note: a click and its text
    dwTab('Sheet Format');
    ribbonButton('Line').click(); await wait(10);
    var S = anvil.drawing.summary().sheet.size, y = 0.4 + 1.6 + 0.6;
    sheetMouse('mousedown', [S[0] - 4, y]); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true }));
    sheetMouse('mousedown', [S[0] - 0.4, y + 0.01]); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true })); await wait(30);
    var ln = anvil.drawing.summary().format.items.filter(function (it) { return it.added && it.kind === 'line'; })[0];
    assert(ln && Math.abs(ln.a[1] - ln.b[1]) < 1e-6, 'line added, snapped horizontal: ' + JSON.stringify(ln));
    key('Escape'); await wait(10);
    ribbonButton('Note').click(); await wait(10);
    sheetMouse('mousedown', [S[0] - 3.9, y + 0.15]); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true })); await wait(20);
    rfAEPrompt('MADE BY $PRP:"CompanyName"'); await wait(40);
    key('Escape'); await wait(10);
    var note = anvil.drawing.summary().format.items.filter(function (it) { return it.added && it.kind === 'text'; })[0];
    assert(note && st.sheet.prims.some(function (p) { return p.fmt === note.id && p.text === 'MADE BY Acme Sheet Metal'; }), 'note with its link: ' + JSON.stringify(note));
    sheetMouse('dblclick', rfAEMid(note)); await wait(20);
    rfAEPrompt('ACME SHEET METAL'); await wait(40);
    assert(st.sheet.prims.some(function (p) { return p.fmt === note.id && p.text === 'ACME SHEET METAL'; }), 'note edited by double-click');
    // views take no clicks while the format is edited
    var F = dwView('Front');
    sheetMouse('mousedown', [(F.box[0] + F.box[2]) / 2, (F.box[1] + F.box[3]) / 2]); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true })); await wait(20);
    assert(!st.sel || st.sel.kind !== 'view', 'a view is not picked in Edit Sheet Format');
    rfAEContext([0.8, 10]); await wait(20);
    rfAEMenuItem('Edit Sheet').click(); UI.closeMenus(); await wait(20);
    assert(!st.formatEdit && !D.querySelector('#drawing-sheet').classList.contains('dw-fmt-edit'), 'back to the sheet');
    var f = anvil.drawing.summary().format;
    assert(f.edited && f.items.some(function (it) { return it.id === note.id; }), 'the format keeps its edits');
    UI.undo(); await wait(40);
    assert(st.sheet.prims.some(function (p) { return p.fmt === note.id && p.text === 'MADE BY Acme Sheet Metal'; }), 'undo: the note text before the edit');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return f.items.length + ' items, ' + s0.views.length + ' views';
  });
  step('rfAE: Save as Drawing Template keeps the shop format (company note, properties) in this browser; Make Drawing from Part offers it and the new drawing uses it; export / import as a JSON file; Drawing Templates dialog deletes one', async function () {
    var errs0 = errors.length, keep = null, dl = rfAEStubDownload();
    try { keep = W.localStorage.getItem('anvil.drawingTemplates'); W.localStorage.removeItem('anvil.drawingTemplates'); } catch (e) { }
    try {
      await rfAEDrawing();
      anvil.drawing.properties({ CompanyName: 'Acme Sheet Metal' });
      var S = anvil.drawing.summary().sheet.size;
      anvil.drawing.formatNote([S[0] - 3.5, 2.5], '$PRP:"CompanyName"', 5);
      anvil.drawing.setSheet({ format: 'ANSI C' });
      dwTab('Sheet Format');
      ribbonButton('Save as Template').click(); await wait(10);
      rfAEPrompt('AE Shop B'); await wait(20);
      var l = anvil.drawing.templates();
      assert(l.length === 1 && l[0].name === 'AE Shop B' && l[0].kind === 'template' && l[0].format === 'ANSI C', 'kept: ' + JSON.stringify(l));
      var txt = anvil.drawing.exportTemplate('AE Shop B');
      assert(dl.got.length === 1 && /AE_Shop_B\.drwdot\.json$/.test(dl.got[0].name) && JSON.parse(dl.got[0].text).kind === 'anvil-drawing-template', 'exported: ' + (dl.got[0] && dl.got[0].name));
      anvil.drawing.close(); await idle();
      // a new part: Make Drawing from Part offers the template
      await anvil.newPart(); await idle();
      await anvil.run(RFAE_PART.replace('AEBracket', 'AEOther')); await idle();
      dwMenu('Make Drawing from Part'); await wait(20);
      assert(modalOpen() && /New Drawing/.test(D.querySelector('#modal').textContent) && D.querySelectorAll('#modal input[name="dw-tpl"]').length === 2, 'template chooser');
      var radio = D.querySelector('#modal input[name="dw-tpl"][value="AE Shop B"]');
      assert(radio && radio.checked, 'the saved template is offered and chosen');
      rfAEModalButton('OK').click(); await idle(); await wait(40);
      await UI.drawing.ready();
      var s = anvil.drawing.summary();
      assert(UI.drawingActive() && s.sheet.format === 'ANSI C' && s.format.template === 'AE Shop B', 'drawing from the template: ' + s.sheet.format + ' ' + s.format.template);
      assert(UI.drawing.state.sheet.prims.some(function (p) { return p.text === 'Acme Sheet Metal' && /^n/.test(p.fmt || ''); }), 'the company name note is on the new sheet');
      anvil.drawing.close(); await idle();
      // import a copy under another name, then the Drawing Templates dialog deletes it
      var o = JSON.parse(txt); o.name = 'AE Imported';
      assert(anvil.drawing.importTemplate(JSON.stringify(o)) === 'AE Imported' && anvil.drawing.templates().length === 2, 'imported');
      assert(anvil.drawing.importTemplate('{"kind":"nope"}') === null && anvil.drawing.templates().length === 2, 'a bad file is refused');
      UI.makeDrawing(); await idle(); await UI.drawing.ready();
      dwMenu('Drawing Templates'); await wait(20);
      var rowEl = D.querySelector('#modal .dw-tpl-row[data-name="AE Imported"]');
      assert(rowEl && D.querySelectorAll('#modal .dw-tpl-row').length === 2, 'dialog lists both');
      rowEl.querySelector('.dw-tpl-delete').click(); await wait(10);
      assert(anvil.drawing.templates().map(function (t) { return t.name; }).join() === 'AE Shop B' && D.querySelectorAll('#modal .dw-tpl-row').length === 1, 'deleted from the dialog');
      UI.closeModal();
      anvil.drawing.close(); await idle();
    } finally {
      dl.restore();
      try { if (keep != null) W.localStorage.setItem('anvil.drawingTemplates', keep); else W.localStorage.removeItem('anvil.drawingTemplates'); } catch (e) { }
    }
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'AE Shop B';
  });
  step('rfAE: Insert ▸ Tables ▸ General Table: PM 3 x 2, click to place; double-click a cell, type, Enter (Tab to the next); right-click Insert Row Below / Delete Column; drag; SVG / DXF carry it; Delete removes it', async function () {
    var errs0 = errors.length, st = UI.drawing.state;
    await rfAEDrawing();
    dwMenu('General Table'); await wait(20);
    assert(UI.hasPM() && UI.pmTitle() === 'General Table', 'General Table PM');
    var cols = D.querySelector('#pm input[data-key="cols"]'), rows = D.querySelector('#pm input[data-key="rows"]');
    assert(cols && rows, 'Columns / Rows fields');
    cols.value = '3'; cols.dispatchEvent(new W.Event('input', { bubbles: true })); cols.dispatchEvent(new W.Event('change', { bubbles: true }));
    await UI.pmOK(); await wait(20);
    assert(st.tool === 'gtable', 'placing the table');
    var u0 = UI.App.undo.length;
    sheetMouse('mousedown', [1, 9.5]); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true })); await wait(40);
    var t = anvil.drawing.tables()[0];
    assert(t && t.cols === 3 && t.rows === 2 && Math.abs(t.box[0] - 1) < 0.05 && Math.abs(t.box[3] - 9.5) < 0.05 && UI.App.undo.length === u0 + 1, 'placed: ' + JSON.stringify(t));
    var k = 1 / 25.4, X0 = t.box[0], Y1 = t.box[3], c00 = [X0 + 5 * k, Y1 - 3 * k];
    sheetMouse('dblclick', c00); await wait(20);
    var inp = D.querySelector('#dw-edit.cell input');
    assert(inp, 'cell editor open');
    inp.value = 'FINISH';
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await wait(30);
    inp = D.querySelector('#dw-edit.cell input');
    assert(inp && inp.getAttribute('aria-label') === 'Cell 1, 2', 'Tab went to the next cell: ' + (inp && inp.getAttribute('aria-label')));
    inp.value = '$PRP:"SW-Sheet Scale"';
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(30);
    t = anvil.drawing.tables()[0];
    assert(t.cells[0][0] === 'FINISH' && /^\d+:\d+$/.test(t.cells[0][1]) && t.raw[0][1] === '$PRP:"SW-Sheet Scale"', 'cells: ' + JSON.stringify(t.cells));
    rfAEContext(c00); await wait(20);
    rfAEMenuItem('Insert ▸ Row Below').click(); UI.closeMenus(); await wait(30);
    assert(anvil.drawing.tables()[0].rows === 3 && anvil.drawing.tables()[0].cells[0][0] === 'FINISH', 'row inserted below');
    rfAEContext([X0 + 40 * k, Y1 - 3 * k]); await wait(20);
    rfAEMenuItem('Delete ▸ Column').click(); UI.closeMenus(); await wait(30);
    t = anvil.drawing.tables()[0];
    assert(t.cols === 2 && t.cells[0][0] === 'FINISH' && t.raw[0][1] === '', 'second column deleted: ' + JSON.stringify(t.raw));
    rfAEDrag([X0 + 5 * k, Y1 - 9 * k], [X0 + 2 + 5 * k, Y1 - 1.5 - 9 * k]); await wait(60);
    t = anvil.drawing.tables()[0];
    assert(Math.abs(t.box[0] - X0 - 2) < 0.05 && Math.abs(t.box[3] - Y1 + 1.5) < 0.05, 'dragged: ' + t.box);
    assert(/FINISH/.test(anvil.drawing.svg()) && /FINISH/.test(anvil.drawing.dxf()), 'SVG / DXF');
    assert(D.querySelector('#drawing-tree .dw-gtable'), 'General Table1 in the FeatureManager');
    st.sel = { kind: 'gtable', id: t.id }; key('Delete'); await wait(30);
    assert(!anvil.drawing.tables().length, 'deleted');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'ok';
  });
  step('rfAE: File ▸ Save Drawing As writes AEBracket\'s drawing as Draw1.drawing; File ▸ Open of it opens on the open part, asks for the part when another one is open, and opens on a part file given', async function () {
    var errs0 = errors.length, dl = rfAEStubDownload();
    try {
      await rfAEDrawing();
      anvil.drawing.table({ rows: 1, cols: 1, anchor: 'top-left', cells: [['AE']] });
      var nv = anvil.drawing.summary().views.length, partJson = JSON.stringify(UI.App.model);
      dwMenu('Save Drawing As'); await wait(20);
      assert(dl.got.length === 1 && dl.got[0].name === 'Draw1.drawing', 'written: ' + (dl.got[0] && dl.got[0].name));
      var file = JSON.parse(dl.got[0].text);
      assert(file.kind === 'anvil-drawing' && file.part.name === 'AEBracket' && file.drawing.views.length === nv, 'part reference');
      anvil.drawing.close(); await idle();
      UI.App.model.drawings = [];
      await UI.openFileData('Draw1.drawing', dl.got[0].text); await idle(); await UI.drawing.ready();
      var s = anvil.drawing.summary();
      assert(UI.drawingActive() && s.views.length === nv && s.tables.length === 1 && UI.App.model.drawings.length === 1, 'opened on the open part');
      anvil.drawing.close(); await idle();
      // another part is open: it asks for AEBracket's file (Cancel opens nothing)
      await anvil.newPart(); await idle();
      await anvil.run(RFAE_PART.replace('AEBracket', 'AEOther2')); await idle();
      var pr = UI.openFileData('Draw1.drawing', dl.got[0].text); await wait(30);
      assert(modalOpen() && D.querySelector('#dw-part-file') && /AEBracket/.test(D.querySelector('#modal').textContent), 'asks for the part');
      rfAEModalButton('Cancel').click();
      assert(await pr === null && !UI.drawingActive(), 'cancelled');
      // given the part file it opens on it
      var r = await anvil.drawing.openFile(dl.got[0].text, { part: { name: 'AEBracket.anvil.json', data: partJson } }); await idle(); await UI.drawing.ready();
      assert(r && UI.App.model.name === 'AEBracket' && UI.drawingActive() && anvil.drawing.summary().views.length === nv, 'opened on the part file');
      anvil.drawing.close(); await idle();
    } finally { dl.restore(); }
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Draw1.drawing';
  });
  // --- end rfAE ---
