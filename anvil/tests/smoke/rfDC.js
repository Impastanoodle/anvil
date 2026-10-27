  // --- rfDC (2026-10-26, lane DC): sheet-metal fidelity #8 / #9 / #10 / #4 through the UI — the Sheet-Metal row
  // and the Flat-Pattern folder in the FeatureManager, Flatten as a state (ribbon toggle, Flat-Pattern1 ▸ Unsuppress,
  // undo / redo, save / reload, DXF while flat, new features refused, a thickness change while flat), Cut-Extrude's
  // Link to thickness, and Jog from a sketch line (fixed face clicked, offset typed + Enter Enter). Self-contained. ---
  (function () {
    var T = 0.0598, R = 0.0598;
    var PLATE = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    var LBRK = PLATE + 'p.flange(1.5, [[2, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });\n';
    function rfDCVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfDCEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfDCClick(p) { rfDCEv('mousemove', p); rfDCEv('mousedown', p, $('viewport')); rfDCEv('mouseup', p); }
    function rfDCRows() { return Array.prototype.slice.call(D.querySelectorAll('#tree .ti')); }
    function rfDCRow(cls) { return D.querySelector('#tree .ti.' + cls); }
    function rfDCRowNamed(text) { return rfDCRows().filter(function (r) { return r.hasAttribute('data-fid'); }).filter(function (r) { var n = r.querySelector('.nm'); return n && n.textContent === text; })[0]; }
    function rfDCMouse(type, row) { var b = row.getBoundingClientRect(); row.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, clientX: b.left + 20, clientY: b.top + b.height / 2 })); }
    function rfDCMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.trim().indexOf(text) === 0; })[0]; }
    function rfDCRibbon(re) {
      UI.setRibbonTab('Sheet Metal');
      return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + b.textContent).trim()); })[0];
    }
    function rfDCFlattenBtn() { return rfDCRibbon(/^Flatten\b|\bFlatten$/); }
    function rfDCType(inp, text) { inp.focus(); inp.select && inp.select(); inp.value = text; inp.dispatchEvent(new W.Event('input', { bubbles: true })); }
    // the flat drawn: { mesh, bends, box } from UI.flatGroup
    function rfDCFlatDrawn() {
      var g = UI.flatGroup, out = { mesh: null, bends: null, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
      g.children.forEach(function (c) { if (c.userData.flatPattern) out.mesh = c; if (c.userData.flatBends) out.bends = c; });
      if (out.mesh) { var p = out.mesh.geometry.attributes.position.array; for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) { out.lo[k] = Math.min(out.lo[k], p[i + k]); out.hi[k] = Math.max(out.hi[k], p[i + k]); } }
      return out;
    }

    step('rfDC: FeatureManager of a sheet part — Sheet-Metal row above Base-Flange1 (double-click: Sheet-Metal PM), Flat-Pattern folder last with Flat-Pattern1 greyed (suppressed); right-click ▸ Edit Feature opens the Flat-Pattern PM with the options Anvil lacks greyed; a plain part has neither', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      assert(!rfDCRow('sm-folder') && !rfDCRow('fp-folder'), 'a part with no sheet has no Sheet-Metal / Flat-Pattern rows');
      await anvil.run(LBRK); await idle();
      var rows = rfDCRows(), sm = rfDCRow('sm-folder'), bf = rfDCRowNamed('Base-Flange1'), fpf = rfDCRow('fp-folder'), fp = rfDCRow('fp-row');
      assert(sm && bf && fpf && fp, 'rows: ' + rows.map(function (r) { return r.textContent; }).join(' | '));
      assert(rows.indexOf(sm) === rows.indexOf(bf) - 1, 'Sheet-Metal right above Base-Flange1: ' + rows.map(function (r) { return r.textContent; }).join(' | '));
      assert(rows.indexOf(fpf) > rows.indexOf(rfDCRowNamed('Edge-Flange1')) && rows.indexOf(fp) === rows.indexOf(fpf) + 1, 'Flat-Pattern folder after the last feature, Flat-Pattern1 in it');
      assert(fp.classList.contains('suppressed') && /suppressed/.test(fp.querySelector('.nm').title), 'Flat-Pattern1 suppressed while folded');
      rfDCMouse('dblclick', sm); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Sheet-Metal', 'double-click Sheet-Metal opens its PM: ' + (UI.hasPM() && UI.pmTitle()));
      UI.pmCancel(); await idle();
      rfDCMouse('contextmenu', fp); await wait(20);
      var mi = rfDCMenuItem('Edit Feature');
      assert(mi && rfDCMenuItem('Unsuppress') && rfDCMenuItem('Flat Pattern'), 'Flat-Pattern1 menu: Edit Feature, Unsuppress, Flat Pattern…');
      mi.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Flat-Pattern1', 'Edit Feature opens the Flat-Pattern1 PM');
      // lane DK: Fixed face / Grain direction picks; no greyed boxes for options Anvil does not have
      assert(!pmField('Merge faces') && !pmField('Simplify bends') && /Fixed face/.test($('pm').textContent) && /Grain direction/.test($('pm').textContent), 'Fixed face / Grain direction, no dead boxes');
      assert(/Flat size4 × 4.4017 in/.test($('pm').textContent), 'the flat size in the PM: ' + $('pm').textContent.slice(300, 700));
      UI.pmCancel(); await idle();
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfDC: Flatten as a state — ribbon Flatten shows the flat (blank × T with two-point bend lines, folded part hidden, button pressed, Flat-Pattern1 unsuppressed); undo / redo; save / reload keeps it; DXF while flat; a Cut-Extrude made while flat goes above Flat-Pattern1 and shows in the flat; a thickness change redraws the flat; Flat-Pattern1 ▸ Suppress folds', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(LBRK + 'p.sketch("Top", ' + T + ').circle(1, -1, 0.25).end();\n'); await idle();
      var v0 = rfDCVol(), flat0 = anvil.flat(), n0 = UI.App.model.features.length;
      var btn = rfDCFlattenBtn();
      assert(btn, 'Flatten on the Sheet Metal ribbon');
      btn.click(); await idle(); await wait(30);
      assert(UI.App.model.flatState === true && UI.flatShown(), 'flattened');
      var d = rfDCFlatDrawn();
      assert(d.mesh && d.bends && d.bends.geometry.attributes.position.count === 2, 'flat solid and one bend line drawn');
      near(d.hi[1] - d.lo[1], T, 1e-6, 'flat drawn T thick'); near(d.hi[0] - d.lo[0], flat0.size[0], 1e-6, 'flat X'); near(d.hi[2] - d.lo[2], flat0.size[1], 1e-6, 'flat Z');
      assert(!UI.groups.body.visible && !UI.groups.edges.visible, 'the folded part is hidden');
      assert(rfDCFlattenBtn().classList.contains('on') || rfDCFlattenBtn().getAttribute('aria-pressed') === 'true' || rfDCFlattenBtn().classList.contains('active'), 'Flatten shows pressed: ' + rfDCFlattenBtn().className);
      var fp = rfDCRow('fp-row');
      assert(fp && !fp.classList.contains('suppressed'), 'Flat-Pattern1 unsuppressed');
      near(rfDCVol(), v0, 1e-12, 'mass properties still read the part');
      var s = UI.worldToScreen([2, T, 1.5]);
      assert(!UI.pickFace(s[0], s[1]), 'no face of the hidden folded part is picked');
      assert(/BEND/.test(anvil.dxfFlat()), 'DXF while flat');
      // lane DC2: a feature made while flat goes in above Flat-Pattern1 and cuts the folded part; the flat shows the hole
      UI.cmdExtrude(true); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Cut-Extrude', 'Cut-Extrude PM');
      var ce = D.querySelector('#pm [title^="OK"]') || Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return /^OK/.test(b.title || b.getAttribute('aria-label') || ''); })[0];
      if (ce) ce.click(); else await UI.pmOK();
      await idle(); await wait(30);
      assert(!UI.hasPM() && UI.App.model.features.length === n0 + 1 && UI.App.model.flatState && UI.flatShown(), 'added while flat, still flat: ' + statusText());
      assert(UI.App.flat && UI.App.flat.loops.length === 2, 'the flat shows the new hole: ' + (UI.App.flat && UI.App.flat.loops.length));
      near(rfDCVol(), v0 - Math.PI * 0.0625 * T, 2e-3 * T, 'the folded part is cut');
      var rows2 = rfDCRows(), cr = rfDCRowNamed('Cut-Extrude1');
      assert(cr && rows2.indexOf(cr) < rows2.indexOf(rfDCRow('fp-folder')), 'Cut-Extrude1 sits above the Flat-Pattern folder');
      UI.undo(); await idle();
      assert(UI.App.model.features.length === n0 && UI.App.model.flatState && UI.App.flat.loops.length === 1, 'undo takes the cut out, still flat');
      // undo folds, redo flattens again
      UI.undo(); await idle();
      assert(!UI.App.model.flatState && UI.groups.body.visible && rfDCRow('fp-row').classList.contains('suppressed'), 'undo folds');
      UI.redo(); await idle();
      assert(UI.App.model.flatState && UI.flatShown(), 'redo flattens');
      // save / reload
      var json = JSON.stringify(anvil.model());
      await anvil.load(json); await idle();
      assert(UI.App.model.flatState && UI.flatShown() && rfDCFlatDrawn().mesh, 'the flat state is saved with the part');
      // a thickness change while flat: the flat is redrawn 12 ga thick
      rfDCMouse('dblclick', rfDCRow('sm-folder')); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Sheet-Metal', 'Sheet-Metal PM');
      var th = pmField('Thickness');
      assert(th, 'Thickness box');
      if (pmField('Use gauge table') && pmField('Use gauge table').checked) { pmField('Use gauge table').click(); await wait(20); th = pmField('Thickness'); }
      rfDCType(th, '0.1046'); pressEnter(th); await wait(20);
      pressEnter(pmField('Thickness')); await idle(); await wait(40);
      assert(!UI.hasPM(), 'Sheet-Metal PM accepted');
      near(+UI.App.model.sheet.thickness, 0.1046, 1e-12, 'thickness changed');
      d = rfDCFlatDrawn();
      near(d.hi[1] - d.lo[1], 0.1046, 1e-6, 'flat redrawn 0.1046 thick');
      // Flat-Pattern1 ▸ Suppress folds the part
      rfDCMouse('contextmenu', rfDCRow('fp-row')); await wait(20);
      var sup = rfDCMenuItem('Suppress');
      assert(sup, 'Suppress on the Flat-Pattern1 menu while flat');
      sup.click(); await idle(); await wait(20);
      assert(!UI.App.model.flatState && !UI.flatShown() && UI.groups.body.visible, 'Suppress folds');
      rfDCFlattenBtn().click(); await idle();
      assert(UI.App.model.flatState, 'Flatten again'); rfDCFlattenBtn().click(); await idle();
      assert(!UI.App.model.flatState, 'and Flatten once more folds');
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfDC2: Insert ▸ Sheet Metal ▸ Flatten toggles the flat state like the ribbon button (checked while flat), one undo step each way', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(LBRK); await idle();
      var rows = menuRows('Sheet Metal ▸ Flatten');
      assert(rows.length === 1 && rows[0].chk === '', 'one Flatten row, unchecked: ' + JSON.stringify(rows.map(function (r) { return r.menu + ' / ' + r.text; })));
      rows[0].row.click(); await idle(); await wait(20);
      assert(UI.App.model.flatState === true && UI.flatShown() && !modalOpen(), 'the menu flattened the part (no dialog)');
      rows = menuRows('Sheet Metal ▸ Flatten');
      assert(rows[0].chk === '✓', 'checked while flat');
      rows[0].row.click(); await idle(); await wait(20);
      assert(!UI.App.model.flatState && !UI.flatShown(), 'the menu folds it again');
      UI.undo(); await idle();
      assert(UI.App.model.flatState === true, 'undo: flat again');
      UI.undo(); await idle();
      assert(!UI.App.model.flatState, 'undo: folded');
      if (UI.closeMenus) UI.closeMenus();
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfDC: Cut-Extrude on a sheet part — Link to thickness checked (Blind, depth = T shown), Normal cut checked; ✓ stores linkT; a thickness change in Sheet-Metal moves the depth with it; unchecking shows the depth box; round trip', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(PLATE + 'p.sketch("Top", ' + T + ').rect(1, -2, 1, 1).end();\n'); await idle();
      var v0 = rfDCVol();
      rfDCRibbon(/Extruded\s*Cut/).click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Cut-Extrude', 'Cut-Extrude PM');
      var lt = pmField('Link to thickness'), nc = pmField('Normal cut');
      assert(lt && lt.checked && nc && nc.checked, 'Link to thickness and Normal cut checked');
      assert(UI.pmSpec().values.end === 'blind' && /sheet thickness/.test($('pm').textContent), 'Blind, depth = sheet thickness shown');
      lt.click(); await wait(20);
      assert(pmField('Depth  D1') && pmField('Depth  D1').type === 'number', 'unchecked: the depth box is back');
      pmField('Link to thickness').click(); await wait(20);
      await pmAccept();
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.linkT === true && f.end === 'blind' && Math.abs(+f.depth - T) < 1e-12 && f.normalCut === true, 'feature: ' + JSON.stringify(f));
      near(rfDCVol(), v0 - T, 1e-9, 'the 1 × 1 window goes through');
      UI.cmdSheetMetal(); await wait(30);
      if (pmField('Use gauge table') && pmField('Use gauge table').checked) { pmField('Use gauge table').click(); await wait(20); }
      var th = pmField('Thickness'); rfDCType(th, '0.0747'); pressEnter(th); await wait(20); pressEnter(pmField('Thickness')); await idle(); await wait(30);
      f = UI.App.model.features[UI.App.model.features.length - 1];
      near(+f.depth, 0.0747, 1e-12, 'the linked depth follows T');
      near(rfDCVol(), 11 * 0.0747, 1e-9, '14 ga: the window still goes through');
      assert(/linkT: true/.test(anvil.script()), 'script writes linkT');
      UI.undo(); await idle();
      near(rfDCVol(), v0 - T, 1e-9, 'undo: back to 16 ga');
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfDC: Jog from a sketch line — Sheet Metal ▸ Jog takes the sketch, the fixed face is clicked, offset .5 typed + Enter (stays) + Enter (✓): the jogged flange 0.5 up (Outside Offset), flat 4 × 3 with UP / DOWN; one undo step; Edit Feature reopens on Inside Offset; save / reload', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(PLATE + 'p.sketch("Top", ' + T + ').line(2, 0, 2, -3).end();\n'); await idle();
      var n0 = UI.App.model.features.length;
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var jb = rfDCRibbon(/^Jogb(?! Line)/) || Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return b.dataset.icon === 'jog'; })[0];
      assert(jb, 'Jog on the ribbon: ' + Array.prototype.map.call(D.querySelectorAll('#ribbon button'), function (b) { return b.getAttribute('aria-label'); }).join(', '));
      jb.click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Jog', 'Jog PM: ' + (UI.hasPM() && UI.pmTitle()));
      assert(pmField('Dimension position') && pmField('Jog position') && pmField('Jog angle') && pmField('Fix projected length') && !pmField('Fix projected length').disabled && !pmField('Fix projected length').checked, 'Jog Offset / Position / Angle groups');
      var s = UI.worldToScreen([0.5, T, 1.5]), pk = UI.pickFace(s[0], s[1]);
      assert(pk && Math.abs(pk.point[1] - T) < 1e-6, 'the plate top under the cursor');
      rfDCClick(s); await idle(); await wait(20);
      assert(UI.pmSpec().values.fixed && UI.pmSpec().values.fixed[0] < 2, 'fixed face taken: ' + JSON.stringify(UI.pmSpec().values.fixed));
      var od = pmField('Offset distance');
      rfDCType(od, '.5');
      var ev = pressEnter(od);
      assert(ev.defaultPrevented && UI.hasPM() && +UI.pmSpec().values.offset === 0.5, 'first Enter applies .5');
      pressEnter(pmField('Offset distance')); await idle(); await wait(40);
      assert(!UI.hasPM(), 'second Enter is ✓');
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'jog' && f.sketch != null && f.offset === 0.5 && f.offsetRef === 'outside' && f.name === 'Jog1' && !UI.App.build.errors[f.id], 'feature: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      var lo = Infinity; UI.App.build.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { if (v.pos.x > 3.5) lo = Math.min(lo, v.pos.y); }); });
      near(lo, 0.5, 1e-9, 'jogged flange bottom 0.5 above the base bottom');
      var flat = anvil.flat();
      near(flat.size[0], 4, 1e-9, 'flat 4'); near(flat.size[1], 3, 1e-9, 'flat 3');
      assert(flat.bends.length === 2 && /^UP/.test(flat.bends[0].label) && /^DOWN/.test(flat.bends[1].label), 'UP then DOWN');
      assert(UI.App.model.features.length === n0 + 1, 'one feature added');
      UI.undo(); await idle();
      assert(UI.App.model.features.length === n0, 'one undo step');
      UI.redo(); await idle();
      // Edit Feature: Inside Offset
      UI.editFeature(UI.App.model.features[UI.App.model.features.length - 1]); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Jog1' && UI.pmSpec().values.offset === 0.5 && UI.pmSpec().values.fixed, 'Edit Feature reopens the Jog PM with its values');
      var dp = pmField('Dimension position'); dp.value = 'inside'; dp.dispatchEvent(new W.Event('change', { bubbles: true })); await wait(20);
      await pmAccept();
      lo = Infinity; UI.App.build.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { if (v.pos.x > 3.5) lo = Math.min(lo, v.pos.y); }); });
      near(lo, 0.5 + T, 1e-9, 'Inside Offset: the flange bottom 0.5 above the base top');
      var json = JSON.stringify(anvil.model()), v1 = rfDCVol();
      await anvil.load(json); await idle();
      near(rfDCVol(), v1, 1e-12, 'save / reload');
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
