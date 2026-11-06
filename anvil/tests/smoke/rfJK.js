  // --- rfJK (2026-11-06, lane flatopts-2): Cut list(1) ▸ Sheet<1> in the FeatureManager; right-click ▸ Properties…
  // opens Cut-List Properties (Kernel.sheetCutList); a rebuild while it is open refreshes the values; anvil.cutList();
  // Merge faces cleared draws the bend regions' tangent lines in Flatten. Self-contained. ---
  (function () {
    var T = 0.0598, R = 0.0598;
    var PLATE = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).circle(1.5, -2, 0.25).circle(4.5, -2, 0.25).end().baseFlange();\n';
    function rfJKMouse(type, row) { var b = row.getBoundingClientRect(); row.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, clientX: b.left + 20, clientY: b.top + b.height / 2 })); }
    function rfJKMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.trim().indexOf(text) === 0; })[0]; }
    function rfJKval(name) { var tr = D.querySelector('#cutlist-dialog tr.cl-row[data-name="' + name + '"] td.cl-val'); return tr ? tr.textContent : null; }

    step('rfJK: Cut list(1) ▸ Sheet<1> ▸ right-click ▸ Properties… shows the Cut-List Properties of the 6 × 4 blank (Length 6, Cutting Length-Inner π, Cut Outs 2); adding an Edge Flange while it is open refreshes Bends to 1; anvil.cutList() gives the same values', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(PLATE); await idle();
      var folder = D.querySelector('#tree .ti.cl-folder'), row = D.querySelector('#tree .ti.cl-row');
      assert(folder && /Cut list\(1\)/.test(folder.textContent), 'Cut list(1) folder');
      assert(row && /Sheet<1>/.test(row.textContent), 'Sheet<1> row');
      rfJKMouse('contextmenu', row); await wait(20);
      var mi = rfJKMenuItem('Properties');
      assert(mi, 'Properties… in the menu');
      mi.click(); await wait(30);
      assert(!$('modal').hidden && $('cutlist-dialog'), 'Cut-List Properties dialog');
      assert(rfJKval('Bounding Box Length') === '6.0000 in' && rfJKval('Bounding Box Width') === '4.0000 in', 'box: ' + rfJKval('Bounding Box Length') + ' × ' + rfJKval('Bounding Box Width'));
      assert(rfJKval('Cutting Length-Outer') === '20.0000 in' && rfJKval('Cutting Length-Inner') === Math.PI.toFixed(4) + ' in', 'cutting lengths: ' + rfJKval('Cutting Length-Outer') + ' / ' + rfJKval('Cutting Length-Inner'));
      assert(rfJKval('Cut Outs') === '2' && rfJKval('Bends') === '0' && rfJKval('Description') === 'Sheet', 'cut outs / bends / description');
      await anvil.append('p.flange(1, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\n'); await idle(); await wait(30);
      assert($('cutlist-dialog') && rfJKval('Bends') === '1', 'refreshed after the rebuild: Bends ' + rfJKval('Bends'));
      var cl = anvil.cutList();
      assert(cl.values.Bends === 1 && Math.abs(cl.values['Bounding Box Length'] - 6) < 1e-9, 'anvil.cutList(): ' + JSON.stringify(cl.values));
      UI.closeModal(); await idle();
      // the folder's own menu opens it too
      rfJKMouse('contextmenu', D.querySelector('#tree .ti.cl-folder')); await wait(20);
      rfJKMenuItem('Properties').click(); await wait(30);
      assert(!$('modal').hidden && $('cutlist-dialog'), 'from the folder');
      UI.closeModal(); await idle();
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfJK: Merge faces cleared: Flatten draws the bend region\'s two tangent lines on both faces of the flat', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(PLATE + 'p.flange(1, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\np.flatPattern({ mergeFaces: false });\n'); await idle();
      UI.toggleFlatten(true); await idle(); await wait(30);
      var found = null;
      UI.flatGroup.children.forEach(function (o) { if (o.userData && o.userData.flatRegionLines) found = o; });
      assert(found, 'tangent lines in the flat display');
      assert(found.geometry.attributes.position.count === 8, '2 lines × 2 faces: ' + found.geometry.attributes.position.count / 2 + ' segments');
      UI.toggleFlatten(false); await idle();
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
