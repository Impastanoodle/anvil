  // --- rfDT (2026-10-27, lane DT): Sheet Metal ▸ Vent with real mouse / key events. A 4 × 4 × .06 base flange with a
  // sketch on its top face (Ø2 boundary, two rib lines through the centre, a Ø1 spar): the ribbon's Vent opens the PM
  // with the boxes filled (boundary / ribs / spars), the Flow Area shown; the Spars box clicked, the spar circle clicked
  // in the graphics area takes it out and a second click puts it back; Enter Enter (✓): exact volume, Vent1 in the tree,
  // one undo step; Edit Feature reopens with the groups, Esc. ---
  function rfDTEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfDTClick(p) { rfDTEv('mousemove', p); rfDTEv('mousedown', p, $('viewport')); rfDTEv('mouseup', p); }
  function rfDTVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
  function rfDTRibbon(re) {
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
  }
  function rfDTEsc() { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }
  function rfDTOpen() {
    function S(r) { var h = 0.05; return 2 * (h * Math.sqrt(r * r - h * h) + r * r * Math.asin(h / r)); }
    function Dk(r) { return Math.PI * r * r - 2 * S(r) + 0.01; }
    return Dk(0.45) + Dk(1) - Dk(0.55);
  }

  step('rfDT: Vent — ribbon button fills Boundary / Ribs / Spars from the sketch, Flow Area shown, the spar circle clicked out and back in, Enter Enter: volume − T × open area, Vent1 in the tree, one undo step, Edit Feature reopens, Esc', async function () {
    var T = 0.06;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(-2, -2, 4, 4).end().baseFlange();\np.sketch("Top", ' + T + ').circle(0, 0, 1).line(-1, 0, 1, 0).line(0, -1, 0, 1).circle(0, 0, 0.5);'); await idle();
    UI.setView('Top'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    var v0 = rfDTVol(), n0 = UI.App.model.features.length, sk = UI.App.model.features[n0 - 1];
    near(v0, 16 * T, 1e-12, 'plate');
    UI.setRibbonTab('Sheet Metal'); await wait(20);
    var btn = rfDTRibbon(/\bVent\b/);
    assert(btn && !btn.disabled && !btn.classList.contains('disabled'), 'Vent on the Sheet Metal ribbon');
    btn.click(); await idle(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Vent', 'Vent PM: ' + (UI.hasPM() && UI.pmTitle()));
    var vals = UI.pmSpec().values;
    assert(vals.sketch === sk.id && JSON.stringify([vals.boundary, vals.ribs, vals.spars, vals.fill]) === '[[0],[1,2],[3],[]]', 'boxes filled: ' + JSON.stringify([vals.sketch, vals.boundary, vals.ribs, vals.spars, vals.fill]));
    var flow = D.querySelector('#pm .pm-vent-flow');
    assert(flow && /%/.test(flow.textContent), 'Flow Area: ' + (flow && flow.textContent));
    // the Spars box (third selection box), then the spar circle at 45° (on no line) in the graphics area
    var boxes = D.querySelectorAll('#pm .pm-pick.clickable');
    assert(boxes.length >= 3, 'selection boxes: ' + boxes.length);
    boxes[2].click(); await wait(20);
    assert(UI.pmSpec().values.box === 'spars', 'Spars box active: ' + UI.pmSpec().values.box);
    var pl = { origin: [0, T, 0], x: [1, 0, 0], y: [0, 0, -1], n: [0, 1, 0] }, q = 0.5 * Math.SQRT1_2;
    var P = K.to3D(pl, q, q), S = UI.worldToScreen(P);
    var pk = UI.pickSketchRefs(S[0], S[1]);
    assert(pk && pk.kind === 'sketchEntity' && pk.index === 3, 'the spar circle is under the pointer: ' + JSON.stringify(pk));
    rfDTClick(S); await idle(); await wait(30);
    vals = UI.pmSpec().values;
    assert(vals.spars.length === 0, 'clicked out of Spars: ' + JSON.stringify(vals.spars));
    rfDTClick(S); await idle(); await wait(30);
    vals = UI.pmSpec().values;
    assert(JSON.stringify(vals.spars) === '[3]', 'and back in: ' + JSON.stringify(vals.spars));
    var rw = pmField('Rib width');
    assert(rw && +rw.value === 0.1, 'Rib width .1: ' + (rw && rw.value));
    rw.focus(); rw.select(); rw.value = '.1'; rw.dispatchEvent(new W.Event('input', { bubbles: true }));
    var ev = pressEnter(rw);
    assert(ev.defaultPrevented && UI.hasPM(), 'the first Enter applied and kept the PM');
    pressEnter(pmField('Rib width')); await idle(); await wait(30);
    assert(!UI.hasPM(), 'the second Enter is ✓');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'vent' && f.name === 'Vent1' && f.sketch === sk.id && JSON.stringify(f.spars) === '[3]' && f.ribWidth === 0.1 && f.sparWidth === 0.1, 'feature: ' + JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
    near(v0 - rfDTVol(), T * rfDTOpen(), 1e-9, 'removed volume');
    assert(Array.prototype.some.call(D.querySelectorAll('#tree [data-fid]'), function (r) { return /Vent1/.test(r.textContent); }), 'Vent1 in the FeatureManager tree');
    UI.undo(); await idle();
    assert(UI.App.model.features.length === n0, 'one undo step removes the Vent');
    UI.redo(); await idle();
    f = UI.App.model.features[UI.App.model.features.length - 1];
    UI.editFeature(f); await wait(30); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Vent1', 'editing PM: ' + (UI.hasPM() && UI.pmTitle()));
    vals = UI.pmSpec().values;
    assert(JSON.stringify([vals.boundary, vals.ribs, vals.spars]) === '[[0],[1,2],[3]]', 'the groups are back: ' + JSON.stringify([vals.boundary, vals.ribs, vals.spars]));
    rfDTEsc(); await idle(); await wait(20);
    assert(!UI.hasPM(), 'Esc ends the command');
    near(v0 - rfDTVol(), T * rfDTOpen(), 1e-9, 'unchanged after Esc');
  });

  step('rfDT2: Insert ▸ Features ▸ Fastening Features ▸ Vent opens the Vent PM; Radius for fillets .05 typed, Enter Enter: the vent keeps .05 fillets (less open area, by the 28 corner pieces)', async function () {
    var T = 0.06;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(-2, -2, 4, 4).end().baseFlange();\np.sketch("Top", ' + T + ').circle(0, 0, 1).line(-1, 0, 1, 0).line(0, -1, 0, 1).circle(0, 0, 0.5);'); await idle();
    var v0 = rfDTVol();
    var rows = menuRows('Fastening Features ▸ Vent');
    assert(rows.length === 1 && /Insert/.test(rows[0].menu), 'one Insert row: ' + JSON.stringify(rows.map(function (r) { return r.menu + ' / ' + r.text; })));
    rows[0].row.click(); await idle(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Vent', 'Vent PM from the menu: ' + (UI.hasPM() && UI.pmTitle()));
    var rf = pmField('Radius for fillets');
    assert(rf, 'Radius for fillets box');
    rf.focus(); rf.select(); rf.value = '.05'; rf.dispatchEvent(new W.Event('input', { bubbles: true }));
    pressEnter(rf); await idle();
    assert(UI.hasPM() && UI.pmSpec().values.radius === 0.05, 'radius .05 applied: ' + UI.pmSpec().values.radius);
    pressEnter(pmField('Radius for fillets')); await idle(); await wait(30);
    assert(!UI.hasPM(), 'the second Enter is ✓');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'vent' && f.radius === 0.05 && !UI.App.build.errors[f.id], 'feature: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
    var cut = (v0 - rfDTVol()) / T;
    assert(cut < rfDTOpen() - 0.01 && cut > rfDTOpen() - 0.03, 'open area with fillets ' + cut.toFixed(6) + ' (no fillets ' + rfDTOpen().toFixed(6) + ')');
  });
