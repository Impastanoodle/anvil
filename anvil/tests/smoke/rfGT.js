  // ---- rfGT (2026-11-02): Hole Wizard callouts as SolidWorks 2022 writes them (reference 2, section 5), Bend Table in
  // Insert ▸ Tables and the ribbon, Autodimension on a drawing view, View ▸ Display ▸ Tangent Edges
  function rfGTTexts() { return UI.drawing.state.sheet.prims.filter(function (q) { return q.k === 'text' && q.layer === 'ANNOTATIONS'; }).map(function (q) { return q.text; }); }
  function rfGTCallout(sm, re) { return sm.annotations.filter(function (a) { return a.type === 'holeCallout' && re.test(a.text); })[0]; }
  async function rfGTBlock() {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, -4, 6, 4).end().extrude(1);\n' +
      'p.holeWizard({ face: "Top", offset: 1, points: [[1, -1]], standard: "ANSI Inch", type: "hole", size: "1/4", fit: "loose", end: "blind", depth: 0.75 });\n' +
      'p.holeWizard({ face: "Top", offset: 1, points: [[3, -1], [3, -3]], standard: "ANSI Inch", type: "tap", size: "1/4-20 UNC", end: "blind", depth: 0.75, threadDepth: 0.5 });\n' +
      'p.holeWizard({ face: "Top", offset: 1, points: [[5, -1]], standard: "ANSI Inch", type: "cbore", size: "1/4", fit: "normal", end: "through" });'); await idle();
    assert(Object.keys(UI.App.build.errors || {}).length === 0, 'build errors ' + JSON.stringify(UI.App.build.errors));
    assert(anvil.drawing.make(), 'drawing');
    await UI.drawing.ready();
    var s = anvil.drawing.summary(), top = s.views.filter(function (v) { return v.orient === 'Top'; })[0];
    assert(top, 'Top view');
    anvil.drawing.holeCallout(top.id, { c: [1, -1], r: 0.140625 });
    anvil.drawing.holeCallout(top.id, { c: [3, -1], r: 0.1005 });
    anvil.drawing.holeCallout(top.id, { c: [5, -1], r: 0.133 });
    await UI.drawing.ready();
    return top;
  }
  step('rfGT: Hole Wizard callouts — blind Ø .281 ↧ .750; drill over thread 2X Ø .201 ↧ .750 / 1/4-20 UNC ↧ .500; drill over counterbore Ø .266 THRU ALL / ⌴ Ø .438 ↧ .250; at two places the digits SolidWorks measured (Ø .28 ↧ .75, Ø .20 ↧ .75 over 1/4-20 UNC ↧ .50, ⌴ Ø .44 ↧ .25 over Ø .27 THRU ALL); a callout\'s own precision wins; Hole Table the same text', async function () {
    var errs0 = errors.length, top = await rfGTBlock(), sm = anvil.drawing.summary();
    var t3 = sm.annotations.filter(function (a) { return a.type === 'holeCallout'; }).map(function (a) { return a.text; });
    assert(t3.indexOf('Ø .281 ↧ .750') >= 0, 'blind: ' + t3.join(' | '));
    assert(t3.indexOf('2X Ø .201 ↧ .750 1/4-20 UNC ↧ .500') >= 0, 'tapped: ' + t3.join(' | '));
    assert(t3.indexOf('Ø .266 THRU ALL ⌴ Ø .438 ↧ .250') >= 0, 'counterbore: ' + t3.join(' | '));
    var lines = rfGTTexts();
    ['2X Ø .201 ↧ .750', '1/4-20 UNC ↧ .500', '⌴ Ø .438 ↧ .250', 'Ø .266 THRU ALL'].forEach(function (x) { assert(lines.indexOf(x) >= 0, 'sheet line ' + x + ': ' + lines.join(' | ')); });
    assert(lines.indexOf('2X Ø .201 ↧ .750') < lines.indexOf('1/4-20 UNC ↧ .500') && lines.indexOf('Ø .266 THRU ALL') < lines.indexOf('⌴ Ø .438 ↧ .250'), 'line order ' + lines.join(' | '));
    anvil.drawing.options({ dimPrec: 2 }); await UI.drawing.ready();
    sm = anvil.drawing.summary();
    var t2 = sm.annotations.filter(function (a) { return a.type === 'holeCallout'; }).map(function (a) { return a.text; });
    assert(t2.indexOf('Ø .28 ↧ .75') >= 0 && t2.indexOf('2X Ø .20 ↧ .75 1/4-20 UNC ↧ .50') >= 0 && t2.indexOf('Ø .27 THRU ALL ⌴ Ø .44 ↧ .25') >= 0, 'document precision 2: ' + t2.join(' | '));
    var dxf = anvil.drawing.dxf({ version: 'R2000' });
    assert(dxf.indexOf('%%c .28') >= 0, 'DXF keeps the space after the diameter sign');
    anvil.drawing.options({ dimPrec: '' }); await UI.drawing.ready();
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return t2.join(' | ');
  });
  step('rfGT: Insert ▸ Tables ▸ Bend Table — with no flat view it says so; on the flat view it turns bend notes into tags and the table, one undo step; the ribbon has Bend Table', async function () {
    var errs0 = errors.length, T = 0.0598;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in"); p.sheet(' + T + ', 0.03, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange(' + T + ');\np.flange(1, [[6, ' + T + ', 2]]);'); await idle();
    assert(Object.keys(UI.App.build.errors || {}).length === 0, 'build errors ' + JSON.stringify(UI.App.build.errors));
    assert(anvil.drawing.make(), 'drawing');
    await UI.drawing.ready();
    assert(anvil.drawing.bendTable() === false, 'no flat view: no table');
    await anvil.drawing.flatView({ x: 200, y: 120 }); await UI.drawing.ready();
    dwTab('Annotation');
    assert(ribbonButton('Bend Table'), 'ribbon Bend Table');
    var flat = function () { return anvil.drawing.doc().views.filter(function (v) { return v.kind === 'flat'; })[0]; };
    assert(flat().bendNotes !== 'table', 'starts with notes');
    dwMenu('Tables ▸ Bend Table');
    await UI.drawing.ready();
    assert(flat().bendNotes === 'table', 'flat view table: ' + flat().bendNotes);
    var texts = UI.drawing.state.sheet.prims.filter(function (q) { return q.k === 'text'; }).map(function (q) { return q.text; });
    assert(texts.indexOf('A') >= 0, 'tag A on the sheet: ' + texts.join(' | '));
    await UI.undo(); await UI.drawing.ready();
    assert(flat().bendNotes !== 'table', 'undo');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'ok';
  });
  async function rfGTPlate() {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).circle(1, 1, 0.125).circle(3, 0.5, 0.125).end().extrude(0.25);'); await idle();
    assert(Object.keys(UI.App.build.errors || {}).length === 0, 'build errors ' + JSON.stringify(UI.App.build.errors));
    assert(anvil.drawing.make(), 'drawing');
    await UI.drawing.ready();
    return anvil.drawing.summary().views.filter(function (v) { return v.orient === 'Front'; })[0];
  }
  function rfGTSelect(label, val) { var el = pmField(label); assert(el && el.tagName === 'SELECT', 'field ' + label); el.value = val; el.dispatchEvent(new W.Event('change', { bubbles: true })); }
  function rfGTClickView(v) {
    var b = UI.drawing.state.sheet.views.filter(function (q) { return q.view.id === v.id; })[0].box, p = [(b.x0 + b.x1) / 2, b.y0 + (b.y1 - b.y0) * 0.1];
    sheetMouse('mousedown', p); sheetMouse('mouseup', p);
  }
  step('rfGT: Tools ▸ Dimensions ▸ Autodimension — click the Front view of a plate, Ordinate both ways reads 0, 1.000, 3.000, 4.000 and 0, .500, 1.000, 2.000; Chain 1.000, 2.000, 1.000; default Baseline; one undo step; no dangling dimension', async function () {
var errs0 = errors.length, front = await rfGTPlate(), dims0 = (await UI.drawing.ready(), anvil.drawing.summary().dims.length);   // (the plate's model items)
    dwMenu('Dimensions ▸ Autodimension');
    assert(UI.drawing.state.tool === 'autodim', 'tool on');
    rfGTClickView(front);
    assert(UI.drawing.state.pending.view === front.id, 'view picked: ' + UI.drawing.state.pending.view);
    rfGTSelect('Scheme', 'ordinate');
    var sel = Array.prototype.filter.call(D.querySelectorAll('#pm select'), function (x) { return Array.prototype.some.call(x.options, function (o) { return o.value === 'chain'; }); });
    assert(sel.length === 2, 'two Scheme boxes');
    sel[1].value = 'ordinate'; sel[1].dispatchEvent(new W.Event('change', { bubbles: true }));
    UI.pmOK(); await UI.drawing.ready();
    var dims = anvil.drawing.summary().dims;
    assert(dims.indexOf('0, 1.000, 3.000, 4.000') >= 0 && dims.indexOf('0, .500, 1.000, 2.000') >= 0, 'ordinates: ' + dims.join(' | '));
    assert(!anvil.drawing.doc().views.some(function (v) { return (v.dims || []).some(function (d) { return d.dangling; }); }), 'attached');
    await UI.undo(); await UI.drawing.ready();
    anvil.drawing.summary();   // (the first read after an undo settles the swapped model)
    var dims1 = anvil.drawing.summary().dims;
    assert(dims1.length === dims0, 'undo: ' + dims0 + ' -> ' + dims1.join(' | '));
    var w = UI.drawing.state.sheet.views.filter(function (q) { return q.view.id === front.id; })[0], doc0 = JSON.parse(JSON.stringify(anvil.drawing.doc()));
    var n = W.Drawing.autodimension(doc0, front.id, w.proj, { scale: w.scale, units: 'in', h: { scheme: 'chain', origin: 'left', place: 'below' }, v: { scheme: 'baseline', origin: 'top', place: 'left' } });
    var vw = doc0.views.filter(function (q) { return q.id === front.id; })[0];
    assert(n === 6, 'chain 3 + baseline 3: ' + n + ' ' + JSON.stringify(vw.dims.map(function (d) { return d.kind; })));
    var ch = vw.dims.filter(function (d) { return d.kind === 'h'; }).map(function (d) { return d.value; });
    assert(ch.length === 3 && Math.abs(ch[0] - 1) < 1e-6 && Math.abs(ch[1] - 2) < 1e-6 && Math.abs(ch[2] - 1) < 1e-6, 'chain ' + ch.join());
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return dims.join(' | ');
  });
  step('rfGT: View ▸ Display ▸ Tangent Edges — greyed with no view selected, sets the selected view, the rows show which', async function () {
    var errs0 = errors.length, front = await rfGTPlate();
    UI.drawing.state.sel = null;
    assert(/disabled|off|grey/.test(menuRows('Tangent Edges Visible')[0].row.className), 'greyed: ' + menuRows('Tangent Edges Visible')[0].row.className);
    if (UI.closeMenus) UI.closeMenus();
    UI.drawing.state.sel = { kind: 'view', id: front.id };
    dwMenu('Display ▸ Tangent Edges Visible');
    await UI.drawing.ready();
    assert(anvil.drawing.doc().views.filter(function (v) { return v.id === front.id; })[0].tangent === 'visible', 'tangent visible');
    assert(menuRows('Tangent Edges Visible')[0].chk, 'checked');
    if (UI.closeMenus) UI.closeMenus();
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'ok';
  });
