  // ---- sub-assemblies and live links (run cloud-2026-09-25o)
  async function until(fn, ms, label) {
    var t0 = performance.now();
    while (!fn()) { if (performance.now() - t0 > (ms || 5000)) fail('timed out waiting for ' + (label || 'a condition')); await wait(20); }
    await idle();
  }
  function compRow(name) { return Array.prototype.filter.call(D.querySelectorAll('#tree .component-row'), function (r) { return r.getAttribute('data-comp') != null && r.querySelector('.nm').textContent.replace(/^\([f-]\) /, '').replace(/ \(suppressed\)$/, '') === name; })[0]; }
  function rightClick(row) { row.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 60, clientY: 200 })); }
  function forgetDocs(names) {
    try { var f = JSON.parse(W.localStorage.getItem('anvil.files') || '{}'); names.forEach(function (n) { delete f[n]; }); W.localStorage.setItem('anvil.files', JSON.stringify(f)); } catch (e) { }
  }
  step('sub-assemblies: the Hinged cover example opens with Hinge<1> / Hinge<2> as sub-assembly rows that expand to their own components and Mates; Hinge<2> is Flexible (arm at 30°); BOM dialog Top-level / Indented / Parts only; Mass Properties', async function () {
    await UI.openExample(W.AnvilExamples.filter(function (e) { return e.name === 'Hinged cover (sub-assemblies)'; })[0]); await idle();
    var s = anvil.summary();
    assert(s.type === 'assembly' && s.components === 3 && !Object.keys(s.errors || {}).length, JSON.stringify(s));
    near(s.volume, 88000, 1e-6, 'volume');
    var subs = D.querySelectorAll('#tree .component-row.subassembly');
    assert(subs.length === 2, 'sub-assembly rows ' + subs.length);
    var h2 = compRow('Hinge<2>');
    assert(/solved as Flexible/.test(h2.title) && /solved as Rigid/.test(compRow('Hinge<1>').title), 'tooltips: ' + h2.title + ' / ' + compRow('Hinge<1>').title);
    if (h2.querySelector('.tw').textContent !== '\u25be') { h2.querySelector('.tw').click(); await idle(); }   // expand (the open state is remembered)
    var inner = Array.prototype.map.call(D.querySelectorAll('#tree .inner-row'), function (r) { return r.querySelector('.nm').textContent; });
    assert(inner.join('|') === '(f) Leaf<1>|Arm<1>|Mates', 'inner rows: ' + inner.join('|'));
    // the arm is fully defined in context (the Angle mate) and shown as the part inside Hinge<2>
    assert(/Arm<1> in Hinge<2>/.test(D.querySelectorAll('#tree .inner-row')[1].title), D.querySelectorAll('#tree .inner-row')[1].title);
    var st = UI.App.model.components[2].flexState['2'];
    near(st.rotation[0], Math.cos(Math.PI / 6), 1e-9, 'arm cos'); near(st.rotation[3], 0.5, 1e-9, 'arm sin');
    UI.showBom('indented');
    function bomText() { return Array.prototype.map.call(D.querySelectorAll('#bom-table .bom-row'), function (r) { return Array.prototype.filter.call(r.children, function (c) { return !c.classList.contains('bom-desc'); }).map(function (c) { return c.textContent; }).join(' '); }).join(' | '); }
    assert(bomText() === '1 Base 1 | 2 Hinge (assembly) 2 | 2.1 Leaf 1 | 2.2 Arm 1', 'BOM: ' + bomText());
    setInput($('bom-type'), 'parts');
    assert(bomText() === '1 Base 1 | 2 Leaf 2 | 3 Arm 2', 'BOM: ' + bomText());
    setInput($('bom-type'), 'top');
    assert(bomText() === '1 Base 1 | 2 Hinge (assembly) 2', 'BOM: ' + bomText());
    UI.closeModal();
    UI.showMassProperties();
    assert(/Hinge<2>/.test($('modal-body').textContent), 'mass rows');
    UI.closeModal();
    // the ribbon's Bill of Materials opens the same dialog
    var bomBtn = Array.prototype.filter.call(D.querySelectorAll('#ribbon [title], #ribbon button, #ribbon .rb'), function (b) { return /Bill of Materials/.test(b.textContent || '') ; })[0];
    if (bomBtn) { bomBtn.click(); assert(modalOpen() && $('bom-table'), 'ribbon BOM'); UI.closeModal(); }
    return 'BOM ' + anvil.bom('parts').map(function (r) { return r.name + ' ×' + r.qty; }).join(', ');
  });
  step('sub-assemblies: component menu Solve as Rigid / Flexible (one undo step each: the Angle mate on Hinge<2>\'s arm fails when rigid); a pick on a face inside a sub-assembly gives a path ref', async function () {
    rightClick(compRow('Hinge<2>'));
    var it = menuItem(/^Solve as Rigid/);
    assert(it && !menuItem(/^Solve as Flexible/), 'menu has Solve as Rigid');
    it.click();
    await until(function () { return !UI.App.model.components[2].flexible; }, 5000, 'rigid'); await idle();
    var am = UI.App.model.mates[UI.App.model.mates.length - 1];
    assert(UI.mateStatus(am).error, 'angle mate over-defines the rigid hinge');
    await UI.undo(); await idle();
    assert(UI.App.model.components[2].flexible && !UI.mateStatus(UI.App.model.mates[UI.App.model.mates.length - 1]).error, 'undo: flexible again');
    // a face inside Hinge<1>: the top end of its standing arm (world normal +y at y = 15 + 41 = 56)
    var fi = -1;
    UI.App.mesh.faces.forEach(function (f, i) { if (f.body === 1 && Math.abs(f.normal[1] - 1) < 1e-9 && Math.abs(f.centroid ? f.centroid[1] - 56 : 0) < 1e-6) fi = i; });
    if (fi < 0) UI.App.mesh.faces.forEach(function (f, i) { if (f.body === 1 && Math.abs(f.normal[1] - 1) < 1e-9) fi = i; });
    var ref = W.Assembly.refFromPick(UI.App.model, UI.App.build, fi, [47.5, 56, 10], UI.App.mesh);
    assert(ref && ref.component === UI.App.model.components[1].id && JSON.stringify(ref.path) === '[2]' && ref.face, JSON.stringify(ref));
    near(ref.face[0], 41, 1e-6, 'arm-local x'); near(ref.face[1], 2.5, 1e-6, 'arm-local y');
    // Edit Part on an embedded part: the edit replaces the embedded copy (one undo step)
    rightClick(compRow('Base<1>'));
    menuItem(/^Edit Part/).click();
    await until(function () { return UI.App.model.type !== 'assembly'; }, 5000, 'Edit Part');
    await anvil.run('p.name("Base"); p.box(120, 60, 20);'); await idle();
    $('asm-return').click();
    await until(function () { return UI.App.model.type === 'assembly' && UI.App.model.components[0].source.model; }, 5000, 'the edited base'); await idle();
    near(anvil.summary().volume, 144000 + 16000, 1e-6, 'thicker base');
    assert(UI.App.model.components[0].source.model.name === 'Base', 'embedded copy of the edited part');
    await UI.undo(); await idle();
    assert(UI.App.model.components[0].source.script && Math.abs(anvil.summary().volume - 88000) < 1e-6, 'undo restores the embedded script');
    // the Mate PM with a pick inside Hinge<1> (its arm's top end) and a block's bottom: a path ref, named Face@Arm<1>@Hinge<1>
    await anvil.insert({ script: 'p.name("Block"); p.box(10, 10, 10);' }, { position: [30, 70, 30] }); await idle();
    var armTop = asmFace(1, 1, 56), blockBottom = asmFace(3, -1, 70);
    assert(armTop && blockBottom, 'faces ' + JSON.stringify([armTop, blockBottom]));
    UI.cmdMate();
    UI.App.command.onPick(blockBottom);
    UI.App.command.onPick(armTop);
    await idle();
    assert(/Face@Arm<1>@Hinge<1>/.test($('pm').textContent), 'selection text: ' + $('pm').textContent.slice(0, 200));
    await pmAccept();
    var mt = UI.App.model.mates[UI.App.model.mates.length - 1];
    assert(mt.type === 'coincident' && JSON.stringify(mt.b.path) === '[2]', JSON.stringify(mt));
    near(anvil.components()[3].position[1], 56, 1e-9, 'block seated on the arm top');
    await UI.undo(); await UI.undo(); await idle();
    assert(anvil.components().length === 3, 'undo');
    return JSON.stringify(ref);
  });
  step('live links: a part saved in this browser is inserted as a link (Insert Components lists it); Edit Part / change / Return to assembly shows the change (edited, not saved); File ▸ Save saves the assembly and the part; another assembly using it updates; a deleted document leaves the component suppressed with a warning; Pack and Go embeds it', async function () {
    forgetDocs(['SmokePin', 'LinkAsm']);
    await anvil.newPart('SmokePin'); await anvil.run('p.name("SmokePin"); p.box(10, 10, 10);'); await idle();
    anvil.saveDocument('SmokePin');
    assert(anvil.documents().some(function (d) { return d.name === 'SmokePin' && d.type === 'part'; }), 'saved');
    await anvil.newAssembly('LinkAsm'); await idle();
    UI.cmdInsertComponent();
    var sel = D.querySelector('#pm select');
    assert(Array.prototype.some.call(sel.options, function (o) { return o.value === 'link:SmokePin' && /SmokePin \(linked, saved in this browser\)/.test(o.textContent); }), 'Insert Components lists the saved part');
    assert(Array.prototype.some.call(sel.options, function (o) { return /Hinge sub-assembly \(sub-assembly\)/.test(o.textContent); }), 'and the Design Library assemblies');
    setInput(sel, 'link:SmokePin');
    await pmAccept();
    await anvil.insert({ file: 'SmokePin' }, { position: [20, 0, 0], fixed: true }); await idle();
    assert(JSON.stringify(UI.App.model.components[0].source) === '{"file":"SmokePin"}', 'linked source');
    near(anvil.summary().volume, 2000, 1e-6, 'two linked pins');
    assert(compRow('SmokePin<1>').classList.contains('linked') && /linked to "SmokePin"/.test(compRow('SmokePin<1>').title), 'linked row');
    // Open Part and back without a change: nothing is left edited
    rightClick(compRow('SmokePin<2>'));
    menuItem(/^Open Part/).click();
    await until(function () { return UI.App.model.type !== 'assembly'; }, 5000, 'Open Part');
    assert(/Opened "SmokePin" from LinkAsm/.test($('asm-doc-banner').textContent) && anvil.docStack().length === 1, 'Open Part banner');
    await anvil.returnToAssembly(); await idle();
    assert(UI.App.model.type === 'assembly' && !W.Assembly.Documents.isDirty('SmokePin'), 'unchanged part is not left edited');
    rightClick(compRow('SmokePin<2>'));
    menuItem(/^Edit Part/).click();
    await until(function () { return UI.App.model.type !== 'assembly'; }, 5000, 'the part to open');
    assert($('asm-return') && /Editing "SmokePin" in the context of LinkAsm/.test($('asm-doc-banner').textContent), 'banner');
    await anvil.run('p.name("SmokePin"); p.box(10, 10, 30);'); await idle();
    $('asm-return').click();
    await until(function () { return UI.App.model.type === 'assembly'; }, 5000, 'the assembly'); await idle();
    assert(!$('asm-doc-banner'), 'banner gone');
    near(anvil.summary().volume, 6000, 1e-6, 'both instances show the edit');
    assert(W.Assembly.Documents.isDirty('SmokePin') && /edited, not saved/.test(compRow('SmokePin<1>').title), 'edited in memory');
    assert(UI.App.undo.length >= 2, 'the assembly keeps its undo steps');
    // File ▸ Save: the assembly and the edited part
    UI.fileSave();
    D.querySelector('#modal-body input').value = 'LinkAsm';
    clickModalButton('OK');
    var files = JSON.parse(W.localStorage.getItem('anvil.files'));
    assert(files.LinkAsm && files.LinkAsm.model.type === 'assembly' && !W.Assembly.Documents.isDirty('SmokePin'), 'saved both');
    assert(JSON.stringify(files.SmokePin.model.features).indexOf('30') >= 0, 'part saved with the edit');
    // a second assembly that uses it, then the saved part changes again
    await anvil.newAssembly('LinkAsm2'); await anvil.insert({ file: 'SmokePin' }, { fixed: true }); await idle();
    near(anvil.summary().volume, 3000, 1e-6, 'second assembly');
    var pm = W.Kernel.newModel('SmokePin'); W.Kernel.runScript(pm, 'p.name("SmokePin"); p.box(10, 10, 5);');
    anvil.saveDocument('SmokePin', pm);
    await anvil.rebuild(); await idle();
    near(anvil.summary().volume, 500, 1e-6, 'updated on rebuild');
    // broken reference
    anvil.removeDocument('SmokePin');
    await anvil.rebuild(); await idle();
    var row = compRow('SmokePin<1>');
    assert(row && row.classList.contains('suppressed') && /Cannot find the referenced document "SmokePin"/.test(row.title), row && row.title);
    assert(anvil.components()[0].error == null && anvil.summary().volume === 0, 'suppressed, not an error');
    anvil.saveDocument('SmokePin', pm);
    await anvil.rebuild(); await idle();
    assert(!compRow('SmokePin<1>').classList.contains('suppressed'), 'back');
    // Pack and Go (File menu) embeds the part
    assert(menuRows('Pack and Go').length === 1, 'File ▸ Pack and Go…');
    UI.closeMenus && UI.closeMenus();
    UI.packAndGo();
    assert(modalOpen() && /Embeds "SmokePin"/.test($('modal-body').textContent), $('modal-body').textContent);
    clickModalButton('Cancel');
    assert(JSON.stringify(anvil.packAndGo().model).indexOf('"file"') < 0, 'packed');
    forgetDocs(['SmokePin', 'LinkAsm']);
    await anvil.newPart('Part1'); await idle();
    return 'edit propagated: 2000 → 6000; second assembly 3000 → 500';
  });
