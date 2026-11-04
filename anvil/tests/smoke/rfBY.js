  // --- rfBY ---
  // (2026-10-13, lane BY) The Transform tab and the grey-black look used like a shop user
  // (test-reports/2026-10-13-transform-look-user.md): Ctrl+Z / the Undo button with a command's PropertyManager open
  // cancel the command first and the next Ctrl+Z undoes (a selection PM and a sketch tool's PM undo at once, the tool
  // keeping its PM); a click right on a line's end or a circle's centre selects the sketch point, which a Transform
  // command now takes as its entity; "3" typed over a 3 and Enter commits the entry (the two-Enter rule) instead of
  // closing the command; Mirror and Offset Chains say what is next; the Heads-up toolbar's glyphs use the light ink on
  // the grey-black graphics area in the light theme; the sketch hint is opaque and lets clicks through.
  // Uses rfBJ's helpers (the group files share one scope).
  function rfBYKey(el, key, mods) { el.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, mods || {}))); }
  async function rfBYCtrlZ(el) { rfBYKey(el || D.activeElement || D.body, 'z', { ctrlKey: true }); await idle(); await wait(20); }

  step('rfBY: Ctrl+Z with Translate / Rotate / Boss-Extrude open cancels the command ("… cancelled."), nothing undone; the next Ctrl+Z undoes; typed text in the box keeps Ctrl+Z; the Undo button cancels too; Line Properties and the Line tool undo at once, the Line tool keeping its PM', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew(rfBJSquare(0, 0, 10).concat([{ t: 'circle', cx: 5, cy: 5, r: 1 }]));
    UI.pushUndo();
    var u0 = UI.App.undo.length;
    UI.setSelection([{ kind: 'entity', index: 4 }]);
    await rfBJRun('Translate');
    var box = D.querySelector('#pm input[data-key="dx"]');
    assert(UI.pmTitle() === 'Translate' && D.activeElement === box, 'Translate open with the cursor in Delta X: ' + UI.pmTitle() + ' / ' + (D.activeElement && D.activeElement.getAttribute('data-key')));
    // text typed in the box: Ctrl+Z is the box's own (the command stays)
    box.value = '1.5'; box.dispatchEvent(new W.Event('input', { bubbles: true }));
    await rfBYCtrlZ(box);
    assert(UI.pmTitle() === 'Translate' && UI.App.undo.length === u0, 'typed text: the command stays, nothing undone: ' + UI.pmTitle() + ' / ' + UI.App.undo.length);
    UI.pmCancel(); await idle();
    // nothing typed: the first Ctrl+Z cancels, the second undoes
    UI.setSelection([{ kind: 'entity', index: 4 }]);
    await rfBJRun('Translate');
    await rfBYCtrlZ(D.activeElement);
    assert(!UI.hasPM() && UI.App.undo.length === u0 && f.entities.length === 5 && UI.App.mode === 'sketch', 'first Ctrl+Z: the command cancelled, nothing undone: ' + UI.pmTitle() + ' / ' + UI.App.undo.length + ' / ' + UI.App.mode);
    assert($('status-msg').textContent === 'Translate cancelled.', 'status: ' + $('status-msg').textContent);
    await rfBYCtrlZ(D.body);
    assert(UI.App.undo.length === u0 - 1, 'second Ctrl+Z undoes: ' + UI.App.undo.length);
    await UI.redo(); await idle();
    // the Undo button (and Edit ▸ Undo) with Rotate open
    f = UI.activeSketchFeature();
    UI.setSelection([{ kind: 'entity', index: 4 }]);
    await rfBJRun('Rotate');
    UI.refreshRibbon && UI.refreshRibbon();
    assert(!$('std-undo').disabled, 'the Undo button is live with a command open');
    $('std-undo').click(); await idle(); await wait(20);
    assert(!UI.hasPM() && UI.App.undo.length === u0 && $('status-msg').textContent === 'Rotate cancelled.', 'Undo button: Rotate cancelled, nothing undone: ' + UI.pmTitle() + ' / ' + UI.App.undo.length + ' / ' + $('status-msg').textContent);
    // a PM that only shows the selection: Ctrl+Z undoes at once
    UI.openEntityPM(0); await idle();
    assert(UI.pmTitle() === 'Line Properties', 'Line Properties: ' + UI.pmTitle());
    await rfBYCtrlZ(D.body);
    assert(UI.App.undo.length === u0 - 1, 'Line Properties: Ctrl+Z undoes: ' + UI.App.undo.length);
    await UI.redo(); await idle();
    // the Line tool: Ctrl+Z undoes the last line, the tool keeps its Insert Line PM
    UI.setTool('line'); await idle();
    assert(UI.pmTitle() === 'Insert Line', 'Insert Line: ' + UI.pmTitle());
    await rfBYCtrlZ(D.body);
    assert(UI.App.undo.length === u0 - 1 && UI.App.tool === 'line' && UI.pmTitle() === 'Insert Line', 'Line tool: undone, the tool and its PM stay: ' + UI.App.undo.length + ' / ' + UI.App.tool + ' / ' + UI.pmTitle());
    UI.setTool('select'); await UI.redo(); await idle();
    // a feature PM in the part: Boss-Extrude
    UI.exitSketch(); await idle();
    var nf = UI.App.model.features.length, u1 = UI.App.undo.length;
    UI.cmdExtrude(); await idle(); await wait(30);
    assert(UI.pmTitle() === 'Boss-Extrude', 'Boss-Extrude open: ' + UI.pmTitle());
    await rfBYCtrlZ(D.body);
    assert(!UI.hasPM() && UI.App.undo.length === u1 && UI.App.model.features.length === nf && $('status-msg').textContent === 'Boss-Extrude cancelled.', 'Boss-Extrude cancelled by Ctrl+Z, nothing undone: ' + UI.pmTitle() + ' / ' + UI.App.undo.length + ' / ' + $('status-msg').textContent);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Ctrl+Z cancels the command first';
  });

  step('rfBY: a click right on a line end / circle centre selects the sketch point; Rotate / Translate / Scale / Rectangular Array take its entity and the selection becomes the entity', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew(rfBJSquare(0, 0, 10).concat([{ t: 'circle', cx: 5, cy: 5, r: 1 }]));
    await rfBJClick(rfBJScr([10, 0]));   // the corner: Line1's end (or Line2's start)
    var s = UI.selection();
    assert(s.length === 1 && s[0].kind === 'sketchPoint', 'the click selected the sketch point: ' + JSON.stringify(s));
    var want = parseInt(s[0].ref, 10);
    await rfBJRun('Rotate');
    var v = UI.pmSpec().values;
    assert(v.entities.length === 1 && v.entities[0] === want, 'Rotate took the line: ' + JSON.stringify(v.entities));
    s = UI.selection();
    assert(s.length === 1 && s[0].kind === 'entity' && s[0].index === want, 'the selection is the line: ' + JSON.stringify(s));
    UI.pmCancel(); await idle();
    UI.setSelection([{ kind: 'sketchPoint', ref: '4.c' }]);
    await rfBJRun('Scale');
    assert(UI.pmSpec().values.entities.join() === '4', 'Scale took the circle of its centre: ' + JSON.stringify(UI.pmSpec().values.entities));
    UI.pmCancel(); await idle();
    UI.setSelection([{ kind: 'sketchPoint', ref: '2.p1' }]);
    await rfBJRun('Rectangular Array');
    assert(UI.pmSpec().values.entities.join() === '2', 'Rectangular Array took Line3: ' + JSON.stringify(UI.pmSpec().values.entities));
    UI.pmCancel(); await idle();
    UI.setSelection([{ kind: 'sketchPoint', ref: '4.c' }]);
    await rfBJRun('Translate');
    v = UI.pmSpec().values; v.dx = 2; UI.pmSpec().onChange(v, 'dx');
    await rfBJOk();
    assert(f.entities[4].cx === 7 && f.entities[4].cy === 5, 'the circle moved 2: ' + JSON.stringify(f.entities[4]));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'a point pick is its entity';
  });

  step('rfBY: the two-Enter rule counts typing: "3" typed over Rectangular Array\'s 3 and Enter commits it (the PM stays), the second Enter arrays; Mirror and Offset Chains say what is next', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew(rfBJSquare(0, 0, 10).concat([{ t: 'circle', cx: 30, cy: 30, r: 1 }]));
    UI.setSelection([{ kind: 'entity', index: 4 }]);
    await rfBJRun('Rectangular Array');
    var n1 = D.querySelector('#pm input[data-key="n1"]');
    n1.focus(); await wait(10);
    var was = n1.value;
    n1.value = was; n1.dispatchEvent(new W.Event('input', { bubbles: true }));   // the same text, typed
    rfBYKey(n1, 'Enter'); await idle(); await wait(20);
    assert(UI.pmTitle() === 'Rectangular Array' && /press Enter again/.test($('status-msg').textContent), 'first Enter commits the typed ' + was + ': ' + UI.pmTitle() + ' / ' + $('status-msg').textContent);
    assert(f.entities.length === 5, 'nothing arrayed yet');
    rfBYKey(D.activeElement, 'Enter'); await idle(); await wait(20);
    assert(!UI.hasPM() && f.entities.length > 5, 'the second Enter arrays and closes: ' + UI.pmTitle() + ' / ' + f.entities.length);
    // Mirror with the entity preselected: the status asks for the mirror line, not for entities
    UI.setSelection([{ kind: 'entity', index: 4 }]);
    await rfBJRun('Mirror');
    assert(/^Mirror: pick the mirror line/.test($('status-msg').textContent), 'Mirror prompt: ' + $('status-msg').textContent);
    UI.pmCancel(); await idle();
    // Offset Chains: a click takes the outline; the status says so (it said "4 sketch entities selected.")
    UI.setSelection([]);
    await rfBJRun('Offset Chains');
    var d0 = UI.pmSpec().values.d;
    UI.pmSpec().values.d = 0.5; UI.pmSpec().values.side = 'left';
    await rfBJClick(rfBJScr([5, 0]));
    assert(/^Offset Chains: 1 chain \(4 entities\)/.test($('status-msg').textContent), 'Offset Chains prompt (default d ' + d0 + ', side ' + UI.pmSpec().values.side + '): ' + $('status-msg').textContent);
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'typed entries commit; prompts';
  });

  step('rfBY: Dynamic — 1.25 typed while dragging the X arrow and entered keeps "press Enter again" after the release (it said "Finish the value"); the second Enter moves the circle 1.25', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew(rfBJSquare(0, 0, 10).concat([{ t: 'circle', cx: 5, cy: 5, r: 1 }]));
    UI.setSelection([{ kind: 'entity', index: 4 }]);
    await rfBJRun('Dynamic');
    var dyn = rfBNDyn(), g = dyn.geo(), box = D.querySelector('.tf-dyn-val');
    assert(box, 'the gnomon value box');
    await rfBNDrag(rfBNAlong(g, 'x', 50), rfBNAlong(g, 'x', 70), async function () {
      rfBNKey(W, '1'); await wait(20);
      box.value = '1.25'; rfBNKey(box, 'Enter'); await wait(20);
    });
    assert(UI.pmSpec().values.dx === 1.25, 'typed 1.25: ' + UI.pmSpec().values.dx);
    assert(/press Enter again/.test($('status-msg').textContent), 'after the release: ' + $('status-msg').textContent);
    rfBNKey(box, 'Enter'); await idle(); await wait(20);
    assert(!UI.hasPM() && f.entities[4].cx === 6.25, 'the second Enter moved the circle 1.25: ' + UI.pmTitle() + ' / ' + f.entities[4].cx);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'typed during the drag';
  });

  step('rfBY: the Heads-up toolbar glyphs take the ground\'s ink (dark glyphs on the light theme\'s light ground, user 2026-11-04; light on the grey-black one); the sketch hint is opaque and lets clicks through to the geometry', async function () {
    var th = UI.theme();
    UI.setTheme('light'); await wait(30);
    var f = await rfBJNew(rfBJSquare(0, 0, 10));
    var ico = D.querySelector('#hud button .ico');
    assert(ico, 'a Heads-up toolbar icon');
    var c = W.getComputedStyle(ico).color.match(/\d+/g).map(Number);
    assert(c[0] < 100 && c[1] < 100 && c[2] < 100, 'dark glyphs on the light graphics area: ' + W.getComputedStyle(ico).color);
    UI.setBackground('dark', true);
    c = W.getComputedStyle(ico).color.match(/\d+/g).map(Number);
    assert(c[0] > 180 && c[1] > 180 && c[2] > 180, 'light glyphs on the Dark background: ' + W.getComputedStyle(ico).color);
    UI.setBackground('gradient', true);
    var hint = $('sketch-hint');
    assert(!hint.hidden, 'the sketch hint shows');
    var cs = W.getComputedStyle(hint);
    assert(cs.pointerEvents === 'none', 'the hint lets clicks through: ' + cs.pointerEvents);
    var a = cs.backgroundColor.match(/[\d.]+/g).map(Number);
    assert(a.length < 4 || a[3] >= 0.85, 'an opaque hint ground: ' + cs.backgroundColor);
    // a click on a line under the hint selects the line
    var r = hint.getBoundingClientRect(), vr = $('viewport').getBoundingClientRect();
    var p = [r.left - vr.left + r.width / 2, r.top - vr.top + r.height / 2];
    var uv = UI.screenToPlane(p[0], p[1], UI.activePlane());
    f.entities.push({ t: 'line', x1: uv[0] - 20, y1: uv[1], x2: uv[0] + 20, y2: uv[1] }); UI.updateSketches(); await wait(20);
    var el = D.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    assert(!hint.contains(el), 'the point under the hint belongs to the graphics area: ' + (el && el.id));
    UI.setTheme(th);
    return 'legible on the dark graphics area';
  });
