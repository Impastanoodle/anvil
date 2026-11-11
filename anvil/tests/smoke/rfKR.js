  // --- rfKR (2026-11-11, lane smsolid) --- (1) A customer's STEP (Anvil's) of a mitred tray 4 × 3 with R 1 bends and
  // 1.5 in flanges, as a user drives it: a new inch part, Insert ▸ Features ▸ Imported… with the file picked, Sheet
  // Metal ▸ Insert Bends with the base clicked: the PM finds the four bends (was refused: "not one thickness … rounded
  // R1.06"), ✓, the flat = the tray's own. (2) A 1 x 1 rectangle cut through a Lofted-Bend's seam: the part is closed
  // and its flat has no warning (was 20 open edges and "could not be laid"). Kernel side: tests/kernel/rfKR.js.
  function rfKREv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfKRClick(p) { rfKREv('mousemove', p); rfKREv('mousedown', p, $('viewport')); rfKREv('mouseup', p); }
  function rfKRRibbon(re) {
    UI.setRibbonTab('Sheet Metal');
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim()); })[0];
  }
  function rfKRarea(fl) { return fl.loops.reduce(function (s, l, i) { var a = Math.abs(K.signedArea(l)); return s + (i ? -a : a); }, 0); }

  step('rfKR: a customer\'s STEP (Anvil\'s) of an R 1 tray with 1.5 in flanges: Imported…, Insert Bends finds the four bends (was refused as not one thickness), the flat is the tray\'s own', async function () {
    var errs0 = errors.length;
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.name("Customer").units("in");\np.sheet(0.06, 1, 0.44);'); await idle();
      var m0 = K.newModel('Tray');
      K.runScript(m0, 'p.units("in");\np.sheet(0.06, 1, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        'p.flange(1.5, [[2, 0.06, 0], [4, 0.06, 1.5], [2, 0.06, 3], [0, 0.06, 1.5]], { position: "inside" });\n');
      var b0 = K.rebuild(m0), own = K.flatPattern(m0, b0, K.meshFromBody(b0.body)), stepText = W.Exchange.exportSTEP(m0, b0, { faceted: true });
      var rows = menuRows('Features ▸ Imported');
      assert(rows.length === 1, 'Insert ▸ Features ▸ Imported… row');
      rows[0].row.click(); await wait(20);
      var inp = Array.prototype.filter.call(D.querySelectorAll('body > input[type=file]'), function (x) { return /\.step/.test(x.accept); }).pop();
      assert(inp, 'the file picker');
      var dt = new W.DataTransfer();
      dt.items.add(new W.File([stepText], 'customer-tray-r1.step', { type: 'application/step' }));
      inp.files = dt.files;
      inp.dispatchEvent(new W.Event('change'));
      for (var i = 0; i < 100 && names().indexOf('Imported1') < 0; i++) await wait(50);
      await idle();
      assert(names().join() === 'Imported1', 'features: ' + names().join());
      UI.setView('Top'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var ib = rfKRRibbon(/Insert Bends/);
      assert(ib, 'Insert Bends on the ribbon');
      ib.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Insert Bends', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfKRClick(UI.worldToScreen([2, 0.06, 1.5])); await idle(); await wait(30);
      var ff = UI.pmSpec().values.fixedFace;
      assert(ff && Math.abs(ff[1] - 0.06) < 1e-6, 'fixed face on the base: ' + JSON.stringify(ff));
      var txt = '';
      for (i = 0; i < 60 && !/found/.test(txt); i++) { await wait(50); txt = D.querySelector('#pm').textContent; }
      assert(/4 found/.test(txt) && !/one thickness/.test(txt), 'PM: ' + txt.replace(/\s+/g, ' ').slice(0, 600));
      await pmAccept(); await wait(30);
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'insertBends' && !UI.App.build.errors[f.id], 'Insert Bends: ' + UI.App.build.errors[f.id]);
      var flat = anvil.flat();
      assert(flat.bends.length === 4 && !flat.warnings.length, 'bends ' + flat.bends.length + '; ' + flat.warnings.join('; '));
      near(rfKRarea(flat), rfKRarea(own), 1e-6, 'blank area = the tray\'s own');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'blank ' + rfKRarea(flat).toFixed(6) + ' in², ' + flat.bends.map(function (q) { return q.label; }).join('; ');
    } finally { if (UI.hasPM()) UI.pmCancel(); }
  });

  step('rfKR: a 1 x 1 rectangle cut through a Lofted-Bend\'s seam: the part checks closed (Evaluate) and its flat lays the cut with no warning', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.name("Transition").units("in");\np.sheet(0.0747, 0.0747, 0.5);\n' +
      'var a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.001, -3]], false).id();\n' +
      'var b = p.sketch("Top", 4).arc(0, 0, 2, 270.03, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n' +
      'p.sketch("Front").rect(-0.5, 0.5, 1, 1).end().extrude(4, { cut: true });\n'); await idle();
    assert(!Object.keys(UI.App.build.errors).length, 'errors: ' + JSON.stringify(UI.App.build.errors));
    var c = W.Evaluate.checkBody(UI.App.build.body);
    assert(!c.openEdges.length && !c.nonManifoldEdges.length && !c.selfIntersections.length, 'open ' + c.openEdges.length + ', non-manifold ' + c.nonManifoldEdges.length + ', crossing ' + c.selfIntersections.length);
    var flat = anvil.flat();
    assert(flat.loops.length === 1 && !flat.warnings.length, flat.loops.length + ' loops; ' + flat.warnings.join('; '));
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'closed, blank ' + rfKRarea(flat).toFixed(4) + ' in²';
  });
  // --- end rfKR ---
