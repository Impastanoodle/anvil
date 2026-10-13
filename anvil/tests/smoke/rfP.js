  // ---- rfP (lane P, 2026-10-12): Half / Offset / Aligned section views; dimensions dragged in a broken view
  function rfPSheetView(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfPClick(p) { sheetMouse('mousemove', p); sheetMouse('mousedown', p); sheetMouse('mouseup', p); }
  function rfPModelClick(id, uv) { rfPClick(rfPSheetView(id).toSheet(uv)); }
  async function rfPSection(type, extra) {
    ribbonButton('Section View').click();
    assert(UI.pmTitle() === 'Section View', 'Section View PM: ' + UI.pmTitle());
    var ty = D.querySelector('#pm select[data-key="type"]');
    assert(ty, 'Section Type field');
    ty.value = type; ty.dispatchEvent(new W.Event('change'));
    if (extra) extra();
    await UI.pmOK(); await idle();
    assert(UI.drawing.state.tool === 'section' && UI.drawing.state.pending.type === type, 'section tool, type ' + type);
  }
  function rfPCut(id) { return UI.drawing.state.sheet.prims.filter(function (p) { return p.cutLine === id; }); }
  step('rfP: Section View PM ▸ Half Section — a click at the centre of the plate in Front and one above add SECTION A-A with only the right half cut (area 500), an L-shaped cutting line with one arrow on Front; Offset Section — clicks on two holes at different heights and one outside: both legs hatched (800), three legs, two arrows; undo removes it', async function () {
    var errs0 = errors.length;
    await anvil.run('p.units("mm");\np.sketch("Front").rect(0, 0, 100, 50).circle(20, 15, 5).circle(80, 35, 5).extrude(10);');
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    var F = dwView('Front'), n0 = anvil.drawing.summary().views.length;
    await rfPSection('half');
    rfPModelClick(F.id, [50, 15]);
    var fw = rfPSheetView(F.id);
    rfPClick([fw.view.x, fw.box.y1 + 30]);
    await idle(); await wait(80);
    var sm = anvil.drawing.summary(), S = sm.views.filter(function (v) { return v.kind === 'section'; })[0];
    assert(sm.views.length === n0 + 1 && S && S.label === 'A', 'half section added ' + JSON.stringify(S));
    var dv = anvil.drawing.doc().views.filter(function (v) { return v.id === S.id; })[0];
    assert(dv.section.type === 'half' && Math.abs(dv.section.c - 50) < 0.6 && dv.section.side === 1 && Math.abs(dv.section.at - 15) < 1e-9, 'stored ' + JSON.stringify(dv.section));
    near(S.sectionArea, 10 * (100 - dv.section.c), 1e-6, 'only the right half cut (the hole at v = 35 is clear of it)');
    var cl = rfPCut(S.id);
    assert(cl.filter(function (p) { return p.k === 'line' && p.style === 'chain'; }).length === 2 && cl.filter(function (p) { return p.k === 'fill'; }).length === 1, 'L-shaped line, one arrow');
    assert(D.querySelectorAll('#drawing-sheet g[data-layer="FRONT"] line.chain, #drawing-sheet g[data-layer="FRONT"] path.chain').length >= 1, 'drawn on Front');
    await UI.undo(); await idle(); await wait(60);
    assert(anvil.drawing.summary().views.length === n0, 'undo removes it');
    await rfPSection('offset');
    rfPModelClick(F.id, [20, 15]); rfPModelClick(F.id, [80, 35]);
    fw = rfPSheetView(F.id);
    rfPClick([fw.view.x, fw.box.y1 + 30]);
    await idle(); await wait(80);
    S = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'section'; })[0];
    dv = anvil.drawing.doc().views.filter(function (v) { return v.id === S.id; })[0];
    assert(dv.section.type === 'offset' && dv.section.jogs.length === 1 && Math.abs(dv.section.jogs[0].t - 50) < 1e-9 && Math.abs(dv.section.jogs[0].at - 35) < 1e-9 && Math.abs(dv.section.at - 15) < 1e-9, 'offset stored ' + JSON.stringify(dv.section));
    near(S.sectionArea, 800, 1e-6, 'both legs cut through a hole');
    cl = rfPCut(S.id);
    assert(cl.filter(function (p) { return p.k === 'line' && p.style === 'chain'; }).length === 3 && cl.filter(function (p) { return p.k === 'fill'; }).length === 2, 'stepped line, two arrows');
    var dxf = anvil.drawing.dxf();
    assert(dxf.indexOf('SECTION A-A') > 0, 'DXF label');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'offset area ' + fmt(S.sectionArea);
  });
  step('rfP: Section View PM ▸ Aligned Section — a disc: click the centre, a hole at 270°, then above: the 270° leg is turned into the plane of the first, both holes cut (area 800), two arrows; anvil.drawing.sectionView refuses legs in line', async function () {
    var errs0 = errors.length;
    await anvil.run('p.units("mm");\np.sketch("Front").circle(0, 0, 50).circle(30, 0, 5).circle(0, -30, 5).extrude(10);');
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    var F = dwView('Front');
    await rfPSection('aligned');
    rfPModelClick(F.id, [0, 0]);
    rfPModelClick(F.id, [0.3, -30]);
    var fw = rfPSheetView(F.id);
    rfPClick([fw.view.x, fw.box.y1 + 30]);
    await idle(); await wait(80);
    var S = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'section'; })[0];
    assert(S, 'aligned section added');
    var dv = anvil.drawing.doc().views.filter(function (v) { return v.id === S.id; })[0];
    assert(dv.section.type === 'aligned' && Math.abs(dv.section.angle - 270) < 1e-6 && dv.section.side === 1, 'stored ' + JSON.stringify(dv.section));
    near(S.sectionArea, 800, 1e-3, 'two 40 x 10 cut faces');
    assert(rfPCut(S.id).filter(function (p) { return p.k === 'fill'; }).length === 2, 'two arrows');
    assert(anvil.drawing.sectionView(F.id, { axis: 'h', at: 0, sign: 1, type: 'aligned', c: 0, side: 1, angle: 0 }) === null, 'legs in line refused');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'aligned area ' + fmt(S.sectionArea);
  });
  step('rfP: Broken view — the 200 dimension\'s text, which sits in the break, dragged 20 mm right lands under the pointer (the move is mapped back through the break) and still reads 200', async function () {
    var errs0 = errors.length;
    await anvil.run('p.units("mm");\np.sketch("Front").rect(0, 0, 200, 20).circle(20, 10, 4).circle(180, 10, 4).extrude(10);');
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    var F = dwView('Front');
    anvil.drawing.breakView(F.id, { dir: 'vertical', a: 50, b: 150, gap: 10, style: 'straight' });
    await idle(); await wait(60);
    var st = UI.drawing.state, find = function () { return st.sheet.dims.filter(function (x) { return x.view === F.id && x.kind === 'h' && Math.abs(x.value - 200) < 1e-6; })[0]; };
    var tmid = function (d) { return [(d.tbox.x0 + d.tbox.x1) / 2, (d.tbox.y0 + d.tbox.y1) / 2]; };
    var d0 = find();
    assert(d0 && d0.tbox, 'the 200 dimension');
    var m0 = tmid(d0);
    sheetMouse('mousedown', m0);
    var c1 = paperToClient([m0[0] + 20, m0[1]]);
    W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: c1.clientX, clientY: c1.clientY, altKey: true }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, clientX: c1.clientX, clientY: c1.clientY, altKey: true }));
    await idle(); await wait(80);
    var d1 = find();
    assert(d1, 'still there');
    var m1 = tmid(d1), px = 1 / D.querySelector('#drawing-sheet svg').getScreenCTM().a;
    assert(Math.abs(m1[0] - (m0[0] + 20)) < 2 * px + 0.5, 'text under the pointer: ' + m1[0].toFixed(2) + ' vs ' + (m0[0] + 20).toFixed(2));
    assert(Math.abs(m1[1] - m0[1]) < 2 * px + 0.5, 'line stays at its height');
    assert(st.sheet.prims.some(function (p) { return p.k === 'text' && p.view === F.id && /^200/.test(p.text); }), 'reads 200');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close();
    return 'text moved ' + (m1[0] - m0[0]).toFixed(2) + ' mm';
  });
  // --- end rfP ---
