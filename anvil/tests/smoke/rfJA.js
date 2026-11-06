  // ---- rfJA (2026-11-05, lane asmmates): Profile Center through the Mate PM (Advanced Mates, Offset distance, Flip
  // dimension, Lock rotation, its icon, save / reopen); Rotate Component ▸ Collision Detection stopping a turned bar at a wall
  var JA_BASE = 'p.name("Base"); p.box(200, 100, 10);', JA_BAR = 'p.name("Bar"); p.box(40, 20, 10);';
  var JA_ARENA = 'a.name("JaWall");\n' +
    'var base = a.insert({ script: \'p.name("Base"); p.box(200, 100, 10);\' }, { fixed: true });\n' +
    'var wall = a.insert({ script: \'p.name("Wall"); p.box(10, 100, 40);\' }, { fixed: true, position: [100, 10, 0] });\n' +
    'var bar = a.insert({ script: \'p.name("Bar"); p.box(60, 10, 10);\' }, { position: [75, 10, 80], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0] });\n' +
    'a.coincident({ component: base, face: [50, 10, 50] }, { component: bar, face: [30, 0, 5] });\n';
  function jaSelect(key) { return D.querySelector('#pm select[data-key="' + key + '"]'); }
  function jaFrame() { return new Promise(function (res) { var done = false; W.requestAnimationFrame(function () { if (!done) { done = true; res(); } }); setTimeout(function () { if (!done) { done = true; res(); } }, 1500); }); }
  step('rfJA: Profile Center from Advanced Mates: Offset distance, Flip dimension, Lock rotation; the bar is centred on the plate with its sides parallel; icon; save and reopen keep it', async function () {
    await anvil.newAssembly('JaProfile');
    await anvil.insert({ script: JA_BASE });
    await anvil.insert({ script: JA_BAR }, { position: [30, 40, 7], rotation: [0.9396926, 0, 0.3420201, 0, 1, 0, -0.3420201, 0, 0.9396926] });
    await idle();
    UI.cmdMate();
    await idle();
    var opts = Array.prototype.map.call(jaSelect('advType').options, function (o) { return o.textContent; });
    assert(opts[1] === 'Profile Center', 'first of the Advanced Mates: ' + opts.join());
    setInput(jaSelect('advType'), 'profilecenter');
    await idle();
    var txt = $('pm').textContent;
    assert(/Entities to Mate/.test(txt) && /Offset distance/.test(txt) && /Flip dimension/.test(txt) && /Lock rotation/.test(txt) && /Mate alignment/.test(txt), 'Profile Center PM: ' + txt.slice(0, 260));
    UI.mateSelect({ component: 1, face: [50, 10, 50] }); UI.mateSelect({ component: 2, face: [5, 0, 5] });
    await idle();
    var lock = D.querySelector('#pm input[data-key="lock"]');
    lock.checked = true; lock.dispatchEvent(new W.Event('change', { bubbles: true })); lock.dispatchEvent(new W.Event('input', { bubbles: true }));
    await idle();
    await pmAccept();
    var mt = UI.App.model.mates[0];
    assert(mt && mt.type === 'profilecenter' && mt.name === 'ProfileCenter1' && mt.lock === true, JSON.stringify(mt));
    var Tb = UI.App.model.components[1].transform, c = W.Assembly.transformPoint(Tb, [20, 0, 10]);
    near(c[0], 100, 1e-5, 'centre x'); near(c[1], 10, 1e-5, 'on the plate'); near(c[2], 50, 1e-5, 'centre z');
    near(Tb.rotation[0], 1, 1e-6, 'long sides parallel (Lock rotation)');
    var row = Array.prototype.filter.call(D.querySelectorAll('#tree .ti.mate-row'), function (r) { return /ProfileCenter1/.test(r.textContent); })[0];
    assert(row && row.querySelector('.gv-mate-ico'), 'ProfileCenter1 has its own icon');
    await anvil.load(JSON.parse(JSON.stringify(UI.App.model)));
    await idle();
    assert(UI.App.model.mates[0].type === 'profilecenter' && UI.App.model.mates[0].lock && anvil.mates()[0].ok, 'reopened: ' + JSON.stringify(anvil.mates()));
    return 'ProfileCenter1 locked';
  });
  step('rfJA: Rotate Component with Collision Detection: a bar turned towards a wall stops against it; the touching faces are highlighted', async function () {
    await anvil.run(JA_ARENA);
    await idle();
    UI.setView('Front');
    await idle();
    UI.cmdRotateComponent();
    await idle();
    assert(UI.App.command && UI.App.command.dragComponents === 'rotate', 'Rotate Component PM');
    setInput(jaSelect('cdMode'), 'collision');
    await idle();
    assert(/Stop at collision/.test($('pm').textContent), 'Collision Detection options in Rotate Component');
    var A = UI.App, bar = A.model.components[2], R0 = bar.transform.rotation.slice(), ctr = W.Assembly.componentCenter(A.model, A.build, bar.id), s = UI.worldToScreen(ctr);
    var h = UI.componentDragHook([s[0], s[1]], { button: 0 });
    assert(h && h.component.name === 'Bar<1>', 'drag hook on the bar');
    h.start();
    for (var i = 1; i <= 6; i++) { h.move([s[0] + 30 * i, s[1]]); await jaFrame(); }
    await jaFrame();
    await h.end([s[0] + 180, s[1]]);
    await idle();
    var Tb = A.model.components[2].transform, xmax = -Infinity;
    [[0, 0, 0], [60, 0, 0], [0, 0, 10], [60, 0, 10]].forEach(function (q) { xmax = Math.max(xmax, W.Assembly.transformPoint(Tb, q)[0]); });
    assert(Tb.rotation.some(function (v, k) { return Math.abs(v - R0[k]) > 1e-3; }), 'the bar turned');
    assert(xmax <= 100.05 && xmax > 99, 'stopped with its corner on the wall face x 100: ' + xmax);
    assert(UI.asmCollision.last && UI.asmCollision.last.hit && UI.asmCollision.last.stopped, 'collision recorded');
    assert(A.command && A.command.faceList && A.command.faceList.length >= 1, 'faces highlighted');
    UI.pmCancel(); await idle();
    UI.asmCollision.options.mode = 'standard';
    return 'corner at x ' + xmax.toFixed(3);
  });
