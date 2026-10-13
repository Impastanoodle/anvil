  // ---- rfAT (2026-10-13): Line tool arc intent zones, Jog Line, sketch Blocks
  async function rfATNew(ents) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.25 / UI.cam.scale);   // 0.25 units per pixel
    var f = UI.activeSketchFeature();
    (ents || []).forEach(function (e) { f.entities.push(e); });
    UI.App.gridStale = true; UI.updateSketches(); await wait(20);
    return f;
  }
  function rfATScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfATEv(type, uv, target) {
    var r = $('viewport').getBoundingClientRect(), p = rfATScr(uv);
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' || type === 'mousemove' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfATClick(uv) { rfATEv('mousemove', uv); rfATEv('mousedown', uv, $('viewport')); rfATEv('mouseup', uv); }
  function rfATSet(key, val) { var i = D.querySelector('#pm [data-key="' + key + '"]'); assert(i, 'field ' + key); i.value = String(val); i.dispatchEvent(new W.Event('input', { bubbles: true })); i.dispatchEvent(new W.Event('change', { bubbles: true })); }
  function rfATRels(f) { return (f.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
  function rfATKey(k) { D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  step('rfAT: Line tool autotransition — back over the end point and out square to the line gives a normal arc (no Tangent), out along it a tangent arc, as SolidWorks\' intent zones', async function () {
    var f = await rfATNew();
    UI.setTool('line'); rfATClick([0, 0]); rfATClick([20, 0]);
    // away from the end, back over it, then out square to the line (up): arc mode, normal zone
    rfATEv('mousemove', [30, 0]); await wait(10);
    rfATEv('mousemove', [20.1, 0]); await wait(10);
    rfATEv('mousemove', [20, 6]); await wait(10);
    assert(UI.App.toolState.arcMode && UI.lineArcZone() === 'normal', 'normal zone: ' + UI.App.toolState.arcMode + ' ' + UI.lineArcZone());
    rfATClick([24, 4]);
    var a = f.entities[1];
    assert(a && a.t === 'arc', 'arc drawn: ' + JSON.stringify(a));
    near(a.cx, 24, 1e-6, 'normal arc centre on the line'); near(a.cy, 0, 1e-6, 'centre y'); near(a.r, 4, 1e-6, 'radius');
    assert(!rfATRels(f).some(function (r) { return /^tangent:/.test(r); }), 'no Tangent on a normal arc: ' + rfATRels(f).join(' '));
    assert(!UI.App.toolState.arcMode, 'lines again after the arc');
    // from the arc's end (24, 4), heading +x there: back over it and out along that tangent: a tangent arc
    var Q = UI.App.toolState.pts[0];
    near(Q[0], 24, 1e-6, 'chain at the arc end'); near(Q[1], 4, 1e-6, 'arc end y');
    rfATEv('mousemove', [24, 14]); await wait(10);
    rfATEv('mousemove', [24.1, 4]); await wait(10);
    rfATEv('mousemove', [30, 4.3]); await wait(10);
    assert(UI.App.toolState.arcMode && UI.lineArcZone() === 'tangent', 'tangent zone: ' + UI.App.toolState.arcMode + ' ' + UI.lineArcZone());
    rfATClick([32, -2]);
    var b = f.entities[2];
    assert(b && b.t === 'arc' && rfATRels(f).some(function (r) { return /^tangent:/.test(r); }), 'tangent arc with Tangent: ' + rfATRels(f).join(' '));
    rfATKey('Escape'); await idle();
    await UI.exitSketch(); await idle();
    return 'R ' + a.r + ', then R ' + Math.round(b.r * 1000) / 1000;
  });
  step('rfAT: Jog Line — Tools ▸ Sketch Tools ▸ Jog Line, click a line, move along and off it, click: five connected lines, Collinear / Parallel / Perpendicular, one undo step; typed Width / Depth with ✓', async function () {
    var errs0 = errors.length, f = await rfATNew([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 0, y1: 20, x2: 40, y2: 20 }]);
    W.SketchSolver.addRelation(f, 'horizontal', ['0']);
    var rows = menuRows('Sketch Tools ▸ Jog Line');
    assert(rows.length === 1 && !rows[0].row.classList.contains('disabled'), 'menu row');
    var u0 = UI.App.undo.length;
    rows[0].row.click(); await idle();
    assert(UI.pmTitle() === 'Jog Line', 'Jog Line PM: ' + UI.pmTitle());
    rfATClick([10, 0]);
    rfATEv('mousemove', [22, 5]); await wait(10);
    assert(UI.App.tempEntities.length === 5, 'preview: ' + UI.App.tempEntities.length);
    rfATClick([22, 5]); await idle();
    assert(f.entities.length === 6, 'five lines from one: ' + f.entities.length);
    var E = f.entities;
    near(E[0].x2, 10, 1e-6, 'first piece ends at the jog'); near(E[2].x1, 10, 1e-6, 'jog side'); near(E[2].y2, 5, 1e-6, 'jog depth'); near(E[3].x2, 22, 1e-6, 'jog width'); near(E[5].x2, 40, 1e-6, 'last piece ends where the line did');
    var rs = rfATRels(f);
    assert(rs.indexOf('collinear:0,5') >= 0 && rs.indexOf('parallel:3,0') >= 0 && rs.indexOf('perpendicular:2,0') >= 0, 'relations ' + rs.join(' '));
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    var st = UI.sketchStatus();
    assert(st.rels.every(function (s) { return s === 'ok'; }), 'relations satisfied: ' + JSON.stringify(st.rels));
    // typed: the second line, Width 6, Depth -3, ✓
    rfATClick([5, 20]);
    rfATSet('w', 6); rfATSet('d', -3);
    await UI.pmOK(); await idle();
    assert(f.entities.length === 10, 'second jog: ' + f.entities.length);
    var j = f.entities.slice(6);
    assert(j.some(function (l) { return Math.abs(l.y1 - 17) < 1e-6 && Math.abs(l.y2 - 17) < 1e-6 && Math.abs(Math.abs(l.x2 - l.x1) - 6) < 1e-6; }), 'typed jog 6 wide, 3 deep: ' + JSON.stringify(j));
    UI.undo(); await idle();
    assert(UI.activeSketchFeature().entities.length === 6, 'undo takes the typed jog back');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return rs.length + ' relations';
  });
  step('rfAT: Blocks — Make Block from a punch symbol, Insert Block twice by clicking, drag one line (the whole instance moves), Block properties Angle 90, Edit Block adds a line to every instance, Explode, script round trip, undo', async function () {
    var errs0 = errors.length;
    var f = await rfATNew([{ t: 'rect', x: 0, y: 0, w: 60, h: 40 }, { t: 'circle', cx: 10, cy: 10, r: 2 }, { t: 'line', x1: 6, y1: 10, x2: 14, y2: 10 }]);
    assert(menuRows('Blocks ▸ Make').length === 1 && menuRows('Blocks ▸ Insert').length === 1 && menuRows('Blocks ▸ Explode').length === 1, 'Tools ▸ Blocks rows');
    if (UI.closeMenus) UI.closeMenus();
    UI.setSelection([{ kind: 'entity', index: 1 }, { kind: 'entity', index: 2 }]);
    var u0 = UI.App.undo.length;
    UI.cmdMakeBlock(); await idle();
    assert(UI.pmTitle() === 'Make Block', 'Make Block PM');
    rfATClick([10, 10]);   // the insertion point: the hole centre
    rfATSet('name', 'Punch');
    await UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    var inst = K.blockInstances(f);
    assert(f.blocks && f.blocks.Punch && inst.length === 1 && inst[0].x === 10 && inst[0].y === 10, 'block made: ' + JSON.stringify(inst));
    assert(UI.App.undo.length === u0 + 1, 'Make Block is one undo step');
    // Insert Block: two clicks, two instances
    UI.setSelection([]); UI.App.sel = null;
    UI.cmdInsertBlock(); await idle();
    assert(UI.pmTitle() === 'Insert Block', 'Insert Block PM: ' + UI.pmTitle());
    rfATEv('mousemove', [30, 20]); await wait(10);
    assert(UI.App.tempEntities.length === 2, 'preview on the cursor');
    rfATClick([30, 20]); rfATClick([45, 30]);
    await UI.pmOK(); await idle();
    inst = K.blockInstances(f);
    assert(inst.length === 3, 'three instances: ' + inst.length);
    var c2 = f.entities[inst[1].ents[0]];
    near(c2.cx, 30, 1e-6, 'second at its click'); near(c2.cy, 20, 1e-6, 'y');
    // drag the cross line of the second instance by its middle: the circle and the insertion point follow
    UI.setTool('select');
    var L2 = f.entities[inst[1].ents[1]], from = [(L2.x1 + L2.x2) / 2 + 2, L2.y1], to = [from[0] + 5, from[1] + 3];
    rfATEv('mousemove', from); rfATEv('mousedown', from, $('viewport'));
    for (var k = 1; k <= 6; k++) { rfATEv('mousemove', [from[0] + 5 * k / 6, from[1] + 3 * k / 6]); await wait(15); }
    rfATEv('mouseup', to); await idle(); await wait(20);
    inst = K.blockInstances(f);
    var c2b = f.entities[inst[1].ents[0]], L2b = f.entities[inst[1].ents[1]];
    assert(Math.abs(c2b.cx - 30) > 1 && Math.abs(c2b.cx - inst[1].x) < 1e-6 && Math.abs(c2b.cy - inst[1].y) < 1e-6, 'circle followed the drag: ' + JSON.stringify(c2b) + ' ins ' + inst[1].x + ',' + inst[1].y);
    near(Math.hypot(L2b.x2 - L2b.x1, L2b.y2 - L2b.y1), 8, 1e-6, 'the line kept its length');
    near((L2b.y1 + L2b.y2) / 2, c2b.cy, 1e-6, 'and its place across the hole');
    // Block properties: select the third instance, Angle 90
    UI.setSelection([{ kind: 'entity', index: inst[2].ents[1] }]);
    UI.cmdInsertBlock(); await idle();
    assert(/^Block: Punch/.test(UI.pmTitle()), 'Block properties PM: ' + UI.pmTitle());
    rfATSet('ang', 90); await idle();
    await UI.pmOK(); await idle();
    var L3 = f.entities[K.blockInstances(f)[2].ents[1]];
    near(L3.x1, L3.x2, 1e-6, 'the third instance turned 90°');
    // Edit Block on the first instance: a line drawn meanwhile joins the block, every instance gets it
    UI.setSelection([{ kind: 'entity', index: K.blockInstances(f)[0].ents[0] }]);
    UI.cmdEditBlock(); await idle();
    assert(UI.blockEditing() && UI.blockEditing().name === 'Punch', 'editing');
    UI.setTool('line'); rfATClick([10, 6]); rfATClick([10, 14]); rfATKey('Escape'); rfATKey('Escape'); await idle();
    UI.setTool('select');
    UI.cmdEditBlock(); await idle();
    assert(!UI.blockEditing(), 'edit finished');
    inst = K.blockInstances(f);
    assert(f.blocks.Punch.ents.length === 3 && inst.length === 3 && inst.every(function (q) { return q.ents.length === 3; }), 'every instance has the new line: ' + JSON.stringify(inst.map(function (q) { return q.ents.length; })));
    // a saved block loads into this sketch under its own name
    var saved = K.blockFile(f, 'Punch'), imp = UI.importBlockText(saved, 'Louver');
    assert(imp.ok && f.blocks.Louver, 'Louver loaded');
    // the script round trip keeps blocks and instances
    var src = K.generateScript(UI.App.model);
    assert(/\.blocks\(/.test(src), 'script writes the blocks');
    var m2 = K.newModel('rt'); K.runScript(m2, src);
    var f2 = m2.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(JSON.stringify(K.blockInstances(f2)) === JSON.stringify(K.blockInstances(f)), 'instances after the script');
    // Explode the second instance: ordinary geometry, one undo step, undo brings the instance back
    var u1 = UI.App.undo.length;
    UI.setSelection([{ kind: 'entity', index: inst[1].ents[0] }]);
    UI.cmdExplodeBlock(); await idle();
    assert(K.blockInstances(UI.activeSketchFeature()).length === 2 && UI.App.undo.length === u1 + 1, 'exploded');
    UI.undo(); await idle();
    assert(K.blockInstances(UI.activeSketchFeature()).length === 3, 'undo: three instances again');
    await UI.exitSketch(); await idle();
    var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(sk.blocks && K.blockInstances(sk).length === 3, 'kept after leaving the sketch');
    // (rfAU: the block once, three INSERTs; opts.explode writes the three circles)
    var dxf = K.exportDXFSketch(sk, 'mm'), dxfX = K.exportDXFSketch(sk, 'mm', { explode: true });
    assert((dxf.match(/\nCIRCLE\r?\n/g) || []).length === 1 && (dxf.match(/\nINSERT\r?\n/g) || []).length === 3, 'DXF: one block, three INSERTs');
    assert((dxfX.match(/\nCIRCLE\r?\n/g) || []).length === 3 && !/\nINSERT\r?\n/.test(dxfX), 'DXF exploded: three circles');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return inst.length + ' instances';
  });
  // --- end rfAT ---
