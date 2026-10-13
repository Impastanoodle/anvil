  // ---- rfZ (2026-10-12): Detail View Profile / Full outline / circle style, Partial section and Scale with model
  // changes, Model View Dimension Type True
  function rfZView(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfZClick(p) { sheetMouse('mousemove', p); sheetMouse('mousedown', p); sheetMouse('mouseup', p); }
  function rfZAt(id, uv) { return rfZView(id).toSheet(uv); }
  function rfZDoc(id) { return anvil.drawing.doc().views.filter(function (v) { return v.id === id; })[0]; }
  step('rfZ: Detail View PM — Profile (two corner clicks), Full outline and With Leader make a rectangular detail with its outline and a leader to the letter on Front; Jagged outline and Broken Circle from the view\'s Properties; undo removes it', async function () {
    var errs0 = errors.length;
    await anvil.run('p.units("mm");\np.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).circle(80, 25, 5).extrude(10);');
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    await UI.drawing.ready();
    var F = dwView('Front'), n0 = anvil.drawing.summary().views.length;
    ribbonButton('Detail View').click();
    assert(UI.drawing.state.tool === 'detail' && UI.pmTitle() === 'Detail View', 'Detail View PM');
    var pr = pmField('Profile');
    assert(pr && !pr.disabled, 'Profile enabled');
    pr.checked = true; pr.dispatchEvent(new W.Event('change', { bubbles: true }));
    pmField('Full outline').click();
    setInput(pmField('Style'), 'leader');
    assert(UI.pmSpec().values.shape === 'profile' && UI.pmSpec().values.fullOutline && UI.pmSpec().values.style === 'leader', 'PM values ' + JSON.stringify(UI.pmSpec().values));
    rfZClick(rfZAt(F.id, [2, 2])); rfZClick(rfZAt(F.id, [40, 48]));
    assert(UI.drawing.state.pending && UI.drawing.state.pending.cp2, 'two corners');
    var fb = rfZView(F.id).box;
    rfZClick([fb.x0 + 40, fb.y0 - 60]); await idle(); await wait(60);
    var sm = anvil.drawing.summary(), dv = sm.views.filter(function (v) { return v.kind === 'detail'; })[0];
    assert(sm.views.length === n0 + 1 && dv, 'detail view added');
    var dd = rfZDoc(dv.id).detail;
    assert(dd.shape === 'profile' && Math.abs(dd.a[0] - 2) < 1.5 && Math.abs(dd.b[1] - 48) < 1.5 && dd.outline === 'full' && dd.style === 'leader', 'stored ' + JSON.stringify(dd));
    var prims = UI.drawing.state.sheet.prims;
    assert(prims.filter(function (p) { return p.detailOutline === dv.id; }).length === 4, 'full outline (rectangle)');
    assert(prims.filter(function (p) { return p.detailMark === dv.id && p.style === 'thick'; }).length === 4 && prims.some(function (p) { return p.detailLeader === dv.id; }), 'rectangle and leader on Front');
    var w = rfZView(dv.id);
    assert(Math.abs((w.box.x1 - w.box.x0) - (dd.b[0] - dd.a[0]) * w.scale) < 1e-6 && Math.abs((w.box.y1 - w.box.y0) - (dd.b[1] - dd.a[1]) * w.scale) < 1e-6, 'box is the profile ' + JSON.stringify(w.box));
    assert(w.proj.stats.visibleCircles === 1, 'the left hole');
    rfZProps(dv.id);
    setInput(pmField('Outline'), 'jagged'); setInput(pmField('Circle style'), 'broken');
    await UI.pmOK(); await idle(); await wait(40);
    dd = rfZDoc(dv.id).detail;
    assert(dd.outline === 'jagged' && dd.style === 'broken', 'properties ' + JSON.stringify(dd));
    assert(UI.drawing.state.sheet.prims.filter(function (p) { return p.detailOutline === dv.id; }).length > 8, 'jagged outline drawn');
    assert(anvil.drawing.svg().indexOf('DETAIL ' + dv.label) > 0, 'SVG');
    await UI.undo(); await idle(); await wait(40);
    await UI.undo(); await idle(); await wait(40);
    assert(anvil.drawing.summary().views.length === n0, 'undo removes it');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'detail ' + dv.label + ' ' + JSON.stringify(dd.a) + '-' + JSON.stringify(dd.b);
  });
  function rfZProps(id) { UI.drawing.viewProperties(id); assert(UI.hasPM(), 'view Properties PM'); }
  step('rfZ: Section View PM — Partial section and Scale with model changes: two clicks set the ends of a cutting line through the holes, the line on Front stops there, the view keeps that band; the view\'s Properties take the partial off', async function () {
    var errs0 = errors.length;
    await anvil.run('p.units("mm");\np.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).circle(80, 25, 5).extrude(10);');
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    await UI.drawing.ready();
    var F = dwView('Front');
    ribbonButton('Section View').click();
    assert(pmField('Partial section') && pmField('Scale with model changes'), 'PM fields');
    pmField('Partial section').click(); pmField('Scale with model changes').click();
    await UI.pmOK(); await idle();
    assert(UI.drawing.state.tool === 'section' && UI.drawing.state.pending.partial && UI.drawing.state.pending.swm, 'section tool, partial');
    rfZClick(rfZAt(F.id, [0, 25]));
    assert(UI.drawing.state.pending.from != null && UI.drawing.state.pending.to == null, 'first end');
    rfZClick(rfZAt(F.id, [45, 25]));
    assert(UI.drawing.state.pending.to != null, 'second end');
    var fw = rfZView(F.id);
    rfZClick([fw.view.x, fw.box.y1 + 40]); await idle(); await wait(60);
    var sv = anvil.drawing.doc().views.filter(function (v) { return v.kind === 'section'; })[0];
    assert(sv && sv.section.partial && Math.abs(sv.section.partial[0]) < 1 && Math.abs(sv.section.partial[1] - 45) < 1 && sv.section.scaleWithModel && Math.abs(sv.section.at - 25) < 1e-9, 'stored ' + JSON.stringify(sv && sv.section));
    var w = rfZView(sv.id), pw = rfZView(F.id);
    assert(w.proj.bounds.umax <= sv.section.partial[1] + 1e-9, 'band ' + JSON.stringify(w.proj.bounds));
    var chain = UI.drawing.state.sheet.prims.filter(function (p) { return p.layer === pw.layer && p.k === 'line' && p.style === 'chain' && p.view == null; });
    assert(chain.length === 1 && Math.abs(Math.max(chain[0].a[0], chain[0].b[0]) - pw.toSheet([sv.section.partial[1], 25])[0]) < 1e-6, 'cutting line stops at its end');
    assert(sv.section.rel && Math.abs(sv.section.rel.at - 0.5) < 1e-9, 'its place on the part kept as fractions ' + JSON.stringify(sv.section.rel));
    // the section's Properties: Partial section (on: unticking it takes it off) and Scale with model changes
    rfZProps(sv.id);
    assert(pmField('Partial section').checked && pmField('Scale with model changes').checked, 'Properties show both');
    pmField('Partial section').click();
    await UI.pmOK(); await idle(); await wait(40);
    sv = rfZDoc(sv.id);
    assert(!sv.section.partial && sv.section.scaleWithModel, 'partial off ' + JSON.stringify(sv.section));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'cut at ' + sv.section.at;
  });
  step('rfZ: Model View Dimension Type True — an isometric view placed with True reads the 100 mm edge as 100 (Projected: 81.65); the view\'s Properties switch it back', async function () {
    var errs0 = errors.length;
    await anvil.run('p.units("mm");\np.sketch("Front").rect(0, 0, 100, 50).extrude(10);');
    anvil.drawing.make({ fresh: true });
    anvil.drawing.setSheet({ scale: '1:1' });
    await UI.drawing.ready();
    var n0 = anvil.drawing.summary().views.length;
    ribbonButton('Model View').click();
    setInput(pmField('View'), 'Isometric');
    var tr = pmField('True');
    assert(tr && !tr.disabled, 'True enabled');
    tr.checked = true; tr.dispatchEvent(new W.Event('change', { bubbles: true }));
    if (pmField('Auto-start projected view').checked) pmField('Auto-start projected view').click();
    await UI.pmOK();
    rfZClick([330, 230]); await idle(); await wait(60);
    var vs = anvil.drawing.summary().views, iv = vs[vs.length - 1];
    assert(vs.length === n0 + 1 && iv.orient === 'Isometric' && rfZDoc(iv.id).dimType === 'true', 'True view placed ' + JSON.stringify(rfZDoc(iv.id)));
    var w = rfZView(iv.id), L = 0, best = null;
    assert(w.trueDims, 'reads true lengths');
    w.proj.lines.visible.forEach(function (l) { var d = Math.hypot(l[2] - l[0], l[3] - l[1]); if (d > L) { L = d; best = l; } });
    var d = anvil.drawing.smartDim(iv.id, { edge: [[best[0], best[1]], [best[2], best[3]]] }, null, [best[0], best[1] + 15]);
    assert(d && Math.abs(d.value - 100) < 1e-6 && d.text === '100', 'True: ' + JSON.stringify(d));
    rfZProps(iv.id);
    assert(pmField('True') && pmField('True').checked, 'Properties show True');
    var pp = pmField('Projected'); pp.checked = true; pp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await UI.pmOK(); await idle(); await wait(40);
    var dd = anvil.drawing.summary().dimDetails.filter(function (x) { return x.view === iv.id; })[0];
    assert(!rfZDoc(iv.id).dimType && Math.abs(dd.value - L) < 1e-6, 'Projected again: ' + dd.text);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'True 100, Projected ' + dd.text;
  });
  // --- end rfZ ---

