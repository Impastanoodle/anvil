  // --- rfQI (2026-11-19, lane shopflow9, test-reports/2026-11-19-shop-flow-9.md) --- the shop audit, round 9, driven
  // like a user: the 18 ga door panel gets its Cross-Break by the ribbon and a face click, then goes to 16 ga in the
  // Sheet-Metal PropertyManager (the Cross-Break failed: its face point was left inside the thicker sheet); the flat DXF
  // and a drawing's flat view with its Bend Table; a jog across the return flanges is refused with the reason; the
  // gusseted bracket's Flat Pattern dialog says the Ribs are left out. Self-contained; every setting changed is put back.
  (function () {
    var T18 = 0.0478, H = 0.75 - T18;
    async function rfQINewInch() {
      var du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    }
    function rfQIRow(cls) { return D.querySelector('#tree .ti.' + cls); }
    function rfQIMouse(type, row) { var b = row.getBoundingClientRect(); row.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, clientX: b.left + 20, clientY: b.top + b.height / 2 })); }
    function rfQIMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.trim().indexOf(text) === 0; })[0]; }
    function rfQIErrs() { var e = UI.App.build.errors || {}; return Object.keys(e).map(function (k) { return e[k]; }); }
    function rfQIDoorX(T) { var Rh = 1 / 508, BD = 2 * (T + T) - Math.PI / 2 * (T + T / 2); return [24 + 1.5 - 2 * BD - 2 * (Rh + T) + 2 * (Math.PI * (Rh + T / 2) + 0.5 - Rh - T), 36 + 1.5 - 2 * BD]; }
    var DOOR = 'p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "18" });\np.sketch("Top").rect(0, -36, 24, 36).end().baseFlange();\n' +
      'p.flange(0.75, [[12, ' + T18 + ', 0], [24, ' + T18 + ', 18], [12, ' + T18 + ', 36], [0, ' + T18 + ', 18]], { position: "inside", lengthRef: "outer", toward: [0, -1, 0], relief: "obround" });\n' +
      'p.hem(0.5, [[' + (24 - T18) + ', ' + (-H) + ', 18], [' + T18 + ', ' + (-H) + ', 18]], { hemType: "closed", hemPosition: "inside" });\n' +
      'p.sketch("Top").circle(1, -1, 0.1405).circle(23, -1, 0.1405).circle(1, -35, 0.1405).circle(23, -35, 0.1405).end().cut("through", { both: true });\n';

    step('rfQI: job 1, the 18 ga door: Sheet Metal ▸ Cross-Break, a click on the panel ✓; double-click Sheet-Metal, Gauge 16 ✓: every feature rebuilds (the Cross-Break failed), blank 26.256563 x 37.303401, CROSS BREAK in the flat DXF; a drawing\'s flat view with its Bend Table (six bends)', async function () {
      var errs0 = errors.length, notes = [];
      await rfQINewInch();
      await anvil.run(DOOR); await idle();
      UI.setView('Top'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /Cross-Break/.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
      assert(btn, 'Cross-Break on the ribbon'); btn.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Cross-Break', 'Cross-Break PM');
      selClick(UI.worldToScreen([12, T18, 18])); await idle(); await wait(20);
      var fv = UI.pmSpec().values.face;
      assert(fv && Math.abs(fv[1] - T18) < 1e-6, 'the panel\'s top face: ' + JSON.stringify(fv));
      await pmAccept(); await wait(30);
      assert(!rfQIErrs().length, 'built: ' + rfQIErrs().join(' | '));
      // gauge 18 -> 16 in the Sheet-Metal PropertyManager
      var sm = rfQIRow('sm-folder');
      assert(sm, 'the Sheet-Metal row'); rfQIMouse('dblclick', sm); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Sheet-Metal', 'Sheet-Metal PM: ' + (UI.hasPM() && UI.pmTitle()));
      assert(pmField('Use gauge table').checked, 'the gauge table is in use');
      setInput(pmField('Gauge'), '16'); await wait(20);
      near(+pmField('Thickness').value, 0.0598, 1e-12, '16 ga');
      await pmAccept(); await wait(30); await UI.whenIdle(); await idle();
      assert(!rfQIErrs().length, '16 ga: every feature rebuilds: ' + rfQIErrs().join(' | '));
      assert(K.meshQuality(UI.App.mesh).openEdges === 0, 'closed');
      var fl = anvil.flat(), cf = rfQIDoorX(0.0598);
      near(fl.size[0], cf[0], 1e-6, 'blank across'); near(fl.size[1], cf[1], 1e-6, 'blank along');
      var dxf = UI.dxfOutput({ export: 'sheet', version: 'R2000', bendLines: true, notes: true });
      assert(/CROSS BREAK UP 1/.test(dxf) && (dxf.match(/DOWN 90/g) || []).length === 4 && (dxf.match(/DOWN 180/g) || []).length === 2, 'flat DXF notes');
      notes.push('16 ga blank ' + fl.size.map(function (x) { return x.toFixed(6); }).join(' x '));
      // the drawing: flat view, bend notes as a table
      anvil.drawing.make(); await UI.drawing.ready(); await wait(30);
      try {
        anvil.drawing.flatView({ x: 8, y: 6, bendNotes: 'table' }); await UI.drawing.ready(); await wait(30);
        var s = anvil.drawing.summary(), v = s.views.filter(function (x) { return x.kind === 'flat'; })[0];
        assert(v && v.flat && !v.flat.error, 'flat view: ' + JSON.stringify(v && v.flat));
        var tab = v.flat.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
        assert(tab, 'a Bend Table: ' + JSON.stringify(v.flat.annotations.map(function (a) { return a.type; })));
        var texts = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="BEND_NOTES"] text'), function (t) { return t.textContent; });
        notes.push('bend table ' + texts.length + ' texts');
        assert(texts.filter(function (t) { return /^DOWN$|^UP$/i.test(t); }).length >= 6 || texts.length > 12, 'six bends in the table: ' + texts.join('|'));
      } finally { anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    step('rfQI: job 1, a Jog sketched across the door after its four return flanges is refused with the reason in the FeatureManager (it built an open part with no error)', async function () {
      var errs0 = errors.length;
      await rfQINewInch();
      var thrown = '';
      try { await anvil.run(DOOR + 'p.sketch("Top", ' + T18 + ').line(0, -1, 24, -1).jog(0.25, { fixed: [12, ' + T18 + ', 18], offsetRef: "outside", reverse: true });\n'); } catch (x) { thrown = x.message; }
      await idle();
      assert(/runs into a flange/.test(thrown), 'the script run reports it: ' + thrown);
      var e = rfQIErrs().join(' | ');
      assert(/Jog: line 1 runs into a flange or wall at its end/.test(e), 'refused: ' + e);
      var jog = UI.App.model.features[UI.App.model.features.length - 1];
      var row = Array.prototype.filter.call(D.querySelectorAll('#tree .ti'), function (r) { return r.getAttribute('data-fid') === String(jog.id); })[0];
      assert(row && /runs into a flange/.test(row.title + ' ' + (row.querySelector('.nm') || {}).title), 'the reason on the tree row: ' + (row && row.title));
      assert(K.meshQuality(UI.App.mesh).openEdges === 0, 'the part stays closed');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return e;
    });

    step('rfQI: job 4, an 11 ga L with two Ribs as gussets: the FeatureManager\'s Flat-Pattern1 ▸ Flat Pattern… shows the bracket\'s blank 5.803401 x 4 (no phantom holes) and says the Ribs are left out', async function () {
      var errs0 = errors.length, T = 0.1196;
      await rfQINewInch();
      await anvil.run('p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "11" });\np.sketch("Top").rect(0, -4, 3, 4).end().baseFlange();\n' +
        'p.flange(3, [[3, ' + T + ', 2]], { position: "inside", lengthRef: "outer" });\np.sketch("Front", 1).line(2.2, 0.3, 2.7, 0.8).end();\np.rib(0.12, {});\np.sketch("Front", 3).line(2.2, 0.3, 2.7, 0.8).end();\np.rib(0.12, {});\n'); await idle();
      assert(!rfQIErrs().length, 'built: ' + rfQIErrs().join(' | '));
      var fp = rfQIRow('fp-row');
      assert(fp, 'Flat-Pattern1'); rfQIMouse('contextmenu', fp); await wait(20);
      var mi = rfQIMenuItem('Flat Pattern');
      assert(mi, 'Flat Pattern… on its menu'); mi.click(); await wait(30);
      var w = D.querySelector('[data-role="flat-warnings"]');
      assert(w && /Rib1, Rib2: a Rib is not sheet metal/.test(w.textContent), 'the warning in the dialog: ' + (w && w.textContent));
      var fl = anvil.flat(), BD = 2 * (2 * T) - Math.PI / 2 * (1.5 * T);
      near(fl.size[0], 6 - BD, 1e-9, 'blank'); assert(fl.loops.length === 1, 'no phantom holes: ' + fl.loops.length);
      clickModalButton('Close'); await wait(20);
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return w.textContent;
    });
  })();
