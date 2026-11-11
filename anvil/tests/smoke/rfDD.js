  // --- rfDD (2026-10-26, lane DD: drawing dimensions from the model) --- the Smart Dimension preview text follows the
  // pointer outside the extension lines and the click places it there; Hole Callout on a slot's end gives the slot
  // callout; the Search Commands list has its own list style
  var DD_PLATE = 'p.name("DDPlate").units("in");\np.sketch("Front").rect(0, 0, 4, 2).slot(1, 1, 2, 1, 0.375).extrude(0.25);';
  async function rfDDDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(DD_PLATE); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready();
    var dc = anvil.drawing.doc();
    if (dc.autoDims) { anvil.drawing.modelItems(false); await idle(); await UI.drawing.ready(); }
    UI.drawing.fit(); await wait(20);
    return anvil.drawing.summary();
  }
  function rfDDMouse(type, p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    svg.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: q.x, clientY: q.y, detail: 1 }));
  }
  function rfDDClick(p) { rfDDMouse('mousemove', p); rfDDMouse('mousedown', p); rfDDMouse('mouseup', p); }
  function rfDDFront() { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.orient === 'Front'; })[0]; }
  function rfDDPrevText() { var t = D.querySelector('#drawing-sheet .dw-sdprev-text'); return t ? { x: +t.getAttribute('x'), text: t.textContent } : null; }
  function rfDDEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }

  step('rfDD: Smart Dimension on the Front view\'s 4.000 bottom edge — the preview text is centred while the pointer is between the extension lines, goes outside and follows the pointer past the right one; the click puts the text where the preview showed it (one undo step)', async function () {
    await rfDDDrawing();
    var w = rfDDFront(), A = w.toSheet([0, 0]), B = w.toSheet([4, 0]), mid = (A[0] + B[0]) / 2, k = UI.drawing.state.sheet.units === 'in' ? 1 : 25.4;
    UI.drawing.smartDimension(); await wait(10);
    rfDDClick([mid + 0.3 * k, A[1]]); await wait(10);
    assert(UI.drawing.state.pending && UI.drawing.state.pending.first, 'the edge picked');
    var below = A[1] - 0.6 * k;
    rfDDMouse('mousemove', [mid + 0.4 * k, below]); await wait(10);
    var t1 = rfDDPrevText();
    assert(t1 && t1.text === '4.000' && Math.abs(t1.x - mid) < 1e-6, 'centred between the lines: ' + JSON.stringify(t1) + ' mid ' + mid);
    var far = B[0] + 1.6 * k;
    rfDDMouse('mousemove', [far, below]); await wait(10);
    var t2 = rfDDPrevText(), at2 = UI.drawing.state.pending.at;   // (mouse events land on whole pixels: the pointer's paper point)
    assert(t2 && Math.abs(t2.x - at2[0]) < 1e-6 && Math.abs(at2[0] - far) < UI.drawingInternal.pxToPaper(2.5), 'follows the pointer outside: ' + JSON.stringify(t2) + ' pointer ' + at2[0]);
    rfDDMouse('mousemove', [far + 0.5 * k, below]); await wait(10);
    var t3 = rfDDPrevText(), at3 = UI.drawing.state.pending.at;
    assert(t3 && Math.abs(t3.x - at3[0]) < 1e-6 && t3.x > t2.x + 0.4 * k, 'and on: ' + JSON.stringify(t3));
    var n0 = UI.App.undo.length;
    rfDDClick([far + 0.5 * k, below]); await idle(); await UI.drawing.ready(); await wait(20);
    var sd = UI.drawing.state.sheet.dims.filter(function (d) { return d.view === w.view.id && d.text === '4.000' && !d.auto; })[0];
    assert(sd && UI.App.undo.length === n0 + 1, 'placed, one undo step');
    var tp = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text' && p.text === '4.000' && p.layer === 'DIMENSIONS'; })[0];
    assert(tp && Math.abs(tp.p[0] - t3.x) < 1e-6, 'the text where the preview showed it: ' + (tp && tp.p[0]) + ' vs ' + t3.x);
    rfDDEnd();
    UI.undoCommand(); await idle(); await UI.drawing.ready(); await wait(20);
    assert(!UI.drawing.state.sheet.dims.some(function (d) { return d.view === w.view.id && !d.auto; }), 'Ctrl+Z takes it off');
    return 'preview ' + t1.x.toFixed(3) + ' -> ' + t3.x.toFixed(3);
  });

  step('rfDD: Annotation ▸ Hole Callout on the slot\'s end arc gives ".375 X 1.375 SLOT" (one undo step, in the DXF); on the plate\'s edge it asks for a hole or a slot', async function () {
    await rfDDDrawing();
    var w = rfDDFront(), n0 = UI.App.undo.length;
    UI.drawing.holeCallout(); await wait(10);
    // (rfKX) two clicks, as SolidWorks: the end arc picks the slot, the callout follows the pointer, the next click places it
    var se = w.toSheet([2.1875, 1]), sp = [se[0] + 0.6, se[1] + 0.5];
    rfDDClick(se); await wait(10);
    assert(UI.App.undo.length === n0 && UI.drawing.state.pending && UI.drawing.state.pending.pick, 'the first click picks the slot end, nothing placed yet');
    rfDDClick(sp); await idle(); await UI.drawing.ready(); await wait(20);
    var sd = UI.drawing.state.sheet.dims.filter(function (d) { return d.view === w.view.id && d.slotCallout; })[0];
    assert(sd && sd.text === '.375 X 1.375 SLOT', 'slot callout: ' + JSON.stringify(sd && sd.text) + ' | ' + UI.drawing.state.sheet.dims.map(function (d) { return d.text; }).join(' | '));
    assert(UI.App.undo.length === n0 + 1, 'one undo step');
    assert(anvil.drawing.dxf().indexOf('.375 X 1.375 SLOT') >= 0, 'in the DXF');
    rfDDClick(w.toSheet([4, 0.5])); await wait(10);
    assert(UI.App.undo.length === n0 + 1, 'an edge adds nothing');
    rfDDEnd();
    return sd.text;
  });

  step('rfDD: Search Commands lists its hits in a search list (no menu check column; the name with where it lives under it; a scrolling list), Esc closes it', async function () {
    var box = D.getElementById('cmd-search');
    assert(box, 'the search box');
    box.focus(); box.value = 'flat'; box.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(20);
    var m = D.querySelector('.menu.cmd-search-list');
    assert(m, 'the list');
    var cs = W.getComputedStyle(m), row = m.querySelector('.mi'), rs = W.getComputedStyle(row);
    assert(rs.display === 'grid' && cs.overflowY === 'auto', 'list style: ' + rs.display + ' / ' + cs.overflowY);
    var chk = row.querySelector('.chk'), name = row.children[2], where = row.querySelector('.key');
    assert(!chk || W.getComputedStyle(chk).display === 'none', 'no check column');
    assert(name && where && where.getBoundingClientRect().top >= name.getBoundingClientRect().bottom - 1, 'where it lives under the name');
    box.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(20);
    assert(!D.querySelector('.menu.cmd-search-list'), 'Esc closes it');
    return m.querySelectorAll('.mi').length + ' hits';
  });
  step('rfDD2: Model View PM — Dimension Type True is chosen for the Isometric, no choice for Front; the placed isometric reads True; its Properties PM shows True and Projected saves Projected (one undo step)', async function () {
    await rfDDDrawing();
    UI.drawing.modelView(); await wait(30);
    function rad(v) { return D.querySelector('input[name="pm-dimType"][value="' + v + '"]'); }
    assert(rad('true') && rad('true').checked && !rad('true').disabled, 'True chosen for the Isometric');
    var fb = Array.prototype.filter.call(D.querySelectorAll('button'), function (b) { return b.textContent === 'Front' && b.closest('#pm, .pm, [class*=pm]'); })[0];
    assert(fb, 'the Front button');
    fb.click(); await wait(20);
    assert(!rad('true'), 'no Dimension Type for Front (an orthographic view reads true lengths)');
    rfDDEnd();
    var iso = anvil.drawing.doc().views.filter(function (v) { return v.orient === 'Isometric'; })[0];
    assert(iso && iso.dimType === 'true', 'the Standard 3 View isometric reads True');
    UI.drawing.viewProperties(iso.id); await wait(30);
    assert(rad('true').checked && !rad('true').disabled, 'Properties: True');
    var n0 = UI.App.undo.length;
    rad('projected').click(); await wait(10);
    UI.pmOK(); await idle(); await UI.drawing.ready(); await wait(20);
    var iso2 = anvil.drawing.doc().views.filter(function (v) { return v.id === iso.id; })[0];
    assert(!iso2.dimType && UI.App.undo.length === n0 + 1, 'Projected saved, one undo step: ' + iso2.dimType);
    rfDDEnd();
    return 'ok';
  });
  // --- end rfDD ---
