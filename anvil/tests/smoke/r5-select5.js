  // --- r5/select5 ---
  step('r5/select5: PropertyManager handles drag freely (a value between ruler ticks), the pointer over the ruler snaps to the tick under it (ruler lit); a negative plane offset has a ruler on both sides of 0', async function () {
    need(UI, 'instant3DRulerPoint');
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(-20, -10, 40, 20).extrude(10);\np.sketch("Top", 10).circle(0, 0, 5);'); await idle();
    UI.setView('Isometric');
    UI.cmdExtrude(false); await UI.previewIdle();
    function pmH() { return UI.instant3DHandles().filter(function (x) { return x.kind === 'pm' && x.key === 'depth'; })[0]; }
    var g = f4Handles().filter(function (x) { return x.kind === 'pm'; })[0], dh = pmH();
    var a10 = UI.worldToScreen(dh.pos(10)), a23 = UI.worldToScreen(dh.pos(13.37));   // (kept on screen in the small frame)
    await f4Drag(g.grab, [g.grab[0] + a23[0] - a10[0], g.grab[1] + a23[1] - a10[1]], f4El('#i3d-layer .i3d-handle[data-kind="pm"]'));
    var free = UI.pmSpec().values.depth;
    near(free, 13.37, 0.6, 'free drag');
    assert(Math.abs(free / dh.step() - Math.round(free / dh.step())) > 1e-6, 'a value between the ticks: ' + free);
    assert(Math.abs(free * 100 - Math.round(free * 100)) < 1e-6, 'to the displayed precision: ' + free);
    g = f4Handles().filter(function (x) { return x.kind === 'pm'; })[0]; dh = pmH();
    var tick = dh.step() * Math.round(8 / dh.step()), rp = UI.instant3DRulerPoint(dh, tick), lit = false, hit = 0;
    selEv('mousedown', g.grab, f4El('#i3d-layer .i3d-handle[data-kind="pm"]'));
    for (var k = 1; k <= 6; k++) { selEv('mousemove', [g.grab[0] + (rp[0] - g.grab[0]) * k / 6, g.grab[1] + (rp[1] - g.grab[1]) * k / 6]); await wait(15); }
    UI.tick(); lit = !!f4El('#i3d-layer .i3d-ruler.snapping'); hit = D.querySelectorAll('#i3d-layer .i3d-tick.hit').length;
    selEv('mouseup', rp);
    assert(Math.abs(UI.pmSpec().values.depth - tick) < 1e-9, 'over the ruler: the ' + tick + ' tick, got ' + UI.pmSpec().values.depth);
    assert(lit && hit === 1, 'ruler lit while snapping (' + lit + ', ' + hit + ' tick)');
    UI.pmCancel(); await idle();
    UI.cmdPlane(); await UI.previewIdle();
    UI.pmSetValue('offset', -15); await UI.previewIdle();
    var ph = UI.instant3DHandles().filter(function (x) { return x.kind === 'pm' && x.key === 'offset'; })[0], pg = f4Handles().filter(function (x) { return x.kind === 'pm'; })[0];
    var otick = -ph.step() * Math.round(22 / ph.step()), to = UI.instant3DRulerPoint(ph, otick), labels = '', off;
    selEv('mousedown', pg.grab, f4El('#i3d-layer .i3d-handle[data-kind="pm"]'));
    for (k = 1; k <= 6; k++) { selEv('mousemove', [pg.grab[0] + (to[0] - pg.grab[0]) * k / 6, pg.grab[1] + (to[1] - pg.grab[1]) * k / 6]); await wait(15); }
    UI.tick(); labels = Array.prototype.map.call(D.querySelectorAll('#i3d-layer .i3d-tick-label'), function (t) { return t.textContent; }).join(' ');
    selEv('mouseup', to);
    assert(/(^| )-\d/.test(labels), 'negative ruler labels: ' + labels);
    off = UI.pmSpec().values.offset;
    assert(Math.abs(off - otick) < 1e-9, 'offset ' + otick + ' from the ruler: ' + off);
    UI.pmCancel(); await idle();
    return 'free ' + free + ', ruler ' + tick + ', offset ' + off + ' (' + labels + ')';
  });
  step('r5/select5: Mate PM — one Entities to Mate list (hover lights the face on its own component, Delete removes a pick); Hole Wizard — a row per hole position (hover ring, right-click ▸ Delete)', async function () {
    await anvil.newAssembly('SelList'); await anvil.insert({ script: BASE_S }); await anvil.insert({ script: BLOCK_S }, { position: [40, 30, 20] }); await idle();
    var m = UI.App.mesh, fa = m.faces.findIndex(function (f) { return f.body === 0 && f.normal[1] > 0.99; });
    UI.cmdMate();
    UI.App.command.onPick({ kind: 'face', index: fa, point: m.faces[fa].centroid.slice() });
    var m2 = UI.App.mesh, fb = m2.faces.findIndex(function (f) { return f.body === 1 && f.normal[1] < -0.99; });
    UI.App.command.onPick({ kind: 'face', index: fb, point: m2.faces[fb].centroid.slice() }); await idle();
    var rows = D.querySelectorAll('#pm .pm-list .pm-item');
    assert(rows.length === 2 && /Face@Base<1>/.test(rows[0].textContent) && /Face@Block<1>/.test(rows[1].textContent), 'two rows: ' + Array.prototype.map.call(rows, function (r) { return r.textContent; }).join(' | '));
    rows[1].dispatchEvent(new W.MouseEvent('mouseenter'));
    var hf = UI.App.command.hoverItem && UI.App.command.hoverItem.faces;
    assert(hf && hf.length === 1 && UI.App.mesh.faces[hf[0]].body === 1, 'hovered row → the Block face ' + JSON.stringify(hf));
    rows[1].dispatchEvent(new W.MouseEvent('mouseleave'));
    rows[0].focus(); rows[0].dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })); await idle();
    rows = D.querySelectorAll('#pm .pm-list .pm-item');
    assert(rows.length === 1 && /Face@Block<1>/.test(rows[0].textContent) && UI.pmSpec().values.a && !UI.pmSpec().values.b, 'Delete removed the first pick, the second moved up');
    UI.App.command.onPick({ kind: 'face', index: fb, point: UI.App.mesh.faces[fb].centroid.slice() }); await idle();
    assert(!D.querySelectorAll('#pm .pm-list .pm-item').length && !UI.pmSpec().values.a, 'clicking the listed face again takes it out');
    UI.pmCancel(); await idle();
    await anvil.newPart(); await idle();
    await anvil.run(BLOCK); await idle();
    var top = UI.App.mesh.faces.findIndex(function (f) { return f.normal[1] > 0.99; });
    UI.cmdHoleWizard();
    UI.App.command.onPick({ kind: 'face', index: top, point: [-10, 10, 0] });
    UI.App.command.onPick({ kind: 'face', index: top, point: [10, 10, 0] });
    rows = D.querySelectorAll('#pm .pm-list .pm-item');
    assert(rows.length === 2, 'two hole rows');
    var second = JSON.stringify(UI.pmSpec().values.points[1]);
    rows[0].dispatchEvent(new W.MouseEvent('mouseenter')); UI.tick();
    assert(f4El('#i3d-layer .i3d-hover-item circle'), 'hovered position ringed on the model');
    rows[0].dispatchEvent(new W.MouseEvent('mouseleave'));
    rows[0].focus(); rows[0].dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    assert(UI.pmSpec().values.points.length === 1 && JSON.stringify(UI.pmSpec().values.points[0]) === second, 'one position left: ' + JSON.stringify(UI.pmSpec().values.points));
    UI.pmCancel(); await idle();
    return 'mate list, hole positions list';
  });
  step('r5/select5: after the OpenCascade swap a selected face is found again on its own component (the block\'s bottom resting on the base\'s top is not restored as the base\'s)', async function () {
    need(UI, 'occtSelProbe');
    await anvil.newAssembly('SelRestore'); await anvil.insert({ script: BASE_S }); await anvil.insert({ script: BLOCK_S }, { position: [40, 10, 20] }); await idle();
    var m = UI.App.mesh, bi = m.faces.findIndex(function (f) { return f.body === 1 && f.normal[1] < -0.99; });
    assert(bi >= 0, 'block bottom face');
    var p = UI.occtSelProbe({ kind: 'face', index: bi, point: [50, 10, 30] });
    assert(p.body === 1, 'probe knows its component');
    var r = UI.occtSelRestore(p);
    assert(r && r.index === bi && UI.App.mesh.faces[r.index].body === 1, 'restored on the block: ' + JSON.stringify(r && r.index));
    // the edge on the block's bottom: not the base's coplanar outline
    var e = (UI.App.edges || []).filter(function (x) { return !x.smooth && x.mid && Math.abs(x.mid[1] - 10) < 1e-6 && x.faces && UI.App.mesh.faces[x.faces[0]].body === 1; })[0];
    if (e) { var re = UI.occtSelRestore(UI.occtSelProbe({ kind: 'edge', edge: e })); assert(re && UI.App.mesh.faces[re.edge.faces[0]].body === 1, 'edge restored on the block'); }
    return 'face ' + bi + ' restored on Block<1>';
  });
  step('r5/select5: right-click on the model ▸ Select Other lists the faces under the pointer (the hidden back face too); hovering the hidden one shows it through, clicking it selects it; a right-drag shows no menu', async function () {
    need(UI, 'selectOtherAt'); need(UI, 'pickFacesAll');
    await anvil.newPart(); await idle();
    await anvil.run(BLOCK); await idle();
    UI.setView('Front');
    var c = UI.worldToScreen([0, 5, 0]), list = UI.selectOtherAt(c[0], c[1]);
    assert(list.length === 2 && /^Face \d+@Boss-Extrude1$/.test(list[0].label), 'front and back faces: ' + JSON.stringify(list));
    assert(UI.App.mesh.faces[list[0].index].normal[2] > 0.99 && UI.App.mesh.faces[list[1].index].normal[2] < -0.99, 'nearest first');
    function rclick(p, q) {
      var r = $('viewport').getBoundingClientRect();
      $('viewport').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: r.left + p[0], clientY: r.top + p[1] }));
      W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 2, buttons: 0, clientX: r.left + q[0], clientY: r.top + q[1] }));
      $('viewport').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + q[0], clientY: r.top + q[1] }));
    }
    function menuRows() { var ms = D.querySelectorAll('body > .menu'), m = ms[ms.length - 1]; return m ? Array.prototype.slice.call(m.querySelectorAll('.mi')) : []; }
    rclick(c, [c[0] + 30, c[1] + 20]);
    assert(!menuRows().some(function (r) { return /Select Other/.test(r.textContent); }), 'a right-drag shows no menu');
    UI.closeMenus();
    rclick(c, c);
    var so = menuRows().filter(function (r) { return /Select Other/.test(r.textContent); })[0];
    assert(so, 'Select Other in the menu');
    so.click();
    var rows = menuRows();
    assert(rows.length === 2 && D.querySelector('body > .menu.select-other'), 'the list: ' + rows.map(function (r) { return r.textContent; }).join(' | '));
    rows[1].dispatchEvent(new W.MouseEvent('mouseenter'));
    assert(UI.App.hover && UI.App.hover.index === list[1].index && UI.App.hover.through, 'the hidden face pre-highlighted through the front one');
    // the pointer moving over the list does not take the hover back
    W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: $('viewport').getBoundingClientRect().left + c[0] + 5, clientY: $('viewport').getBoundingClientRect().top + c[1] + 5 }));
    assert(UI.App.hover && UI.App.hover.index === list[1].index, 'hover kept while the list is open');
    rows[1].click();
    var sel = anvil.selection();
    assert(sel.length === 1 && sel[0].kind === 'face' && sel[0].index === list[1].index, 'the back face is selected: ' + JSON.stringify(sel));
    UI.closeMenus();
    return list.map(function (x) { return x.label; }).join(', ');
  });
  // --- end r5/select5 ---
