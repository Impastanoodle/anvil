  // --- levels: the Levels Manager (ui-levels.js), Mastercam's part-wide numbered levels over the sketch layers ---
  function lvlPanel() { return $('levels-panel'); }
  function lvlRow(n) { return D.querySelector('#levels-panel .lvl-row[data-level="' + n + '"]'); }
  function lvlCell(n, cls) { var r = lvlRow(n); return r && r.querySelector('.lvl-' + cls); }
  function lvlList() { var o = {}; UI.levels.list().forEach(function (l) { o[l.number] = l; }); return o; }
  function lvlChip() { var c = D.querySelector('#status-right .lvl-chip'); return c ? c.textContent : ''; }
  function lvlFeat(nm) { return UI.App.model.features.filter(function (g) { return g.name === nm; })[0]; }
  // a right-click on a level row (or on the grid when n is null), then the menu row whose text matches re
  function lvlMenu(n, re) {
    var t = n == null ? $('lvl-grid') : lvlCell(n, 'name');
    var r = t.getBoundingClientRect();
    t.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: W, clientX: r.left + 4, clientY: r.top + 4, button: 2 }));
    var mi = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return re.test(m.textContent); })[0];
    assert(mi, 'menu row ' + re + ' in ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent; }).join(' | '));
    assert(!mi.classList.contains('disabled'), 'menu row ' + re + ' is disabled');
    mi.click();
  }
  function lvlInput(id, v) { var i = $(id); i.value = String(v); i.dispatchEvent(new W.Event('change', { bubbles: true })); }
  function lvlType(inp, v) { inp.value = v; inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); }
  function lvlDrawn(f, i) { return UI.groups.sketches.children.some(function (o) { return o.userData && o.userData.sketch === f.id && o.userData.index === i; }); }
  async function lvlDrawCircle(c, r) { UI.setTool('circle'); rskClick(c); rskClick([c[0] + r, c[1]]); UI.setTool('select'); await idle(); }
  step('levels: Levels tab beside the FeatureManager tabs; level 2 ETCH (preset, right-click), 10 BEND (typed main number + name, dashed / no profile from the row menu); main level 2 takes circles drawn in two sketches; counts per level; Move selected to level 10 (one undo step, Undo restores); status chip', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front", 0, "S1").rect(0, 0, 40, 20);\np.sketch("Front", 0, "S2").rect(50, 0, 80, 10).circle(60, 5, 3);'); await idle();
    var tab = D.querySelector('#fm-tabs button[data-tab="levels"]');
    assert(tab && /Levels Manager/.test(tab.title), 'Levels tab'); tab.click();
    assert(!lvlPanel().hidden && $('fm-tree').hidden && tab.classList.contains('active'), 'Levels Manager shown');
    assert(lvlRow(1) && lvlRow(1).classList.contains('main') && UI.levels.main() === 1 && /Level: 1\b/.test(lvlChip()), 'level 1 main: ' + lvlChip());
    ['Number', 'Visible', 'Name', 'Entities', 'Level Set'].forEach(function (h) { assert(lvlPanel().querySelector('.lvl-hdr').textContent.indexOf(h) >= 0, 'column ' + h); });
    // level 2 ETCH from the preset (right-click on the grid)
    var u0 = UI.App.undo.length;
    lvlMenu(null, /Add preset level ETCH/);
    var L = lvlList();
    assert(L[2] && L[2].name === 'ETCH' && L[2].noProfile && L[2].color === '#1e9e3c' && UI.App.undo.length === u0 + 1, 'ETCH level ' + JSON.stringify(L[2]));
    // level 10: typed into the main level number (Mastercam creates it and makes it main), named BEND, dashed, no profile
    lvlInput('lvl-main-num', 10);
    assert(lvlList()[10] && UI.levels.main() === 10 && lvlRow(10).classList.contains('main'), 'level 10 created main');
    lvlInput('lvl-main-name', 'BEND');
    assert(lvlList()[10].name === 'BEND' && /Level: 10 BEND/.test(lvlChip()), 'BEND: ' + lvlChip());
    lvlMenu(10, /Dashed line type/); lvlMenu(10, /Exclude from profiles/);
    L = lvlList();
    assert(L[10].lineType === 'dashed' && L[10].noProfile, 'BEND props ' + JSON.stringify(L[10]));
    // a name already used or all digits is refused
    lvlInput('lvl-main-name', 'etch');
    assert(lvlList()[10].name === 'BEND', 'duplicate name refused');
    // a click on a row's number makes it main
    lvlCell(2, 'num').click();
    assert(UI.levels.main() === 2 && /Level: 2 ETCH/.test(lvlChip()), 'main 2: ' + lvlChip());
    // draw in sketch 1: the circle goes on level 2
    var f1 = lvlFeat('S1'), f2 = lvlFeat('S2');
    UI.editSketch(f1.id); await idle(); UI.zoomView(0.25 / UI.cam.scale);
    await lvlDrawCircle([20, 10], 3);
    var c1 = f1.entities.length - 1;
    assert(f1.entities[c1].t === 'circle' && f1.entities[c1].layer === 'ETCH' && UI.levels.levelOf(f1, c1) === 2, 'S1 circle on level 2: ' + JSON.stringify(f1.entities[c1]));
    var rec = (f1.layers || []).filter(function (r) { return r.name === 'ETCH'; })[0];
    assert(rec && rec.noProfile && rec.color === '#1e9e3c', 'S1 layer record ' + JSON.stringify(f1.layers));
    assert(!lvlPanel().hidden, 'the Levels Manager is back after the Circle PM closed');
    UI.exitSketch(true); await idle();
    // sketch 2: a circle on level 2, then the first circle moved to level 10 from the row menu
    f2 = lvlFeat('S2');
    UI.editSketch(f2.id); await idle(); UI.zoomView(0.25 / UI.cam.scale);
    await lvlDrawCircle([70, 5], 3);
    var c2 = f2.entities.length - 1;
    assert(f2.entities[c2].layer === 'ETCH', 'S2 circle on level 2: ' + JSON.stringify(f2.entities) + ' main ' + UI.levels.main() + ' layers ' + JSON.stringify(f2.layers) + ' levels ' + JSON.stringify(UI.App.model.levels));
    L = lvlList();
    assert(L[1].count === 3 && L[2].count === 2 && L[10].count === 0, 'counts ' + [L[1].count, L[2].count, L[10].count]);
    UI.setSelection([{ kind: 'entity', index: 1 }]);
    u0 = UI.App.undo.length;
    lvlMenu(10, /Move selected entities to this level/);
    assert(f2.entities[1].layer === 'BEND' && UI.levels.levelOf(f2, 1) === 10 && UI.App.undo.length === u0 + 1, 'moved to 10 ' + JSON.stringify(f2.entities[1]));
    L = lvlList();
    assert(L[1].count === 2 && L[2].count === 2 && L[10].count === 1, 'counts after the move ' + [L[1].count, L[2].count, L[10].count]);
    assert(lvlCell(1, 'count').textContent === '2' && lvlCell(2, 'count').textContent === '2' && lvlCell(10, 'count').textContent === '1', 'Entities column');
    await UI.undo(); await idle();
    f2 = lvlFeat('S2');
    assert(UI.App.mode === 'sketch' && f2.entities[1].layer == null && UI.levels.levelOf(f2, 1) === 1 && lvlList()[10].count === 0, 'undo: back on level 1 ' + JSON.stringify(f2.entities[1]));
    var r = UI.levels.op('move', 10, [1]);
    assert(r.ok && f2.entities[1].layer === 'BEND', 'moved again');
    // the status bar chip opens the main level picker
    lvlCell(1, 'num').click();
    var chip = D.querySelector('#status-right .lvl-chip');
    chip.click();
    var pr = D.querySelector('.lvl-pop .lvl-pop-row[data-num="10"]');
    assert(pr, 'main level popup'); pr.click();
    assert(UI.levels.main() === 10 && /Level: 10 BEND/.test(lvlChip()) && !D.querySelector('.lvl-pop'), 'popup made 10 main: ' + lvlChip());
    lvlCell(1, 'num').click();
    return 'levels ' + UI.levels.list().map(function (l) { return l.number + (l.name ? ' ' + l.name : '') + ' (' + l.count + ')'; }).join(', ');
  });
  step('levels: Visible off hides a level in every sketch (not drawn, picked or snapped to; the main level stays visible); level set MARKING toggles 2 and 10; Extruded Boss ignores the ETCH level; sketch DXF on the level names (number when unnamed); save / load keeps the levels', async function () {
    var f1 = lvlFeat('S1'), f2 = lvlFeat('S2');
    assert(UI.App.mode === 'sketch' && UI.App.activeSketch === f2.id && UI.levels.main() === 1, 'still in S2 with main 1');
    var c1 = f1.entities.length - 1, c2 = f2.entities.length - 1;
    // the snap at the S2 circle's centre while it shows
    var ce = f2.entities[c2], near0 = [ce.cx + 0.2, ce.cy + 0.1], at = rskScr(near0), sn = UI.sketchInferPoint(near0, at[0], at[1]);
    function onCentre(q) { return q.snap && Math.abs(q.p[0] - ce.cx) < 1e-9 && Math.abs(q.p[1] - ce.cy) < 1e-9; }
    assert(onCentre(sn), 'snaps to the centre while visible ' + JSON.stringify(sn.p));
    var u0 = UI.App.undo.length;
    lvlCell(2, 'vis').click();
    assert(lvlList()[2].hidden && lvlCell(2, 'vis').textContent === '' && UI.App.undo.length === u0 + 1, 'level 2 hidden (one undo step)');
    assert(!lvlDrawn(f2, c2) && !lvlDrawn(f1, c1) && lvlDrawn(f2, 0) && lvlDrawn(f1, 0), 'level 2 entities not drawn in either sketch');
    assert(!UI.pickEntity.apply(null, rskScr([ce.cx + ce.r, ce.cy])), 'hidden circle picked');
    sn = UI.sketchInferPoint(near0, at[0], at[1]);
    assert(!onCentre(sn), 'snapped to a hidden level ' + JSON.stringify(sn.snap));
    // the main level cannot be hidden
    lvlCell(1, 'vis').click();
    assert(!lvlList()[1].hidden, 'main level hidden');
    // level 1 off (main elsewhere): the rectangles go too, and come back
    lvlCell(10, 'num').click(); lvlCell(1, 'vis').click();
    assert(lvlList()[1].hidden && !lvlDrawn(f2, 0) && !lvlDrawn(f1, 0) && !UI.pickEntity.apply(null, rskScr([80, 5])), 'level 1 hidden');
    D.querySelector('#levels-panel [data-act="allOn"]').click();
    assert(!lvlList()[1].hidden && !lvlList()[2].hidden && lvlDrawn(f2, 0) && lvlDrawn(f2, c2), 'All on');
    lvlCell(1, 'num').click();
    // level set MARKING on 2 and 10 (typed into the Level Set cells), then the Level sets list toggles both
    lvlType(UI.levelsEdit(2, 'set'), 'MARKING');
    lvlType(UI.levelsEdit(10, 'set'), 'MARKING');
    var L = lvlList();
    assert(L[2].set === 'MARKING' && L[10].set === 'MARKING' && lvlCell(2, 'set').textContent === 'MARKING', 'level sets ' + L[2].set + ' / ' + L[10].set);
    var sets = $('lvl-sets');
    assert(Array.prototype.some.call(sets.options, function (o) { return o.value === 'MARKING'; }), 'MARKING in the Level sets list');
    lvlInput('lvl-sets', 'MARKING');
    L = lvlList();
    assert(L[2].hidden && L[10].hidden && !L[1].hidden && !lvlDrawn(f2, 1) && !lvlDrawn(f2, c2), 'MARKING off');
    lvlInput('lvl-sets', 'MARKING');
    L = lvlList();
    assert(!L[2].hidden && !L[10].hidden && lvlDrawn(f2, 1), 'MARKING on');
    // Display: Used hides the unused, named levels stay with Named
    UI.levels.op('create', 7);
    UI.levels.display('used');
    assert(UI.levels.visibleRows().indexOf(7) < 0 && UI.levels.visibleRows().indexOf(2) >= 0, 'Used: ' + UI.levels.visibleRows());
    UI.levels.display('all');
    assert(UI.levels.visibleRows().indexOf(7) >= 0, 'All');
    // Extruded Boss of S1 ignores its ETCH circle (no profile): the full 40 × 20 × 10 block
    UI.exitSketch(true); await idle();
    await anvil.append('p.extrude(10, { sketch: ' + f1.id + ' });'); await idle();
    assert(!Object.keys(UI.App.build.errors || {}).length, 'build errors ' + JSON.stringify(UI.App.build.errors));
    near(anvil.mass().volume, 8000, 1e-6, 'volume (the ETCH circle cuts nothing)');
    // the sketch DXF: each entity on its level's name; an unnamed level on its number
    var dxf = anvil.dxfSketch(f2.id);
    assert(/\n0\nCIRCLE\n8\nBEND\n/.test(dxf) && /\n0\nCIRCLE\n8\nETCH\n/.test(dxf) && (dxf.match(/\n0\nLINE\n8\nOUTLINE\n/g) || []).length === 4, 'DXF layers ' + JSON.stringify(dxf.slice(dxf.indexOf('ENTITIES'))));
    var u1 = UI.App.undo.length;
    assert(UI.levels.op('rename', 10, '').ok && f2.entities[1].layer === '10' && UI.App.undo.length === u1 + 1, 'unnamed level 10 re-keys its entities: ' + JSON.stringify(f2.entities[1]));
    dxf = anvil.dxfSketch(f2.id);
    assert(/\n0\nCIRCLE\n8\n10\n/.test(dxf), 'DXF on layer 10');
    assert(UI.levels.op('rename', 10, 'BEND').ok && f2.entities[1].layer === 'BEND', 'named again');
    // save / load
    var before = JSON.stringify(UI.levels.list().map(function (l) { return [l.number, l.name, l.set, l.hidden, l.noProfile, l.lineType, l.count]; }));
    var json = anvil.model();
    assert(Array.isArray(json.levels) && json.levels.length === 4 && json.mainLevel === 1, 'saved levels ' + JSON.stringify(json.levels));
    json.mainLevel = 2;
    await anvil.load(json); await idle();
    var after = JSON.stringify(UI.levels.list().map(function (l) { return [l.number, l.name, l.set, l.hidden, l.noProfile, l.lineType, l.count]; }));
    assert(after === before && UI.levels.main() === 2, 'levels after load ' + after + ' vs ' + before);
    return 'DXF on ETCH / BEND / 10, volume 8000, ' + JSON.parse(after).length + ' levels kept';
  });
  step('levels: name-keyed sketch layers migrate (a script\'s "etch" joins level 2 ETCH, "Marks" becomes a new level, an unknown key goes to level 1, a legacy model with no level table gets one); the old Layers PM shares the levels; Copy / Delete / Clear unused; the script round trip keeps the level names', async function () {
    await anvil.append('p.sketch("Front", 0, "Legacy").circle(200, 0, 4).circle(220, 0, 4).circle(240, 0, 4).layers([{ name: "etch", color: "#1e9e3c", noProfile: true }, { name: "Marks", color: "#ff0000" }]).layer("etch", [0]).layer("Marks", [1]).layer("Ghost", [2]);'); await idle();
    var g = lvlFeat('Legacy'), L = lvlList();
    var marks = UI.levels.list().filter(function (l) { return l.name === 'Marks'; })[0];
    assert(g.entities[0].layer === 'ETCH' && UI.levels.levelOf(g, 0) === 2, 'etch joined ETCH: ' + JSON.stringify(g.entities[0]));
    assert(marks && marks.number === 3 && marks.count === 1 && marks.color === '#ff0000' && g.entities[1].layer === 'Marks', 'Marks level ' + JSON.stringify(marks));
    assert(g.entities[2].layer == null && UI.levels.levelOf(g, 2) === 1, 'unknown key on level 1 ' + JSON.stringify(g.entities[2]));
    assert(g.layers.map(function (r) { return r.name; }).join() === 'ETCH,Marks', 'records ' + JSON.stringify(g.layers));
    assert(L[2].count === 3, 'ETCH count across three sketches ' + L[2].count);
    // a legacy document (no model.levels): its name-keyed layers become levels on load
    var json = anvil.model();
    delete json.levels; delete json.mainLevel;
    await anvil.load(json); await idle();
    var names = UI.levels.list().map(function (l) { return l.number + ':' + l.name + ':' + l.count; });
    assert(names.indexOf('2:ETCH:3') >= 0 && UI.levels.list().some(function (l) { return l.name === 'BEND' && l.count === 1 && l.lineType === 'dashed'; }) && UI.levels.list().some(function (l) { return l.name === 'Marks' && l.count === 1; }), 'migrated ' + names.join(', '));
    // the Layers PM of a sketch: a layer it adds is a level, its current layer is the main level, its eye hides the level
    g = lvlFeat('Legacy');
    UI.editSketch(g.id); await idle(); UI.zoomView(0.25 / UI.cam.scale);
    var lr = UI.sketchLayerOp('add', { name: 'Notes' });
    assert(lr.ok && UI.levels.list().some(function (l) { return l.name === 'Notes'; }), 'Layers PM layer is a level');
    UI.sketchCurrentLayer('Notes');
    var notes = UI.levels.list().filter(function (l) { return l.name === 'Notes'; })[0];
    assert(UI.levels.main() === notes.number, 'current layer = main level');
    UI.sketchLayerOp('set', 'Marks', { hidden: true });
    assert(UI.levels.list().filter(function (l) { return l.name === 'Marks'; })[0].hidden, 'the Layers PM eye hides the level');
    UI.sketchLayerOp('set', 'Marks', { hidden: false });
    // Copy selected entities to this level: a copy of circle 2 on Notes
    var n0 = g.entities.length;
    UI.setSelection([{ kind: 'entity', index: 2 }]);
    lvlMenu(notes.number, /Copy selected entities to this level/);
    assert(g.entities.length === n0 + 1 && g.entities[n0].layer === 'Notes' && g.entities[2].layer == null, 'copied ' + JSON.stringify(g.entities[n0]));
    // Select all entities on this level
    lvlMenu(2, /Select all entities on this level/);
    assert(anvil.selection().length === 1 && anvil.selection()[0].index === 0, 'selected ' + JSON.stringify(anvil.selection()));
    // Delete: Notes' entities go to level 1, the main level falls back to 1; level 1 cannot be deleted
    var u0 = UI.App.undo.length;
    lvlMenu(notes.number, /^Delete$/);
    assert(g.entities[n0].layer == null && UI.levels.main() === 1 && !UI.levels.list().some(function (l) { return l.name === 'Notes'; }) && UI.App.undo.length === u0 + 1, 'Notes deleted');
    assert(!UI.levels.op('remove', 1).ok, 'level 1 deleted');
    UI.levels.op('create', 30);
    var nBefore = UI.levels.list().length, cu = UI.levels.op('clearUnused');
    assert(cu.ok && cu.removed >= 1 && !UI.levels.list().some(function (l) { return l.number === 30; }) && UI.levels.list().length === nBefore - cu.removed, 'Clear unused ' + JSON.stringify(cu));
    UI.exitSketch(true); await idle();
    // the script round trip: the layer names come back as levels
    var code = anvil.script();
    assert(code.indexOf('.layer("ETCH"') > 0 && code.indexOf('.layer("BEND"') > 0, 'script ' + code);
    await anvil.run(code); await idle();
    var back = UI.levels.list();
    assert(back.some(function (l) { return l.name === 'ETCH' && l.count === 3 && l.noProfile; }) && back.some(function (l) { return l.name === 'BEND' && l.count === 1; }) && back.some(function (l) { return l.name === 'Marks'; }), 'round trip ' + JSON.stringify(back.map(function (l) { return l.number + ' ' + l.name + ' ' + l.count; })));
    near(anvil.mass().volume, 8000, 1e-6, 'round-trip volume');
    D.querySelector('#fm-tabs button[data-tab="tree"]').click();
    assert(lvlPanel().hidden && !$('fm-tree').hidden, 'tree tab again');
    return 'migrated ' + names.join(', ');
  });
  // --- end levels ---
