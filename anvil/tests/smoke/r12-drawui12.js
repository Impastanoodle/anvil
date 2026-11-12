  // --- r12/drawui12 ---
  step('r12/drawui12: Make Drawing shows the sheet at once with a placeholder per view; the views land from drawing-worker.js and match the synchronous drawing', async function () {
    if (UI.drawingActive()) UI.closeDrawing();
    await anvil.run(plateCode()); await idle();
    var ref = anvil.drawing.make({ fresh: true });   // the API path: settled before it returns
    UI.closeDrawing();
    await anvil.run(plateCode()); await idle();
    await UI.rebuild({ fresh: true }); await idle();   // a new mesh: no projection cached (rfMG: the same script again keeps the mesh, and with it the projections)
    var t0 = W.performance.now();
    UI.makeDrawing({ fresh: true });
    var callMs = W.performance.now() - t0, st = UI.drawing.state;
    assert(UI.drawingActive() && st.prog, 'the drawing should open with its views still to come');
    var ph = D.querySelectorAll('#drawing-sheet .dw-pending').length;
    assert(ph === 4, 'placeholders ' + ph);
    assert(D.querySelector('#drawing-sheet g[data-layer="SHEET"]') && D.querySelector('#drawing-sheet g[data-layer="FRONT"]'), 'sheet and view layers drawn at once');
    await UI.drawing.ready();
    assert(!st.prog && !D.querySelector('#drawing-sheet .dw-pending'), 'placeholders left');
    var s = anvil.drawing.summary(), strip = function (x) { x = JSON.parse(JSON.stringify(x)); delete x.titleBlock; delete x.name; return JSON.stringify(x); };
    assert(strip(s) === strip(ref), 'differs from the synchronous drawing:\n' + strip(s) + '\n' + strip(ref));
    assert(s.annotations.length > 0, 'Auto insert centre marks / centrelines missing');
    return 'makeDrawing ' + callMs.toFixed(1) + ' ms on the main thread, first paint ' + st.firstPaintMs.toFixed(1) + ' ms, complete ' + st.openMs.toFixed(0) + ' ms; ' + s.annotations.length + ' annotations';
  });
  step('r12/drawui12: a script reading a drawing that is still being worked out gets the whole sheet (settle)', async function () {
    UI.closeDrawing();
    await anvil.run(plateCode()); await idle();
    await UI.rebuild({ fresh: true }); await idle();   // (rfMG) a new mesh
    UI.makeDrawing({ fresh: true });
    assert(UI.drawing.state.prog, 'expected a drawing in progress');
    var s = anvil.drawing.summary();
    assert(!UI.drawing.state.prog && !D.querySelector('#drawing-sheet .dw-pending'), 'not settled');
    assert(s.views.length === 4 && dwView('Front').stats.hiddenLines === 4 && s.dims.indexOf('4X Ø8') >= 0 && s.annotations.length > 0, JSON.stringify(s.dims));
    return s.views.length + ' views, ' + s.dims.length + ' dims';
  });
  step('r12/drawui12: View Layout tab, ASME arrowheads (3 × 1 mm), a pixel floor for line weights on screen only, cursors', async function () {
    var tabs = ribbonTabs();
    assert(tabs[0] === 'View Layout' && tabs[1] === 'Annotation', 'tabs ' + tabs);
    var st = UI.drawing.state, arrow = st.sheet.prims.filter(function (p) { return p.k === 'fill' && p.layer === 'DIMENSIONS'; })[0];
    assert(arrow, 'no dimension arrow');
    var wdt = Math.hypot(arrow.pts[1][0] - arrow.pts[2][0], arrow.pts[1][1] - arrow.pts[2][1]);
    var len = Math.hypot((arrow.pts[1][0] + arrow.pts[2][0]) / 2 - arrow.pts[0][0], (arrow.pts[1][1] + arrow.pts[2][1]) / 2 - arrow.pts[0][1]);
    assert(Math.abs(wdt - 1) < 1e-9 && Math.abs(len - 3) < 1e-9, 'arrow ' + wdt + ' × ' + len);
    UI.drawing.fit();
    var css = D.getElementById('dw-stroke-floor').textContent;
    var host = D.getElementById('drawing-sheet'), ppu = Math.min(host.clientWidth / st.vb.w, host.clientHeight / st.vb.h);
    if (0.25 * ppu < 0.95) assert(/\.thin\{stroke-width:/.test(css), 'thin lines below a pixel at fit (' + (0.25 * ppu).toFixed(2) + ' px) with no floor: ' + css);
    assert(anvil.drawing.svg().indexOf('dw-pending') < 0 && anvil.drawing.svg().indexOf('stroke-width="0.25"') >= 0, 'the export keeps the paper widths');
    var r = host.getBoundingClientRect();
    for (var i = 0; i < 25; i++) host.dispatchEvent(new W.WheelEvent('wheel', { deltaY: -100, clientX: r.left + 100, clientY: r.top + 100, bubbles: true, cancelable: true }));
    var css2 = D.getElementById('dw-stroke-floor').textContent;
    assert(css2.indexOf('.visible{') < 0, 'zoomed in, visible edges keep their paper width: ' + css2);
    UI.drawing.fit();
    var F = dwView('Front'), c = paperToClient([(F.box[0] + F.box[2]) / 2, (F.box[1] + F.box[3]) / 2]);
    host.querySelector('svg').dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: c.clientX, clientY: c.clientY }));
    assert(host.classList.contains('dw-cur-move'), 'no move cursor over a view: ' + host.className);
    ribbonButton('Smart Dimension').click();
    assert(host.classList.contains('dw-cur-tool'), 'no crosshair with Smart Dimension: ' + host.className);
    key('Escape');
    assert(!host.classList.contains('dw-cur-tool'), 'crosshair left after Esc');
    return 'stroke floor at fit ' + (css ? 'on' : 'off') + ' (thin = ' + (0.25 * ppu).toFixed(2) + ' px); arrow ' + wdt + ' × ' + len + ' mm';
  });
  step('r12/drawui12: a part change keeps the last sheet on screen (no placeholders) while the new views are worked out, then swaps the new sheet in', async function () {
    UI.closeDrawing();
    await anvil.run(plateCode()); await idle();
    UI.makeDrawing({ fresh: true }); await UI.drawing.ready();
    var st = UI.drawing.state, held = false, blank = false;
    var poll = W.setInterval(function () { if (st.prog && st.prog.hold) held = true; if (D.querySelector('#drawing-sheet .dw-pending')) blank = true; }, 2);
    var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude' && !x.cut; })[0];
    UI.pushUndo(); f.depth = 12;
    await UI.rebuild(); await idle(); await wait(80); await UI.drawing.ready();
    W.clearInterval(poll);
    assert(!blank, 'placeholders shown on a part change');
    var fw = st.sheet.views.filter(function (w) { return w.view.orient === 'Front'; })[0], b = fw.proj.bounds;
    assert(Math.abs(b.vmax - b.vmin - 12) < 1e-9 && !fw.pending, 'the Front view did not follow: ' + (b.vmax - b.vmin));
    await UI.undo(); await idle();
    assert(JSON.stringify(dwView('Front').extents) === '[100,8]', 'undo');
    return held ? 'last sheet held while the worker ran' : 'views landed before a poll saw the hold';
  });
  // --- end r12/drawui12 ---
