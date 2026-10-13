  // --- rfBA ---
  // Instant3D makes no dimension dots in an open sketch (ui-select.js; style.css no longer hides them), box Stretch
  // Entities (a window box picks the entities to stretch; what is joined to them stretches)
  async function rfBANew(ents, rels) {
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
  function rfBAScr(p) { return UI.worldToScreen(K.to3D(UI.activePlane(), p[0], p[1])); }
  step('rfBA: Instant3D on — a selected feature in the part still shows its sketch\'s dimension dot; in the open sketch no Instant3D dot is made at all (not made and hidden by CSS), whatever the tool; Instant2D takes over', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20).extrude(10);'); await idle();
    anvil.instant3D(true);
    var sk = UI.App.model.features[0];
    sk.dims = [{ e: 0, k: 'w', off: -8 }];
    UI.setView('Isometric');
    var cap = anvil.faces().filter(function (fc) { return fc.normal[2] > 0.999; })[0];
    UI.setSelection([{ kind: 'face', index: cap.index }]); await wait(20);
    var hs = anvil.instant3D().handles;
    assert(hs.some(function (h) { return h.kind === 'sdim'; }) && hs.some(function (h) { return h.kind === 'depth'; }), 'part: depth arrow and the sketch dot ' + JSON.stringify(hs.map(function (h) { return h.kind; })));
    UI.enterSketch(sk.id); await idle();
    UI.App.dimsStale = false; UI.drawDims(true);
    assert(anvil.instant3D().on && !anvil.instant3D().handles.length && !D.querySelector('#i3d-layer .i3d-handle'), 'sketch: no Instant3D handle ' + JSON.stringify(anvil.instant3D().handles));
    UI.setTool('line'); await wait(10);
    assert(!anvil.instant3D().handles.length, 'none with a tool either');
    UI.setTool('select'); UI.toggleInstant2D(true);
    assert(UI.instant2DHandle('d0'), 'Instant2D ball on the width');
    var css = Array.prototype.some.call(D.styleSheets, function (s) { try { return Array.prototype.some.call(s.cssRules, function (r) { return /i3d-handle\.live\s*\{[^}]*display:\s*none/.test(r.cssText); }); } catch (e) { return false; } });
    assert(!css, 'the style.css rule hiding sketch dots is gone');
    selKey('Escape'); await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'no page errors: ' + errors.slice(errs0).join(' | '));
    return 'part ' + hs.length + ' handles, sketch 0';
  });
  step('rfBA: Stretch Entities with a window box — on a 40 × 20 rectangle of four joined lines, a left-to-right box round the right side picks it alone; X/Y ΔX 10 moves it and stretches the top and bottom (50 wide), the left side stays; one undo step', async function () {
    var errs0 = errors.length;
    var f = await rfBANew([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 40, y1: 0, x2: 40, y2: 20 }, { t: 'line', x1: 40, y1: 20, x2: 0, y2: 20 }, { t: 'line', x1: 0, y1: 20, x2: 0, y2: 0 }],
      [['coincident', ['0.p2', '1.p1']], ['coincident', ['1.p2', '2.p1']], ['coincident', ['2.p2', '3.p1']], ['coincident', ['3.p2', '0.p1']]]);
    UI.setSelection([]);
    UI.cmdStretchEntities(); await wait(20);
    assert(/^Stretch/.test(UI.pmTitle()), 'Stretch PM: ' + UI.pmTitle());
    var a = rfBAScr([35, -5]), b = rfBAScr([45, 25]);
    await selDrag([Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
    var sel = anvil.selection().map(function (s) { return s.index; });
    assert(sel.length === 1 && sel[0] === 1, 'window picks the right side only: ' + JSON.stringify(anvil.selection()));
    var u0 = UI.App.undo.length;
    UI.pmSetValue('mode', 'xy'); UI.renderPM(); UI.pmSetValue('dx', 10); UI.pmSetValue('dy', 0);
    UI.pmOK(); await idle(); await wait(20);
    var E = UI.activeSketchFeature().entities;
    near(E[1].x1, 50, 1e-6, 'right side moved'); near(E[1].x2, 50, 1e-6, 'right side moved (top end)');
    near(E[0].x2, 50, 1e-6, 'bottom stretched'); near(E[0].x1, 0, 1e-6, 'bottom keeps its left end');
    near(E[2].x1, 50, 1e-6, 'top stretched'); near(E[2].x2, 0, 1e-6, 'top keeps its left end');
    near(E[3].x1, 0, 1e-6, 'left side stays'); near(E[3].x2, 0, 1e-6, 'left side stays');
    assert(UI.App.undo.length - u0 <= 1, 'one undo step: ' + (UI.App.undo.length - u0));
    assert(errors.length === errs0, 'no page errors: ' + errors.slice(errs0).join(' | '));
    return 'stretched to ' + (E[0].x2 - E[0].x1);
  });
  // --- end rfBA ---
