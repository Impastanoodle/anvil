  // --- rfCN (2026-10-14, lane CN: sketch-input fixes) --- four verified defects of the sketch's input paths, each with
  // a step that failed on the code before: (0) the Line chain's double-click bookkeeping once the undo stack is full
  // (60 snapshots: pushUndo shifts the oldest, so "the stack grew" was false for every click and the discarded segment
  // came back on Ctrl+Z); (1) the Circle box's second Enter committed again instead of closing whenever the untyped
  // twin field re-rounded (R .313 held makes Ø .626 where the live value showed .625); (2) Parallel Line's distance box
  // swallowed Ctrl+Z (the command stayed open); (3) the PM's Reference box clicked with a preview placed left the
  // distance box live, and Enter, Enter in it closed the command with no line. Uses rskNew / rskClick / rskScr /
  // rskEnts (refine-sketcher), selClick / selEv / selKey (selection), stRadio (sketch-tools), stLine (p9-sketchtab),
  // r3sType (r3-sketch3), pressEnter / enterTwice and UI.sketchNumBox.
  function rfCNCtrl(el, key) { var ev = new W.KeyboardEvent('keydown', { key: key, ctrlKey: true, bubbles: true, cancelable: true }); (el || D).dispatchEvent(ev); return ev; }
  function rfCNPreview() { return D.querySelectorAll('.sk-preview, .sk-trim-pick, .sk-trim-span').length + UI.App.tempEntities.length; }

  step('rfCN: Line chain ended by a double-click with the undo stack full (60 steps) — click, click, then two clicks 2 px apart: one segment left, and the first Ctrl+Z undoes THAT segment (before: the double-click\'s own snapshots stayed on the full stack, and Ctrl+Z brought the discarded segment back)', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    while (UI.App.undo.length < 60) UI.pushUndo();   // the cap of ui-core.js pushUndo: from here every push shifts the oldest and the length stays 60
    assert(UI.App.undo.length === 60, 'undo stack full: ' + UI.App.undo.length);
    UI.setTool('line'); rskClick([0, 0]); rskClick([20, 0]);
    assert(rskEnts().length === 1 && UI.App.undo.length === 60, 'the first segment placed into the full stack: ' + rskEnts().length + ' / ' + UI.App.undo.length);
    var p = rskScr([40, 0]);
    selClick(p); selClick([p[0] + 2, p[1]]); selEv('dblclick', [p[0] + 2, p[1]], $('viewport'));
    var e = rskEnts();
    assert(e.length === 1 && e[0].x2 === 20 && e[0].y2 === 0, 'one segment, the chain ends at (20, 0): ' + JSON.stringify(e));
    assert(!UI.App.toolState.pts.length && UI.App.tool === 'line', 'chain ended, the Line tool stays');
    rfCNCtrl(null, 'z'); await idle(); await wait(20);
    assert(UI.App.mode === 'sketch', 'still in the sketch');
    assert(rskEnts().length === 0, 'the first Ctrl+Z undid the segment placed before the double-click, not one of the double-click\'s own: ' + JSON.stringify(rskEnts()));
    selKey('Escape'); await wait(10);
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'full stack: double-click snapshots taken back, Ctrl+Z undid (0,0)-(20,0)';
  });

  step('rfCN: Circle box in inches — Enter on a live radius whose doubling re-rounds the diameter (R .313 held makes Ø .626 where the live value showed .625) commits it, and the SECOND Enter makes the circle at that radius and closes the tool (before: it committed again, a third Enter was needed)', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = UI.activeSketchFeature();
    UI.App.model.units = 'in';   // the suite's documents are metric; the shop types inches, 3 places (UI.fmtNum(v, 3))
    try {
      // the deepest zoom (0.0005 in per pixel, ui-core.js zoomView's floor), about the origin: the free point and the
      // live length are rounded to the nicest value within half a pixel (inferPoint niceRound), so at the suite's
      // 0.25 per pixel a live radius has at most one decimal and 2 × R always equals Ø; at 0.0005 per pixel about
      // half of the positions land on a .xxx5 radius, the re-rounding case (R .0545 shows .055, Ø .109, 2 × .055 = .110)
      var o = rskScr([0, 0]);
      UI.zoomView(0.0005 / UI.cam.scale, o[0], o[1]); UI.App.gridStale = true; await wait(20);
      UI.setTool('circle'); rskClick([0, 0]);
      var b = UI.sketchNumBox();
      assert(b && b.length === 2 && b[0].getAttribute('aria-label') === 'Radius' && b[1].getAttribute('aria-label') === 'Diameter', 'the R / Ø box opened after the centre click');
      // a cursor position where round3(2 * round3(L)) differs from round3(2 L): about half of them, well off the axes
      var c = rskScr([0, 0]), found = null;
      for (var k = 0; k < 60 && !found; k++) {
        selEv('mousemove', [c[0] + 100 + k, c[1] - 40]); await wait(20);   // moves are handled per frame: let the box follow
        if (UI.fmtNum(2 * parseFloat(b[0].value), 3) !== b[1].value) found = { r: b[0].value, d: b[1].value };
      }
      assert(found, 'no cursor position with a re-rounding diameter found: R ' + b[0].value + ' Ø ' + b[1].value);
      pressEnter(b[0]); await wait(20);
      assert(f.entities.length === 0 && UI.App.tool === 'circle' && UI.sketchNumBox(), 'the first Enter committed R ' + found.r + ' (box stays, tool goes on)');
      assert(/press Enter again/.test(statusText()), 'status after the first Enter: ' + statusText());
      assert(UI.fmtNum(2 * parseFloat(found.r), 3) === UI.sketchNumBox()[1].value, 'Ø follows the held radius: ' + UI.sketchNumBox()[1].value);
      pressEnter(UI.sketchNumBox()[0]); await wait(20);
      var circles = f.entities.filter(function (e) { return e.t === 'circle'; });
      assert(circles.length === 1 && Math.abs(circles[0].r - parseFloat(found.r)) < 1e-9, 'the second Enter made one circle R ' + found.r + ': ' + JSON.stringify(f.entities));
      assert(UI.App.tool === 'select' && !UI.sketchNumBox(), 'the Circle tool is closed after the second Enter: ' + UI.App.tool + (UI.sketchNumBox() ? ' (box still open)' : ''));
    } finally { UI.App.model.units = 'mm'; }
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'R ' + found.r + ' (live Ø ' + found.d + '): Enter, Enter made the circle';
  });

  step('rfCN: Parallel Line — the preview placed by a click, its distance box has the keyboard: Ctrl+Z with nothing newly typed cancels the command (box, preview and PropertyManager gone, no line, no undo step), as in a command\'s own boxes; a half-typed value leaves Ctrl+Z to the box; Ctrl+Y cancels too', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 });
    UI.updateSketches();
    var undo0 = UI.App.undo.length;
    UI.cmdParallelLine(); await wait(20);
    stRadio('place', 'point');
    rskClick([20, 0]); await wait(20);
    selEv('mousemove', rskScr([20, 6])); rskClick([20, 6]); await wait(20);
    var ub = UI.sketchNumBox();
    assert(ub && D.activeElement === ub[0] && UI.App.tempEntities.length === 1 && UI.parallelLineActive(), 'the preview floats and the distance box has the keyboard');
    // half typed: the box keeps Ctrl+Z for its own text undo, the command stays
    r3sType(ub[0], '12'); await wait(10);
    var ev1 = rfCNCtrl(ub[0], 'z'); await wait(20);
    assert(!ev1.defaultPrevented && UI.hasPM() && UI.parallelLineActive() && UI.sketchNumBox() && UI.sketchNumBox()[0] === ub[0], 'a half-typed value: Ctrl+Z is the box\'s, the command stays open');
    pressEnter(ub[0]); await wait(20);
    assert(UI.sketchNumBox() && UI.hasPM() && f.entities.length === 1 && UI.App.tempEntities.length === 1, 'Enter committed 12, the command goes on with its preview');
    // nothing newly typed: Ctrl+Z cancels the whole command
    var ev2 = rfCNCtrl(UI.sketchNumBox()[0], 'z'); await idle(); await wait(20);
    assert(ev2.defaultPrevented, 'the box took the Ctrl+Z');
    assert(!UI.sketchNumBox() && !UI.hasPM() && !UI.parallelLineActive(), 'Ctrl+Z cancelled Parallel Line: the box and the PropertyManager are closed');
    assert(rfCNPreview() === 0, 'no preview or temp entity left: ' + rfCNPreview());
    assert(f.entities.length === 1 && UI.App.undo.length === undo0, 'no line made, nothing undone, no undo step: ' + f.entities.length + ' / ' + (UI.App.undo.length - undo0));
    assert(/cancelled/.test(statusText()), 'status: ' + statusText());
    assert(UI.App.mode === 'sketch' && UI.App.tool === 'select', 'still in the sketch, the tool down: ' + UI.App.tool);
    // Ctrl+Y the same
    UI.App.sel = { kind: 'entity', index: 0 }; UI.cmdParallelLine(); await wait(20);
    selEv('mousemove', rskScr([20, 8])); rskClick([20, 8]); await wait(20);
    assert(UI.sketchNumBox() && UI.App.tempEntities.length === 1, 'placed again');
    var ev3 = rfCNCtrl(UI.sketchNumBox()[0], 'y'); await idle(); await wait(20);
    assert(ev3.defaultPrevented && !UI.sketchNumBox() && !UI.hasPM() && rfCNPreview() === 0 && f.entities.length === 1, 'Ctrl+Y cancelled it too');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'Ctrl+Z in the distance box cancels Parallel Line; typed text keeps the box\'s own undo';
  });

  step('rfCN: Parallel Line — a preview placed (distance box open), then the PM\'s Reference box clicked to pick another reference: the distance box closes and the placement is dropped (before: the box stayed live and Enter, Enter in it closed the command with no line); the second line picked, a click and Enter, Enter make the line parallel to it', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 });
    f.entities.push({ t: 'line', x1: 0, y1: 30, x2: 40, y2: 30 });
    UI.updateSketches();
    UI.cmdParallelLine(); await wait(20);
    stRadio('place', 'point');
    rskClick([20, 0]); await wait(20);
    selEv('mousemove', rskScr([20, 6])); rskClick([20, 6]); await wait(20);
    assert(UI.sketchNumBox() && UI.App.tempEntities.length === 1, 'preview placed, the distance box open');
    var pick = D.querySelector('#pm .pm-pick');
    assert(pick && pick.classList.contains('filled') && pick.classList.contains('clickable'), 'the Reference box is filled and clickable');
    pick.click(); await wait(20);
    assert(!UI.sketchNumBox(), 'the distance box closed when the Reference box was clicked');
    assert(UI.hasPM() && UI.parallelLineActive() && UI.App.tempEntities.length === 0, 'back to picking, the placement dropped: ' + JSON.stringify(UI.App.tempEntities));
    assert(/line or edge to be parallel to/.test(statusText()), 'prompt: ' + statusText());
    assert(D.querySelector('#pm .pm-pick').classList.contains('active'), 'the Reference box is the active one');
    // the second line picked: a click places off it, Enter, Enter make the line
    rskClick([20, 30]); await wait(20);
    assert(D.querySelector('#pm .pm-pick').classList.contains('filled') && !UI.sketchNumBox() && f.entities.length === 2, 'the second line picked, nothing placed yet');
    selEv('mousemove', rskScr([20, 36])); rskClick([20, 36]); await wait(20);
    var ub = UI.sketchNumBox();
    assert(ub && D.activeElement === ub[0] && UI.App.tempEntities.length === 1, 'placed off the second line, the box has the keyboard: ' + (ub && ub[0].value));
    var d = parseFloat(ub[0].value);
    near(d, 6, 0.3, 'the clicked distance');
    enterTwice(ub[0]); await wait(20);
    assert(f.entities.length === 3 && !UI.hasPM() && !UI.sketchNumBox(), 'Enter, Enter made the line and closed: ' + f.entities.length + (UI.hasPM() ? ' (PM open)' : ''));
    stLine(f.entities[2], 0, 30 + d, 40, 30 + d, 'parallel to the second line');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'Reference box reactivated: box closed, placement dropped; the next pick made the line at y ' + (30 + d);
  });
