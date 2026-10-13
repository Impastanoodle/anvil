  // ---- rfAD (2026-10-12): Broken-out Section, Area Hatch/Fill per region, Jagged detail outline as the clip
  function rfADView(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfADClick(p) { sheetMouse('mousemove', p); sheetMouse('mousedown', p); sheetMouse('mouseup', p); }
  function rfADAt(id, uv) { return rfADView(id).toSheet(uv); }
  function rfADDoc(id) { return anvil.drawing.doc().views.filter(function (v) { return v.id === id; })[0]; }
  var RFAD_PLATE = 'p.units("mm");\np.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).circle(80, 25, 5).extrude(10);';
  step('rfAD: Broken-out Section — View Layout ▸ Broken-out Section opens its PM; a spline clicked round the left hole on Front (closed on its first point) cuts 5 mm deep: the floor is hatched, the profile is thin, the view keeps its place; a Rectangle with Depth reference picked on a Top edge cuts down to it; right-click ▸ Remove and undo work', async function () {
    var errs0 = errors.length;
    await anvil.run(RFAD_PLATE);
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    await UI.drawing.ready();
    var F = dwView('Front'), T = dwView('Top'), box0 = JSON.stringify(rfADView(F.id).box);
    ribbonButton('Broken-out Section').click();
    assert(UI.pmTitle() === 'Broken-out Section' && UI.drawing.state.tool === 'bko' && UI.drawing.state.pending.mode === 'bo', 'PM and tool');
    assert(pmField('Profile') && pmField('Depth') && pmField('Depth reference'), 'PM fields');
    setInput(pmField('Depth'), '5');
    [[8, 12], [32, 10], [34, 38], [10, 40]].forEach(function (q) { rfADClick(rfADAt(F.id, q)); });
    var pv = UI.drawing.state.preview;
    assert(pv && pv.kind === 'brokenOut' && pv.pts.length > 10, 'live spline preview ' + JSON.stringify(pv && pv.pts.length));
    rfADClick(rfADAt(F.id, [8, 12])); await idle(); await wait(60);
    var bo = rfADDoc(F.id).brokenOut;
    assert(bo && bo.length === 1 && bo[0].shape === 'spline' && bo[0].pts.length === 4 && bo[0].depth === 5, 'stored ' + JSON.stringify(bo));
    assert(!UI.hasPM() && !UI.drawing.state.tool, 'tool and PM closed');
    var w = rfADView(F.id);
    assert(w.content.caps.length === 1 && w.hatch > 10, 'floor hatched ' + w.hatch);
    assert(UI.drawing.state.sheet.prims.filter(function (p) { return p.brokenOut === bo[0].id && p.style === 'thin'; }).length > 20, 'thin spline profile');
    assert(JSON.stringify(w.box) === box0, 'view in place');
    // a rectangle round the right hole, depth from an edge of Top (its back edge z = 0: through)
    ribbonButton('Broken-out Section').click();
    setInput(pmField('Profile'), 'rect');
    pmField('Depth reference').click();
    rfADClick(rfADAt(F.id, [70, 15])); rfADClick(rfADAt(F.id, [90, 35]));
    assert(UI.drawing.state.pending && UI.drawing.state.pending.stage === 'ref', 'asks for the depth reference');
    var tw = rfADView(T.id), edge = tw.proj.lines.visible.filter(function (l) { return Math.abs(l[1]) < 1e-6 && Math.abs(l[3]) < 1e-6; })[0];
    rfADClick(rfADAt(T.id, [(edge[0] + edge[2]) / 2, edge[1]])); await idle(); await wait(60);
    bo = rfADDoc(F.id).brokenOut;
    assert(bo.length === 2 && bo[1].shape === 'rect' && bo[1].depthRef && bo[1].depthRef.view === T.id, 'depth reference ' + JSON.stringify(bo[1]));
    w = rfADView(F.id);
    var d2 = w.content.brokenOut.filter(function (c) { return c.id === bo[1].id; })[0];
    assert(d2 && Math.abs(d2.depth - (10 + edge[1])) < 1e-6, 'depth to the edge ' + (d2 && d2.depth) + ' edge v ' + edge[1]);
    assert(anvil.drawing.svg().indexOf('class="hatch"') > 0 && anvil.drawing.dxf({ version: 'R12' }).indexOf('LINE') > 0, 'exports');
    // right-click ▸ Broken-out Section ▸ Remove, then undo
    var sm0 = anvil.drawing.summary();
    UI.drawing.state.sel = { kind: 'view', id: F.id };
    var mi = UI.drawingInternal.viewMenu(rfADDoc(F.id)).filter(function (m) { return m.label === 'Broken-out Section ▸ Remove'; })[0];
    assert(mi && !mi.disabled, 'menu entry'); mi.action(); await idle(); await wait(40);
    assert(!rfADDoc(F.id).brokenOut, 'removed');
    await UI.undo(); await idle(); await wait(40);
    assert(rfADDoc(F.id).brokenOut && rfADDoc(F.id).brokenOut.length === 2, 'undo restores');
    assert(typeof anvil.drawing.brokenOut === 'function' && anvil.drawing.brokenOut(F.id, { shape: 'circle', c: [50, 25], r: 6, depth: 2 }) && rfADDoc(F.id).brokenOut.length === 3, 'API');
    assert(anvil.drawing.brokenOut(F.id, { shape: 'circle', c: [50, 25], r: 6 }) === null, 'API refuses a missing depth');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return sm0.views.length + ' views, ' + w.hatch + ' hatch lines on Front';
  });
  step('rfAD: Area Hatch/Fill — a click on the hatch of a selected section opens the PM (Material crosshatch ticked); ANSI37 at scale 2, angle 30 on that region only; Solid and None; Material crosshatch back; Insert ▸ Annotations ▸ Area Hatch/Fill picks a region too; the API lists regions', async function () {
    var errs0 = errors.length;
    await anvil.run(RFAD_PLATE);
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    await UI.drawing.ready();
    var F = dwView('Front');
    anvil.drawing.sectionView(F.id, { axis: 'h', at: 25, sign: 1, fit: true }); await idle(); await wait(60);
    var S = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'section'; })[0];
    var regs = anvil.drawing.hatchRegions(S.id);
    assert(regs.length === 3 && regs.every(function (g) { return g.pattern === 'ANSI31' && !g.areaHatch; }), 'three regions ' + JSON.stringify(regs));
    var mid = regs.filter(function (g) { return Math.abs(g.p[0] - 50) < 1e-6; })[0], pt = rfADAt(S.id, mid.p);
    UI.drawing.state.sel = { kind: 'view', id: S.id };
    rfADClick(pt); await idle(); await wait(40);
    assert(UI.hasPM() && UI.pmTitle() === 'Area Hatch/Fill', 'PM from a click on the hatch: ' + (UI.hasPM() && UI.pmTitle()));
    var mx = pmField('Material crosshatch');
    assert(mx && mx.checked, 'material crosshatch ticked');
    mx.click(); await idle();
    setInput(pmField('Pattern'), 'ANSI37'); setInput(pmField('Scale'), '2'); setInput(pmField('Angle'), '30');
    await UI.pmOK(); await idle(); await wait(40);
    var hr = rfADDoc(S.id).hatchRegions;
    assert(hr && hr.length === 1 && hr[0].pattern === 'ANSI37' && hr[0].scale === 2 && hr[0].angle === 30, 'stored ' + JSON.stringify(hr));
    var own = UI.drawing.state.sheet.prims.filter(function (p) { return p.areaHatch === 'ANSI37'; });
    var x0 = rfADAt(S.id, [25, 0])[0], x1 = rfADAt(S.id, [75, 0])[0];
    assert(own.length > 0 && own.every(function (p) { return Math.min(p.a[0], p.b[0]) >= x0 - 1e-6 && Math.max(p.a[0], p.b[0]) <= x1 + 1e-6; }), 'middle region only ' + own.length);
    regs = anvil.drawing.hatchRegions(S.id);
    assert(regs.filter(function (g) { return g.areaHatch; }).length === 1 && regs.filter(function (g) { return !g.areaHatch && g.pattern === 'ANSI31'; }).length === 2, 'regions after ' + JSON.stringify(regs));
    assert(anvil.drawing.areaHatch(S.id, mid.p, { pattern: 'SOLID' }) && UI.drawing.state.sheet.prims.filter(function (p) { return p.areaHatch === 'SOLID' && p.k === 'region'; }).length === 1, 'solid: one filled region');
    assert(anvil.drawing.areaHatch(S.id, mid.p, { pattern: 'NONE' }) && !UI.drawing.state.sheet.prims.some(function (p) { return p.areaHatch; }), 'none');
    // Insert ▸ Annotations ▸ Area Hatch/Fill: the tool, then a click on the region
    UI.drawingInternal.cmdAreaHatchTool();
    assert(UI.drawing.state.tool === 'ahatch', 'pick tool');
    rfADClick(pt); await idle(); await wait(40);
    assert(UI.hasPM() && UI.pmTitle() === 'Area Hatch/Fill' && !pmField('Material crosshatch').checked && UI.pmSpec().values.pattern === 'NONE', 'PM shows the region\'s own pattern');
    pmField('Material crosshatch').click(); await idle();
    await UI.pmOK(); await idle(); await wait(40);
    assert(!rfADDoc(S.id).hatchRegions, 'material crosshatch back');
    var plain = UI.drawing.state.sheet.prims.filter(function (p) { return p.style === 'hatch' && p.layer === rfADView(S.id).layer; }).length;
    assert(plain > 0 && rfADView(S.id).hatches.every(function (h) { return h.pattern === 'ANSI31' && !h.areaHatch; }), 'material hatch ' + plain);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return own.length + ' ANSI37 lines, ' + plain + ' material lines';
  });
  step('rfAD: Jagged detail outline is the clip — a jagged detail of a section ends its lines and hatch on the zig-zag (past the circle, never past the zig-zag)', async function () {
    var errs0 = errors.length;
    await anvil.run(RFAD_PLATE);
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    await UI.drawing.ready();
    var F = dwView('Front');
    anvil.drawing.sectionView(F.id, { axis: 'h', at: 25, sign: 1, fit: true }); await idle(); await wait(60);
    var S = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'section'; })[0];
    anvil.drawing.detailView(S.id, { c: [15, -5], r: 8, outline: 'jagged', fit: true }); await idle(); await wait(60);
    var dv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'detail'; })[0], w = rfADView(dv.id);
    var J = W.Drawing._.jaggedPts(w, anvil.drawing.summary().units === 'in' ? 1 / 25.4 : 1), c = w.toSheet(rfADDoc(dv.id).detail.c), R = rfADDoc(dv.id).detail.r * w.scale;
    var lin = UI.drawing.state.sheet.prims.filter(function (p) { return p.layer === w.layer && p.k === 'line' && p.detailOutline == null; }), maxR = 0, out = 0;
    lin.forEach(function (p) { [p.a, p.b].forEach(function (q) { maxR = Math.max(maxR, Math.hypot(q[0] - c[0], q[1] - c[1])); }); if (!W.Drawing._.inLoops([(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2], [J])) out++; });
    assert(lin.length > 5 && out === 0 && maxR > R + 0.05 && maxR <= R + 1.2 + 1e-6, 'clipped to the zig-zag: ' + out + ' out, reach ' + maxR.toFixed(3) + ' vs r ' + R.toFixed(3));
    assert(lin.some(function (p) { return p.style === 'hatch'; }), 'hatch clipped too');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return lin.length + ' pieces inside the zig-zag';
  });
  // --- end rfAD ---
