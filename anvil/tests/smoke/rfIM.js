  // --- rfIM (2026-11-05, lane rfIM): Convert to Sheet Metal takes a click on a rounded face as a bend; Insert Bends'
  // PM shows the rounded bends it found. A 4 × 2 × 2 block with its two long top edges filleted .12: the top face
  // clicked (fixed), both fillets clicked (2 bends), one clicked again (out), back in, the Reverse thickness box is
  // there, ✓ = the kernel's part. The thin U-channel with both bends rounded: Insert Bends says "2 found". ---
  function rfIMEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfIMClick(p) { rfIMEv('mousemove', p); rfIMEv('mousedown', p, $('viewport')); rfIMEv('mouseup', p); }
  function rfIMType(label, text) {
    var inp = pmField(label);
    assert(inp, 'PM box ' + label);
    inp.focus(); inp.select(); inp.value = text; inp.dispatchEvent(new W.Event('input', { bubbles: true }));
    pressEnter(inp);
  }
  function rfIMOpen(re) {
    UI.setRibbonTab('Sheet Metal');
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
    assert(btn, re + ' on the ribbon');
    btn.click();
  }
  var rfIMBlock = 'p.units("in");\np.sketch("Top").rect(0, 0, 4, 2).end().extrude(2);\np.fillet(0.12, [[2, 2, 0], [2, 2, -2]]);';

  step('rfIM: Convert to Sheet Metal — a click on each filleted edge\'s face adds it as a bend, a second click takes it out; ✓ = the kernel\'s part', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(rfIMBlock); await idle();
    UI.setView('Top');   // both fillets face partly up if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    rfIMOpen(/Convert to\s*Sheet Metal/); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Convert to Sheet Metal', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
    assert(pmField('Reverse thickness'), 'Reverse thickness box');
    rfIMType('Thickness', '.06'); await wait(20);
    rfIMType('Bend radius', '.06'); await wait(20);
    rfIMType('Rip gap', '.03'); await wait(20);
    var s = UI.worldToScreen([2, 2, -1]);
    rfIMClick(s); await idle(); await wait(20);
    assert(UI.pmSpec().values.fixedFace && Math.abs(UI.pmSpec().values.fixedFace[1] - 2) < 1e-6, 'fixed face on top');
    // the fillets' mid points, r(1 − 1/√2) in from both faces
    var m = 0.12 - 0.12 / Math.SQRT2, f1 = [2, 2 - m, -m], f2 = [2, 2 - m, -2 + m];
    [f1, f2].forEach(function (P) {
      var q = UI.worldToScreen(P), pk = UI.pickFace(q[0], q[1]);
      assert(pk && pk.point && K.insertBendsRoundAt(UI.App.build.body, pk.point, 0.06, 'in'), 'a fillet under the cursor at ' + JSON.stringify(P) + ': ' + JSON.stringify(pk && pk.point));
    });
    rfIMClick(UI.worldToScreen(f1)); await idle(); await wait(20);
    rfIMClick(UI.worldToScreen(f2)); await idle(); await wait(20);
    var v = UI.pmSpec().values;
    assert(v.bendEdges.length === 2 && Math.abs(v.fixedFace[1] - 2) < 1e-6, 'two rounded bends, the fixed face kept: ' + JSON.stringify(v.bendEdges));
    assert(/2 bends/.test(statusText()), 'preview: ' + statusText());
    rfIMClick(UI.worldToScreen(f1)); await idle(); await wait(20);
    assert(UI.pmSpec().values.bendEdges.length === 1, 'a second click takes it out');
    rfIMClick(UI.worldToScreen(f1)); await idle(); await wait(20);
    assert(UI.pmSpec().values.bendEdges.length === 2, 'and back in');
    var mm = K.newModel('r'); K.runScript(mm, rfIMBlock + '\np.convertSheetMetal([2, 2, -1], ' + JSON.stringify(UI.pmSpec().values.bendEdges) + ', { thickness: 0.06, radius: 0.06, gap: 0.03 });\n');
    var rb = K.rebuild(mm);
    assert(!Object.keys(rb.errors).length, 'reference: ' + JSON.stringify(rb.errors));
    await pmAccept(); await wait(30);
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'convertSM' && !UI.App.build.errors[f.id], 'feature: ' + UI.App.build.errors[f.id]);
    near(K.massProps(UI.App.mesh, 1).volume, K.massProps(K.meshFromBody(rb.body), 1).volume, 1e-9, 'the part');
  });

  step('rfIM: Insert Bends on a thin U-channel whose bends are rounded: the PM lists "Rounded bends 2 found"', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Front").polyline([[0, 0], [2, 0], [2, 2], [1.94, 2], [1.94, 0.06], [0.06, 0.06], [0.06, 2], [0, 2]]).end().extrude(4);\np.fillet(0.12, [[0, 0, 2], [2, 0, 2]]);\np.fillet(0.06, [[0.06, 0.06, 2], [1.94, 0.06, 2]]);'); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    rfIMOpen(/Insert Bends/); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Insert Bends', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
    var s = UI.worldToScreen([1, 0.06, 2]);
    rfIMClick(s); await idle(); await wait(30);
    assert(UI.pmSpec().values.fixedFace, 'fixed face');
    var txt = D.querySelector('#pm').textContent;
    assert(/2 found \(their own radius\)/.test(txt) && /2 bends \(2 rounded\)/.test(txt), 'PM: ' + txt.replace(/\s+/g, ' ').slice(0, 400));
    UI.closePM && UI.closePM();
  });
