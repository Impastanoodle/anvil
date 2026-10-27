  // --- rfDI (2026-10-27, lane DI): Sheet Metal ▸ Rip and Base Flange/Tab on an existing sheet, with real mouse / key
  // events. Rip: the ribbon button opens the PM on a shelled 2 × 2 × 1 box, a rim edge click is refused, a click on an
  // outside corner edge picks it, Change Direction, .03 typed + Enter + Enter (✓): exact volume, Rip1 in the tree, one
  // undo step, Edit Feature reopens with the pick, Esc. Tab: a sketch on the plate's top face, the ribbon's Base
  // Flange/Tab opens the Tab PM (no sheet parameters), ✓ → Tab1 (+ 1 × 1 × T, flush), Edit Feature ▸ Reverse ▸ ✓
  // stacks it, the flat is 5 × 2. ---
  function rfDIEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfDIClick(p) { rfDIEv('mousemove', p); rfDIEv('mousedown', p, $('viewport')); rfDIEv('mouseup', p); }
  function rfDIVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
  function rfDIRibbon(re) {
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
  }
  function rfDIClickable(list) { return list.filter(function (e) { var s = UI.worldToScreen(e.mid), pk = UI.pickEdge(s[0], s[1]); return pk && pk.edge === e; }); }
  function rfDIEsc() { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }

  step('rfDI: Rip — ribbon button, rim edge refused, outside corner edge clicked, Change Direction, .03 Enter Enter: volume − .94·.03·.06, Rip1 in the tree, one undo step, Edit Feature reopens with the pick, Esc', async function () {
    var W6 = 0.06, G = 0.03;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(' + W6 + ', [[1, 1, -1]]);'); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    var v0 = rfDIVol(), n0 = UI.App.model.features.length;
    near(v0, 4 - 1.88 * 1.88 * 0.94, 1e-9, 'box volume');
    UI.setRibbonTab('Sheet Metal'); await wait(20);
    var btn = rfDIRibbon(/\bRip\b/);
    assert(btn && !btn.disabled && !btn.classList.contains('disabled'), 'Rip on the Sheet Metal ribbon');
    btn.click(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Rip', 'Rip PM: ' + (UI.hasPM() && UI.pmTitle()));
    // a rim edge (top of a wall) is no corner of two walls: refused with the reason
    var rim = rfDIClickable(UI.App.edges.filter(function (e) { return Math.abs(e.dir[1]) < 1e-6 && e.len > 1.5 && Math.abs(e.mid[1] - 1) < 1e-6; }))[0];
    assert(rim, 'a clickable rim edge');
    rfDIClick(UI.worldToScreen(rim.mid)); await idle(); await wait(20);
    assert(UI.pmSpec().values.edges.length === 0 && /not a corner where two walls meet/.test(statusText()), 'rim edge refused: ' + statusText());
    // an outside vertical corner edge
    var corner = rfDIClickable(UI.App.edges.filter(function (e) { return Math.abs(Math.abs(e.dir[1]) - 1) < 1e-6 && e.len > 0.9 && e.convex; }))[0];
    assert(corner, 'a clickable outside corner edge');
    rfDIClick(UI.worldToScreen(corner.mid)); await idle(); await wait(20);
    var vals = UI.pmSpec().values;
    assert(vals.edges.length === 1, 'one edge picked: ' + JSON.stringify(vals.edges) + ' ' + statusText());
    assert(D.querySelectorAll('#pm .pm-list .pm-item').length === 1, 'one row in the selection list');
    clickPmButton('Change Direction'); await wait(20);
    vals = UI.pmSpec().values;
    assert(vals.edges[0].direction === 'side1', 'Change Direction: ' + JSON.stringify(vals.edges[0]));
    var gap = pmField('Rip gap');
    assert(gap, 'Rip gap box');
    gap.focus(); gap.select(); gap.value = '.03'; gap.dispatchEvent(new W.Event('input', { bubbles: true }));
    var ev = pressEnter(gap);
    assert(ev.defaultPrevented && UI.hasPM() && UI.pmSpec().values.gap === G, 'the first Enter applied .03 and kept the PM: ' + UI.pmSpec().values.gap);
    pressEnter(pmField('Rip gap')); await idle(); await wait(30);
    assert(!UI.hasPM(), 'the second Enter is ✓');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'rip' && f.name === 'Rip1' && f.gap === G && f.edges.length === 1 && f.edges[0].direction === 'side1', 'feature: ' + JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
    near(v0 - rfDIVol(), 0.94 * G * W6, 1e-9, 'removed volume');
    assert(Array.prototype.some.call(D.querySelectorAll('#tree [data-fid]'), function (r) { return /Rip1/.test(r.textContent); }), 'Rip1 in the FeatureManager tree');
    UI.undo(); await idle();
    assert(UI.App.model.features.length === n0, 'one undo step removes the Rip');
    near(rfDIVol(), v0, 1e-9, 'volume after undo');
    UI.redo(); await idle();
    f = UI.App.model.features[UI.App.model.features.length - 1];
    UI.editFeature(f); await wait(30); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Rip1', 'editing PM: ' + (UI.hasPM() && UI.pmTitle()));
    vals = UI.pmSpec().values;
    assert(vals.edges.length === 1 && vals.gap === G && vals.edges[0].direction === 'side1', 'the pick is back: ' + JSON.stringify(vals.edges));
    rfDIEsc(); await idle(); await wait(20);
    assert(!UI.hasPM(), 'Esc ends the command');
    near(v0 - rfDIVol(), 0.94 * G * W6, 1e-9, 'unchanged after Esc');
  });

  step('rfDI: Tab — Base Flange/Tab on a part with a sheet opens the Tab PM (no sheet parameters), ✓ makes Tab1 (+ 1 × 1 × T, flush), Edit Feature ▸ Reverse ▸ ✓ stacks it, the flat is 5 × 2', async function () {
    var T = 0.06;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, 0, 4, 2).end().baseFlange();\np.sketch("Top", ' + T + ').rect(4, 0, 1, 1);'); await idle();
    var v0 = rfDIVol();
    near(v0, 8 * T, 1e-12, 'plate');
    UI.setRibbonTab('Sheet Metal'); await wait(20);
    var btn = rfDIRibbon(/Base Flange/);
    assert(btn, 'Base Flange/Tab on the ribbon');
    btn.click(); await wait(30); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Base Flange/Tab', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
    assert(!pmField('Thickness') && pmField('Reverse direction'), 'no sheet parameters, a Reverse direction check');
    assert(/linked to the sheet/.test(D.querySelector('#pm').textContent), 'the thickness is linked');
    await pmAccept(); await wait(20);
    assert(!UI.hasPM(), '✓ closes');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.name === 'Tab1' && f.tab && f.sheetBase && f.linkT && !f.reverse, 'feature: ' + JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
    near(rfDIVol() - v0, T, 1e-12, 'tab volume');
    var bb = UI.App.build.body.getBounds();
    near(bb.max[1], T, 1e-12, 'flush with the top face'); near(bb.max[0], 5, 1e-12, 'tab end');
    assert(Array.prototype.some.call(D.querySelectorAll('#tree [data-fid]'), function (r) { return /Tab1/.test(r.textContent); }), 'Tab1 in the FeatureManager tree');
    var flat = anvil.flat();
    near(flat.size[0], 5, 1e-9, 'flat width'); near(flat.size[1], 2, 1e-9, 'flat height');
    UI.editFeature(f); await wait(30); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Tab1', 'editing PM: ' + (UI.hasPM() && UI.pmTitle()));
    var rv = pmField('Reverse direction');
    rv.click(); await wait(20);
    await pmAccept(); await wait(20);
    f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.reverse && f.name === 'Tab1', 'reversed: ' + JSON.stringify(f));
    near(UI.App.build.body.getBounds().max[1], 2 * T, 1e-12, 'away from the face');
    near(rfDIVol() - v0, T, 1e-12, 'tab volume (stacked)');
  });
