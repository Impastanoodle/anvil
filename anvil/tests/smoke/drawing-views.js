  // ---- drawing views: Projected / Section / Detail View with the mouse, dimensions that follow the part
  // (sheet scale 1:1 so the new views have room on the A3 sheet)
  function dwKind(kind) { return anvil.drawing.summary().views.filter(function (v) { return v.kind === kind; }); }
  function viewCentre(v) { return [(v.box[0] + v.box[2]) / 2, (v.box[1] + v.box[3]) / 2]; }
  step('drawing views: Projected View from the selected Front view, pointer below it, adds an aligned Bottom view that only slides vertically', async function () {
    await anvil.run(plateCode());
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    assert(UI.drawingActive() && anvil.drawing.summary().views.length === 4 && anvil.drawing.summary().sheet.scale === '1:1', 'fresh Standard 3 View at 1:1');
    var F = dwView('Front'), c = viewCentre(F);
    sheetMouse('mousedown', c); sheetMouse('mouseup', c);
    ribbonButton('Projected View').click();
    assert(UI.drawing.state.tool === 'project' && UI.drawing.state.pending.parent === F.id, 'tool with the selected parent');
    var below = [c[0] + 15, F.box[1] - 45];
    sheetMouse('mousemove', below);
    assert(D.querySelector('#dw-overlay .dw-ghost'), 'no placement preview');
    sheetMouse('mousedown', below);
    var P = dwKind('projected')[0];
    assert(P && P.orient === 'Bottom' && P.parent === F.id && UI.drawing.state.tool === null, 'projected ' + JSON.stringify(P));
    near(P.x, F.x, 1e-6, 'aligned under Front'); near(P.box[0], F.box[0], 1e-6); near(P.box[2], F.box[2], 1e-6);
    assert(P.box[3] < F.box[1] && P.stats.visibleCircles === 4, 'below, holes seen from underneath ' + JSON.stringify([P.box, F.box, P.stats]));
    assert(D.querySelector('#drawing-sheet g[data-layer="BOTTOM"]') && D.querySelector('#drawing-tree .dw-projected'), 'layer / tree row');
    var pc = viewCentre(P), to = paperToClient([pc[0] + 30, pc[1] - 8]);
    sheetMouse('mousedown', pc);
    W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: to.clientX, clientY: to.clientY }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, clientX: to.clientX, clientY: to.clientY }));
    await wait(60);
    var P2 = dwKind('projected')[0];
    near(P2.x, F.x, 1e-6, 'still aligned after a sideways drag'); assert(P2.y < P.y - 4, 'slid down');
    return 'Bottom view at y ' + fmt(P2.y);
  });
  step('drawing views: Section View PM (horizontal) - click through the hole row of the Top view, click below: Section View A-A hatched, exact area, cutting line with arrows', async function () {
    ribbonButton('Section View').click();
    assert(UI.hasPM(), 'Section View PM');
    setInput(pmField('Line'), 'h');
    await UI.pmOK();
    assert(UI.drawing.state.tool === 'section' && UI.drawing.state.pending.axis === 'h', 'section tool');
    var T = dwView('Top'), y = T.box[3] - 10 - 0.6;           // 0.6 mm off the hole centres: snaps onto them
    sheetMouse('mousemove', [T.x + 20, y]);
    assert(D.querySelector('#dw-overlay .dw-cut'), 'cutting line preview');
    sheetMouse('mousedown', [T.x + 20, y]);
    var at = [T.x + 40, 30];
    sheetMouse('mousemove', at);
    sheetMouse('mousedown', at);
    var S = dwKind('section')[0];
    assert(S && S.label === 'A' && S.name === 'Section View A-A' && S.orient === 'Front' && S.parent === T.id, 'section ' + JSON.stringify(S));
    near(S.sectionArea, 100 * 8 - 2 * 8 * 8, 1e-9, 'area of the cut through the two hole axes (snapped)');
    near(S.x, T.x, 1e-6, 'aligned with Top'); near(S.y, 30, 1.5, 'y where clicked (whole pixels)');
    assert(S.hatch > 20 && [].reduce.call(D.querySelectorAll('#drawing-sheet g[data-layer="SECTION_A"] path.hatch'), function (n, e) { return n + e.getAttribute('d').split(/[Mm]/).length - 1; }, 0) === S.hatch, 'hatch ' + S.hatch);
    assert(D.querySelectorAll('#drawing-sheet g[data-layer="TOP"] line.chain').length === 1, 'cutting line on Top');
    var labels = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet text'), function (t) { return t.textContent; });
    assert(labels.indexOf('SECTION A-A') >= 0 && labels.filter(function (t) { return t === 'A'; }).length === 2, 'labels');
    var row = D.querySelector('#drawing-tree .dw-section');
    assert(row && row.querySelector('.badge').textContent === 'A-A', 'tree row');
    return 'area ' + fmt(S.sectionArea) + ', ' + S.hatch + ' hatch lines';
  });
  step('drawing views: Detail View - centre on a Top view hole, radius, place: Detail View B (2 : 1) with the hole at 2x; Undo removes it, Redo brings it back', async function () {
    ribbonButton('Detail View').click();
    assert(UI.drawing.state.tool === 'detail', 'detail tool');
    var T = dwView('Top'), c = [T.box[0] + 10, T.box[3] - 10], n = anvil.drawing.summary().views.length;
    sheetMouse('mousedown', c);
    sheetMouse('mousemove', [c[0] + 7, c[1]]);
    assert(D.querySelector('#dw-overlay circle.dw-cut'), 'detail circle preview');
    sheetMouse('mousedown', [c[0] + 7, c[1]]);
    sheetMouse('mousemove', [330, 120]);
    sheetMouse('mousedown', [330, 120]);
    var Dv = dwKind('detail')[0];
    assert(Dv && Dv.label === 'B' && Dv.scale === '2:1' && Dv.name === 'Detail View B (2 : 1)' && Dv.parent === T.id, 'detail ' + JSON.stringify(Dv));
    // mouse events carry whole pixels, so the radius is 7 to within half a pixel
    near(Dv.extents[0], 14, 1.5, 'extents 2r'); near(Dv.box[2] - Dv.box[0], Dv.extents[0] * 2, 0.01, 'box at 2:1');
    assert(Dv.stats.visibleCircles === 1, JSON.stringify(Dv.stats));
    var circ = D.querySelectorAll('#drawing-sheet g[data-layer="DETAIL_B"] circle');
    assert(circ.length === 1 && Math.abs(+circ[0].getAttribute('r') - 8) < 1e-6, 'the hole at 2:1');
    assert(D.querySelector('#drawing-tree .dw-detail .badge').textContent === 'B 2:1', 'tree badge');
    await UI.undo(); await idle(); await wait(60);
    assert(anvil.drawing.summary().views.length === n && !dwKind('detail').length && UI.drawingActive(), 'undo');
    await UI.redo(); await idle(); await wait(60);
    assert(dwKind('detail').length === 1, 'redo');
    return 'r ' + fmt(Dv.extents[0] / 2) + ' at ' + Dv.scale;
  });
  step('drawing views: Smart Dimensions follow a part change (thicker plate) and dangle in olive when their holes are deleted; Undo reattaches them', async function () {
    async function dvUntil(ok) { var t0 = Date.now(); while (!ok() && Date.now() - t0 < 4000) await wait(40); }
    ribbonButton('Smart Dimension').click();
    var F = dwView('Front'), T = dwView('Top');
    sheetMouse('mousedown', [F.box[0] + (F.box[2] - F.box[0]) * 0.6, F.box[3]]);          // top edge of the Front view
    sheetMouse('mousedown', [F.box[0] + (F.box[2] - F.box[0]) * 0.5, F.box[3] + 8]);      // (rfS) placed above it
    sheetMouse('mousedown', [T.box[2] - 10 + 4, T.box[3] - 10]);                           // the hole at (90, -10), r 4
    sheetMouse('mousedown', [T.box[2] + 12, T.box[3] + 6]);                                // (rfS) placed up right
    key('Escape');
    var Dr = W.Drawing;
    var user = function () { return anvil.drawing.doc().views.map(function (v) { return (v.dims || []).map(function (d) { return Dr.dimText(d, 'mm') + (d.dangling ? '?' : ''); }).join(' '); }).filter(Boolean).join(' | '); };
    assert(user() === '100 | \u00d88', 'placed ' + JSON.stringify(user()));
    var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude' && !x.cut; })[0];
    UI.pushUndo(); f.depth = 12;
    await UI.rebuild(); await idle(); await dvUntil(function () { var d = anvil.drawing.doc().views[0].dims[0]; return d && Math.abs(d.a[1] - 12) < 1e-9; });   // the drawing redraws after the rebuild settles: wait for it, not a fixed 80 ms
    assert(user() === '100 | \u00d88' && anvil.drawing.summary().dangling === 0, 'after 8 -> 12: ' + user());
    near(anvil.drawing.doc().views[0].dims[0].a[1], 12, 1e-9, 'the dimension moved to the new top edge');
    near(dwKind('section')[0].sectionArea, 100 * 12 - 2 * 8 * 8, 1e-9, 'the section follows (the holes stay 8 deep)');
    UI.pushUndo(); UI.App.model.features = UI.App.model.features.filter(function (x) { return x.id < 3; });
    await UI.rebuild(); await idle(); await dvUntil(function () { return user() === '100 | \u00d88?' && D.querySelectorAll('#drawing-sheet [data-color="dangling"]').length >= 3; });   // the drawing redraws after the rebuild settles: wait for it, not a fixed 80 ms
    assert(user() === '100 | \u00d88?' && anvil.drawing.summary().dangling === 1, 'holes deleted: ' + user());
    assert(D.querySelectorAll('#drawing-sheet [data-color="dangling"]').length >= 3, 'dangling colour');
    await UI.undo(); await idle(); await dvUntil(function () { return user() === '100 | \u00d88' && !D.querySelector('#drawing-sheet [data-color="dangling"]'); });   // the drawing redraws after the rebuild settles: wait for it, not a fixed 80 ms
    assert(user() === '100 | \u00d88' && !D.querySelector('#drawing-sheet [data-color="dangling"]'), 'undo reattaches: ' + user());
    await UI.undo(); await idle(); await wait(80);
    assert(JSON.stringify(dwView('Front').extents) === '[100,8]', 'back to 8 thick');
    var dxf = anvil.drawing.dxf(), svg = anvil.drawing.svg(), pdf = anvil.drawing.pdf();
    ['SECTION_A', 'DETAIL_B', 'BOTTOM'].forEach(function (l) { assert(dxf.indexOf('\n8\n' + l + '\n') > 0 && svg.indexOf('data-layer="' + l + '"') > 0, 'layer ' + l); });
    assert(dxf.indexOf('\n6\nPHANTOM\n') > 0 && pdf.indexOf('%PDF-1.4') === 0, 'exports');
    anvil.drawing.close();
    return 'follows 8 -> 12, dangles without the holes';
  });
