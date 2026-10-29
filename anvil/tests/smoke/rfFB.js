  // --- rfFB (2026-10-29, lane FB): Boundary Boss/Base and Boundary Cut with real mouse / key events. A 2 × 2 square at
  // z = 0, a 1 × 1 square at z = 2 and two sketches on the diagonal planes holding the four corner lines: the ribbon's
  // Boundary Boss/Base opens the PM with Direction 1 seeded, the Direction 2 box clicked and the four corner lines
  // clicked in the graphics area, Move Up / Move Down reorder the profiles, Enter (✓): the exact frustum, Boundary-Boss1
  // in the tree with its icon, one undo step, Edit Feature reopens with the curves, Esc. Insert ▸ Cut ▸ Boundary through
  // a 3 × 3 × 2 block leaves block − frustum. ---
  var rfFBV = 2 / 3 * (4 + 1 + 2);
  function rfFBEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfFBClick(p) { rfFBEv('mousemove', p); rfFBEv('mousedown', p, $('viewport')); rfFBEv('mouseup', p); }
  function rfFBVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
  function rfFBRibbon(re) {
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
  }
  function rfFBEsc() { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }
  function rfFBScript(block) {
    var r2 = Math.SQRT1_2, s2 = Math.SQRT2;
    function diag(x, n) { return 'p.sketch({ custom: true, origin: [0, 0, 0], x: ' + JSON.stringify(x) + ', y: [0, 0, 1], n: ' + JSON.stringify(n) + ' }, 0).line(' + s2 + ', 0, ' + s2 / 2 + ', 2).line(' + (-s2) + ', 0, ' + (-s2 / 2) + ', 2);\n'; }
    return (block ? 'p.sketch("Front").centerRect(0, 0, 3, 3).end().extrude(2);\n' : '') +
      'p.sketch("Front").centerRect(0, 0, 2, 2);\np.sketch("Front", 2).centerRect(0, 0, 1, 1);\n' + diag([r2, r2, 0], [r2, -r2, 0]) + diag([r2, -r2, 0], [-r2, -r2, 0]);
  }

  step('rfFB: Boundary Boss/Base — ribbon button seeds Direction 1, the four corner lines clicked into Direction 2, Move Up / Move Down, Enter: exact frustum, Boundary-Boss1 in the tree, one undo step, Edit Feature reopens, Esc', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(rfFBScript(false)); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    var n0 = UI.App.model.features.length, sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; });
    assert(sk.length === 4, 'four sketches');
    UI.setRibbonTab('Features'); await wait(20);
    var btn = rfFBRibbon(/Boundary Boss\/Base/);
    assert(btn && !btn.disabled && !btn.classList.contains('disabled'), 'Boundary Boss/Base on the Features ribbon');
    assert(btn.innerHTML.indexOf('<svg') >= 0, 'with its icon');
    btn.click(); await idle(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Boundary', 'Boundary PM: ' + (UI.hasPM() && UI.pmTitle()));
    var v = UI.pmSpec().values;
    assert(JSON.stringify(v.dir1) === JSON.stringify([sk[0].id, sk[1].id]), 'Direction 1 seeded with the two squares: ' + JSON.stringify(v.dir1));
    // the Direction 2 box, then each corner line at its middle
    var boxes = D.querySelectorAll('#pm .pm-pick.clickable');
    assert(boxes.length >= 2, 'selection boxes: ' + boxes.length);
    boxes[1].click(); await wait(20);
    assert(UI.pmSpec().values.box === 2, 'Direction 2 box active');
    var mids = [[0.75, 0.75, 1], [-0.75, -0.75, 1], [0.75, -0.75, 1], [-0.75, 0.75, 1]];
    for (var i = 0; i < mids.length; i++) {
      var S = UI.worldToScreen(mids[i]), pk = UI.pickSketchRefs(S[0], S[1]);
      assert(pk && pk.kind === 'sketchEntity' && (pk.sketch === sk[2].id || pk.sketch === sk[3].id), 'a corner line under the pointer: ' + JSON.stringify(pk));
      rfFBClick(S); await idle(); await wait(20);
    }
    v = UI.pmSpec().values;
    assert(v.dir2.length === 4 && v.dir2.every(function (c) { return c.sketch === sk[2].id || c.sketch === sk[3].id; }), 'four curves: ' + JSON.stringify(v.dir2));
    assert(D.querySelectorAll('#pm .pm-pickwrap')[1].querySelectorAll('.pm-item').length === 4, 'four rows in the Direction 2 list');
    // Move Down on the first profile, then Move Up puts it back
    var row = D.querySelectorAll('#pm .pm-pickwrap')[0].querySelector('.pm-item[data-index="0"]');
    row.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    clickPmButton('▼ Move Down'); await idle(); await wait(20);
    assert(JSON.stringify(UI.pmSpec().values.dir1) === JSON.stringify([sk[1].id, sk[0].id]), 'moved down: ' + JSON.stringify(UI.pmSpec().values.dir1));
    clickPmButton('▲ Move Up'); await idle(); await wait(20);
    assert(JSON.stringify(UI.pmSpec().values.dir1) === JSON.stringify([sk[0].id, sk[1].id]), 'moved back up: ' + JSON.stringify(UI.pmSpec().values.dir1));
    pressEnter($('pm')); await idle(); await wait(30);
    assert(!UI.hasPM(), 'Enter is ✓');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'boundary' && f.name === 'Boundary-Boss1' && !f.cut && f.dir1.length === 2 && f.dir2.length === 4, 'feature: ' + JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
    near(rfFBVol(), rfFBV, 1e-9, 'frustum volume');
    var tr = Array.prototype.filter.call(D.querySelectorAll('#tree [data-fid]'), function (r) { return /Boundary-Boss1/.test(r.textContent); })[0];
    assert(tr && tr.innerHTML.indexOf('<svg') >= 0, 'Boundary-Boss1 in the FeatureManager tree with an icon');
    UI.undo(); await idle();
    assert(UI.App.model.features.length === n0, 'one undo step removes it');
    UI.redo(); await idle();
    f = UI.App.model.features[UI.App.model.features.length - 1];
    UI.editFeature(f); await wait(30); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Boundary-Boss1' && UI.pmSpec().values.dir2.length === 4, 'editing PM: ' + (UI.hasPM() && UI.pmTitle()));
    rfFBEsc(); await idle();
    assert(!UI.hasPM(), 'Esc closes it');
    near(rfFBVol(), rfFBV, 1e-9, 'unchanged after Esc');
  });

  step('rfFB: Insert ▸ Cut ▸ Boundary through a 3 × 3 × 2 block (✓+ command): the PM is Boundary-Cut, ✓ leaves block − frustum, Boundary-Cut1', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(rfFBScript(true)); await idle();
    near(rfFBVol(), 18, 1e-9, 'block');
    assert(UI.cmdBoundary && UI.cmdBoundary._okPlus, 'Boundary runs as an OK-and-start-another command');
    var rows = menuRows('Cut ▸ Boundary');
    assert(rows.length === 1 && /Insert/.test(rows[0].menu), 'Insert ▸ Cut ▸ Boundary: ' + JSON.stringify(rows.map(function (r) { return r.menu + ': ' + r.text; })));
    rows[0].row.click(); await idle(); await wait(30);
    if (UI.closeMenus) UI.closeMenus();
    assert(UI.hasPM() && UI.pmTitle() === 'Boundary-Cut', 'Boundary-Cut PM: ' + (UI.hasPM() && UI.pmTitle()));
    var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; });
    var v = UI.pmSpec().values;
    assert(v.cut && JSON.stringify(v.dir1) === JSON.stringify([sk[1].id, sk[2].id]), 'Direction 1: ' + JSON.stringify(v.dir1));
    await pmAccept();
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'boundary' && f.cut && f.name === 'Boundary-Cut1', 'feature: ' + JSON.stringify(f));
    near(rfFBVol(), 18 - rfFBV, 1e-9, 'block minus frustum');
  });
