  // --- rfJD (2026-11-05, lane smtrim) --- Edge-Flange ▸ Flange Position ▸ Trim side bends (was "(not available)" on the
  // Miter Flange) and Sheet Metal ▸ Corners ▸ Corner Relief, with real mouse events: the front edge clicked beside a
  // right flange, Material Inside, Trim side bends, ✓: the right bend is cut back by R + T; Edit Feature shows the box;
  // the Miter Flange's box is live; the Corners flyout opens Corner Relief, Collect all corners, Rectangular .25 ✓:
  // exact volume, tree icon, one undo step, Edit Feature to Circular; a click near the corner adds it, a second removes
  // it. Self-contained.
  (function () {
    var T = 0.0598, R = 0.0598, BA = Math.PI / 2 * (R + T / 2);
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    var SIDE = 'p.flange(1, [[4, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n';
    var FRONT = 'p.flange(1, [[2, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });\n';
    function rfJDVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfJDEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfJDClick(p) { rfJDEv('mousemove', p); rfJDEv('mousedown', p, $('viewport')); rfJDEv('mouseup', p); }
    function rfJDLast() { var fs = UI.App.model.features; return fs[fs.length - 1]; }
    function rfJDCheck(label) { var c = pmField(label); assert(c && c.type === 'checkbox', label + ' box'); return c; }
    async function rfJDPart(code) {
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      assert(!Object.keys(anvil.summary().errors).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    }
    function rfJDMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf(text) >= 0; })[0]; }
    function rfJDCaret() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0]; }

    step('rfJD: Edge-Flange ▸ Flange Position ▸ Trim side bends: the front edge clicked beside the right flange, Material Inside, the box ticked, ✓: the right bend loses its last R + T; Edit Feature shows it ticked; untick ✓ puts it back', async function () {
      var errs0 = errors.length;
      await rfJDPart(HEAD + SIDE);
      var v0 = rfJDVol();
      UI.cmdEdgeFlange(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Edge-Flange', 'Edge-Flange PM');
      var e = edgeNear([2, T, 3]), s = UI.worldToScreen(e.mid), pe = UI.pickEdge(s[0], s[1]);
      assert(pe && pe.edge && Math.abs(pe.edge.mid[2] - 3) < 1e-6 && Math.abs(pe.edge.mid[1] - T) < 1e-6, 'the front top edge is under the cursor: ' + JSON.stringify(pe && pe.edge && pe.edge.mid));
      rfJDClick(s); await idle(); await wait(20);
      assert(UI.pmSpec().values.edges.length === 1, 'edge taken: ' + statusText());
      var box = rfJDCheck('Trim side bends');
      assert(!box.disabled && !/not available/.test($('pm').textContent), 'Trim side bends is live');
      // SolidWorks' place: in Flange Position, before Offset
      var pmText = $('pm').textContent;
      assert(pmText.indexOf('Trim side bends') > pmText.indexOf('Flange Position') && pmText.indexOf('Trim side bends') < pmText.indexOf('Offset'), 'under Flange Position, before Offset');
      setInput(pmField('Position'), 'inside'); await wait(10);
      setInput(pmField('Length'), 1); await wait(10);
      box.click(); await wait(20);
      await pmAccept(); await wait(30);
      var f = rfJDLast();
      assert(f.type === 'flange' && f.trimSideBends === true && f.position === 'inside' && !UI.App.build.errors[f.id], 'flange: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      var vTrim = rfJDVol();
      await anvil.run(HEAD + SIDE + FRONT); await idle();
      var vPlain = rfJDVol();
      near(vPlain - vTrim, Math.PI / 4 * ((R + T) * (R + T) - R * R) * (R + T), 1e-9, 'the right bend lost its last R + T');
      assert(vPlain > v0, 'the front flange adds metal');
      // back to the trimmed part, Edit Feature
      await anvil.run(HEAD + SIDE + FRONT.replace('lengthRef: "outer" }', 'lengthRef: "outer", trimSideBends: true }')); await idle();
      f = rfJDLast();
      UI.editFeature(f); await wait(30); await idle();
      assert(UI.hasPM() && rfJDCheck('Trim side bends').checked, 'Edit Feature: Trim side bends ticked');
      rfJDCheck('Trim side bends').click(); await wait(10);
      await pmAccept(); await wait(30);
      f = rfJDLast();
      assert(f.trimSideBends === undefined, 'unticked: no field: ' + JSON.stringify(f));
      near(rfJDVol(), vPlain, 1e-9, 'unticked: the plain corner');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'removed ' + (vPlain - vTrim).toFixed(6) + ' in³';
    });
    step('rfJD: Miter Flange ▸ Trim side bends is live (Edit Feature of a script Miter Flange beside a right flange): ticked ✓ trims the right bend; the script writes it', async function () {
      var errs0 = errors.length;
      var H6 = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[4, 0.06, 1]], { position: "inside", lengthRef: "outer" });\np.sketch("Right").line(0, 0.06, 0, 1.06).end();\np.miterFlange([[2, 0.06, 0]], {});';
      await rfJDPart(H6);
      var v0 = rfJDVol(), f = rfJDLast();
      UI.editFeature(f); await wait(30); await idle();
      var box = rfJDCheck('Trim side bends');
      assert(!box.disabled && !box.checked && !/not available/.test($('pm').textContent), 'live and unticked');
      box.click(); await wait(20);
      await pmAccept(); await wait(30);
      f = rfJDLast();
      assert(f.trimSideBends === true && f.miterFlange && !UI.App.build.errors[f.id], 'miter flange: ' + JSON.stringify(f));
      near(v0 - rfJDVol(), Math.PI / 4 * 3 * 0.06 * 0.06 * 0.12, 1e-9, 'the right bend lost its last R + T');
      assert(/miterFlange\([^\n]*trimSideBends: true/.test(anvil.script()), 'script');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    });
    step('rfJD: Corners flyout ▸ Corner Relief: PM groups as SolidWorks (Corner Type, Scope, Corners, Relief Options), Collect all corners, Rectangular .25 ✓: exact volume, tree icon, one undo step; Edit Feature ▸ Circular; clicks near the corner add / remove it', async function () {
      var errs0 = errors.length;
      await rfJDPart(HEAD + SIDE + FRONT);
      var v0 = rfJDVol(), n0 = UI.App.model.features.length;
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = rfJDCaret();
      assert(caret && !caret.disabled, 'the Corners flyout');
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var mi = rfJDMenuItem('Corner Relief');
      assert(mi && rfJDMenuItem('Closed Corner') && rfJDMenuItem('Break-Corner'), 'the flyout lists Corner Relief');
      mi.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Corner Relief', 'Corner Relief PM: ' + (UI.hasPM() && UI.pmTitle()));
      var txt = $('pm').textContent;
      ['Corner Type', '2 Bend corner', 'Scope', 'Corners', 'Collect all corners', 'Relief Options', 'Centered on bend lines'].forEach(function (w) { assert(txt.indexOf(w) >= 0, 'PM shows ' + w); });
      assert(txt.indexOf('Corner Type') < txt.indexOf('Scope') && txt.indexOf('Scope') < txt.indexOf('Relief Options'), 'group order');
      var sel = pmField('Relief type');
      assert(sel && Array.prototype.map.call(sel.options, function (o) { return o.textContent; }).join() === 'Rectangular,Circular,Tear,Obround,Constant Width', 'relief types');
      clickPmButton('Collect all corners'); await wait(20);
      assert(UI.pmSpec().values.corners.length === 1, 'one corner collected');
      setInput(pmField('Size'), 0.25); await wait(20);
      await pmAccept(); await wait(30);
      var f = rfJDLast();
      assert(f.type === 'cornerRelief' && f.name === 'Corner-Relief1' && f.reliefType === 'rect' && f.size === 0.25 && !UI.App.build.errors[f.id], 'feature: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      assert(f.cornerType === undefined, 'no UI keys');
      var aa = 0.125 - BA / 2;
      near(v0 - rfJDVol(), T * (2 * aa * aa + BA * (2 * aa + R + T) + aa * (aa + R + T)), 1e-9, 'removed: T × the relief\'s area of the blank');
      var row = D.querySelector('#tree [data-fid="' + f.id + '"]');
      // rfMD: the row's icon is whatever the icon set in use draws for cornerRelief (it was a fragment of the built-in
      // drawing's path, which the SolidWorks set of the default profile does not share), and not the generic square
      var rowIco = row && row.querySelector('svg.ico');
      assert(rowIco && rowIco.outerHTML === W.Icons.node('cornerRelief', 16).outerHTML && rowIco.outerHTML !== W.Icons.node('generic', 16).outerHTML, 'tree row with the Corner Relief icon');
      UI.undo(); await idle();
      assert(UI.App.model.features.length === n0, 'one undo step');
      UI.redo(); await idle();
      f = rfJDLast();
      UI.editFeature(f); await wait(30); await idle();
      assert(UI.hasPM() && UI.pmSpec().values.corners.length === 1 && UI.pmSpec().values.reliefType === 'rect', 'Edit Feature: the corner and the type are back');
      setInput(pmField('Relief type'), 'circular'); await wait(20);
      await pmAccept(); await wait(30);
      f = rfJDLast();
      assert(f.reliefType === 'circular' && !UI.App.build.errors[f.id], 'circular: ' + JSON.stringify(f));
      var fl = anvil.flat();
      assert(fl && fl.loops.length === 1, 'one blank');
      // a new Corner Relief: a click on the base's top face near the corner adds it, a second click removes it
      await anvil.run(HEAD + SIDE + FRONT); await idle();
      UI.cmdCornerRelief(); await wait(30);
      UI.setView('Top'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);   // looking down on the corner
      var P = [4 - R - T - 0.05, T, 3 - R - T - 0.05], s = UI.worldToScreen(P), pf = UI.pickFace(s[0], s[1]);
      assert(pf && pf.point && Math.abs(pf.point[1] - T) < 1e-6, 'the top face is under the cursor: ' + JSON.stringify(pf && pf.point));
      rfJDClick(s); await idle(); await wait(20);
      assert(UI.pmSpec().values.corners.length === 1, 'click adds the corner: ' + statusText());
      rfJDClick(s); await idle(); await wait(20);
      assert(UI.pmSpec().values.corners.length === 0, 'second click removes it');
      UI.pmCancel(); await idle();
      assert(UI.App.model.features.length === n0, 'Cancel leaves nothing');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
