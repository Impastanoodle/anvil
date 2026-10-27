  // --- rfW: drawing UI (Dimension PM on a click, live previews while placing, view PropertyManagers, View Layout tab) ---
  async function rfWDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(plateCode()); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    await UI.drawing.ready();
  }
  function rfWDims() { return UI.drawing.state.sheet.dims; }
  function rfWMid(d) { return [(d.box.x0 + d.box.x1) / 2, (d.box.y0 + d.box.y1) / 2]; }
  function rfWClick(p) { sheetMouse('mousedown', p); sheetMouse('mouseup', p); }
  function rfWPM() { return UI.hasPM() ? UI.pmTitle() : null; }
  function rfWTab(name) { var t = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === name; })[0]; assert(t, 'tab ' + name); t.click(); }
  step('rfW: a single click on a drawing dimension opens its Dimension PM with the keyboard left on the sheet (Delete deletes it); a click elsewhere or a part change closes it and the dimensions follow the part', async function () {
    var errs0 = errors.length;
    await rfWDrawing();
    var dims = rfWDims(), n = dims.length;
    assert(n >= 2, 'model items ' + n);
    rfWClick(rfWMid(dims[0]));
    assert(rfWPM() === 'Dimension' && UI.pmSpec().noFocus, 'Dimension PM on a click: ' + rfWPM());
    assert(!$('pm').contains(D.activeElement), 'the keyboard stays on the sheet');
    assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'dim', 'selected');
    // a click on another dimension shows that one
    var i1 = UI.pmSpec().dimRef.index, k1 = UI.pmSpec().dimRef.view;
    rfWClick(rfWMid(rfWDims()[1]));
    assert(rfWPM() === 'Dimension' && (UI.pmSpec().dimRef.index !== i1 || UI.pmSpec().dimRef.view !== k1 || UI.pmSpec().dimRef.style !== dims[0].style), 'the second dimension\'s PM');
    // a drag does not open it (and leaves the open one alone)
    rfWClick([5, 5]);
    assert(!UI.hasPM(), 'a click on the empty sheet closes it');
    var d2 = rfWDims()[1], m2 = rfWMid(d2);
    sheetMouse('mousedown', m2); sheetMouse('mousemove', [m2[0], m2[1] + 6]); sheetMouse('mouseup', [m2[0], m2[1] + 6]);
    assert(!UI.hasPM(), 'a drag opens no PM');
    await UI.undo(); await idle(); await wait(40); await UI.drawing.ready();   // (rfDR2: views from the worker)
    // Delete with the PM open deletes the dimension and closes the PM
    rfWClick(rfWMid(rfWDims()[0]));
    assert(rfWPM() === 'Dimension', 'open again');
    key('Delete'); await wait(40);
    assert(rfWDims().length === n - 1 && !UI.hasPM(), 'Delete: ' + rfWDims().length + ' PM ' + rfWPM());
    await UI.undo(); await idle(); await wait(60); await UI.drawing.ready();
    assert(rfWDims().length === n, 'undo brings it back');
    // a part change with the PM open: the PM closes and the sheet follows the thicker plate
    rfWClick(rfWMid(rfWDims()[0]));
    assert(rfWPM() === 'Dimension', 'open before the part change');
    var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude' && !x.cut; })[0];
    UI.pushUndo(); f.depth = 12;
    await UI.rebuild(); await idle(); await wait(80);
    assert(!UI.hasPM(), 'the part change closed it');
    assert(JSON.stringify(dwView('Front').extents) === '[100,12]', 'the sheet follows: ' + JSON.stringify(dwView('Front').extents));
    await UI.undo(); await idle(); await wait(80);
    assert(JSON.stringify(dwView('Front').extents) === '[100,8]', 'undo back to 8');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return n + ' dimensions';
  });
  function rfWSheetView(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfWAt(id, uv) { return rfWSheetView(id).toSheet(uv); }
  function rfWOver(sel) { return D.querySelectorAll('#dw-overlay ' + sel); }
  function rfWPts(n) { return n.getAttribute('points').trim().split(/\s+/).length; }
  async function rfWSectionTool(type) {
    ribbonButton('Section View').click();
    var ty = D.querySelector('#pm select[data-key="type"]');
    ty.value = type; ty.dispatchEvent(new W.Event('change'));
    await UI.pmOK(); await idle();
    assert(UI.drawing.state.tool === 'section' && UI.drawing.state.pending.type === type, 'section tool ' + type);
  }
  step('rfW: live previews while placing — every leg of an offset / half / aligned cutting line follows the pointer, the auxiliary view\'s outline slides along its arrow and lands where shown, the crop rectangle and the break lines are drawn as they are placed', async function () {
    var errs0 = errors.length;
    await anvil.run('p.units("mm");\np.sketch("Front").rect(0, 0, 100, 50).circle(20, 15, 5).circle(80, 35, 5).extrude(10);');
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    await UI.drawing.ready();
    var F = dwView('Front'), fw = rfWSheetView(F.id), above = [fw.view.x, fw.box.y1 + 30];
    // offset: the second leg at the pointer inside the view (no outline yet), then the view outline outside it
    await rfWSectionTool('offset');
    rfWClick(rfWAt(F.id, [20, 15]));
    sheetMouse('mousemove', rfWAt(F.id, [80, 35]));
    var legs = rfWOver('polyline.dw-legs');
    assert(legs.length === 1 && rfWPts(legs[0]) === 4 && !rfWOver('.dw-ghost').length, 'two legs and the step at the pointer: ' + (legs[0] && legs[0].getAttribute('points')));
    rfWClick(rfWAt(F.id, [80, 35]));
    sheetMouse('mousemove', rfWAt(F.id, [50, 45]));
    assert(rfWPts(rfWOver('polyline.dw-legs')[0]) === 6, 'a third leg previewed');
    sheetMouse('mousemove', above);
    assert(rfWPts(rfWOver('polyline.dw-legs')[0]) === 4 && rfWOver('.dw-ghost').length === 1, 'outside: the two legs clicked and the view outline');
    key('Escape'); await wait(20);
    // half: the L-shaped line from the centre
    await rfWSectionTool('half');
    rfWClick(rfWAt(F.id, [50, 15]));
    sheetMouse('mousemove', above);
    legs = rfWOver('polyline.dw-legs');
    assert(legs.length === 1 && rfWPts(legs[0]) === 3 && rfWOver('.dw-ghost').length === 1, 'half: L line and outline');
    key('Escape'); await wait(20);
    // aligned: the second leg follows the pointer from the centre
    await rfWSectionTool('aligned');
    rfWClick(rfWAt(F.id, [50, 25]));
    var low = rfWAt(F.id, [50, 5]);
    sheetMouse('mousemove', low);
    legs = rfWOver('polyline.dw-legs');
    var pts = legs[0].getAttribute('points').trim().split(/\s+/).map(function (s) { return s.split(',').map(Number); });
    assert(pts.length === 3 && Math.abs(pts[2][0] - low[0]) < 0.5 && pts[2][1] > pts[1][1], 'second leg straight down to the pointer: ' + legs[0].getAttribute('points'));
    key('Escape'); await wait(20);
    // Auxiliary View off the top edge: the outline moves straight up with the pointer and the view lands there
    ribbonButton('Auxiliary View').click();
    var edgePt = rfWAt(F.id, [60, 50]);
    sheetMouse('mousemove', edgePt);
    assert(UI.drawing.state.hover && UI.drawing.state.hover.la, 'the straight edge pre-highlights');
    rfWClick(edgePt);
    var to = [fw.view.x + 37, fw.box.y1 + 45];
    sheetMouse('mousemove', to);
    var pv = UI.drawing.state.preview;
    assert(pv && pv.kind === 'aux' && rfWOver('.dw-ghost').length === 1 && rfWOver('.dw-aux-axis').length === 1, 'outline and axis ' + JSON.stringify(pv));
    near(pv.x, rfWAt(F.id, [50, 0])[0], 1e-6, 'slides only along its axis (up)');
    rfWClick(to); await idle(); await wait(60);
    var av = anvil.drawing.doc().views.filter(function (v) { return v.kind === 'aux'; })[0];
    assert(av, 'placed');
    near(av.x, pv.x, 1e-6, 'x where shown'); near(av.y, pv.y, 1e-6, 'y where shown');
    await UI.undo(); await idle(); await wait(40);
    // Crop View: the rectangle as it is dragged out
    ribbonButton('Crop View').click(); await UI.pmOK(); await idle();
    var c0 = rfWAt(F.id, [-2, -2]), c1 = rfWAt(F.id, [60, 30]);
    rfWClick(c0); sheetMouse('mousemove', c1);
    var cr = rfWOver('rect.dw-crop');
    assert(cr.length === 1 && Math.abs(+cr[0].getAttribute('width') - (c1[0] - c0[0])) < 0.5 && Math.abs(+cr[0].getAttribute('height') - (c1[1] - c0[1])) < 0.5, 'crop rectangle');
    key('Escape'); await wait(20);
    // Break: one line at the pointer, then the first fixed and the second at the pointer
    ribbonButton('Break').click(); await UI.pmOK(); await idle();
    sheetMouse('mousemove', rfWAt(F.id, [30, 25]));
    assert(rfWOver('polyline.dw-break').length === 1, 'first break line at the pointer');
    rfWClick(rfWAt(F.id, [30, 25])); sheetMouse('mousemove', rfWAt(F.id, [70, 25]));
    var bl = rfWOver('polyline.dw-break');
    assert(bl.length === 2 && rfWPts(bl[0]) === 6, 'two zig zag break lines ' + bl.length);
    key('Escape'); await wait(20);
    assert(!rfWOver('polyline').length && anvil.drawing.doc().views.filter(function (v) { return v.id === F.id; })[0].breaks == null, 'Esc leaves nothing');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'previews drawn';
  });
  function rfWButton(text) { return Array.prototype.filter.call(D.querySelectorAll('#pm .pm-btns button'), function (b) { return b.textContent === text; })[0]; }
  step('rfW: view PropertyManagers as SolidWorks — Model View (standard-view buttons, Display Style, Use sheet / custom scale, Auto-start projected view chains Projected View until Esc); Section View Flip direction and custom scale; Detail and Auxiliary View PMs open with their tools (label, scale, Flip direction)', async function () {
    var errs0 = errors.length;
    await anvil.run('p.units("mm");\np.sketch("Front").rect(0, 0, 100, 50).circle(20, 15, 5).circle(80, 35, 5).extrude(10);');
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    await UI.drawing.ready();
    var n0 = anvil.drawing.summary().views.length;
    // Model View
    ribbonButton('Model View').click();
    assert(UI.pmTitle() === 'Model View', 'Model View PM');
    ['Front', 'Top', 'Right', 'Back', 'Bottom', 'Left', 'Isometric'].forEach(function (t) { assert(rfWButton(t), 'orientation button ' + t); });
    ['Auto-start projected view', 'Hidden Lines Visible', 'Hidden Lines Removed', 'Use sheet scale (1:1)', 'Use custom scale'].forEach(function (t) { assert(pmField(t), 'field ' + t); });
    assert(pmField('Auto-start projected view').checked && pmField('Use sheet scale (1:1)').checked, 'defaults: auto-start on, sheet scale');
    assert(pmField('Projected') && pmField('True') && !pmField('True').disabled, 'Dimension Type on a pictorial view (True enabled, rfZ)');
    rfWButton('Back').click();
    assert(UI.pmSpec().values.orient === 'Back' && rfWButton('Back').classList.contains('on') && pmField('View').value === 'Back', 'Back pressed');
    assert(!pmField('Projected'), 'no Dimension Type on an orthographic view');
    rfTRadio('Use custom scale');
    assert(pmField('Scale') && pmField('Scale').tagName === 'SELECT', 'custom scale list');
    setInput(pmField('Scale'), '1:2');
    await UI.pmOK();
    sheetMouse('mousemove', [80, 230]); sheetMouse('mousedown', [80, 230]); await idle(); await wait(40);
    var back = anvil.drawing.doc().views.filter(function (v) { return v.orient === 'Back'; })[0];
    assert(back && back.scale && back.scale[0] === 1 && back.scale[1] === 2, 'Back view at 1:2 ' + JSON.stringify(back && back.scale));
    assert(UI.drawing.state.tool === 'project' && UI.drawing.state.pending.parent === back.id, 'Projected View follows from it');
    sheetMouse('mousemove', [160, 230]); sheetMouse('mousedown', [160, 230]); await idle(); await wait(40);
    assert(anvil.drawing.summary().views.length === n0 + 2 && UI.drawing.state.tool === 'project', 'one projection placed, the tool goes on');
    key('Escape'); await wait(20);
    assert(UI.drawing.state.tool === null, 'Esc ends it');
    // Section View: Flip direction looks the other way, custom scale
    var F = dwView('Front'), fw = rfWSheetView(F.id);
    async function sect(flip) {
      ribbonButton('Section View').click();
      assert(pmField('Flip direction') && pmField('Use parent scale').checked, 'Section View PM fields');
      if (flip) { pmField('Flip direction').click(); rfTRadio('Use custom scale'); setInput(D.querySelector('#pm select[data-key="scale"]'), '2:1'); }   // (rfZ: "Scale with model changes" also has Scale in its label)
      await UI.pmOK(); await idle();
      rfWClick(rfWAt(F.id, [50, 25]));
      rfWClick([fw.view.x, fw.box.y1 + 40]); await idle(); await wait(60);
      var docs = anvil.drawing.doc().views.filter(function (v) { return v.kind === 'section'; });
      return docs[docs.length - 1];
    }
    var s1 = await sect(false); await UI.undo(); await idle(); await wait(40);
    var s2 = await sect(true);
    assert(s1.section.sign === -s2.section.sign && !s1.scale && s2.scale[0] === 2 && s2.scale[1] === 1, 'flipped and 2:1: ' + JSON.stringify([s1.section, s2.section, s2.scale]));
    await UI.undo(); await idle(); await wait(40);
    // Detail View: its PM opens with the tool; label and custom scale go into the view
    ribbonButton('Detail View').click();
    assert(UI.drawing.state.tool === 'detail' && UI.pmTitle() === 'Detail View' && UI.pmSpec().noFocus, 'Detail View PM with the tool');
    assert(pmField('Profile') && !pmField('Profile').disabled, 'Profile enabled (rfZ)');
    setInput(pmField('Label'), 'Z'); rfTRadio('Use custom scale'); setInput(pmField('Scale'), '4:1');
    var c = rfWAt(F.id, [20, 15]);
    rfWClick(c); rfWClick([c[0] + 6, c[1]]); rfWClick([330, 120]); await idle(); await wait(60);
    var dv = anvil.drawing.doc().views.filter(function (v) { return v.kind === 'detail'; })[0];
    assert(dv && dv.label === 'Z' && dv.scale[0] === 4 && dv.scale[1] === 1 && !UI.hasPM() && UI.drawing.state.tool === null, 'Detail View Z (4:1) ' + JSON.stringify(dv && [dv.label, dv.scale]));
    // Auxiliary View: Arrow label and Flip direction
    ribbonButton('Auxiliary View').click();
    assert(UI.drawing.state.tool === 'aux' && UI.pmTitle() === 'Auxiliary View' && pmField('Flip direction'), 'Auxiliary View PM with the tool');
    setInput(pmField('Label'), 'K'); pmField('Flip direction').click();
    var ep = rfWAt(F.id, [60, 50]);
    rfWClick(ep); rfWClick([ep[0], ep[1] + 50]); await idle(); await wait(60);
    var av = anvil.drawing.doc().views.filter(function (v) { return v.kind === 'aux'; })[0];
    assert(av && av.label === 'K' && av.aux.sign === -1 && !UI.hasPM(), 'Auxiliary View K, flipped ' + JSON.stringify(av && av.aux));
    ribbonButton('Auxiliary View').click();
    D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(20);   // (from the page, as a real key)
    assert(!UI.hasPM() && UI.drawing.state.tool === null, 'Esc closes the PM and ends the tool');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Back 1:2, sections ' + s1.section.sign + ' / ' + s2.section.sign + ', detail Z 4:1, aux K';
  });
  // --- end rfW ---
