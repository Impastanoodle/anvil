  // --- rfBP ---
  // (2026-10-13, lane BP) The user's Enter rule, the same in every command: "the Enter key completes a unit insertion
  // only; the second hit closes the whole function". Enter in a value box with a new entry commits it and keeps the
  // PropertyManager open (the status says so); Enter with nothing pending is ✓ (ui-commands.js pmEnter). The same
  // for a sketch tool's PM and a Transform command. Parallel Line: a click places the preview and pops up the
  // distance box by the cursor; Enter commits a typed distance, Enter again makes the line and closes. Circle: the
  // same box opens by itself after the centre click with the live size; Enter commits, Enter makes the circle and
  // closes the tool; a click still places at the clicked size. A chain tool's box (Line): Enter places the typed
  // segment, Enter with nothing typed ends the tool. Uses the helpers of r3-sketch3, refine-sketcher, p9-sketchtab,
  // selection and rfBJ (the group files share one scope).
  function rfBPDepthBox() { return D.querySelector('#pm input.pm-num[data-key="depth"]'); }

  step('rfBP: Boss-Extrude — a depth typed in the box and Enter keeps the PropertyManager open with the value applied, the box focused and the status saying "press Enter again to finish"; the second Enter is ✓ (depth 12 committed, the PM closed); a box focused with nothing new typed closes on one Enter', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").circle(0, 0, 5);'); await idle();
    UI.cmdExtrude(false); await wait(30);
    var inp = rfBPDepthBox();
    assert(inp && UI.pmTitle() === 'Boss-Extrude', 'Boss-Extrude PM with a Depth box: ' + UI.pmTitle());
    inp.focus(); inp.select();
    r3sType(inp, '12');
    var ev = pressEnter(inp);
    assert(ev.defaultPrevented && UI.hasPM() && UI.pmTitle() === 'Boss-Extrude', 'the first Enter kept the PM open');
    assert(UI.pmSpec().values.depth === 12 && +inp.value === 12, 'the value is applied: ' + UI.pmSpec().values.depth);
    assert(D.activeElement === inp, 'the box keeps the focus');
    assert(/^Depth\b.*\b12 mm — press Enter again to finish/.test(statusText()), 'status: ' + statusText());
    pressEnter(inp); await idle(); await wait(20);
    assert(!UI.hasPM(), 'the second Enter is ✓');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'extrude' && f.depth === 12, 'committed depth ' + f.depth);
    // nothing new typed: one Enter is ✓
    UI.editFeature(f); await wait(30);
    inp = rfBPDepthBox();
    assert(inp && UI.hasPM(), 'editing the extrude');
    inp.focus(); inp.select();
    pressEnter(inp); await idle(); await wait(20);
    assert(!UI.hasPM(), 'Enter with nothing pending closed the PM');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'depth 12, two Enters';
  });

  step('rfBP: a sketch tool\'s PropertyManager (Insert Line ▸ Angle: Length) — a typed length and Enter keeps the PM and the tool, the second Enter is ✓ and puts the tool down; a Transform command (Translate, Delta X 25): Enter commits, Enter again applies and closes, the square moved 25', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.setTool('line'); await wait(20);
    assert(UI.pmTitle() === 'Insert Line', 'Insert Line PM: ' + UI.pmTitle());
    stRadio('orient', 'angle'); await wait(10);
    var len = stField('length');
    assert(len, 'Length box');
    len.focus(); len.select();
    r3sType(len, '25'); pressEnter(len); await wait(10);
    assert(UI.hasPM() && UI.pmTitle() === 'Insert Line' && UI.App.tool === 'line' && UI.pmSpec().values.length === 25, 'Enter committed 25 and kept Insert Line: ' + UI.pmTitle() + ' ' + UI.App.tool);
    assert(/Length 25.*press Enter again to finish/.test(statusText()), 'status: ' + statusText());
    pressEnter(len); await wait(20);
    assert(!UI.hasPM() && UI.App.tool === 'select', 'the second Enter is ✓: the tool is put down: ' + UI.App.tool);
    // Transform ▸ Translate
    var f = await rfBJNew(rfBJSquare(0, 0, 10));
    UI.setSelection([0, 1, 2, 3].map(function (i) { return { kind: 'entity', index: i }; })); await wait(20);
    await rfBJRun('Translate');
    assert(UI.pmTitle() === 'Translate', 'PM ' + UI.pmTitle());
    UI.pmSetValue('op', 'move'); UI.pmSetValue('dy', 0); UI.renderPM(); await wait(10);
    var dx = D.querySelector('#pm input[data-key="dx"]');
    assert(dx, 'Delta X box');
    dx.focus(); dx.select();
    r3sType(dx, '25'); pressEnter(dx); await wait(20);
    assert(UI.hasPM() && UI.pmTitle() === 'Translate' && UI.pmSpec().values.dx === 25, 'Enter committed Delta X 25 and kept Translate open');
    assert(f.entities.length === 4 && UI.App.tempEntities.length >= 4, 'the preview shows it, nothing moved yet');
    var u0 = UI.App.undo.length;
    pressEnter(dx); await idle(); await wait(20);
    assert(!UI.hasPM(), 'the second Enter applied and closed');
    var E = UI.activeSketchFeature().entities;
    rfBJLine(E[0], 25, 0, 35, 0, 'bottom moved 25');
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Insert Line 25, Translate 25';
  });

  step('rfBP: Parallel Line — after the reference, a click places the preview (nothing made) and the distance box pops up by the cursor with the clicked distance selected; typing 12 moves the preview and the PM\'s Distance; Enter commits (box stays, status), Enter again makes exactly one line at 12 with its Parallel and distance dimension, one undo step, and the command is closed', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 });
    UI.updateSketches();
    UI.cmdParallelLine(); await wait(20);
    stRadio('place', 'point');
    rskClick([20, 0]); await wait(20);
    assert(D.querySelector('#pm .pm-pick').classList.contains('filled'), 'reference picked');
    var u0 = UI.App.undo.length;
    rskClick([20, 7]); await wait(20);
    assert(f.entities.length === 1, 'the click made nothing');
    assert(UI.App.tempEntities.length === 1 && Math.abs(UI.App.tempEntities[0].y1 - 7) < 1e-9, 'preview through the clicked point: ' + JSON.stringify(UI.App.tempEntities));
    var b = UI.sketchNumBox();
    assert(b && b.length === 1 && b[0].getAttribute('aria-label') === 'Distance' && +b[0].value === 7, 'the distance box with the clicked distance: ' + (b && b[0].value));
    assert(D.activeElement === b[0] && b[0].selectionStart === 0 && b[0].selectionEnd === b[0].value.length, 'focused with its text selected');
    assert(+stField('d').value === 7, 'the PM\'s Distance shows 7: ' + stField('d').value);
    assert(/Type the distance and press Enter/.test(statusText()), 'prompt: ' + statusText());
    r3sType(b[0], '12');
    assert(UI.App.tempEntities.length === 1 && Math.abs(UI.App.tempEntities[0].y1 - 12) < 1e-9, 'typing moves the preview: ' + JSON.stringify(UI.App.tempEntities));
    assert(+stField('d').value === 12, 'the PM\'s Distance follows: ' + stField('d').value);
    pressEnter(b[0]); await wait(20);
    assert(UI.hasPM() && UI.parallelLineActive() && UI.sketchNumBox() && f.entities.length === 1, 'the first Enter commits: the command and the box stay, nothing made');
    assert(/Distance 12.*press Enter again to finish/.test(statusText()), 'status: ' + statusText());
    assert(Math.abs(UI.App.tempEntities[0].y1 - 12) < 1e-9, 'preview at 12');
    pressEnter(UI.sketchNumBox()[0]); await wait(20);
    assert(f.entities.length === 2 && !UI.hasPM() && !UI.parallelLineActive() && !UI.sketchNumBox(), 'the second Enter made one line and closed Parallel Line: ' + f.entities.length);
    stLine(f.entities[1], 0, 12, 40, 12, 'parallel at 12');
    assert(stRels().indexOf('parallel 0/1') >= 0, 'Parallel: ' + stRels().join(', '));
    var dim = (f.rels || []).filter(function (r) { return r.type === 'distance' && r.refs.join() === '0,1'; })[0];
    assert(dim && Math.abs(dim.v - 12) < 1e-9, 'distance dimension 12: ' + JSON.stringify(f.rels));
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'one line at 12';
  });

  step('rfBP: Circle — after the centre click the size box pops up by the cursor with the live radius selected (no setting needed); 1.5 typed and Enter commits (preview R 1.5 holds while the mouse moves, box stays), Enter again makes exactly one circle R 1.5 and closes the tool; Enter on the live value commits it; a click instead of typing places the circle at the clicked size and keeps the tool', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = UI.activeSketchFeature();
    assert(!UI.sketchNumericInput(), 'on-screen numeric input is off (the Circle box opens anyway)');
    UI.setTool('circle'); rskClick([10, 10]); selEv('mousemove', rskScr([14, 10]));
    var b = UI.sketchNumBox();
    assert(b && b.length === 2 && b[0].getAttribute('aria-label') === 'Radius' && b[1].getAttribute('aria-label') === 'Diameter', 'the R / Ø box opened by itself after the centre click');
    near(+b[0].value, 4, 0.05, 'live radius'); near(+b[1].value, 8, 0.05, 'live diameter');
    assert(D.activeElement === b[0], 'focused on the radius');
    r3sType(b[0], '1.5');
    pressEnter(b[0]);
    assert(f.entities.length === 0 && UI.App.tool === 'circle' && UI.sketchNumBox(), 'the first Enter made nothing: the box stays and the tool goes on');
    assert(/Radius 1.5.*press Enter again to finish/.test(statusText()), 'status: ' + statusText());
    selEv('mousemove', rskScr([19, 10]));
    var tmp = UI.App.tempEntities[0];
    assert(tmp && tmp.t === 'circle' && Math.abs(tmp.r - 1.5) < 1e-9, 'the committed size holds while the mouse moves: ' + JSON.stringify(tmp));
    pressEnter(UI.sketchNumBox()[0]); await wait(20);
    var circles = f.entities.filter(function (e) { return e.t === 'circle'; });
    assert(circles.length === 1 && Math.abs(circles[0].r - 1.5) < 1e-9 && circles[0].cx === 10 && circles[0].cy === 10, 'the second Enter made one circle R 1.5: ' + JSON.stringify(f.entities));
    assert(UI.App.tool === 'select' && !UI.sketchNumBox() && !UI.hasPM(), 'the Circle tool is closed: ' + UI.App.tool);
    assert((f.dims || []).some(function (d) { return d.e === 0 && d.k === 'dia'; }), 'typed size dimensioned: ' + JSON.stringify(f.dims));
    // Enter on the live value: it holds, Enter again makes it
    UI.setTool('circle'); rskClick([30, 10]); selEv('mousemove', rskScr([33, 10]));
    b = UI.sketchNumBox();
    pressEnter(b[0]);
    selEv('mousemove', rskScr([38, 10]));
    tmp = UI.App.tempEntities[0];
    assert(tmp && Math.abs(tmp.r - 3) < 1e-9 && UI.sketchNumBox(), 'Enter on the live value holds it at 3: ' + JSON.stringify(tmp));
    pressEnter(UI.sketchNumBox()[0]); await wait(20);
    circles = f.entities.filter(function (e) { return e.t === 'circle'; });
    assert(circles.length === 2 && Math.abs(circles[1].r - 3) < 1e-9 && UI.App.tool === 'select', 'second circle R 3, tool closed');
    // a click still places at the clicked size and keeps the tool
    UI.setTool('circle'); rskClick([50, 10]); rskClick([54, 10]); await wait(10);
    circles = f.entities.filter(function (e) { return e.t === 'circle'; });
    assert(circles.length === 3 && Math.abs(circles[2].r - 4) < 1e-9 && UI.App.tool === 'circle', 'a click places R 4 and keeps the tool: ' + UI.App.tool);
    selKey('Escape'); UI.setTool('select');
    // a chain tool's box (Line, numeric input on): Enter places the typed segment, Enter with nothing typed ends the tool
    UI.sketchNumericInput(true);
    try {
      UI.setTool('line'); rskClick([0, 30]); selEv('mousemove', rskScr([10, 30.01]));
      b = UI.sketchNumBox();
      assert(b && D.activeElement === b[0], 'the Line box opened by itself');
      r3sType(b[0], '20'); pressEnter(b[0]);
      var l = f.entities[f.entities.length - 1];
      assert(l.t === 'line' && Math.abs(l.x2 - l.x1 - 20) < 1e-9 && UI.App.tool === 'line', 'Enter placed the 20 segment, the chain goes on');
      selEv('mousemove', rskScr([30, 45]));
      b = UI.sketchNumBox();
      assert(b && D.activeElement === b[0] && b[0].value !== '', 'the box reopened for the next segment with the live length');
      var n = f.entities.length;
      pressEnter(b[0]); await wait(10);
      assert(UI.App.tool === 'select' && f.entities.length === n && !UI.sketchNumBox(), 'Enter with nothing typed ended the tool, no segment added: ' + UI.App.tool + ' ' + f.entities.length);
    } finally { UI.sketchNumericInput(false); }
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'circle R 1.5 by Enter, Enter';
  });
  // --- end rfBP ---
