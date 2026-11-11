  // --- rfLQ (2026-11-11, lane sketchgrey) --- the greyed sketch and curve commands work: 3D Sketch, 3D Sketch On Plane and
  // Offset On Surface on the Sketch tab, Split Line in the Curves flyout and Insert ▸ Curve, by mouse: enabled, drawn or
  // built by clicks, ✓ gives the stated result, Esc cancels cleanly, Edit Feature reopens it.
  function rfLQScr(p) { var s = UI.worldToScreen(p); return [Math.round(s[0]), Math.round(s[1])]; }
  function rfLQFlyRows(name) {
    if (UI.closeMenus) UI.closeMenus();
    var w = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-fly'), function (x) { return x._fly && x._fly.fly === name; })[0];
    assert(w, name + ' flyout on the ribbon');
    var c = w.querySelector('.rb-caret');
    c.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); c.click();
    var m = D.querySelector('.menu');
    assert(m, 'the ' + name + ' menu opens');
    return Array.prototype.slice.call(m.querySelectorAll('.mi'));
  }
  function rfLQFly(name, text) {
    var row = rfLQFlyRows(name).filter(function (r) { return r.textContent.replace(/\s+/g, ' ').trim() === text; })[0];
    assert(row && !row.classList.contains('disabled'), text + ' is listed and enabled in the ' + name + ' flyout');
    row.click();
  }
  function rfLQButton(label) {
    var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0];
    assert(b, label + ' button');
    return b;
  }
  function rfLQOK() { var b = D.querySelector('#pm [title^="OK"], #pm .pm-ok, .pm-ok'); assert(b, 'the ✓ button'); b.click(); }
  function rfLQEsc() { var ev = new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); D.body.dispatchEvent(ev); }
  function rfLQKey(k, mods) { D.body.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {}))); }
  function rfLQLast(type) { return UI.App.model.features.filter(function (f) { return f.type === type; }).pop(); }
  function rfLQPmButton(text) {
    var b = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent.trim() === text; })[0];
    assert(b, 'PM button ' + text); b.click();
  }
  async function rfLQPart(code, tab) {
    await anvil.newPart(); await idle();
    if (code) { await anvil.run(code); await idle(); }
    UI.setRibbonTab(tab || 'Sketch');
    UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(60);
  }
  async function rfLQClick(p) { selClick(rfLQScr(p)); await idle(); await wait(15); }

  step('rfLQ: the greyed commands are enabled: 3D Sketch and 3D Sketch On Plane in the Sketch flyout, Offset On Surface on the Sketch tab, Split Line in the Curves flyout and Insert ▸ Curve, Insert ▸ 3D Sketch rows', async function () {
    await rfLQPart('p.units("mm");\np.sketch("Top").rect(-5, -5, 10, 10).end().extrude(4);');
    var rows = rfLQFlyRows('sketch'), txt = rows.map(function (r) { return r.textContent.replace(/\s+/g, ' ').trim() + (r.classList.contains('disabled') ? ' (off)' : ''); });
    if (UI.closeMenus) UI.closeMenus();
    assert(txt.length === 3 && /^Sketch/.test(txt[0]) && txt[1] === '3D Sketch' && txt[2] === '3D Sketch On Plane', 'Sketch flyout: ' + JSON.stringify(txt));
    assert(!rfLQButton('Offset On Surface').disabled, 'Offset On Surface enabled');
    UI.setRibbonTab('Features'); await idle();
    var cv = rfLQFlyRows('curves');
    assert(!cv[0].classList.contains('disabled') && /Split Line/.test(cv[0].textContent), 'Split Line enabled in the Curves flyout');
    if (UI.closeMenus) UI.closeMenus();
    var mr = menuRows('Curve ▸ Split Line');
    assert(mr.length === 1 && !mr[0].row.classList.contains('disabled'), 'Insert ▸ Curve ▸ Split Line… enabled');
    if (UI.closeMenus) UI.closeMenus();
    var s3 = menuRows('3D Sketch');
    assert(s3.length >= 2 && s3.every(function (r) { return !r.row.classList.contains('disabled'); }), 'Insert ▸ 3D Sketch / 3D Sketch On Plane: ' + s3.map(function (r) { return r.text; }).join(' | '));
    if (UI.closeMenus) UI.closeMenus();
    return txt.join(', ');
  });

  step('rfLQ: 3D Sketch by clicks: a line along X from the origin, one along Y, Tab to the YZ plane, one along Z (Along X / Y / Z inferred); the first line\'s Length typed 12, R2 Sketch Fillets on both corners; ✓ makes 3DSketch1 and a Ø2 circle swept along it has the volume π (24 + 2π)', async function () {
    await rfLQPart('p.units("mm");');
    rfLQFly('sketch', '3D Sketch'); await idle();
    assert(UI.pmTitle() === '3D Sketch', 'the 3D Sketch PM: ' + UI.pmTitle());
    UI.setView('Isometric'); await idle(); UI.zoomView(0.3); await idle(); await wait(30);
    await rfLQClick([0, 0, 0]);
    await rfLQClick([10, 0, 0]);
    await rfLQClick([10, 10, 0]);
    rfLQKey('Tab'); await idle();
    assert(UI.sketch3dState().dp === 'YZ', 'Tab: the YZ plane: ' + UI.sketch3dState().dp);
    await rfLQClick([10, 10, -10]);   // (10, 10, 10) would sit on the origin in an isometric view
    await rfLQClick([10, 10, -10]);   // the last point again ends the chain
    var st = UI.sketch3dState(), f = st.f;
    assert(f.ents.length === 3 && f.ents.every(function (e) { return e.t === 'line'; }), 'three lines: ' + JSON.stringify(f.ents));
    var rels = f.rels.map(function (r) { return r.type; }).join(',');
    assert(/fix/.test(rels) && /alongX/.test(rels) && /alongY/.test(rels) && /alongZ/.test(rels), 'Fixed at the origin, Along X / Y / Z: ' + rels + ' pts ' + JSON.stringify(f.pts) + ' px/mm ' + Math.hypot(rfLQScr([10, 0, 0])[0] - rfLQScr([0, 0, 0])[0], rfLQScr([10, 0, 0])[1] - rfLQScr([0, 0, 0])[1]) / 10);
    assert(st.chain == null, 'the chain ended');
    // Select the first line, type its Length
    D.querySelector('#pm input[type=radio][value="select"]').click(); await idle();
    await rfLQClick([5, 0, 0]);
    assert(UI.sketch3dState().sel.length === 1 && UI.sketch3dState().sel[0].kind === 'ent', 'Line1 selected');
    var L = pmField('Length');
    assert(L, 'Length box'); near(+L.value, 10, 0.3, 'Length shows about 10');
    setInput(L, '12'); await idle();
    f = UI.sketch3dState().f;
    near(f.pts[f.ents[0].b][0], 12, 1e-9, 'the end moved to x = 12');
    near(f.pts[f.ents[1].b][0], 12, 1e-9, 'Line2 followed (Along Y)');
    // Line2 and Line3: Length 10 each (the clicks land within a pixel of 10)
    await rfLQClick([12, 5, 0]);
    setInput(pmField('Length'), '10'); await idle();
    f = UI.sketch3dState().f;
    await rfLQClick([f.pts[f.ents[2].a][0], f.pts[f.ents[2].a][1], -5]);
    assert(UI.sketch3dState().sel.length === 1 && UI.sketch3dState().sel[0].i === 2, 'Line3 selected: ' + JSON.stringify(UI.sketch3dState().sel));
    setInput(pmField('Length'), '10'); await idle();
    f = UI.sketch3dState().f;
    near(Math.abs(f.pts[f.ents[2].b][2] - f.pts[f.ents[2].a][2]), 10, 1e-9, 'Line3 is 10 along Z');
    // the two corners: R2 Sketch Fillet
    await rfLQClick([12, 0, 0]);
    setInput(pmField('Fillet radius'), '2'); await idle();
    rfLQPmButton('Sketch Fillet'); await idle();
    f = UI.sketch3dState().f;
    await rfLQClick(f.pts[f.ents[1].b]);
    setInput(pmField('Fillet radius'), '2'); await idle();
    rfLQPmButton('Sketch Fillet'); await idle();
    f = UI.sketch3dState().f;
    assert(f.ents.filter(function (e) { return e.t === 'fillet'; }).length === 2, 'two fillets');
    rfLQOK(); await idle(); await wait(30);
    var sk = rfLQLast('sketch3d');
    assert(sk && sk.name === '3DSketch1' && !UI.App.build.errors[sk.id], '3DSketch1 built: ' + JSON.stringify(UI.App.build.errors));
    assert(UI.pmTitle() == null || UI.pmTitle() !== '3D Sketch', 'the PM closed');
    var g = UI.App.build.planes[sk.id];
    near(g.length, 24 + 2 * Math.PI, 1e-9, 'path length');
    await anvil.run(anvil.script() + '\nvar pr = p.sketch("Right").circle(0, 0, 1).id();\np.sweep({ profile: pr, path: ' + 'f1' + ' });'); await idle();
    var sw = rfLQLast('sweep');
    assert(sw && !UI.App.build.errors[sw.id], 'the sweep along the 3D sketch: ' + JSON.stringify(UI.App.build.errors));
    near(anvil.mass().volume, Math.PI * (24 + 2 * Math.PI), 1e-6, 'sweep volume');
    return anvil.mass().volume.toFixed(6);
  });

  step('rfLQ: 3D Sketch Edit Feature reopens it with its lines; a Point drawn and Ctrl+Z inside takes it back; Esc leaves the feature as it was', async function () {
    var sk = rfLQLast('sketch3d');
    assert(sk, 'the 3D sketch from the step before');
    var before = JSON.stringify(sk);
    UI.editFeature(sk); await idle();
    assert(UI.pmTitle() === '3DSketch1', 'editing 3DSketch1: ' + UI.pmTitle());
    assert(UI.sketch3dState().f.ents.filter(function (e) { return e.t === 'line'; }).length === 3, 'its three lines');
    D.querySelector('#pm input[type=radio][value="point"]').click(); await idle();
    await rfLQClick([-5, 0, -5]);
    assert(UI.sketch3dState().f.ents.some(function (e) { return e.t === 'point'; }), 'a point placed');
    rfLQKey('z', { ctrlKey: true }); await idle();
    assert(!UI.sketch3dState().f.ents.some(function (e) { return e.t === 'point'; }), 'Ctrl+Z took the point back');
    await rfLQClick([-5, 0, -5]);
    rfLQEsc(); await idle();
    assert(!UI.sketch3dState(), 'Esc closed the 3D sketch');
    assert(JSON.stringify(rfLQLast('sketch3d')) === before, 'the feature is as it was');
    return 'ok';
  });

  step('rfLQ: 3D Sketch On Plane with the Top Plane selected: a line drawn on it stays on it (y = 0, On Plane), Tab goes back to space; ✓ makes 3DSketch1', async function () {
    await rfLQPart('p.units("mm");');
    var row = Array.prototype.filter.call(D.querySelectorAll('#tree [data-fid], #tree .tree-row, #tree div'), function (r) { return /^\s*Top Plane\s*$/.test(r.textContent); })[0];
    if (row) { row.click(); await idle(); }
    else UI.setSelection([{ kind: 'plane', ref: 'Top' }]);
    rfLQFly('sketch', '3D Sketch On Plane'); await idle();
    var st = UI.sketch3dState();
    if (st && st.onPlane < 0 && !st.f.planes.length) { UI.sketch3dPlane({ kind: 'plane', ref: 'Top' }); st = UI.sketch3dState(); }
    assert(st && st.f.planes.length === 1 && st.onPlane === 0 && st.f.planes[0].ref === 'Top', 'on the Top Plane: ' + JSON.stringify(st && st.f.planes));
    UI.setView('Isometric'); await idle(); UI.zoomView(0.3); await idle(); await wait(30);
    await rfLQClick([20, 0, 30]);
    await rfLQClick([60, 0, 40]);
    await rfLQClick([60, 0, 40]);
    var f = UI.sketch3dState().f;
    assert(f.ents.length === 1, 'one line');
    f.pts.forEach(function (p) { near(p[1], 0, 1e-9, 'on the Top Plane'); });
    assert(f.rels.filter(function (r) { return r.type === 'onPlane'; }).length === 2, 'both ends On Plane');
    near(f.pts[f.ents[0].a][0], 20, 0.5, 'start x'); near(f.pts[f.ents[0].a][2], 30, 0.5, 'start z');
    rfLQKey('Tab'); await idle();
    assert(UI.sketch3dState().onPlane < 0, 'Tab: back to space');
    rfLQOK(); await idle();
    var sk = rfLQLast('sketch3d');
    assert(sk && sk.planes && sk.planes.length === 1 && !UI.App.build.errors[sk.id], 'built with its plane');
    return sk.name;
  });

  step('rfLQ: Split Line from the Curves flyout: Projection of a 4 × 4 square sketch onto the clicked top face of a block, ✓ makes Split Line1 (7 faces, volume unchanged), the square is its own face to a click; Edit Feature reopens it; Esc cancels a second one cleanly', async function () {
    await rfLQPart('p.units("mm");\np.sketch("Top").rect(-5, -5, 10, 10).end().extrude(4);\np.sketch("Top", 4).centerRect(0, 0, 4, 4).end();', 'Features');
    var nf0 = UI.App.mesh.faces.length, v0 = anvil.mass().volume;
    rfLQFly('curves', 'Split Line'); await idle();
    assert(UI.pmTitle() === 'Split Line', 'the Split Line PM: ' + UI.pmTitle());
    var mode = D.querySelector('#pm input[type=radio][value="projection"]');
    assert(mode && mode.checked, 'Projection');
    await rfLQClick([3.5, 4, 3.5]);
    assert(UI.pmSpec().values.faces.length === 1, 'one face picked');
    assert(/1 face piece|face piece/.test(statusText()), 'preview status: ' + statusText());
    rfLQOK(); await idle(); await wait(30);
    var sl = rfLQLast('splitLine');
    assert(sl && sl.name === 'Split Line1' && !UI.App.build.errors[sl.id], 'Split Line1: ' + JSON.stringify(UI.App.build.errors));
    assert(UI.App.mesh.faces.length === nf0 + 1, 'one more face: ' + nf0 + ' -> ' + UI.App.mesh.faces.length);
    near(anvil.mass().volume, v0, 1e-9, 'volume unchanged');
    // a click on the square selects a face of its own (area 16)
    UI.setSelection([]); await idle();
    await rfLQClick([0.5, 4, 0.5]);
    var s = anvil.selection()[0];
    assert(s && s.kind === 'face', 'a face selected: ' + JSON.stringify(s));
    near(UI.App.mesh.faces[s.index].area, 16, 1e-6, 'the split square');
    UI.setSelection([]); await idle();
    UI.editFeature(sl); await idle();
    assert(UI.pmTitle() === 'Split Line1' && UI.pmSpec().values.faces.length === 1, 'editing Split Line1');
    rfLQEsc(); await idle();
    var n = UI.App.model.features.length;
    rfLQFly('curves', 'Split Line'); await idle();
    await rfLQClick([-3.5, 4, -3.5]);
    rfLQEsc(); await idle();
    assert(!UI.hasPM() && UI.App.model.features.length === n, 'Esc: nothing added');
    return UI.App.mesh.faces.length + ' faces';
  });

  step('rfLQ: Split Line Intersection with the Right Plane on two clicked faces gives 8 faces; Offset On Surface on the clicked top face by 1 makes a 3D sketch of four lines 1 inside its edges', async function () {
    await rfLQPart('p.units("mm");\np.sketch("Top").rect(-5, -5, 10, 10).end().extrude(4);', 'Features');
    rfLQFly('curves', 'Split Line'); await idle();
    D.querySelector('#pm input[type=radio][value="intersection"]').click(); await idle();
    var pl = pmField('Splitting plane');
    assert(pl, 'Splitting plane list'); setInput(pl, 'Right'); await idle();
    await rfLQClick([3, 4, 3]);
    await rfLQClick([3, 2, 5]);
    rfLQOK(); await idle(); await wait(30);
    var sl = rfLQLast('splitLine');
    assert(sl && sl.mode === 'intersection' && !UI.App.build.errors[sl.id], 'built: ' + JSON.stringify(UI.App.build.errors));
    assert(UI.App.mesh.faces.length === 8, 'faces: ' + UI.App.mesh.faces.length);
    UI.setRibbonTab('Sketch'); await idle();
    rfLQButton('Offset On Surface').click(); await idle();
    assert(UI.pmTitle() === 'Offset On Surface', 'the Offset On Surface PM: ' + UI.pmTitle());
    setInput(pmField('Distance'), '1'); await idle();
    await rfLQClick([-3, 4, -3]);
    assert(UI.pmSpec().values.faces.length === 1, 'face picked');
    rfLQOK(); await idle(); await wait(30);
    var sk = rfLQLast('sketch3d');
    assert(sk && !UI.App.build.errors[sk.id], '3D sketch built: ' + JSON.stringify(UI.App.build.errors));
    var lines = sk.ents.filter(function (e) { return e.t === 'line'; });
    assert(lines.length === 4, 'four lines (the top piece x < 0): ' + lines.length);
    sk.pts.forEach(function (p) { near(p[1], 4, 1e-9, 'on the top'); assert(p[0] >= -4 - 1e-9 && p[0] <= -1 + 1e-9, 'x inside: ' + p[0]); });
    return sk.name;
  });
