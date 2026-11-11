  // --- rfLE (2026-11-11, lane realfiles) --- A blank a customer sends as a STEP solid (a flat plate with a hole and a
  // slot), as a user drives it: a new inch part, Insert ▸ Features ▸ Imported… with the file picked, Sheet Metal ▸
  // Insert Bends with the plate's top clicked as the fixed face (no bends: SolidWorks makes a flat plate a sheet-metal
  // part all the same), ✓, Flatten: the flat is the 4 × 3 plate. Kernel side: tests/kernel/rfLE.js.
  function rfLEEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfLEClick(p) { rfLEEv('mousemove', p); rfLEEv('mousedown', p, $('viewport')); rfLEEv('mouseup', p); }
  function rfLERibbon(re) {
    UI.setRibbonTab('Sheet Metal');
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim()); })[0];
  }

  step('rfLE: a flat plate STEP: Imported…, Insert Bends (top clicked: no bends, T measured), ✓, Flatten — the flat is the plate with its hole and slot', async function () {
    var errs0 = errors.length;
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.name("Blank").units("in");'); await idle();
      var m0 = K.newModel('Plate');
      K.runScript(m0, 'p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).circle(1, -1, 0.25).slot(2, -2, 3, -2, 0.2).end().extrude(0.075);\n');
      var step = W.Exchange.exportSTEP(m0, K.rebuild(m0));
      var rows = menuRows('Features ▸ Imported');
      assert(rows.length === 1, 'Insert ▸ Features ▸ Imported… row');
      rows[0].row.click(); await wait(20);
      var inp = Array.prototype.filter.call(D.querySelectorAll('body > input[type=file]'), function (x) { return /\.step/.test(x.accept); }).pop();
      assert(inp, 'the file picker');
      var dt = new W.DataTransfer();
      dt.items.add(new W.File([step], 'blank.step', { type: 'application/step' }));
      inp.files = dt.files;
      inp.dispatchEvent(new W.Event('change'));
      for (var i = 0; i < 100 && names().indexOf('Imported1') < 0; i++) await wait(50);
      await idle();
      assert(names().join() === 'Imported1', 'features: ' + names().join());
      UI.setView('Top'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var ib = rfLERibbon(/Insert Bends/);
      assert(ib, 'Insert Bends on the ribbon');
      ib.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Insert Bends', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfLEClick(UI.worldToScreen([3.5, 0.075, 0.5])); await idle(); await wait(30);
      var ff = UI.pmSpec().values.fixedFace;
      assert(ff && Math.abs(ff[1] - 0.075) < 1e-6, 'fixed face on the top: ' + JSON.stringify(ff));
      var txt = '';
      for (i = 0; i < 60 && !/0 bends/.test(txt); i++) { await wait(50); txt = D.querySelector('#pm').textContent; }
      assert(/0 bends/.test(txt) && !/no sharp corner/.test(txt), 'PM: ' + txt.replace(/\s+/g, ' ').slice(0, 600));
      await pmAccept(); await wait(30);
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'insertBends' && !UI.App.build.errors[f.id], 'Insert Bends: ' + UI.App.build.errors[f.id]);
      near(+UI.App.model.sheet.thickness, 0.075, 1e-9, 'T measured');
      var flat = anvil.flat();
      near(Math.max(flat.size[0], flat.size[1]), 4, 1e-9, 'flat length'); near(Math.min(flat.size[0], flat.size[1]), 3, 1e-9, 'flat width');
      var fb = rfLERibbon(/^Flatten\b|\bFlatten$/);
      assert(fb, 'Flatten on the ribbon');
      fb.click(); await idle(); await wait(30);
      assert(UI.App.model.flatState === true && UI.flatShown(), 'flattened');
      fb.click(); await idle();
      assert(!UI.App.model.flatState, 'folded again');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'flat ' + flat.size.map(function (x) { return x.toFixed(4); }).join(' × ');
    } finally { if (UI.hasPM()) UI.pmCancel(); }
  });
  // --- end rfLE ---
