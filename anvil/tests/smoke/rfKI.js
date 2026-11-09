  // --- rfKI (2026-11-09, lane stepin2) --- A customer's STEP of a U channel (R .25, T .06) with a .25 × .75 slot through
  // one bend, as a user drives it: a new inch part, Insert ▸ Features ▸ Imported… with the file picked, Sheet Metal ▸
  // Insert Bends with the base clicked (the PM finds both rounded bends, the slotted one too), ✓, Flatten, Flat to DXF
  // ▸ ✓: the flat has the slot (area .1875, a closed loop on HOLES), the size the U's own flat has. Kernel side:
  // tests/kernel/rfKI.js; OpenCascade's files: rows "rfKI" of tests/occt-tests.html.
  function rfKIEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfKIClick(p) { rfKIEv('mousemove', p); rfKIEv('mousedown', p, $('viewport')); rfKIEv('mouseup', p); }
  function rfKIRibbon(re) {
    UI.setRibbonTab('Sheet Metal');
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim()); })[0];
  }
  // the customer's part, built as sheet metal (Unfold, slot, Fold: radial slot walls) and sent as Anvil's STEP
  function rfKICustomer() {
    var T = 0.06, R = 0.25, KF = 0.44, mid = R + T - Math.PI / 4 * (R + KF * T), m = K.newModel('U');
    K.runScript(m, 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + KF + ');\np.sketch("Top").rect(0, -4, 2, 4).end().baseFlange();\n' +
      'p.flange(2, [[0, ' + T + ', 2], [2, ' + T + ', 2]], { position: "inside" });\np.unfold([1, ' + T + ', 2], null);\n' +
      'p.sketch("Top").rect(' + (mid - 0.125) + ', -2.375, 0.25, 0.75).end().extrude(1, { cut: true, through: true, both: true });\np.fold(null);\n');
    var b = K.rebuild(m);
    return { step: W.Exchange.exportSTEP(m, b, { faceted: true }), flat: K.flatPattern(m, b, K.meshFromBody(b.body)) };
  }

  step('rfKI: a customer\'s STEP of a U channel with a slot through a bend: Imported…, Insert Bends finds both bends, Flatten, Flat to DXF — the slot in the flat', async function () {
    var errs0 = errors.length, down = UI.download, saved = [];
    UI.download = function (name, data) { saved.push({ name: name, text: typeof data === 'string' ? data : null }); };
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.name("Customer").units("in");'); await idle();
      var cu = rfKICustomer();
      assert((cu.step.match(/=CYLINDRICAL_SURFACE\(/g) || []).length === 4, 'the file has both bends whole');
      var rows = menuRows('Features ▸ Imported');
      assert(rows.length === 1, 'Insert ▸ Features ▸ Imported… row');
      rows[0].row.click(); await wait(20);
      var inp = Array.prototype.filter.call(D.querySelectorAll('body > input[type=file]'), function (x) { return /\.step/.test(x.accept); }).pop();
      assert(inp, 'the file picker');
      var dt = new W.DataTransfer();
      dt.items.add(new W.File([cu.step], 'customer-u-slot.step', { type: 'application/step' }));
      inp.files = dt.files;
      inp.dispatchEvent(new W.Event('change'));
      for (var i = 0; i < 100 && names().indexOf('Imported1') < 0; i++) await wait(50);
      await idle();
      assert(names().join() === 'Imported1', 'features: ' + names().join());
      UI.setView('Top'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var ib = rfKIRibbon(/Insert Bends/);
      assert(ib, 'Insert Bends on the ribbon');
      ib.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Insert Bends', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfKIClick(UI.worldToScreen([1, 0.06, 1])); await idle(); await wait(30);
      var ff = UI.pmSpec().values.fixedFace;
      assert(ff && Math.abs(ff[1] - 0.06) < 1e-6, 'fixed face on the base: ' + JSON.stringify(ff));
      var txt = '';
      for (i = 0; i < 60 && !/found/.test(txt); i++) { await wait(50); txt = D.querySelector('#pm').textContent; }
      assert(/2 found/.test(txt), 'PM: ' + txt.replace(/\s+/g, ' ').slice(250, 900));
      await pmAccept(); await wait(30);
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'insertBends' && !UI.App.build.errors[f.id], 'Insert Bends: ' + UI.App.build.errors[f.id]);
      var flat = anvil.flat();
      assert(flat.bends.length === 2 && !flat.warnings.length, 'bends ' + flat.bends.length + '; ' + flat.warnings.join('; '));
      assert(flat.loops.length === 2, 'outline and slot: ' + flat.loops.length);
      // the PM's K (the sheet's default) develops the slot's .25 across the bend in proportion: (R + K·T) / (R + .44 T)
      var Kf = +UI.App.model.sheet.kFactor, sc = (0.25 + Kf * 0.06) / (0.25 + 0.44 * 0.06);
      near(Math.abs(K.signedArea(flat.loops[1])), 0.1875 * sc, 1e-6, 'slot area (K ' + Kf + ')');
      near(Math.max(flat.size[0], flat.size[1]), Math.max(cu.flat.size[0], cu.flat.size[1]) + Math.PI * (Kf - 0.44) * 0.06, 1e-6, 'flat length'); near(Math.min(flat.size[0], flat.size[1]), 4, 1e-9, 'flat width');
      var fb = rfKIRibbon(/^Flatten\b|\bFlatten$/);
      assert(fb, 'Flatten on the ribbon');
      fb.click(); await idle(); await wait(30);
      assert(UI.App.model.flatState === true && UI.flatShown(), 'flattened');
      var xb = rfKIRibbon(/Flat to/);
      assert(xb, 'Flat to DXF on the ribbon');
      xb.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'PM ' + (UI.hasPM() && UI.pmTitle()));
      await pmAccept(); await wait(30);
      var dxf = saved.length && saved[saved.length - 1].text;
      assert(dxf && /\.dxf$/i.test(saved[saved.length - 1].name), 'a DXF saved');
      var c = W.DxfCheck ? W.DxfCheck.check(dxf, { units: 'in' }) : null;
      if (c) {
        assert(c.ok, 'DXF: ' + c.errors.join('; '));
        assert(c.loops.filter(function (l) { return l.layer === 'OUTLINE' && l.closed; }).length === 1, 'one closed outline');
        assert(c.loops.filter(function (l) { return l.layer === 'HOLES' && l.closed; }).length === 1, 'the slot closed on HOLES: ' + JSON.stringify(c.loops.map(function (l) { return l.layer; })));
      }
      assert(/\nHOLES\r?\n/.test(dxf) && /\nBEND\r?\n/.test(dxf), 'HOLES and BEND layers');
      rfKIRibbon(/^Flatten\b|\bFlatten$/).click(); await idle();
      assert(!UI.App.model.flatState, 'folded again');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'slot ' + Math.abs(K.signedArea(flat.loops[1])).toFixed(9) + ' in², flat ' + flat.size.map(function (x) { return x.toFixed(6); }).join(' × ');
    } finally { UI.download = down; if (UI.hasPM()) UI.pmCancel(); }
  });
  // --- end rfKI ---
