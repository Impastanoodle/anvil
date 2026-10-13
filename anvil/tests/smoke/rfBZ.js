  // --- rfBZ (2026-10-13, lane BZ): the Hem PropertyManager starts on Closed, Material Inside (SolidWorks), and a
  // second hem whose return would cross the first at a corner is refused with a message naming both edges. Uses
  // pmField / setInput / edgeNear of ui-smoke.html. ---
  step('rfBZ: Hem PM opens on Closed / Material Inside; a 0.5 closed hem ✓; a Tear Drop on the neighbouring edge is refused ("The hems on edges … would cross: shorten one or add a relief.") and the part keeps the first hem', async function () {
    var errs0 = errors.length;
    UI.sheetMetalMemory(null);
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();'); await idle();
    var v0 = anvil.mass().volume;
    UI.cmdHem(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Hem', 'Hem PM: ' + UI.pmTitle());
    var on = function (key, val) { var b = D.querySelector('#pm button[data-key="' + key + ':' + val + '"]'); return !!(b && b.classList.contains('on')); };
    assert(on('hemType', 'closed') && on('hemPosition', 'inside'), 'a new hem starts on Closed, Material Inside');
    assert(pmField('Hem length') && !pmField('Gap distance'), 'Closed: Hem length only');
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([3, 0.0598, 4]) }) !== false, 'edge pick rejected');
    setInput(pmField('Hem length'), 0.5);
    await pmAccept();
    var fs = UI.App.model.features, h = fs[fs.length - 1];
    assert(h.hem === true && h.hemType === 'closed' && h.hemPosition === 'inside' && h.length === 0.5, 'hem: ' + JSON.stringify(h));
    assert(Object.keys(anvil.summary().errors).length === 0, 'errors: ' + JSON.stringify(anvil.summary().errors));
    var v1 = anvil.mass().volume;
    assert(v1 > v0, 'the hem added metal');
    // a tear drop on the edge at x = 6: its curl folds over the same corner as the closed hem's return
    UI.cmdHem(); await wait(30);
    assert(on('hemType', 'closed'), 'the closed hem is remembered');
    D.querySelector('#pm button[data-key="hemType:teardrop"]').click(); await wait(10);
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([6, 0.0598, 2]) }) !== false, 'second edge pick rejected');
    await pmAccept();
    if (UI.hasPM()) { UI.pmCancel(); await idle(); }
    var errs = anvil.summary().errors, msgs = Object.keys(errs).map(function (k) { return errs[k]; });
    // (the PM's pick is the edge's own midpoint, about z = 1.97 on the edge the first hem shortened)
    assert(msgs.some(function (m) { return /^The hems on edges \(6, 0\.0598, [0-9.]+\) and \(3, 0\.0598, 4\) would cross: shorten one or add a relief\.$/.test(m); }),
      'crossing refused: ' + JSON.stringify(errs));
    near(anvil.mass().volume, v1, 1e-9, 'the part keeps the first hem only');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return msgs.join(' | ');
  });
