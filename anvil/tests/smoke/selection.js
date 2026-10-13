  // ---- selection: Selection Filter (F5), box selection, FeatureManager sync, Instant3D (ui-select.js)
  // Real mouse events on the viewport: press on #viewport, moves and release on the window (as ui-sketch.js listens).
  function selEv(type, p, target, mods) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
  }
  async function selDrag(from, to, target, mods, during) {
    selEv('mousedown', from, target || $('viewport'), mods);
    for (var k = 1; k <= 6; k++) { selEv('mousemove', [from[0] + (to[0] - from[0]) * k / 6, from[1] + (to[1] - from[1]) * k / 6], null, mods); await wait(15); }
    if (during) during();
    selEv('mouseup', to, null, mods);
    await idle(); await wait(20);
  }
  function selClick(p, mods) { selEv('mousemove', p, null, mods); selEv('mousedown', p, $('viewport'), mods); selEv('mouseup', p, null, mods); }
  function selKinds() { return anvil.selection().map(function (s) { return s.kind; }).join(','); }
  function selKey(k) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  var BLOCK = 'p.sketch("Top").rect(-20, -10, 40, 20).extrude(10);';     // 40 × 20 × 10, x -20..20, y 0..10, z -10..10
  step('box selection: on a 40 × 20 × 10 block (Front view) a left-to-right window over the left half selects the 4 edges fully inside, right-to-left crossing 8; grey solid (rfBR) / green dashed box; Ctrl adds, Shift toggles', async function () {
    need(UI, 'boxSelectHook'); need(anvil, 'boxSelect'); assert(W.BoxSelect, 'BoxSelect missing');
    await anvil.newPart(); await idle();
    await anvil.run(BLOCK); await idle();
    anvil.selectionFilter({ faces: false, edges: false, vertices: false, bodies: false, components: false, sketch: false, suspended: false });
    UI.setView('Front');
    var tl = UI.worldToScreen([-20, 10, 0]), br = UI.worldToScreen([20, 0, 0]), mid = UI.worldToScreen([0, 5, 0]);
    var A = [tl[0] - 12, tl[1] - 12], B = [mid[0], br[1] + 12];
    var boxCls = null, boxStyle = null;
    await selDrag(A, B, null, null, function () { var b = $('sel-box'); boxCls = !b.hidden && b.className; boxStyle = W.getComputedStyle(b).borderTopStyle + ' ' + W.getComputedStyle(b).borderTopColor; });
    assert(boxCls === 'window' && /solid rgb\(208, 208, 208\)/.test(boxStyle), 'window box drawn grey solid (rfBR: no blue in the graphics area): ' + boxCls + ' ' + boxStyle);
    var win = anvil.selection();
    assert(win.length === 4 && win.every(function (s) { return s.kind === 'edge' && Math.abs(s.mid[0] + 20) < 1e-9; }), 'window: the 4 edges at x = -20 ' + JSON.stringify(win));
    assert($('sel-box').hidden, 'box hidden after release');
    await selDrag(B, A, null, null, function () { var b = $('sel-box'); boxCls = b.className; boxStyle = W.getComputedStyle(b).borderTopStyle + ' ' + W.getComputedStyle(b).borderTopColor; });
    assert(boxCls === 'crossing' && /dashed rgb\(31, 166, 83\)/.test(boxStyle), 'crossing box drawn green dashed: ' + boxCls + ' ' + boxStyle);
    var cr = anvil.selection();
    assert(cr.length === 8 && cr.every(function (s) { return s.kind === 'edge' && s.mid[0] < 1e-9; }), 'crossing: 8 edges touching the left half ' + cr.length);
    // a window over the right half with Ctrl adds its 4 edges; Shift + the same window toggles them off again
    var C = [mid[0] + 1, tl[1] - 12], Dd = [br[0] + 12, br[1] + 12];
    await selDrag(C, Dd, null, { ctrlKey: true });
    assert(anvil.selection().length === 12, 'Ctrl + window adds (12): ' + anvil.selection().length);
    await selDrag(C, Dd, null, { shiftKey: true });
    assert(anvil.selection().length === 8, 'Shift + window toggles the 4 off (8): ' + anvil.selection().length);
    // pressing on the model still rotates the view and keeps the selection
    var dir = [UI.cam.dir.x, UI.cam.dir.y, UI.cam.dir.z], on = UI.worldToScreen([0, 5, 10]);
    await selDrag(on, [on[0] + 40, on[1]]);
    assert(Math.abs(UI.cam.dir.x - dir[0]) > 1e-3 && anvil.selection().length === 8, 'a drag started on the block rotates');
    return 'window 4 edges, crossing 8, Ctrl +4, Shift −4';
  });
  step('box selection with the Selection Filter: Faces → window 1 face (the side seen edge-on) / crossing 5; Vertices → window 4; Solid Bodies → crossing 1, window none', async function () {
    UI.setView('Front');
    var tl = UI.worldToScreen([-20, 10, 0]), br = UI.worldToScreen([20, 0, 0]), mid = UI.worldToScreen([0, 5, 0]);
    var A = [tl[0] - 12, tl[1] - 12], B = [mid[0], br[1] + 12];
    anvil.selectionFilter({ faces: true });
    await selDrag(A, B);
    var fw = anvil.selection(), faces = anvil.faces();
    assert(fw.length === 1 && fw[0].kind === 'face' && faces[fw[0].index].normal[0] < -0.999, 'window: the x = -20 face ' + JSON.stringify(fw));
    await selDrag(B, A);
    var fc = anvil.selection();
    assert(fc.length === 5 && fc.every(function (s) { return s.kind === 'face' && faces[s.index].normal[0] < 0.5; }), 'crossing: 5 faces, not the x = +20 one ' + fc.length);
    anvil.selectionFilter({ faces: false, vertices: true });
    await selDrag(A, B);
    var vw = anvil.selection();
    assert(vw.length === 4 && vw.every(function (s) { return s.kind === 'vertex' && Math.abs(s.point[0] + 20) < 1e-9; }), 'vertices ' + JSON.stringify(vw));
    anvil.selectionFilter({ vertices: false, bodies: true });
    await selDrag(B, A);
    assert(selKinds() === 'body', 'crossing a body: ' + selKinds());
    await selDrag(A, B);
    assert(anvil.selection().length === 0, 'window over half the body selects nothing');
    anvil.selectionFilter({ bodies: false });
    return 'faces 1 / 5, vertices 4, bodies 1 / 0';
  });
  step('Selection Filter: F5 shows the toolbar, its buttons set the filter; clicks respect it (Faces: edge click → nothing on the silhouette, face; Edges: face click → nothing; Vertices + Ctrl → two vertices); Fillet PM ignores edges under a Faces filter; F6 suspends', async function () {
    selKey('F5');
    var bar = $('sel-filter');
    assert(!bar.hidden && bar.querySelectorAll('.sf-btn').length === 9, 'toolbar with 9 buttons');
    bar.querySelector('.sf-btn[data-filter="faces"]').click();
    assert(anvil.selectionFilter().faces && anvil.selectionFilter().active && bar.querySelector('.sf-btn[data-filter="faces"]').classList.contains('on'), 'Filter Faces pressed');
    UI.setView('Front');
    selClick(UI.worldToScreen([0, 5, 10]));
    assert(selKinds() === 'face', 'face click with Faces: ' + selKinds());
    var nearEdge = UI.worldToScreen([0, 10, 10]); nearEdge = [nearEdge[0], nearEdge[1] + 3];
    selClick(nearEdge);
    assert(selKinds() === 'face', 'next to an edge, Faces gives the face: ' + selKinds());
    bar.querySelector('.sf-btn[data-filter="faces"]').click(); bar.querySelector('.sf-btn[data-filter="edges"]').click();
    selClick(UI.worldToScreen([0, 5, 10]));
    assert(anvil.selection().length === 0, 'face click with Edges selects nothing');
    selClick(nearEdge);
    assert(selKinds() === 'edge', 'edge click with Edges: ' + selKinds());
    anvil.selectionFilter({ edges: false, vertices: true });
    var c1 = UI.worldToScreen([20, 10, 10]), c2 = UI.worldToScreen([-20, 0, 10]);
    selClick([c1[0] - 3, c1[1] + 2]); selClick([c2[0] + 2, c2[1] - 3], { ctrlKey: true });
    var vs = anvil.selection();
    assert(vs.length === 2 && vs[0].kind === 'vertex' && JSON.stringify(vs.map(function (v) { return v.point[0]; })) === '[20,-20]', 'two vertices ' + JSON.stringify(vs));
    selClick([c2[0] + 2, c2[1] - 3], { ctrlKey: true });
    assert(anvil.selection().length === 1, 'Ctrl-click toggles the second vertex off');
    // switching to Faces drops the vertices (not allowed any more)
    anvil.selectionFilter({ vertices: false, faces: true });
    assert(anvil.selection().length === 0, 'vertices dropped by the Faces filter');
    // the Fillet PropertyManager's edge box: nothing with Faces only, an edge with the filter cleared
    UI.setView('Isometric');
    UI.cmdFillet(); await wait(20);
    var e = UI.App.edges.filter(function (x) { return !x.smooth && x.faces.length === 2; })[0], em = UI.worldToScreen(e.mid);
    selClick(em);
    assert((UI.App.command.edgeList || []).length === 0, 'Fillet got an edge through a Faces filter');
    bar.querySelector('.sf-btn[data-filter="clear"]').click();
    assert(!anvil.selectionFilter().active, 'Clear All Filters');
    selClick(em);
    assert((UI.App.command.edgeList || []).length === 1, 'Fillet edge picked with the filter cleared');
    UI.pmCancel(); await idle();
    anvil.selectionFilter({ edges: true });
    selKey('F6');
    assert(anvil.selectionFilter().suspended && !anvil.selectionFilter().active && bar.classList.contains('suspended'), 'F6 suspends');
    selKey('F6');
    assert(anvil.selectionFilter().active, 'F6 resumes');
    anvil.selectionFilter({ edges: false });
    selKey('F5');
    assert(bar.hidden, 'F5 hides the toolbar');
    return 'faces / edges / vertices / PM respected';
  });
  step('Instant3D: selecting the top face of a Boss-Extrude shows the depth arrow; dragging it 10 → 30 snaps to the ruler (volume 40·20·30 = 24000), one undo step, the value box types 25 (20000) in the same step; Undo → 10 (8000)', async function () {
    need(anvil, 'instant3D');
    await anvil.newPart(); await idle();
    await anvil.run(BLOCK); await idle();
    UI.setView('Front');
    var top = anvil.faces().filter(function (f) { return f.normal[1] > 0.999; })[0];
    UI.setSelection([{ kind: 'face', index: top.index }]);
    var hs = anvil.instant3D().handles, h = hs.filter(function (x) { return x.kind === 'depth'; })[0];
    assert(h && h.value === 10 && D.querySelector('#i3d-layer .i3d-handle[data-kind="depth"]'), 'depth handle ' + JSON.stringify(hs));
    // r5/select5: handles drag freely; the pointer over the ruler snaps to the tick under it (30)
    var from = h.grab, to = UI.instant3DRulerPoint(UI.instant3DHandles().filter(function (x) { return x.kind === 'depth'; })[0], 30), undoN = UI.App.undo.length, ticks = 0;
    await selDrag(from, to, D.querySelector('#i3d-layer .i3d-handle[data-kind="depth"]'), null, function () { ticks = D.querySelectorAll('#i3d-layer .i3d-tick').length; });
    assert(ticks > 10, 'ruler ticks while dragging: ' + ticks);
    var ext = anvil.model().features[1];
    assert(ext.depth === 30, 'depth snapped to 30: ' + ext.depth);
    near(anvil.mass().volume, 24000, 1e-6, 'volume after the drag');
    assert(UI.App.undo.length === undoN + 1, 'one undo step (' + (UI.App.undo.length - undoN) + ')');
    var ed = UI.instant3DEditOpen();
    assert(ed && ed.kind === 'depth' && ed.value === 30 && !$('i3d-edit').hidden, 'value box opens on release ' + JSON.stringify(ed));
    assert(selKinds() === 'face' && anvil.faces()[anvil.selection()[0].index].normal[1] > 0.999, 'the end face is selected again');
    await UI.instant3DEdit('25'); await idle();
    assert(anvil.model().features[1].depth === 25 && UI.App.undo.length === undoN + 1, 'typed 25, still one undo step');
    near(anvil.mass().volume, 20000, 1e-6, 'volume after typing');
    await UI.undo(); await idle();
    assert(anvil.model().features[1].depth === 10, 'undo: depth 10');
    near(anvil.mass().volume, 8000, 1e-6, 'undo: volume');
    // the overlay redraws on the next animation frame; redraw it now so the check does not race a slower rebuild
    assert(UI.instant3DHandles().length === 0, 'no handles once the selection is gone');
    assert(!D.querySelector('#i3d-layer .i3d-handle'), 'no handle elements once the selection is gone');
    return 'drag 10 → 30, type 25, undo → 10';
  });
  step('Instant3D: a Cut-Extrude depth arrow and a Revolve angle arrow drag live (cut 4 → 6 down from the top: volume drops by 10·10·2; revolve 90° → 135°: volume × 1.5); Features ▸ Instant3D turns the handles off', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.box(40, 20, 20, { centered: true });\np.sketch("Top", 10).rect(-5, -5, 10, 10).cut(4, { reverse: true });'); await idle();
    UI.setView('Front');
    var v0 = anvil.mass().volume, cut = anvil.model().features.filter(function (f) { return f.cut; })[0];
    UI.setSelection([{ kind: 'feature', id: cut.id }]);
    var h = anvil.instant3D().handles.filter(function (x) { return x.kind === 'depth'; })[0];
    assert(h && h.value === 4, 'cut depth handle ' + JSON.stringify(anvil.instant3D().handles));
    // the cut floor moves down from y = 6 to y = 4 (r5/select5: onto the ruler's 6 tick)
    await selDrag(h.grab, UI.instant3DRulerPoint(UI.instant3DHandles().filter(function (x) { return x.kind === 'depth'; })[0], 6), D.querySelector('#i3d-layer .i3d-handle[data-kind="depth"]'));
    assert(K.findFeature(UI.App.model, cut.id).depth === 6, 'cut depth 6: ' + K.findFeature(UI.App.model, cut.id).depth);
    near(anvil.mass().volume, v0 - 10 * 10 * 2, 1e-6, 'volume after the cut drag');
    // Revolve: 90° of a 10 × 10 section at radius 10..20 about Y, seen from the Top
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front").rect(10, 0, 10, 10).revolve(90);'); await idle();
    UI.setView('Top');
    var rv = anvil.model().features[1], vol90 = anvil.mass().volume;
    UI.setSelection([{ kind: 'feature', id: rv.id }]);
    var ha = anvil.instant3D().handles.filter(function (x) { return x.kind === 'angle'; })[0];
    assert(ha && ha.value === 90 && (ha.step === 1 || ha.step === 5), 'angle handle ' + JSON.stringify(ha));
    var c = UI.worldToScreen([0, 0, 0]), R = Math.hypot(ha.at[0] - c[0], ha.at[1] - c[1]), a0 = Math.atan2(ha.at[1] - c[1], ha.at[0] - c[0]);
    // 45° further round the axis, whichever way the arc runs on screen: try the side the ruler continues on
    var cand = [a0 - Math.PI / 4, a0 + Math.PI / 4].map(function (t) { return [c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]; });
    cand[0] = UI.instant3DRulerPoint(UI.instant3DHandles().filter(function (x) { return x.kind === 'angle'; })[0], 135);   // r5/select5: onto the ruler's 135° tick
    await selDrag(ha.at, cand[0], D.querySelector('#i3d-layer .i3d-handle[data-kind="angle"]'));
    if (anvil.model().features[1].angle !== 135) { await UI.undo(); await idle(); UI.setSelection([{ kind: 'feature', id: rv.id }]); ha = anvil.instant3D().handles.filter(function (x) { return x.kind === 'angle'; })[0]; await selDrag(ha.at, cand[1], D.querySelector('#i3d-layer .i3d-handle[data-kind="angle"]')); }
    assert(anvil.model().features[1].angle === 135, 'angle 135: ' + anvil.model().features[1].angle);
    near(anvil.mass().volume / vol90, 1.5, 1e-9, 'volume ratio 135 / 90');
    var ed = UI.instant3DEditOpen();
    assert(ed && ed.kind === 'angle' && ed.value === 135, 'angle value box');
    await UI.instant3DEdit('180'); await idle();
    near(anvil.mass().volume / vol90, 2, 1e-9, 'typed 180°');
    await UI.undo(); await idle();
    assert(anvil.model().features[1].angle === 90, 'undo → 90 in one step');
    // Features ▸ Instant3D toggles
    UI.App.ribbonTab = 'Features'; UI.refreshRibbon();
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return x.getAttribute('aria-label') === 'Instant3D'; })[0];
    assert(btn && !btn.disabled && btn.classList.contains('active'), 'Instant3D button on');
    btn.click();
    UI.setSelection([{ kind: 'feature', id: rv.id }]);
    assert(!anvil.instant3D().on && !D.querySelector('#i3d-layer .i3d-handle'), 'off: no handles');
    btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return x.getAttribute('aria-label') === 'Instant3D'; })[0];
    btn.click();
    assert(anvil.instant3D().on && D.querySelector('#i3d-layer .i3d-handle'), 'back on');
    return 'cut 4 → 6, revolve 90° → 135° → 180° → undo';
  });
  step('Instant3D on sketch dimensions: in the part the feature\'s sketch width (40) drags to 50 (volume 50·20·10); in the sketch there is no Instant3D dot (rfBA) and Instant2D drags the rectangle height 20 → 25; each one undo step', async function () {
    var r12dims = UI.App.view.showDims; UI.App.view.showDims = true;   // r12/sketchui12: the driven values (View ▸ Sketch Dimensions) are off by default now
    await anvil.newPart(); await idle();
    await anvil.run(BLOCK); await idle();
    UI.setView('Isometric');
    var side = anvil.faces().filter(function (f) { return f.normal[2] > 0.999; })[0];
    UI.setSelection([{ kind: 'face', index: side.index }]);
    var hs = anvil.instant3D().handles, i = -1;
    hs.forEach(function (x, k) { if (x.kind === 'sdim' && x.value === 40) i = k; });
    assert(i >= 0 && !hs.some(function (x) { return x.kind === 'depth'; }), 'side face: sketch dims, no depth arrow ' + JSON.stringify(hs.map(function (x) { return x.kind + ' ' + x.value; })));
    assert(D.querySelectorAll('#i3d-layer .i3d-dim').length >= 1, 'dimensions drawn in the viewport');
    var a = UI.worldToScreen([0, 0, 0]), b = UI.worldToScreen([10, 0, 0]), undoN = UI.App.undo.length;
    var g = hs[i].grab;
    await selDrag(g, UI.instant3DRulerPoint(UI.instant3DHandles()[i], 50), D.querySelector('#i3d-layer .i3d-handle[data-index="' + i + '"]'));   // r5/select5: the ruler's 50 tick
    var ent = anvil.model().features[0].entities[0];
    assert(ent.w === 50 && ent.x === -20, 'width 50 from x = -20: ' + JSON.stringify(ent));
    near(anvil.mass().volume, 10000, 1e-6, 'volume 50 × 20 × 10');
    assert(UI.App.undo.length === undoN + 1, 'one undo step');
    assert(UI.instant3DEditOpen() && UI.instant3DEditOpen().kind === 'sdim', 'value box on the dimension');
    selKey('Escape');
    await UI.undo(); await idle();
    assert(anvil.model().features[0].entities[0].w === 40, 'undo → 40');
    // in the sketch: no Instant3D dots (rfBA: Instant3D acts on the part only, as SolidWorks); the height dimension is
    // dragged with Instant2D's ball instead
    UI.enterSketch(anvil.model().features[0].id); await idle();
    assert(!anvil.instant3D().handles.length && !D.querySelector('#i3d-layer .i3d-handle'), 'no Instant3D dots in the sketch: ' + JSON.stringify(anvil.instant3D().handles.map(function (x) { return x.kind; })));
    UI.activeSketchFeature().dims = [{ e: 0, k: 'h', off: 6 }];
    UI.updateSketches(); UI.toggleInstant2D(true); UI.App.dimsStale = false; UI.drawDims(true);
    var h2 = UI.instant2DHandle('d0'), ball2 = D.querySelector('#i2d-layer .i2d-handle');
    assert(h2 && ball2 && Math.abs(h2.value - 20) < 1e-9, 'Instant2D ball on the height ' + JSON.stringify(h2));
    undoN = UI.App.undo.length;
    selEv('mousedown', h2.ball, ball2); selEv('mousemove', UI.instant2DPoint(25, 2)); await wait(40);
    selEv('mouseup', UI.instant2DPoint(25, 2)); await idle(); await wait(30);
    var r2 = UI.activeSketchFeature().entities[0];
    assert(r2.h === 25, 'sketch height 25: ' + JSON.stringify(r2));
    assert(UI.App.undo.length === undoN + 1, 'one undo step in the sketch');
    selKey('Escape');
    await UI.exitSketch(); await idle();
    near(anvil.mass().volume, 40 * 25 * 10, 1e-6, 'rebuilt after the sketch');
    await UI.undo(); await idle();
    near(anvil.mass().volume, 8000, 1e-6, 'undo');
    UI.App.view.showDims = r12dims;
    return 'part 40 → 50, sketch 20 → 25';
  });
  step('box selection in a sketch (window 2 of 3 entities, crossing 2, Ctrl adds; Delete removes all three as one undo step) and in an assembly (crossing selects the pin it touches); FeatureManager ↔ viewport sync, Ctrl-click a row, Esc clears', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front").rect(0, 0, 20, 10).circle(40, 5, 4).line(60, 0, 80, 10);'); await idle();
    var sk = anvil.model().features[0];
    UI.enterSketch(sk.id); await idle();
    var pl = UI.activePlane();
    function Sk(u, v) { return UI.worldToScreen(K.to3D(pl, u, v)); }
    await selDrag(Sk(-5, 16), Sk(50, -4));
    assert(JSON.stringify(anvil.selection().map(function (s) { return s.index; })) === '[0,1]', 'window: rect + circle ' + JSON.stringify(anvil.selection()));
    assert(UI.groups.sketches.children.filter(function (o) { return o.material === UI.mats.sketchSel; }).length === 2, 'both drawn selected');
    await selDrag(Sk(65, 16), Sk(42, -4));
    assert(JSON.stringify(anvil.selection().map(function (s) { return s.index; })) === '[1,2]', 'crossing: circle + line ' + JSON.stringify(anvil.selection()));
    await selDrag(Sk(-5, 16), Sk(25, -4), null, { ctrlKey: true });
    assert(anvil.selection().length === 3, 'Ctrl + window adds the rectangle');
    var undoN = UI.App.undo.length;
    UI.deleteSelection();
    assert(UI.activeSketchFeature().entities.length === 0 && UI.App.undo.length === undoN + 1, 'Delete removed all three in one undo step');
    await UI.undo(); await idle();
    assert(UI.activeSketchFeature() && UI.activeSketchFeature().entities.length === 3, 'undo brings them back');
    await UI.exitSketch(); await idle();
    // assembly: crossing box over the top of Pin<2> only
    var ex = W.AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0];
    await UI.openExample(ex); await idle();
    UI.setView('Front');
    var pin2 = UI.componentIndex('Pin<2>'), bb = UI.bodyBounds(pin2);
    var hi = UI.worldToScreen([bb.max[0] + 3, bb.max[1] - 2, 0]), lo = UI.worldToScreen([bb.min[0] + 2, bb.max[1] - 6, 0]);
    await selDrag(hi, [lo[0], lo[1]]);
    var s = anvil.selection();
    assert(s.length === 1 && s[0].kind === 'body' && s[0].name === 'Pin<2>', 'crossing selects Pin<2> ' + JSON.stringify(s));
    var row = D.querySelector('#tree .ti.component-row[data-comp="' + UI.App.model.components[pin2].id + '"]');
    assert(row && row.classList.contains('selected'), 'Pin<2> row marked in the FeatureManager');
    var row1 = D.querySelector('#tree .ti.component-row[data-comp="' + UI.App.model.components[UI.componentIndex('Pin<1>')].id + '"]');
    row1.dispatchEvent(new W.MouseEvent('click', { bubbles: true, ctrlKey: true }));
    assert(anvil.selection().length === 2 && D.querySelectorAll('#tree .ti.component-row.selected').length === 2, 'Ctrl-click a row adds Pin<1>');
    selKey('Escape');
    assert(anvil.selection().length === 0 && !D.querySelector('#tree .ti.selected'), 'Esc clears viewport and tree');
    // part: a face selected in the viewport marks its feature; a feature row selects the feature (its faces highlight)
    await anvil.newPart(); await idle();
    await anvil.run(BLOCK); await idle();
    UI.setView('Front');
    selClick(UI.worldToScreen([0, 5, 10]));
    var owner = D.querySelector('#tree .ti.sel-owner');
    assert(selKinds() === 'face' && owner && /Boss-Extrude1/.test(owner.textContent), 'owner feature marked in the tree');
    D.querySelector('#tree .ti[data-fid]').dispatchEvent(new W.MouseEvent('click', { bubbles: true, ctrlKey: true }));
    assert(selKinds() === 'face,feature' && D.querySelector('#tree .ti[data-fid].selected'), 'Ctrl-click the row adds the feature');
    selKey('Escape');
    assert(anvil.selection().length === 0, 'Esc');
    return 'sketch 2 / 2 / 3, assembly Pin<2>, tree sync';
  });
