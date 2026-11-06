  // ---- rfJG (2026-11-06, lane drawgaps): Punch Table from the Annotation tab on a flat pattern with forming tools (the
  // blank's corner preselected, a click on another vertex moves the origin, ✓), its properties PM; the Bend Table's
  // Fixed Face note
  var JG_PART = 'p.name("JGVent").units("in");\np.sheet(0.0598, 0.06, 0.44);\np.sketch("Top").rect(0, -3, 8, 3).end().baseFlange();\n' +
    'p.flange(1.5, [[4, 0.0598, 0], [4, 0.0598, 3]], { position: "inside" });\n' +
    'p.formingTool("dimple", [2, 0.0598, 1.5]);\np.formingTool("dimple", [6, 0.0598, 1.5]);\np.formingTool("louver", [4, 0.0598, 1.5]);';
  function rfJGView(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfJGClick(p) { sheetMouse('mousemove', p); sheetMouse('mousedown', p); sheetMouse('mouseup', p); }
  function rfJGInsertRows() {
    var lis = D.querySelectorAll('#menus > li'), ins = null;
    for (var i = 0; i < lis.length; i++) if (/^Insert/.test(lis[i].textContent)) ins = lis[i];
    ins.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    var rows = Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent.replace(/\s+/g, ' ').trim(); });
    if (UI.closeMenus) UI.closeMenus();
    return rows;
  }
  step('rfJG: Annotation ▸ Punch Table on the vent channel\'s flat: origin at the blank corner, a click on the other corner moves it, ✓ lists two dimples and a louver (A1, A2, B1, PUNCH ID) in SVG / DXF; Properties PM; Bend Table adds Fixed Face', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(JG_PART); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    anvil.drawing.flatView({ x: 5, y: 4 }); await UI.drawing.ready(); await wait(30);
    UI.drawing.fit(); await wait(20);
    var fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
    assert(fv, 'flat view');
    var rows = rfJGInsertRows();
    assert(rows.filter(function (r) { return r.indexOf('Tables ▸ Punch Table…') >= 0; }).length === 1, 'Punch Table once in Insert: ' + rows.filter(function (r) { return /Tables/.test(r); }).join(' | '));
    // select the flat view, then Annotation ▸ Punch Table
    UI.drawing.state.sel = { kind: 'view', id: fv.id };
    ribbonButton('Punch Table').click(); await idle();
    var st = UI.drawing.state;
    assert(st.tool === 'punchtable' && UI.pmTitle() === 'Punch Table' && pmField('Combine same tags'), 'Punch Table PM: ' + st.tool + ' ' + UI.pmTitle());
    var w = rfJGView(fv.id), b = w.flat.bbox;
    assert(st.pending.view === fv.id && st.pending.origin && Math.abs(st.pending.origin.p[0] - b.umin) < 1e-6 && Math.abs(st.pending.origin.p[1] - b.vmin) < 1e-6, 'blank corner preselected: ' + JSON.stringify(st.pending.origin));
    assert(D.querySelectorAll('#dw-overlay circle.dw-hot').length >= 1, 'origin marked');
    // click the upper-left corner instead (a vertex of the outline)
    var c1 = w.toSheet([b.umin, b.vmax]);
    rfJGClick([c1[0] + 0.02, c1[1]]); await idle();
    assert(Math.abs(st.pending.origin.p[1] - b.vmax) < 1e-6 && Math.abs(st.pending.origin.p[0] - b.umin) < 1e-6, 'origin moved: ' + JSON.stringify(st.pending.origin));
    var n0 = UI.App.undo.length;
    await UI.pmOK(); await idle(); await wait(40);
    assert(UI.App.undo.length === n0 + 1, 'one undo step');
    var ht = anvil.drawing.holeTables();
    assert(ht.length === 1 && ht[0].punch && ht[0].rows.length === 3, 'three punches ' + JSON.stringify(ht.map(function (t) { return t.rows.length; })));
    var r0 = ht[0].rows;
    assert(r0.map(function (r) { return r.tag; }).join(',') === 'A1,A2,B1' && /^DIMPLE /.test(r0[0].size) && /^LOUVER /.test(r0[2].size), 'tags / ids ' + JSON.stringify(r0.map(function (r) { return r.tag + ' ' + r.size; })));
    assert(r0.every(function (r) { return r.y < 0; }), 'Y LOC from the top corner is negative: ' + r0.map(function (r) { return r.yText; }).join(','));
    var svg = anvil.drawing.svg(), dxf = anvil.drawing.dxf();
    assert(svg.indexOf('PUNCH ID') >= 0 && dxf.indexOf('PUNCH ID') >= 0 && dxf.indexOf(r0[2].size) >= 0, 'in the outputs');
    // double-click: its properties, titled Punch Table; numeric tags
    var bx = ht[0].box;
    sheetMouse('dblclick', [(bx.x0 + bx.x1) / 2, (bx.y0 + bx.y1) / 2]); await idle();
    assert(UI.pmTitle() === 'Punch Table' && pmField('Tags'), 'properties PM: ' + UI.pmTitle());
    var sel = pmField('Tags'); sel.value = 'numeric'; sel.dispatchEvent(new W.Event('change', { bubbles: true })); await idle();
    await UI.pmOK(); await idle(); await wait(30);
    assert(anvil.drawing.holeTables()[0].rows.map(function (r) { return r.tag; }).join(',') === '1,2,3', 'numeric tags ' + anvil.drawing.holeTables()[0].rows.map(function (r) { return r.tag; }));
    // Bend Table on the same view: a Fixed Face note joins the tags
    UI.drawing.state.sel = { kind: 'view', id: fv.id };
    ribbonButton('Bend Table').click(); await idle(); await UI.drawing.ready(); await wait(30);
    var ff = UI.drawing.state.sheet.annotations.filter(function (a) { return a.type === 'fixedFace' && a.view === fv.id; });
    assert(ff.length === 1 && ff[0].text === 'Fixed Face', 'Fixed Face note: ' + JSON.stringify(ff));
    assert(anvil.drawing.svg().indexOf('Fixed Face') >= 0, 'in the SVG');
    // undo takes the Bend Table (and its note) away again
    await UI.undo(); await idle(); await UI.drawing.ready(); await wait(30);
    anvil.drawing.summary();
    assert(!UI.drawing.state.sheet.annotations.some(function (a) { return a.type === 'fixedFace'; }), 'undone');
    // the API: punchTable on the flat (default origin), refused on a model view
    var other = anvil.drawing.summary().views.filter(function (v) { return v.kind !== 'flat'; })[0];
    if (other) assert(anvil.drawing.punchTable(other.id) == null, 'refused on a model view');
    assert(anvil.drawing.punchTable(fv.id) != null && anvil.drawing.holeTables().length === 2, 'API punch table');
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
