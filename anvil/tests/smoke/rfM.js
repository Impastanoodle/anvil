  // --- rfM: Revision Table, shop symbols, notes with leaders and $PRP links, title block blocks ---
  function rfMMid(b) { return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  function rfMMenu(re) {
    var mi = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return re.test(m.textContent); })[0];
    assert(mi, 'menu item ' + re + ' (have: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent; }).join(' | ') + ')');
    mi.click();
  }
  function rfMClick(p) { sheetMouse('mousedown', p); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, button: 0 })); }
  function rfMCheck(label, on) { var c = pmField(label); assert(c, 'PM field ' + label); c.checked = on; c.dispatchEvent(new W.Event('change', { bubbles: true })); }
  function rfMTexts(layer) { return Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="' + layer + '"] text'), function (t) { return t.textContent; }); }
  async function rfMDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run('p.name("Plate").units("in");\np.sketch("Front").rect(0, 0, 6, 3).extrude(0.25);'); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    await UI.drawing.ready();
    Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === 'Annotation'; })[0].click();
  }
  step('rfM: Revision Table — the ribbon inserts it top-right, Add Revision (ribbon, right-click) adds A then B with the title block REV following, a double-click edits a row; Delete removes it', async function () {
    var errs0 = errors.length;
    await rfMDrawing();
    ribbonButton('Revision Table').click(); await wait(30);
    var rv = anvil.drawing.summary().revisions, S = anvil.drawing.summary().sheet.size;
    assert(rv && rv.rows.length === 0 && Math.abs(rv.box[2] - (S[0] - 10 / 25.4)) < 1e-3 && Math.abs(rv.box[3] - (S[1] - 10 / 25.4)) < 1e-3, 'inserted top-right: ' + JSON.stringify(rv));
    assert(D.querySelector('#drawing-tree .dw-revtable'), 'tree row');
    ribbonButton('Revision Table').click();
    assert(UI.hasPM() && D.querySelector('#pm .pm-head span').textContent === 'Add Revision' && pmField('REV').value === 'A', 'Add Revision PM, REV A');
    setInput(pmField('DESCRIPTION'), 'INITIAL RELEASE');
    await UI.pmOK(); await wait(30);
    var s = anvil.drawing.summary();
    assert(s.revisions.latest === 'A' && s.titleBlock.rev === 'A' && rfMTexts('REVISIONS').indexOf('INITIAL RELEASE') >= 0, 'A on the sheet: ' + JSON.stringify(s.revisions));
    sheetMouse('contextmenu', rfMMid(s.revisions.box));
    rfMMenu(/^\s*Add Revision\s*$/);
    assert(pmField('REV').value === 'B', 'next is B');
    setInput(pmField('DESCRIPTION'), 'HOLE MOVED');
    await UI.pmOK(); await wait(30);
    s = anvil.drawing.summary();
    assert(s.revisions.rows.map(function (r) { return r.rev; }).join() === 'A,B' && s.titleBlock.rev === 'B', 'A, B: ' + JSON.stringify(s.revisions.rows));
    // the first revision row: below the title and header rows
    var b = s.revisions.box, rowH = 6 / 25.4;
    sheetMouse('dblclick', [(b[0] + b[2]) / 2, b[3] - 2.5 * rowH]);
    assert(UI.hasPM() && D.querySelector('#pm .pm-head span').textContent === 'Revision A', 'row PM ' + (UI.hasPM() && D.querySelector('#pm .pm-head span').textContent));
    setInput(pmField('APPROVED'), 'LH');
    await UI.pmOK(); await wait(30);
    assert(anvil.drawing.summary().revisions.rows[0].approved === 'LH' && rfMTexts('REVISIONS').indexOf('LH') >= 0, 'approved');
    UI.undo(); await wait(30);
    assert(anvil.drawing.summary().revisions.rows[0].approved === '', 'undo');
    rfMClick(rfMMid(anvil.drawing.summary().revisions.box));
    key('Delete'); await wait(30);
    assert(!anvil.drawing.summary().revisions && !D.querySelector('#drawing-sheet g[data-layer="REVISIONS"]'), 'deleted');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'A, B';
  });
  step('rfM: Surface Finish, Datum Feature and Geometric Tolerance tools place symbols with leaders (arrow point, then the symbol); a double-click edits, a drag moves, Delete removes; SVG / DXF / PDF carry them', async function () {
    var errs0 = errors.length;
    await rfMDrawing();
    var F = dwView('Front'), x = F.box[0], y = F.box[1];
    ribbonButton('Surface Finish').click();
    assert(UI.hasPM() && D.querySelector('#pm .pm-head span').textContent === 'Surface Finish' && UI.drawing.state.tool === 'symbol', 'Surface Finish PM');
    setInput(pmField('Maximum roughness'), '63');
    rfMClick([x + 1, y]); rfMClick([x + 1.4, y - 0.8]);
    await UI.pmOK(); await wait(30);
    ribbonButton('Datum Feature').click();
    rfMClick([x + 3, y]); rfMClick([x + 3, y - 0.8]);
    rfMClick([x + 4, y]); rfMClick([x + 4, y - 0.8]);
    await UI.pmOK(); await wait(30);
    ribbonButton('Geometric Tolerance').click();
    setInput(pmField('Tolerance'), '.005'); setInput(pmField('Primary'), 'A'); setInput(pmField('Secondary'), 'B');
    rfMClick([x + 5, y]); rfMClick([x + 5.5, y - 1]);
    await UI.pmOK(); await wait(30);
    var sy = anvil.drawing.symbols();
    assert(sy.map(function (s) { return s.text; }).join(' ; ') === 'SURFACE FINISH 63 (MACHINED) ; DATUM A ; DATUM B ; POSITION Ø.005 | A | B', sy.map(function (s) { return s.text; }).join(' ; '));
    assert(sy.every(function (s) { return s.leader; }) && Math.abs(sy[0].leader[0] - (x + 1)) < 0.01, 'leaders at the first clicks ' + JSON.stringify(sy[0].leader));
    assert(rfMTexts('SYMBOLS').join('|') === '63|A|B|Ø.005|A|B', rfMTexts('SYMBOLS').join('|'));
    assert(D.querySelectorAll('#drawing-tree .dw-symbol').length === 4, 'tree rows');
    // double-click the frame: Flatness, no diameter, no datums
    sheetMouse('dblclick', rfMMid(sy[3].box));
    assert(UI.hasPM() && D.querySelector('#pm .pm-head span').textContent === 'Geometric Tolerance', 'GTol PM');
    setInput(pmField('Characteristic'), 'flatness'); rfMCheck('Diameter', false); setInput(pmField('Primary'), ''); setInput(pmField('Secondary'), '');
    await UI.pmOK(); await wait(30);
    sy = anvil.drawing.symbols();
    assert(sy[3].text === 'FLATNESS .005', sy[3].text);
    // drag the datum B frame right, then Delete it
    var m0 = rfMMid(sy[2].box);
    sheetMouse('mousedown', m0); W.dispatchEvent(new W.MouseEvent('mousemove', Object.assign({ bubbles: true, buttons: 1 }, paperToClient([m0[0] + 0.5, m0[1]])))); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, button: 0 }));
    await wait(30);
    var sy2 = anvil.drawing.symbols();
    assert(Math.abs(sy2[2].p[0] - sy[2].p[0] - 0.5) < 0.05 && sy2[2].p[1] === sy[2].p[1], 'dragged ' + sy[2].p + ' -> ' + sy2[2].p);
    key('Delete'); await wait(30);
    assert(anvil.drawing.symbols().length === 3, 'deleted');
    var dxf = anvil.drawing.dxf({ version: 'R2000' }), pdf = anvil.drawing.pdf();
    assert(/\n8\nSYMBOLS\n/.test(dxf) && dxf.indexOf('\n1\n63\n') >= 0 && pdf.indexOf('(63) Tj') >= 0, 'DXF / PDF');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return sy.length + ' symbols';
  });
  step('rfM: File ▸ Properties fills DRAWN / COMPANY in the title block; the general tolerances block reads .XX ±.01 / .XXX ±.005 / ANGLES ±1°; a note links $PRP:"DrawnBy" and its right-click menu adds and removes a leader', async function () {
    var errs0 = errors.length;
    await rfMDrawing();
    var t = rfMTexts('SHEET');
    ['UNLESS OTHERWISE SPECIFIED', 'DRAWN', 'CHECKED', 'COMPANY', '.XX ±.01', '.XXX ±.005', 'ANGLES ±1°'].forEach(function (x) { assert(t.indexOf(x) >= 0, x + ' in ' + t.join('|')); });
    var rows = menuRows('Properties…');
    assert(rows.length && rows[0].menu === 'File', 'File ▸ Properties');
    rows[0].row.click();
    assert(UI.hasPM() && D.querySelector('#pm .pm-head span').textContent === 'Drawing Properties', 'PM');
    setInput(pmField('Drawn by'), 'LH'); setInput(pmField('Company name'), 'Acme Sheet Metal');
    await UI.pmOK(); await wait(30);
    var tb = anvil.drawing.titleBlock();
    assert(tb.drawnBy === 'LH' && tb.company === 'ACME SHEET METAL' && rfMTexts('SHEET').indexOf('ACME SHEET METAL') >= 0, JSON.stringify(tb));
    anvil.drawing.note({ p: [2, 2], text: 'DRAWN BY $PRP:"DrawnBy"' }); await wait(30);
    var n = anvil.drawing.notes()[0];
    assert(n.text === 'DRAWN BY LH' && n.raw === 'DRAWN BY $PRP:"DrawnBy"' && !n.leader, 'note ' + JSON.stringify(n));
    sheetMouse('contextmenu', rfMMid(n.box));
    rfMMenu(/Add Leader/); await wait(30);
    n = anvil.drawing.notes()[0];
    assert(n.leader && D.querySelectorAll('#drawing-sheet g[data-layer="NOTES"] path').length >= 1, 'leader drawn ' + JSON.stringify(n.leader));
    sheetMouse('contextmenu', rfMMid(n.box));
    rfMMenu(/Remove Leader/); await wait(30);
    assert(!anvil.drawing.notes()[0].leader, 'leader removed');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return tb.drawnBy + ' / ' + tb.company;
  });
  // --- end rfM ---
