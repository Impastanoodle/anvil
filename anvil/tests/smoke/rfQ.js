  // ---- rfQ (lane Q, 2026-10-12): several sheets, notes / symbols that follow their view, the tolerance block as lines
  function rfQTabs() { return Array.prototype.map.call(D.querySelectorAll('#drawing-tabs .dw-sheet-tab'), function (b) { return (b.classList.contains('active') ? '*' : '') + b.textContent; }).join(','); }
  function rfQTab(i) { return D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="' + i + '"]'); }
  function rfQMenu(re) {
    var ms = D.querySelectorAll('body > .menu'), m = ms[ms.length - 1], rows = m ? Array.prototype.slice.call(m.querySelectorAll('.mi')) : [];
    var mi = rows.filter(function (r) { return re.test(r.textContent); })[0];
    assert(mi, 'menu item ' + re + ' (have: ' + rows.map(function (r) { return r.textContent; }).join(' | ') + ')');
    mi.click();
  }
  function rfQSheetTexts() { return Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="SHEET"] text'), function (t) { return t.textContent; }); }
  async function rfQDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run('p.name("Plate").units("in");\np.sketch("Front").rect(0, 0, 6, 3).extrude(0.25);'); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    await UI.drawing.ready();
  }
  step('rfQ: sheet tabs — the Add Sheet tab adds Sheet2 (active, empty, SHEET 2 OF 2); a click on Sheet1 brings its views back (1 OF 2); right-click Rename / Properties / Delete; the FeatureManager lists both sheets; Save as PDF writes both, the DXF dialog picks the sheet; undo', async function () {
    var errs0 = errors.length;
    await rfQDrawing();
    var n1 = anvil.drawing.summary().views.length;
    assert(rfQTabs() === '*Sheet1' && anvil.drawing.summary().titleBlock.sheet === '1 OF 1', 'one tab: ' + rfQTabs());
    var u0 = UI.App.undo.length;
    D.querySelector('#drawing-tabs .dw-add-sheet').click(); await idle(); await wait(30);
    var s = anvil.drawing.summary();
    assert(rfQTabs() === 'Sheet1,*Sheet2' && s.sheet.index === 1 && s.sheet.count === 2 && s.views.length === 0 && UI.App.undo.length === u0 + 1, 'Sheet2 active: ' + rfQTabs());
    assert(s.titleBlock.sheet === '2 OF 2' && rfQSheetTexts().indexOf('2 OF 2') >= 0, 'SHEET 2 OF 2');
    assert(D.querySelector('#drawing-tree .dw-sheet').textContent.indexOf('Sheet2') >= 0 && D.querySelector('#drawing-tree .dw-sheet-off'), 'tree: Sheet2 active, Sheet1 listed');
    anvil.drawing.addView('Front', { x: 4, y: 5 }); await idle(); await wait(30);
    assert(anvil.drawing.summary().views.length === 1, 'a view on Sheet2');
    rfQTab(0).click(); await idle(); await UI.drawing.ready(); await wait(30);
    s = anvil.drawing.summary();
    assert(rfQTabs() === '*Sheet1,Sheet2' && s.views.length === n1 && s.titleBlock.sheet === '1 OF 2' && rfQSheetTexts().indexOf('1 OF 2') >= 0, 'Sheet1 back: ' + rfQTabs() + ' ' + s.views.length);
    // right-click Sheet2 ▸ Rename: the tab becomes a text box
    rfQTab(1).dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    ['Add Sheet', 'Delete', 'Rename', 'Properties'].forEach(function (x) { assert(Array.prototype.some.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf(x) >= 0; }), 'menu has ' + x); });
    rfQMenu(/Rename/);
    var inp = D.querySelector('#drawing-tabs .dw-tab-rename');
    assert(inp && inp.value === 'Sheet2', 'rename box');
    inp.value = 'FLAT';
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(30);
    assert(rfQTabs() === '*Sheet1,FLAT' && anvil.drawing.sheets()[1].name === 'FLAT', 'renamed: ' + rfQTabs());
    assert(D.querySelector('#drawing-tree .dw-sheet-off').textContent.indexOf('FLAT') >= 0, 'tree row renamed');
    // Properties… on FLAT activates it and opens Sheet Properties
    rfQTab(1).dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    rfQMenu(/Properties/); await idle(); await wait(30);
    assert(anvil.drawing.summary().sheet.name === 'FLAT' && D.querySelector('#modal') && /Sheet Properties/.test(D.querySelector('#modal').textContent), 'Sheet Properties of FLAT');
    UI.closeModal();
    // the exports: PDF has a page per sheet; SVG / DXF one sheet, the dialog chooses it
    var pdf = anvil.drawing.pdf();
    assert(/\/Count 2 /.test(pdf) && (pdf.match(/\/Type \/Page /g) || []).length === 2, 'two PDF pages');
    assert(anvil.drawing.svg(0).indexOf('1 OF 2') > 0 && anvil.drawing.svg(1).indexOf('2 OF 2') > 0 && anvil.drawing.dxf({ sheet: 'Sheet1' }).indexOf('1 OF 2') > 0, 'SVG / DXF of either sheet');
    UI.drawingInternal.exportAs('dxf');
    var sel = D.getElementById('dw-export-sheet');
    assert(sel && sel.options.length === 2 && sel.value === '1', 'Sheet choice in the DXF dialog');
    sel.value = '0'; sel.dispatchEvent(new W.Event('change')); await idle(); await wait(30);
    assert(anvil.drawing.summary().sheet.index === 0 && D.getElementById('dw-export-sheet').value === '0' && D.querySelector('#modal textarea').value.indexOf('1 OF 2') > 0, 'the dialog switched to Sheet1');
    UI.closeModal();
    // Delete asks first; Yes deletes FLAT
    rfQTab(1).dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    rfQMenu(/Delete/);
    var yes = Array.prototype.filter.call(D.querySelectorAll('#modal button'), function (b) { return b.textContent === 'Yes'; })[0];
    assert(yes && /Delete FLAT/.test(D.querySelector('#modal').textContent), 'asks first');
    yes.click(); await idle(); await wait(30);
    assert(rfQTabs() === '*Sheet1' && !anvil.drawing.doc().sheets && anvil.drawing.summary().titleBlock.sheet === '1 OF 1', 'deleted: ' + rfQTabs());
    await UI.undo(); await idle(); await UI.drawing.ready(); await wait(30);
    assert(anvil.drawing.sheets().length === 2, 'undo brings FLAT back');
    // API
    var l = anvil.drawing.addSheet({ name: 'Sheet3', format: 'ANSI A' });
    assert(l && l.length === 3 && l[2].active && anvil.drawing.summary().sheet.format === 'ANSI A', 'anvil.drawing.addSheet');
    assert(anvil.drawing.activateSheet('Sheet1').sheet.index === 0 && anvil.drawing.deleteSheet(2).length === 2 && anvil.drawing.renameSheet(1, 'Sheet1') === null, 'activateSheet / deleteSheet / renameSheet (duplicate refused)');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return n1 + ' views on Sheet1, 1 on FLAT';
  });
  step('rfQ: a note with its leader on Front and a datum on Front move with Front when it is dragged (live and dropped); a free note stays; undo puts them back', async function () {
    var errs0 = errors.length;
    await rfQDrawing();
    var F = dwView('Front'), b = F.box, my = (b[1] + b[3]) / 2;
    anvil.drawing.note({ p: [b[2] + 0.4, my + 0.4], text: 'BREAK ALL EDGES', leader: [b[2], my] });
    anvil.drawing.note({ p: [1, 1.6], text: 'FREE NOTE' });
    anvil.drawing.symbol({ type: 'datum', p: [(b[0] + b[2]) / 2, b[1] - 0.5], leader: [(b[0] + b[2]) / 2, b[1]] });
    var ns = anvil.drawing.notes(), sy = anvil.drawing.symbols()[0];
    assert(ns[0].view === F.id && ns[1].view === null && sy.view === F.id, 'attached: ' + JSON.stringify([ns[0].view, ns[1].view, sy.view]));
    assert(D.querySelector('#drawing-sheet g[data-layer="NOTES"] g[data-of="' + F.id + '"]'), 'the attached note is grouped with Front (live drag)');
    var c = [(b[0] + b[2]) / 2, my], to = paperToClient([c[0] + 1, c[1] - 0.5]);
    sheetMouse('mousedown', c);
    W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: to.clientX, clientY: to.clientY }));
    var g = D.querySelector('#drawing-sheet g[data-layer="NOTES"] g[data-of="' + F.id + '"]');
    assert(g && /translate/.test(g.getAttribute('transform') || ''), 'the note moves with the view while it is dragged');
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, clientX: to.clientX, clientY: to.clientY }));
    await wait(60);
    var F1 = dwView('Front'), dx = F1.x - F.x, dy = F1.y - F.y, n2 = anvil.drawing.notes(), s2 = anvil.drawing.symbols()[0];
    assert(Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1, 'Front moved ' + dx + ', ' + dy);
    near(n2[0].p[0], ns[0].p[0] + dx, 1e-3, 'note x'); near(n2[0].p[1], ns[0].p[1] + dy, 1e-3, 'note y');
    near(n2[0].leader[0], ns[0].leader[0] + dx, 1e-3, 'leader x');
    near(s2.leader[1], sy.leader[1] + dy, 1e-3, 'datum');
    assert(n2[1].p[0] === ns[1].p[0] && n2[1].p[1] === ns[1].p[1], 'free note stays');
    await UI.undo(); await idle(); await wait(60);
    near(anvil.drawing.notes()[0].p[0], ns[0].p[0], 1e-3, 'undo');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'moved ' + dx.toFixed(2) + ', ' + dy.toFixed(2) + ' in';
  });
  step('rfQ: a double-click on the general tolerances block edits it as lines (Enter starts a line, Ctrl+Enter applies, one undo step); Esc cancels', async function () {
    var errs0 = errors.length;
    await rfQDrawing();
    var S = anvil.drawing.summary().sheet.size, f = W.Drawing.TB_FIELDS.filter(function (x) { return x.multi; })[0], r = W.Drawing.fieldRect(f, S, 'in');
    var cell = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
    sheetMouse('dblclick', cell);
    var ta = D.querySelector('#dw-edit.multi textarea');
    assert(ta && D.activeElement === ta && ta.value.split('\n').length >= 4 && ta.value.indexOf('.XX') >= 0, 'a box of lines: ' + (ta && JSON.stringify(ta.value)));
    ta.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(!D.getElementById('dw-edit'), 'Esc closes');
    var u0 = UI.App.undo.length;
    sheetMouse('dblclick', cell);
    ta = D.querySelector('#dw-edit.multi textarea');
    var ev = new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    assert(!ev.defaultPrevented && D.getElementById('dw-edit'), 'Enter starts a new line, the box stays');
    ta.value = 'UNLESS NOTED\nTOL .XX ±.01\n.XXX ±.005\nBEND ±1°';
    ta.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await wait(60);
    var t = rfQSheetTexts();
    assert(!D.getElementById('dw-edit') && UI.App.undo.length === u0 + 1, 'applied, one undo step');
    ['UNLESS NOTED', 'TOL .XX ±.01', 'BEND ±1°'].forEach(function (x) { assert(t.indexOf(x) >= 0, x + ' in ' + t.join('|')); });
    assert(anvil.drawing.titleBlock()[f.key].split('\n').length === 4, 'four lines kept');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return f.key;
  });
  // --- end rfQ ---
