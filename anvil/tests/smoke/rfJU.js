  // --- rfJU (2026-11-06, lane shopflow-2, test-reports/2026-11-06-shop-flow.md findings 2, 4, 5) --- in the app: the
  // Edge-Flange PM on two clicked edges of a corner, Material Inside, Miter corners left unticked, ✓: the corner is
  // mitred as SolidWorks makes it (the same part as miter: true); DXF/DWG Output ✓: $EXTMIN / $EXTMAX = the blank;
  // Annotation ▸ Hole Table on a flat with no holes (corner clicked, All holes ticked) ✓ is refused with a message, no
  // table, no undo step; Punch Table on it still works. Self-contained.
  (function () {
    var T = 0.0747, R = 0.075;
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n';
    function rfJUEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfJUClick(p) { rfJUEv('mousemove', p); rfJUEv('mousedown', p, $('viewport')); rfJUEv('mouseup', p); }
    function rfJUSheetClick(p) { sheetMouse('mousemove', p); sheetMouse('mousedown', p); sheetMouse('mouseup', p); }
    function rfJUVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfJUHeader(t, name) { var m = new RegExp('\\$' + name + '\\r?\\n10\\r?\\n([-0-9.e]+)\\r?\\n20\\r?\\n([-0-9.e]+)').exec(t); return m ? [+m[1], +m[2]] : null; }

    step('rfJU: Edge-Flange PM, two edges of a corner clicked, Material Inside, Miter corners unticked, ✓: the corner is mitred (= the miter: true part); DXF/DWG Output ✓ writes $EXTMIN 0,0 and $EXTMAX = the blank', async function () {
      var errs0 = errors.length;
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(HEAD); await idle();
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      UI.cmdEdgeFlange(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Edge-Flange', 'Edge-Flange PM');
      [[5, T, 6], [10, T, 3]].forEach(function (q) { var s = UI.worldToScreen(edgeNear(q).mid); rfJUClick(s); });
      await idle(); await wait(20);
      assert(UI.pmSpec().values.edges.length === 2, 'two edges taken: ' + statusText());
      var mc = pmField('Miter corners');
      assert(mc && !mc.checked, 'Miter corners unticked');
      setInput(pmField('Position'), 'inside'); await wait(10);
      setInput(pmField('Length'), 2); await wait(10);
      await pmAccept(); await wait(30);
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'flange' && !f.miter && f.edges.length === 2 && !UI.App.build.errors[f.id], 'flange: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      var v = rfJUVol(), fp = K.flatPattern(UI.App.model, UI.App.build, UI.App.mesh);
      await anvil.run(HEAD + 'p.flange(2, [[5, ' + T + ', 6], [10, ' + T + ', 3]], { position: "inside", lengthRef: "outer", miter: true });\n'); await idle();
      near(v, rfJUVol(), 1e-9, 'the same part as miter: true');
      // DXF/DWG Output R2000, Notes on: the header is the blank
      await anvil.run(HEAD + 'p.flange(2, [[5, ' + T + ', 6], [10, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });\n'); await idle();
      near(rfJUVol(), v, 1e-9, 'no miter written: the same mitred part');
      fp = K.flatPattern(UI.App.model, UI.App.build, UI.App.mesh);
      UI.cmdDxfOutput(); await wait(20);
      setInput(D.querySelector('#pm select[data-key="version"]'), 'R2000'); await wait(10);
      var got = null, dl = UI.download;
      UI.download = function (name, data) { got = { name: name, data: data }; };
      try { await pmAccept(); } finally { UI.download = dl; }
      assert(got && /NOTES/.test(got.data), 'downloaded with notes: ' + (got && got.name));
      var mn = rfJUHeader(got.data, 'EXTMIN'), mx = rfJUHeader(got.data, 'EXTMAX');
      assert(mn && mx, 'extents in the header');
      near(mn[0], 0, 1e-9, 'EXTMIN x'); near(mn[1], 0, 1e-9, 'EXTMIN y');
      near(mx[0], fp.size[0], 1e-6, 'EXTMAX x = blank'); near(mx[1], fp.size[1], 1e-6, 'EXTMAX y = blank');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'blank ' + fp.size.map(function (x) { return x.toFixed(4); }).join(' x ');
    });

    step('rfJU: Annotation ▸ Hole Table on a louvered panel\'s flat (corner clicked, All holes in the view, ✓) is refused: a message, no table, no undo step; anvil.drawing.holeTable too; Punch Table on it still works', async function () {
      var errs0 = errors.length, T18 = 0.0478;
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sheet(' + T18 + ', 0.05, 0.44);\np.sketch("Top").rect(0, -8, 12, 8).end().baseFlange();\np.formingTool("louver", [6, ' + T18 + ', 4], { angle: 90 });\n'); await idle();
      anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
      anvil.drawing.flatView({ x: 5, y: 4 }); await UI.drawing.ready(); await wait(30);
      UI.drawing.fit(); await wait(20);
      var fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
      assert(fv, 'flat view');
      var n0 = UI.App.undo.length;
      ribbonButton('Hole Table').click(); await idle();
      assert(UI.drawing.state.tool === 'holetable' && UI.pmTitle() === 'Hole Table', 'Hole Table PM');
      var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.id === fv.id; })[0], b = w.proj.bounds, c0 = w.toSheet([b.umin, b.vmin]);
      rfJUSheetClick([c0[0] + 0.02, c0[1]]); await idle();
      assert(UI.drawing.state.pending.origin, 'origin picked');
      pmField('All holes in the view').click(); await wait(10);
      await UI.pmOK(); await idle(); await wait(30);
      assert(!anvil.drawing.holeTables().length, 'no table: ' + JSON.stringify(anvil.drawing.holeTables()));
      assert(UI.App.undo.length === n0, 'no undo step');
      assert(/no holes in/.test(statusText()), 'status says why: ' + statusText());
      if (UI.hasPM()) UI.pmCancel();
      await idle();
      assert(anvil.drawing.holeTable(fv.id, { all: true, origin: { p: [b.umin, b.vmin] } }) == null && !anvil.drawing.holeTables().length && UI.App.undo.length === n0, 'API refused');
      assert(anvil.drawing.punchTable(fv.id) != null && anvil.drawing.holeTables().length === 1 && anvil.drawing.holeTables()[0].punch, 'Punch Table made');
      anvil.drawing.close(); await idle();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
