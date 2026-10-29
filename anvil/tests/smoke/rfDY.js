  // --- rfDY (2026-10-29, lane DY): Features ▸ Rib and Intersect with real clicks and keys. Rib: an L bracket with a
  // diagonal line on its mid-plane; the ribbon's Rib opens the PM (✓+ offered, sketch picked), .25 typed, First Side
  // clicked, ✓: the exact gusset volume, Rib1 in the tree; Edit Feature reopens it, Both Sides and .5, ✓. Intersect:
  // two overlapping blocks; Insert ▸ Features ▸ Intersect, the PM's Intersect button lists three regions, the two outer
  // ones checked out, ✓: the common box only, Intersect1 in the tree; one undo step. ---
  var rfDYL = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 0.25).end().extrude(4, { midplane: true });\np.sketch("Front").rect(0, 0, 0.25, 4).end().extrude(4, { midplane: true });\np.sketch("Front").line(0.25, 3, 3, 0.25);';
  var rfDYGusset = 2.75 * 2.75 / 2 * 0.25;
  function rfDYVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
  function rfDYRibbon(re) {
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
  }
  function rfDYOk() { var b = D.querySelector('#pm .pm-ok'); assert(b, 'the ✓ button'); b.click(); }
  function rfDYCheck(label) {
    var l = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-row.check label'), function (x) { return x.textContent.indexOf(label) === 0; })[0];
    assert(l, 'PM check "' + label + '"'); l.click();
  }
  function rfDYTree(name) { return Array.prototype.some.call(D.querySelectorAll('#tree [data-fid]'), function (r) { return r.textContent.indexOf(name) >= 0; }); }

  step('rfDY: Rib — the Features ribbon\'s Rib on an L bracket with a diagonal mid-plane line: PM with ✓+ and the sketch, .25 typed, First Side clicked, ✓: exact gusset, Rib1 in the tree; Edit Feature, Both Sides, .5, ✓: twice the gusset', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(rfDYL); await idle();
    var v0 = rfDYVol(), n0 = UI.App.model.features.length, sk = UI.App.model.features[n0 - 1];
    near(v0, 7.75, 1e-9, 'bracket');
    UI.setRibbonTab('Features'); await wait(20);
    var btn = rfDYRibbon(/\bRib\b/);
    assert(btn && !btn.disabled && !btn.classList.contains('disabled'), 'Rib on the Features ribbon');
    btn.click(); await idle(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Rib', 'Rib PM: ' + (UI.hasPM() && UI.pmTitle()));
    assert(D.querySelector('#pm .pm-okplus'), '✓+ offered');
    assert(UI.pmSpec().values.sketch === sk.id, 'the line sketch: ' + UI.pmSpec().values.sketch);
    var th = pmField('Rib thickness');
    assert(th, 'Rib thickness box');
    th.focus(); th.select(); th.value = '.25'; th.dispatchEvent(new W.Event('input', { bubbles: true }));
    pressEnter(th); await idle();
    assert(UI.hasPM() && UI.pmSpec().values.thickness === 0.25, 'thickness .25: ' + UI.pmSpec().values.thickness);
    var one = D.querySelector('#pm button[data-key="side:one"]');
    assert(one, 'First Side button'); one.click(); await wait(20);
    assert(UI.pmSpec().values.side === 'one', 'First Side pressed');
    rfDYOk(); await idle(); await wait(30);
    assert(!UI.hasPM(), 'PM closed');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'rib' && f.name === 'Rib1' && f.side === 'one' && f.thickness === 0.25 && f.sketch === sk.id, 'feature: ' + JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
    near(rfDYVol() - v0, rfDYGusset, 1e-9, 'gusset');
    assert(rfDYTree('Rib1'), 'Rib1 in the FeatureManager tree');
    UI.editFeature(f); await wait(30); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Rib1', 'editing PM: ' + (UI.hasPM() && UI.pmTitle()));
    D.querySelector('#pm button[data-key="side:both"]').click(); await wait(20);
    th = pmField('Rib thickness');
    th.focus(); th.select(); th.value = '.5'; th.dispatchEvent(new W.Event('input', { bubbles: true }));
    pressEnter(th); await idle();
    rfDYOk(); await idle(); await wait(30);
    f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.side === 'both' && f.thickness === 0.5 && UI.App.model.features.length === n0 + 1, 'edited: ' + JSON.stringify(f));
    near(rfDYVol() - v0, 2 * rfDYGusset, 1e-9, 'gusset .5');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'gusset ' + fmt(rfDYGusset) + ' in³';
  });

  step('rfDY: Intersect — Insert ▸ Features ▸ Intersect on two overlapping blocks, the PM\'s Intersect button lists three regions, the two outer ones checked out, ✓: the common box (250), Intersect1 in the tree, one undo step', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front").rect(0, 0, 10, 10).end().extrude(10, { merge: false });\np.sketch("Front").rect(5, 5, 10, 10).end().extrude(10, { merge: false });'); await idle();
    var n0 = UI.App.model.features.length;
    assert(UI.App.build.bodies.length === 2, 'two bodies');
    var rows = menuRows('Features ▸ Intersect');
    assert(rows.length === 1 && /Insert/.test(rows[0].menu), 'one Insert row: ' + JSON.stringify(rows.map(function (r) { return r.menu + ' / ' + r.text; })));
    rows[0].row.click(); await idle(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Intersect', 'Intersect PM: ' + (UI.hasPM() && UI.pmTitle()));
    assert(D.querySelector('#pm .pm-okplus'), '✓+ offered');
    clickPmButton('Intersect'); await wait(30);
    var regs = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-row.check label'), function (l) { return /^Region\d/.test(l.textContent); });
    assert(regs.length === 3, 'three regions listed: ' + regs.map(function (l) { return l.textContent; }).join(', '));
    assert(/250/.test(regs[2].textContent), 'Region3 is the common box: ' + regs[2].textContent);
    assert(UI.groups.preview.children.length === 3, 'three preview regions: ' + UI.groups.preview.children.length);
    rfDYCheck('Region1'); await wait(20);
    rfDYCheck('Region2'); await wait(20);
    var v = UI.pmSpec().values;
    assert(v.x0 === true && v.x1 === true && v.x2 === false, 'excluded 1 and 2: ' + JSON.stringify([v.x0, v.x1, v.x2]));
    rfDYOk(); await idle(); await wait(30);
    assert(!UI.hasPM(), 'PM closed');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'intersect' && f.name === 'Intersect1' && JSON.stringify(f.regions) === '[false,false,true]', 'feature: ' + JSON.stringify(f));
    near(rfDYVol(), 250, 1e-9, 'common box');
    assert(UI.App.build.bodies.length === 1, 'one body');
    assert(rfDYTree('Intersect1'), 'Intersect1 in the FeatureManager tree');
    UI.undo(); await idle();
    assert(UI.App.model.features.length === n0 && UI.App.build.bodies.length === 2, 'one undo step');
    UI.redo(); await idle();
    near(rfDYVol(), 250, 1e-9, 'redo');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'Region3 kept';
  });
