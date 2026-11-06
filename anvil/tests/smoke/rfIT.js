  // --- rfIT (2026-11-05, lane sketchtools) --- Offset Entities' driving offset dimension (circle: radial distance
  // between the two concentric circles, Modify moves the offset only; line: distance between the parallel lines),
  // Close Sketch to Model on a U ending on an inch plate's edges, Make Path selected / dimensioned as one (Select tool,
  // Path Length, Smart Dimension right-click), relation-list icons at 16 px in rows of unchanged height. Every step
  // turns the sketch grid off and puts it back.
  async function rfITNew(code) {
    var m = UI.K.newModel('ITPart'); m.units = 'in';
    await anvil.load(m); await idle();
    if (code) { await anvil.run('p.units("in");\n' + code); await idle(); }
    var fs = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; }), f = fs[fs.length - 1];
    if (f && code) { await UI.enterSketch(f.id); await idle(); }
    else { await UI.newSketchOnPlane('Front'); await idle(); }
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.01 / UI.cam.scale); UI.App.gridStale = true;
    return UI.activeSketchFeature();
  }
  async function rfITGrid(fn) {
    var was = UI.App.view.showGrid;
    UI.App.view.showGrid = false; UI.App.gridStale = true;
    try { return await fn(); } finally { UI.App.view.showGrid = was; UI.App.gridStale = true; }
  }
  step('rfIT: Offset Entities on a circle R.5 by .1 with Add dimensions: one driving radial-distance dimension .100 between the concentric circles; Modify to .2 moves the offset (R.7), the original stays R.5', async function () {
    return rfITGrid(async function () {
      var errs0 = errors.length, f = await rfITNew();
      f.entities.push({ t: 'circle', cx: 1, cy: 1, r: 0.5 });
      UI.updateSketches(); await idle();
      UI.setSelection([{ kind: 'entity', index: 0 }]); await idle();
      UI.cmdOffsetEntities(); await idle();
      UI.pmSetField('d', '.1'); await idle();
      assert(D.querySelector('#pm input[data-key="dims"]').checked, 'Add dimensions is on by default');
      UI.pmOK({ close: true }); await idle();
      f = UI.activeSketchFeature();
      var ds = (f.rels || []).filter(function (r) { return r.type === 'distance'; });
      assert(ds.length === 1 && ds[0].dir === 'r' && ds[0].refs.join() === '0,1' && !ds[0].driven, 'one driving radial distance ' + JSON.stringify(f.rels));
      near(ds[0].v, 0.1, 1e-12, 'value .1'); near(f.entities[1].r, 0.6, 1e-9, 'offset R.6');
      assert((f.rels || []).some(function (r) { return r.type === 'concentric'; }), 'concentric');
      UI.App.dimsStale = false; UI.drawDims();
      var labels = Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (t) { return t.textContent; });
      assert(labels.some(function (t) { return /^\.100$/.test(t.trim()); }), 'label .100 drawn: ' + labels.join(' | '));
      var r = UI.editRelDim(f.rels.indexOf(ds[0]), '.2');
      assert(r.ok, 'Modify .2: ' + JSON.stringify(r));
      f = UI.activeSketchFeature();
      near(f.entities[0].r, 0.5, 1e-9, 'the original stays R.5'); near(f.entities[1].r, 0.7, 1e-9, 'the offset moves to R.7');
      near(f.entities[1].cx, 1, 1e-9, 'concentric x'); near(f.entities[1].cy, 1, 1e-9, 'concentric y');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'R.5 → R.6, .2 → R.7';
    });
  });
  step('rfIT: Offset Entities on a line by .25: a driving distance .250 between the parallel lines; Modify to .5 moves the offset line, the original stays', async function () {
    return rfITGrid(async function () {
      var f = await rfITNew();
      f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 3, y2: 0 });
      UI.updateSketches(); await idle();
      UI.setSelection([{ kind: 'entity', index: 0 }]); await idle();
      UI.cmdOffsetEntities(); await idle();
      UI.pmSetField('d', '.25'); await idle();
      UI.pmOK({ close: true }); await idle();
      f = UI.activeSketchFeature();
      var ds = (f.rels || []).filter(function (r) { return r.type === 'distance'; });
      assert(ds.length === 1 && !ds[0].dir && ds[0].refs.join() === '0,1', 'one distance ' + JSON.stringify(f.rels));
      assert((f.rels || []).some(function (r) { return r.type === 'parallel'; }), 'parallel');
      near(Math.abs(f.entities[1].y1), 0.25, 1e-9, 'offset .25');
      var r = UI.editRelDim(f.rels.indexOf(ds[0]), '.5');
      assert(r.ok, 'Modify .5: ' + JSON.stringify(r));
      f = UI.activeSketchFeature();
      var L0 = f.entities[0], L1 = f.entities[1];
      near(L0.y1, 0, 1e-9, 'original y1'); near(L0.y2, 0, 1e-9, 'original y2'); near(L0.x1, 0, 1e-9, 'original x1'); near(L0.x2, 3, 1e-9, 'original x2');
      near(Math.abs(L1.y1), 0.5, 1e-9, 'offset at .5'); near(L1.y1, L1.y2, 1e-9, 'still parallel');
      return 'line .25 → .5';
    });
  });
  step('rfIT: Close Sketch to Model on an inch plate 6 × 4 × .25: a U drawn on the face with its ends on the bottom edge closes along that edge, the closed region extrudes .5 (6·4·.25 + 3·2·.5); Reverse takes the rest of the face', async function () {
    return rfITGrid(async function () {
      var errs0 = errors.length;
      var code = 'p.sketch("Front").rect(0, 0, 6, 4);\np.extrude(0.25);\np.sketch("Front", 0.25).line(1.5, 0, 1.5, 2).line(1.5, 2, 4.5, 2).line(4.5, 2, 4.5, 0);';
      var f = await rfITNew(code);
      assert(K.sketchProfile(f).loops.length === 0, 'open at the start');
      var spec = UI.cmdCloseSketchToModel(); await idle();
      assert(spec && spec.title === 'Close Sketch to Model', 'the PM');
      assert(pmField('Reverse direction of closure'), 'the Reverse direction of closure box (the side asked for)');
      assert(UI.App.tempEntities.length === 1, 'preview: one closing line ' + JSON.stringify(UI.App.tempEntities));
      UI.pmOK({ close: true }); await idle();
      f = UI.activeSketchFeature();
      var pr = K.sketchProfile(f);
      assert(pr.loops.length === 1 && !pr.warnings.length, 'closed ' + JSON.stringify(pr.warnings));
      UI.exitSketch(); await idle();
      await anvil.run(anvil.script() + '\np.extrude(0.5);'); await idle();
      near(anvil.mass().volume, 6 * 4 * 0.25 + 3 * 2 * 0.5, 1e-6, 'the U region extrudes');
      f = await rfITNew(code);
      var r = UI.closeSketchToModel({ reverse: true });
      assert(r.ok, 'reverse ' + JSON.stringify(r));
      UI.exitSketch(); await idle();
      await anvil.run(anvil.script() + '\np.extrude(0.5);'); await idle();
      near(anvil.mass().volume, 6 * 4 * 0.25 + (24 - 6) * 0.5, 1e-6, 'the rest of the face extrudes');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'U ' + (6 * 4 * 0.25 + 3) + ' in³, reverse ' + (6 + 9) + ' in³';
    });
  });
  step('rfIT: Make Path on an L + tangent arc: a click on one member selects the whole path, Ctrl+click takes it out; Path Length on one member takes the path (2 + 1.5 + π/4); Smart Dimension right-click on a member offers Path Length Dimension; the select-menu row too', async function () {
    return rfITGrid(async function () {
      var errs0 = errors.length, f = await rfITNew();
      UI.zoomView(0.006 / UI.cam.scale);
      // L: a 2 in line up, a 1.5 in line across, then an arc R.5 tangent to the across line (quarter turn down), and a loose line
      f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 0, y2: 2 }, { t: 'line', x1: 0, y1: 2, x2: 1.5, y2: 2 }, { t: 'arc', cx: 1.5, cy: 1.5, r: 0.5, a0: 0, a1: 90 },
        { t: 'line', x1: -1, y1: -1, x2: -0.2, y2: -1 });
      f.rels = [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p2'] }, { type: 'tangent', refs: ['1', '2'] }];
      UI.updateSketches(); await idle();
      var mp = K.makeSketchPath(f, [0, 1, 2]);
      assert(mp.ok && mp.ents.length === 3, 'path made ' + JSON.stringify(mp));
      UI.updateSketches(); UI.setTool('select'); UI.setSelection([]); await idle();
      rskClick([0, 1]); await idle();
      var sel = UI.selection().filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; }).sort();
      assert(sel.join() === '0,1,2', 'a click on a member selects the path: ' + sel);
      assert(/Path1 selected/.test(statusText()), 'status ' + statusText());
      rskClick([-0.6, -1]); await idle();
      sel = UI.selection().filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; });
      assert(sel.join() === '3', 'a loose line alone: ' + sel);
      selClick(rskScr([0, 0.5]), { ctrlKey: true }); await idle();
      sel = UI.selection().filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; }).sort();
      assert(sel.join() === '0,1,2,3', 'Ctrl+click adds the whole path: ' + sel);
      selClick(rskScr([0, 0.5]), { ctrlKey: true }); await idle();
      sel = UI.selection().filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; });
      assert(sel.join() === '3', 'Ctrl+click again takes the whole path out: ' + sel);
      // the right-click rows on a member
      UI.setSelection([{ kind: 'entity', index: 1 }]); await idle();
      var rows = UI.sketchMenuItems([]).map(function (x) { return x && x.label; });
      assert(rows.indexOf('Path Length Dimension') >= 0 && rows.indexOf('Edit Path') >= 0, 'rows ' + rows.join());
      // Path Length with one member selected takes the whole path
      UI.setSelection([{ kind: 'entity', index: 0 }]); await idle();
      var spec = UI.cmdPathLengthDim(); await idle();
      var want = 2 + 1.5 + Math.PI * 0.5 / 2;
      var listed = spec.groups[0].fields[0].value;
      assert(listed.split(',').length === 3 && /Arc/.test(listed), 'all three listed: ' + listed);
      await UI.pmOK(); await idle();
      assert(UI.pmTitle() === 'Path Length', 'still placing: ' + UI.pmTitle());
      rskClick([0.6, 0.8]); await idle(); await wait(20);
      f = UI.activeSketchFeature();
      var pl = (f.rels || []).filter(function (r) { return r.type === 'pathlength'; });
      assert(pl.length === 1 && pl[0].refs.slice().sort().join() === '0,1,2', 'one path length on the path ' + JSON.stringify(pl) + ' pm ' + UI.pmTitle() + ' status ' + statusText() + ' at ' + JSON.stringify(rskScr([0.6, 0.8])));
      if (!$('dim-edit').hidden && UI.cancelDimEdit) UI.cancelDimEdit();
      near(W.SketchSolver.measure(f, 'pathlength', pl[0].refs), want, 1e-9, 'L + arc length');
      // Smart Dimension: right-click a member offers Path Length Dimension, which waits for the placing click
      UI.setTool('dimension'); await idle();
      var p = rskScr([0, 1]), shown = null, sm = UI.showMenu;
      UI.showMenu = function (x, y, items) { shown = items; };
      try { assert(UI.dimMidMenu(p[0], p[1]), 'a menu on the member'); } finally { UI.showMenu = sm; }
      var row = (shown || []).filter(function (x) { return x && x.label === 'Path Length Dimension'; })[0];
      assert(row, 'Path Length Dimension row: ' + (shown || []).map(function (x) { return x && x.label; }).join());
      row.action(); await idle();
      rskClick([-0.4, 1.2]); await idle(); await wait(20);
      if (!$('dim-edit').hidden && UI.cancelDimEdit) UI.cancelDimEdit();
      f = UI.activeSketchFeature();
      pl = (f.rels || []).filter(function (r) { return r.type === 'pathlength'; });
      assert(pl.length === 2 && pl[1].refs.slice().sort().join() === '0,1,2', 'a second path length placed ' + JSON.stringify(pl));
      UI.setTool('select'); await idle();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'path ' + want.toFixed(4) + ' in';
    });
  });
  step('rfIT: the relation lists draw their icons at 16 px (Line Properties Existing Relations, Display/Delete Relations, Add Relations PM) in rows no taller than before', async function () {
    return rfITGrid(async function () {
      var f = await rfITNew();
      f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 2, y2: 0 }, { t: 'line', x1: 0, y1: 1, x2: 2, y2: 1.5 });
      f.rels = [{ type: 'horizontal', refs: ['0'] }];
      UI.updateSketches(); await idle();
      var heights = [];
      function check(where) {
        var rows = D.querySelectorAll('#pm .rel-row');
        assert(rows.length, where + ': rows');
        Array.prototype.forEach.call(rows, function (r) {
          var svg = r.querySelector(':scope > svg');
          assert(svg && Math.round(svg.getBoundingClientRect().width) === 16 && Math.round(svg.getBoundingClientRect().height) === 16, where + ': icon 16 px, got ' + (svg && svg.getBoundingClientRect().width));
          // the height the row had with the old 14 px icon: the same row with the icon set to 14 px
          var h = r.getBoundingClientRect().height, w0 = svg.getAttribute('width'), h0 = svg.getAttribute('height');
          svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
          var h14 = r.getBoundingClientRect().height;
          svg.setAttribute('width', w0); svg.setAttribute('height', h0);
          heights.push(h + '/' + h14);
          assert(h <= h14 + 0.01, where + ': row height ' + h + ', was ' + h14);
        });
        return rows.length;
      }
      UI.setTool('select'); rskClick([1, 0]); await idle();
      var n1 = check('Line Properties');
      UI.setSelection([]); await idle();
      UI.cmdDisplayRelations(); await idle();
      var n2 = check('Display/Delete Relations');
      UI.closePM(); await idle();
      return n1 + ' + ' + n2 + ' rows, heights ' + heights.join(' ');
    });
  });
  // --- end rfIT ---
