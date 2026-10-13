  // ---- configurations (ConfigurationManager tab, anvil.configurations, the Equations dialog per configuration)
  // plate 10 × 10 × T plus a block 10 × 10 × W: volume 100 T + 100 W (base T 10, W 20 → 3000)
  var CFG_PART = 'p.name("CfgSmoke");\np.equations({ T: 10, W: "=T*2" });\np.sketch("Front").rect(0, 0, 10, 10).extrude("=T");\np.sketch("Front").rect(20, 0, 10, 10).extrude("=W");';
  var CFG_LIST = [{ name: 'Thin', values: { T: 2 } }, { name: 'Wide', values: { W: 5 } }];
  function cfgNames() { return (UI.App.model.configurations || []).map(function (c) { return c.name; }); }
  function cfgRow(name) { return D.querySelector('#config-panel .cfg-row[data-name="' + name + '"]'); }
  function cfgRowNames() { return Array.prototype.map.call(D.querySelectorAll('#config-panel .cfg-row'), function (r) { return r.getAttribute('data-name'); }); }
  function cfgButton(id) { var b = $(id); assert(b, '#' + id + ' missing'); b.click(); }
  // answer the name prompt that #cfg-add / #cfg-rename open (UI.promptDialog: a text input and OK)
  async function cfgPrompt(name) {
    await wait(20);
    assert(modalOpen(), 'no name prompt opened');
    var inp = D.querySelector('#modal-body input');
    assert(inp, 'prompt has no input');
    inp.value = name;
    clickModalButton('OK');
    await wait(20);
    await idle();
  }
  async function cfgPart() {
    var s = await anvil.run(CFG_PART);
    await idle();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    near(s.volume, 3000, 1e-6, 'base volume');
  }
  step('configurations: anvil.configurations() get / set / activate rebuild with the right volumes; summary fields; one undo step each', async function () {
    need(anvil, 'configurations', 'anvil'); need(anvil, 'activateConfiguration', 'anvil');
    await cfgPart();
    var g = anvil.configurations();
    assert(g && g.active == null && Array.isArray(g.list) && g.list.length === 0, 'no configurations yet: ' + JSON.stringify(g));
    var s0 = anvil.summary();
    assert(s0.configuration == null && Array.isArray(s0.configurations) && s0.configurations.length === 0, 'summary before: ' + JSON.stringify({ c: s0.configuration, cs: s0.configurations }));
    var p = anvil.configurations(CFG_LIST, 'Thin');
    assert(p && typeof p.then === 'function', 'anvil.configurations(list, active) should return a Promise');
    var s = await p;
    await idle();
    near(s.volume, 200 + 400, 1e-6, 'Thin: T = 2, W = 4');
    assert(s.configuration === 'Thin' && JSON.stringify(s.configurations) === '["Thin","Wide"]', 'summary: ' + JSON.stringify({ c: s.configuration, cs: s.configurations }));
    g = anvil.configurations();
    assert(g.active === 'Thin' && g.list.length === 2 && g.list[0].values.T === '2' && g.list[1].values.W === '5', 'get: ' + JSON.stringify(g));
    g.list[0].values.T = '99';
    assert(UI.App.model.configurations[0].values.T === '2', 'anvil.configurations() must return a copy');
    s = await anvil.activateConfiguration('Wide');
    await idle();
    near(s.volume, 1000 + 500, 1e-6, 'Wide: T = 10, W = 5');
    assert(s.configuration === 'Wide', 'active after activateConfiguration: ' + s.configuration);
    s = await anvil.configurations.activate('Thin');
    await idle();
    near(s.volume, 600, 1e-6, 'Thin again');
    UI.undo(); await idle();
    assert(anvil.summary().configuration === 'Wide', 'undo of activate → Wide: ' + anvil.summary().configuration);
    near(anvil.summary().volume, 1500, 1e-6, 'undo volume');
    UI.undo(); await idle();
    assert(anvil.summary().configuration === 'Thin', 'undo again → Thin: ' + anvil.summary().configuration);
    UI.undo(); await idle();
    assert(!cfgNames().length && anvil.summary().configuration == null, 'undo of the set → no configurations: ' + JSON.stringify(UI.App.model.configurations));
    near(anvil.summary().volume, 3000, 1e-6, 'base volume after three undos');
    return 'Thin 600 · Wide 1500 · undo ×3 → base 3000';
  });
  step('ConfigurationManager tab: the config tab shows #config-panel and hides #fm-tree; rows mark the active configuration; UI.setFmTab switches back', async function () {
    need(UI, 'setFmTab');
    await cfgPart();
    await anvil.configurations(CFG_LIST, 'Wide');
    await idle();
    var tab = D.querySelector('#fm-tabs button[data-tab=config]');
    assert(tab, '#fm-tabs button[data-tab=config] missing');
    tab.click();
    await wait(20);
    assert($('config-panel') && !$('config-panel').hidden && $('config-panel').offsetParent !== null, '#config-panel should be visible');
    assert(!$('fm-tree') || $('fm-tree').hidden || $('fm-tree').offsetParent === null, '#fm-tree should be hidden');
    assert(JSON.stringify(cfgRowNames()) === '["Thin","Wide"]', 'rows: ' + JSON.stringify(cfgRowNames()));
    assert(cfgRow('Wide').classList.contains('active') && !cfgRow('Thin').classList.contains('active'), 'Wide should be the active row');
    ['cfg-add', 'cfg-rename', 'cfg-delete', 'cfg-activate'].forEach(function (id) { assert($(id), '#' + id + ' missing'); });
    UI.setFmTab('tree');
    await wait(20);
    assert($('config-panel').hidden || $('config-panel').offsetParent === null, '#config-panel should hide on the tree tab');
    assert($('fm-tree') && !$('fm-tree').hidden && $('fm-tree').offsetParent !== null, '#fm-tree should be visible again');
    var part = D.querySelector('#tree .ti .nm');
    assert(part && part.textContent === 'CfgSmoke (Wide)', 'part row should read "CfgSmoke (Wide)": ' + (part && part.textContent));
    UI.setFmTab('config');
    await wait(20);
    assert(!$('config-panel').hidden, 'UI.setFmTab("config") shows the panel');
    UI.setFmTab('tree');
    return 'rows ' + cfgRowNames().join(', ') + ' · part row ' + part.textContent;
  });
  step('ConfigurationManager: first Add creates Default plus the new one and activates it; one undo step', async function () {
    await cfgPart();
    UI.setFmTab('config');
    await wait(20);
    assert(!cfgRowNames().length, 'no rows on a part without configurations: ' + JSON.stringify(cfgRowNames()));
    cfgButton('cfg-add');
    await cfgPrompt('Long');
    assert(JSON.stringify(cfgNames()) === '["Default","Long"]', 'configurations: ' + JSON.stringify(cfgNames()));
    assert(anvil.summary().configuration === 'Long', 'the new one is active: ' + anvil.summary().configuration);
    var def = UI.App.model.configurations[0].values;
    assert(def.T === '10' && def.W === 'T*2', 'Default captures the current values: ' + JSON.stringify(def));
    assert(cfgRow('Long') && cfgRow('Long').classList.contains('active'), 'Long row active');
    near(anvil.summary().volume, 3000, 1e-6, 'a new configuration starts with the same values');
    UI.undo(); await idle();
    assert(!cfgNames().length && anvil.summary().configuration == null, 'one undo removes both: ' + JSON.stringify(UI.App.model.configurations));
    UI.redo(); await idle();
    assert(JSON.stringify(cfgNames()) === '["Default","Long"]' && anvil.summary().configuration === 'Long', 'redo: ' + JSON.stringify(cfgNames()));
    UI.setFmTab('tree');
    return 'added ' + cfgNames().join(' + ');
  });
  step('ConfigurationManager: select a row, Rename, Activate and Delete through the buttons; each is one undo step', async function () {
    await cfgPart();
    await anvil.configurations(CFG_LIST, 'Wide');
    await idle();
    UI.setFmTab('config');
    await wait(20);
    // rename the (inactive) Thin row
    cfgRow('Thin').click();
    await wait(20);
    assert(cfgRow('Thin').classList.contains('selected'), 'clicked row should be .selected');
    cfgButton('cfg-rename');
    await cfgPrompt('Slim');
    assert(JSON.stringify(cfgNames()) === '["Slim","Wide"]', 'after rename: ' + JSON.stringify(cfgNames()));
    assert(anvil.summary().configuration === 'Wide', 'rename keeps the active one: ' + anvil.summary().configuration);
    // activate Slim
    cfgRow('Slim').click();
    await wait(20);
    cfgButton('cfg-activate');
    await wait(20); await idle();
    assert(anvil.summary().configuration === 'Slim' && cfgRow('Slim').classList.contains('active'), 'Slim active: ' + anvil.summary().configuration);
    near(anvil.summary().volume, 600, 1e-6, 'Slim volume (T = 2)');
    // rename the active one: the active name follows
    cfgRow('Slim').click();
    cfgButton('cfg-rename');
    await cfgPrompt('Thin');
    assert(anvil.summary().configuration === 'Thin', 'renaming the active configuration renames the active name: ' + anvil.summary().configuration);
    // delete Wide (inactive)
    cfgRow('Wide').click();
    await wait(20);
    cfgButton('cfg-delete');
    await wait(20);
    if (modalOpen()) { var yes = D.querySelector('#modal-buttons button.primary'); assert(yes, 'delete confirm has no primary button'); yes.click(); }
    await wait(20); await idle();
    assert(JSON.stringify(cfgNames()) === '["Thin"]', 'after delete: ' + JSON.stringify(cfgNames()));
    assert(!cfgRow('Wide'), 'Wide row still shown');
    // four operations, four undo steps
    UI.undo(); await idle();
    assert(JSON.stringify(cfgNames()) === '["Thin","Wide"]', 'undo delete: ' + JSON.stringify(cfgNames()));
    UI.undo(); await idle();
    assert(JSON.stringify(cfgNames()) === '["Slim","Wide"]' && anvil.summary().configuration === 'Slim', 'undo rename: ' + JSON.stringify(cfgNames()) + ' / ' + anvil.summary().configuration);
    UI.undo(); await idle();
    assert(anvil.summary().configuration === 'Wide', 'undo activate: ' + anvil.summary().configuration);
    near(anvil.summary().volume, 1500, 1e-6, 'Wide volume after undo');
    UI.undo(); await idle();
    assert(JSON.stringify(cfgNames()) === '["Thin","Wide"]', 'undo first rename: ' + JSON.stringify(cfgNames()));
    UI.setFmTab('tree');
    return 'rename · activate · rename active · delete, then 4 undos';
  });
  step('UI.configurations add / rename / remove / activate return Promises; anvil.configurations.add / rename / remove agree', async function () {
    assert(UI.configurations && ['list', 'add', 'rename', 'remove', 'activate'].every(function (k) { return typeof UI.configurations[k] === 'function'; }), 'UI.configurations.{list, add, rename, remove, activate} missing');
    ['add', 'rename', 'remove', 'activate'].forEach(function (k) { need(anvil.configurations, k, 'anvil.configurations'); });
    await cfgPart();
    var p = UI.configurations.add('A');
    assert(p && typeof p.then === 'function', 'UI.configurations.add should return a Promise');
    await p; await idle();
    assert(JSON.stringify(cfgNames()) === '["Default","A"]' && anvil.summary().configuration === 'A', 'add on a bare part: ' + JSON.stringify(cfgNames()));
    await UI.configurations.add('B'); await idle();
    assert(JSON.stringify(cfgNames()) === '["Default","A","B"]' && anvil.summary().configuration === 'B', 'second add: ' + JSON.stringify(cfgNames()) + ' / ' + anvil.summary().configuration);
    await UI.configurations.rename('B', 'C'); await idle();
    assert(JSON.stringify(cfgNames()) === '["Default","A","C"]' && anvil.summary().configuration === 'C', 'rename: ' + JSON.stringify(cfgNames()));
    await UI.configurations.activate('A'); await idle();
    assert(anvil.summary().configuration === 'A', 'activate: ' + anvil.summary().configuration);
    await UI.configurations.remove('C'); await idle();
    assert(JSON.stringify(cfgNames()) === '["Default","A"]', 'remove: ' + JSON.stringify(cfgNames()));
    var l = UI.configurations.list();
    assert(Array.isArray(l) && l.length === 2, 'list(): ' + JSON.stringify(l));
    var s = await anvil.configurations.add('D'); await idle();
    assert(s && JSON.stringify(s.configurations) === '["Default","A","D"]', 'anvil.configurations.add summary: ' + JSON.stringify(s && s.configurations));
    s = await anvil.configurations.rename('D', 'E'); await idle();
    assert(JSON.stringify(s.configurations) === '["Default","A","E"]', 'anvil rename: ' + JSON.stringify(s.configurations));
    s = await anvil.configurations.activate('Default'); await idle();
    assert(s.configuration === 'Default', 'anvil activate: ' + s.configuration);
    s = await anvil.configurations.remove('E'); await idle();
    assert(JSON.stringify(s.configurations) === '["Default","A"]', 'anvil remove: ' + JSON.stringify(s.configurations));
    // nine operations → nine undo steps back to the bare part
    for (var i = 0; i < 9; i++) { UI.undo(); await idle(); }
    assert(!cfgNames().length && anvil.summary().configuration == null, 'nine undos → no configurations: ' + JSON.stringify(UI.App.model.configurations));
    near(anvil.summary().volume, 3000, 1e-6, 'base volume');
    return 'add ×2, rename, activate, remove (UI) + add, rename, activate, remove (anvil); 9 undos';
  });
  step('Equations dialog in a configuration edits that configuration only; the base and the other configuration keep their values', async function () {
    need(UI, 'showEquations');
    await cfgPart();
    await anvil.configurations(CFG_LIST, 'Thin');
    await idle();
    UI.showEquations();
    assert(modalOpen() && $('eq-dialog') && UI.equationsDialog, 'Equations dialog did not open');
    assert(/^2\b/.test(eqRow('T').querySelector('.eq-expr').value.replace(/^=\s*/, '')), 'the dialog should show Thin\'s T = 2: ' + eqRow('T').querySelector('.eq-expr').value);
    eqType('T', '= 3');
    eqClick('#eq-ok');
    await anvil.idle();
    await idle();
    assert(!modalOpen(), 'dialog still open');
    var cs = UI.App.model.configurations;
    assert(cs[0].values.T === '3', 'Thin.T: ' + JSON.stringify(cs[0].values));
    assert(UI.App.model.equations[0].expr === '10', 'base T must stay 10: ' + JSON.stringify(UI.App.model.equations));
    assert(!('T' in cs[1].values), 'Wide must not gain T: ' + JSON.stringify(cs[1].values));
    near(anvil.summary().volume, 300 + 600, 1e-6, 'Thin at T = 3');
    var s = await anvil.activateConfiguration('Wide');
    await idle();
    near(s.volume, 1500, 1e-6, 'Wide unchanged');
    UI.undo(); await idle();
    UI.undo(); await idle();
    assert(anvil.summary().configuration === 'Thin' && UI.App.model.configurations[0].values.T === '2', 'two undos: Thin with T = 2: ' + JSON.stringify(UI.App.model.configurations));
    near(anvil.summary().volume, 600, 1e-6, 'Thin at T = 2');
    return 'Thin T 2 → 3: 900 · Wide 1500 · undo → 600';
  });
  step('a Design Library example with configurations: every configuration activates to its documented volume', async function () {
    // the documented volumes live on the source entries (W.AnvilExamples); the Design Library copy keeps name and code
    var ex = (W.AnvilExamples || []).filter(function (e) { return e.configurations; })[0];
    assert(ex, 'no example with configurations in examples/examples.js');
    assert(anvil.examples.some(function (e) { return e.name === ex.name; }), ex.name + ' missing from the Design Library');
    var s = await anvil.run(ex.code);
    await idle();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    var names = Object.keys(ex.configurations), out = [];
    assert(JSON.stringify(s.configurations.slice().sort()) === JSON.stringify(names.slice().sort()), 'summary().configurations: ' + JSON.stringify(s.configurations));
    for (var i = 0; i < names.length; i++) {
      s = await anvil.activateConfiguration(names[i]);
      await idle();
      assert(s.configuration === names[i], 'active: ' + s.configuration);
      near(s.volume, ex.configurations[names[i]], Math.abs(ex.configurations[names[i]]) * 1e-6, names[i] + ' volume');
      out.push(names[i] + ' ' + fmt(s.volume));
    }
    return ex.name + ': ' + out.join(' · ');
  });

