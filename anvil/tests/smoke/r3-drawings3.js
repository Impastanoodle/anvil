  // --- r3/drawings3 ---
  step('r3/drawings3: the sheet zooms about the cursor (a script\'s wheel at once), a dragged view moves by a transform with its dimensions and is drawn anew on release, a dimension drag re-parses only its layer, an edge under the cursor pre-highlights, a middle double-click fits the sheet', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(plateCode()); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    var st = UI.drawing.state, svg = function () { return D.querySelector('#drawing-sheet svg'); };
    // wheel: the paper point under the cursor stays put
    var F = dwView('Front'), at = [(F.box[0] + F.box[2]) / 2, (F.box[1] + F.box[3]) / 2], c = paperToClient(at), w0 = st.vb.w;
    svg().dispatchEvent(new W.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: c.clientX, clientY: c.clientY }));
    near(st.vb.w, w0 / 1.15, 1e-6, 'one notch zooms 1.15x');
    var c2 = paperToClient(at);
    assert(Math.abs(c2.clientX - c.clientX) < 1.5 && Math.abs(c2.clientY - c.clientY) < 1.5, 'zoom about the cursor ' + JSON.stringify([c, c2]));
    // view drag: a transform while dragging, the sheet worked out again on release
    var T = dwView('Top'), from = paperToClient([(T.box[0] + T.box[2]) / 2, (T.box[1] + T.box[3]) / 2]);
    svg().dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: from.clientX, clientY: from.clientY }));
    W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: from.clientX + 2, clientY: from.clientY - 30 }));
    var g = D.querySelector('#drawing-sheet g[data-view="' + T.id + '"]');
    assert(g && /translate/.test(g.getAttribute('transform') || ''), 'Top layer translated while dragged');
    assert(anvil.drawing.doc().views.filter(function (v) { return v.id === T.id; })[0].y > T.y + 1, 'Top moved in the document');
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, clientX: from.clientX + 2, clientY: from.clientY - 30 }));
    assert(!D.querySelector('#drawing-sheet g[data-layer][transform], #drawing-sheet g[data-of][transform]'), 'no transform left after release');
    var T1 = dwView('Top');
    assert(T1.y > T.y + 1 && Math.abs(T1.x - T.x) < 1e-9, 'Top drawn at its new place, still aligned ' + fmt(T.y) + ' -> ' + fmt(T1.y));
    // a dimension drag patches the DIMENSIONS layer only
    var dd = anvil.drawing.summary().dimDetails[0], mid = [(dd.box[0] + dd.box[2]) / 2, (dd.box[1] + dd.box[3]) / 2], ds = W.document.querySelector('#drawing-sheet g[data-layer="FRONT"]');
    sheetDrag(mid, [mid[0] + 4, mid[1] - 10]); await wait(80);
    assert(st.patched === 1 && D.querySelector('#drawing-sheet g[data-layer="FRONT"]') === ds, 'patched layers ' + st.patched);
    // pre-highlight: an edge of the Top view under the cursor, no tool running
    var T2 = dwView('Top'), e = paperToClient([T2.box[0] + (T2.box[2] - T2.box[0]) * 0.7, T2.box[3] - 0.2]);
    svg().dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: e.clientX, clientY: e.clientY }));
    assert(D.querySelector('#dw-overlay .dw-hot.pre') && D.querySelector('#dw-overlay .dw-vbox'), 'edge and view frame pre-highlighted: ' + JSON.stringify(st.hover));
    // middle double-click: back to the whole sheet
    [0, 1].forEach(function () { svg().dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 1, clientX: e.clientX, clientY: e.clientY })); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, button: 1 })); });
    var S = anvil.drawing.summary().sheet.size;
    near(st.vb.w, Math.max(S[0], S[1]) * 0.06 + S[0], 1e-6, 'fitted width');
    anvil.drawing.close();
    return 'zoom, live drag, ' + st.patched + ' layer patched, pre-highlight, fit';
  });
  // --- end r3/drawings3 ---
