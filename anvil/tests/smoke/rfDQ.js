  // --- rfDQ (2026-10-27, lane DQ): Sheet Metal ▸ Insert Bends, No Bends and Convert to Sheet Metal with real mouse / key
  // events. Insert Bends: a shelled 2 × 2 × 1 box ripped at its four corners (script), the ribbon button, a click on the
  // floor seen through the open top (the fixed face; T read from the part), .06 typed in Bend radius + Enter + Enter:
  // exact volume, Process-Bends1 under a Sheet-Metal row, ribbon Flatten shows the 3.8027 square blank and folds back,
  // No Bends shows the sharp part and back, one undo step, Edit Feature reopens with the fixed face, Esc. Convert: a solid
  // box, the ribbon button, a click on the top face, the four top edges, T .06 / R .06 / gap .03 typed, ✓: the same
  // volume (the box upside down). ---
  function rfDQEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfDQClick(p) { rfDQEv('mousemove', p); rfDQEv('mousedown', p, $('viewport')); rfDQEv('mouseup', p); }
  function rfDQVol() { var mp = K.massProps(UI.App.mesh, UI.App.model.density); return mp.polygonal ? mp.polygonal.volume : mp.volume; }   // the faceted solid (lane FX)
  function rfDQRibbon(re) {
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
  }
  function rfDQType(label, text) {
    var inp = pmField(label);
    assert(inp, 'PM box ' + label);
    inp.focus(); inp.select(); inp.value = text; inp.dispatchEvent(new W.Event('input', { bubbles: true }));
    return inp;
  }
  function rfDQTree(re) { return Array.prototype.some.call(D.querySelectorAll('#tree .ti'), function (r) { return re.test(r.textContent); }); }
  // the ripped / inserted box (rfDQ kernel group): R = T = .06, gap .03, bends between the (R + T) corner cubes
  var rfDQ = (function () {
    var T = 0.06, R = 0.06, G = 0.03, RT = R + T, rip = 4 - 1.88 * 1.88 * 0.94 - 4 * Math.SQRT2 * 0.94 * G * T;
    var fill = RT * RT - R * R, wedge = 0.5 * 8 * Math.sin(Math.PI / 16) * fill, cube = RT * RT * T + (RT - T) * (2 * RT * T - T * T - Math.SQRT2 * G * T);
    var BA = Math.PI / 2 * (R + 0.5 * T);
    return { ripped: rip, bent: rip - 4 * (2 - 2 * RT) * (fill - wedge) - 4 * cube, flat: 2 * (1 - RT) + (2 - 2 * RT) + 2 * BA };
  })();

  step('rfDQ: Insert Bends — ribbon, the floor clicked through the open top, R .06 Enter Enter: exact volume, Process-Bends1 under Sheet-Metal, Flatten 3.8027 square and back, No Bends and back, one undo step, Edit Feature, Esc', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(0.06, [[1, 1, -1]]);\np.rip([[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]], 0.03);'); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    var v0 = rfDQVol(), n0 = UI.App.model.features.length;
    near(v0, rfDQ.ripped, 1e-9, 'ripped box');
    UI.setRibbonTab('Sheet Metal'); await wait(20);
    var btn = rfDQRibbon(/Insert\s*Bends/);
    assert(btn && !btn.disabled && !btn.classList.contains('disabled'), 'Insert Bends on the Sheet Metal ribbon, enabled');
    btn.click(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Insert Bends', 'Insert Bends PM: ' + (UI.hasPM() && UI.pmTitle()));
    // the floor, through the open top
    var s = UI.worldToScreen([1, 0.06, -1]), pk = UI.pickFace(s[0], s[1]);
    assert(pk && pk.point && Math.abs(pk.point[1] - 0.06) < 1e-6, 'the floor is under the cursor: ' + JSON.stringify(pk && pk.point));
    rfDQClick(s); await idle(); await wait(30);
    var vals = UI.pmSpec().values;
    assert(vals.fixedFace && Math.abs(vals.fixedFace[1] - 0.06) < 1e-6, 'fixed face picked: ' + JSON.stringify(vals.fixedFace));
    assert(/0\.06 \(the part's\)/.test(D.querySelector('#pm').textContent), 'T read from the part');
    var rad = rfDQType('Bend radius', '.06');
    var ev = pressEnter(rad); await wait(30);
    assert(ev.defaultPrevented && UI.hasPM() && +UI.pmSpec().values.bendRadius === 0.06, 'the first Enter applied .06 and kept the PM');
    assert(/4 bends/.test(D.querySelector('#pm').textContent), 'the PM counts 4 bends: ' + statusText());
    pressEnter(pmField('Bend radius')); await idle(); await wait(40);
    assert(!UI.hasPM(), 'the second Enter is ✓');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'insertBends' && f.name === 'Process-Bends1' && f.sheetBase, 'feature: ' + JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
    near(+UI.App.model.sheet.thickness, 0.06, 1e-12, 'sheet T'); near(+UI.App.model.sheet.bendRadius, 0.06, 1e-12, 'sheet R');
    near(rfDQVol(), rfDQ.bent, 1e-9, 'bent volume');
    assert(rfDQTree(/Process-Bends1/) && rfDQTree(/Sheet-Metal/) && rfDQTree(/Flat-Pattern/), 'Sheet-Metal, Process-Bends1 and Flat-Pattern in the tree');
    // Flatten from the ribbon and back
    var fl = rfDQRibbon(/Flatten/);
    fl.click(); await idle(); await wait(30);
    assert(UI.App.model.flatState && UI.App.flat, 'flattened: ' + statusText());
    near(UI.App.flat.size[0], rfDQ.flat, 1e-9, 'flat X'); near(UI.App.flat.size[1], rfDQ.flat, 1e-9, 'flat Y');
    assert(UI.App.flat.loops.length === 1 && UI.App.flat.bends.length === 4, 'one blank, four bends');
    rfDQRibbon(/Flatten/).click(); await idle(); await wait(20);
    assert(!UI.App.model.flatState, 'folded');
    // No Bends and back
    var nb = rfDQRibbon(/No\s*Bends/);
    assert(nb && !nb.disabled && !nb.classList.contains('disabled'), 'No Bends enabled');
    nb.click(); await idle(); await wait(30);
    assert(UI.App.model.noBends, 'No Bends on');
    near(rfDQVol(), rfDQ.ripped, 1e-9, 'the sharp part');
    rfDQRibbon(/No\s*Bends/).click(); await idle(); await wait(30);
    assert(!UI.App.model.noBends, 'No Bends off');
    near(rfDQVol(), rfDQ.bent, 1e-9, 'bent again');
    for (var u = 0; u < 4; u++) { UI.undo(); await idle(); }   // No Bends ×2, Flatten ×2
    assert(UI.App.model.features.length === n0 + 1, 'the four display toggles undo one by one');
    UI.undo(); await idle();
    assert(UI.App.model.features.length === n0, 'then Insert Bends in one step: ' + UI.App.model.features.length);
    near(rfDQVol(), v0, 1e-9, 'volume after undo');
    assert(!UI.App.model.sheet && !rfDQTree(/Sheet-Metal/), 'the same undo step takes the sheet back');
    UI.redo(); await idle();
    f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'insertBends', 'redo');
    UI.editFeature(f); await wait(30); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Process-Bends1', 'editing PM: ' + (UI.hasPM() && UI.pmTitle()));
    assert(UI.pmSpec().values.fixedFace && Math.abs(UI.pmSpec().values.fixedFace[1] - 0.06) < 1e-6, 'the fixed face is back');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle(); await wait(20);
    assert(!UI.hasPM(), 'Esc ends the command');
    near(rfDQVol(), rfDQ.bent, 1e-9, 'unchanged after Esc');
  });

  step('rfDQ: Convert to Sheet Metal — ribbon, the top face clicked (fixed), the four top edges, T .06 / R .06 / gap .03 typed, ✓: the inserted box upside down, exact; four rips found', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);'); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    UI.setRibbonTab('Sheet Metal'); await wait(20);
    var btn = rfDQRibbon(/Convert to\s*Sheet Metal/);
    assert(btn && !btn.disabled && !btn.classList.contains('disabled'), 'Convert to Sheet Metal on the ribbon, enabled');
    btn.click(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Convert to Sheet Metal', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
    rfDQType('Thickness', '.06'); pressEnter(pmField('Thickness')); await wait(20);
    rfDQType('Bend radius', '.06'); pressEnter(pmField('Bend radius')); await wait(20);
    rfDQType('Rip gap', '.03'); pressEnter(pmField('Rip gap')); await wait(20);
    assert(UI.hasPM(), 'Enter in a box keeps the PM');
    var s = UI.worldToScreen([1, 1, -1]), pk = UI.pickFace(s[0], s[1]);
    assert(pk && pk.point && Math.abs(pk.point[1] - 1) < 1e-6, 'the top face is under the cursor');
    rfDQClick(s); await idle(); await wait(20);
    assert(UI.pmSpec().values.fixedFace && Math.abs(UI.pmSpec().values.fixedFace[1] - 1) < 1e-6, 'fixed face: ' + JSON.stringify(UI.pmSpec().values.fixedFace));
    var tops = UI.App.edges.filter(function (e) { return Math.abs(e.dir[1]) < 1e-6 && Math.abs(e.mid[1] - 1) < 1e-6 && e.len > 1.9; });
    assert(tops.length === 4, 'four top edges: ' + tops.length);
    tops.forEach(function (e) {
      var q = UI.worldToScreen(e.mid), pe = UI.pickEdge(q[0], q[1]);
      assert(pe && pe.edge === e, 'top edge clickable at ' + JSON.stringify(e.mid));
    });
    for (var i = 0; i < tops.length; i++) { rfDQClick(UI.worldToScreen(tops[i].mid)); await idle(); await wait(20); }
    var vals = UI.pmSpec().values;
    assert(vals.bendEdges.length === 4, 'four bend edges: ' + JSON.stringify(vals.bendEdges));
    assert(/4 bends, 4 rips/.test(statusText()), 'preview: ' + statusText());
    assert(/4 rip edges found/.test(D.querySelector('#pm').textContent), 'rip edges found in the PM');
    await pmAccept(); await wait(30);
    assert(!UI.hasPM(), '✓ closes');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'convertSM' && f.name === 'Convert-Solid1' && f.gap === 0.03 && f.bendEdges.length === 4, 'feature: ' + JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
    near(+UI.App.model.sheet.thickness, 0.06, 1e-12, 'sheet T');
    near(rfDQVol(), rfDQ.bent, 1e-9, 'converted volume');
    var flat = anvil.flat();
    near(flat.size[0], rfDQ.flat, 1e-9, 'flat X'); near(flat.size[1], rfDQ.flat, 1e-9, 'flat Y');
    assert(rfDQTree(/Convert-Solid1/), 'Convert-Solid1 in the tree');
  });
