  // --- r10/facesketch10 ---
  step('Sketch on a face follows the face (SolidWorks): a boss sketched on the top of a 10 mm plate and Hole Wizard holes placed on it move up when the plate is made 15; deleting the plate leaves a Dangling warning, not an error', async function () {
    await anvil.run('p.box(60, 60, 10, { centered: true });'); await idle();
    var base = UI.App.model.features[1], idx = faceWithNormal([0, 1, 0]);
    UI.App.sel = { kind: 'face', index: idx, point: [3.3, 10, -7.1] };
    UI.cmdSketch(); await idle();
    assert(UI.App.mode === 'sketch' && UI.App.activeSketch != null, 'not in sketch mode');
    var sk = K.findFeature(UI.App.model, UI.App.activeSketch);
    assert(sk.plane.face && sk.plane.face.feature === base.id && sk.plane.face.role === 'cap', 'face reference ' + JSON.stringify(sk.plane));
    assert(sk.plane.offset === 10 && JSON.stringify(sk.plane.n) === '[0,1,0]' && JSON.stringify(sk.plane.origin) === '[0,10,0]', 'clean frame ' + JSON.stringify(sk.plane));
    sk.entities.push({ t: 'circle', cx: 0, cy: 0, r: 5 });
    await UI.exitSketch(); await idle();
    UI.App.model.features.push({ id: UI.App.model.nextId++, type: 'extrude', name: 'Pin', sketch: sk.id, depth: 5, end: 'blind' });
    await UI.rebuild(); await idle();
    UI.cmdHoleWizard();
    assert(UI.App.command.onPick({ kind: 'face', index: faceWithNormal([0, 1, 0]), point: [-15, 10, -15] }) !== false, 'hole pick 1');
    assert(UI.App.command.onPick({ kind: 'face', index: faceWithNormal([0, 1, 0]), point: [15, 10, 15] }) !== false, 'hole pick 2');
    await pmAccept();
    var hole = UI.App.model.features[UI.App.model.features.length - 1], hs = K.findFeature(UI.App.model, hole.sketch);
    assert(hole.type === 'hole' && hs.plane.face && hs.plane.face.feature === base.id, 'hole positions sketch ' + JSON.stringify(hs.plane));
    hole.end = 'blind'; hole.depth = 8;   // blind 8 (counterbore 6.5), inside the 10 mm plate
    await UI.rebuild(); await idle();
    var v10 = anvil.summary().volume;
    near(anvil.summary().bbox.max[1], 15, 1e-6, 'pin top at 10 + 5');
    base.depth = 15;
    await UI.rebuild(); await idle();
    var s15 = anvil.summary();
    assert(!Object.keys(s15.errors).length, JSON.stringify(s15.errors));
    near(s15.volume - v10, 60 * 60 * 5, 2e-3, 'only the plate grew: pin and holes moved up whole');
    near(s15.bbox.max[1], 20, 1e-6, 'pin top at 15 + 5');
    assert(sk.plane.offset === 15 && hs.plane.offset === 15, 'sketch planes ' + sk.plane.offset + ' / ' + hs.plane.offset);
    UI.App.sel = null;
    UI.deleteFeature(base.id);
    assert(modalOpen(), 'confirm modal expected');
    clickModalButton('Delete'); await idle();
    assert(!K.findFeature(UI.App.model, base.id) && K.findFeature(UI.App.model, sk.id), 'plate deleted, face sketch kept: ' + names().join());
    assert(!UI.App.build.errors[sk.id] && /Dangling/.test(UI.App.build.warnings[sk.id] || ''), 'warning ' + JSON.stringify(UI.App.build.warnings));
    var row = D.querySelector('#tree .ti[data-fid="' + sk.id + '"]');
    assert(row && /warn/.test(row.className) && /Dangling/.test((row.querySelector('.nm') || {}).title || ''), 'tree row warns: ' + (row && row.className));
    UI.undo(); await idle();
    assert(K.findFeature(UI.App.model, base.id) && !UI.App.build.warnings[sk.id], 'undo brings the plate and the face back');
    return 'volume ' + v10 + ' -> ' + s15.volume;
  });
  // --- end r10/facesketch10 ---

