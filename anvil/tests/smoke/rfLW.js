  // ---- rfLW (lane sketchref2): sketch references to the model, the rest. By mouse: a line drawn from a model vertex
  // gets one Coincident to the vertex itself (no reference entity, as SolidWorks 2024); the notch moves: the end
  // follows; the notch deleted: Dangling with a red handle; the handle dragged onto another model vertex: attached
  // again. Offset Entities of the face outline (nothing selected, Base geometry off) + Cut .1: the pocket follows.
  function rfLWScr3(p) { var s = UI.worldToScreen(p), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + s[0]), Math.round(r.top + s[1])]; }
  function rfLWEv(type, c) {
    (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }));
  }
  async function rfLWClickAt(c) { rfLWEv('mousemove', c); await wait(15); rfLWEv('mousedown', c); rfLWEv('mouseup', c); await wait(25); }
  async function rfLWSketchOnTop() {
    UI.setView('Top', false); if (UI.finishViewAnimation) UI.finishViewAnimation();
    var best = -1;
    UI.App.mesh.faces.forEach(function (f, i) { if (K.vec.dot(f.normal, [0, 1, 0]) > 1 - 1e-6 && (best < 0 || f.area > UI.App.mesh.faces[best].area)) best = i; });
    assert(best >= 0, 'top face');
    UI.App.sel = { kind: 'face', index: best };
    UI.cmdSketch(); await idle(); await wait(40);
    assert(UI.App.mode === 'sketch', 'sketch on the top face');
    UI.zoomToFit(); await wait(40);
    return UI.activeSketchFeature();
  }

  step('rfLW: a line drawn by mouse from a model vertex gets one Coincident to the vertex itself (no extra entity); it follows the notch; the notch deleted it is Dangling with a red handle, and the handle dragged onto the block\'s corner attaches it there', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);\np.sketch("Top").rect(3, -1, 1, 1).cut("through");'); await idle();
    var f = await rfLWSketchOnTop(), pl = UI.activePlane(), n0 = f.entities.length, r0 = (f.rels || []).length;
    UI.setTool('line'); await wait(20);
    await rfLWClickAt(rfLWScr3([3, 0.5, 1])); await rfLWClickAt(rfLWScr3([1, 0.5, 2.1])); await wait(20);
    UI.setTool('select'); await wait(30);
    f = UI.activeSketchFeature();
    assert(f.entities.length === n0 + 1 && f.entities[n0].t === 'line', 'one line, no reference entity: ' + JSON.stringify(f.entities));
    var added = (f.rels || []).slice(r0), mr = added.filter(function (r) { return r.mref; });
    assert(mr.length === 1 && mr[0].type === 'coincident' && mr[0].refs.join() === n0 + '.p1,M' && mr[0].mref.k === 'vertex' && W.SketchSolver.isExtRel(mr[0]), 'one Coincident to the vertex: ' + JSON.stringify(added));
    var p = K.to3D(pl, f.entities[n0].x1, f.entities[n0].y1);
    near(p[0], 3, 1e-6, 'on the notch corner x'); near(p[2], 1, 1e-6, 'z');
    UI.cmdDisplayRelations('external'); await wait(40);
    var rows = D.querySelectorAll('#rel-display .rel-row');
    assert(rows.length === 1 && /Coincident: Line\d+ start, Vertex<1>/.test(rows[0].textContent) && rows[0].querySelector('.ext-mark'), 'External lists it with the mark: ' + ($('rel-display') && $('rel-display').textContent));
    UI.pmCancel && UI.pmCancel(); await wait(20);
    UI.exitSketch(); await idle();
    var m = UI.App.model, cutSk = m.features.filter(function (x) { return x.type === 'sketch'; })[1];
    cutSk.entities[0].x = 2.5; cutSk.entities[0].w = 1.5;
    await UI.rebuild(); await idle();
    var sk = K.findFeature(m, f.id), q = K.to3D(pl, sk.entities[n0].x1, sk.entities[n0].y1);
    near(q[0], 2.5, 1e-6, 'follows the notch corner'); near(q[2], 1, 1e-6, 'z');
    m.features = m.features.filter(function (x) { return x.id !== cutSk.id && x.sketch !== cutSk.id; });
    await UI.rebuild(); await idle();
    var w = UI.App.build.warnings[f.id] || '';
    assert(/^Dangling: 1 sketch relation .*Coincident/.test(w), 'Dangling warning: ' + w);
    UI.enterSketch(f.id); await idle(); await wait(60);
    UI.drawDims(true);
    var hs = UI.danglingHandles();
    assert(hs.length === 1 && D.querySelectorAll('#dangle-layer circle.sk-dangle').length === 1, 'one red handle: ' + JSON.stringify(hs));
    UI.setTool('select'); await wait(20);
    var vr = $('viewport').getBoundingClientRect(), from = [Math.round(vr.left + hs[0].screen[0]), Math.round(vr.top + hs[0].screen[1])], to = rfLWScr3([4, 0.5, 3]);
    rfLWEv('mousemove', from); await wait(15);
    rfLWEv('mousedown', from); await wait(15);
    for (var k = 1; k <= 5; k++) { rfLWEv('mousemove', [Math.round(from[0] + (to[0] - from[0]) * k / 5), Math.round(from[1] + (to[1] - from[1]) * k / 5)]); await wait(15); }
    rfLWEv('mouseup', to); await idle(); await wait(40);
    sk = UI.activeSketchFeature();
    var rel = sk.rels.filter(function (r) { return r.mref && W.SketchSolver.isExtRel(r); })[0];
    assert(rel && !rel.dangling && rel.mref.k === 'vertex', 'attached again: ' + JSON.stringify(rel) + ' ' + statusText());
    var s3 = K.to3D(UI.activePlane(), sk.entities[n0].x1, sk.entities[n0].y1);
    near(s3[0], 4, 1e-6, 'the line now starts on the corner x'); near(s3[2], 3, 1e-6, 'z');
    assert(!UI.danglingHandles().length, 'no handle left');
    UI.exitSketch(); await idle();
    assert(!/Dangling/.test(UI.App.build.warnings[f.id] || ''), 'warning gone: ' + UI.App.build.warnings[f.id]);
    return w.slice(0, 70);
  });

  step('rfLW: Offset Entities with nothing selected on a face sketch (Base geometry off), .25 inward, Cut-Extrude .1: the pocket follows the block from 4 x 3 to 5 x 3', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);'); await idle();
    var f = await rfLWSketchOnTop(), pl = UI.activePlane();
    UI.App.sel = null; UI.App.sel2 = null;
    UI.cmdOffsetEntities(); await wait(40);
    setInput(pmField('Offset distance'), '.25'); await wait(30);
    assert(!pmField('Base geometry').checked, 'Base geometry off');
    var inside = function () { var t = UI.App.tempEntities || []; return t.length && t.every(function (e) { var xs = e.t === 'line' ? [e.x1, e.x2] : e.pts ? e.pts.map(function (q) { return q[0]; }) : [e.x1]; return xs.every(function (x) { var q = K.to3D(pl, x, 0); return q[0] > 0.1 && q[0] < 3.9; }); }); };
    if (!inside()) { pmField('Reverse').click(); await wait(30); }
    assert(inside(), 'offset inward: ' + JSON.stringify(UI.App.tempEntities));
    await UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    assert(f.rels.filter(function (r) { return r.type === 'onEdge' && r.mref; }).length === 4, 'the face edges On Edge, named: ' + JSON.stringify(f.rels));
    UI.exitSketch(); await idle();
    var m = UI.App.model;
    m.features.push({ type: 'extrude', sketch: f.id, depth: 0.1, end: 'blind', cut: true, name: 'Cut-Extrude' + m.nextId, id: m.nextId++ });
    await UI.rebuild(); await idle();
    near(anvil.mass().volume, 6 - 3.5 * 2.5 * 0.1, 1e-6, 'pocket 3.5 x 2.5');
    m.features[0].entities[0].w = 5; await UI.rebuild(); await idle();
    near(anvil.mass().volume, 7.5 - 4.5 * 2.5 * 0.1, 1e-6, 'pocket 4.5 x 2.5');
    return 'volume ' + anvil.mass().volume.toFixed(5);
  });
  step('rfLW: Intersection Curve of the block top face on the Right Plane is On Edge with a reference to that face: the block made 1 thick, the line moves up to it', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(-2, -3, 4, 3).extrude(0.5);'); await idle();
    await UI.newSketchOnPlane('Right'); await idle(); await wait(40);
    var f = UI.activeSketchFeature(), pl = UI.activePlane(), top = -1;
    UI.App.mesh.faces.forEach(function (fc, i) { if (K.vec.dot(fc.normal, [0, 1, 0]) > 1 - 1e-6) top = i; });
    UI.cmdIntersectionCurve([top]); await wait(30);
    await UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    var li = f.entities.map(function (e) { return e.t === 'line'; }).indexOf(true), rel = (f.rels || []).filter(function (r) { return r.type === 'onEdge' && r.refs[0] === String(li); })[0];
    assert(li >= 0 && rel && rel.mref && rel.mref.k === 'xsect' && rel.mref.form === 'line', 'On Edge named to the face: ' + JSON.stringify(f.rels));
    UI.exitSketch(); await idle();
    UI.App.model.features[1].depth = 1; await UI.rebuild(); await idle();
    var sk = K.findFeature(UI.App.model, f.id), L = sk.entities[li], a = K.to3D(pl, L.x1, L.y1), b = K.to3D(pl, L.x2, L.y2);
    near(a[1], 1, 1e-6, 'start up at y 1'); near(b[1], 1, 1e-6, 'end up at y 1'); near(Math.abs(a[2] - b[2]), 3, 1e-6, 'still 3 long');
    assert(!/Dangling/.test(UI.App.build.warnings[f.id] || ''), 'attached: ' + UI.App.build.warnings[f.id]);
    return 'ok';
  });
  // --- end rfLW ---
