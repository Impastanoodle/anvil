  // --- rfDF (2026-10-26, lane DF: reference geometry follow-ups) --- a sketch snaps to the reference Points, Axis ends
  // and Coordinate System origins before it (labelled, no relation), Add Relations takes a reference point (it comes in
  // as a fixed construction point) for a Merge / Coincident; Measure reads reference points and axes (point–axis
  // distance, axis–axis angle and minimum distance). Real mouse events throughout.
  var rfDFPart = 'p.units("mm");\np.sketch("Front").rect(0, 0, 40, 30).end().extrude(10);\n' +
    'var rs = p.sketch("Front", 10, "Refs").point(13, 7).point(35, 20).line(30, 5, 30, 25).id();\n' +
    'p.point("on", [{ sketch: rs, entity: 0 }]);\np.axis("line", [{ sketch: rs, entity: 2 }]);\np.csys({ origin: { sketch: rs, entity: 1 } });\n';
  function rfDFEv(type, p, target, mods) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
  }
  function rfDFClick(p, mods) { rfDFEv('mousemove', p, null, mods); rfDFEv('mousedown', p, $('viewport'), mods); rfDFEv('mouseup', p, null, mods); }
  function rfDFKey(k) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  function rfDFScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfDFInfer(s) { return UI.sketchInferPoint(UI.screenToPlane(s[0], s[1], UI.activePlane()), s[0], s[1]); }
  function rfDFSame(p, q) { return Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9; }
  function rfDFFeat(name) { return UI.App.model.features.filter(function (f) { return f.name === name; })[0]; }
  async function rfDFSketch() {
    await anvil.newPart(); await idle();
    await anvil.run(rfDFPart + 'p.sketch("Front", 10, "OnTop").point(-20, -20);'); await idle();
    assert(!Object.keys(UI.App.build.errors || {}).length, 'build errors ' + JSON.stringify(UI.App.build.errors));
    var f = rfDFFeat('OnTop');
    UI.editSketch(f.id); await idle();
    assert(UI.App.mode === 'sketch', 'in the sketch');
    UI.zoomView(0.25 / UI.cam.scale);
    var s = rfDFScr([20, 15]); UI.panView(UI.size.w * 0.5 - s[0], UI.size.h * 0.5 - s[1]); UI.updateSketches(); await wait(30);
    return f;
  }

  step('rfDF: in a sketch on the block\'s top, the cursor a few pixels off snaps exactly to Point1, both ends of Axis1 and the Coordinate System origin (labelled, model colour, no relation); a Line clicked between them has those ends; View ▸ Points off drops Point1', async function () {
    var errs0 = errors.length;
    var f = await rfDFSketch();
    try {
      UI.setTool('line');
      var rs = UI.sketchRefSnaps();
      assert(rs.length === 4 && rs.every(function (c) { return c.kind === 'mref' && c.model; }), 'four reference snaps: ' + JSON.stringify(rs));
      var a = rfDFInfer([rfDFScr([13, 7])[0] + 3, rfDFScr([13, 7])[1] - 2]);
      assert(a.snap && a.snap.kind === 'mref' && a.snap.label === 'Point1' && rfDFSame(a.p, [13, 7]), 'Point1: ' + JSON.stringify(a.snap));
      var e1 = rfDFInfer([rfDFScr([30, 25])[0] - 2, rfDFScr([30, 25])[1] + 3]);
      assert(e1.snap && e1.snap.kind === 'mref' && /Axis1 end/.test(e1.snap.label) && rfDFSame(e1.p, [30, 25]), 'Axis1 end: ' + JSON.stringify(e1.snap));
      var o = rfDFInfer([rfDFScr([35, 20])[0] + 2, rfDFScr([35, 20])[1] + 2]);
      assert(o.snap && o.snap.kind === 'mref' && /Coordinate System1 origin/.test(o.snap.label) && rfDFSame(o.p, [35, 20]), 'csys origin: ' + JSON.stringify(o.snap));
      var n0 = f.entities.length, r0 = (f.rels || []).length;
      var p1 = rfDFScr([13, 7]), p2 = rfDFScr([30, 5]);
      rfDFClick([p1[0] + 3, p1[1] + 2]); rfDFClick([p2[0] - 3, p2[1] + 2]); rfDFKey('Escape'); rfDFKey('Escape'); await idle();
      var ln = f.entities[n0];
      assert(f.entities.length === n0 + 1 && ln.t === 'line' && rfDFSame([ln.x1, ln.y1], [13, 7]) && rfDFSame([ln.x2, ln.y2], [30, 5]), 'line ends ' + JSON.stringify(ln));
      assert((f.rels || []).length === r0, 'no relation added: ' + JSON.stringify(f.rels));
      UI.App.view.showPoints = false;
      try {
        UI.setTool('line');
        var b = rfDFInfer([p1[0] + 3, p1[1] - 2]);
        assert(!(b.snap && b.snap.kind === 'mref'), 'hidden Point1 does not snap: ' + JSON.stringify(b.snap));
        assert(UI.sketchRefSnaps().length === 3, 'three left');
      } finally { UI.App.view.showPoints = true; }
      rfDFKey('Escape'); await idle();
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
      return 'snapped to ' + rs.map(function (c) { return c.label; }).join(', ');
    } finally { if (UI.App.mode === 'sketch') { UI.exitSketch(true); await idle(); } }
  });

  step('rfDF: Add Relations with a line end and the Coordinate System origin (clicked) brings the origin in as a fixed point and merges the end onto it', async function () {
    var errs0 = errors.length;
    var f = await rfDFSketch();
    try {
      f.entities.push({ t: 'line', x1: 0, y1: -10, x2: 20, y2: -12 }); UI.updateSketches();
      var li = f.entities.length - 1;
      UI.setTool('select'); UI.setSelection([]);
      UI.cmdAddRelations(); await idle();
      assert(UI.pmTitle() === 'Add Relations', 'Add Relations PM');
      rfDFClick(rfDFScr([20, -12])); await wait(20);
      rfDFClick(rfDFScr([35, 20])); await wait(20);
      var picks = (UI.App.relPick || []).slice();
      assert(picks.length === 2, 'two picks: ' + JSON.stringify(picks));
      var fx = f.entities.filter(function (e) { return e.t === 'point' && e.construction && rfDFSame([e.x, e.y], [35, 20]); });
      assert(fx.length === 1, 'the origin came in as a construction point: ' + JSON.stringify(f.entities));
      var btn = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (x) { return /^(Merge|Coincident)$/.test(x.textContent.trim()); })[0];
      assert(btn, 'Merge / Coincident offered: ' + Array.prototype.map.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent.trim(); }).join('|'));
      btn.click(); await idle();
      await UI.pmOK(); await idle();
      var ln = f.entities[li];
      assert(rfDFSame([ln.x2, ln.y2], [35, 20]) && rfDFSame([ln.x1, ln.y1], [0, -10]), 'end merged onto the origin: ' + JSON.stringify(ln));
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
      return btn.textContent.trim() + ' to (35, 20)';
    } finally { if (UI.hasPM()) UI.pmCancel(); if (UI.App.mode === 'sketch') { UI.exitSketch(true); await idle(); } }
  });

  step('rfDF: Measure — click Point1, Ctrl+click Axis1: normal distance 17; Axis1 and Axis2 (along X through the origin): 90° and a minimum distance of 10; a face alone reads as before', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(rfDFPart + 'p.axis("points", [[0, 0, 0], [40, 0, 0]]);'); await idle();
    UI.setRibbonTab('Evaluate'); UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(60);
    try {
      UI.cmdMeasure(); await idle();
      assert(UI.pmTitle() === 'Measure', 'Measure PM');
      rfDFClick(UI.worldToScreen([13, 7, 10])); await idle(); await wait(20);
      rfDFClick(UI.worldToScreen([30, 15, 10]), { ctrlKey: true }); await idle(); await wait(20);
      var rows = UI.measureRows(), txt = ($('pm') || D.body).textContent;
      var nd = rows && rows.filter(function (r) { return r[0] === 'Normal distance'; })[0];
      assert(nd && parseFloat(nd[1]) === 17 && /Normal distance/.test(txt), 'point–axis: ' + JSON.stringify(rows) + ' / ' + JSON.stringify([UI.App.sel, UI.App.sel2]));
      rfDFClick(UI.worldToScreen([20, 0, 0])); await idle(); await wait(20);
      rfDFClick(UI.worldToScreen([30, 20, 10]), { ctrlKey: true }); await idle(); await wait(20);
      rows = UI.measureRows();
      var ang = rows && rows.filter(function (r) { return r[0] === 'Angle'; })[0], md = rows && rows.filter(function (r) { return r[0] === 'Minimum distance'; })[0];
      assert(ang && parseFloat(ang[1]) === 90 && md && parseFloat(md[1]) === 10, 'axis–axis: ' + JSON.stringify(rows));
      UI.setSelection([]); await idle();
      rfDFClick(UI.worldToScreen([5, 25, 10])); await idle(); await wait(20);
      assert(UI.measureRows() === null && /Area/.test($('pm').textContent), 'a face reads area as before: ' + $('pm').textContent.slice(0, 200));
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
      return nd[1] + ', ' + ang[1] + ', ' + md[1];
    } finally { if (UI.hasPM()) UI.pmCancel(); UI.setSelection([]); }
  });

  // lane DF2: Convert Entities takes reference geometry before the sketch
  step('rfDF: Convert Entities — clicking Point1, Axis1 and the Coordinate System origin lists them by name; ✓ adds a point at (13, 7), a construction line (30, 5)–(30, 25) and a point at (35, 20), each Fixed, in one undo step', async function () {
    var errs0 = errors.length;
    var f = await rfDFSketch();
    try {
      var n0 = f.entities.length, r0 = (f.rels || []).length;
      UI.cmdConvertEntities(); await idle();
      assert(UI.pmTitle() === 'Convert Entities', 'Convert Entities PM: ' + UI.pmTitle());
      rfDFClick(rfDFScr([13, 7])); await wait(20);
      rfDFClick(rfDFScr([30, 15])); await wait(20);
      rfDFClick(rfDFScr([35, 20])); await wait(20);
      var listed = $('pm').textContent;
      assert(/Point1/.test(listed) && /Axis1/.test(listed) && /Coordinate System1/.test(listed), 'listed by name: ' + listed.slice(0, 300));
      await UI.pmOK(); await idle();
      var add = f.entities.slice(n0);
      assert(add.length === 3, 'three entities: ' + JSON.stringify(add));
      assert(add[0].t === 'point' && rfDFSame([add[0].x, add[0].y], [13, 7]), 'Point1 → point ' + JSON.stringify(add[0]));
      assert(add[1].t === 'line' && add[1].construction && rfDFSame([add[1].x1, add[1].y1], [30, 5]) && rfDFSame([add[1].x2, add[1].y2], [30, 25]), 'Axis1 → construction line ' + JSON.stringify(add[1]));
      assert(add[2].t === 'point' && rfDFSame([add[2].x, add[2].y], [35, 20]), 'origin → point ' + JSON.stringify(add[2]));
      var fixes = (f.rels || []).slice(r0).filter(function (r) { return r.type === 'fix'; }).length;
      assert(fixes === 3, 'each Fixed: ' + JSON.stringify((f.rels || []).slice(r0)));
      await UI.undo(); await idle();
      var f2 = UI.activeSketchFeature();
      assert(f2 && f2.entities.length === n0, 'one undo step takes all three away: ' + (f2 && f2.entities.length));
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
      return add.map(function (e) { return e.t; }).join(', ');
    } finally { if (UI.hasPM()) UI.pmCancel(); if (UI.App.mode === 'sketch') { UI.exitSketch(true); await idle(); } }
  });
