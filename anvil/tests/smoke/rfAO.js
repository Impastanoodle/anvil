  // ---- rfAO (2026-10-13): the drawing Sketch tab (sketch entities on the sheet / in a view, relations, driving
  // dimensions), Line Format, Hide / Show Edges, Relative View
  var RFAO_PART = 'p.name("AOBracket").units("in");\np.sketch("Front").polyline([[0, 0], [3, 0], [3, 1], [2, 2], [0, 2]], true).end().extrude(1);';
  async function rfAODrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(RFAO_PART); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready();
    if (!dwView('Front')) { anvil.drawing.standard3View(); await idle(); await UI.drawing.ready(); }
    UI.drawing.fit(); await wait(20);
    return anvil.drawing.summary();
  }
  function rfAOClick(p, opts) {
    sheetMouse('mousemove', p);
    var c = paperToClient(p), svg = D.querySelector('#drawing-sheet svg');
    svg.dispatchEvent(new W.MouseEvent('mousedown', Object.assign({ bubbles: true, cancelable: true, button: 0 }, c, opts || {})));
    svg.dispatchEvent(new W.MouseEvent('mouseup', Object.assign({ bubbles: true, cancelable: true, button: 0 }, c)));
  }
  // a free spot of w x h on the sheet (no view, inside the border, above the title block)
  function rfAOFree(w, h) {
    var st = UI.drawing.state, S = st.sheet.size, boxes = st.sheet.views.map(function (x) { return x.box; });
    for (var y = S[1] - 1 - h; y > 3; y -= 0.25) for (var x = 1; x + w < S[0] - 1; x += 0.25) {
      var ok = boxes.every(function (b) { return x + w < b.x0 - 0.4 || x > b.x1 + 0.4 || y + h < b.y0 - 0.4 || y > b.y1 + 0.4; });
      if (ok) return [x, y];
    }
    return [0.8, S[1] - 0.8 - h];   // (a part that fills the sheet: over a view, which the sketch tools allow)
  }
  function rfAOList(t) { return anvil.drawing.sketch.list().filter(function (e) { return !t || e.t === t; }); }
  function rfAOCtx(text) { return Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent.indexOf(text) >= 0; }).map(function (m) { return { row: m }; }); }
  function rfAOModalButton(text) { return Array.prototype.filter.call(D.querySelectorAll('#modal button'), function (b) { return b.textContent.trim() === text; })[0]; }
  step('rfAO: the drawing\'s Sketch tab shows its own tools (not the Sheet Format ribbon); Line chains with Horizontal / Vertical inference and Coincident ends; Corner Rectangle, Circle, Centerpoint Arc, Spline, Point and Text land on the SKETCH layer of the sheet, the SVG and the DXF', async function () {
    var errs0 = errors.length;
    await rfAODrawing();
    assert(ribbonTabs().indexOf('Sketch') >= 0, 'tabs ' + ribbonTabs().join(','));
    var tabEl = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === 'Sketch'; })[0];
    assert(tabEl && !tabEl.classList.contains('off'), 'the Sketch tab is live');
    dwTab('Sketch'); await idle();
    ['Smart Dimension', 'Line', 'Corner Rectangle', 'Circle', 'Centerpoint Arc', 'Spline', 'Point', 'Text', 'Line Format', 'Hide/Show Edges'].forEach(function (l) { assert(ribbonButton(l), l); });
    assert(!Array.prototype.some.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return x.getAttribute('aria-label') === 'Edit Sheet Format'; }), 'not the Sheet Format ribbon');
    var o = rfAOFree(6, 3.5);
    // Line: three clicks, the second 0.05 high (levelled: Horizontal), the third straight up (Vertical)
    ribbonButton('Line').click();
    assert(UI.drawing.state.tool === 'sk:line', 'Line tool ' + UI.drawing.state.tool);
    rfAOClick([o[0], o[1]]); rfAOClick([o[0] + 2, o[1] + 0.05]); rfAOClick([o[0] + 2, o[1] + 1.2]);
    key('Escape'); await idle();
    var L = rfAOList('line');
    assert(L.length === 2, 'two lines ' + L.length);
    assert(Math.abs(L[0].a[1] - L[0].b[1]) < 1e-9 && Math.abs(L[1].a[0] - L[1].b[0]) < 1e-9, 'levelled and plumb ' + JSON.stringify(L.map(function (l) { return [l.a, l.b]; })));
    var R = rfAOList('rel');
    assert(R.some(function (r) { return r.kind === 'H' && r.of === L[0].id; }) && R.some(function (r) { return r.kind === 'V' && r.of === L[1].id; }) && R.some(function (r) { return r.kind === 'coincident'; }), 'relations ' + R.map(function (r) { return r.kind; }).join(','));
    // Corner Rectangle, Circle, Centerpoint Arc, Spline, Point
    ribbonButton('Corner Rectangle').click(); rfAOClick([o[0] + 3, o[1]]); rfAOClick([o[0] + 4.5, o[1] + 1]);
    assert(rfAOList('line').length === 6, 'rectangle: four more lines');
    ribbonButton('Circle').click(); rfAOClick([o[0] + 0.6, o[1] + 2.5]); rfAOClick([o[0] + 1.1, o[1] + 2.5]);
    ribbonButton('Centerpoint Arc').click(); rfAOClick([o[0] + 2.5, o[1] + 2.5]); rfAOClick([o[0] + 3, o[1] + 2.5]); rfAOClick([o[0] + 2.5, o[1] + 3]);
    ribbonButton('Spline').click(); rfAOClick([o[0] + 3.5, o[1] + 2.2]); rfAOClick([o[0] + 4.2, o[1] + 3]); rfAOClick([o[0] + 5, o[1] + 2.4]); rfAOClick([o[0] + 5, o[1] + 2.4]);
    ribbonButton('Point').click(); rfAOClick([o[0] + 5.5, o[1] + 0.5]);
    ribbonButton('Text').click(); rfAOClick([o[0] + 0.2, o[1] + 3.3]);
    var inp = D.querySelector('#modal input[type="text"]');
    assert(modalOpen() && inp, 'Text asks for its text');
    inp.value = 'TACK WELD 4 PLCS'; rfAOModalButton('OK').click(); await idle();
    key('Escape'); await idle(); await UI.drawing.ready();
    var c = rfAOList('circle')[0], a = rfAOList('arc')[0], sp = rfAOList('spline')[0];
    assert(c && Math.abs(c.r - 0.5) < 0.01, 'circle r .5 ' + (c && c.r));
    assert(a && Math.abs(a.r - 0.5) < 0.01 && Math.abs(a.a0) < 1 && Math.abs(a.a1 - 90) < 1, 'arc 0..90 ' + JSON.stringify(a));
    assert(sp && sp.pts.length === 3 && rfAOList('point').length === 1 && rfAOList('text')[0].text === 'TACK WELD 4 PLCS', 'spline, point, text');
    var g = D.querySelector('#drawing-sheet svg g[data-layer="SKETCH"]');
    assert(g && g.querySelectorAll('line').length >= 6 && g.querySelector('circle') && /TACK WELD/.test(g.textContent), 'SKETCH layer on the sheet');
    var dxf = anvil.drawing.dxf({ version: 'R2000' });
    assert(/\nSKETCH\r?\n/.test(dxf) && dxf.indexOf('TACK WELD 4 PLCS') > 0, 'DXF SKETCH layer');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return rfAOList().length + ' items';
  });
  step('rfAO: select / drag / Delete sketch entities — a rectangle\'s corner dragged keeps it square (Coincident, H, V hold); double-click a line for Line Properties (Length drives it); Smart Dimension on a sketch circle is driving; Line Format PM sets Phantom / Thick on the selection; undo', async function () {
    var errs0 = errors.length;
    await rfAODrawing();
    var o = rfAOFree(5, 3), ids = anvil.drawing.sketch.rect([o[0], o[1]], [o[0] + 2, o[1] + 1]);
    await idle(); await UI.drawing.ready();
    var corner = [o[0] + 2, o[1] + 1];
    sheetMouse('mousemove', corner);
    assert(UI.drawing.state.hover && UI.drawing.state.hover.kind === 'sk' && UI.drawing.state.hover.end, 'corner pre-highlighted ' + JSON.stringify(UI.drawing.state.hover));
    sheetMouse('mousedown', corner);
    W.dispatchEvent(new W.MouseEvent('mousemove', Object.assign({ bubbles: true }, paperToClient([corner[0] + 0.25, corner[1] + 0.25]))));
    W.dispatchEvent(new W.MouseEvent('mousemove', Object.assign({ bubbles: true }, paperToClient([corner[0] + 0.5, corner[1] + 0.5]))));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true })); await idle();
    var L = ids.map(function (id) { return anvil.drawing.sketch.get(id); });
    assert(Math.abs(L[1].b[0] - (o[0] + 2.5)) < 0.01 && Math.abs(L[1].b[1] - (o[1] + 1.5)) < 0.01, 'corner moved ' + JSON.stringify(L[1].b));
    assert(Math.abs(L[2].a[1] - L[2].b[1]) < 1e-9 && Math.abs(L[1].a[0] - L[1].b[0]) < 1e-9 && Math.abs(L[2].a[0] - L[1].b[0]) < 1e-9 && Math.abs(L[0].a[0] - o[0]) < 1e-9, 'still a rectangle ' + JSON.stringify(L.map(function (l) { return [l.a, l.b]; })));
    // undo puts the corner back
    UI.undo(); await idle();
    assert(Math.abs(anvil.drawing.sketch.get(ids[1]).b[0] - (o[0] + 2)) < 1e-9, 'undo');
    // double-click the bottom line: Line Properties, Length 3 drives it
    var mid = [o[0] + 1, o[1]];
    sheetMouse('dblclick', mid); await idle();
    assert(UI.hasPM() && /Line Properties/.test(D.querySelector('#pm').textContent) && /Horizontal/.test(D.querySelector('#pm').textContent), 'Line Properties with its relations');
    var len = D.querySelector('#pm input[data-key="length"]');
    assert(len, 'Length box');
    len.value = '3'; len.dispatchEvent(new W.Event('input', { bubbles: true })); len.dispatchEvent(new W.Event('change', { bubbles: true }));
    UI.pmOK(); await idle();
    var b0 = anvil.drawing.sketch.get(ids[0]);
    assert(Math.abs(b0.b[0] - b0.a[0] - 3) < 1e-6 && Math.abs(anvil.drawing.sketch.get(ids[1]).a[0] - (o[0] + 3)) < 1e-6, 'length 3, the right side follows ' + JSON.stringify(b0));
    // Smart Dimension on a sketch circle (driving)
    var ci = anvil.drawing.sketch.add({ t: 'circle', c: [o[0] + 4, o[1] + 2], r: 0.25 }); await idle(); await UI.drawing.ready();
    ribbonButton('Smart Dimension').click();
    rfAOClick([o[0] + 4.25, o[1] + 2]); await idle();
    var dm = rfAOList('dim')[0];
    assert(dm && dm.kind === 'dia' && Math.abs(dm.val - 0.5) < 1e-9, 'Ø.5 sketch dimension ' + JSON.stringify(dm));
    key('Escape'); await idle();
    anvil.drawing.sketch.setDim(dm.id, 0.75); await idle();
    assert(Math.abs(anvil.drawing.sketch.get(ci.id).r - 0.375) < 1e-9, 'driving');
    assert(/Ø\.750/.test(D.querySelector('#drawing-sheet svg g[data-layer="SKETCH"]').textContent), 'Ø.750 on the sheet: ' + D.querySelector('#drawing-sheet svg g[data-layer="SKETCH"]').textContent);
    // select two lines (Ctrl) and Line Format: Phantom, Thick
    rfAOClick([o[0] + 1.5, o[1]]); rfAOClick([o[0], o[1] + 0.5], { ctrlKey: true });
    assert(UI.drawing.state.sel && UI.drawing.state.sel.ids.length === 2, 'two selected ' + JSON.stringify(UI.drawing.state.sel));
    dwTab('Sketch'); ribbonButton('Line Format').click(); await idle();
    assert(UI.hasPM() && /Line Format/.test(D.querySelector('#pm').textContent), 'Line Format PM');
    var ss = D.querySelector('#pm select[data-key="style"]'), sw = D.querySelector('#pm select[data-key="weight"]');
    ss.value = 'phantom'; ss.dispatchEvent(new W.Event('change', { bubbles: true }));
    sw.value = 'thick'; sw.dispatchEvent(new W.Event('change', { bubbles: true }));
    UI.pmOK(); await idle(); await UI.drawing.ready();
    var f0 = anvil.drawing.sketch.get(ids[0]), f3 = anvil.drawing.sketch.get(ids[3]);
    assert(f0.style === 'phantom' && f0.weight === 'thick' && f3.style === 'phantom' && !anvil.drawing.sketch.get(ids[1]).style, 'formatted ' + JSON.stringify([f0.style, f3.style]));
    assert(/PHANTOM/.test(anvil.drawing.dxf({ version: 'R2000' })), 'DXF PHANTOM');
    // Delete removes the selection (and its relations)
    rfAOClick([o[0] + 1.5, o[1]]);
    key('Delete'); await idle();
    assert(!anvil.drawing.sketch.get(ids[0]) && !rfAOList('rel').some(function (r) { return r.of === ids[0] || (r.refs || []).some(function (q) { return q.id === ids[0]; }); }), 'deleted with its relations');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'ok';
  });
  step('rfAO: a sketch drawn inside a view moves with the view; right-click a view edge ▸ Hide Edge, Show Hidden Edges; Hide/Show Edges tool toggles; Line Format on a view edge (Center)', async function () {
    var errs0 = errors.length;
    await rfAODrawing();
    var fv = dwView('Front'), st = UI.drawing.state, w = st.sheet.views.filter(function (x) { return x.view.id === fv.id; })[0];
    dwTab('Sketch'); ribbonButton('Line').click();
    var p0 = [(w.box.x0 + w.box.x1) / 2 - 0.3, (w.box.y0 + w.box.y1) / 2], p1 = [p0[0] + 0.6, p0[1] + 0.3];
    rfAOClick(p0); rfAOClick(p1); key('Escape'); await idle();
    var ln = rfAOList('line')[0];
    assert(ln && ln.view === fv.id, 'the line belongs to the Front view ' + JSON.stringify(ln));
    var vx = anvil.drawing.doc().views.filter(function (v) { return v.id === fv.id; })[0];
    W.Drawing.moveView(UI.drawingInternal.doc(), fv.id, vx.x + 1, vx.y); UI.drawing.render(); await idle();
    assert(Math.abs(anvil.drawing.sketch.get(ln.id).a[0] - (ln.a[0] + 1)) < 1e-9, 'moved with the view ' + anvil.drawing.sketch.get(ln.id).a[0] + ' from ' + ln.a[0]);
    await UI.drawing.ready();
    // a view edge: the Front view's bottom edge
    st = UI.drawing.state; w = st.sheet.views.filter(function (x) { return x.view.id === fv.id; })[0];
    var e = w.proj.lines.visible.filter(function (l) { return Math.abs(l[1]) < 1e-9 && Math.abs(l[3]) < 1e-9; })[0];
    assert(e, 'bottom edge');
    var ea = w.toSheet([e[0], e[1]]), eb = w.toSheet([e[2], e[3]]), em = [(ea[0] + eb[0]) / 2, (ea[1] + eb[1]) / 2];
    var nLayer = function () { var gg = D.querySelector('#drawing-sheet svg g[data-view="' + fv.id + '"]'); return gg ? gg.querySelectorAll('line, path').length : 0; };
    var n0 = nLayer(), c = paperToClient(em);
    D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: c.clientX, clientY: c.clientY }));
    var rows = rfAOCtx('Hide Edge');
    assert(rows.length, 'Hide Edge in the view menu');
    rows[0].row.click(); if (UI.closeMenus) UI.closeMenus(); await idle(); await UI.drawing.ready();
    assert(W.Drawing.hiddenEdges(anvil.drawing.doc(), fv.id).length === 1 && nLayer() < n0, 'hidden ' + nLayer() + ' < ' + n0);
    D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: c.clientX, clientY: c.clientY }));
    rows = rfAOCtx('Show Hidden Edges');
    assert(rows.length, 'Show Hidden Edges');
    rows[0].row.click(); if (UI.closeMenus) UI.closeMenus(); await idle(); await UI.drawing.ready();
    assert(!W.Drawing.hiddenEdges(anvil.drawing.doc(), fv.id).length && nLayer() === n0, 'shown');
    // the Hide/Show Edges tool: click hides, the grey copy shows, click again shows it
    dwTab('Sketch'); ribbonButton('Hide/Show Edges').click();
    rfAOClick(em); await idle(); await UI.drawing.ready();
    assert(W.Drawing.hiddenEdges(anvil.drawing.doc(), fv.id).length === 1, 'tool hides');
    sheetMouse('mousemove', em);
    assert(D.querySelector('#dw-overlay .dw-sk-hidden'), 'hidden edge drawn grey');
    rfAOClick(em); await idle(); await UI.drawing.ready();
    assert(!W.Drawing.hiddenEdges(anvil.drawing.doc(), fv.id).length, 'tool shows it again');
    key('Escape'); await idle();
    anvil.drawing.sketch.edgeFormat(fv.id, W.Drawing.edgeKey({ la: [e[0], e[1]], lb: [e[2], e[3]] }), { style: 'center' }); await idle(); await UI.drawing.ready();
    assert(D.querySelector('#drawing-sheet svg g[data-view="' + fv.id + '"] .center'), 'a center-line edge');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return n0 + ' lines';
  });
  step('rfAO: Relative View — View Layout ▸ Relative View, pick the 45° face then the front face in the Isometric, Second: Top; OK and place: the view looks square at the 45° face with True dimensions; Insert ▸ Drawing View ▸ Relative To Model is listed', async function () {
    var errs0 = errors.length;
    await rfAODrawing();
    var iso = dwView('Isometric'), st = UI.drawing.state, w = st.sheet.views.filter(function (x) { return x.view.id === iso.id; })[0];
    assert(w, 'isometric');
    // sheet points over the two faces: project a point of each face into the isometric
    var F = w.frame, mesh = UI.App.mesh, f45 = -1, ffr = -1;
    mesh.faces.forEach(function (f, i) { if (Math.abs(f.normal[0] - Math.SQRT1_2) < 1e-6 && Math.abs(f.normal[1] - Math.SQRT1_2) < 1e-6) f45 = i; if (f.normal[2] > 1 - 1e-9) ffr = i; });
    function at(fi) { var c = mesh.faces[fi].centroid; return w.toSheet([c[0] * F.u[0] + c[1] * F.u[1] + c[2] * F.u[2], c[0] * F.v[0] + c[1] * F.v[1] + c[2] * F.v[2]]); }
    ribbonButton('Relative View').click(); await idle();
    assert(UI.hasPM() && /Relative View/.test(D.querySelector('#pm').textContent) && UI.drawing.state.tool === 'sk:relpick', 'Relative View PM');
    rfAOClick(at(f45)); rfAOClick(at(ffr)); await idle();
    assert(/Face/.test(D.querySelector('#pm').textContent), 'faces listed');
    var sel = D.querySelector('#pm select[data-key="second"]');
    sel.value = 'Top'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
    UI.pmOK(); await idle(); await wait(10);
    assert(UI.drawing.state.tool === 'sk:relplace', 'placing ' + UI.drawing.state.tool);
    var spot = rfAOFree(3, 2), n0 = anvil.drawing.doc().views.length;
    rfAOClick([spot[0] + 1.5, spot[1] + 1]); await idle(); await UI.drawing.ready();
    var dv = anvil.drawing.doc().views;
    assert(dv.length === n0 + 1, 'placed');
    var rv = dv[dv.length - 1], Fr = W.Drawing.viewFrame(anvil.drawing.doc(), rv);
    assert(rv.relative && rv.dimType === 'true' && Math.abs(Fr.e[0] - Math.SQRT1_2) < 1e-9 && Math.abs(Fr.v[2] - 1) < 1e-9, 'frame ' + JSON.stringify(Fr));
    var rw = UI.drawing.state.sheet.views.filter(function (x) { return x.view.id === rv.id; })[0];
    assert(rw && rw.trueDims && rw.proj.lines.visible.length >= 4, 'drawn, True dimensions');
    assert(menuRows('Drawing View ▸ Relative To Model').length === 1, 'Insert menu entry');
    if (UI.closeMenus) UI.closeMenus();
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return rv.orient;
  });
  // --- end rfAO ---
