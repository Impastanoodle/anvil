  // ---- rfLC (lane sketchref): sketch geometry that references the model follows the model, as in SolidWorks. By
  // mouse: a hole on an Edge Flange dimensioned to the flange's free and side edges stays .5 / .75 from them when the
  // flange is made longer; Convert Entities of a face + Offset .25 + a .1 pocket follows the block; a line drawn from a
  // model corner to an edge's midpoint gets Coincident / Midpoint to them and follows; a reference whose feature is
  // deleted is Dangling (tree warning, Display/Delete Relations) and Replace re-attaches it
  function rfLCScr3(p) { var s = UI.worldToScreen(p), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + s[0]), Math.round(r.top + s[1])]; }
  function rfLCScr(uv) { return rfLCScr3(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfLCEv(type, c, mods) {
    (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }, mods || {})));
  }
  async function rfLCClickAt(c) { rfLCEv('mousemove', c); await wait(15); rfLCEv('mousedown', c); rfLCEv('mouseup', c); await wait(25); }
  async function rfLCClick(uv) { await rfLCClickAt(rfLCScr(uv)); }
  function rfLCFace(n) {
    var best = -1;
    UI.App.mesh.faces.forEach(function (f, i) { if (K.vec.dot(f.normal, n) > 1 - 1e-6 && (best < 0 || f.area > UI.App.mesh.faces[best].area)) best = i; });
    assert(best >= 0, 'no face with normal ' + n);
    return best;
  }
  function rfLCEdge(test) { var e = UI.App.edges.filter(function (x) { return test(x.a, x.b); })[0]; assert(e, 'edge not found'); return e; }
  function rfLCNearRel(a, b, tol, label) { near(a, b, tol * Math.max(1, Math.abs(b)), label); }
  function rfLCEq(p, q) { return Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6 && Math.abs(p[2] - q[2]) < 1e-6; }
  async function rfLCSketchOn(n, view) {
    if (view) { UI.setView(view, false); if (UI.finishViewAnimation) UI.finishViewAnimation(); }
    UI.App.sel = { kind: 'face', index: rfLCFace(n) };
    UI.cmdSketch(); await idle(); await wait(40);
    assert(UI.App.mode === 'sketch', 'sketch on the face');
    UI.zoomToFit(); await wait(40);
    return UI.activeSketchFeature();
  }
  // Smart Dimension from the circle at uv (radius r, its rim clicked at the right) to the model edge e, label at lab;
  // the Modify box takes value
  async function rfLCDimToEdge(f, cuv, r, e, lab, value) {
    UI.setTool('dimension'); await wait(20);
    await rfLCClick([cuv[0] + r, cuv[1]]);
    await rfLCClickAt(rfLCScr3(K.vec.scale(K.vec.add(e.a, e.b), 0.5)));
    await rfLCClick(lab); await wait(40);
    assert(UI.isDimEditOpen(), 'Modify box open: ' + statusText());
    var box = $('dim-edit').querySelector('input');
    setInput(box, value); pressEnter(box); await wait(40);
  }
  function rfLCCut(f, opts) {
    var m = UI.App.model, c = { type: 'extrude', sketch: f.id, depth: 0, end: 'through', cut: true, name: 'Cut-Extrude' + m.nextId, id: m.nextId++ };
    Object.keys(opts || {}).forEach(function (k) { c[k] = opts[k]; });
    m.features.push(c);
    return c;
  }

  step('rfLC: a Ø.25 hole on an Edge Flange dimensioned by mouse .5 from the flange\'s free edge and .75 from its side edge stays .5 / .75 from them when the flange goes from 1.5 to 2.5 long, folded and in the flat (it stayed where it was)', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1.5, [[0, 0.06, 1.5]]);'); await idle();
    var f = await rfLCSketchOn([-1, 0, 0], 'Left'), pl = UI.activePlane();
    var free = rfLCEdge(function (a, b) { return Math.abs(a[0] + 0.12) < 1e-6 && Math.abs(b[0] + 0.12) < 1e-6 && Math.abs(a[1] - 1.62) < 1e-6 && Math.abs(b[1] - 1.62) < 1e-6; });
    var side = rfLCEdge(function (a, b) { return Math.abs(a[0] + 0.12) < 1e-6 && Math.abs(b[0] + 0.12) < 1e-6 && Math.abs(a[2]) < 1e-6 && Math.abs(b[2]) < 1e-6 && Math.abs(a[1] - b[1]) > 0.5; });
    var c = K.to2D(pl, [-0.12, 1.0, 0.9]), o = K.to2D(pl, [-0.12, 1.0, 1.05]);
    UI.setTool('circle'); await wait(20);
    await rfLCClick(c); await rfLCClick(o); await wait(30);
    UI.setTool('select'); await wait(20);
    var hi = f.entities.length - 1;
    assert(f.entities[hi] && f.entities[hi].t === 'circle', 'circle drawn: ' + JSON.stringify(f.entities));
    var lab = K.to2D(pl, [-0.12, 1.4, 0.4]);
    await rfLCDimToEdge(f, [f.entities[hi].cx, f.entities[hi].cy], f.entities[hi].r, free, lab, '.5');
    await rfLCDimToEdge(f, [f.entities[hi].cx, f.entities[hi].cy], f.entities[hi].r, side, K.to2D(pl, [-0.12, 0.6, 0.3]), '.75');
    UI.setTool('dimension'); await wait(20);
    await rfLCClick([f.entities[hi].cx + f.entities[hi].r, f.entities[hi].cy]); await rfLCClick(K.to2D(pl, [-0.12, 0.7, 1.6])); await wait(40);
    var box = $('dim-edit').querySelector('input'); setInput(box, '.25'); pressEnter(box); await wait(40);
    UI.setTool('select');
    f = UI.activeSketchFeature();
    var named = f.rels.filter(function (r) { return r.type === 'fix' && r.mref && r.mref.k === 'edge'; });
    assert(named.length === 2, 'both edges came in named to the model: ' + JSON.stringify(f.rels));
    var h = f.entities[hi], c3 = K.to3D(pl, h.cx, h.cy);
    near(c3[1], 1.12, 1e-6, 'hole .5 below the free edge'); near(c3[2], 0.75, 1e-6, '.75 from the side'); near(h.r, 0.125, 1e-9, 'Ø.25');
    UI.exitSketch(); await idle();
    rfLCCut(f); await UI.rebuild(); await idle();
    var fl = UI.App.model.features.filter(function (x) { return x.type === 'flange'; })[0];
    fl.length = 2.5; await UI.rebuild(); await idle();
    var sk = K.findFeature(UI.App.model, f.id), e = sk.entities[hi], c4 = K.to3D(K.resolvePlane(sk.plane, UI.App.model, UI.App.build.planes), e.cx, e.cy);
    assert(!Object.keys(UI.App.build.errors).length && !UI.App.build.warnings[sk.id], JSON.stringify([UI.App.build.errors, UI.App.build.warnings]));
    near(c4[1], 2.12, 1e-6, 'hole .5 below the new free edge'); near(c4[2], 0.75, 1e-6, 'still .75 from the side');
    var fp = K.flatPattern(UI.App.model, UI.App.build, UI.App.mesh), outer = fp.loops[0].pts || fp.loops[0], hole = fp.loops[1].pts || fp.loops[1];
    var lo = Math.min.apply(null, outer.map(function (q) { return q[0]; })), hx = hole.map(function (q) { return q[0]; });
    near((Math.min.apply(null, hx) + Math.max.apply(null, hx)) / 2 - lo, 0.5, 2e-3, 'flat: hole .5 from the flange end');
    return 'hole y ' + c4[1].toFixed(4);
  });

  step('rfLC: Convert Entities of the top face by mouse, Offset .25 inward (base geometry construction), Cut-Extrude .1: the pocket follows the block from 4 x 3 to 5 x 3 (it stayed 3.5 x 2.5)', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);'); await idle();
    var f = await rfLCSketchOn([0, 1, 0], 'Top');
    UI.cmdConvertEntities(); await wait(30);
    await rfLCClickAt(rfLCScr3([2, 0.5, 1.5])); await wait(30);
    await UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    var conv = f.rels.filter(function (r) { return r.type === 'onEdge' && r.mref; });
    assert(conv.length === 4, 'four edges On Edge, named: ' + JSON.stringify(f.rels));
    UI.setSelection([0, 1, 2, 3].map(function (i) { return { kind: 'entity', index: i }; }));
    UI.cmdOffsetEntities(); await wait(40);
    setInput(pmField('Offset distance'), '.25'); await wait(20);
    pmField('Base geometry').click(); await wait(20);   // the converted outline becomes construction: the pocket is the offset loop
    var pl = UI.activePlane(), inside = function () { return (UI.App.tempEntities || []).every(function (e) { var q = K.to3D(pl, e.x1, e.y1); return q[0] > 0.1 && q[0] < 3.9; }); };
    if (!inside()) { pmField('Reverse').click(); await wait(30); }
    assert(inside(), 'offset inward');
    await UI.pmOK(); await idle();
    UI.exitSketch(); await idle();
    rfLCCut(UI.App.model.features.filter(function (x) { return x.id === f.id; })[0], { depth: 0.1, end: 'blind' }); await UI.rebuild(); await idle();
    rfLCNearRel(anvil.mass().volume, 6 - 3.5 * 2.5 * 0.1, 1e-6, 'pocket 3.5 x 2.5');
    UI.App.model.features[0].entities[0].w = 5; await UI.rebuild(); await idle();
    rfLCNearRel(anvil.mass().volume, 7.5 - 4.5 * 2.5 * 0.1, 1e-6, 'pocket 4.5 x 2.5');
    return 'volume ' + anvil.mass().volume.toFixed(5);
  });

  step('rfLC: a line drawn by mouse from a model corner (Vertex snap) to an edge\'s midpoint (Midpoint snap) gets Coincident / Midpoint to them and follows the block when it is made 5 wide', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);'); await idle();
    var f = await rfLCSketchOn([0, 1, 0], 'Top'), pl = UI.activePlane();
    UI.setTool('line'); await wait(20);
    await rfLCClickAt(rfLCScr3([4, 0.5, 3])); await rfLCClickAt(rfLCScr3([2, 0.5, 0])); await wait(20);
    UI.setTool('select'); await wait(30);
    f = UI.activeSketchFeature();
    var li = f.entities.map(function (e) { return e.t === 'line' && !e.construction; }).indexOf(true);
    assert(li >= 0, 'line drawn: ' + JSON.stringify(f.entities));
    var types = f.rels.map(function (r) { return r.type; }).sort().join();
    assert(f.rels.some(function (r) { return r.type === 'coincident' && r.refs.some(function (x) { return x.indexOf(li + '.') === 0; }); }) && f.rels.some(function (r) { return r.type === 'midpoint'; }), 'Coincident and Midpoint: ' + types);
    assert(f.rels.filter(function (r) { return r.mref; }).length === 2, 'two named references: ' + JSON.stringify(f.rels));
    UI.exitSketch(); await idle();
    UI.App.model.features[0].entities[0].w = 5; await UI.rebuild(); await idle();
    var sk = K.findFeature(UI.App.model, f.id), L = sk.entities[li], a = K.to3D(pl, L.x1, L.y1), b = K.to3D(pl, L.x2, L.y2);
    near(a[0], 5, 1e-6, 'start on the moved corner'); near(a[2], 3, 1e-6, 'corner z');
    near(b[0], 2.5, 1e-6, 'end at the new midpoint'); near(b[2], 0, 1e-6, 'midpoint z');
    return types;
  });

  step('rfLC: the feature that made a referenced edge deleted: the sketch builds with a Dangling warning, Display/Delete Relations lists it Dangling, and Replace onto another model edge re-attaches it', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);\np.sketch("Top").rect(3, -1, 1, 1).cut("through");'); await idle();
    var f = await rfLCSketchOn([0, 1, 0], 'Top'), pl = UI.activePlane();
    var notch = rfLCEdge(function (a, b) { return Math.abs(a[0] - 3) < 1e-6 && Math.abs(b[0] - 3) < 1e-6 && Math.abs(a[1] - 0.5) < 1e-6 && Math.abs(b[1] - 0.5) < 1e-6; });
    var c = K.to2D(pl, [2, 0.5, 0.5]), o = K.to2D(pl, [2.125, 0.5, 0.5]);
    UI.setTool('circle'); await wait(20);
    await rfLCClick(c); await rfLCClick(o); await wait(30);
    UI.setTool('select');
    f = UI.activeSketchFeature();
    var hi = f.entities.length - 1;
    await rfLCDimToEdge(f, [f.entities[hi].cx, f.entities[hi].cy], f.entities[hi].r, notch, K.to2D(pl, [2.5, 0.5, 1.6]), '1');
    UI.setTool('select');
    UI.exitSketch(); await idle();
    rfLCCut(f); await UI.rebuild(); await idle();
    var m = UI.App.model;
    m.features = m.features.filter(function (x) { return x.id !== 3 && x.id !== 4; });
    await UI.rebuild(); await idle();
    var w = UI.App.build.warnings[f.id] || '';
    assert(/^Dangling/.test(w) && !Object.keys(UI.App.build.errors).length, 'Dangling warning, no errors: ' + JSON.stringify([w, UI.App.build.errors]));
    var sk = K.findFeature(m, f.id), di = sk.rels.map(function (r) { return !!r.dangling; }).indexOf(true);
    assert(di >= 0, 'rel.dangling');
    near(K.to3D(pl, sk.entities[hi].cx, sk.entities[hi].cy)[0], 2, 1e-6, 'the hole stays');
    UI.enterSketch(f.id); await idle(); await wait(40);
    UI.cmdDisplayRelations('dangling'); await wait(40);
    var rows = D.querySelectorAll('#rel-display .rel-row.invalid');
    assert(rows.length === 1 && /Dangling/.test(rows[0].textContent), 'listed Dangling: ' + ($('rel-display') && $('rel-display').textContent));
    UI.App.sel = { kind: 'rel', index: di };
    var rep = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent.trim() === 'Replace'; })[0];
    assert(rep, 'Replace button');
    rep.click(); await wait(30);
    var other = rfLCEdge(function (a, b) { return Math.abs(a[0] - 4) < 1e-6 && Math.abs(b[0] - 4) < 1e-6 && Math.abs(a[1] - 0.5) < 1e-6 && Math.abs(b[1] - 0.5) < 1e-6; });
    await rfLCClickAt(rfLCScr3(K.vec.scale(K.vec.add(other.a, other.b), 0.5))); await idle(); await wait(40);
    sk = UI.activeSketchFeature();
    assert(!sk.rels[di].dangling && sk.rels[di].mref, 'attached again: ' + JSON.stringify(sk.rels[di]));
    near(K.to3D(UI.activePlane(), sk.entities[hi].cx, sk.entities[hi].cy)[0], 3, 1e-6, 'the hole now 1 from the x = 4 edge');
    UI.pmCancel && UI.pmCancel();
    UI.exitSketch(); await idle();
    assert(!UI.App.build.warnings[f.id], 'warning gone: ' + UI.App.build.warnings[f.id]);
    return w.slice(0, 60);
  });
  // --- end rfLC ---
