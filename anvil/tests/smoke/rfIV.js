  // ---- rfIV (2026-11-05, lane asmmates): Linear/Linear Coupler through the Mate PM (Advanced Mates, Ratio, Reverse, its
  // tree icon, edit, save / reopen); Move Component ▸ Collision Detection stopping a dragged block against a wall
  var IV_RAILS = 'a.name("IvRails");\n' +
    'var base = a.insert({ script: \'p.name("Base"); p.box(200, 100, 10);\' }, { fixed: true });\n' +
    'var b1 = a.insert({ script: \'p.name("Block"); p.box(20, 20, 20);\' }, { position: [20, 10, 0] });\n' +
    'var b2 = a.insert({ script: \'p.name("Block"); p.box(20, 20, 20);\' }, { position: [60, 10, 40] });\n' +
    'a.coincident({ component: base, plane: "Front" }, { component: b1, plane: "Front" }, { alignment: "aligned" });\n' +
    'a.coincident({ component: base, plane: "Top" }, { component: b1, plane: "Top" }, { alignment: "aligned", offset: 10 });\n' +
    'a.coincident({ component: base, plane: "Front" }, { component: b2, plane: "Front" }, { alignment: "aligned", offset: 40 });\n' +
    'a.coincident({ component: base, plane: "Top" }, { component: b2, plane: "Top" }, { alignment: "aligned", offset: 10 });\n';
  var IV_WALL = 'a.name("IvWall");\n' +
    'var base = a.insert({ script: \'p.name("Base"); p.box(200, 100, 10);\' }, { fixed: true });\n' +
    'var wall = a.insert({ script: \'p.name("Wall"); p.box(10, 100, 40);\' }, { fixed: true, position: [100, 10, 0] });\n' +
    'var blk = a.insert({ script: \'p.name("Block"); p.box(20, 20, 20);\' }, { position: [20, 10, 40] });\n' +
    'a.coincident({ component: base, face: [50, 10, 50] }, { component: blk, face: [10, 0, 10] });\n';
  function ivSelect(key) { return D.querySelector('#pm select[data-key="' + key + '"]'); }
  function ivFrame() { return new Promise(function (res) { var done = false; W.requestAnimationFrame(function () { if (!done) { done = true; res(); } }); setTimeout(function () { if (!done) { done = true; res(); } }, 1500); }); }
  function ivPos(name) { return anvil.components().filter(function (c) { return c.name === name; })[0].position; }
  step('rfIV: Linear/Linear Coupler from Advanced Mates: Entities to Mate, Ratio 1 : 2 and Reverse, no alignment; the second block moves twice as far; its icon; edit; save and reopen keep it', async function () {
    await anvil.run(IV_RAILS);
    await idle();
    UI.cmdMate();
    await idle();
    assert(Array.prototype.some.call(ivSelect('advType').options, function (o) { return o.value === 'linearcoupler' && o.textContent === 'Linear/Linear Coupler'; }), 'offered among the Advanced Mates');
    setInput(ivSelect('advType'), 'linearcoupler');
    await idle();
    var txt = $('pm').textContent;
    assert(/Entities to Mate/.test(txt) && /Reverse/.test(txt) && !/Mate alignment/.test(txt), 'Coupler PM: ' + txt.slice(0, 240));
    assert(D.querySelector('#pm input[data-key="ratioA"]') && D.querySelector('#pm input[data-key="ratioB"]'), 'the two ratio boxes');
    UI.mateSelect({ component: 2, plane: 'Right' }); UI.mateSelect({ component: 3, plane: 'Right' });
    await idle();
    setInput(D.querySelector('#pm input[data-key="ratioB"]'), '2');
    await idle();
    await pmAccept();
    var mt = UI.App.model.mates.filter(function (m) { return m.type === 'linearcoupler'; })[0];
    assert(mt && mt.name === 'LinearCoupler1' && mt.ratio.join() === '1,2' && !mt.flip, JSON.stringify(mt));
    assert(anvil.mates().every(function (m) { return m.ok; }), JSON.stringify(anvil.mates()));
    await anvil.moveComponent('Block<1>', [5, 0, 0]);
    await idle();
    near(ivPos('Block<1>')[0], 25, 1e-5, 'first block moved 5');
    near(ivPos('Block<2>')[0], 70, 1e-5, 'second block moved 10');
    var row = Array.prototype.filter.call(D.querySelectorAll('#tree .ti.mate-row'), function (r) { return /LinearCoupler1/.test(r.textContent); })[0];
    assert(row && row.querySelector('.gv-mate-ico'), 'LinearCoupler1 has its own icon');
    UI.editMate(mt);
    await idle();
    assert(UI.pmTitle() === 'LinearCoupler1' && +D.querySelector('#pm input[data-key="ratioB"]').value === 2, 'edit opens the coupler PM: ' + UI.pmTitle());
    UI.pmCancel(); await idle();
    await anvil.load(JSON.parse(JSON.stringify(UI.App.model)));
    await idle();
    var m2 = UI.App.model.mates.filter(function (m) { return m.type === 'linearcoupler'; })[0];
    assert(m2 && m2.ratio.join() === '1,2' && m2.phase, 'reopened: ' + JSON.stringify(m2));
    await anvil.moveComponent('Block<1>', [-5, 0, 0]);
    await idle();
    near(ivPos('Block<2>')[0], 60, 1e-5, 'reopened coupler drives the second block back');
    return 'LinearCoupler1 1 : 2';
  });
  step('rfIV: Move Component ▸ Collision Detection: the Options and Advanced Options groups as SolidWorks; a block dragged at a wall stops against it, the touching faces highlighted', async function () {
    await anvil.run(IV_WALL);
    await idle();
    UI.setView('Front');
    await idle();
    UI.cmdMoveComponent();
    await idle();
    var opts = Array.prototype.map.call(ivSelect('cdMode').options, function (o) { return o.textContent; }).join();
    assert(opts === 'Standard Drag,Collision Detection', opts);
    setInput(ivSelect('cdMode'), 'collision');
    await idle();
    var txt = $('pm').textContent;
    assert(/Check between/.test(txt) && /Stop at collision/.test(txt) && /Dragged part only/.test(txt) && /Highlight faces/.test(txt) && /Sound/.test(txt), 'groups: ' + txt.slice(0, 300));
    assert(Array.prototype.map.call(ivSelect('cdBetween').options, function (o) { return o.textContent; }).join() === 'All components,These components', 'Check between');
    assert(UI.asmCollision.options.stop && !UI.asmCollision.options.sound, 'Stop at collision on, Sound off');
    var A = UI.App, blk = A.model.components[2], ctr = W.Assembly.componentCenter(A.model, A.build, blk.id), s = UI.worldToScreen(ctr);
    var far = UI.worldToScreen([ctr[0] + 140, ctr[1], ctr[2]]);
    var h = UI.componentDragHook([s[0], s[1]], { button: 0 });
    assert(h && h.component.name === 'Block<1>', 'drag hook on the block');
    h.start();
    for (var i = 1; i <= 4; i++) { h.move([s[0] + (far[0] - s[0]) * i / 4, s[1]]); await ivFrame(); }
    await ivFrame();
    await h.end([far[0], s[1]]);
    await idle();
    var x = ivPos('Block<1>')[0];
    assert(x <= 80 + 1e-6 && x > 79, 'stopped against the wall at x 80: ' + x);
    assert(UI.asmCollision.last && UI.asmCollision.last.hit && UI.asmCollision.last.pairs[0].bName === 'Wall<1>', 'collision with the wall');
    assert(A.command && A.command.faceList && A.command.faceList.length >= 2, 'the touching faces are highlighted: ' + (A.command && A.command.faceList));
    assert(/Collision: Block<1> and Wall<1>/.test($('status') ? $('status').textContent : D.body.textContent), 'status names the collision');
    setInput(ivSelect('cdMode'), 'standard');
    await idle();
    var s2 = UI.worldToScreen(W.Assembly.componentCenter(A.model, A.build, blk.id)), h2 = UI.componentDragHook([s2[0], s2[1]], { button: 0 });
    h2.start();
    h2.move([s2[0] + (far[0] - s[0]) / 4, s2[1]]); await ivFrame(); await ivFrame();
    await h2.end([s2[0] + (far[0] - s[0]) / 4, s2[1]]);
    await idle();
    assert(ivPos('Block<1>')[0] > 85, 'Standard Drag goes into the wall: ' + ivPos('Block<1>')[0]);
    UI.pmCancel(); await idle();
    UI.asmCollision.options.mode = 'standard';
    return 'stopped at x ' + x.toFixed(4);
  });
