  // ---- rfN (lane N, 2026-10-12): Auxiliary View, Crop View and Break in the drawing UI
  function rfNSheetView(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfNClick(p) { sheetMouse('mousedown', p); sheetMouse('mouseup', p); }
  function rfNModelClick(id, uv) { rfNClick(rfNSheetView(id).toSheet(uv)); }
  step('rfN: Auxiliary View — the ribbon button (after Projected View), a click on the wedge\'s inclined edge in Front and one on its outer side add VIEW A-A square to the edge, with the arrow on Front; SVG / DXF carry it; undo removes it; anvil.drawing.auxiliaryView does the same', async function () {
    var errs0 = errors.length;
    await anvil.run('p.units("mm");\np.sketch("Front").polyline([[0, 0], [100, 0], [100, 20], [0, 60]], true).extrude(30);');
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    var labels = Array.prototype.map.call(D.querySelectorAll('#ribbon-buttons button'), function (b) { return b.getAttribute('aria-label') || ''; });
    var ip = labels.indexOf('Projected View'), ia = labels.indexOf('Auxiliary View'), idt = labels.indexOf('Detail View');
    assert(ia === ip + 1 && labels[idt + 1] === 'Broken-out Section' && labels[idt + 2] === 'Break' && labels[idt + 3] === 'Crop View', 'View Layout order: ' + labels.join(' | '));
    var F = dwView('Front'), n0 = anvil.drawing.summary().views.length;
    ribbonButton('Auxiliary View').click();
    assert(UI.drawing.state.tool === 'aux', 'Auxiliary View tool');
    rfNModelClick(F.id, [50, 40]);
    assert(UI.drawing.state.pending && UI.drawing.state.pending.parent === F.id, 'edge picked in Front');
    var mid = rfNSheetView(F.id).toSheet([50, 40]), L = Math.hypot(40, 100);
    rfNClick([mid[0] + 60 * 40 / L, mid[1] + 60 * 100 / L]);
    await idle(); await wait(80);
    var sm = anvil.drawing.summary(), av = sm.views.filter(function (v) { return v.kind === 'aux'; })[0];
    assert(sm.views.length === n0 + 1 && av && av.label === 'A' && av.parent === F.id, 'auxiliary view added ' + JSON.stringify(av));
    var dv = anvil.drawing.doc().views.filter(function (v) { return v.id === av.id; })[0];
    assert(Math.abs(dv.aux.dir[0] - 40 / L) < 1e-9 && Math.abs(dv.aux.dir[1] - 100 / L) < 1e-9, 'placed up and right of the edge ' + dv.aux.dir);
    var svg = anvil.drawing.svg(), dxf = anvil.drawing.dxf(), dxf2 = anvil.drawing.dxf({ version: 'R2000' });
    assert(svg.indexOf('VIEW A-A') > 0 && dxf.indexOf('VIEW A-A') > 0 && dxf2.indexOf('VIEW A-A') > 0 && dxf.indexOf('\n8\nAUXILIARY\n') > 0, 'label and layer in the exports');
    assert(UI.drawing.state.sheet.prims.some(function (p) { return p.auxArrow === av.id && p.k === 'fill'; }), 'arrow on Front');
    await UI.undo(); await idle(); await wait(60);
    assert(anvil.drawing.summary().views.length === n0, 'undo removes it');
    sm = anvil.drawing.auxiliaryView(F.id, { a: [100, 20], b: [0, 60], sign: -1 });
    assert(sm && sm.views.filter(function (v) { return v.kind === 'aux'; }).length === 1, 'API');
    assert(anvil.drawing.auxiliaryView(F.id, { a: [0, 0], b: [0, 0] }) === null, 'a zero-length edge is refused');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'VIEW A-A at ' + av.x + ', ' + av.y;
  });
  step('rfN: Break and Crop View PropertyManagers — a 200 mm bar broken between 50 and 150 (Straight Cut) is shorter on the sheet, its 200 dimension stays; Un-Break restores; a rectangle crop keeps the left hole; Remove Crop restores', async function () {
    var errs0 = errors.length;
    await anvil.run('p.units("mm");\np.sketch("Front").rect(0, 0, 200, 20).circle(20, 10, 4).circle(180, 10, 4).extrude(10);');
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    var F = dwView('Front'), w0 = F.box[2] - F.box[0];
    ribbonButton('Break').click();
    assert(UI.pmTitle() === 'Broken View', 'Broken View PM: ' + UI.pmTitle());
    var st = D.querySelector('#pm select[data-key="style"]');
    st.value = 'straight'; st.dispatchEvent(new W.Event('change'));
    await UI.pmOK(); await idle();
    assert(UI.drawing.state.tool === 'brk', 'Break tool');
    rfNModelClick(F.id, [50, 10]); rfNModelClick(F.id, [150, 10]);
    await idle(); await wait(60);
    var B = dwView('Front'), dvs = anvil.drawing.doc().views.filter(function (v) { return v.id === F.id; })[0];
    assert(dvs.breaks && dvs.breaks.length === 1 && Math.abs(dvs.breaks[0].a - 50) < 0.5 && Math.abs(dvs.breaks[0].b - 150) < 0.5 && dvs.breaks[0].style === 'straight', 'break stored ' + JSON.stringify(dvs.breaks));
    var cutW = dvs.breaks[0].b - dvs.breaks[0].a - 10;
    assert(Math.abs((B.box[2] - B.box[0]) - (w0 - cutW)) < 1e-3, 'shorter by the broken length less the 10 mm gap: ' + (B.box[2] - B.box[0]) + ' vs ' + w0);
    assert(UI.drawing.state.sheet.dims.some(function (x) { return x.view === F.id && Math.abs(x.value - 200) < 1e-6; }), 'the 200 dimension stays');
    assert(UI.drawing.state.sheet.prims.filter(function (p) { return p.breakLine; }).length === 2, 'two straight break lines');
    anvil.drawing.unbreak(F.id);
    B = dwView('Front');
    assert(Math.abs((B.box[2] - B.box[0]) - w0) < 1e-6, 'Un-Break restores');
    ribbonButton('Crop View').click();
    assert(UI.pmTitle() === 'Crop View', 'Crop View PM');
    await UI.pmOK(); await idle();
    assert(UI.drawing.state.tool === 'crop', 'Crop tool');
    rfNModelClick(F.id, [-2, -2]); rfNModelClick(F.id, [100, 22]);
    await idle(); await wait(60);
    var C = dwView('Front');
    assert(C.stats.visibleCircles === 1, 'one hole left ' + JSON.stringify(C.stats));
    assert(anvil.drawing.doc().views.filter(function (v) { return v.id === F.id; })[0].crop.type === 'rect', 'crop stored');
    anvil.drawing.crop(F.id, null);
    assert(dwView('Front').stats.visibleCircles === 2, 'Remove Crop restores');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close();
    return 'broken ' + w0.toFixed(1) + ' -> ' + (w0 - 90).toFixed(1) + ' mm';
  });
  // --- end rfN ---
