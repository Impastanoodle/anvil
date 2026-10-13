  // ---- rfAU (2026-10-13): blocks as rigid groups in the solver; DXF BLOCK / INSERT out and back in
  async function rfAUNew(ents) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.25 / UI.cam.scale);   // 0.25 units per pixel
    var f = UI.activeSketchFeature();
    (ents || []).forEach(function (e) { f.entities.push(e); });
    UI.App.gridStale = true; UI.updateSketches(); await wait(20);
    return f;
  }
  function rfAUScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfAUEv(type, uv, target) {
    var r = $('viewport').getBoundingClientRect(), p = rfAUScr(uv);
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' || type === 'mousemove' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfAUClick(uv) { rfAUEv('mousemove', uv); rfAUEv('mousedown', uv, $('viewport')); rfAUEv('mouseup', uv); }
  function rfAUSet(key, val) { var i = D.querySelector('#pm [data-key="' + key + '"]'); assert(i, 'field ' + key); i.value = String(val); i.dispatchEvent(new W.Event('input', { bubbles: true })); i.dispatchEvent(new W.Event('change', { bubbles: true })); }
  function rfAUStatus() { return $('status-right').textContent; }
  // Add Relations on one entity picked in the graphics area at uv, then the relation's button
  async function rfAURelate(uv, label) {
    UI.App.sel = null; UI.setSelection([]);
    UI.cmdAddRelations(); await wait(10);
    var p = rfAUScr(uv);
    UI.App.command.onSketchPoint(null, p[0], p[1]); await wait(10);
    var offered = Array.prototype.map.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent.trim(); });
    assert(offered.indexOf(label) >= 0, label + ' offered for the pick ' + JSON.stringify(UI.App.relPick) + ': ' + offered.join(', '));
    clickPmButton(label); await idle();
    await UI.pmOK(); await idle();
  }
  // the instance's shape is its definition's: circle on the insertion point, the two lines across it, lengths kept
  function rfAURigid(f, q, s) {
    var C = f.entities[q.ents[0]], A = f.entities[q.ents[1]], B = f.entities[q.ents[2]];
    near(C.cx, q.x, 1e-6, 'circle on the insertion point x'); near(C.cy, q.y, 1e-6, 'y'); near(C.r, 2 * s, 1e-9, 'radius');
    near(Math.hypot(A.x2 - A.x1, A.y2 - A.y1), 24 * s, 1e-6, 'line A length'); near(Math.hypot(B.x2 - B.x1, B.y2 - B.y1), 24 * s, 1e-6, 'line B length');
    near((A.x2 - A.x1) * (B.x2 - B.x1) + (A.y2 - A.y1) * (B.y2 - B.y1), 0, 1e-6, 'the lines square');
    near((A.x1 + A.x2) / 2, q.x, 1e-6, 'line A across the centre');
  }
  step('rfAU: Blocks are rigid in the solver — two instances are 6 DOF (Under Defined); Horizontal on the turned one\'s line turns the whole instance; Horizontal on its upright line over-defines (conflict, Over Defined); a drag moves an instance as one piece; Edit Block frees it meanwhile', async function () {
    var errs0 = errors.length;
    var f = await rfAUNew([{ t: 'circle', cx: 10, cy: 10, r: 2 }, { t: 'line', x1: -2, y1: 10, x2: 22, y2: 10 }, { t: 'line', x1: 10, y1: -2, x2: 10, y2: 22 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 1 }, { kind: 'entity', index: 2 }]);
    UI.cmdMakeBlock(); await idle();
    rfAUClick([10, 10]); rfAUSet('name', 'Cross');
    await UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    UI.setSelection([]); UI.App.sel = null;
    UI.cmdInsertBlock(); await idle();
    assert(UI.pmTitle() === 'Insert Block', 'Insert Block PM');
    rfAUSet('ang', 30);
    rfAUClick([50, 30]);
    await UI.pmOK(); await idle();
    var I = K.blockInstances(f);
    assert(I.length === 2 && I[1].ang === 30, 'two instances, the second turned 30°: ' + JSON.stringify(I));
    var st = UI.sketchStatus();
    assert(st.dof === 6 && st.status === 'under' && /Under Defined/.test(rfAUStatus()), 'two instances, 6 DOF: ' + JSON.stringify([st.dof, st.status, rfAUStatus()]));
    // Horizontal on the turned instance's first line (picked at a point on it): the instance turns level as one piece
    var L = f.entities[I[1].ents[1]], onL = [L.x1 * 0.2 + L.x2 * 0.8, L.y1 * 0.2 + L.y2 * 0.8];
    await rfAURelate(onL, 'Horizontal');
    I = K.blockInstances(f); L = f.entities[I[1].ents[1]];
    near(L.y1, L.y2, 1e-6, 'line level'); rfAURigid(f, I[1], 1);
    st = UI.sketchStatus();
    assert(st.dof === 5 && st.status === 'under', 'one DOF less: ' + st.dof);
    // Horizontal on its upright line would bend the block: a conflict, Over Defined
    var V = f.entities[I[1].ents[2]], onV = [V.x1 * 0.2 + V.x2 * 0.8, V.y1 * 0.2 + V.y2 * 0.8], n0 = (f.rels || []).length;
    await rfAURelate(onV, 'Horizontal');
    st = UI.sketchStatus();
    assert(f.rels.length === n0 + 1 && st.status === 'over' && st.rels[n0] === 'conflict' && /Over Defined/.test(rfAUStatus()), 'over-defining: ' + JSON.stringify([st.status, st.rels, rfAUStatus()]));
    I = K.blockInstances(f); rfAURigid(f, I[1], 1);
    W.SketchSolver.deleteRelation(f, n0); W.SketchSolver.solve(f); UI.updateSketches(); await idle();
    assert(UI.sketchStatus().status === 'under', 'relation deleted: under defined again');
    // drag the first instance by its upright line (away from the centre): the whole instance follows, square and whole
    UI.setTool('select');
    var q0 = I[0], from = [q0.x, q0.y + 7], to = [from[0] + 5, from[1] + 3];
    rfAUEv('mousemove', from); rfAUEv('mousedown', from, $('viewport'));
    for (var k = 1; k <= 6; k++) { rfAUEv('mousemove', [from[0] + 5 * k / 6, from[1] + 3 * k / 6]); await wait(15); }
    rfAUEv('mouseup', to); await idle(); await wait(20);
    I = K.blockInstances(f);
    assert(Math.abs(I[0].x - q0.x - 5) < 0.5 && Math.abs(I[0].y - q0.y - 3) < 0.5 && Math.abs(I[0].ang) < 0.01, 'the instance moved with the drag: ' + JSON.stringify(I[0]));
    rfAURigid(f, I[0], 1);
    // Edit Block: the edited instance is ordinary geometry meanwhile (its 3 entities' own 11 DOF + its point's 2)
    var dof0 = UI.sketchStatus().dof;
    UI.setSelection([{ kind: 'entity', index: I[0].ents[0] }]);
    UI.cmdEditBlock(); await idle();
    assert(UI.blockEditing(), 'editing');
    assert(UI.sketchStatus().dof === dof0 - 3 + 13, 'editing frees the instance: ' + UI.sketchStatus().dof + ' (was ' + dof0 + ')');
    UI.cmdEditBlock(); await idle();
    // (rfAZ: saving the edit places every instance of the block again and the Horizontal on the other instance stays)
    assert(!UI.blockEditing() && UI.sketchStatus().dof === 5 && K.blockInstances(f).length === 2 && (f.rels || []).some(function (q) { return q.type === 'horizontal'; }), 'rigid again, the Horizontal kept: ' + UI.sketchStatus().dof + ' ' + JSON.stringify(f.rels));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'DOF ' + dof0;
  });
  step('rfAU: sketch DXF R12 and R2000 write the block once and each instance as an INSERT; read back with dxf-import\'s blocks option into a new sketch they are rigid instances again (6 DOF) and Insert Block lists the imported block', async function () {
    var errs0 = errors.length;
    var f = await rfAUNew([{ t: 'circle', cx: 10, cy: 10, r: 2 }, { t: 'line', x1: -2, y1: 10, x2: 22, y2: 10 }, { t: 'line', x1: 10, y1: -2, x2: 10, y2: 22 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 1 }, { kind: 'entity', index: 2 }]);
    UI.cmdMakeBlock(); await idle();
    rfAUClick([10, 10]); rfAUSet('name', 'Cross');
    await UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    UI.setSelection([]); UI.App.sel = null;
    UI.cmdInsertBlock(); await idle();
    rfAUSet('ang', 45); rfAUSet('s', 1.5);
    rfAUClick([50, 30]);
    await UI.pmOK(); await idle();
    var A = K.blockInstances(f), out = {};
    ['R12', 'R2000'].forEach(function (v) {
      var dxf = K.exportDXFSketch(f, 'mm', { version: v });
      assert((dxf.match(/\nINSERT\r?\n/g) || []).length === 2 && (dxf.match(/\nCIRCLE\r?\n/g) || []).length === 1 && /\nBLOCK\r?\n/.test(dxf), v + ': one block, two INSERTs');
      var r = W.DxfImport.parse(dxf, { blocks: true }), B = K.blockInstances({ entities: r.entities });
      assert(B.length === 2 && B.every(function (q, i) { return Math.abs(q.x - A[i].x) < 1e-9 && Math.abs(q.y - A[i].y) < 1e-9 && Math.abs(q.ang - A[i].ang) < 1e-9 && Math.abs(q.s - A[i].s) < 1e-12; }), v + ' read back: ' + JSON.stringify(B));
      out[v] = r;
    });
    await UI.exitSketch(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    var g = UI.activeSketchFeature();
    out.R2000.entities.forEach(function (e) { delete e.layer; g.entities.push(e); });
    UI.App.gridStale = true; UI.updateSketches(); await idle();
    var st = UI.sketchStatus();
    assert(st.dof === 6 && st.status === 'under', 'imported instances are rigid: ' + JSON.stringify([st.dof, st.status]));
    UI.setSelection([]); UI.App.sel = null;
    UI.cmdInsertBlock(); await idle();
    var opts = Array.prototype.map.call(D.querySelectorAll('#pm [data-key="block"] option'), function (o) { return o.value; });
    assert(opts.indexOf('CROSS') >= 0 && g.blocks && g.blocks.CROSS && g.blocks.CROSS.ents.length === 3, 'the imported block is listed: ' + opts.join());
    UI.pmCancel(); await idle();
    rfAURigid(g, K.blockInstances(g)[1], 1.5);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return '2 INSERTs each way';
  });
  // --- end rfAU ---
