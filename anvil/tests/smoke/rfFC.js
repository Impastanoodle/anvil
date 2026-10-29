  // --- rfFC (2026-10-29, lane FC: configurations) --- Suppress / Unsuppress / Unsuppress with Dependents from the
  // FeatureManager right-click and the Edit menu (a fillet on the hole's edge is suppressed with the hole), This
  // configuration / Specify Configurations, the ConfigurationManager, the Design Table grid (Insert ▸ Tables), and a
  // component's part configuration plus an assembly configuration. Real mouse / clipboard events throughout.
  var rfFCPart = 'p.units("mm");\np.configurations([{ name: "Default", values: {} }, { name: "NoHole", values: {} }], "Default");\n' +
    'p.sketch("Front").rect(0, 0, 100, 60).end().extrude(20);\n' +
    'p.sketch("Front", 20).circle(50, 30, 10).end().cut(0, { throughAll: true, reverse: true });\n' +
    'p.fillet(2, [{ at: [60, 30, 20] }]);';
  function rfFCNear(a, b, tol, label) { if (!(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)))) fail((label || "value") + " = " + a + ", expected " + b + " (rel " + tol + ")"); }
  function rfFCVol() { return K.massProps(UI.App.mesh).volume; }
  function rfFCRow(name) { var f = rfFCFeat(name); return f ? D.querySelector("#tree .ti[data-fid=\"" + f.id + "\"]") : null; }
  function rfFCFeat(name) { return UI.App.model.features.filter(function (f) { return f.name === name; })[0]; }
  function rfFCMenuRow(text) { return Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { var s = m.querySelector('span:not(.chk):not(.key)'); return s && s.textContent === text; })[0]; }
  function rfFCPress(row) {
    var r = row.getBoundingClientRect(), o = { bubbles: true, cancelable: true, view: W, clientX: r.left + 8, clientY: r.top + 4, button: 0, detail: 1 };
    row.dispatchEvent(new W.MouseEvent('mousedown', o)); row.dispatchEvent(new W.MouseEvent('mouseup', o)); row.dispatchEvent(new W.MouseEvent('click', o));
  }
  function rfFCContext(el) { var r = el.getBoundingClientRect(); el.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: W, clientX: r.left + 10, clientY: r.top + 4, button: 2 })); }
  async function rfFCTreeMenu(feature, item) {
    UI.setFmTab('tree'); UI.refreshTree();
    var row = rfFCRow(feature);
    assert(row, 'tree row ' + feature);
    rfFCContext(row);
    var mi = rfFCMenuRow(item);
    assert(mi, 'menu row "' + item + '" (have: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent; }).join(' | ') + ')');
    rfFCPress(mi); await idle(); await wait(20); await idle();
  }
  async function rfFCPartOpen() {
    await anvil.newPart(); await idle();
    await anvil.run(rfFCPart); await idle();
    assert(!Object.keys(UI.App.build.errors || {}).length, 'build errors ' + JSON.stringify(UI.App.build.errors));
  }
  var RFFC_FULL = 100 * 60 * 20, RFFC_HOLE = Math.PI * 100 * 20;

  step('rfFC: right-click Cut-Extrude1 ▸ Suppress takes its fillet with it (greyed rows, exact volume); Unsuppress brings the cut back alone, Unsuppress with Dependents the fillet too; Ctrl+Z is one step', async function () {
    var errs0 = errors.length;
    await rfFCPartOpen();
    var v0 = rfFCVol(), cut = rfFCFeat('Cut-Extrude1'), fil = rfFCFeat('Fillet1');
    assert(v0 < RFFC_FULL - RFFC_HOLE, 'the fillet takes material: ' + v0);
    await rfFCTreeMenu('Cut-Extrude1', 'Suppress');
    rfFCNear(rfFCVol(), RFFC_FULL, 1e-12, 'no hole, no fillet');
    assert(rfFCRow('Cut-Extrude1').classList.contains('suppressed') && rfFCRow('Fillet1').classList.contains('suppressed') && !rfFCRow('Sketch2').classList.contains('suppressed'), 'cut and fillet greyed, the sketch not');
    var ov = UI.App.model.configurations[0].suppressed || {};
    assert(ov[cut.id] === true && ov[fil.id] === true && !UI.App.model.configurations[1].suppressed, 'this configuration (Default) only: ' + JSON.stringify(UI.App.model.configurations));
    await UI.undoCommand(); await idle();
    rfFCNear(rfFCVol(), v0, 1e-12, 'one Ctrl+Z restores both');
    await rfFCTreeMenu('Cut-Extrude1', 'Suppress');
    await rfFCTreeMenu('Cut-Extrude1', 'Unsuppress');
    rfFCNear(rfFCVol(), RFFC_FULL - RFFC_HOLE, 1e-12, 'the cut back, the fillet still suppressed');
    assert(rfFCRow('Fillet1').classList.contains('suppressed'), 'Fillet1 still greyed');
    await rfFCTreeMenu('Fillet1', 'Unsuppress');
    rfFCNear(rfFCVol(), v0, 1e-12, 'Fillet1 unsuppressed');
    await rfFCTreeMenu('Cut-Extrude1', 'Suppress');
    await rfFCTreeMenu('Cut-Extrude1', 'Unsuppress with Dependents');
    rfFCNear(rfFCVol(), v0, 1e-12, 'Unsuppress with Dependents brings both');
    assert(!UI.App.model.configurations.some(function (c) { return c.suppressed; }), 'no overrides left');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'hole ' + fmt(RFFC_HOLE);
  });

  step('rfFC: Edit ▸ Suppress ▸ Specify Configurations… (NoHole only); the ConfigurationManager lists it and a double-click on NoHole rebuilds without the hole; Default keeps it', async function () {
    var errs0 = errors.length;
    await rfFCPartOpen();
    var v0 = rfFCVol(), cut = rfFCFeat('Cut-Extrude1');
    UI.App.sel = { kind: 'feature', id: cut.id }; UI.refreshTree();
    var rows = menuRows('Suppress ▸ Specify Configurations');
    assert(rows.length === 1 && rows[0].menu.indexOf('Edit') >= 0, 'Edit menu row: ' + JSON.stringify(rows.map(function (r) { return r.menu + ' ' + r.text; })));
    rfFCPress(rows[0].row); await wait(20);
    assert(modalOpen() && $('fc-spec'), 'Specify Configurations dialog');
    var boxes = D.querySelectorAll('#fc-spec input[type=checkbox]');
    assert(boxes.length === 2 && boxes[0].checked && !boxes[1].checked, 'Default checked (active), NoHole not');
    boxes[0].click(); boxes[1].click();
    clickModalButton('OK'); await idle();
    rfFCNear(rfFCVol(), v0, 1e-12, 'Default unchanged');
    assert(K.isSuppressed(UI.App.model, cut.id, 'NoHole') && !K.isSuppressed(UI.App.model, cut.id, 'Default'), 'NoHole only');
    UI.setFmTab('config'); await wait(10);
    var nh = D.querySelector('#cfg-list .cfg-row[data-name="NoHole"]');
    assert(nh && /2 suppressed/.test(nh.querySelector('.cfg-vals').textContent), 'NoHole row shows 2 suppressed: ' + (nh && nh.textContent));
    nh.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true, view: W })); await idle();
    assert(UI.App.model.activeConfiguration === 'NoHole', 'NoHole active');
    rfFCNear(rfFCVol(), RFFC_FULL, 1e-12, 'NoHole: no hole, no fillet');
    UI.setFmTab('tree'); UI.refreshTree();
    assert(rfFCRow('Cut-Extrude1').classList.contains('suppressed'), 'greyed in NoHole');
    UI.setFmTab('config'); await wait(10);
    D.querySelector('#cfg-list .cfg-row[data-name="Default"]').dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true, view: W })); await idle();
    rfFCNear(rfFCVol(), v0, 1e-12, 'Default again');
    UI.setFmTab('tree');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfFC: Insert ▸ Tables ▸ Design Table: add a D1@Boss-Extrude1 column, type NoHole = 25 and S, paste two cells from Excel, a bad cell is marked and blocks Apply, OK writes both rows in one undo step', async function () {
    var errs0 = errors.length;
    await rfFCPartOpen();
    var v0 = rfFCVol(), undo0 = UI.App.undo.length;
    var rows = menuRows('Tables ▸ Design Table');
    assert(rows.length === 1 && rows[0].menu.indexOf('Insert') >= 0, 'Insert menu row');
    rfFCPress(rows[0].row); await wait(20);
    assert(modalOpen() && $('dt-grid'), 'design table open');
    var g = UI.designTableState.grid();
    assert(g.length === 3 && g[1][0] === 'Default' && g[2][0] === 'NoHole', 'two configuration rows: ' + JSON.stringify(g));
    var sel = $('dt-add-col');
    assert(Array.prototype.some.call(sel.options, function (o) { return o.value === 'D1@Boss-Extrude1'; }), 'D1@Boss-Extrude1 offered');
    sel.value = 'D1@Boss-Extrude1'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
    sel.value = '$STATE@Cut-Extrude1'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
    g = UI.designTableState.grid();
    assert(g[0][1] === 'D1@Boss-Extrude1' && g[1][1] === '20' && g[0][2] === '$STATE@Cut-Extrude1' && g[1][2] === 'U', 'columns start at the values now: ' + JSON.stringify(g));
    function cell(r, c) { return D.querySelector('#dt-grid [data-r="' + r + '"][data-c="' + c + '"] input'); }
    setInput(cell(2, 1), '25');
    // two cells pasted from Excel into NoHole's state cell: the second spills into a new column
    var dt = new W.DataTransfer(); dt.setData('text/plain', 'Q\t7\r\n');
    cell(2, 2).dispatchEvent(new W.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    g = UI.designTableState.grid();
    assert(g[2][2] === 'Q' && g[2][3] === '7' && g[0].length === 4, 'pasted: ' + JSON.stringify(g));
    clickModalButton('Apply'); await idle(); await wait(10);
    var bad = D.querySelector('#dt-grid td.dt-err[data-r="2"][data-c="2"]');
    assert(bad && /S \(suppressed\)/.test(bad.title) && /error/.test($('dt-msg').textContent) && UI.App.undo.length === undo0 && !(UI.App.model.equations || []).length, 'Q is marked and nothing changed: ' + $('dt-msg').textContent);
    setInput(cell(2, 2), 'S');
    var del = D.querySelector('#dt-grid th[data-r="0"][data-c="3"] .dt-del');
    assert(del, 'column × button');
    del.click();
    clickModalButton('OK'); await idle(); await wait(20); await idle();
    assert(!modalOpen(), 'closed');
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    rfFCNear(rfFCVol(), v0, 1e-12, 'Default as before');
    await anvil.activateConfiguration('NoHole'); await idle();
    rfFCNear(rfFCVol(), 100 * 60 * 25, 1e-12, 'NoHole: 25 deep, no hole, no fillet');
    UI.showDesignTable(); await wait(10);
    var t = UI.designTableState.copy();
    assert(t === '\tD1@Boss-Extrude1\t$STATE@Cut-Extrude1\r\nDefault\t20\tU\r\nNoHole\t25\tS', 'Copy as TSV: ' + JSON.stringify(t));
    clickModalButton('Cancel');
    await UI.undoCommand(); await idle();   // the Show Configuration
    await UI.undoCommand(); await idle();   // the design table, one step
    assert(!(UI.App.model.equations || []).some(function (q) { return q.dim; }) && rfFCFeat('Boss-Extrude1').depth === 20, 'undo removes the linked variable');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfFC: an assembly with two instances of the part: right-click ▸ Configuration ▸ NoHole on one shows it without the hole; an assembly configuration (Add…) suppresses the other, Show switches back', async function () {
    var errs0 = errors.length;
    await anvil.newAssembly('FCAsm'); await idle();
    var nhPart = rfFCPart + '\np.suppress(["Cut-Extrude1", "Fillet1"], ["NoHole"]);';
    await anvil.insert({ script: nhPart }, { name: 'B1' }); await idle();
    await anvil.insert({ script: nhPart }, { name: 'B2', position: [0, 0, 100] }); await idle();
    function vols() { return W.Assembly.massProps(UI.App.model, UI.App.build).components.map(function (c) { return c.volume; }); }
    var v = vols();
    rfFCNear(v[0], v[1], 1e-12, 'same part twice');
    UI.setFmTab('tree'); UI.refreshTree();
    var row = D.querySelector('#tree .ti.component-row[data-comp="' + W.Assembly.findComponent(UI.App.model, 'B2').id + '"]');
    assert(row, 'B2 row');
    rfFCContext(row);
    var mi = rfFCMenuRow('Configuration ▸ NoHole'), md = rfFCMenuRow('Configuration ▸ Default');
    assert(mi && md && md.querySelector('.chk').textContent === '✓', 'Default checked, NoHole offered');
    rfFCPress(mi); await idle();
    var v2 = vols();
    rfFCNear(v2[1], RFFC_FULL, 1e-12, 'B2 shows NoHole (no hole, no fillet)');
    rfFCNear(v2[0], v[0], 1e-12, 'B1 unchanged');
    UI.setFmTab('config'); await wait(10);
    $('asm-cfg-add').click(); await wait(10);
    var inp = D.querySelector('#modal-body input'); setInput(inp, 'Short'); clickModalButton('OK'); await idle();
    assert(UI.App.model.activeConfiguration === 'Short' && D.querySelector('.cfg-row.asm-config[data-name="Short"].active'), 'Short active and listed');
    UI.setFmTab('tree'); UI.refreshTree();
    rfFCContext(D.querySelector('#tree .ti.component-row[data-comp="' + W.Assembly.findComponent(UI.App.model, 'B1').id + '"]'));
    rfFCPress(rfFCMenuRow('Suppress')); await idle();
    var v3 = vols();
    assert(v3[0] === 0, 'B1 suppressed in Short: ' + v3);
    rfFCNear(v3[1], RFFC_FULL, 1e-12, 'B2 still NoHole');
    UI.setFmTab('config'); await wait(10);
    var def = D.querySelector('.cfg-row.asm-config[data-name="Default"]');
    def.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true, view: W })); await idle();
    var v4 = vols();
    rfFCNear(v4[0], v[0], 1e-12, 'Default: B1 back');
    UI.setFmTab('tree');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'B2 NoHole ' + fmt(v2[1]);
  });
