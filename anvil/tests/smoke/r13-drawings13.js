  // --- r13/drawings13 ---
  step('r13/drawings13: a section view placed with the mouse shows a placeholder at once; its cut, linework and hatch land from drawing-worker.js; the U-bracket\'s bends are arcs on Anvil\'s kernel; dimension text in Century Gothic', async function () {
    if (UI.drawingActive()) UI.closeDrawing();
    await anvil.run(exByName('Sheet-metal U-bracket').code); await idle();
    UI.makeDrawing({ fresh: true }); await UI.drawing.ready();
    var T = dwView('Top'), y = (T.box[1] + T.box[3]) / 2 - 7.3, c1 = paperToClient([T.x + 3, y]), c2 = paperToClient([T.x + 3, 30]);
    var svg = D.querySelector('#drawing-sheet svg');
    function md(type, c) { svg.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: c.clientX, clientY: c.clientY })); }
    ribbonButton('Section View').click();
    setInput(pmField('Line'), 'h');
    await UI.pmOK();
    md('mousemove', c1); md('mousedown', c1);
    md('mousemove', c2);
    var t0 = W.performance.now();
    md('mousedown', c2);
    var ms = W.performance.now() - t0, st = UI.drawing.state;
    // (no summary() before ready(): it would finish the view on the spot)
    assert(st.prog && D.querySelector('#drawing-sheet g[data-layer="SECTION_A"] .dw-pending'), 'the new section view should be a placeholder until the worker answers');
    await UI.drawing.ready();
    assert(!D.querySelector('#drawing-sheet .dw-pending'), 'placeholder left');
    var S = dwKind('section')[0];
    assert(S && S.hatch > 0 && S.stats.visibleArcs === 4, 'section ' + JSON.stringify(S && { hatch: S.hatch, stats: S.stats }));
    assert(/Century Gothic/.test(svg.getAttribute('font-family') || ''), 'sheet font ' + svg.getAttribute('font-family'));
    return 'placing click ' + ms.toFixed(1) + ' ms on the main thread; ' + S.stats.visibleLines + ' lines, ' + S.stats.visibleArcs + ' arcs, ' + S.hatch + ' hatch lines';
  });
  // --- end r13/drawings13 ---

