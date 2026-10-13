  // --- r8/asm8 ---
  step('r8/asm8: a rigid sub-assembly nested in a rigid sub-assembly keeps the per-part edge path at every level (also where its plane keys straddle a rounding step): no edge search, none missing', async function () {
    await r7rigidPins(6);
    var mid = JSON.parse(JSON.stringify(UI.App.model));
    await anvil.newAssembly('R8Nested');
    await anvil.insert({ script: 'p.name("Floor"); p.box(500, 200, 10);' }, { fixed: true });
    await anvil.insert({ model: mid }, { position: [0, 10, 0] });
    await idle();
    var be = K.bodyEdges, out = [];
    for (var P of [[0, 10, 0], [3.105, 10.115, 0.205]]) {
      UI.App.model.components[1].transform.position = P;
      await UI.rebuild(); await idle();
      var calls = 0, list;
      K.bodyEdges = function () { calls++; return be.apply(this, arguments); };
      try { var t0 = performance.now(); list = UI.asmEdges(UI.App.mesh); out.push((performance.now() - t0).toFixed(0) + ' ms'); } finally { K.bodyEdges = be; }
      var pe = UI.App.build.partBuilds[UI.App.model.components[1].id].__asmEdges;
      assert(list && calls === 0 && pe && pe.composed, P.join() + ': per-part path (' + (list ? 'list' : 'null') + ', ' + calls + ' searches)');
      var full = be(UI.App.mesh), miss = full.filter(function (f) { return !f.smooth && f.faces.length > 1 && !list.some(function (e) { return K.pointSegmentDistance(f.mid, e.a, e.b) < 1e-5; }); });
      assert(miss.length === 0, P.join() + ': ' + miss.length + ' edges of the full search missing');
    }
    return out.join(', ');
  });
  step('r8/asm8: Change Transparency on a pattern instance survives regenerating the pattern (count up, script re-run); an instance the count drops goes with its flag', async function () {
    await anvil.run('a.name("R8TP").units("mm"); var b = a.insert({ script: \'p.name("Base"); p.box(200, 50, 10);\' }, { fixed: true }); var k = a.insert({ script: \'p.name("Block"); p.box(10, 10, 10);\' }, { position: [5, 10, 5] }); a.linearPattern(k, { direction: { component: b, face: [200, 5, 25] }, spacing: 20, count: 4 });');
    await idle();
    var AS = W.Assembly, names = function () { return UI.asmGhost.list().map(function (id) { return AS.findComponent(UI.App.model, id).name; }).join(); };
    var inst = UI.App.model.components.filter(function (c) { return c.pattern != null; });
    UI.asmGhost.set(inst[1].id, true);
    assert(names() === 'Block<3>', 'set: ' + names());
    var p = UI.App.model.patterns[0];
    AS.setPatternValues(UI.App.model, p, { count: 6 }); AS.syncPatterns(UI.App.model); await UI.rebuild(); await idle();
    assert(names() === 'Block<3>' && UI.bodyGhost(AS.componentIndex(UI.App.model, inst[1].id)), 'count 6: ' + names());
    await anvil.run(anvil.script()); await idle();
    assert(names() === 'Block<3>', 'script re-run: ' + names());
    p = UI.App.model.patterns[0];
    AS.setPatternValues(UI.App.model, p, { count: 2 }); AS.syncPatterns(UI.App.model); await UI.rebuild(); await idle();
    assert(names() === '', 'count 2: ' + names());
  });
  // --- end r8/asm8 ---
