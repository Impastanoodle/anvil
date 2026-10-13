  // ---- rfAN (2026-10-12): Hole Table on a flat pattern, Revision Symbol / Cloud, Weld Symbol
  function rfANView(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfANClick(p) { sheetMouse('mousemove', p); sheetMouse('mousedown', p); sheetMouse('mouseup', p); }
  function rfANInsertRows() {
    var lis = D.querySelectorAll('#menus > li'), ins = null;
    for (var i = 0; i < lis.length; i++) if (/^Insert/.test(lis[i].textContent)) ins = lis[i];
    ins.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    var rows = Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent.replace(/\s+/g, ' ').trim(); });
    if (UI.closeMenus) UI.closeMenus();
    return rows;
  }
  step('rfAN: Hole Table on the inch bracket\'s flat pattern — Annotation ▸ Hole Table, click the blank\'s corner and one Ø.281 hole (all of that size), ✓: tags A1–A4 in flat coordinates, X LOC / Y LOC / SIZE in SVG and DXF; drag it, Combine same tags, Delete', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(P9_INCH); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    anvil.drawing.flatView({ x: 5, y: 4 }); await UI.drawing.ready(); await wait(30);
    UI.drawing.fit(); await wait(20);
    var fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
    assert(fv, 'flat view');
    var ann = UI.RIBBON['Annotation'].map(function (b) { return b.id || (b.stack || []).map(function (q) { return q.id; }).join('+'); });
    assert(ann.indexOf('holeTable') > ann.indexOf('revTable') && ann.some(function (x) { return /weldSymbol\+revisionSymbol\+revisionCloud/.test(x); }), 'Annotation tab: ' + ann.join(','));
    var rows = rfANInsertRows();
    ['Tables ▸ Hole Table…', 'Annotations ▸ Weld Symbol…', 'Annotations ▸ Revision Symbol…', 'Annotations ▸ Revision Cloud'].forEach(function (l) { assert(rows.filter(function (r) { return r.indexOf(l) >= 0; }).length === 1, l + ' once in Insert: ' + rows.join(' | ')); });
    ribbonButton('Hole Table').click(); await idle();
    assert(UI.drawing.state.tool === 'holetable' && UI.pmTitle() === 'Hole Table' && pmField('Select all holes of the same size').checked, 'Hole Table PM');
    var w = rfANView(fv.id), b = w.proj.bounds, c0 = w.toSheet([b.umin, b.vmin]);
    rfANClick([c0[0] + 0.02, c0[1]]); await idle();
    assert(UI.drawing.state.pending.origin && UI.drawing.state.pending.origin.p, 'origin at the vertex ' + JSON.stringify(UI.drawing.state.pending.origin));
    var hole = w.proj.circles.visible.filter(function (c) { return Math.abs(2 * c.r - 0.281) < 1e-6; })[0];
    assert(hole, 'a Ø.281 hole in the flat');
    rfANClick(w.toSheet([hole.c[0] + hole.r, hole.c[1]])); await idle();
    assert(D.querySelectorAll('#dw-overlay circle.dw-hot').length >= 4, 'the four holes highlighted');
    await UI.pmOK(); await idle(); await wait(40);
    var ht = anvil.drawing.holeTables();
    assert(ht.length === 1 && ht[0].rows.length === 4, 'four rows ' + JSON.stringify(ht.map(function (t) { return t.rows.length; })));
    var r0 = ht[0].rows;
    assert(r0.every(function (r) { return r.size === 'Ø.281 THRU ALL' && /^A[1-4]$/.test(r.tag); }), 'tags / sizes ' + JSON.stringify(r0.map(function (r) { return r.tag + ' ' + r.size; })));
    var xs = r0.map(function (r) { return r.x; }).sort(function (p, q) { return p - q; });
    assert(Math.abs(xs[3] - xs[0] - 3) < 1e-6 && xs[0] > 0, 'flat X LOC from the corner: ' + r0.map(function (r) { return r.xText; }).join(','));
    var svg = anvil.drawing.svg(), dxf = anvil.drawing.dxf(), dxf2 = anvil.drawing.dxf({ version: 'R2000' });
    assert(svg.indexOf('X LOC') >= 0 && dxf.indexOf('Y LOC') >= 0 && dxf2.indexOf('A4') >= 0 && dxf.indexOf('%%c.281 THRU ALL') >= 0, 'in the outputs');
    // drag the table 1 in to the left
    var bx = ht[0].box, g = [(bx.x0 + bx.x1) / 2, (bx.y0 + bx.y1) / 2];
    sheetMouse('mousemove', g); sheetMouse('mousedown', g);
    for (var i = 1; i <= 4; i++) sheetMouse('mousemove', [g[0] - i / 4, g[1]]);
    sheetMouse('mouseup', [g[0] - 1, g[1]]); await idle(); await wait(30);
    var ht2 = anvil.drawing.holeTables()[0];
    assert(Math.abs(ht2.box.x0 - (bx.x0 - 1)) < 0.05 && ht2.box.x0 < bx.x0 - 0.9 && UI.drawing.state.sel && UI.drawing.state.sel.kind === 'holetable', 'dragged ' + ht2.box.x0 + ' from ' + bx.x0);
    // double-click: its properties; Combine same tags
    sheetMouse('dblclick', [(ht2.box.x0 + ht2.box.x1) / 2, (ht2.box.y0 + ht2.box.y1) / 2]); await idle();
    assert(UI.pmTitle() === 'Hole Table' && pmField('Combine same tags'), 'properties PM');
    pmField('Combine same tags').click(); await idle();
    await UI.pmOK(); await idle(); await wait(30);
    assert(anvil.drawing.holeTables()[0].rows.every(function (r) { return r.tag === 'A'; }), 'combined tags');
    // saved with the drawing, Delete removes it
    assert(anvil.drawing.doc().holeTables.length === 1 && anvil.drawing.doc().holeTables[0].combineTags, 'in the document');
    rfANClick([(ht2.box.x0 + ht2.box.x1) / 2, (ht2.box.y0 + ht2.box.y1) / 2]); await idle();
    key('Delete'); await idle(); await wait(30);
    assert(!anvil.drawing.holeTables().length, 'deleted');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return r0.map(function (r) { return r.tag + ' ' + r.xText + ',' + r.yText; }).join(' | ');
  });
  step('rfAN: Revision Symbol (leader, the latest revision, follows its row), Weld Symbol (PM, arrow then reference line, double-click edits: all around) and Revision Cloud (rectangle by two corners, polygon) from the Annotation tab', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(RFAL_PLATE); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    UI.drawing.fit(); await wait(20);
    if (!dwView('Front')) { anvil.drawing.standard3View(); await idle(); }
    UI.drawing.fit(); await wait(20);
    anvil.drawing.addRevision({ description: 'RELEASED' }); anvil.drawing.addRevision({ description: 'HOLE MOVED' }); await idle();
    var F = dwView('Front'), w = rfANView(F.id), bx = w.box;
    ribbonButton('Revision Symbol').click(); await idle();
    assert(UI.drawing.state.tool === 'rfansym' && UI.pmTitle() === 'Revision Symbol', 'Revision Symbol PM');
    rfANClick([bx.x1 - 2, bx.y1 - 2]); rfANClick([bx.x1 + 12, bx.y1 + 10]); await idle();
    var sy = anvil.drawing.symbols().filter(function (s) { return s.type === 'revision'; });
    assert(sy.length === 1 && sy[0].text === 'REVISION B', 'placed: ' + JSON.stringify(sy));
    key('Escape'); await idle();
    if (UI.hasPM()) UI.pmCancel();
    anvil.drawing.editRevision(1, { rev: 'C' }); await idle();
    assert(anvil.drawing.symbols().filter(function (s) { return s.type === 'revision'; })[0].text === 'REVISION C', 'follows its row');
    // weld
    ribbonButton('Weld Symbol').click(); await idle();
    assert(UI.drawing.state.tool === 'rfansym' && UI.pmTitle() === 'Weld Symbol', 'Weld Symbol PM');
    setInput(pmField('Size (left)'), '6'); await idle();
    setInput(pmField('Length-pitch (right)'), '50-150'); await idle();
    rfANClick([bx.x0 + 2, bx.y0 + 2]); rfANClick([bx.x0 + 12, bx.y0 - 15]); await idle();
    var wl = anvil.drawing.symbols().filter(function (s) { return s.type === 'weld'; });
    assert(wl.length === 1 && wl[0].text === 'WELD | ARROW SIDE FILLET 6 50-150', 'weld: ' + JSON.stringify(wl));
    key('Escape'); await idle();
    if (UI.hasPM()) UI.pmCancel();
    var wb = wl[0].box;
    sheetMouse('dblclick', [(wb[0] + wb[2]) / 2, wb[3] - 0.5]); await idle();   // (summary boxes: [x0, y0, x1, y1])
    assert(UI.pmTitle() === 'Weld Symbol' && pmField('Weld all around'), 'double-click opens the Weld Symbol PM: ' + UI.pmTitle());
    pmField('Weld all around').click(); await idle();
    await UI.pmOK(); await idle();
    assert(/ALL AROUND/.test(anvil.drawing.symbols().filter(function (s) { return s.type === 'weld'; })[0].text), 'all around');
    // cloud: a rectangle by two corners, then a polygon
    ribbonButton('Revision Cloud').click(); await idle();
    assert(UI.drawing.state.tool === 'rfancloud' && UI.pmTitle() === 'Revision Cloud', 'Revision Cloud PM');
    rfANClick([bx.x0 - 5, bx.y0 - 5]); rfANClick([bx.x0 + 25, bx.y0 + 15]); await idle();
    var cl = anvil.drawing.symbols().filter(function (s) { return s.type === 'revCloud'; });
    assert(cl.length === 1 && /RECTANGLE/.test(cl[0].text), 'rectangle cloud ' + JSON.stringify(cl));
    setInput(pmField('Shape'), 'polygon'); await idle();
    var q0 = [bx.x1 - 20, bx.y0 - 10];
    rfANClick(q0); rfANClick([bx.x1, bx.y0 - 10]); rfANClick([bx.x1 - 10, bx.y0 + 5]); rfANClick([q0[0] + 0.3, q0[1]]); await idle();
    cl = anvil.drawing.symbols().filter(function (s) { return s.type === 'revCloud'; });
    assert(cl.length === 2 && /POLYGON/.test(cl[1].text), 'polygon cloud ' + JSON.stringify(cl.map(function (c) { return c.text; })));
    key('Escape'); await idle();
    if (UI.hasPM()) UI.pmCancel();
    var arcs = (anvil.drawing.svg().match(/<path class="thin" d="M[^"]*A/g) || []).length;
    assert(arcs > 20, 'cloud scallops in the SVG: ' + arcs);
    var d2 = anvil.drawing.dxf({ version: 'R2000' });
    assert(d2.indexOf('50-150') >= 0 && /\nARC\n/.test(d2), 'DXF');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'revision C, weld all around, ' + cl.length + ' clouds';
  });
  // --- end rfAN ---
