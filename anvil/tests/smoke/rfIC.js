  // --- rfIC (2026-11-05, lane circlepm) --- the Circle PropertyManager's Parameters are Radius and Diameter (user:
  // "remove the x, y location boxes, add Diameter and keep Radius"): no Center X / Center Y boxes on the Circle /
  // Perimeter Circle tool or a selected circle; the two boxes are linked; a size typed before the first click sets the
  // next circle exactly; a circle a relation holds refuses (a dimension follows, as for Radius); Ctrl+Z undoes; inch and mm documents.
  function rfICLabels() { return Array.prototype.map.call(D.querySelectorAll('#pm label, #pm .pm-label'), function (x) { return x.textContent.trim(); }).join('|'); }
  function rfICPM() { return D.getElementById('pm').innerText.replace(/\s*\n+\s*/g, ' | '); }
  function rfICBox(key) { return D.querySelector('#pm input.pm-num[data-key="' + key + '"]'); }
  // a user typing in a PM box: focus, the text, the input event the browser fires
  function rfICType(key, text) {
    var inp = rfICBox(key);
    assert(inp, 'no ' + key + ' box: ' + rfICPM());
    inp.focus();
    assert(UI.pmSetField(key, text), 'pmSetField ' + key);
    inp.blur();
  }
  function rfICCtrl(k) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true })); }
  // the clicks below are exact sketch points: an earlier group (or a failed step) may have left the sketch grid on, and
  // its snap moved them (the full run placed the centre clicked at (10, 5) on the grid at (12, 4)); the setting is put
  // back at the end of each step
  var rfICGrid = null;
  function rfICNoGrid() { if (rfICGrid == null) rfICGrid = !!UI.App.view.showGrid; UI.App.view.showGrid = false; UI.App.gridStale = true; }
  function rfICGridBack() { if (rfICGrid != null) { UI.App.view.showGrid = rfICGrid; UI.App.gridStale = true; rfICGrid = null; } }
  function rfICCircles() { return rskEnts().filter(function (e) { return e.t === 'circle'; }); }
  step('rfIC: Circle tool PM — Parameters are Radius and Diameter (no Center X / Center Y); Diameter 1.5 typed before the first click makes the next circle R 0.75 exactly; the Perimeter Circle tool shows the same boxes (inch document)', async function () {
    await rskNew(); rfICNoGrid();
    try {
      UI.App.model.units = 'in';
      UI.zoomView(0.01 / UI.cam.scale);   // 0.01 in per pixel
      UI.setTool('circle');
      assert(UI.pmTitle() === 'Circle' && /Parameters \| Radius.*Diameter/.test(rfICPM()), 'Circle tool PM: ' + rfICPM());
      assert(!/Center X|Center Y/.test(rfICPM()) && !rfICBox('cx') && !rfICBox('cy'), 'no centre boxes: ' + rfICPM());
      assert(rfICBox('r') && rfICBox('dia'), 'Radius and Diameter boxes');
      var dIdx = rfICPM().indexOf('Diameter'), rIdx = rfICPM().indexOf('Radius');
      assert(rIdx >= 0 && dIdx > rIdx, 'Diameter under Radius');
      rfICType('dia', '1.5');
      near(+rfICBox('r').value, 0.75, 1e-12, 'Radius box follows the typed Diameter');
      rskClick([1, 1]); selEv('mousemove', rskScr([1.913, 1.4]));
      var tmp = (UI.App.tempEntities || [])[0];
      assert(tmp && tmp.t === 'circle' && Math.abs(tmp.r - 0.75) < 1e-9, 'the preview has the typed size: ' + JSON.stringify(tmp));
      rskClick([1.913, 1.4]);
      var c = rfICCircles()[0];
      assert(c && c.r === 0.75 && Math.abs(c.cx - 1) < 1e-12 && Math.abs(c.cy - 1) < 1e-12, 'circle R 0.75 exactly at (1, 1): ' + JSON.stringify(c));
      near(+rfICBox('r').value, 0.75, 1e-12, 'Radius shows the circle placed'); near(+rfICBox('dia').value, 1.5, 1e-12, 'Diameter shows it');
      // the next circle has no preset: it takes the mouse
      selKey('Escape');
      UI.setTool('circle');
      rskClick([4, 1]); rskClick([4.5, 1]);
      var c2 = rfICCircles()[1];
      near(c2.r, 0.5, 1e-9, 'a later circle takes its size from the clicks');
      // Perimeter Circle: same boxes; a typed Diameter 2 holds through the third point
      selKey('Escape');
      UI.setTool('pcircle');
      assert(UI.pmTitle() === 'Circle' && /Parameters \| Radius.*Diameter/.test(rfICPM()) && !/Center X/.test(rfICPM()), 'Perimeter Circle PM: ' + rfICPM());
      rfICType('r', '1');
      near(+rfICBox('dia').value, 2, 1e-12, 'Diameter follows the typed Radius');
      rskClick([-2, -1]); rskClick([-0.8, -1]); selEv('mousemove', rskScr([-1.4, -0.5])); rskClick([-1.4, -0.5]);
      var p = rfICCircles()[2];
      assert(p && p.r === 1, 'perimeter circle R 1 exactly: ' + JSON.stringify(p));
      near(Math.hypot(p.cx + 2, p.cy + 1), 1, 1e-9, 'through the first point'); near(Math.hypot(p.cx + 0.8, p.cy + 1), 1, 1e-9, 'through the second point');
      selKey('Escape');
      return 'R 0.75 from Ø 1.5, perimeter R 1';
    } finally { UI.App.model.units = 'mm'; rfICGridBack(); }
  });
  step('rfIC: a selected circle — Diameter 2 sets R 1 and the Radius box shows 1; Radius 0.25 shows Diameter 0.5; Ctrl+Z restores; a circle a relation holds refuses (a dimension follows, as for Radius); mm document with an inch expression', async function () {
    await rskNew(); rfICNoGrid();
    try {
      UI.setTool('circle'); rskClick([10, 5]); rskClick([14, 5]); selKey('Escape');
      UI.setTool('select'); rskClick([14, 5]);
      assert(UI.pmTitle() === 'Circle' && !/Circle Type/.test(rfICPM()) && /Parameters \| Radius.*Diameter/.test(rfICPM()) && !/Center X|Center Y/.test(rfICPM()), 'selected circle PM: ' + rfICPM());
      near(+rfICBox('r').value, 4, 1e-12, 'Radius 4'); near(+rfICBox('dia').value, 8, 1e-12, 'Diameter 8');
      var undo0 = UI.App.undo.length;
      rfICType('dia', '2');
      var c = rfICCircles()[0];
      assert(c.r === 1 && c.cx === 10 && c.cy === 5, 'Diameter 2 → R 1, centre kept: ' + JSON.stringify(c));
      near(+rfICBox('r').value, 1, 1e-12, 'Radius box shows 1');
      rfICType('r', '0.25');
      assert(rfICCircles()[0].r === 0.25, 'Radius 0.25');
      near(+rfICBox('dia').value, 0.5, 1e-12, 'Diameter box shows 0.5');
      rfICType('dia', '1in');   // a unit expression in a mm document
      near(rfICCircles()[0].r, 12.7, 1e-9, 'Diameter 1in in mm = R 12.7');
      rfICType('dia', '0');
      near(rfICCircles()[0].r, 12.7, 1e-9, 'a zero diameter is refused');
      assert(/diameter must be greater than 0/i.test(D.getElementById('status-msg').textContent), 'says why: ' + D.getElementById('status-msg').textContent);
      assert(UI.App.undo.length > undo0, 'the edits are an undo step');
      UI.pmCancel();
      rfICCtrl('z'); await idle();
      var back = rfICCircles()[0];
      assert(back && back.r === 4, 'Ctrl+Z restores R 4: ' + JSON.stringify(back));
      // a circle whose size a relation holds (Equal to a fixed circle): Radius and Diameter both refuse and say why
      var f = UI.activeSketchFeature();
      f.entities.push({ t: 'circle', cx: 30, cy: 5, r: 2 });
      f.rels = [{ type: 'equal', refs: ['0', '1'] }, { type: 'fix', refs: ['1'] }]; W.SketchSolver.solve(f); UI.updateSketches();
      UI.setTool('select'); rskClick([12, 5]);
      assert(UI.pmTitle() === 'Circle', 'circle PM again: ' + UI.pmTitle());
      rfICType('dia', '5');
      near(rfICCircles()[0].r, 2, 1e-9, 'Diameter refused: held by Equal to the fixed circle');
      assert(/held by a relation or a dimension/.test(D.getElementById('status-msg').textContent), 'held message: ' + D.getElementById('status-msg').textContent);
      near(+rfICBox('r').value, 2, 1e-9, 'the Radius box shows the held size');
      rfICType('r', '3');
      near(rfICCircles()[0].r, 2, 1e-9, 'Radius refused the same way');
      // a diameter dimension follows a typed value, for Diameter as for Radius (the dimension holds what the geometry has)
      f.rels = []; f.dims = [{ e: 0, k: 'dia', ang: 45 }]; W.SketchSolver.solve(f); UI.updateSketches();
      rfICType('dia', '7');
      near(rfICCircles()[0].r, 3.5, 1e-9, 'Diameter 7 on a dimensioned circle');
      near(+rfICBox('r').value, 3.5, 1e-9, 'Radius box 3.5');
      assert(f.dims.length === 1 && W.SketchSolver.analyze(f).status !== 'over', 'the dimension stays, not over defined');
      UI.pmCancel();
      return 'Ø2 → R1, R.25 → Ø.5, undo, held';
    } finally { rfICGridBack(); }
  });
