  // ---- Distance / Angle mates, Move / Rotate Component, Interference Detection (run cloud-2026-09-25e)
  var BASE_S = 'p.name("Base"); p.box(100, 60, 10);', BLOCK_S = 'p.name("Block"); p.box(20, 20, 20);';
  function exByName(n) { return (W.AnvilExamples || []).filter(function (e) { return e.name === n; })[0]; }
  function rowText(r) { var n = r.querySelector('.nm') || r; return n.textContent.replace(/\s+/g, ' ').trim(); }
  // base (fixed) + a block standing 20 above it, no mates
  async function baseAndBlock(name) {
    await anvil.newAssembly(name || 'MoveAsm');
    await anvil.insert({ script: BASE_S });
    await anvil.insert({ script: BLOCK_S }, { position: [40, 30, 20] });
    await idle();
  }
  step('assembly: fully defined components show no prefix, fixed ones "(f)", under-defined ones "(-)"; Distance / Angle mate rows', async function () {
    var ex = exByName('Distance and angle mates');
    assert(ex, 'Distance and angle mates example missing');
    await anvil.run(ex.code);
    await idle();
    var s = anvil.summary();
    assert(s.type === 'assembly' && Object.keys(s.errors).length === 0, 'errors ' + JSON.stringify(s.errors));
    near(s.volume, ex.volume, ex.volume * 1e-6, 'volume');
    ex.checks.forEach(function (c) { nearVecS(asmComp(c.component).position, c.position, 1e-6, c.component); });
    var texts = compRows().map(rowText);
    assert(texts[0] === '(f) Base<1>', 'fixed row: ' + texts[0]);
    assert(texts[1] === 'Block<1>' && texts[2] === 'Bar<1>', 'fully defined rows carry no prefix: ' + JSON.stringify(texts));
    assert(anvil.components().every(function (c) { return !c.underDefined && (c.fixed || c.dof === 0); }), 'dof ' + JSON.stringify(anvil.components().map(function (c) { return c.dof; })));
    var mt = mateRows().map(rowText);
    assert(mt.some(function (t) { return /^Distance1 \(Block<1>, Base<1>\)/.test(t); }) && mt.some(function (t) { return /^Angle1 \(Bar<1>, Base<1>\)/.test(t); }), 'mate rows ' + JSON.stringify(mt));
    var am = anvil.mates().filter(function (m) { return m.type === 'angle'; })[0];
    assert(am && am.angle === 30 && am.ok, 'anvil.mates() angle ' + JSON.stringify(am));
    // the same tree with an under-defined component: the Pinned plate pins keep one DOF (spin)
    await anvil.run(exByName('Pinned plate assembly').code);
    await idle();
    texts = compRows().map(rowText);
    assert(texts[1] === '(-) Pin<1>' && texts[3] === 'Cap<1>', 'pinned plate rows ' + JSON.stringify(texts));
    return JSON.stringify(texts);
  });
  step('assembly PM: Mate PM Distance starts at the measured gap; 12 puts the block 12 above the base; Flip dimension puts it below', async function () {
    await baseAndBlock('DistAsm');
    var top = asmFace(0, 1, 10), bottom = asmFace(1, -1, 30);
    assert(top && bottom, 'faces ' + JSON.stringify([top, bottom]));
    UI.cmdMate();
    UI.App.command.onPick(bottom);
    UI.App.command.onPick(top);
    await idle();
    assert(!D.querySelector('#pm input[data-key="distance"]') && D.querySelector('#pm input[data-key="offset"]'), 'Coincident shows Offset, not Distance');
    setInput(D.querySelector('#pm select[data-key="type"]'), 'distance');
    await idle();
    var dist = D.querySelector('#pm input[data-key="distance"]');
    assert(dist, 'Distance field missing after choosing Distance');
    near(+dist.value, 20, 1e-6, 'measured gap');
    assert(D.querySelector('#pm select[data-key="alignment"]').value === 'anti-aligned', 'face-face Distance is anti-aligned');
    assert(UI.pmSetField('distance', '12'), 'pmSetField distance');
    await pmAccept();
    var ms = anvil.mates();
    assert(ms.length === 1 && ms[0].type === 'distance' && ms[0].distance === 12 && ms[0].name === 'Distance1' && ms[0].ok, JSON.stringify(ms));
    near(anvil.components()[1].position[1], 22, 1e-6, 'block bottom 12 above the top');
    UI.cmdMate(ms[0].id);
    var flip = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-row.check'), function (r) { return /Flip dimension/.test(r.textContent); })[0];
    assert(flip, 'Flip dimension checkbox missing');
    flip.querySelector('input').click();
    await pmAccept();
    near(anvil.components()[1].position[1], -2, 1e-6, 'flipped: 12 below the top');
    assert(anvil.mates()[0].flip === true, 'flip stored');
    await UI.undo(); await idle();
    near(anvil.components()[1].position[1], 22, 1e-6, 'undo restores the unflipped placement');
  });
  step('assembly PM: Angle mate type shows Angle and Flip dimension; an Angle between the side faces turns the block 30°', async function () {
    var front = null, side = null, faces = UI.App.mesh.faces, i;
    for (i = 0; i < faces.length; i++) if (faces[i].body === 0 && faces[i].normal[2] > 0.99) front = { kind: 'face', index: i, point: faces[i].centroid.slice() };
    for (i = 0; i < faces.length; i++) if (faces[i].body === 1 && faces[i].normal[2] > 0.99) side = { kind: 'face', index: i, point: faces[i].centroid.slice() };
    assert(front && side, 'faces');
    UI.cmdMate();
    UI.App.command.onPick(side);
    UI.App.command.onPick(front);
    setInput(D.querySelector('#pm select[data-key="type"]'), 'angle');
    await idle();
    assert(D.querySelector('#pm input[data-key="angle"]') && !D.querySelector('#pm input[data-key="distance"]'), 'Angle field');
    assert(UI.pmSetField('angle', '30'), 'pmSetField angle');
    await pmAccept();
    var am = anvil.mates().filter(function (m) { return m.type === 'angle'; })[0];
    assert(am && am.ok && am.angle === 30, JSON.stringify(anvil.mates()));
    var R = anvil.components()[1].rotation;
    near(Math.abs(R[8]), Math.cos(Math.PI / 6), 1e-6, 'block +Z turned 30° from the base +Z');
    near(anvil.components()[1].position[1], 22, 1e-6, 'the Distance still holds');
    assert(mateRows().some(function (r) { return /^Angle1/.test(rowText(r)); }), 'Angle1 row');
  });
  step('assembly: anvil.moveComponent / rotateComponent move a floating component and re-solve; a fixed one is refused', async function () {
    await baseAndBlock('MoveApi');
    var s = await anvil.mate('coincident', { component: 2, face: [10, 0, 10] }, { component: 1, face: [50, 10, 30] });
    await idle();
    nearVecS(anvil.components()[1].position, [40, 10, 20], 1e-6, 'on the top');
    assert(anvil.components()[1].dof === 3 && rowText(compRows()[1]) === '(-) Block<1>', '3 DOF, "(-)"');
    await anvil.moveComponent('Block<1>', [5, 50, -3]);
    nearVecS(anvil.components()[1].position, [45, 10, 17], 1e-6, 'slid in x / z, y held by the mate');
    await anvil.rotateComponent('Block<1>', 'y', 90);
    var R = anvil.components()[1].rotation;
    near(R[2], 1, 1e-6, 'Ry(90)[0][2]'); near(R[4], 1, 1e-6, 'still upright');
    var bad = null;
    try { await anvil.moveComponent('Base<1>', [1, 0, 0]); } catch (e) { bad = e.message; }
    assert(/Base<1> is fixed/.test(bad || ''), 'fixed refused: ' + bad);
    await UI.undo(); await idle();
    nearVecS(anvil.components()[1].position, [45, 10, 17], 1e-6, 'undo the rotation only');
  });
  // a left-button drag in the viewport, as a mouse would deliver it (ui-sketch.js listens on #viewport and window)
  async function dragViewport(from, to) {
    var vp = $('viewport'), r = vp.getBoundingClientRect();
    function ev(type, p, target) { (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: r.left + p[0], clientY: r.top + p[1] })); }
    ev('mousedown', from, vp);
    for (var k = 1; k <= 5; k++) { ev('mousemove', [from[0] + (to[0] - from[0]) * k / 5, from[1] + (to[1] - from[1]) * k / 5]); await wait(20); }
    ev('mouseup', to);
    await idle();
  }
  step('assembly: dragging a floating component in the Front view moves it in the screen plane; its mate holds y; one undo step', async function () {
    UI.setView('Front');
    var before = anvil.components()[1], undoN = UI.App.undo.length;
    var c = W.Assembly.componentCenter(UI.App.model, UI.App.build, before.id), p = UI.worldToScreen(c);
    var hit = UI.pickFace(p[0], p[1]);
    assert(hit && UI.App.mesh.faces[hit.index].body === 1, 'the block is under its centre on screen');
    var sc = UI.cam.scale;
    await dragViewport(p, [p[0] + 40, p[1] - 30]);
    var after = anvil.components()[1];
    near(after.position[0], before.position[0] + 40 * sc, 1e-6, 'x follows the drag');
    near(after.position[1], 10, 1e-6, 'y held by the Coincident mate');
    near(after.position[2], before.position[2], 1e-6, 'z unchanged (screen plane)');
    assert(UI.App.undo.length === undoN + 1, 'one undo step (' + (UI.App.undo.length - undoN) + ')');
    await UI.undo(); await idle();
    nearVecS(anvil.components()[1].position, before.position, 1e-9, 'undo');
    return 'moved ' + fmt(40 * sc) + ' in x';
  });
  step('assembly: dragging the fixed base rotates the view and leaves the model unchanged; a click still selects', async function () {
    var model = JSON.stringify(anvil.model()), dir = [UI.cam.dir.x, UI.cam.dir.y, UI.cam.dir.z];
    var p = UI.worldToScreen([50, 5, 60]);
    var hit = UI.pickFace(p[0], p[1]);
    assert(hit && UI.App.mesh.faces[hit.index].body === 0, 'the base is under the point');
    await dragViewport(p, [p[0] + 60, p[1]]);
    assert(JSON.stringify(anvil.model()) === model, 'model changed by dragging a fixed component');
    assert(Math.abs(UI.cam.dir.x - dir[0]) + Math.abs(UI.cam.dir.z - dir[2]) > 1e-3, 'the view rotated');
    UI.setView('Front');
    var q = UI.worldToScreen(W.Assembly.componentCenter(UI.App.model, UI.App.build, 2));
    await dragViewport(q, q);
    assert(UI.selectedComponent() && UI.selectedComponent().name === 'Block<1>', 'a click on the block selects it');
    assert(JSON.stringify(anvil.model()) === model, 'a click does not move it');
  });
  step('assembly PM: Move Component By Delta XYZ and Rotate Component By Delta XYZ act on the selected component (ribbon buttons)', async function () {
    UI.App.ribbonTab = 'Assembly'; UI.refreshRibbon();
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (b) { return /Move\s*Component/.test(b.textContent); })[0];
    assert(btn, 'Move Component ribbon button');
    btn.click();
    assert(UI.hasPM() && UI.App.command && UI.App.command.dragComponents === 'move', 'Move Component PM (drag = move)');
    setInput(D.querySelector('#pm select[data-key="move"]'), 'delta');
    assert(UI.pmSetField('dx', '-10') && UI.pmSetField('dz', '4'), 'delta fields');
    var apply = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-btns button'), function (b) { return b.textContent === 'Apply'; })[0];
    var before = anvil.components()[1].position;
    apply.click(); await idle();
    nearVecS(anvil.components()[1].position, [before[0] - 10, 10, before[2] + 4], 1e-6, 'moved by delta');
    await pmAccept();
    var rb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (b) { return /Rotate\s*Component/.test(b.textContent); })[0];
    assert(rb, 'Rotate Component ribbon button');
    rb.click();
    assert(UI.hasPM() && UI.App.command.dragComponents === 'rotate' && /Rotate Component/.test($('pm').textContent), 'Rotate Component PM');
    setInput(D.querySelector('#pm select[data-key="rotate"]'), 'delta');
    assert(UI.pmSetField('ay', '45'), 'angle field');
    Array.prototype.filter.call(D.querySelectorAll('#pm .pm-btns button'), function (b) { return b.textContent === 'Apply'; })[0].click();
    await idle();
    near(anvil.components()[1].rotation[0], Math.cos(Math.PI / 4), 1e-6, 'turned 45° about Y');
    await pmAccept();
  });
  step('assembly PM: Interference Detection (Evaluate tab) lists the two overlaps, highlights them, a result row shows one pair; anvil.interference()', async function () {
    var ex = exByName('Interference check');
    await anvil.run(ex.code);
    await idle();
    var api = anvil.interference();
    assert(api.count === 2 && api.pairs[0].a === 'Base<1>' && api.pairs[0].b === 'Block<1>' && api.pairs[1].b === 'Pin<2>', JSON.stringify(api));
    near(api.pairs[0].volume, 2000, 1e-6, 'Base ∩ Block'); near(api.pairs[1].volume, 8 * Math.PI * 16, 1e-6, 'Base ∩ Pin<2>');   // exact from the surface records (cloud-2026-09-26r): π·4² × 8 thick
    UI.App.ribbonTab = 'Evaluate'; UI.refreshRibbon();
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (b) { return /Interference/.test(b.textContent); })[0];
    assert(btn, 'Interference Detection ribbon button');
    btn.click();
    assert(UI.hasPM() && /Interference Detection/.test($('pm').textContent), 'PM open');
    var rows = D.querySelectorAll('#pm .intf-row');
    assert(rows.length === 2 && /Base<1> · Block<1>/.test(rows[0].textContent) && /Base<1> · Pin<2>/.test(rows[1].textContent), 'rows: ' + Array.prototype.map.call(rows, rowText).join(' | '));
    assert(/2 interferences/.test($('pm').textContent), 'message: ' + D.querySelector('#pm .pm-msg').textContent);
    var fl = UI.App.command.faceList, bodies = {};
    fl.forEach(function (i) { bodies[UI.App.mesh.faces[i].body] = true; });
    assert(bodies[0] && bodies[1] && bodies[3] && !bodies[2], 'highlighted components ' + JSON.stringify(Object.keys(bodies)));
    assert(UI.groups.preview.children.length === 2, 'two red common volumes, got ' + UI.groups.preview.children.length);
    rows[1].click();
    bodies = {};
    UI.App.command.faceList.forEach(function (i) { bodies[UI.App.mesh.faces[i].body] = true; });
    assert(Object.keys(bodies).sort().join() === '0,3' && UI.groups.preview.children.length === 1, 'one pair: ' + JSON.stringify(Object.keys(bodies)));
    assert(D.querySelector('#pm .intf-row.selected'), 'selected row');
    await pmAccept();
    assert(UI.groups.preview.children.length === 0, 'preview cleared on close');
    // a clean assembly reports none
    await anvil.run(exByName('Distance and angle mates').code);
    await idle();
    UI.cmdInterference();
    assert(D.querySelector('#pm .intf-none') && /No interferences/.test(D.querySelector('#pm .pm-msg').textContent), 'no interferences message');
    await pmAccept();
    assert(anvil.interference().count === 0, 'anvil.interference() on a clean assembly');
  });
  step('assembly: anvil.newPart() returns to a part document with the Features ribbon', async function () {
    var s = await anvil.newPart('BackToPart');
    await idle();
    s = anvil.summary();
    assert(s.type === 'part' && !UI.isAssembly() && !anvil.isAssembly(), 'type ' + s.type);
    assert(s.features === 0 && $('doc-title').textContent === 'BackToPart', 'fresh part ' + $('doc-title').textContent);
    assert($('ribbon-tabs').textContent.indexOf('Features') >= 0 && $('ribbon-tabs').textContent.indexOf('Assembly') < 0, 'ribbon tabs: ' + $('ribbon-tabs').textContent);
    assert(compRows().length === 0 && !D.querySelector('#tree .ti.mates-folder'), 'assembly rows left in the tree');
    s = await anvil.run('p.box(10, 10, 10);');
    await idle();
    near(s.volume, 1000, 1e-6, 'a part still builds');
  });

