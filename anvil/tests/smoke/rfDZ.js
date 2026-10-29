  // --- rfDZ (2026-10-29, lane DZ): Insert ▸ Features ▸ Wrap with real mouse / key events. A Ø2 × 3 in cylinder (axis
  // Y) and a 1 × .5 rectangle sketched on the plane tangent to it (Front, offset 1): the Features tab's Wrap opens the PM
  // with the sketch chosen; Deboss clicked, the face clicked in the graphics area, Thickness .05, Enter Enter: the exact
  // removed volume, Wrap1 in the tree, one undo step; Edit Feature reopens Deboss with the face, Esc. Then Insert ▸
  // Features ▸ Wrap as a Scribe: same volume, a face of its own on the cylinder and its 4 edges drawn. ---
  function rfDZEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfDZClick(p) { rfDZEv('mousemove', p); rfDZEv('mousedown', p, $('viewport')); rfDZEv('mouseup', p); }
  function rfDZNear(a, b, rel, label) { near(a, b, Math.abs(b) * rel + 1e-12, label); }
  function rfDZVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
  function rfDZRibbon(re) {
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
  }
  function rfDZEsc() { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }
  function rfDZRadio(v) { var r = D.querySelector('#pm input[type=radio][value="' + v + '"]'); if (r) r.click(); return r; }
  var RFDZ_PART = 'p.units("in");\np.sketch("Top").circle(0, 0, 1).end().extrude(3);\np.sketch("Front", 1).rect(-0.5, 1, 1, 0.5);';

  step('rfDZ: Wrap — Features tab button opens the PM on the sketch, Deboss clicked, the cylinder clicked in the graphics area, Thickness .05, Enter Enter: exact removed volume, Wrap1 in the tree, one undo step, Edit Feature reopens, Esc', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(RFDZ_PART); await idle();
    UI.setView('Front'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    var v0 = rfDZVol(), n0 = UI.App.model.features.length, sk = UI.App.model.features[n0 - 1];
    rfDZNear(v0, 3 * Math.PI, 1e-9, 'cylinder');
    UI.setRibbonTab('Features'); await wait(20);
    var btn = rfDZRibbon(/\bWrap\b/);
    assert(btn && !btn.disabled && !btn.classList.contains('disabled'), 'Wrap on the Features ribbon');
    btn.click(); await idle(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Wrap', 'Wrap PM: ' + (UI.hasPM() && UI.pmTitle()));
    var vals = UI.pmSpec().values;
    assert(vals.sketch === sk.id && vals.mode === 'emboss' && !vals.face, 'defaults: ' + JSON.stringify(vals));
    assert(rfDZRadio('deboss'), 'Deboss option'); await idle(); await wait(20);
    assert(UI.pmSpec().values.mode === 'deboss', 'Deboss chosen: ' + UI.pmSpec().values.mode);
    // the face: the cylinder at (0.1, 1.2) in front (z = √(1 − .01)), clicked
    var S = UI.worldToScreen([0.1, 1.2, Math.sqrt(0.99)]);
    rfDZClick(S); await idle(); await wait(30);
    vals = UI.pmSpec().values;
    assert(vals.face && Math.abs(Math.hypot(vals.face[0], vals.face[2]) - 1) < 0.01, 'face picked on the cylinder: ' + JSON.stringify(vals.face));
    var th = pmField('Thickness');
    assert(th, 'Thickness box');
    th.focus(); th.select(); th.value = '.05'; th.dispatchEvent(new W.Event('input', { bubbles: true }));
    var ev = pressEnter(th);
    assert(ev.defaultPrevented && UI.hasPM(), 'the first Enter applied and kept the PM');
    pressEnter(pmField('Thickness')); await idle(); await wait(30);
    assert(!UI.hasPM(), 'the second Enter is ✓');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'wrap' && f.name === 'Wrap1' && f.mode === 'deboss' && f.thickness === 0.05 && f.sketch === sk.id, 'feature: ' + JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
    rfDZNear(v0 - rfDZVol(), (1 - 0.95 * 0.95) / 2 * 0.5, 1e-6, 'removed volume');
    assert(Array.prototype.some.call(D.querySelectorAll('#tree [data-fid]'), function (r) { return /Wrap1/.test(r.textContent); }), 'Wrap1 in the FeatureManager tree');
    UI.undo(); await idle();
    assert(UI.App.model.features.length === n0, 'one undo step removes the Wrap');
    UI.redo(); await idle();
    f = UI.App.model.features[UI.App.model.features.length - 1];
    UI.editFeature(f); await wait(30); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Wrap1', 'editing PM: ' + (UI.hasPM() && UI.pmTitle()));
    vals = UI.pmSpec().values;
    assert(vals.mode === 'deboss' && vals.face && vals.thickness === 0.05, 'values back: ' + JSON.stringify(vals));
    rfDZEsc(); await idle(); await wait(20);
    assert(!UI.hasPM(), 'Esc ends the command');
    rfDZNear(v0 - rfDZVol(), (1 - 0.95 * 0.95) / 2 * 0.5, 1e-6, 'unchanged after Esc');
  });

  step('rfDZ2: Insert ▸ Features ▸ Wrap as a Scribe: the face clicked, ✓: volume unchanged, the face inside is Wrap1\'s, its 4 edges drawn', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(RFDZ_PART); await idle();
    UI.setView('Front'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    var v0 = rfDZVol(), sharp0 = (UI.App.edges || []).filter(function (e) { return !e.smooth; }).length;
    var rows = menuRows('Features ▸ Wrap');
    assert(rows.length === 1 && /Insert/.test(rows[0].menu), 'one Insert row: ' + JSON.stringify(rows.map(function (r) { return r.menu + ' / ' + r.text; })));
    rows[0].row.click(); await idle(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Wrap', 'Wrap PM from the menu: ' + (UI.hasPM() && UI.pmTitle()));
    assert(rfDZRadio('scribe'), 'Scribe option'); await idle(); await wait(20);
    assert(!pmField('Thickness'), 'no Thickness for a scribe');
    rfDZClick(UI.worldToScreen([0.1, 1.2, Math.sqrt(0.99)])); await idle(); await wait(30);
    assert(UI.pmSpec().values.face, 'face picked');
    var ok = D.querySelector('#pm [title="OK (Enter)"]') || D.querySelector('#pm .pm-ok');
    assert(ok, 'the ✓ button');
    ok.click(); await idle(); await wait(30);
    assert(!UI.hasPM(), '✓ closed the PM');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'wrap' && f.mode === 'scribe' && f.thickness == null && !UI.App.build.errors[f.id], 'feature: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
    rfDZNear(rfDZVol(), v0, 1e-9, 'volume unchanged');
    var inside = UI.App.mesh.faces.filter(function (fc) { return fc.polys && fc.polys[0] && fc.polys[0].shared === f.id; });
    assert(inside.length > 0, 'faces owned by Wrap1: ' + inside.length);
    var sharp = (UI.App.edges || []).filter(function (e) { return !e.smooth; }).length;
    assert(sharp >= sharp0 + 4, 'scribe edges drawn: ' + sharp0 + ' -> ' + sharp);
  });
