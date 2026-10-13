  // ---- rfAG (2026-10-12): magnetic lines for balloons, Solid area fill as a real fill, Broken-out / Area Hatch tools by name
  function rfAGBalloons() { return UI.drawing.state.sheet.balloons.slice(); }
  function rfAGDrag(a, b) {
    sheetMouse('mousemove', a); sheetMouse('mousedown', a);
    for (var i = 1; i <= 4; i++) sheetMouse('mousemove', [a[0] + (b[0] - a[0]) * i / 4, a[1] + (b[1] - a[1]) * i / 4]);
    sheetMouse('mouseup', b);
  }
  function rfAGNear(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-6); }
  step('rfAG: Magnetic Line — Annotation ▸ Magnetic Line draws a line by two clicks (not printed); balloons dragged near it snap on and spread evenly; dragging the line takes them; Delete leaves them in place; Auto Balloon Layout Top puts them on a magnetic line', async function () {
    var errs0 = errors.length;
    var ex = W.AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0];
    var r = await UI.openExample(ex); await idle();
    assert(!r.error && UI.isAssembly(), 'assembly open');
    anvil.drawing.make({ fresh: true });
    await UI.drawing.ready(); await idle();
    var iso = dwView('Isometric');
    assert(iso, 'isometric view');
    anvil.drawing.autoBalloon(iso.id); await idle();
    var B0 = rfAGBalloons();
    assert(B0.length === 3, 'three balloons ' + B0.length);
    // the ribbon (after Auto Balloon) and Insert ▸ Annotations ▸ Magnetic Line
    var ann = UI.RIBBON['Annotation'].map(function (b) { return b.id; });
    assert(ann.indexOf('magLine') === ann.indexOf('autoBalloon') + 1, 'Magnetic Line after Auto Balloon: ' + ann.join(','));
    var mr = menuRows('Magnetic Line');
    assert(mr.length === 1 && mr[0].menu === 'Insert', 'Insert menu entry ' + JSON.stringify(mr.map(function (x) { return [x.menu, x.row.textContent]; })));
    if (UI.closeMenus) UI.closeMenus();
    ribbonButton('Magnetic Line').click();
    assert(UI.drawing.state.tool === 'magline', 'tool by name');
    var w = rfADView(iso.id), y = w.box.y1 + 24, a = [w.box.x0 - 10, y], b = [w.box.x1 + 10, y + 1];   // (squared to horizontal)
    rfADClick(a);
    sheetMouse('mousemove', [b[0] - 20, b[1]]);
    var pv = UI.drawing.state.preview;
    assert(pv && pv.kind === 'magline' && rfAGNear(pv.b[1], pv.a[1]) && rfAGNear(pv.a[1], y, 1), 'live preview, horizontal ' + JSON.stringify(pv));
    rfADClick(b); await idle(); await wait(40);
    var ml = anvil.drawing.magLines();
    assert(ml.length === 1 && ml[0].view === iso.id && rfAGNear(ml[0].a[1], y, 1) && rfAGNear(ml[0].b[1], ml[0].a[1]) && !UI.drawing.state.tool, 'line ' + JSON.stringify(ml));
    y = ml[0].a[1];
    assert(D.querySelector('#dw-overlay .dw-mag'), 'drawn on the overlay');
    assert(anvil.drawing.svg().indexOf('dw-mag') < 0 && anvil.drawing.dxf({ version: 'R2000' }).indexOf('ML1') < 0, 'not printed');
    // drag the three balloons near the line (2 mm off): each snaps on; they spread evenly, in leader order
    var A = ml[0].a, Bp = ml[0].b, L = Bp[0] - A[0];
    for (var i = 0; i < 3; i++) {
      var bb = rfAGBalloons().filter(function (q) { return q.mag == null; })[0];
      rfAGDrag(bb.c, [A[0] + L * (0.2 + 0.3 * i), y - 2]); await idle(); await wait(30);
    }
    var B1 = rfAGBalloons().sort(function (p, q) { return p.c[0] - q.c[0]; });
    assert(B1.every(function (q) { return q.mag === 'ML1' && rfAGNear(q.c[1], y); }), 'on the line ' + JSON.stringify(B1.map(function (q) { return [q.mag, q.c]; })));
    B1.forEach(function (q, j) { assert(rfAGNear(q.c[0], A[0] + L * (j + 0.5) / 3, 1e-6), 'even spacing ' + j + ' ' + q.c[0]); });
    assert(anvil.drawing.magLines()[0].balloons.length === 3, 'listed on the line');
    // drag the line (near its left end, clear of the balloons) 8 mm down: the balloons follow
    var grab = [A[0] + L * 0.02, y];
    rfAGDrag(grab, [grab[0], grab[1] - 8]); await idle(); await wait(40);
    var B2 = rfAGBalloons().sort(function (p, q) { return p.c[0] - q.c[0]; });
    var ml3 = anvil.drawing.magLines()[0], dy = ml3.a[1] - y, dx = ml3.a[0] - A[0];
    assert(rfAGNear(dy, -8, 1) && rfAGNear(dx, 0, 1), 'line dragged ' + dx + ', ' + dy);
    B2.forEach(function (q, j) { assert(rfAGNear(q.c[1], ml3.a[1], 1e-6) && rfAGNear(q.c[0], B1[j].c[0] + dx, 1e-6), 'moved with the line ' + q.c); });
    y = ml3.a[1]; A = ml3.a;
    assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'magline', 'line selected');
    // a balloon dragged well away comes off it
    rfAGDrag(B2[0].c, [B2[0].c[0] - 30, B2[0].c[1] + 30]); await idle(); await wait(30);
    assert(rfAGBalloons().filter(function (q) { return q.mag === 'ML1'; }).length === 2, 'one off the line');
    // saved with the drawing
    var dv = anvil.drawing.doc().views.filter(function (v) { return v.id === iso.id; })[0];
    assert(dv.magLines.length === 1 && dv.balloons.filter(function (q) { return q.mag === 'ML1'; }).length === 2, 'in the document');
    // Delete: the line goes, the balloons stay where they were
    var at = rfAGBalloons().map(function (q) { return q.c.slice(); });
    rfADClick([A[0] + L * 0.02, y]); await idle();
    assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'magline', 'line picked');
    key('Delete'); await idle(); await wait(40);
    assert(!anvil.drawing.magLines().length, 'deleted');
    rfAGBalloons().forEach(function (q, j) { assert(rfAGNear(q.c[0], at[j][0], 1e-6) && rfAGNear(q.c[1], at[j][1], 1e-6), 'balloon ' + j + ' stays'); });
    // Auto Balloon PM: Layout Top, Insert magnetic line(s)
    UI.drawingInternal.cmdAutoBalloon(); await idle();
    assert(UI.pmTitle() === 'Auto Balloon' && pmField('Layout'), 'Auto Balloon PM');
    setInput(pmField('View'), String(iso.id)); setInput(pmField('Layout'), 'top'); await idle();
    var mg = pmField('Insert magnetic line');
    assert(mg && mg.checked, 'Insert magnetic line(s) ticked');
    await UI.pmOK(); await idle(); await wait(60);
    var ml2 = anvil.drawing.magLines(), w2 = rfADView(iso.id);
    assert(ml2.length === 1 && ml2[0].side === 'top' && ml2[0].balloons.length === 3 && rfAGNear(ml2[0].a[1], w2.box.y1 + 14), 'Auto Balloon line on top ' + JSON.stringify(ml2));
    assert(rfAGBalloons().every(function (q) { return rfAGNear(q.c[1], w2.box.y1 + 14); }), 'balloons on it');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return '3 balloons on ML1, then on the Auto Balloon line';
  });
  step('rfAG: Solid area fill — a section region set to Solid is one filled path on the sheet (SVG fill, R2000 DXF HATCH that dxf-check reads, R12 lines); the Broken-out Section and Area Hatch tools run by their own names', async function () {
    var errs0 = errors.length;
    await anvil.run(RFAD_PLATE);
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    await UI.drawing.ready();
    var F = dwView('Front');
    anvil.drawing.sectionView(F.id, { axis: 'h', at: 25, sign: 1 }); await UI.drawing.ready(); await idle();
    var S = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'section'; })[0];
    assert(S, 'section view');
    var mid = anvil.drawing.hatchRegions(S.id).filter(function (g) { return Math.abs(g.p[0] - 50) < 1e-6; })[0];
    assert(anvil.drawing.areaHatch(S.id, mid.p, { pattern: 'SOLID' }), 'solid set');
    await idle();
    var fills = D.querySelectorAll('#drawing-sheet path.hatch-fill');
    assert(fills.length === 1 && fills[0].getAttribute('fill-rule') === 'evenodd', 'one filled path on screen ' + fills.length);
    var dxf = anvil.drawing.dxf({ version: 'R2000' }), ck = W.DxfCheck ? W.DxfCheck.check(dxf, { layers: [] }) : null;
    assert(/\n0\nHATCH\n/.test(dxf) && /\nAcDbHatch\n/.test(dxf), 'HATCH entity');
    if (ck) assert(ck.ok && ck.hatches.length === 1 && ck.hatches[0].solid, 'dxf-check ' + JSON.stringify(ck.errors.slice(0, 3)));
    assert(anvil.drawing.dxf({ version: 'R12' }).indexOf('\nHATCH\n') < 0, 'R12 has no HATCH');
    // the tools by name
    ribbonButton('Broken-out Section').click();
    assert(UI.drawing.state.tool === 'bko' && UI.pmTitle() === 'Broken-out Section', 'Broken-out tool');
    UI.pmCancel(); await idle();
    assert(!UI.drawing.state.tool, 'closed');
    UI.drawingInternal.cmdAreaHatchTool();
    assert(UI.drawing.state.tool === 'ahatch', 'Area Hatch tool');
    rfADClick(rfADAt(S.id, mid.p)); await idle(); await wait(40);
    assert(UI.hasPM() && UI.pmTitle() === 'Area Hatch/Fill' && UI.pmSpec().values.pattern === 'SOLID', 'region picked through the ahatch route');
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return fills.length + ' filled path';
  });
  // --- end rfAG ---
