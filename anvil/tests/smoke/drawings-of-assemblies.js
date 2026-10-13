  // ---- drawings of assemblies (run cloud-2026-09-25h)
  function rbButton(text) {
    var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return x.textContent.replace(/\s+/g, ' ').indexOf(text) >= 0; })[0]; };
    var b = find();
    if (!b && UI.drawingActive && UI.drawingActive()) ['View Layout', 'Annotation'].some(function (t) { dwTab(t); b = find(); return !!b; });   // (rfW)
    return b;
  }
  function boxesOverlap(a, b) { return a[2] > b[0] && a[0] < b[2] && a[3] > b[1] && a[1] < b[3]; }
  step('assembly drawing: File > Make Drawing from Assembly on the Pinned plate assembly: Standard 3 View of the solved components, Bill of Materials (Plate 1, Pin 2, Cap 1) anchored top-right, clear of every view', async function () {
    var ex = W.AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0];
    var r = await UI.openExample(ex); await idle();
    assert(!r.error && UI.isAssembly(), 'assembly example did not open: ' + r.error);
    assert(!menuRows('Make Drawing from Part').length, 'no "from Part" item in an assembly');
    if (UI.closeMenus) UI.closeMenus();
    var rows = menuRows('Make Drawing from Assembly');
    assert(rows.length && rows[0].menu === 'File' && !rows[0].row.classList.contains('disabled'), 'File > Make Drawing from Assembly enabled');
    rows[0].row.click(); await idle(); await wait(60);
    assert(UI.drawingActive(), 'drawing open');
    var sm = anvil.drawing.summary();
    assert(sm.views.length === 4, 'views ' + sm.views.length);
    assert(JSON.stringify(dwView('Front').extents) === '[100,20]' && JSON.stringify(dwView('Top').extents) === '[100,60]' && JSON.stringify(dwView('Right').extents) === '[60,20]', 'extents ' + sm.views.map(function (v) { return v.orient + JSON.stringify(v.extents); }).join(' '));
    var bom = sm.bom;
    assert(bom && bom.rows.map(function (x) { return x.item + ':' + x.partNumber + ':' + x.qty; }).join(' ') === '1:Plate:1 2:Pin:2 3:Cap:1', 'BOM ' + JSON.stringify(bom && bom.rows));
    assert(bom.rows[1].components.join(',') === 'Pin<1>,Pin<2>', 'pins counted together');
    assert(bom.anchor === 'top-right' && Math.abs(bom.box[2] - 410) < 1e-6 && Math.abs(bom.box[3] - 287) < 1e-6, 'anchored to the border corner ' + bom.box);
    sm.views.forEach(function (v) { assert(!boxesOverlap(v.box, bom.box), v.name + ' covers the BOM'); });
    assert(D.querySelector('#drawing-tree .dw-bom') && /Bill of Materials1/.test(D.querySelector('#drawing-tree .dw-bom').textContent), 'tree row Bill of Materials1');
    assert(D.querySelector('#drawing-sheet g[data-layer="BOM"]') && /PINNED PLATE/.test(anvil.drawing.svg()), 'BOM layer and title');
    assert(ribbonTabs().indexOf('View Layout') >= 0 && rbButton('Auto Balloon') && rbButton('Bill of'), 'Annotation tab with Auto Balloon and Bill of Materials (rfW)');
    var wa = menuRows('(assembly)');
    assert(wa.length && wa[0].menu === 'Window', 'Window lists the assembly');
    if (UI.closeMenus) UI.closeMenus();
    return 'scale ' + sm.sheet.scale + ', BOM ' + bom.rows.length + ' rows at ' + bom.box;
  });
  step('assembly drawing: Auto Balloon (ribbon PM) on the isometric numbers Plate / Pin / Cap 1-3 from the BOM; a balloon deletes and undoes; a new Pin<3> joins item 2 (QTY 3); BOM re-anchored bottom-left, dragged, deleted', async function () {
    rbButton('Auto Balloon').click();
    assert(UI.hasPM() && D.querySelector('#pm select[data-key="view"]'), 'Auto Balloon PM');
    await UI.pmOK(); await idle(); await wait(40);
    var sm = anvil.drawing.summary(), iso = dwView('Isometric');
    assert(iso.balloons.slice().sort().join(',') === '1,2,3' && sm.balloons.length === 3, 'balloons ' + JSON.stringify(iso.balloons));
    assert(D.querySelectorAll('#drawing-sheet g[data-layer="BALLOONS"] circle').length === 3, 'three balloon circles');
    var names = {}; sm.balloons.forEach(function (b) { names[b.item] = b.component; });
    assert(names[1] === 'Plate<1>' && names[2] === 'Pin<1>' && names[3] === 'Cap<1>', 'linked to ' + JSON.stringify(names));
    sm.balloons.forEach(function (b) { var bx = iso.box; assert(b.c[0] < bx[0] || b.c[0] > bx[2] || b.c[1] < bx[1] || b.c[1] > bx[3], 'balloon outside the view ' + b.c); });
    // select balloon 3 with the mouse and delete it; undo brings it back
    var b3 = sm.balloons.filter(function (b) { return b.item === 3; })[0];
    sheetMouse('mousedown', b3.c); sheetMouse('mouseup', b3.c);
    assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'balloon', 'balloon selected');
    key('Delete'); await wait(30);
    assert(dwView('Isometric').balloons.length === 2, 'deleted');
    await UI.undo(); await idle(); await wait(60);
    assert(UI.drawingActive() && dwView('Isometric').balloons.length === 3, 'undo');
    // a third pin (same source) joins item 2; the balloons keep their numbers
    await anvil.insert({ script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [150, 0, 0] }); await idle(); await wait(60);
    sm = anvil.drawing.summary();
    assert(sm.bom.rows[1].qty === 3 && sm.bom.rows.length === 3, 'QTY 3 ' + JSON.stringify(sm.bom.rows));
    await UI.undo(); await idle(); await wait(60);
    assert(anvil.drawing.summary().bom.rows[1].qty === 2, 'undo insert');
    // Bill of Materials PM: Bottom Left anchor; then drag it; then delete it
    rbButton('Bill of').click();
    var sel = D.querySelector('#pm select[data-key="anchor"]');
    sel.value = 'bottom-left'; sel.dispatchEvent(new W.Event('change'));
    await UI.pmOK(); await idle(); await wait(40);
    var bm = anvil.drawing.summary().bom;
    assert(bm.anchor === 'bottom-left' && Math.abs(bm.box[0] - 10) < 1e-6 && Math.abs(bm.box[1] - 10) < 1e-6, 'bottom-left ' + bm.box);
    var at = [bm.box[0] + 20, bm.box[1] + 3];
    sheetMouse('mousedown', at); W.dispatchEvent(new W.MouseEvent('mousemove', Object.assign({ bubbles: true }, paperToClient([at[0] + 30, at[1] + 40])))); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true }));
    await wait(60);
    bm = anvil.drawing.summary().bom;
    assert(bm.anchor === 'moved' && Math.abs(bm.box[0] - 40) < 0.5 && Math.abs(bm.box[1] - 50) < 0.5, 'dragged ' + bm.box);
    UI.drawing.state.sel = { kind: 'bom' }; key('Delete'); await wait(30);
    assert(anvil.drawing.summary().bom === null && !D.querySelector('#drawing-tree .dw-bom'), 'BOM deleted');
    assert(anvil.drawing.summary().balloons.length === 3, 'balloons still numbered without the table');
    await UI.undo(); await idle(); await wait(60);
    assert(anvil.drawing.summary().bom !== null, 'undo delete');
    return '3 balloons, QTY 2 -> 3 -> 2, BOM moved to ' + bm.box;
  });
  step('assembly drawing: Section View through the pins (Top view, z = 10) hatches each component at its own angle; SVG / DXF / PDF carry the BOM, balloons and hatch', async function () {
    var top = dwView('Top');
    var sm = anvil.drawing.sectionView(top.id, { axis: 'h', at: -10, sign: 1, y: 30 });
    var sv = sm.views.filter(function (v) { return v.kind === 'section'; })[0];
    assert(sv && sv.hatches.length === 3, 'three cut components ' + JSON.stringify(sv && sv.hatches));
    var by = {}; sv.hatches.forEach(function (h) { by[h.component] = h.angle; assert(h.lines > (h.component === 'Pin<2>' ? 2 : 5), h.component + ' hatched'); });   // (r11/hatch11: Pin<2> 1.6× wider apart)
    assert(by['Plate<1>'] === 45 && by['Pin<1>'] === 135 && by['Pin<2>'] === 135, 'angles ' + JSON.stringify(by));   // (r11/hatch11: Pin<2> touches the plate too: 135° wider apart)
    assert(Math.abs(sv.sectionArea - (672 + 2 * 160)) < 1e-6, 'cut area ' + sv.sectionArea);
    var svg = anvil.drawing.svg(), dxf = anvil.drawing.dxf(), pdf = anvil.drawing.pdf();
    ['BOM', 'BALLOONS', 'SECTION_A'].forEach(function (l) { assert(svg.indexOf('data-layer="' + l + '"') > 0 && dxf.indexOf('\n8\n' + l + '\n') > 0, 'layer ' + l); });
    assert(/\(PART NUMBER\) Tj/.test(pdf) && /\(QTY\.\) Tj/.test(pdf) && /\(Pin\) Tj/.test(pdf), 'PDF BOM text');
    anvil.drawing.close();
    assert(!UI.drawingActive() && UI.isAssembly(), 'back to the assembly');
    return 'hatch ' + JSON.stringify(by);
  });
  step('drawing + assembly: Window lists part and drawing; New Assembly from a part drawing closes it', async function () {
    await anvil.run(plateCode());
    anvil.drawing.make();
    assert(UI.drawingActive() && anvil.drawing.summary().bom === null, 'drawing of the part, no BOM');
    var wp = menuRows('(part)');
    assert(wp.length && wp[0].menu === 'Window', 'Window lists the part while the drawing is open');
    if (UI.closeMenus) UI.closeMenus();
    var na = menuRows('New ▸ Assembly');
    assert(na.length && na[0].menu === 'File', 'File > New > Assembly in the drawing menus');
    na[0].row.click(); dontSaveIfAsked();   // the scripted part is unsaved: "Save changes to …?" first
    await idle(); await wait(80);
    assert(UI.isAssembly() && !UI.drawingActive() && $('drawing-doc').hidden, 'New Assembly should leave the drawing');
    assert(ribbonTabs().indexOf('View Layout') < 0 && ribbonTabs().indexOf('Assembly') >= 0, 'tabs ' + ribbonTabs());
    assert(anvil.drawing.make() === null && !UI.drawingActive(), 'an empty assembly has nothing to draw');
    await anvil.run('p.box(10, 10, 10);'); await idle();
    assert(!UI.isAssembly(), 'back to a part');
    return 'Window part / drawing entries';
  });
  // after the drawings merge (run cloud-2026-09-25e): UI.ribbonTabsFor (drawing.js) must leave the assembly tabs alone
  step('assembly + drawings: the ribbon still shows Assembly (Move / Rotate Component) and Evaluate (Interference Detection), no Drawing tab until a drawing is made', async function () {
    var ex = (W.AnvilExamples || []).filter(function (e) { return e.name === 'Interference check'; })[0];
    await anvil.run(ex.code); await idle();
    assert(!UI.drawingActive || !UI.drawingActive(), 'no drawing open');
    var tabs = Array.prototype.map.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent.trim(); });
    assert(tabs.indexOf('Assembly') >= 0 && tabs.indexOf('Evaluate') >= 0 && tabs.indexOf('View Layout') < 0 && tabs.indexOf('Features') < 0, 'tabs ' + JSON.stringify(tabs));
    function labels() { return Array.prototype.map.call(D.querySelectorAll('#ribbon-buttons button'), function (b) { return b.textContent.replace(/\s+/g, ' '); }).join(' | '); }
    UI.setRibbonTab('Assembly');
    assert(/Move\s*Component/.test(labels()) && /Rotate\s*Component/.test(labels()), 'Assembly tab: ' + labels());
    UI.setRibbonTab('Evaluate');
    assert(/Interference/.test(labels()), 'Evaluate tab: ' + labels());
    var sm = anvil.drawing.make();
    assert(sm && UI.drawingActive() && sm.bom.rows.map(function (r) { return r.partNumber + ' ' + r.qty; }).join(', ') === 'Base 1, Block 1, Pin 2', 'Make Drawing from Assembly: ' + JSON.stringify(sm && sm.bom));
    anvil.drawing.close();
    assert(ribbonTabs().indexOf('Assembly') >= 0 && ribbonTabs().indexOf('View Layout') < 0, 'assembly tabs back');
    return JSON.stringify(tabs);
  });

