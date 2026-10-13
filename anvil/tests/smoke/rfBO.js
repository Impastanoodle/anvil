  // --- rfBO ---
  // (2026-10-13, lane BO) The Transform tab used like a shop user (test-reports/2026-10-13-transform-audit.md): each
  // command remembers its last-used values for the next run (Mastercam), the preview is drawn in its own colour, a
  // 90° Rectangular Array lands on exact coordinates, ✓ leaves the command's result message in the status bar and ✗
  // says the command was cancelled, ✓+ shows the ✓+ icon in every Transform PM; Geometry Nesting nests as soon as a
  // part is added, a two-digit quantity types as typed, Enter in its boxes nests (and never makes the Nest document),
  // the parts list starts empty in a new document, and the sheet presets are named in mm in an mm document.
  // Uses rfBJ's helpers (the group files share one scope).
  function rfBOTempColors() { return UI.groups.temp.children.map(function (c) { return '#' + c.material.color.getHexString(); }); }
  function rfBOOkPlus() { return D.querySelector('#pm .pm-actions button[title*="keep open"]'); }
  async function rfBOKey(el, key) { el.dispatchEvent(new W.KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true })); await idle(); await wait(20); }

  step('rfBO: Transform commands remember their last-used values (Translate Copy × 2 at 10 comes back as Copy × 2 at 10; Rotate 30°; Scale 2; Offset Entity .5), points and picked entities do not; ✗ leaves "… cancelled." in the status bar; the preview is drawn in the Transform result colour, the sketch tools keep their own', async function () {
    var errs0 = errors.length;
    UI.transformMemory.reset();
    var f = await rfBJNew(rfBJSquare(0, 0, 10).concat([{ t: 'circle', cx: 30, cy: 30, r: 2 }]));
    UI.setSelection([{ kind: 'entity', index: 4 }]);
    await rfBJRun('Translate');
    var v = UI.pmSpec().values;
    assert(v.op === 'move' && v.count === 1 && v.dx === 0, 'defaults the first time: ' + JSON.stringify(v));
    v.op = 'copy'; v.count = 2; v.dx = 10; UI.renderPM(); UI.pmSpec().onChange(v, 'dx');
    await wait(30);
    var want = UI.transformPreviewColor(), cols = rfBOTempColors();
    assert(cols.length === 2 && cols.every(function (c) { return c === want; }), 'preview lines in the result colour ' + want + ': ' + cols.join(','));
    await rfBJOk();
    assert(f.entities.length === 7 && f.entities[5].cx === 40 && f.entities[6].cx === 50, 'two copies at 40 and 50');
    assert(/Copied 1 entity × 2/.test($('status-msg').textContent), 'status: ' + $('status-msg').textContent);
    // the sketch tools' preview keeps the sketch colour once the PM is gone
    UI.App.tempEntities = [{ t: 'line', x1: 0, y1: 0, x2: 5, y2: 5 }]; UI.updateTemp();
    var toolCol = rfBOTempColors()[0];
    assert(toolCol !== want, 'a sketch tool preview is not in the Transform colour: ' + toolCol);
    UI.App.tempEntities = []; UI.updateTemp();
    UI.setSelection([]);
    await rfBJRun('Translate');
    v = UI.pmSpec().values;
    assert(v.op === 'copy' && v.count === 2 && v.dx === 10 && v.entities.length === 0, 'Translate remembered Copy × 2 at 10 with nothing selected: ' + JSON.stringify(v));
    var m = UI.transformMemory.get('translate');
    assert(m && m.dx === 10 && m.op === 'copy' && !('entities' in m) && !('box' in m), 'memory holds values only: ' + JSON.stringify(m));
    UI.pmCancel(); await idle();
    assert($('status-msg').textContent === 'Translate cancelled.', 'status after ✗: ' + $('status-msg').textContent);
    // Rotate: the angle and Copy come back, the centre does not
    UI.setSelection([{ kind: 'entity', index: 4 }]);
    await rfBJRun('Rotate');
    v = UI.pmSpec().values; v.angle = 30; v.op = 'copy'; v.center = [5, 5]; UI.pmSpec().onChange(v, 'angle');
    await rfBJOk();
    await rfBJRun('Rotate');
    v = UI.pmSpec().values;
    assert(v.angle === 30 && v.op === 'copy' && v.center[0] === 0 && v.center[1] === 0, 'Rotate remembered 30° Copy, centre back at the origin: ' + JSON.stringify(v));
    UI.pmCancel(); await idle();
    // Mirror remembers its axis but never the picked line
    await rfBJRun('Mirror');
    v = UI.pmSpec().values; v.axis = 'line'; v.line = 0; UI.pmSpec().onChange(v, 'axis');
    await rfBJOk();
    await rfBJRun('Mirror');
    v = UI.pmSpec().values;
    assert(v.axis === 'line' && v.line === -1, 'Mirror: axis Line remembered, the line to pick again: ' + JSON.stringify(v));
    UI.pmCancel(); await idle();
    // Scale (ui-transform-3d.js) and Offset Entity (ui-transform-layout.js) remember too
    UI.setSelection([{ kind: 'entity', index: 4 }]);
    await rfBJRun('Scale');
    v = UI.pmSpec().values; v.s = 2; v.about = 'centre'; UI.pmSpec().onChange(v, 's');
    await rfBJOk();
    await rfBJRun('Scale');
    v = UI.pmSpec().values;
    assert(v.s === 2 && v.about === 'centre', 'Scale remembered × 2 about the selection centre: ' + JSON.stringify(v));
    UI.pmCancel(); await idle(); await wait(10);
    assert($('status-msg').textContent === 'Scale cancelled.', 'Scale ✗ status: ' + $('status-msg').textContent);
    UI.setSelection([]);
    await rfBJRun('Offset Entity');
    v = UI.pmSpec().values; v.d = 0.5; v.count = 3; UI.pmSpec().onChange(v, 'd');
    await rfBJClick(rfBJScr([5, 0]));                 // the entity: the bottom line
    await rfBJClick(rfBJScr([5, -3]));                // the side: below
    await rfBJOk();
    assert(/^Offset: 3 copies at/.test($('status-msg').textContent), 'Offset Entity ✓ keeps its message: ' + $('status-msg').textContent);
    UI.setSelection([]);   // (with the result still selected, Offset Entity would take its last entity: select-first)
    await rfBJRun('Offset Entity');
    v = UI.pmSpec().values;
    assert(v.d === 0.5 && v.count === 3 && v.ent == null, 'Offset Entity remembered .5 × 3, no entity: ' + JSON.stringify(v));
    UI.pmCancel(); await idle();
    UI.transformMemory.reset();
    assert(UI.transformMemory.get('translate') === null, 'reset clears the memory');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'remembered, previews coloured, cancel status';
  });

  step('rfBO: Rectangular Array 3 × 2 at 90° lands on exact coordinates (15, 10: no 6e-16 dirt), ✓ leaves "Rectangular Array: …" in the status bar with the copies selected; ✓+ shows the ✓+ icon in Rectangular Array, Distribute, Offset Chains, Stretch and Scale', async function () {
    var errs0 = errors.length;
    UI.transformMemory.reset();
    var f = await rfBJNew([{ t: 'circle', cx: 5, cy: 5, r: 1 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    await rfBJRun('Rectangular Array');
    var v = UI.pmSpec().values; v.d1 = 15; v.n2 = 2; v.d2 = 10; UI.pmSpec().onChange(v, 'd2');
    var plus = rfBOOkPlus();
    assert(plus && plus.innerHTML.indexOf('M12.5 9 v6') >= 0, 'Rectangular Array has the ✓+ icon');
    await rfBJOk();
    var c = f.entities.slice(1).map(function (e) { return [e.cx, e.cy]; });
    assert(c.length === 5 && c[0][0] === 5 && c[0][1] === 15 && c[1][0] === 20 && c[1][1] === 5 && c[2][0] === 20 && c[2][1] === 15 && c[4][0] === 35 && c[4][1] === 15, 'exact copies: ' + JSON.stringify(c));
    assert(/^Rectangular Array: 6 instances/.test($('status-msg').textContent), 'status after ✓: ' + $('status-msg').textContent);
    assert(UI.selection().length === 5, 'the five copies are selected');
    var names = ['Distribute', 'Offset Chains', 'Stretch', 'Scale'];
    for (var k = 0; k < names.length; k++) {
      await rfBJRun(names[k]);
      plus = rfBOOkPlus();
      assert(plus && plus.innerHTML.indexOf('M12.5 9 v6') >= 0, names[k] + ' has the ✓+ icon');
      UI.pmCancel(); await idle();
      await wait(10);   // the 3D commands clear the selection on close and then say they were cancelled
      assert($('status-msg').textContent === names[k] + ' cancelled.', names[k] + ' ✗ status: ' + $('status-msg').textContent);
    }
    UI.transformMemory.reset();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'exact, status kept, ✓+ icons';
  });

  step('rfBO: Geometry Nesting nests as soon as a part is added; a quantity typed as "12" reads 12 (the box keeps the caret) and re-nests after a pause; Enter on a new entry in the quantity or a value box nests and keeps the panel (lane BP: the next Enter is ✓); a new document starts with an empty parts list; an mm document names the sheet presets in mm', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew(rfBJSquare(0, 0, 10).concat([{ t: 'circle', cx: 5, cy: 5, r: 2 }]));
    UI.App.model.units = 'in';   // a 10 × 10 in blank with a hole on a 48 × 96 sheet
    await rfBJRun('Geometry Nesting');
    assert(UI.pmTitle() === 'Geometry Nesting' && UI.nestState().parts.length === 0, 'opens empty');
    UI.nestAddSketch(); await wait(30);
    var st = UI.nestState();
    assert(st.parts.length === 1 && st.result && st.result.placements.length === 1, 'nested at once on Add: ' + (st.result ? st.result.placements.length : 'no result'));
    var qty = D.querySelector('#pm input.nest-qty');
    assert(qty && qty.type === 'text', 'the quantity box is a text box');
    qty.focus(); qty.value = '1'; qty.dispatchEvent(new W.Event('input', { bubbles: true }));
    qty.value = '12'; qty.dispatchEvent(new W.Event('input', { bubbles: true }));
    await wait(60);
    assert(D.activeElement === qty && qty.value === '12' && UI.nestState().result.placements.length === 1, 'no re-nest while typing: ' + UI.nestState().result.placements.length);
    await wait(450);
    st = UI.nestState();
    assert(st.parts[0].qty === 12 && st.result.placements.length === 12, 'after the pause: 12 placed, got ' + st.result.placements.length);
    qty = D.querySelector('#pm input.nest-qty');
    qty.value = '6'; qty.dispatchEvent(new W.Event('input', { bubbles: true }));
    await rfBOKey(qty, 'Enter');
    st = UI.nestState();
    assert(UI.pmTitle() === 'Geometry Nesting' && UI.App.model.name !== 'Nest' && UI.App.mode === 'sketch' && st.parts[0].qty === 6 && st.result.placements.length === 6, 'Enter in the quantity nests (6) and keeps the PM: ' + UI.pmTitle() + ' ' + st.result.placements.length);
    var sp = D.querySelector('#pm input[data-key="spacing"]');
    sp.focus(); sp.value = '1'; sp.dispatchEvent(new W.Event('input', { bubbles: true }));
    sp = D.querySelector('#pm input[data-key="spacing"]');   // the live re-nest may have re-rendered the panel; the entry stays pending
    await rfBOKey(sp, 'Enter');   // lane BP: Enter on a new entry nests and keeps the panel; the next Enter would be ✓ (the Nest document)
    assert(UI.pmTitle() === 'Geometry Nesting' && UI.App.mode === 'sketch' && UI.nestState().values.spacing === 1 && /press Enter again/.test(statusText()), 'Enter in Part spacing nests and keeps the PM: ' + statusText());
    assert($('modal').hidden, 'no Save-changes dialog');
    UI.pmCancel(); await idle();
    await rfBJNew([{ t: 'circle', cx: 5, cy: 5, r: 2 }]);
    UI.App.model.units = 'mm';
    await rfBJRun('Geometry Nesting');
    assert(UI.nestState().parts.length === 0, 'a new document starts with no parts: ' + UI.nestState().parts.length);
    var opts = Array.prototype.map.call(D.querySelector('#pm select').options, function (o) { return o.textContent; });
    assert(opts[0] === '1219 × 2438 mm (48 × 96 in)' && opts[2] === '1219 × 3048 mm (48 × 120 in)', 'mm presets: ' + opts.join(' | '));
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'nesting: live, typed quantities, Enter nests';
  });
