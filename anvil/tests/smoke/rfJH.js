  // --- rfJH (2026-11-05, lane sketchgaps) --- Sketch tab gaps against SolidWorks: the grid / length snap step of an
  // inch document is SolidWorks' 1 in major with 4 minors (0.25 in), a mm one 1-2-5 minors (5 mm); Autodimension of a
  // drawn straight slot gives its centre-to-centre length and its centre position; Blocks ▸ Add/Remove by clicks in
  // the graphics area, Blocks ▸ Rebuild. Every step turns the sketch grid off again and leaves the units as they were.
  function rfJHScr(uv) { return UI.worldToScreen(UI.K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfJHEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfJHKey(k) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  function rfJHClick(uv) { var p = rfJHScr(uv); rfJHEv('mousemove', p); rfJHEv('mousedown', p, $('viewport')); rfJHEv('mouseup', p); }
  async function rfJHNew(units, perPx) {
    var m = UI.K.newModel('JHPart'); m.units = units;
    await anvil.load(m); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(perPx / UI.cam.scale); UI.App.gridStale = true;
    UI.cam.target.set(0, 0, 0); if (UI.applyCamera) UI.applyCamera();
    return UI.activeSketchFeature();
  }
  async function rfJHGrid(on, fn) {
    var was = UI.App.view.showGrid;
    UI.App.view.showGrid = on; UI.App.gridStale = true;
    try { return await fn(); } finally { UI.App.view.showGrid = was; UI.App.gridStale = true; if (UI.App.mode === 'sketch') { UI.setTool('select'); } }
  }

  step('rfJH: grid / length snap step as SolidWorks — an inch document at 0.017 in/px snaps in 0.25 in (major 1 in, 4 minors; was 0.2), a line drawn by mouse to (2.57, 1.2) ends on (2.5, 1.25), not (2.6, 1.2); a mm document at 0.3 mm/px snaps in 5 mm (was 4)', async function () {
    return rfJHGrid(true, async function () {
      var errs0 = errors.length, f = await rfJHNew('in', 0.017);
      assert(UI.gridStep() === 1 && UI.gridMinors(1) === 4, 'grid ' + UI.gridStep() + ' / ' + UI.gridMinors(UI.gridStep()));
      assert(UI.snapStep() === 0.25, 'inch snap step ' + UI.snapStep());
      UI.setTool('line'); rfJHClick([0, 0]); rfJHClick([2.57, 1.2]); rfJHKey('Escape'); await idle();
      var L = f.entities[0];
      assert(L && L.t === 'line' && Math.abs(L.x1) < 1e-12 && Math.abs(L.y1) < 1e-12, 'line start ' + JSON.stringify(L));
      near(L.x2, 2.5, 1e-9, 'end x on the 0.25 grid ' + JSON.stringify(f.entities) + ' rels ' + JSON.stringify(f.rels)); near(L.y2, 1.25, 1e-9, 'end y on the 0.25 grid');
      UI.zoomView(0.004 / UI.cam.scale);
      assert(UI.snapStep() === 0.0625, 'zoomed in: 1/16 in ' + UI.snapStep());
      f = await rfJHNew('mm', 0.3);
      assert(UI.gridStep() === 20 && UI.snapStep() === 5, 'mm grid ' + UI.gridStep() + ' snap ' + UI.snapStep());
      UI.zoomView(0.2 / UI.cam.scale);
      assert(UI.snapStep() === 2, 'mm at 0.2 mm/px: 2 ' + UI.snapStep());
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'in 0.25, 1/16 zoomed in; mm 5, 2';
    });
  });
  step('rfJH: Autodimension of a straight slot drawn by mouse 1.75 → 4.25 at y 1, width .5 (inch): its centre 3.000 / 1.000 and its first end centre 1.750 from the origin (SolidWorks), no centre-to-centre length; Fully Defined', async function () {
    return rfJHGrid(false, async function () {
      var errs0 = errors.length, f = await rfJHNew('in', 0.01);
      UI.setTool('slot'); rfJHClick([1.75, 1]); rfJHClick([4.25, 1]); rfJHClick([4.25, 1.25]); await idle();
      UI.setTool('select'); await idle();
      f = UI.activeSketchFeature();
      var cl = f.entities.length - 1, c = f.entities[cl];
      assert(c && c.t === 'line' && c.construction && c.x1 === 1.75 && c.x2 === 4.25 && c.y1 === 1, 'slot centerline ' + JSON.stringify(c));
      UI.cmdAutodimension(); await idle();
      clickPmButton('Apply'); await idle();
      await UI.pmOK(); await idle();
      f = UI.activeSketchFeature();
      // rfMM (2026-11-13): SolidWorks' measured rule (ref3_auto.py, 2026-11-02 row 10): centre point + first end centre,
      // no centre-to-centre length
      var len = (f.dims || []).filter(function (d) { return d.e === cl && d.k === 'len'; });
      assert(len.length === 0, 'no centre-to-centre length ' + JSON.stringify(f.dims));
      var ds = (f.rels || []).filter(function (r) { return r.type === 'distance' && r.dir; });
      var desc = ds.map(function (r) { return r.refs.join('-') + ' ' + r.dir + ' ' + r.v; }).join(', ');
      assert(ds.some(function (r) { return r.refs[1] === cl + '.mid' && r.dir === 'h' && Math.abs(r.v - 3) < 1e-9; }) && ds.some(function (r) { return r.refs[1] === cl + '.mid' && r.dir === 'v' && Math.abs(r.v - 1) < 1e-9; }), 'centre 3.0 / 1.0: ' + desc);
      assert(ds.some(function (r) { return r.refs[1] === cl + '.p1' && r.dir === 'h' && Math.abs(r.v - 1.75) < 1e-9; }) && !ds.some(function (r) { return r.dir === 'h' && Math.abs(r.v - 4.25) < 1e-9; }), 'first end centre 1.75, not the far one: ' + desc);
      assert(UI.sketchStatus().status === 'full', 'Fully Defined: ' + JSON.stringify(UI.sketchStatus()));
      UI.App.dimsStale = false; UI.drawDims();
      var labels = Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (t) { return t.textContent.trim(); });
      assert(labels.indexOf('1.750') >= 0 && labels.indexOf('3.000') >= 0, 'labels ' + labels.join(' | '));
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return desc;
    });
  });
  step('rfJH: Blocks ▸ Add/Remove by clicks: a loose circle clicked joins block Plate (both instances get it), a side of the block clicked leaves it (ordinary geometry); ✓ is one undo step; Blocks ▸ Rebuild puts a disturbed instance back', async function () {
    return rfJHGrid(false, async function () {
      var errs0 = errors.length, f = await rfJHNew('in', 0.01);
      f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 2, y2: 0 }, { t: 'line', x1: 2, y1: 0, x2: 2, y2: 1 }, { t: 'line', x1: 2, y1: 1, x2: 0, y2: 1 }, { t: 'line', x1: 0, y1: 1, x2: 0, y2: 0 });
      var a = UI.K.makeBlock(f, [0, 1, 2, 3], 'Plate', [0, 0]), b = UI.K.insertBlock(f, 'Plate', 3, 0, 0, 1);
      assert(a.ok && b.ok, 'blocks ' + JSON.stringify([a, b]));
      f.entities.push({ t: 'circle', cx: 1, cy: 0.5, r: 0.25 });
      UI.updateSketches(); await idle();
      UI.setTool('select'); UI.setSelection([{ kind: 'entity', index: f.entities.findIndex(function (e) { return e.blk === a.id && e.t === 'line'; }) }]); await idle();
      UI.cmdBlockAddRemove(); await idle();
      assert(/Add\/Remove/.test(($('pm') || {}).textContent || ''), 'Add/Remove Entities PropertyManager open');
      var u0 = UI.App.undo.length;
      rfJHClick([1.25, 0.5]); await idle();   // the circle's rim
      rfJHClick([1, 1]); await idle();         // the top side of instance 1
      var pmText = $('pm').textContent;
      assert(/To add\s*1/.test(pmText) && /To remove\s*1/.test(pmText), 'PM counts: ' + pmText.replace(/\s+/g, ' ').slice(0, 300));
      await UI.pmOK(); await idle();
      f = UI.activeSketchFeature();
      assert(f.blocks.Plate.ents.length === 4, 'definition: 3 sides + the circle, ' + f.blocks.Plate.ents.length);
      var ins = UI.K.blockInstances(f);
      assert(ins.length === 2 && ins.every(function (r) { return r.ents.length === 4 && r.ents.some(function (i) { return f.entities[i].t === 'circle'; }); }), 'both instances have the circle');
      var loose = f.entities.filter(function (e) { return e.blk == null && e.t === 'line'; });
      assert(loose.length === 1 && loose[0].y1 === 1 && loose[0].y2 === 1, 'the top side stays as ordinary geometry ' + JSON.stringify(loose));
      assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
      // Rebuild: a piece of instance 2 knocked off its definition comes back
      var r2 = ins.filter(function (r) { return r.id === b.id; })[0], cc = f.entities[r2.ents.filter(function (i) { return f.entities[i].t === 'circle'; })[0]];
      cc.r = 0.4;
      var n = UI.cmdRebuildBlocks(); await idle();
      f = UI.activeSketchFeature();
      var cc2 = f.entities.filter(function (e) { return e.blk === b.id && e.t === 'circle'; })[0];
      assert(n >= 1 && Math.abs(cc2.r - 0.25) < 1e-12 && Math.abs(cc2.cx - 4) < 1e-9, 'rebuilt: ' + n + ' ' + JSON.stringify(cc2));
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'added 1, removed 1, rebuilt ' + n;
    });
  });
  // --- end rfJH ---
