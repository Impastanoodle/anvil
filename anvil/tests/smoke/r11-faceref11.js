  // --- r11/faceref11 ---
  step('Delete a feature with sketches on its faces: the confirmation lists them (and what is built on them); "Also delete these child features" deletes them, unchecked leaves them Dangling', async function () {
    await anvil.run('var base = p.sketch("Top").rect(-30, -30, 60, 60).extrude(10, { name: "Plate" }).last();\n' +
      'var blk = p.sketch({ face: base, normal: [0, 1, 0] }, 0, "On plate").rect(-10, -10, 20, 20).extrude(5, { name: "Block" }).last();\n' +
      'p.sketch({ face: blk, normal: [0, 1, 0] }, 0, "On block").circle(0, 0, 3).extrude(4, { name: "Pin" });'); await idle();
    function byName(n) { return UI.App.model.features.filter(function (f) { return f.name === n; })[0]; }
    var n0 = UI.App.model.features.length, plate = byName('Plate');
    UI.deleteFeature(plate.id);
    assert(modalOpen(), 'confirm modal expected');
    var txt = $('modal-body').textContent, box = D.getElementById('del-face-children');
    assert(/On plate/.test(txt) && /Block/.test(txt) && /On block/.test(txt) && /Pin/.test(txt), 'lists the children: ' + txt);
    assert(box && !box.checked, 'unchecked by default (SolidWorks)');
    box.checked = true;
    clickModalButton('Delete'); await idle();
    assert(names().join() === 'Sketch1', 'everything on the plate went with it: ' + names().join());
    assert(!Object.keys(UI.App.build.errors).length, JSON.stringify(UI.App.build.errors));
    UI.undo(); await idle();
    assert(UI.App.model.features.length === n0 && !Object.keys(UI.App.build.warnings).length, 'one undo brings all back: ' + names().join());
    // unchecked: the block's sketch and the pin's sketch stay, dangling only where the face is gone
    UI.deleteFeature(byName('Block').id);
    clickModalButton('Delete'); await idle();
    assert(byName('On block') && byName('Pin') && /Dangling/.test(UI.App.build.warnings[byName('On block').id] || ''), 'left dangling: ' + JSON.stringify(UI.App.build.warnings));
    UI.undo(); await idle();
    return txt.replace(/\s+/g, ' ').slice(0, 140);
  });
  step('Edit Sketch Plane: right-click a Dangling sketch, pick a face of an earlier feature, ✓ reattaches it with a face reference (one undo step); a plane works too', async function () {
    await anvil.run('var base = p.sketch("Top").rect(-30, -30, 60, 60).extrude(10, { name: "Plate" }).last();\n' +
      'var blk = p.sketch({ face: base, normal: [0, 1, 0] }, 0, "On plate").rect(-10, -10, 20, 20).extrude(5, { name: "Block" }).last();\n' +
      'p.sketch({ face: blk, normal: [0, 1, 0] }, 0, "On block").circle(0, 0, 3).extrude(4, { name: "Pin" });'); await idle();
    function byName(n) { return UI.App.model.features.filter(function (f) { return f.name === n; })[0]; }
    UI.deleteFeature(byName('Block').id); clickModalButton('Delete'); await idle();
    var sk = byName('On block');
    assert(/Dangling/.test(UI.App.build.warnings[sk.id] || ''), 'dangling first');
    // the tree's context menu has the command
    var row = D.querySelector('#tree .ti[data-fid="' + sk.id + '"]');
    row.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 60, clientY: 200 }));
    var items = Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (x) { return x.textContent.trim(); });
    if (UI.closeMenus) UI.closeMenus();
    assert(items.some(function (t) { return /Edit Sketch Plane/.test(t); }), 'context menu: ' + items.join(' | '));
    UI.editSketchPlane(sk.id); await idle();
    assert(UI.pmTitle() === 'Sketch Plane', 'PM ' + UI.pmTitle());
    assert(/Dangling/.test($('pm').textContent), 'the PM says it is dangling');
    for (var i = 0; i < 40 && UI.App.workerOn && UI.App.rollback == null; i++) await wait(50);
    assert(UI.App.command.onPick({ kind: 'face', index: faceWithNormal([0, 1, 0]), point: [20, 10, 20] }) !== false, 'face pick');
    assert(/Face of Plate/.test($('pm').textContent), 'the pick box names the face: ' + $('pm').textContent);
    await pmAccept();
    assert(sk.plane.face && sk.plane.face.feature === byName('Plate').id && sk.plane.face.cap === 'far' && sk.plane.offset === 10, JSON.stringify(sk.plane));
    assert(!UI.App.build.warnings[sk.id], 'no longer dangling: ' + JSON.stringify(UI.App.build.warnings));
    near(anvil.summary().bbox.max[1], 14, 1e-6, 'the pin stands on the plate');
    UI.undo(); await idle();
    assert(/Dangling/.test(UI.App.build.warnings[sk.id] || ''), 'undo: dangling again');
    sk = byName('On block');   // undo restores the model from a copy: new feature objects
    // onto a standard plane: the 2D geometry keeps its coordinates
    UI.editSketchPlane(sk.id); await idle();
    UI.App.command.onPick({ kind: 'plane', ref: 'Front' });
    await pmAccept();
    sk = byName('On block');
    assert(sk.plane.ref === 'Front' && !sk.plane.custom && !UI.App.build.warnings[sk.id], 'on Front: ' + JSON.stringify(sk.plane));
    assert(!Object.keys(UI.App.build.errors).length, JSON.stringify(UI.App.build.errors));
    UI.undo(); await idle();
    return 'reattached on the plate, then moved to Front';
  });
  // --- end r11/faceref11 ---
