  // --- r3/assembly3 ---
  // wait for one animation frame (a throttled background tab gives about one a second)
  function r3frame() { return new Promise(function (res) { var done = false; W.requestAnimationFrame(function () { if (!done) { done = true; res(); } }); setTimeout(function () { if (!done) { done = true; res(); } }, 1500); }); }
  function r3firstVertex(index) {   // offset of a component's first drawn vertex in the body mesh buffer
    var f = UI.App.mesh.faces.filter(function (x) { return (x.body || 0) === index; })[0];
    return f.start * 9;
  }
  step('r3/assembly3: dragging a component solves placements only and moves the drawn triangles (no rebuild per frame); one rebuild on release, one undo step', async function () {
    await anvil.run(exByName('Gear train and patterns').code);
    await idle();
    var A = UI.App, comps = anvil.components(), ri = comps.findIndex(function (c) { return c.name === 'Roller<1>'; }), roller = comps[ri];
    var ctr = W.Assembly.componentCenter(A.model, A.build, roller.id), s = UI.worldToScreen(ctr), vo = r3firstVertex(ri);
    var v0 = [A.mesh.positions[vo], A.mesh.positions[vo + 1], A.mesh.positions[vo + 2]], T0 = JSON.parse(JSON.stringify(W.Assembly.findComponent(A.model, roller.id).transform));
    var h = UI.componentDragHook([s[0], s[1]], { button: 0 });
    assert(h && h.component.name === 'Roller<1>', 'drag hook on the roller');
    var rebuilds = 0, orig = UI.rebuild, build0 = A.build;
    UI.rebuild = function () { rebuilds++; return orig.apply(this, arguments); };
    try {
      h.start();
      for (var i = 1; i <= 4; i++) { h.move([s[0] + 10 * i, s[1] + 4 * i]); await r3frame(); }
      await r3frame();
      assert(UI.asmPose.active(), 'pose shown while dragging');
      assert(rebuilds === 0 && A.build === build0, 'no rebuild during the drag (' + rebuilds + ')');
      var P = UI.getBodyMesh().geometry.getAttribute('position').array, T1 = W.Assembly.findComponent(A.model, roller.id).transform;
      var want = W.Assembly.transformPoint(T1, W.Assembly.inverseTransformPoint(T0, v0)), solved = W.Assembly.componentCenter(A.model, A.build, roller.id);
      for (var k = 0; k < 3; k++) near(P[vo + k], want[k], 1e-3, 'drawn roller vertex follows the solved placement [' + k + ']');
      assert(Math.hypot(solved[0] - ctr[0], solved[1] - ctr[1], solved[2] - ctr[2]) > 1, 'the roller moved');
      await h.end([s[0] + 40, s[1] + 16]);
      await idle();
    } finally { UI.rebuild = orig; }
    assert(!UI.asmPose.active(), 'pose ended on release');
    assert(rebuilds >= 1 && rebuilds <= 2, 'one rebuild on release (' + rebuilds + ')');
    assert(anvil.mates().every(function (m) { return m.ok; }), 'mates hold after the drag');
    var after = anvil.components()[ri].position;
    assert(Math.hypot(after[0] - roller.position[0], after[1] - roller.position[1], after[2] - roller.position[2]) > 1, 'committed placement moved');
    return 'roller ' + roller.position.map(function (x) { return x.toFixed(1); }).join(',') + ' -> ' + after.map(function (x) { return x.toFixed(1); }).join(',');
  });
  step('r3/assembly3: assembly edges come from each part\'s cached edges (every edge Kernel.bodyEdges finds is there); the explode animation moves the drawn components (no rebuild per frame)', async function () {
    var A = UI.App, mine = UI.asmEdges(A.mesh), full = K.bodyEdges(A.mesh);
    if (UI.annotateCurveEdges) UI.annotateCurveEdges(A.mesh, full);   // r4/asm4: asmEdges carries the seams of true curves (e.seam), so compare like with like
    assert(mine && mine.length, 'asmEdges gave edges');
    function key(p) { return p.map(function (x) { return Math.round(x * 1000); }).join(','); }
    var have = {};
    mine.forEach(function (e) { if (!e.smooth) have[key(e.mid)] = true; });
    // (the search over the whole mesh also merges seams of a pin with the same seams of its bore into one sharp edge
    // across two components, drawn as a line on the pin; per part, those stay seams)
    function oneBody(e) { var b0 = A.mesh.faces[e.faces[0]].body || 0; return e.faces.every(function (fi) { return (A.mesh.faces[fi].body || 0) === b0; }); }
    var miss = full.filter(function (e) { return !e.smooth && oneBody(e) && !have[key(e.mid)]; });
    assert(!miss.length, miss.length + ' sharp edges missing, first at ' + (miss[0] && key(miss[0].mid)));
    var rebuilds = 0, orig = UI.rebuild;
    UI.rebuild = function () { rebuilds++; return orig.apply(this, arguments); };
    try { await anvil.animateExplode(true, 300); await idle(); } finally { UI.rebuild = orig; }
    assert(rebuilds <= 1, 'explode animation rebuilt ' + rebuilds + ' times (only at the end)');
    assert(A.build.explode && A.build.explode.t === 1, 'exploded at the end');
    assert(!UI.asmPose.active(), 'no pose left');
    await anvil.animateExplode(false, 0); await idle();
    assert(!A.build.explode, 'collapsed');
    return mine.length + ' edges (' + full.length + ' merged)';
  });
  step('r3/assembly3: the Mate PM stays open after ✓ (empty, ready for the next mate; each mate one undo step); ✓ with nothing selected closes it; the previewed component glides into place', async function () {
    await baseAndBlock('R3Mates');
    UI.cmdMate();
    UI.mateSelect({ component: 2, face: [10, 0, 10] }); UI.mateSelect({ component: 1, face: [50, 10, 30] });
    near(anvil.components()[1].position[1], 10, 1e-6, 'previewed on the top');
    var reduce = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) assert(UI.asmPose.gliding(), 'the preview glides');
    await wait(400);
    assert(!UI.asmPose.gliding() && !UI.asmPose.active(), 'glide finished within 400 ms');
    await UI.pmOK(); await idle();
    assert(UI.hasPM() && /Mate/.test(D.querySelector('#pm .pm-head').textContent), 'Mate PM still open after ✓');
    assert(/Coincident1<\/b> added|Coincident1 added/.test(D.querySelector('#pm .pm-msg').innerHTML), 'message: ' + D.querySelector('#pm .pm-msg').textContent);
    assert(anvil.mates().length === 1 && anvil.mates()[0].ok, 'first mate');
    assert(D.querySelector('#pm select[data-key="type"]').value === 'coincident', 'type reset');
    UI.mateSelect({ component: 2, face: [0, 10, 10] }); UI.mateSelect({ component: 1, face: [0, 5, 30] });
    await UI.pmOK(); await idle();
    assert(UI.hasPM() && anvil.mates().length === 2 && anvil.mates().every(function (m) { return m.ok; }), 'second mate, PM open');
    near(anvil.components()[1].position[0], 0, 1e-6, 'block flush with x = 0');
    await UI.pmOK(); await idle();
    assert(!UI.hasPM(), '✓ with nothing selected closes the Mate PM');
    await UI.undo(); await idle();
    assert(anvil.mates().length === 1, 'undo removes only the second mate');
    // editing a mate still closes on ✓
    UI.cmdMate(anvil.mates()[0].id);
    await pmAccept();
    assert(!UI.hasPM(), 'edit Mate PM closes on ✓');
  });
  step('r3/assembly3: Interference Detection options — Treat coincidence as interference, Ignore / Show ignored interferences, Ignore hidden bodies/components, Include multibody part interferences', async function () {
    await anvil.run(exByName('Interference check').code);
    await idle();
    UI.cmdInterference();
    var s = UI.interferenceSession();
    var heads = D.querySelector('#pm').textContent;
    ['Treat coincidence as interference', 'Show ignored interferences', 'Include multibody part interferences', 'Ignore hidden bodies/components'].forEach(function (t) { assert(heads.indexOf(t) >= 0, 'option ' + t); });
    var n0 = s.results().pairs.length;
    assert(n0 === 2, 'two interferences by default: ' + n0);
    s.setOption('coincidence', true);
    var co = s.results().pairs.filter(function (p) { return p.coincident; });
    assert(co.length === 1 && /Pin<1>/.test(co[0].aName + co[0].bName), 'the touching pin is listed as coincident: ' + JSON.stringify(co.map(function (p) { return p.aName + '/' + p.bName; })));
    assert(/coincident/.test(D.querySelector('#pm .intf-list').textContent), 'row says coincident');
    s.ignore(0, true);
    assert(D.querySelectorAll('#pm .intf-row').length === 2 && / 1 ignored\./.test(D.querySelector('#pm .pm-msg').textContent), 'ignored drops out: ' + D.querySelector('#pm .pm-msg').textContent);
    s.setOption('showIgnored', true);
    assert(D.querySelectorAll('#pm .intf-row').length === 3 && /\(ignored\)/.test(D.querySelector('#pm .intf-list').textContent), 'show ignored');
    var ig = s.results().pairs.findIndex(function (p) { return p.ignored; });
    s.ignore(ig, false);
    s.setOption('showIgnored', false); s.setOption('coincidence', false);
    UI.setBodyHidden(3, true);
    s.calculate();
    var hid = s.results().pairs.map(function (p) { return p.bName; });
    s.setOption('ignoreHidden', false);
    var all = s.results().pairs.length;
    s.setOption('ignoreHidden', true);
    UI.setBodyHidden(3, false);
    assert(hid.indexOf('Pin<2>') < 0 && all === 2, 'hidden Pin<2> ignored (' + hid + '), counted when the option is off (' + all + ')');
    UI.pmCancel();
    await anvil.newAssembly('R3Multi');
    await anvil.insert({ script: 'p.name("Overlap"); p.box(10, 10, 10); p.box(10, 10, 10, { at: [5, 0, 0], merge: false });' });
    await idle();
    UI.cmdInterference();
    s = UI.interferenceSession();
    assert(s.results().pairs.length === 0, 'one component: nothing');
    s.setOption('multibody', true);
    var mb = s.results().pairs;
    assert(mb.length === 1 && Math.abs(mb[0].volume - 500) < 1e-6 && /Overlap<1>\//.test(mb[0].aName), 'multibody overlap: ' + JSON.stringify(mb.map(function (p) { return [p.aName, p.bName, p.volume]; })));
    s.setOption('multibody', false);
    UI.pmCancel();
    return mb[0].aName + ' · ' + mb[0].bName;
  });
  step('r3/assembly3: the Bill of Materials has a DESCRIPTION column (the part\'s Description property, else its description / Design Library name)', async function () {
    await anvil.newAssembly('R3Bom');
    await anvil.insert({ example: 'Hex nut' });
    await anvil.insert({ example: 'Hex nut' });
    await idle();
    UI.showBom('top');
    var hd = Array.prototype.map.call(D.querySelectorAll('#bom-table th'), function (t) { return t.textContent; });
    assert(hd.join('|') === 'ITEM NO.|PART NUMBER|DESCRIPTION|QTY.', 'columns ' + hd.join('|'));
    var cell = D.querySelector('#bom-table .bom-row .bom-desc');
    assert(cell && cell.textContent === 'Hex nut', 'description ' + (cell && cell.textContent));
    UI.closeModal();
    var b = anvil.bom('top');
    assert(b.length === 1 && b[0].qty === 2 && b[0].description === 'Hex nut', JSON.stringify(b));
  });
  // --- end r3/assembly3 ---
