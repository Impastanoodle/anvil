  // ---- rfCL (2026-10-14): Sketch Fillet / Chamfer, the corner tool's picks re-found by their points — a row deleted
  // re-makes the picks after it on the right geometry (a polyline's vertex, a rectangle's corner, two entities: their
  // indices in the sketch as the pick found it no longer hold once an earlier pick is dropped); a refused Radius /
  // Distance stops the next pick until it is put right (no mixed sizes committed); the first entity of a pair stays
  // picked across a value change. Helpers from rfCE (rfCENew, rfCEType, rfCEEnter, rfCEArcs, rfCERows, rfCEAt, rfCEAllR, rfCEBox).
  function rfCLDelRow(i) { var row = D.querySelectorAll('#pm .pm-list .pm-item')[i]; assert(row, 'no row ' + i); row.focus(); row.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })); }
  function rfCLHas(pts, p) { return pts.some(function (q) { return Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9; }); }
  function rfCLTypes() { return JSON.stringify(UI.activeSketchFeature().entities.map(function (e) { return e.t; })); }
  step('rfCL: Sketch Fillet on a closed polyline — corners 1 and 5 of a 20-gon rounded at R1 (the second pick made on the already rounded outline, where corner 5 sits at index 8); Delete on the first row: corner 5 is the one still rounded (not the vertex that sat at its index), corner 1 sharp again; R2 + Enter re-makes it; ✗ restores the 20-gon', async function () {
    var errs0 = errors.length;
    await rskNew();
    var pts = [];
    for (var k = 0; k < 20; k++) { var a = 2 * Math.PI * k / 20; pts.push([Math.round(2e5 * Math.cos(a)) / 1e4, Math.round(2e5 * Math.sin(a)) / 1e4]); }
    fxSk([{ t: 'polyline', pts: pts, closed: true }]);
    var pl = function () { return UI.activeSketchFeature().entities[0]; };
    UI.cmdSketchFillet(); await wait(20);
    var rf = rfCEType('Radius', '1'); rfCEEnter(rf); await wait(10);
    rskClick(pts[1]); await wait(20);
    assert(pl().t === 'polyline' && pl().pts.length === 23 && !rfCLHas(pl().pts, pts[1]), 'corner 1 rounded (one vertex becomes four arc points): ' + pl().pts.length);
    rskClick(pts[5]); await wait(20);
    assert(pl().pts.length === 26 && !rfCLHas(pl().pts, pts[5]) && rfCERows().length === 2, 'corner 5 rounded too, two listed: ' + pl().pts.length + ' ' + rfCERows().join(' | '));
    rfCLDelRow(0); await wait(20);
    var p = pl();
    assert(rfCERows().length === 1 && p.pts.length === 23, 'one left after Delete: ' + rfCERows().join(' | ') + ' ' + p.pts.length);
    assert(rfCLHas(p.pts, pts[1]) && !rfCLHas(p.pts, pts[5]) && rfCLHas(p.pts, pts[8]), 'corner 1 sharp again, corner 5 still rounded, corner 8 (at index 8 when corner 5 was picked) untouched: ' + JSON.stringify(p.pts));
    rf = rfCEType('Radius', '2'); rfCEEnter(rf); await wait(20);
    p = pl();
    assert(UI.hasPM() && p.pts.length === 23 && !rfCLHas(p.pts, pts[5]) && rfCLHas(p.pts, pts[8]) && rfCERows().length === 1, 'R2 re-makes corner 5 alone: ' + p.pts.length + ' ' + rfCERows().join(' | '));
    UI.pmCancel(); await wait(20);
    assert(!UI.hasPM() && JSON.stringify(pl().pts) === JSON.stringify(pts), '✗ restores the 20-gon');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'corner 5 stays corner 5';
  });
  step('rfCL: a rectangle\'s corner, then two separate lines picked as a pair (they moved up three places when the rectangle became lines); Delete on the rectangle\'s row: the rectangle is whole again and the pair\'s fillet is re-made between the same two lines; two rectangles\' corners, the first row deleted: the second corner is re-made and the first rectangle is whole', async function () {
    var errs0 = errors.length;
    await rskNew();
    fxSk([{ t: 'rect', x: 0, y: 0, w: 40, h: 30 }, { t: 'line', x1: -10, y1: 0, x2: -30, y2: 0 }, { t: 'line', x1: -30, y1: 0, x2: -30, y2: 20 }]);
    var ents = function () { return UI.activeSketchFeature().entities; };
    UI.cmdSketchFillet(); await wait(20);
    var rf = rfCEType('Radius', '2'); rfCEEnter(rf); await wait(10);
    rskClick([40, 30]); await wait(20);
    assert(ents().length === 7 && rfCEArcs().length === 1 && rfCEAt(rfCEArcs(), 38, 28), 'the rectangle became four lines, its corner rounded: ' + rfCLTypes());
    rskClick([-20, 0]); await wait(20);
    assert(/Pick the second entity/.test(statusText()), 'the first of two picked: ' + statusText());
    rskClick([-30, 10]); await wait(20);
    assert(rfCEArcs().length === 2 && rfCEAt(rfCEArcs(), -28, 2) && rfCERows().length === 2, 'the L rounded as a pair: ' + JSON.stringify(rfCEArcs()) + ' ' + rfCERows().join(' | '));
    rfCLDelRow(0); await wait(20);
    assert(rfCERows().length === 1 && ents()[0].t === 'rect', 'the rectangle\'s row dropped, the rectangle whole: ' + rfCERows().join(' | ') + ' ' + rfCLTypes());
    assert(rfCEArcs().length === 1 && rfCEAt(rfCEArcs(), -28, 2) && rfCEAllR(rfCEArcs(), 2), 'the pair\'s fillet re-made between the same two lines: ' + JSON.stringify(rfCEArcs()));
    UI.pmCancel(); await wait(20);
    assert(!UI.hasPM() && ents().length === 3 && !rfCEArcs().length, '✗ restores the three entities: ' + rfCLTypes());
    // two rectangles: the second's corner was picked at index 4 (the first had become four lines)
    await rskNew();
    fxSk([{ t: 'rect', x: 0, y: 0, w: 40, h: 30 }, { t: 'rect', x: 50, y: 0, w: 20, h: 20 }]);
    UI.cmdSketchFillet(); await wait(20);
    rf = rfCEType('Radius', '2'); rfCEEnter(rf); await wait(10);
    rskClick([40, 30]); rskClick([70, 20]); await wait(20);
    assert(rfCEArcs().length === 2 && rfCERows().length === 2 && !ents().some(function (e) { return e.t === 'rect'; }), 'both rectangles made into lines, both corners rounded: ' + rfCLTypes());
    rfCLDelRow(0); await wait(20);
    assert(rfCERows().length === 1 && ents()[0].t === 'rect' && rfCEArcs().length === 1 && rfCEAt(rfCEArcs(), 68, 18), 'the first rectangle whole, the second\'s corner re-made: ' + rfCLTypes() + ' ' + JSON.stringify(rfCEArcs()));
    UI.pmCancel(); await wait(20);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'rect + pair, two rects';
  });
  step('rfCL: Sketch Chamfer after a refused Distance — two corners at .1, then 2.5 (too long for the top line) refused; a click on a corner where 2.5 would fit makes nothing (the two .1 chamfers stay, the refusal repeated) and ✓ is refused; .2 + Enter re-makes both, the corner is then picked at .2 and ✓ closes with three chamfers at .2', async function () {
    var errs0 = errors.length;
    await rfCENew();
    try {
      var chLines = function () { return UI.activeSketchFeature().entities.slice(6).filter(function (e) { return e.t === 'line' && !e.sharp; }); };
      var at45 = function (e, d) { return Math.abs(Math.abs(e.x2 - e.x1) - d) < 1e-9 && Math.abs(Math.abs(e.y2 - e.y1) - d) < 1e-9; };
      var allAt = function (d) { return chLines().every(function (e) { return at45(e, d); }); };
      UI.cmdSketchChamfer(); await wait(20);
      var d1 = rfCEType('Distance 1', '.1'); rfCEEnter(d1); await wait(10);
      rskClick([4, 3]); rskClick([0, 3]); await wait(20);
      assert(chLines().length === 2 && allAt(0.1), 'two .1 chamfers: ' + JSON.stringify(chLines()));
      d1 = rfCEType('Distance 1', '2.5'); rfCEEnter(d1); await wait(20);
      assert(chLines().length === 2 && allAt(0.1) && rfCEBox('d1').classList.contains('expr-err'), '2.5 refused, the .1 chamfers kept, the box marked: ' + JSON.stringify(chLines()) + ' ' + statusText());
      rskClick([4, 0]); await wait(20);
      assert(chLines().length === 2 && allAt(0.1) && rfCERows().length === 2, 'no chamfer at 2.5 while the value is refused: ' + JSON.stringify(chLines()) + ' ' + rfCERows().join(' | '));
      await UI.pmOK(); await wait(20);
      assert(UI.hasPM() && chLines().length === 2 && allAt(0.1), '✓ refused while the value stands: ' + statusText());
      d1 = rfCEType('Distance 1', '.2'); rfCEEnter(d1); await wait(20);
      assert(chLines().length === 2 && allAt(0.2) && !rfCEBox('d1').classList.contains('expr-err'), 'both re-made at .2, the mark gone: ' + JSON.stringify(chLines()));
      rskClick([4, 0]); await wait(20);
      assert(chLines().length === 3 && allAt(0.2) && rfCERows().length === 3, 'the third corner at .2: ' + JSON.stringify(chLines()));
      await UI.pmOK(); await wait(20);
      assert(!UI.hasPM() && chLines().length === 3 && allAt(0.2), 'closed with three .2 chamfers: ' + JSON.stringify(chLines()));
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    } finally { UI.App.model.units = 'mm'; }
    return 'no mixed sizes';
  });
  step('rfCL: the first entity of a pair stays picked across a value change — one corner filleted at R.125, the L\'s first line picked, .25 + Enter re-makes the corner at R.25 with the line still picked, the L\'s second line picked: the pair\'s fillet is made, two at R.25', async function () {
    var errs0 = errors.length;
    await rfCENew();
    try {
      UI.cmdSketchFillet(); await wait(20);
      var rf = rfCEType('Radius', '.125'); rfCEEnter(rf); await wait(10);
      rskClick([4, 3]); await wait(20);
      assert(rfCEArcs().length === 1, 'one fillet');
      rskClick([-2, 0]); await wait(20);
      assert(/Pick the second entity/.test(statusText()), 'the first line picked: ' + statusText());
      rf = rfCEType('Radius', '.25'); rfCEEnter(rf); await wait(20);
      assert(rfCEArcs().length === 1 && rfCEAllR(rfCEArcs(), 0.25), 'the corner re-made at R.25: ' + JSON.stringify(rfCEArcs()));
      rskClick([-3, 1]); await wait(20);
      assert(rfCEArcs().length === 2 && rfCEAllR(rfCEArcs(), 0.25) && rfCEAt(rfCEArcs(), -2.75, 0.25) && rfCERows().length === 2, 'the second line completes the pair: ' + JSON.stringify(rfCEArcs()) + ' ' + rfCERows().join(' | '));
      assert(!/Pick the second entity/.test(statusText()), 'not asked for a second entity again: ' + statusText());
      UI.pmCancel(); await wait(20);
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    } finally { UI.App.model.units = 'mm'; }
    return 'the first pick kept';
  });
