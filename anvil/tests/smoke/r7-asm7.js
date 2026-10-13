  // --- r7/asm7 ---
  // a rigid sub-assembly of a plate and n pins flush on it (r5flexPins without Solve as Flexible), on a base
  async function r7rigidPins(n) {
    var L = ['a.name("RPins' + n + '").units("mm");', 'var plate = a.insert({ script: \'p.name("Plate"); p.box(300, 60, 8); p.hole("Top", 10, -10, 8, { offset: 8 }); p.linearPattern({ dir: "x", spacing: 28, count: 10, dir2: "z", spacing2: 20, count2: 3 });\' }, { fixed: true });'];
    for (var i = 0; i < n; i++) {
      var x = 10 + 28 * (i % 10), z = 10 + 20 * Math.floor(i / 10);
      L.push('var q' + i + ' = a.insert({ script: \'p.name("Pin"); p.cylinder(4, 20);\' }, { position: [' + (x + 3) + ', 15, ' + (z - 2) + '] });');
      L.push('a.concentric({ component: q' + i + ', cylinder: [4, 10, 0] }, { component: plate, cylinder: [' + (x + 4) + ', 4, ' + z + '] });');
      if (i) L.push('a.coincident({ component: q' + i + ', face: [1, 0, 1] }, { component: plate, face: [155, 0, 40] }, { alignment: "aligned" });');
    }
    await anvil.run(L.join('\n'));
    await idle();
    var sub = JSON.parse(JSON.stringify(UI.App.model));
    await anvil.newAssembly('R7Rigid');
    await anvil.insert({ script: 'p.name("Base"); p.box(400, 120, 10);' }, { fixed: true });
    await anvil.insert({ model: sub }, { position: [0, 10, 0] });
    await idle();
  }
  step('r7/asm7: a rigid sub-assembly moved so its plane keys straddle a rounding step (y 10.005) keeps the per-part edge path: its edges are placed from its parts, none missing', async function () {
    await r7rigidPins(6);
    var be = K.bodyEdges, out = [];
    for (var P of [[0, 10.005, 0], [3.105, 10.115, 0.205]]) {
      UI.App.model.components[1].transform.position = P;
      await UI.rebuild(); await idle();
      var calls = 0, list;
      K.bodyEdges = function () { calls++; return be.apply(this, arguments); };
      try { var t0 = performance.now(); list = UI.asmEdges(UI.App.mesh); out.push((performance.now() - t0).toFixed(0) + ' ms'); } finally { K.bodyEdges = be; }
      assert(list && calls === 0, P.join() + ': per-part path (' + (list ? 'list' : 'null') + ', ' + calls + ' searches)');
      var full = be(UI.App.mesh), miss = full.filter(function (f) { return !f.smooth && f.faces.length > 1 && !list.some(function (e) { return K.pointSegmentDistance(f.mid, e.a, e.b) < 1e-5; }); });
      assert(miss.length === 0, P.join() + ': ' + miss.length + ' edges of the full search missing');
    }
    return out.join(', ');
  });
  step('r7/asm7: Change Transparency is kept in the model: one undo step (no rebuild), undo / redo bring it back, saved in the script (a.insert transparent: true) and read back', async function () {
    await anvil.run(exByName('Pinned plate assembly').code);
    await idle();
    var A = UI.App, cap = A.model.components.filter(function (c) { return c.name === 'Cap<1>'; })[0], u0 = A.undo.length, rebuilds = 0, orig = UI.rebuild;
    UI.rebuild = function () { rebuilds++; return orig.apply(this, arguments); };
    try { UI.asmGhost.set(cap.id, true); } finally { UI.rebuild = orig; }
    assert(cap.transparent === true && A.undo.length === u0 + 1 && rebuilds === 0, 'in the model, one undo step, ' + rebuilds + ' rebuilds');
    assert(/transparent: true/.test(anvil.script()), 'the script writes it');
    await UI.undo(); await idle();
    var c1 = W.Assembly.findComponent(UI.App.model, cap.id);
    assert(!c1.transparent && !UI.asmGhost.is(cap.id), 'undo: opaque');
    await UI.redo(); await idle();
    assert(UI.asmGhost.is(cap.id) && UI.bodyGhost(W.Assembly.componentIndex(UI.App.model, cap.id)), 'redo: transparent');
    var ghost = null; UI.scene.traverse(function (o) { if (o.userData && o.userData.asmGhost) ghost = o; });
    assert(ghost && ghost.parent, 'drawn see-through after redo');
    var src = anvil.script();
    await anvil.run(src); await idle();
    var c2 = UI.App.model.components.filter(function (c) { return c.name === 'Cap<1>'; })[0];
    assert(c2 && c2.transparent && UI.asmGhost.is(c2.id), 'read back from the script');
    await anvil.transparent('Cap<1>', false);
    assert(!UI.asmGhost.is(c2.id), 'anvil.transparent(name, false)');
  });
  step('r7/asm7: the Width mate gets the Mate pop-up toolbar once its four selections are made (Width, Flip Mate Alignment, ✓ / ✗); ✓ adds it', async function () {
    await anvil.run(exByName('Gear train and patterns').code);
    await idle();
    var mt = UI.App.model.mates.filter(function (m) { return m.type === 'width'; })[0];
    assert(mt, 'the example has a Width mate');
    var refs = ['a', 'a2', 'b', 'b2'].map(function (k) { return JSON.parse(JSON.stringify(mt[k])); });
    await UI.asm.removeMate(mt.id); await idle();
    var n0 = anvil.mates().length;
    UI.cmdMate();
    var s = UI.pmSpec(); s.values.type = 'width'; s.onChange(s.values, 'type'); await idle();
    UI.mateSelect(refs[0]); UI.mateSelect(refs[1]); UI.mateSelect(refs[2]); await idle();
    assert(!UI.asmPopup(), 'no pop-up with three of the four selections');
    UI.mateSelect(refs[3]); await idle();
    var p = UI.asmPopup();
    assert(p && p.kind === 'mate' && p.buttons.join() === 'width,flip,ok,cancel', 'pop-up: ' + (p && p.buttons.join()));
    r5pop('ok'); await idle();
    assert(anvil.mates().length === n0 + 1 && anvil.mates().some(function (m) { return m.type === 'width'; }), 'Width mate added');
    assert(UI.pmTitle() === 'Mate' && !UI.asmPopup(), 'the PM stays open, the pop-up goes');
    UI.pmCancel();
  });
  // --- end r7/asm7 ---
