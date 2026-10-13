  // ---- assembly documents (assembly.js; window.anvil newAssembly / insert / mate / components / mates / fix / newPart)
  // Plate with bolt holes: x ∈ [0,100], y ∈ [0,8], z ∈ [0,60], Ø8 holes at x ∈ {10, 90}, z ∈ {10, 50}; the pin is a
  // Ø8 × 20 cylinder along local +y from its origin.
  var ASM_PIN = 'p.name("Pin"); p.cylinder(4, 20);';
  // exact volumes (true curves): plate 100·60·8 minus four Ø8 × 8 holes π·4²·8; pin π·4²·20
  var ASM_PLATE_V = 100 * 60 * 8 - 4 * Math.PI * 16 * 8, ASM_PIN_V = Math.PI * 16 * 20;
  function compRows() { return Array.prototype.slice.call(D.querySelectorAll('#tree .ti.component-row[data-comp]')); }
  function mateRows() { return Array.prototype.slice.call(D.querySelectorAll('#tree .ti.mate-row[data-mate]')); }
  function compRow(name) { return compRows().filter(function (r) { return r.textContent.indexOf(name) >= 0; })[0]; }
  function asmComp(name) { return anvil.components().filter(function (c) { return c.name === name; })[0]; }
  function nearVecS(a, b, tol, label) { for (var i = 0; i < 3; i++) near(a[i], b[i], tol, (label || 'vec') + '[' + i + ']'); }
  step('assembly: anvil.newAssembly() opens an empty assembly document (summary().type, Assembly ribbon, UI.isAssembly)', async function () {
    assert(W.Assembly, 'assembly.js not loaded (window.Assembly missing)');
    assert(typeof anvil.newAssembly === 'function', 'anvil.newAssembly missing');
    await anvil.newAssembly('SmokeAsm');
    await idle();
    var s = anvil.summary();
    assert(s.type === 'assembly', 'summary().type ' + s.type);
    assert(s.components === 0 && s.mates === 0, 'counts ' + s.components + ' / ' + s.mates);
    assert(UI.isAssembly() === true && anvil.isAssembly() === true, 'isAssembly');
    assert(W.Assembly.isAssembly(UI.App.model) && UI.App.model.features.length === 0, 'App.model is an assembly');
    assert($('doc-title').textContent === 'SmokeAsm', 'title ' + $('doc-title').textContent);
    assert($('ribbon-tabs').textContent.indexOf('Assembly') >= 0, 'ribbon tabs: ' + $('ribbon-tabs').textContent);
    assert(compRows().length === 0, 'no component rows yet');
    return 'ribbon tabs: ' + $('ribbon-tabs').textContent;
  });
  step('assembly: insert a plate and a pin → components(), tree rows "(f) Plate<1>" and "(-) Pin<1>", volumes add', async function () {
    await anvil.insert({ example: 'Plate with bolt holes' });
    var s = await anvil.insert({ script: ASM_PIN }, { position: [40, 30, -20] });
    await idle();
    var cs = anvil.components();
    assert(cs.length === 2 && cs[0].name === 'Plate<1>' && cs[1].name === 'Pin<1>', 'components ' + JSON.stringify(cs.map(function (c) { return c.name; })));
    assert(cs[0].fixed === true && cs[1].fixed === false, 'fixed flags');
    assert(cs[0].dof === 0 && cs[1].dof === 6 && cs[1].underDefined === true, 'dof ' + cs[0].dof + ' / ' + cs[1].dof);
    nearVecS(cs[1].position, [40, 30, -20], 1e-9, 'pin position');
    assert(s.type === 'assembly' && s.components === 2, 'summary ' + JSON.stringify({ type: s.type, components: s.components }));
    near(s.volume, ASM_PLATE_V + ASM_PIN_V, 2e-3, 'summary volume');
    var rows = compRows();
    assert(rows.length === 2, 'component rows ' + rows.length);
    assert(/\(f\)\s*Plate<1>/.test(rows[0].textContent), 'plate row: ' + rows[0].textContent);
    assert(/\(-\)\s*Pin<1>/.test(rows[1].textContent), 'pin row: ' + rows[1].textContent);
    assert(UI.bodyName(1) === 'Pin<1>', 'UI.bodyName(1) ' + UI.bodyName(1));
    return rows.map(function (r) { return r.textContent.trim(); }).join(' | ');
  });
  step('assembly: concentric + coincident mates move the pin into the hole; Mates folder rows; the pin stays "(-)" with 1 DOF', async function () {
    var cs = anvil.components(), plate = cs[0].id, pin = cs[1].id;
    await anvil.mate('concentric', { component: pin, cylinder: [4, 10, 0] }, { component: plate, cylinder: [14, 4, 10] });
    var s = await anvil.mate('coincident', { component: pin, face: [1, 0, 1] }, { component: plate, face: [50, 0, 30] }, { alignment: 'aligned' });
    await idle();
    assert(s.mates === 2, 'summary().mates ' + s.mates);
    var ms = anvil.mates();
    assert(ms.length === 2 && ms.every(function (m) { return m.ok && !m.error; }), 'mates ' + JSON.stringify(ms));
    assert(ms[0].name === 'Concentric1' && ms[1].name === 'Coincident1', 'mate names ' + ms.map(function (m) { return m.name; }));
    var p = asmComp('Pin<1>');
    nearVecS(p.position, [10, 0, 10], 1e-6, 'pin position');
    assert(p.dof === 1 && p.underDefined === true, 'pin dof ' + p.dof);
    assert(D.querySelector('#tree .ti.mates-folder'), 'Mates folder row missing');
    assert(mateRows().length === 2, 'mate rows ' + mateRows().length);
    assert(/\(-\)\s*Pin<1>/.test(compRow('Pin<1>').textContent), 'pin row: ' + compRow('Pin<1>').textContent);
    // selecting the component selects its body
    UI.selectComponent(pin);
    assert(UI.App.sel && UI.App.sel.kind === 'body' && UI.App.sel.index === 1, 'selection ' + JSON.stringify(UI.App.sel));
    return mateRows().map(function (r) { return r.textContent.trim(); }).join(' | ');
  });
  step('assembly: undo removes the last mate, redo brings it back', async function () {
    UI.undo();
    await idle();
    assert(anvil.mates().length === 1 && anvil.summary().mates === 1, 'after undo: ' + anvil.mates().length + ' mates');
    assert(mateRows().length === 1, 'mate rows after undo ' + mateRows().length);
    assert(UI.isAssembly(), 'undo left the assembly');
    UI.redo();
    await idle();
    assert(anvil.mates().length === 2 && mateRows().length === 2, 'after redo: ' + anvil.mates().length + ' mates');
    nearVecS(asmComp('Pin<1>').position, [10, 0, 10], 1e-6, 'pin position after redo');
  });
  step('assembly: anvil.script() is an assembly script; anvil.run() of it rebuilds the same assembly', async function () {
    var before = anvil.components(), vol = anvil.summary().volume;
    var script = anvil.script();
    assert(W.Assembly.isAssemblyScript(script), 'not an assembly script:\n' + script);
    var s = await anvil.run(script);
    await idle();
    assert(s.type === 'assembly' && s.components === 2 && s.mates === 2, 'summary ' + JSON.stringify({ type: s.type, c: s.components, m: s.mates }));
    near(s.volume, vol, 1e-3, 'volume');
    var after = anvil.components();
    before.forEach(function (c, i) {
      assert(after[i].name === c.name && after[i].fixed === c.fixed, 'component ' + i);
      nearVecS(after[i].position, c.position, 1e-6, c.name + ' position');
    });
    return script.split('\n').length + ' lines';
  });
  step('assembly: save / load JSON through anvil.model() and anvil.load()', async function () {
    var json = JSON.stringify(anvil.model());
    assert(JSON.parse(json).type === 'assembly', 'model() type');
    await anvil.newPart('Scratch');
    await idle();
    assert(!UI.isAssembly(), 'newPart');
    var s = await anvil.load(json);
    await idle();
    assert(s.type === 'assembly' && s.components === 2 && s.mates === 2 && UI.isAssembly(), 'loaded ' + JSON.stringify({ type: s.type, c: s.components, m: s.mates }));
    nearVecS(asmComp('Pin<1>').position, [10, 0, 10], 1e-6, 'pin position after load');
    assert(compRows().length === 2 && mateRows().length === 2, 'tree rows after load');
  });
  step('assembly: anvil.mass() = Assembly.massProps: volume and mass add up over the components', async function () {
    var mp = anvil.mass();
    near(mp.volume, ASM_PLATE_V + ASM_PIN_V, 1e-3, 'volume');
    assert(mp.components && mp.components.length === 2, 'per-component rows');
    var m = mp.components.reduce(function (a, c) { return a + c.volume * c.density; }, 0);
    near(mp.mass, m, Math.abs(m) * 1e-9, 'mass = Σ volume · density');
    near(mp.components[1].centroid[0], 10, 1e-6, 'pin centroid x'); near(mp.components[1].centroid[1], 10, 1e-6, 'pin centroid y');
    return 'volume ' + fmt(mp.volume) + ', mass ' + fmt(mp.mass);
  });
  step('assembly: fix / float, removeMate, removeComponent through anvil', async function () {
    var pin = asmComp('Pin<1>').id;
    await anvil.fix('Pin<1>', true);
    await idle();
    assert(asmComp('Pin<1>').fixed === true && asmComp('Pin<1>').dof === 0, 'fixed pin');
    assert(/\(f\)\s*Pin<1>/.test(compRow('Pin<1>').textContent), 'row after fix: ' + compRow('Pin<1>').textContent);
    await anvil.fix(pin, false);
    await idle();
    assert(asmComp('Pin<1>').fixed === false, 'floated pin');
    await anvil.removeMate(anvil.mates()[1].id);
    await idle();
    assert(anvil.mates().length === 1, 'removeMate');
    await anvil.removeComponent(pin);
    await idle();
    assert(anvil.components().length === 1 && anvil.mates().length === 0, 'removeComponent takes its mates along: ' + anvil.mates().length);
    assert(compRows().length === 1 && mateRows().length === 0, 'tree rows');
  });
  step('assembly: the Design Library assembly example opens as an assembly with its documented positions and volume', async function () {
    var ex = (W.AnvilExamples || []).filter(function (e) { return e.kind === 'assembly'; })[0];
    assert(ex, 'no kind: "assembly" entry in examples/examples.js');
    UI.openTaskPane('library');
    var btn = Array.prototype.filter.call(D.querySelectorAll('#tp-body button'), function (b) { return b.textContent.indexOf(ex.name) >= 0; })[0];
    assert(btn, 'Design Library button for ' + ex.name + ' missing');
    btn.click(); dontSaveIfAsked();   // the open part is unsaved: "Save changes to …?" first
    for (var i = 0; i < 100 && !(UI.isAssembly() && anvil.summary().components === (ex.checks || []).length); i++) await wait(50);
    await idle();
    UI.closeTaskPane();
    var s = anvil.summary();
    assert(s.type === 'assembly', 'opened as ' + s.type);
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    near(s.volume, ex.volume, Math.abs(ex.volume) * 1e-6, 'volume');
    (ex.checks || []).forEach(function (c) {
      var comp = asmComp(c.component);
      assert(comp, 'component ' + c.component + ' missing');
      nearVecS(comp.position, c.position, 1e-6, c.component);
    });
    assert(compRows().length === s.components, 'tree rows ' + compRows().length + ' vs ' + s.components);
    return ex.name + ': ' + s.components + ' components, ' + s.mates + ' mates, volume ' + s.volume;
  });
  // PropertyManager flows (head, run cloud-2026-09-25c): Insert Component and Mate driven through their PMs, the mate
  // selections coming from face picks (App.command.onPick -> Assembly.refFromPick), as a viewport click delivers them.
  function asmFace(compIndex, normal, y) {
    var faces = UI.App.mesh.faces;
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i];
      if ((f.body || 0) === compIndex && Math.abs(f.normal[1] - normal) < 1e-9 && Math.abs(f.centroid[1] - y) < 1e-6) return { kind: 'face', index: i, point: f.centroid.slice() };
    }
    return null;
  }
  step('assembly PM: Insert Component PM inserts two plates (the first fixed, the second at the typed position)', async function () {
    need(UI, 'cmdInsertComponent'); need(UI, 'pmSetField');
    await anvil.newAssembly('PMAsm');
    await idle();
    UI.cmdInsertComponent({ part: 'ex:Plate with bolt holes' });
    assert(UI.hasPM(), 'Insert Component PM not open');
    await pmAccept();
    UI.cmdInsertComponent({ part: 'ex:Plate with bolt holes' });
    assert(UI.pmSetField('x', '150') && UI.pmSetField('y', '30'), 'pmSetField on the Position fields');
    await pmAccept();
    assert(!UI.hasPM(), 'PM still open');
    var cs = anvil.components();
    assert(cs.length === 2 && cs[0].name === 'Plate<1>' && cs[1].name === 'Plate<2>', 'components ' + JSON.stringify(cs.map(function (c) { return c.name; })));
    assert(cs[0].fixed && !cs[1].fixed, 'fixed flags');
    nearVecS(cs[1].position, [150, 30, 0], 1e-9, 'Plate<2> position');
    return compRows().map(function (r) { return r.textContent.trim(); }).join(' | ');
  });
  step('assembly PM: Mate PM with two face picks defaults to Coincident Anti-Aligned; ✓ stacks Plate<2> on Plate<1>', async function () {
    need(UI, 'cmdMate');
    var top = asmFace(0, 1, 8), bottom = asmFace(1, -1, 30);
    assert(top && bottom, 'faces to pick: ' + JSON.stringify([top, bottom]));
    UI.cmdMate();
    assert(UI.hasPM() && UI.App.command && UI.App.command.onPick, 'Mate PM with a pick handler');
    UI.App.command.onPick(top);
    UI.App.command.onPick(bottom);
    await idle();
    var type = D.querySelector('#pm select[data-key="type"]'), align = D.querySelector('#pm select[data-key="alignment"]');
    assert(type && type.value === 'coincident', 'Standard Mates: ' + (type && type.value));
    assert(align && align.value === 'anti-aligned', 'Mate alignment: ' + (align && align.value));
    await pmAccept();
    var p2 = anvil.components()[1];
    near(p2.position[1], 8, 1e-9, 'Plate<2> bottom on the Plate<1> top (y)');
    var ms = anvil.mates();
    assert(ms.length === 1 && ms[0].ok && ms[0].name === 'Coincident1', 'mates ' + JSON.stringify(ms));
    var row = mateRows()[0];
    assert(row && /Coincident1 \(Plate<1>, Plate<2>\)/.test(row.textContent), 'mate row: ' + (row && row.textContent));
    return row.textContent.trim();
  });
  step('assembly PM: editing the mate and cancelling leaves the model as it was', async function () {
    var before = JSON.stringify(anvil.model());
    UI.cmdMate(anvil.mates()[0].id);
    assert(UI.hasPM(), 'Mate PM (edit) not open');
    UI.pmCancel();
    await idle();
    assert(!UI.hasPM(), 'PM still open');
    assert(JSON.stringify(anvil.model()) === before, 'model changed by a cancelled edit');
    near(anvil.components()[1].position[1], 8, 1e-9, 'Plate<2> y after cancel');
  });
