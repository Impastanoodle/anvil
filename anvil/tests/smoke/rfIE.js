  // --- rfIE (2026-11-05, lane rfIE): Convert to Sheet Metal ▸ Collect All Bends with real mouse / key events. A shelled
  // 2 × 2 × 1 box open at the bottom (walls .06): the ribbon button, the button disabled until the fixed face is
  // picked, one edge clicked by hand, the top face clicked, Collect All Bends: the four top edges replace the list,
  // "4 bends collected", 4 rip edges found; Ctrl+Z gives the hand-picked list back with the PM open, Ctrl+Y the
  // collected one; ✓: the same part as the hand picks (exact faceted volume), one undo. A solid block: nothing. ---
  function rfIEEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfIEClick(p) { rfIEEv('mousemove', p); rfIEEv('mousedown', p, $('viewport')); rfIEEv('mouseup', p); }
  function rfIEVol(mesh) { var mp = K.massProps(mesh || UI.App.mesh, 1); return mp.polygonal ? mp.polygonal.volume : mp.volume; }
  function rfIEType(label, text) {
    var inp = pmField(label);
    assert(inp, 'PM box ' + label);
    inp.focus(); inp.select(); inp.value = text; inp.dispatchEvent(new W.Event('input', { bubbles: true }));
    pressEnter(inp);
  }
  function rfIEKey(key) { D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: key, ctrlKey: true, bubbles: true, cancelable: true })); }
  function rfIEBtn() { return Array.prototype.filter.call(D.querySelectorAll('#pm .pm-btns button'), function (b) { return /Collect All Bends/.test(b.textContent); })[0]; }
  function rfIEOpen() {
    UI.setRibbonTab('Sheet Metal');
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /Convert to\s*Sheet Metal/.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
    assert(btn, 'Convert to Sheet Metal on the ribbon');
    btn.click();
  }
  var rfIEBox = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(0.06, [[1, 0, -1]]);';

  step('rfIE: Collect All Bends — disabled until the fixed face, replaces a hand pick, 4 bends / 4 rips, Ctrl+Z / Ctrl+Y inside the PM, ✓ = the hand-picked part', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(rfIEBox); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    rfIEOpen(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Convert to Sheet Metal', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
    var b = rfIEBtn();
    assert(b && b.disabled && /fixed face first/.test(b.title), 'Collect All Bends disabled until the fixed face: ' + (b && b.disabled) + ' ' + (b && b.title));
    rfIEType('Thickness', '.06'); await wait(20);
    rfIEType('Bend radius', '.06'); await wait(20);
    rfIEType('Rip gap', '.03'); await wait(20);
    b.click(); await wait(20);
    assert(!UI.pmSpec().values.bendEdges.length, 'a disabled button does nothing');
    // one top edge by hand
    var tops = UI.App.edges.filter(function (e) { return Math.abs(e.dir[1]) < 1e-6 && Math.abs(e.mid[1] - 1) < 1e-6 && e.len > 1.9; });
    assert(tops.length === 4, 'four top edges: ' + tops.length);
    var q = UI.worldToScreen(tops[0].mid), pe = UI.pickEdge(q[0], q[1]);
    assert(pe && pe.edge === tops[0], 'the top edge is clickable');
    rfIEClick(q); await idle(); await wait(20);
    assert(UI.pmSpec().values.bendEdges.length === 1, 'one hand-picked edge');
    var s = UI.worldToScreen([1, 1, -1]), pk = UI.pickFace(s[0], s[1]);
    assert(pk && pk.point && Math.abs(pk.point[1] - 1) < 1e-6, 'the top face is under the cursor');
    rfIEClick(s); await idle(); await wait(20);
    assert(UI.pmSpec().values.fixedFace && Math.abs(UI.pmSpec().values.fixedFace[1] - 1) < 1e-6, 'fixed face');
    b = rfIEBtn();
    assert(b && !b.disabled && !/first/.test(b.title), 'enabled once the fixed face is picked');
    b.click(); await idle(); await wait(30);
    var v = UI.pmSpec().values;
    assert(v.bendEdges.length === 4 && tops.every(function (e) { return v.bendEdges.some(function (p) { return K.pointSegmentDistance(p, e.a, e.b) < 1e-6; }); }), 'the four top edges: ' + JSON.stringify(v.bendEdges));
    var t = D.querySelector('.toast');
    assert(t && /4 bends collected/.test(t.textContent), 'toast: ' + (t && t.textContent));
    assert(/4 bends, 4 rips/.test(statusText()), 'preview: ' + statusText());
    assert(/4 rip edges found/.test(D.querySelector('#pm').textContent), 'rip edges found in the PM');
    // Ctrl+Z: the list before the collect; the PM stays open; Ctrl+Y: collected again
    rfIEKey('z'); await idle(); await wait(20);
    assert(UI.hasPM() && UI.pmSpec().values.bendEdges.length === 1, 'Ctrl+Z restores the hand pick: ' + (UI.hasPM() && UI.pmSpec().values.bendEdges.length));
    rfIEKey('y'); await idle(); await wait(20);
    assert(UI.hasPM() && UI.pmSpec().values.bendEdges.length === 4, 'Ctrl+Y collects again');
    // a click still removes one; Ctrl+Z puts it back
    rfIEClick(UI.worldToScreen(tops[1].mid)); await idle(); await wait(20);
    assert(UI.pmSpec().values.bendEdges.length === 3, 'a click removes one');
    rfIEKey('z'); await idle(); await wait(20);
    assert(UI.pmSpec().values.bendEdges.length === 4, 'Ctrl+Z puts it back');
    var hand = tops.map(function (e) { return e.mid.map(function (x) { return Math.round(x * 1e6) / 1e6; }); });
    var m = K.newModel('r'); K.runScript(m, rfIEBox + '\np.convertSheetMetal([1, 1, -1], ' + JSON.stringify(hand) + ', { thickness: 0.06, radius: 0.06, gap: 0.03 });\n');
    var rb = K.rebuild(m);
    assert(!Object.keys(rb.errors).length, 'hand-picked reference: ' + JSON.stringify(rb.errors));
    var ref = rfIEVol(K.meshFromBody(rb.body)), n0 = UI.App.undo.length;
    await pmAccept(); await wait(30);
    assert(!UI.hasPM(), '✓ closes');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'convertSM' && f.bendEdges.length === 4 && !UI.App.build.errors[f.id], 'feature: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
    near(rfIEVol(), ref, 1e-9, 'collected = hand-picked part');
    assert(UI.App.undo.length === n0 + 1, 'one undo step: ' + (UI.App.undo.length - n0));
    await UI.undo(); await idle();
    assert(!UI.App.model.features.some(function (g) { return g.type === 'convertSM'; }) && !UI.App.model.sheet, 'undo takes the feature and the sheet back');
  });

  step('rfIE: Collect All Bends on a solid block says there is nothing to collect; the list stays empty', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, 0, 4, 2).end().extrude(2);'); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    rfIEOpen(); await wait(30);
    rfIEType('Thickness', '.06'); await wait(20);
    var s = UI.worldToScreen([2, 2, -1]);
    rfIEClick(s); await idle(); await wait(20);
    assert(UI.pmSpec().values.fixedFace, 'fixed face');
    rfIEBtn().click(); await idle(); await wait(20);
    assert(!UI.pmSpec().values.bendEdges.length, 'nothing collected');
    var t = D.querySelector('.toast');
    assert(t && /nothing to collect/.test(t.textContent), 'toast: ' + (t && t.textContent));
    rfIEKey('z'); await idle(); await wait(20);
    assert(!UI.hasPM(), 'with no list change to undo, Ctrl+Z cancels the command as before');
  });
