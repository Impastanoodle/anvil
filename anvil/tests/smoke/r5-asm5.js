  // --- r5/asm5 ---
  // a sub-assembly of a plate and n pins (pin 0 slides in its hole, the others sit flush), inserted Flexible on a base
  async function r5flexPins(n, fixed) {
    var L = ['a.name("Pins' + n + '").units("mm");', 'var plate = a.insert({ script: \'p.name("Plate"); p.box(300, 60, 8); p.hole("Top", 10, -10, 8, { offset: 8 }); p.linearPattern({ dir: "x", spacing: 28, count: 10, dir2: "z", spacing2: 20, count2: 3 });\' }, { fixed: true });'];
    for (var i = 0; i < n; i++) {
      var x = 10 + 28 * (i % 10), z = 10 + 20 * Math.floor(i / 10);
      L.push('var q' + i + ' = a.insert({ script: \'p.name("Pin"); p.cylinder(4, 20);\' }, { position: [' + (x + 3) + ', 15, ' + (z - 2) + '] });');
      L.push('a.concentric({ component: q' + i + ', cylinder: [4, 10, 0] }, { component: plate, cylinder: [' + (x + 4) + ', 4, ' + z + '] });');
      if (i) L.push('a.coincident({ component: q' + i + ', face: [1, 0, 1] }, { component: plate, face: [155, 0, 40] }, { alignment: "aligned" });');
    }
    await anvil.run(L.join('\n'));
    await idle();
    var sub = JSON.parse(JSON.stringify(UI.App.model));
    await anvil.newAssembly('R5Flex');
    await anvil.insert({ script: 'p.name("Base"); p.box(400, 120, 10);' }, { fixed: true });
    await anvil.insert({ model: sub }, { position: [0, 10, 0], fixed: !!fixed });
    await UI.setFlexible(UI.App.model.components[1].id, true);
    await idle();
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
  }
  // the drag hook on pin 0 of r5flexPins (grabbed on a face of it the cursor reaches)
  function r5pinHook() {
    var A = UI.App, fs = A.mesh.faces.filter(function (x) { return (x.body || 0) === 1 && Math.abs(x.centroid[0] - 10) < 6 && Math.abs(x.centroid[2] - 10) < 6 && x.centroid[1] > 18; });
    for (var i = 0; i < fs.length; i++) {
      var q = UI.worldToScreen(fs[i].centroid), h = UI.pickFace(q[0], q[1]);
      if (h && (A.mesh.faces[h.index].body || 0) === 1 && Math.abs(h.point[0] - 10) < 6) return { s: q, hook: UI.componentDragHook(q, { button: 0 }) };
    }
    return null;
  }
  step('r5/asm5: a Flexible sub-assembly fixed in the assembly still lets its floating parts be dragged; the release places its inner parts\' cached edges (no edge search over the sub-assembly) and the next drag poses again', async function () {
    await r5flexPins(12, true);
    var g = r5pinHook();
    assert(g && g.hook, 'a floating pin of the fixed flexible sub-assembly can be dragged');
    var be = K.bodyEdges, calls = 0, undo0 = UI.App.undo.length, rebuilds = 0, orig = UI.rebuild, ms = 0;
    K.bodyEdges = function () { calls++; return be.apply(this, arguments); };
    UI.rebuild = function () { rebuilds++; return orig.apply(this, arguments); };
    try {
      g.hook.start();
      for (var i = 1; i <= 4; i++) { g.hook.move([g.s[0], g.s[1] - 3 * i]); await r3frame(); }
      assert(UI.asmPose.active() && rebuilds === 0, 'posed while dragging (' + rebuilds + ' rebuilds)');
      var t0 = performance.now();
      await g.hook.end([g.s[0], g.s[1] - 12]);
      ms = performance.now() - t0;
      await idle();
    } finally { K.bodyEdges = be; UI.rebuild = orig; }
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    assert(calls === 0, 'Kernel.bodyEdges ran ' + calls + ' times on the release');
    var pe = UI.App.build.partBuilds[UI.App.model.components[1].id].__asmEdges;
    assert(pe && pe.composed, 'the sub-assembly\'s edges were placed from its parts');
    // every edge between two faces the full search finds on the composed mesh lies on a placed one
    var full = be(pe.mesh), miss = full.filter(function (f) { return !f.smooth && f.faces.length > 1 && !pe.edges.some(function (e) { return K.pointSegmentDistance(f.mid, e.a, e.b) < 1e-5; }); });
    assert(miss.length === 0, miss.length + ' edges of the full search missing');
    var g2 = r5pinHook();
    assert(g2 && g2.hook, 'drag hook again');
    g2.hook.start(); g2.hook.move([g2.s[0], g2.s[1] + 6]); await r3frame(); await r3frame();
    assert(UI.asmPose.active(), 'the next drag poses (the placed edges line up with the drawn mesh)');
    await g2.hook.end([g2.s[0], g2.s[1] + 6]); await idle();
    return 'release ' + ms.toFixed(0) + ' ms';
  });
  step('r5/asm5: a floating Flexible sub-assembly (not mated in the assembly) drags at frame rate: the pin slides in its hole, the rest of the pull moves the whole sub-assembly (no turn)', async function () {
    await r5flexPins(30, false);
    var c0 = UI.App.model.components[1], R0 = c0.transform.rotation.slice(), fs0 = JSON.stringify(c0.flexState || null);
    var g = r5pinHook();
    assert(g && g.hook, 'drag hook on pin 0');
    g.hook.start();
    var worst = 0;
    for (var i = 1; i <= 5; i++) { var t0 = performance.now(); g.hook.move([g.s[0], g.s[1] - 2 * i]); await r3frame(); worst = Math.max(worst, performance.now() - t0); }
    await g.hook.end([g.s[0], g.s[1] - 10]); await idle();
    var c1 = UI.App.model.components[1];
    assert(anvil.mates().every(function (m) { return m.ok; }) && Object.keys(UI.App.build.errors || {}).length === 0, 'mates hold');
    assert(JSON.stringify(c1.flexState || null) !== fs0, 'the pin slid in context');
    for (var k = 0; k < 9; k++) near(c1.transform.rotation[k], R0[k], 1e-9, 'the sub-assembly did not turn [' + k + ']');
    assert(worst < 1000, 'a drag frame took ' + worst.toFixed(0) + ' ms');   // seconds per frame before r5
    return 'worst frame ' + worst.toFixed(0) + ' ms';
  });
  async function r5altDrag(from, to, steps) {
    var vp = UI.viewport, rc = vp.getBoundingClientRect();
    function ev(type, p) { return new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, altKey: true, clientX: rc.left + p[0], clientY: rc.top + p[1] }); }
    vp.dispatchEvent(ev('mousedown', from));
    for (var i = 1; i <= steps; i++) { W.dispatchEvent(ev('mousemove', [from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps])); await r3frame(); }
    await r3frame();
    W.dispatchEvent(ev('mouseup', to));
    await idle();
  }
  function r5pop(act) { var p = UI.asmPopup(), b = p && p.el.querySelector('[data-act="' + act + '"]'); assert(b, 'pop-up button ' + act + ' (' + (p ? p.buttons.join() : 'no pop-up') + ')'); b.click(); }
  step('r5/asm5: SmartMates drop shows the Mate pop-up toolbar (types, Flip Mate Alignment, ✓ / ✗): a type or a flip changes the mate within its one undo step, ✗ takes it back (no redo left), Enter keeps it', async function () {
    await anvil.newAssembly('R5Smart');
    await anvil.insert({ example: 'Plate with bolt holes' }, { fixed: true });
    await anvil.insert({ script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [50, 20, 30] });
    await idle();
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
    var a = UI.worldToScreen([54, 30, 30]), b = UI.worldToScreen([10 - 2.9, 6, 10 - 2.9]), undo0 = UI.App.undo.length;
    await r5altDrag(a, b, 6);
    var p = UI.asmPopup();
    assert(p && p.kind === 'mate' && p.buttons.join() === 'concentric,tangent,flip,ok,cancel', 'pop-up: ' + (p && p.buttons.join()));
    assert(p.el.querySelector('[data-act="concentric"]').getAttribute('aria-pressed') === 'true', 'the added type is pressed');
    r5pop('flip'); await idle();
    assert(UI.App.model.mates.length === 1 && UI.App.model.mates[0].alignment === 'anti-aligned' && UI.App.undo.length === undo0 + 1, 'flipped in the same undo step');
    r5pop('tangent'); await idle();
    assert(anvil.mates().length === 1 && anvil.mates()[0].type === 'tangent' && anvil.mates()[0].ok, 'type changed: ' + JSON.stringify(anvil.mates()));
    r5pop('cancel'); await idle();
    assert(anvil.mates().length === 0 && UI.App.undo.length === undo0 && UI.App.redo.length === 0 && !UI.asmPopup(), '✗ took the mate back');
    await wait(400);   // (the pin glides back)
    await r5altDrag(a, b, 6);
    assert(UI.asmPopup(), 'pop-up again');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await idle();
    assert(!UI.asmPopup() && anvil.mates().length === 1 && anvil.mates()[0].type === 'concentric', 'Enter kept it');
  });
  step('r5/asm5: the Mate PM shows the pop-up toolbar once both selections are made: only the types they can take, a type from it previews, ✓ adds the mate and the PM stays open for the next', async function () {
    await anvil.run(exByName('Pinned plate assembly').code);
    await idle();
    var mt = UI.App.model.mates.filter(function (m) { return m.type === 'concentric'; })[0], a = JSON.parse(JSON.stringify(mt.a)), b = JSON.parse(JSON.stringify(mt.b));
    await UI.asm.removeMate(mt.id); await idle();
    var n0 = anvil.mates().length;
    UI.cmdMate(); UI.mateSelect(a);
    assert(!UI.asmPopup(), 'no pop-up after one selection');
    UI.mateSelect(b); await idle();
    var p = UI.asmPopup();
    assert(p && p.buttons.indexOf('concentric') >= 0 && p.buttons.indexOf('coincident') < 0, 'cylinder pair: Concentric offered, Coincident not: ' + (p && p.buttons.join()));
    // the Entities to Mate list: a row per selection, hovering one shows its face, Delete removes it
    var rows = D.querySelectorAll('#pm .pm-list .pm-item');
    assert(rows.length === 2 && /Pin<1>/.test(rows[0].textContent) && /Plate<1>/.test(rows[1].textContent), 'list: ' + Array.prototype.map.call(rows, function (r) { return r.textContent; }).join(' | '));
    rows[0].dispatchEvent(new W.MouseEvent('mouseenter'));
    var hf = UI.App.command.hoverItem && UI.App.command.hoverItem.faces;
    assert(hf && hf.length === 1 && W.Assembly.findComponent(UI.App.model, a.component) === UI.App.model.components[UI.App.mesh.faces[hf[0]].body || 0], 'the hovered row\'s face is on its component');
    rows[0].focus(); rows[0].dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    assert(D.querySelectorAll('#pm .pm-list .pm-item').length === 1 && !UI.asmPopup(), 'Delete removed it; no pop-up with one selection');
    UI.mateSelect(a); await idle();   // the pin again (the plate face is left)
    p = UI.asmPopup();
    assert(p && D.querySelectorAll('#pm .pm-list .pm-item').length === 2, 'two again');
    r5pop('parallel'); await idle();
    assert(UI.pmSpec().values.type === 'parallel', 'the PM takes the type: ' + UI.pmSpec().values.type);
    r5pop('concentric'); await idle();
    r5pop('ok'); await idle();
    assert(anvil.mates().length === n0 + 1 && anvil.mates().filter(function (m) { return m.type === 'concentric'; }).length === 2, 'mate added');
    assert(UI.pmTitle() === 'Mate' && !UI.asmPopup(), 'the PM stays open, the pop-up goes');
    UI.pmCancel();
  });
  function r5click(p, button, path) {
    var vp = UI.viewport, rc = vp.getBoundingClientRect();
    function ev(type, q) { return new W.MouseEvent(type, { bubbles: true, cancelable: true, button: button || 0, buttons: type === 'mouseup' ? 0 : (button === 2 ? 2 : 1), clientX: rc.left + q[0], clientY: rc.top + q[1] }); }
    vp.dispatchEvent(ev('mousedown', p));
    (path || []).forEach(function (q) { W.dispatchEvent(ev('mousemove', q)); });
    vp.dispatchEvent(ev('mouseup', path && path.length ? path[path.length - 1] : p));
  }
  step('r5/asm5: a click on a component shows its context toolbar (Mate, Hide, Change Transparency, Isolate, Fix / Float, Edit Part): transparency draws it see-through and clicks go through it; Isolate hides the others until Exit Isolate', async function () {
    await anvil.run(exByName('Pinned plate assembly').code);
    await idle();
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
    var A = UI.App, ci = A.model.components.findIndex(function (c) { return c.name === 'Cap<1>'; }), id = A.model.components[ci].id;
    var f = A.mesh.faces.filter(function (x) { return (x.body || 0) === ci; }).sort(function (x, y) { return y.area - x.area; })[0], s = UI.worldToScreen(f.centroid);
    r5click(s); await idle();
    var p = UI.asmPopup();
    assert(p && p.kind === 'ctx' && ['mate', 'hide', 'transparency', 'isolate', 'fix'].every(function (k) { return p.buttons.indexOf(k) >= 0; }), 'context toolbar: ' + (p && p.buttons.join()));
    r5pop('transparency'); await idle();
    assert(UI.asmGhost.is(id), 'transparent');
    var h = UI.pickFace(s[0], s[1]);
    assert(!h || (A.mesh.faces[h.index].body || 0) !== ci, 'the click goes through the transparent component');
    var ghost = null; UI.scene.traverse(function (o) { if (o.userData && o.userData.asmGhost) ghost = o; });
    var want = A.mesh.faces.filter(function (x) { return (x.body || 0) === ci; }).reduce(function (t, x) { return t + x.count * 3; }, 0);
    assert(ghost && ghost.material.transparent && ghost.geometry.index.count === want, 'the see-through copy');
    UI.asmGhost.set(id, false); await idle();
    var h2 = UI.pickFace(s[0], s[1]);
    assert(h2 && (A.mesh.faces[h2.index].body || 0) === ci, 'opaque again: picked');
    UI.asmClosePopup();
    UI.asmIsolate.isolate(id);
    assert(A.model.components.every(function (c, k) { return UI.isBodyHidden(k) === (k !== ci); }) && D.querySelector('.asm-isolate'), 'isolated');
    D.querySelector('.asm-isolate button').click();
    assert(A.model.components.every(function (c, k) { return !UI.isBodyHidden(k); }) && !D.querySelector('.asm-isolate'), 'Exit Isolate');
  });
  step('r5/asm5: a right-mouse drag on a floating component rotates it (one undo step, the view stays); on a fixed one it pans the view', async function () {
    await anvil.newAssembly('R5RDrag');
    await anvil.insert({ example: 'Plate with bolt holes' }, { fixed: true });
    await anvil.insert({ script: 'p.name("Blk"); p.box(20, 10, 10);' }, { position: [50, 20, 30] });
    await idle();
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
    var R0 = JSON.stringify(UI.App.model.components[1].transform.rotation), u0 = UI.App.undo.length, cv = UI.camVersion();
    var s = UI.worldToScreen([60, 25, 35]), path = [];
    for (var i = 1; i <= 5; i++) path.push([s[0] + 8 * i, s[1]]);
    r5click(s, 2, path); await idle();
    assert(JSON.stringify(UI.App.model.components[1].transform.rotation) !== R0 && UI.App.undo.length === u0 + 1 && UI.camVersion() === cv, 'rotated, one undo step, view unchanged');
    var q = UI.worldToScreen([90, 8, 70]);
    r5click(q, 2, [[q[0] + 20, q[1] + 10]]); await idle();
    assert(UI.camVersion() !== cv && UI.App.undo.length === u0 + 1, 'on the fixed plate: the view pans');
  });
  step('r5/asm5: Tab hides the component under the pointer, Shift + Tab shows it again; a transparent one keeps its see-through copy through Hide / Show; a component row clicked in the FeatureManager shows the context toolbar', async function () {
    await anvil.run(exByName('Pinned plate assembly').code);
    await idle();
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
    var A = UI.App, pi = A.model.components.findIndex(function (c) { return c.name === 'Pin<1>'; }), cap = A.model.components.findIndex(function (c) { return c.name === 'Cap<1>'; });
    var f = A.mesh.faces.filter(function (x) { return (x.body || 0) === pi; }).sort(function (x, y) { return y.centroid[1] - x.centroid[1]; })[0], s = UI.worldToScreen(f.centroid), rc = UI.viewport.getBoundingClientRect();
    var h = UI.pickFace(s[0], s[1]);
    assert(h && (A.mesh.faces[h.index].body || 0) === pi, 'the pin top is under the pointer');
    UI.asmGhost.set(A.model.components[cap].id, true);
    UI.viewport.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: rc.left + s[0], clientY: rc.top + s[1] }));
    D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert(UI.isBodyHidden(pi), 'Tab hid the pin');
    D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    assert(!UI.isBodyHidden(pi), 'Shift + Tab showed it');
    var ghost = null; UI.scene.traverse(function (o) { if (o.userData && o.userData.asmGhost) ghost = o; });
    assert(ghost && ghost.parent, 'the transparent cap is still drawn see-through');
    UI.asmGhost.set(A.model.components[cap].id, false);
    var row = D.querySelector('.component-row[data-comp="' + A.model.components[cap].id + '"]');
    assert(row, 'component row');
    row.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 300 }));
    await wait(20);
    var p = UI.asmPopup();
    assert(p && p.kind === 'ctx', 'context toolbar from the FeatureManager');
    UI.asmClosePopup();
  });
  step('r5/asm5: Insert Components — the part follows the pointer (X / Y / Z follow, its origin on the face under it) and a click drops it there (one undo step); the first component stays at the origin', async function () {
    await anvil.newAssembly('R5Ins');
    UI.cmdInsertComponent(); await idle();
    var st = UI.asmInsertPreview.state();
    assert(st && st.fixed && st.shown, 'the first component: shown at the origin, fixed there');
    UI.pmCancel();
    assert(!UI.asmInsertPreview.state(), 'the preview goes with the PM');
    await anvil.insert({ example: 'Plate with bolt holes' }, { fixed: true }); await idle();
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
    UI.cmdInsertComponent(); await idle();
    var s = UI.worldToScreen([60, 8, 40]), rc = UI.viewport.getBoundingClientRect(), u0 = UI.App.undo.length;
    function ev(t) { return new W.MouseEvent(t, { bubbles: true, cancelable: true, button: 0, buttons: t === 'mousedown' ? 1 : 0, clientX: rc.left + s[0], clientY: rc.top + s[1] }); }
    UI.viewport.dispatchEvent(ev('mousemove')); await r3frame(); await r3frame();
    st = UI.asmInsertPreview.state();
    assert(st && st.shown && Math.abs(st.at[1] - 8) < 1e-6 && Math.abs(st.at[0] - 60) < 1 && Math.abs(st.at[2] - 40) < 1, 'follows the pointer onto the plate top: ' + JSON.stringify(st));
    near(+UI.pmSpec().values.y, 8, 1e-3, 'Y field');
    UI.viewport.dispatchEvent(ev('mousedown')); UI.viewport.dispatchEvent(ev('mouseup'));
    await wait(30); await idle();
    var cs = anvil.components();
    assert(cs.length === 2 && Math.abs(cs[1].position[1] - 8) < 1e-3 && UI.App.undo.length === u0 + 1 && !UI.hasPM(), 'dropped where clicked: ' + JSON.stringify(cs[1].position));
  });
  // --- end r5/asm5 ---
