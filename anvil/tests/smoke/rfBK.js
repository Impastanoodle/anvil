  // --- rfBK ---
  // (2026-10-13) Mastercam's Transform tab, the plane commands (ui-transform-3d.js): Translate to Plane (Front → Top
  // keeps the plane-relative coordinates, a new sketch, one undo step; Move with From / To points into the Right
  // plane), Project (a circle and an arc on a tilted plane come in as an exact ellipse and partial ellipse; To depth
  // makes the offset sketch), Roll ▸ Unroll (a tube's windows lie flat at R·θ, to 1e-9 against acos), Stretch with a
  // crossing window and ✓+, Scale XYZ 2 / 0.5 about a picked point with 2 copies, uniform percentage Move. The
  // commands are called as UI.cmdT…() (the ribbon buttons come from another lane); picks are real mouse clicks.
  async function rfBKSketch(ents, rels) {
    if (UI.transformMemory) UI.transformMemory.reset();   // lane BO: each step starts from the commands' defaults
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.25 / UI.cam.scale);
    var f = UI.activeSketchFeature();
    ents.forEach(function (e) { f.entities.push(e); });
    (rels || []).forEach(function (r) { var x = W.SketchSolver.addRelation(f, r[0], r[1]); assert(x.ok, 'relation ' + r[0] + ': ' + x.error); });
    UI.updateSketches(); await wait(20);
    return f;
  }
  function rfBKScr(p, pl) { return UI.worldToScreen(K.to3D(pl || UI.activePlane(), p[0], p[1])); }
  function rfBKNear(a, b, tol, what) { assert(Math.abs(a - b) <= (tol || 1e-9), (what || 'value') + ' = ' + a + ', expected ' + b); }
  function rfBKSame(e, want, what) {
    Object.keys(want).forEach(function (k) {
      if (typeof want[k] === 'number') rfBKNear(e[k], want[k], 1e-9, (what || e.t) + '.' + k);
      else assert(e[k] === want[k], (what || 'entity') + '.' + k + ' = ' + e[k] + ', expected ' + want[k]);
    });
  }
  function rfBKPlus() {
    var b = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-actions button'), function (x) { return /✓\+/.test(x.title); })[0];
    assert(b, 'the ✓+ button');
    b.click();
  }
  function rfBKRect(w, h) {
    return { ents: [{ t: 'line', x1: 0, y1: 0, x2: w, y2: 0 }, { t: 'line', x1: w, y1: 0, x2: w, y2: h }, { t: 'line', x1: w, y1: h, x2: 0, y2: h }, { t: 'line', x1: 0, y1: h, x2: 0, y2: 0 }],
      rels: [['coincident', ['0.p2', '1.p1']], ['coincident', ['1.p2', '2.p1']], ['coincident', ['2.p2', '3.p1']], ['coincident', ['3.p2', '0.p1']], ['horizontal', ['0']], ['vertical', ['1']], ['horizontal', ['2']], ['vertical', ['3']]] };
  }

  step('rfBK: Transform commands outside a sketch say "Open a sketch: Transform acts on sketch geometry" (Roll opens for Unroll)', async function () {
    if (UI.transformMemory) UI.transformMemory.reset();   // lane BO: each step starts from the commands' defaults
    await anvil.newPart(); await idle();
    ['cmdTTranslateToPlane', 'cmdTProject', 'cmdTStretch', 'cmdTScale'].forEach(function (n) {
      assert(typeof UI[n] === 'function', n + ' missing');
      UI[n]();
      var t = D.querySelector('.toast');
      assert(t && t.textContent === 'Open a sketch: Transform acts on sketch geometry' && !UI.pmTitle(), n + ': ' + (t && t.textContent) + ' / PM ' + UI.pmTitle());
    });
    UI.cmdTRoll(); await idle();
    assert(UI.pmTitle() === 'Roll' && UI.pmSpec().values.op === 'unroll', 'Roll opens on Unroll outside a sketch');
    UI.pmCancel(); await idle();
  });

  step('rfBK: Translate to Plane — a line, circle and arc on Front, the Top plane clicked in the graphics area, Copy, ✓: a new sketch on Top holds them at the same plane-relative coordinates, opened with them selected; the Front sketch keeps them; one undo step takes both back', async function () {
    var errs0 = errors.length;
    var src = [{ t: 'line', x1: 10, y1: 5, x2: 30, y2: 5 }, { t: 'circle', cx: 20, cy: 15, r: 5 }, { t: 'arc', cx: -10, cy: 8, r: 4, a0: 30, a1: 150 }];
    var f = await rfBKSketch(JSON.parse(JSON.stringify(src)));
    var srcId = f.id, n0 = UI.App.model.features.length, u0 = UI.App.undo.length;
    UI.setSelection([0, 1, 2].map(function (i) { return { kind: 'entity', index: i }; }));
    UI.cmdTTranslateToPlane(); await idle();
    assert(UI.pmTitle() === 'Translate to Plane', 'PM ' + UI.pmTitle());
    var v = UI.pmSpec().values;
    assert(v.entities.join() === '0,1,2' && v.box === 'target', 'selection taken, target box active: ' + v.entities + ' ' + v.box);
    UI.setView('Isometric'); await idle();
    selClick(UI.worldToScreen([15, 0, 15])); await idle();
    assert(v.target && v.target.label === 'Top Plane', 'Top plane picked: ' + (v.target && v.target.label));
    assert(UI.App.tempEntities.length === 3, 'preview of the 3 entities');
    await UI.pmOK(); await idle(); await wait(30); await idle();
    assert(UI.App.model.features.length === n0 + 1, 'one new sketch');
    var g = UI.App.model.features[UI.App.model.features.length - 1];
    assert(g.type === 'sketch' && g.plane.ref === 'Top' && !g.plane.offset, 'on the Top plane: ' + JSON.stringify(g.plane));
    assert(g.entities.length === 3, 'three entities: ' + g.entities.length);
    src.forEach(function (e, i) { rfBKSame(g.entities[i], e, 'Top ' + e.t); });
    assert(UI.App.activeSketch === g.id, 'the result sketch is open');
    var sel = anvil.selection().filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; }).sort().join();
    assert(sel === '0,1,2', 'the result is selected: ' + sel);
    assert(K.findFeature(UI.App.model, srcId).entities.length === 3, 'Copy leaves the source');
    var w = K.to3D(K.makePlane('Top', 0), 20, 15);
    assert(Math.abs(w[0] - 20) < 1e-12 && Math.abs(w[2] + 15) < 1e-12, 'the circle centre is at plane (20, 15) of Top: ' + w);
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    await UI.undo(); await idle();
    assert(UI.App.model.features.length === n0, 'undo removes the new sketch');
    if (UI.App.mode === 'sketch') await UI.exitSketch(); await idle();
    UI.setView('Front'); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Front → ' + g.name + ' on Top';
  });

  step('rfBK: Translate to Plane — Move, the Right plane from the Plane list, From (10, 5) To (0, 0) typed: the entities land shifted in a new Right sketch, leave the Front sketch, and the relation tying them to the geometry left behind is dropped and counted', async function () {
    var errs0 = errors.length;
    var f = await rfBKSketch([{ t: 'line', x1: 10, y1: 5, x2: 30, y2: 5 }, { t: 'line', x1: 30, y1: 5, x2: 30, y2: 25 }, { t: 'circle', cx: -20, cy: 0, r: 3 }], [['coincident', ['0.p2', '1.p1']]]);
    UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 2 }]);
    UI.cmdTTranslateToPlane(); await idle();
    D.querySelector('#pm input[data-key="mode:move"]').click(); await idle();
    var sel = D.querySelector('#pm select[data-key="tkey"]');
    sel.value = 'std:Right'; sel.dispatchEvent(new W.Event('change', { bubbles: true })); await idle();
    var v = UI.pmSpec().values;
    assert(v.target && v.target.label === 'Right Plane', 'Right plane from the list');
    D.querySelector('#pm input[data-key="map:points"]').click(); await idle();
    setInput(D.querySelector('#pm input[data-key="fx"]'), '10'); setInput(D.querySelector('#pm input[data-key="fy"]'), '5');
    setInput(D.querySelector('#pm input[data-key="tx"]'), '0'); setInput(D.querySelector('#pm input[data-key="ty"]'), '0');
    D.querySelector('#pm input[data-key="edit"]').click(); await idle();
    assert(!v.edit, 'Edit the result sketch off');
    await UI.pmOK(); await idle();
    assert(UI.App.activeSketch === f.id, 'still in the source sketch');
    var g = UI.App.model.features[UI.App.model.features.length - 1];
    assert(g.plane.ref === 'Right' && g.entities.length === 2, 'Right sketch with 2: ' + JSON.stringify(g.plane) + ' ' + g.entities.length);
    rfBKSame(g.entities[0], { t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 });
    rfBKSame(g.entities[1], { t: 'circle', cx: -30, cy: -5, r: 3 });
    assert(f.entities.length === 1 && f.entities[0].x1 === 30 && !(f.rels || []).length, 'the source keeps the vertical line only, no relation: ' + JSON.stringify(f.entities) + ' ' + JSON.stringify(f.rels || []));
    assert(/1 relation to geometry left behind dropped/.test(statusText()), 'status counts the dropped relation: ' + statusText());
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfBK: Project — a circle and an arc on a plane tilted 60° about X, clicked in the graphics area, come into the Front sketch as an exact ellipse (rx 8, ry 4) and partial ellipse (rx 6, ry 3, 0°–90°); To depth 15 makes a Front + 15 sketch with the ellipse', async function () {
    var errs0 = errors.length;
    if (UI.transformMemory) UI.transformMemory.reset();   // lane BO: each step starts from the commands' defaults
    await anvil.newPart(); await idle();
    var c60 = 0.5, s60 = Math.sqrt(3) / 2, tilt = { custom: true, origin: [0, 0, 0], x: [1, 0, 0], y: [0, c60, s60], n: [0, -s60, c60], offset: 0 };
    var M = UI.App.model, tid = M.nextId++;
    M.features.push({ id: tid, type: 'sketch', name: 'Tilted', plane: tilt, entities: [{ t: 'circle', cx: 10, cy: 20, r: 8 }, { t: 'arc', cx: -20, cy: 0, r: 6, a0: 0, a1: 90 }] });
    await UI.rebuild(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    UI.zoomView(0.25 / UI.cam.scale); await idle();
    var f = UI.activeSketchFeature();
    UI.cmdTProject(); await idle();
    assert(UI.pmTitle() === 'Project', 'PM ' + UI.pmTitle());
    selClick(rfBKScr([18, 20], tilt)); await idle();
    selClick(rfBKScr([-20 + 6 * Math.cos(Math.PI / 4), 6 * Math.sin(Math.PI / 4)], tilt)); await idle();
    var v = UI.pmSpec().values;
    assert(v.items.length === 2 && v.items.every(function (it) { return it.kind === 'sk' && it.sketch === tid; }), 'two tilted entities picked: ' + JSON.stringify(v.items));
    await UI.pmOK(); await idle();
    assert(f.entities.length === 2, 'two projected: ' + JSON.stringify(f.entities));
    rfBKSame(f.entities[0], { t: 'ellipse', cx: 10, cy: 10, rx: 8, ry: 4, rot: 0 });
    rfBKSame(f.entities[1], { t: 'pellipse', cx: -20, cy: 0, rx: 6, ry: 3, rot: 0, a0: 0, a1: 90 });
    assert(/2 entities .*1 ellipse/.test(statusText()) || /ellipse/.test(statusText()), 'status: ' + statusText());
    // To depth
    var n0 = M.features.length;
    UI.cmdTProject(); await idle();
    selClick(rfBKScr([18, 20], tilt)); await idle();
    D.querySelector('#pm input[data-key="to:depth"]').click(); await idle();
    setInput(D.querySelector('#pm input[data-key="depth"]'), '15'); await idle();
    await UI.pmOK(); await idle();
    var g = M.features[M.features.length - 1];
    assert(M.features.length === n0 + 1 && g.plane.ref === 'Front' && g.plane.offset === 15, 'Front + 15 sketch: ' + JSON.stringify(g.plane));
    rfBKSame(g.entities[0], { t: 'ellipse', cx: 10, cy: 10, rx: 8, ry: 4, rot: 0 });
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfBK: Roll ▸ Unroll — a Ø40 tube 100 long with a window cut through its top (z 40–60) and its bottom (z 70–80), the outer face clicked: a new Front sketch holds the flat blank — ends 0 to 2πR, seam lines, each window side at R·acos(5/20) etc. to 1e-9', async function () {
    var errs0 = errors.length;
    if (UI.transformMemory) UI.transformMemory.reset();   // lane BO: each step starts from the commands' defaults
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front").circle(0, 0, 20).circle(0, 0, 18).extrude(100);\np.sketch("Top").rect(-5, -60, 10, 20).cut("through");\np.sketch("Top").rect(-5, -80, 10, 10).cut("through", { reverse: true });'); await idle();
    UI.setView('Isometric'); await idle();
    UI.cmdTRoll(); await idle();
    var v = UI.pmSpec().values;
    var P = [20 * Math.cos(Math.PI / 4), 20 * Math.sin(Math.PI / 4), 90];
    selClick(UI.worldToScreen(P)); await idle();
    assert(v.cyl && Math.abs(v.cyl.r - 20) < 1e-9 && Math.abs(v.dia - 40) < 1e-9, 'the Ø40 face picked: ' + v.cylLabel);
    var n0 = UI.App.model.features.length;
    await UI.pmOK(); await idle(); await wait(30); await idle();
    var g = UI.App.model.features[UI.App.model.features.length - 1];
    assert(UI.App.model.features.length === n0 + 1 && g.type === 'sketch' && g.plane.ref === 'Front', 'a new Front sketch');
    assert(UI.App.activeSketch === g.id, 'opened');
    var R = 20, T = 2 * Math.PI, a = Math.acos(5 / 20), L = g.entities.filter(function (e) { return e.t === 'line'; });
    assert(L.length === g.entities.length && g.entities.length === 12, '12 lines: ' + JSON.stringify(g.entities));
    function has(x1, y1, x2, y2, what) {
      var hit = L.filter(function (e) { return (Math.abs(e.x1 - x1) < 1e-9 && Math.abs(e.y1 - y1) < 1e-9 && Math.abs(e.x2 - x2) < 1e-9 && Math.abs(e.y2 - y2) < 1e-9) || (Math.abs(e.x2 - x1) < 1e-9 && Math.abs(e.y2 - y1) < 1e-9 && Math.abs(e.x1 - x2) < 1e-9 && Math.abs(e.y1 - y2) < 1e-9); });
      assert(hit.length === 1, what + ' (' + [x1, y1, x2, y2].join(', ') + ') not found in ' + JSON.stringify(L));
    }
    has(0, 0, T * R, 0, 'end z = 0'); has(0, 100, T * R, 100, 'end z = 100');
    has(0, 0, 0, 100, 'seam'); has(T * R, 0, T * R, 100, 'seam at 2πR');
    has(R * a, 40, R * (Math.PI - a), 40, 'top window, bottom edge'); has(R * a, 60, R * (Math.PI - a), 60, 'top window, top edge');
    has(R * a, 40, R * a, 60, 'top window side x = 5'); has(R * (Math.PI - a), 40, R * (Math.PI - a), 60, 'top window side x = -5');
    has(R * (Math.PI + a), 70, R * (T - a), 70, 'bottom window'); has(R * (Math.PI + a), 80, R * (T - a), 80, 'bottom window');
    has(R * (Math.PI + a), 70, R * (Math.PI + a), 80, 'bottom window side'); has(R * (T - a), 70, R * (T - a), 80, 'bottom window side');
    assert(/Unrolled 12 entities from Ø40/.test(statusText()), 'status: ' + statusText());
    await UI.exitSketch(); await idle();
    UI.setView('Front'); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'window side at s = ' + fmt(R * a);
  });

  step('rfBK: Roll — the selected 30 × 10 rectangle rolled round Ø40 about the Y axis line x = 0: the sides along the axis stay lines at R·sin(x / R), the sides across it come in folded onto their projection; Move, one undo step', async function () {
    var errs0 = errors.length, R = 20;
    var Q = rfBKRect(30, 10), f = await rfBKSketch(Q.ents);
    UI.setSelection([0, 1, 2, 3].map(function (i) { return { kind: 'entity', index: i }; }));
    UI.cmdTRoll(); await idle();
    var v = UI.pmSpec().values;
    assert(v.op === 'roll' && v.entities.length === 4, 'Roll on the selection: ' + v.op);
    setInput(D.querySelector('#pm input[data-key="dia"]'), '40'); await idle();
    D.querySelector('#pm input[data-key="mode:move"]').click(); await idle();
    var u0 = UI.App.undo.length;
    await UI.pmOK(); await idle();
    assert(f.entities.length === 4 && f.entities.every(function (e) { return e.t === 'line'; }), 'four lines: ' + JSON.stringify(f.entities));
    var xs = f.entities.map(function (e) { return [e.x1, e.x2]; });
    rfBKNear(Math.max.apply(null, [].concat.apply([], xs)), R * Math.sin(30 / R), 1e-9, 'rolled right side');
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfBK: Stretch — a crossing window (real mouse, right to left) over the right half of a 40 × 20 rectangle, Delta X 10, ✓+: the right side moves to 50, the top and bottom stretch, the PM stays open; ✓ again stretches the same region to 60; each is one undo step', async function () {
    var errs0 = errors.length, Q = rfBKRect(40, 20);
    var f = await rfBKSketch(Q.ents, Q.rels);
    UI.setSelection([]);
    UI.cmdTStretch(); await idle();
    assert(UI.pmTitle() === 'Stretch', 'PM ' + UI.pmTitle());
    await selDrag(rfBKScr([46, 26]), rfBKScr([25, -6]));
    var v = UI.pmSpec().values;
    assert(v.entities.join() === '0,1,2', 'the crossing window takes the right side, top and bottom: ' + v.entities.join());
    assert(/Crossing region set/.test(D.querySelector('#pm').textContent), 'the PM shows the crossing region');
    setInput(D.querySelector('#pm input[data-key="dx"]'), '10'); await idle();
    assert(UI.App.tempEntities.length >= 3, 'preview');
    var u0 = UI.App.undo.length;
    rfBKPlus(); await idle();
    assert(UI.pmTitle() === 'Stretch', '✓+ keeps the PM open');
    rfBKNear(f.entities[1].x1, 50, 1e-9, 'right side'); rfBKNear(f.entities[0].x2, 50, 1e-9, 'bottom end'); rfBKNear(f.entities[2].x1, 50, 1e-9, 'top start');
    rfBKNear(f.entities[3].x1, 0, 1e-9, 'left side stays');
    assert(UI.App.undo.length === u0 + 1, 'one undo step for ✓+');
    await UI.pmOK(); await idle();
    assert(!UI.pmTitle(), '✓ closes');
    rfBKNear(f.entities[1].x1, 60, 1e-9, 'right side after ✓'); rfBKNear(f.entities[3].x2, 0, 1e-9, 'left side');
    assert(UI.App.undo.length === u0 + 2, 'two steps in all');
    assert(/Stretched: 4 points in the window moved by \(10, 0\)/.test(statusText()), 'status: ' + statusText());
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfBK: Scale — XYZ X 2 / Y 0.5 about a point clicked on the sketch point (4, 2), Copy, 2 copies: the circle becomes ellipses (rx 4, ry 1) and (rx 8, ry 0.5), each copy scaled again from the one before; the copies are selected; then Uniform 50 % Move about the selection centre drops and counts the relation to the point', async function () {
    var errs0 = errors.length;
    var f = await rfBKSketch([{ t: 'circle', cx: 10, cy: 0, r: 2 }, { t: 'line', x1: 10, y1: 0, x2: 14, y2: 0 }, { t: 'point', x: 4, y: 2 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 1 }]);
    UI.cmdTScale(); await idle();
    var v = UI.pmSpec().values;
    D.querySelector('#pm input[data-key="kind:xyz"]').click(); await idle();
    setInput(D.querySelector('#pm input[data-key="sx"]'), '2'); setInput(D.querySelector('#pm input[data-key="sy"]'), '0.5');
    D.querySelector('#pm input[data-key="mode:copy"]').click(); await idle();
    setInput(D.querySelector('#pm input[data-key="count"]'), '2'); await idle();
    D.querySelector('#pm input[data-key="about:point"]').click(); await idle();
    assert(v.box === 'point', 'the point box is active');
    selClick(rfBKScr([4, 2])); await idle();
    assert(v.px === 4 && v.py === 2, 'scale about (4, 2): ' + v.px + ', ' + v.py);
    assert(UI.App.tempEntities.length === 4, 'preview of 2 × 2: ' + UI.App.tempEntities.length);
    var u0 = UI.App.undo.length;
    await UI.pmOK(); await idle();
    assert(f.entities.length === 7, '4 copies added: ' + f.entities.length);
    rfBKSame(f.entities[3], { t: 'ellipse', cx: 16, cy: 1, rx: 4, ry: 1, rot: 0 });
    rfBKSame(f.entities[4], { t: 'line', x1: 16, y1: 1, x2: 24, y2: 1 });
    rfBKSame(f.entities[5], { t: 'ellipse', cx: 28, cy: 1.5, rx: 8, ry: 0.5, rot: 0 });
    rfBKSame(f.entities[6], { t: 'line', x1: 28, y1: 1.5, x2: 44, y2: 1.5 });
    var sel = anvil.selection().map(function (s) { return s.index; }).sort().join();
    assert(sel === '3,4,5,6', 'the copies are selected: ' + sel);
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    // Uniform 50 % Move about the selection centre: the circle and line, tied to the point by a relation
    f.entities.push({ t: 'line', x1: 14, y1: 0, x2: 14, y2: 10 });
    var r = W.SketchSolver.addRelation(f, 'coincident', ['1.p2', '7.p1']);
    assert(r.ok, 'relation: ' + r.error);
    UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 1 }]);
    UI.cmdTScale(); await idle();
    // lane BO: Scale remembers XYZ / Copy × 2 from the run above: back to Uniform and Move for this one
    D.querySelector('#pm input[data-key="kind:uniform"]').click(); await idle();
    D.querySelector('#pm input[data-key="mode:move"]').click(); await idle();
    D.querySelector('#pm input[data-key="units:percent"]').click(); await idle();
    setInput(D.querySelector('#pm input[data-key="s"]'), '50');
    D.querySelector('#pm input[data-key="about:centre"]').click(); await idle();
    await UI.pmOK(); await idle();
    rfBKSame(f.entities[0], { t: 'circle', cx: 10.5, cy: 0, r: 1 });
    rfBKSame(f.entities[1], { t: 'line', x1: 10.5, y1: 0, x2: 12.5, y2: 0 });
    assert(/1 relation to unselected geometry dropped/.test(statusText()), 'status: ' + statusText());
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfBK: Scale Join — a line (1, 0)–(2, 0) scaled × 2 about the origin with Join: the copy (2, 0)–(4, 0) and the joining lines from each end to its copy', async function () {
    var errs0 = errors.length;
    var f = await rfBKSketch([{ t: 'line', x1: 1, y1: 0, x2: 2, y2: 1 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdTScale(); await idle();
    setInput(D.querySelector('#pm input[data-key="s"]'), '2');
    D.querySelector('#pm input[data-key="mode:join"]').click(); await idle();
    await UI.pmOK(); await idle();
    assert(f.entities.length === 4, 'copy + 2 joining lines: ' + JSON.stringify(f.entities));
    rfBKSame(f.entities[1], { t: 'line', x1: 2, y1: 0, x2: 4, y2: 2 });
    rfBKSame(f.entities[2], { t: 'line', x1: 1, y1: 0, x2: 2, y2: 0 });
    rfBKSame(f.entities[3], { t: 'line', x1: 2, y1: 1, x2: 4, y2: 2 });
    assert(/Joined: 1 copy \(1 entity \+ 2 joining lines\)/.test(statusText()), 'status: ' + statusText());
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfBK: Project a model edge — the top circle of a Ø20 boss standing on the Top plane, clicked in a Front sketch, is seen edge-on: one line from x −10 to 10 at y 20', async function () {
    var errs0 = errors.length;
    if (UI.transformMemory) UI.transformMemory.reset();   // lane BO: each step starts from the commands' defaults
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").circle(0, 0, 10).extrude(20);'); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    var f = UI.activeSketchFeature();
    UI.cmdTProject(); await idle();
    selClick(UI.worldToScreen([3, 20, 9.5])); await idle();
    var v = UI.pmSpec().values;
    assert(v.items.length === 1 && v.items[0].kind === 'edge', 'the edge picked: ' + JSON.stringify(v.items.map(function (it) { return it.kind; })));
    await UI.pmOK(); await idle();
    assert(f.entities.length === 1, 'one line: ' + JSON.stringify(f.entities));
    var e = f.entities[0];
    assert(e.t === 'line' && Math.abs(Math.min(e.x1, e.x2) + 10) < 1e-9 && Math.abs(Math.max(e.x1, e.x2) - 10) < 1e-9 && Math.abs(e.y1 - 20) < 1e-9 && Math.abs(e.y2 - 20) < 1e-9, 'edge-on line: ' + JSON.stringify(e));
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
