  // ---- rfBL (lane BL, 2026-10-13): Mastercam's Transform tab, Offset ▸ Entity / Chains and Layout ▸ Rectangular Array /
  // Distribute (ui-transform-layout.js), driven with real mouse events in a Front sketch; the commands are called as
  // UI.cmdT…() (the ribbon buttons are another lane's)
  function rfBLScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfBLClick(uv, mods) { selClick(rfBLScr(uv), mods); }
  function rfBLSk() { return UI.activeSketchFeature(); }
  async function rfBLNew(ents) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    var f = rfBLSk();
    ents.forEach(function (e) { f.entities.push(JSON.parse(JSON.stringify(e))); });
    UI.zoomView(0.25 / UI.cam.scale);   // 0.25 mm per pixel
    UI.App.gridStale = true; UI.updateSketches(); await idle();
    return f;
  }
  function rfBLSet(key, val) {
    var i = D.querySelector('#pm input[data-key="' + key + '"]');
    assert(i, 'no ' + key + ' box in the PropertyManager');
    i.focus(); i.value = String(val); i.dispatchEvent(new W.Event('input', { bubbles: true }));
  }
  function rfBLRadio(key, val) {
    var r = D.querySelector('#pm input[data-key="' + key + ':' + val + '"]');
    assert(r, 'no option ' + key + ' = ' + val);
    r.click();
  }
  async function rfBLOK(plus) {
    var b = plus ? D.querySelector('#pm .pm-actions button[title^="Apply"]') : D.querySelector('#pm .pm-ok');
    assert(b, plus ? 'no ✓+ (Apply) button' : 'no ✓ button');
    b.click(); await idle(); await wait(20);
  }
  function rfBLUndo() { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); }
  function rfBLSel() { return UI.selection().filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; }).sort(function (a, b) { return a - b; }); }
  function rfBLHas(list, want, label) {
    var hit = list.filter(function (e) { return e.t === want.t && Object.keys(want).every(function (k) { return k === 't' || Math.abs(e[k] - want[k]) < 1e-9; }); });
    assert(hit.length === 1, label + ': ' + JSON.stringify(want) + ' not once in ' + JSON.stringify(list));
  }
  // the L of tests/kernel/rfBL.js: a 45° chamfer, a concave fillet R5, a convex fillet R5
  var rfBLL = [
    { t: 'line', x1: 0, y1: 0, x2: 60, y2: 0 }, { t: 'line', x1: 60, y1: 0, x2: 60, y2: 15 }, { t: 'line', x1: 60, y1: 15, x2: 55, y2: 20 },
    { t: 'line', x1: 55, y1: 20, x2: 25, y2: 20 }, { t: 'arc', cx: 25, cy: 25, r: 5, a0: 180, a1: 270 }, { t: 'line', x1: 20, y1: 25, x2: 20, y2: 50 },
    { t: 'line', x1: 20, y1: 50, x2: 5, y2: 50 }, { t: 'arc', cx: 5, cy: 45, r: 5, a0: 90, a1: 180 }, { t: 'line', x1: 0, y1: 45, x2: 0, y2: 0 }
  ];
  step('rfBL: Offset Chains (Mastercam Offset Contour) — outside a sketch it says to open one; a click on one line of a rounded-corner L takes the whole closed chain; Both sides at 2 with Corners None / Sharp / All: inside the fillets are R7 / R3 and the corners trimmed, outside R3 / R7 with sharp, 90°-only or every corner rounded (R2 on the vertex); ✓ is one undo step and leaves the result selected; Move (Right, 2 copies at 3) takes the original away and the second copy loses the concave fillet (it shrinks to nothing at 6)', async function () {
    need(UI, 'cmdTOffsetChains');
    await anvil.newPart(); await idle();
    UI.cmdTOffsetChains();
    assert(!UI.pmSpec() || UI.pmSpec().title !== 'Offset Chains', 'no PropertyManager outside a sketch');
    var t = D.querySelector('.toast');
    assert(t && t.textContent === 'Open a sketch: Transform acts on sketch geometry', 'toast: ' + (t && t.textContent));
    await rfBLNew(rfBLL);
    var T = Math.tan(Math.PI / 8), counts = { none: 9, sharp: 12, all: 14 };
    for (var mode in counts) {
      UI.cmdTOffsetChains();
      assert(UI.pmSpec() && UI.pmSpec().title === 'Offset Chains', 'Offset Chains PM open');
      rfBLClick([30, 0]); await idle();
      var v = UI.pmSpec().values;
      assert(v.chains.length === 1 && v.chains[0].closed && v.chains[0].items.length === 9, 'one closed chain of 9: ' + JSON.stringify(v.chains));
      assert(rfBLSel().length === 9, 'the chain shows selected: ' + rfBLSel().join());
      rfBLSet('d', 2); rfBLRadio('side', 'both'); rfBLRadio('corners', mode);
      assert(UI.App.tempEntities.length === 9 + counts[mode], mode + ': preview of ' + (9 + counts[mode]) + ', got ' + UI.App.tempEntities.length);
      var undo0 = UI.App.undo.length;
      await rfBLOK();
      var f = rfBLSk(), added = f.entities.slice(9);
      assert(!UI.pmSpec() && UI.App.undo.length === undo0 + 1, 'closed by ✓, one undo step');
      assert(added.length === 9 + counts[mode], mode + ': ' + added.length + ' entities');
      assert(rfBLSel().join() === added.map(function (e, k) { return 9 + k; }).join(), 'the result is selected: ' + rfBLSel().join());
      // inside: trimmed corners, fillets R7 / R3
      rfBLHas(added, { t: 'arc', cx: 25, cy: 25, r: 7, a0: 180, a1: 270 }, mode + ' inside concave fillet');
      rfBLHas(added, { t: 'arc', cx: 5, cy: 45, r: 3, a0: 90, a1: 180 }, mode + ' inside convex fillet');
      rfBLHas(added, { t: 'line', x1: 2, y1: 2, x2: 58, y2: 2 }, mode + ' inside bottom');
      // outside
      rfBLHas(added, { t: 'arc', cx: 25, cy: 25, r: 3, a0: 180, a1: 270 }, mode + ' outside concave fillet');
      rfBLHas(added, { t: 'arc', cx: 5, cy: 45, r: 7, a0: 90, a1: 180 }, mode + ' outside convex fillet');
      if (mode === 'none') {
        rfBLHas(added, { t: 'line', x1: -2, y1: -2, x2: 62, y2: -2 }, 'None: sharp corners');
        rfBLHas(added, { t: 'line', x1: 62, y1: 15 + 2 * T, x2: 55 + 2 * T, y2: 22 }, 'None: chamfer');
      } else {
        rfBLHas(added, { t: 'arc', cx: 60, cy: 0, r: 2, a0: 270, a1: 360 }, mode + ': R2 on (60, 0)');
        rfBLHas(added, { t: 'arc', cx: 0, cy: 0, r: 2, a0: 180, a1: 270 }, mode + ': R2 on (0, 0)');
        rfBLHas(added, { t: 'arc', cx: 20, cy: 50, r: 2, a0: 0, a1: 90 }, mode + ': R2 on (20, 50)');
        if (mode === 'sharp') rfBLHas(added, { t: 'line', x1: 62, y1: 0, x2: 62, y2: 15 + 2 * T }, 'Sharp: the 135° corner stays sharp');
        else rfBLHas(added, { t: 'arc', cx: 60, cy: 15, r: 2, a0: 0, a1: 45 }, 'All: R2 on the 135° corner');
      }
      rfBLUndo(); await idle();
      assert(rfBLSk().entities.length === 9, 'Ctrl+Z takes the whole offset back: ' + rfBLSk().entities.length);
    }
    // Move, Right (outside of the counter-clockwise chain), 2 copies: the L goes, two offsets at 3 and 6 stay
    UI.cmdTOffsetChains();
    rfBLClick([20, 40]); await idle();
    rfBLRadio('mode', 'move'); rfBLSet('d', 3); rfBLRadio('side', 'right'); rfBLSet('count', 2); rfBLRadio('corners', 'none');
    await rfBLOK();
    var g = rfBLSk().entities;
    // at 6 the concave fillet R5 shrinks away: its neighbours meet sharp at (26, 26), so the second copy has 8
    assert(g.length === 17, 'Move: 9 + 8 entities, the original gone: ' + g.length);
    rfBLHas(g, { t: 'line', x1: 55 + 6 * T, y1: 26, x2: 26, y2: 26 }, 'copy 2: the fillet gone, sharp at (26, 26)');
    rfBLHas(g, { t: 'line', x1: 26, y1: 26, x2: 26, y2: 56 }, 'copy 2 upright from (26, 26)');
    rfBLHas(g, { t: 'arc', cx: 5, cy: 45, r: 8, a0: 90, a1: 180 }, 'copy 1 fillet R8');
    rfBLHas(g, { t: 'arc', cx: 5, cy: 45, r: 11, a0: 90, a1: 180 }, 'copy 2 fillet R11');
    rfBLHas(g, { t: 'line', x1: -6, y1: -6, x2: 66, y2: -6 }, 'copy 2 bottom');
    assert(!g.some(function (e) { return e.t === 'line' && e.y1 === 0 && e.y2 === 0; }), 'the original bottom line is gone');
    return 'None 18 · Sharp 21 · All 23 · Move 17';
  });
  step('rfBL: Offset Entity — the arc is picked, the preview follows the cursor\'s side, a click outside sets it; 3 copies at 2: concentric R12, R14, R16 (each the one before offset again); Flip side gives R8, R6, R4; ✓+ applies and stays open for the next entity; Move on a line leaves only its copy', async function () {
    need(UI, 'cmdTOffsetEntity');
    await rfBLNew([{ t: 'arc', cx: 0, cy: 0, r: 10, a0: 30, a1: 150 }, { t: 'line', x1: -20, y1: -20, x2: 20, y2: -20 }]);
    UI.cmdTOffsetEntity();
    assert(UI.pmSpec() && UI.pmSpec().title === 'Offset Entity', 'Offset Entity PM open');
    rfBLClick([0, 10]); await idle();
    var v = UI.pmSpec().values;
    assert(v.ent === 0 && v.box === 'side', 'the arc is picked, waiting for the side: ' + JSON.stringify({ ent: v.ent, box: v.box }));
    rfBLSet('d', 2); rfBLSet('count', 3);
    selEv('mousemove', rfBLScr([0, 6])); await idle();
    var pv = UI.App.tempEntities;
    assert(pv.length === 3 && Math.abs(pv[0].r - 8) < 1e-9, 'the preview inside under the cursor: ' + JSON.stringify(pv));
    rfBLClick([0, 13]); await idle();
    assert(v.side && v.box === 'done', 'side set by the click');
    pv = UI.App.tempEntities;
    assert(pv.length === 3 && [12, 14, 16].every(function (r, k) { return Math.abs(pv[k].r - r) < 1e-9; }), 'preview R12 R14 R16: ' + JSON.stringify(pv));
    D.querySelectorAll('#pm .pm-btns button').forEach(function (b) { if (b.textContent === 'Flip side') b.click(); });
    pv = UI.App.tempEntities;
    assert([8, 6, 4].every(function (r, k) { return Math.abs(pv[k].r - r) < 1e-9; }), 'flipped R8 R6 R4: ' + JSON.stringify(pv));
    D.querySelectorAll('#pm .pm-btns button').forEach(function (b) { if (b.textContent === 'Flip side') b.click(); });
    await rfBLOK(true);
    var f = rfBLSk();
    assert(UI.pmSpec() && UI.pmSpec().title === 'Offset Entity' && UI.pmSpec().values.box === 'ent', '✓+ keeps the PM open for the next entity');
    assert(f.entities.length === 5, '3 copies added: ' + f.entities.length);
    [12, 14, 16].forEach(function (r, k) { rfBLHas([f.entities[2 + k]], { t: 'arc', cx: 0, cy: 0, r: r, a0: 30, a1: 150 }, 'copy ' + (k + 1)); });
    // the next entity in the same PropertyManager: the line, moved 5 below
    rfBLClick([0, -20]); await idle();
    v = UI.pmSpec().values;
    assert(v.ent === 1, 'the line picked: ' + v.ent);
    rfBLRadio('mode', 'move'); rfBLSet('d', 5); rfBLSet('count', 1);
    rfBLClick([0, -30]); await idle();
    await rfBLOK();
    f = rfBLSk();
    assert(!UI.pmSpec() && f.entities.length === 5, 'the line moved (its copy only): ' + f.entities.length);
    rfBLHas(f.entities, { t: 'line', x1: -20, y1: -25, x2: 20, y2: -25 }, 'the line 5 below');
    assert(rfBLSel().join() === '4', 'the moved line selected: ' + rfBLSel().join());
    return 'R12 R14 R16 · line moved';
  });
  step('rfBL: Rectangular Array 3 × 4 at 15° — a circle and a line clicked into the box, Direction 1: 3 at 10, 15°; Direction 2: 4 at 8, 90° from direction 1: 11 copies of each at exact centres i·10·(cos 15°, sin 15°) + j·8·(cos 105°, sin 105°); the original is instance 1, 1; one undo step', async function () {
    need(UI, 'cmdTRectArray');
    await rfBLNew([{ t: 'circle', cx: 0, cy: 0, r: 2 }, { t: 'line', x1: -2, y1: -3, x2: 2, y2: -3 }]);
    UI.cmdTRectArray();
    rfBLClick([0, 2]); rfBLClick([0, -3]); await idle();
    var v = UI.pmSpec().values;
    assert(v.entities.join() === '0,1', 'both entities in the box: ' + v.entities.join());
    rfBLSet('n1', 3); rfBLSet('d1', 10); rfBLSet('a1', 15); rfBLSet('n2', 4); rfBLSet('d2', 8); rfBLSet('a2', 90);
    assert(UI.App.tempEntities.length === 22, 'preview 11 × 2: ' + UI.App.tempEntities.length);
    var u0 = UI.App.undo.length;
    await rfBLOK();
    var f = rfBLSk(), circles = f.entities.filter(function (e) { return e.t === 'circle'; }), a = 15 * Math.PI / 180, b = 105 * Math.PI / 180;
    assert(f.entities.length === 24 && circles.length === 12 && UI.App.undo.length === u0 + 1, '12 circles, 24 entities, one undo step: ' + f.entities.length);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 4; j++) {
      var cx = i * 10 * Math.cos(a) + j * 8 * Math.cos(b), cy = i * 10 * Math.sin(a) + j * 8 * Math.sin(b);
      rfBLHas(circles, { t: 'circle', cx: cx, cy: cy, r: 2 }, 'instance ' + (i + 1) + ', ' + (j + 1));
      rfBLHas(f.entities, { t: 'line', x1: -2 + cx, y1: -3 + cy, x2: 2 + cx, y2: -3 + cy }, 'line of instance ' + (i + 1) + ', ' + (j + 1));
    }
    assert(rfBLSel().length === 22 && rfBLSel()[0] === 2, 'the copies are selected');
    rfBLUndo(); await idle();
    assert(rfBLSk().entities.length === 2, 'Ctrl+Z: back to the original');
    return '12 instances';
  });
  step('rfBL: Distribute five circles (window-selected in the box) along X — evenly by centers: 0, 15, 30, 45, 60; evenly by gaps: the four gaps all 10 (centers 0, 15, 29, 44, 60); fixed gap 5: 0, 10, 19, 29, 40; Y untouched', async function () {
    need(UI, 'cmdTDistribute');
    var C = [{ t: 'circle', cx: 0, cy: 0, r: 2 }, { t: 'circle', cx: 7, cy: 3, r: 3 }, { t: 'circle', cx: 15, cy: 0, r: 1 }, { t: 'circle', cx: 31, cy: -2, r: 4 }, { t: 'circle', cx: 60, cy: 0, r: 2 }];
    await rfBLNew(C);
    function xs() { return rfBLSk().entities.map(function (e) { return e.cx; }); }
    function ys() { return rfBLSk().entities.map(function (e) { return e.cy; }).join(); }
    UI.cmdTDistribute();
    await selDrag(rfBLScr([-10, 12]), rfBLScr([70, -12]));
    var v = UI.pmSpec().values;
    assert(v.entities.join() === '0,1,2,3,4', 'the window took the five circles: ' + v.entities.join());
    assert(UI.App.tempEntities.length === 3, 'the three middle circles previewed: ' + UI.App.tempEntities.length);
    await rfBLOK();
    [0, 15, 30, 45, 60].forEach(function (x, k) { near(xs()[k], x, 1e-9, 'by centers, circle ' + (k + 1)); });
    assert(ys() === '0,3,0,-2,0', 'Y untouched: ' + ys());
    rfBLUndo(); await idle();
    assert(xs().join() === '0,7,15,31,60', 'Ctrl+Z puts them back: ' + xs().join());
    UI.cmdTDistribute();
    await selDrag(rfBLScr([-10, 12]), rfBLScr([70, -12]));
    rfBLRadio('by', 'gaps');
    await rfBLOK();
    [0, 15, 29, 44, 60].forEach(function (x, k) { near(xs()[k], x, 1e-9, 'by gaps, circle ' + (k + 1)); });
    rfBLUndo(); await idle();
    UI.cmdTDistribute();
    await selDrag(rfBLScr([-10, 12]), rfBLScr([70, -12]));
    rfBLRadio('method', 'fixed'); rfBLSet('spacing', 5); rfBLRadio('by', 'gaps');
    await rfBLOK();
    [0, 10, 19, 29, 40].forEach(function (x, k) { near(xs()[k], x, 1e-9, 'fixed gap 5, circle ' + (k + 1)); });
    return xs().join();
  });
