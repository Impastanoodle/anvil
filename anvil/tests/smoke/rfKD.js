  // --- rfKD (2026-11-09, lane importbend) --- The shop flow for a customer's STEP of a formed part, as a user drives it:
  // a new inch part, Insert ▸ Features ▸ Imported… with the customer's millimetre STEP of an L bracket (legs 2 / 1.5
  // outside, T .06, bend R .06) picked in the file input, Sheet Metal ▸ Insert Bends with the base clicked as the fixed
  // face (the PM finds the rounded bend), ✓, Flatten, Flat to DXF ▸ ✓: the DXF has the outline and one bend line, and
  // the flat is the analytic 1.88 + 1.38 + BA by 2. Kernel side: tests/kernel/rfKD.js.
  function rfKDEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfKDClick(p) { rfKDEv('mousemove', p); rfKDEv('mousedown', p, $('viewport')); rfKDEv('mouseup', p); }
  function rfKDRibbon(re) {
    UI.setRibbonTab('Sheet Metal');
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim()); })[0];
  }
  // the customer's file: the bracket as a solid (sharp thin L, inside corner filleted .06, outside .12), in millimetres
  function rfKDCustomerStep() {
    var m = K.newModel('Bracket');
    K.runScript(m, 'p.units("in");\np.sketch("Front").polyline([[0, 1.5], [0, 0], [2, 0], [2, 0.06], [0.06, 0.06], [0.06, 1.5]], true).end().extrude(2);\n' +
      'p.fillet(0.06, [[0.06, 0.06, 1]]);\np.fillet(0.12, [[0, 0, 1]]);\n');
    var b = K.rebuild(m), s = W.Exchange.exportSTEP(m, b, { faceted: true }), sc = function (x) { var v = String(+(+x * 25.4).toPrecision(15)); return /[.eE]/.test(v) ? v.replace('e', 'E') : v + '.'; };
    return s.replace(/^(#\d+=)\(CONVERSION_BASED_UNIT\('INCH',#\d+\)LENGTH_UNIT\(\)NAMED_UNIT\(#\d+\)\);$/m, '$1(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));')
      .replace(/^(#\d+=CARTESIAN_POINT\('[^']*',\()([^)]*)(\)\);)$/gm, function (q, a, c, z) { return a + c.split(',').map(sc).join(',') + z; })
      .replace(/^(#\d+=(?:VECTOR|CIRCLE|CYLINDRICAL_SURFACE)\('[^']*',#\d+,)([^,)]+)(\);)$/gm, function (q, a, c, z) { return a + sc(c) + z; });
  }

  step('rfKD: a customer\'s mm STEP of an L bracket: Insert ▸ Features ▸ Imported…, Insert Bends (base clicked, the rounded bend found), Flatten, Flat to DXF — the analytic flat and a clean DXF', async function () {
    var errs0 = errors.length, down = UI.download, saved = [];
    UI.download = function (name, data) { saved.push({ name: name, text: typeof data === 'string' ? data : null }); };
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.name("Customer").units("in");'); await idle();
      var step = rfKDCustomerStep();
      assert(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/.test(step) && /CYLINDRICAL_SURFACE/.test(step), 'a millimetre STEP with the bend cylinders');
      // Insert ▸ Features ▸ Imported… opens a file picker: the file is chosen in it
      var rows = menuRows('Features ▸ Imported');
      assert(rows.length === 1, 'Insert ▸ Features ▸ Imported… row');
      rows[0].row.click(); await wait(20);
      var inp = Array.prototype.filter.call(D.querySelectorAll('body > input[type=file]'), function (x) { return /\.step/.test(x.accept); }).pop();
      assert(inp, 'the file picker');
      var dt = new W.DataTransfer();
      dt.items.add(new W.File([step], 'customer-bracket.step', { type: 'application/step' }));
      inp.files = dt.files;
      inp.dispatchEvent(new W.Event('change'));
      for (var i = 0; i < 100 && names().indexOf('Imported1') < 0; i++) await wait(50);
      await idle();
      assert(names().join() === 'Imported1', 'features: ' + names().join());
      var v0 = K.massProps(UI.App.mesh, 1).volume;
      var nrec = UI.App.build.body.polygons.filter(function (p) { return p.surf && p.surf.s && p.surf.s.t === 'cyl'; }).length;
      assert(nrec > 0, 'the imported bends carry their cylinder records: ' + nrec + ' of ' + UI.App.build.body.polygons.length + ' polygons; feature curves ' + !!(UI.App.model.features[0].solids[0].curves) + ', brep ' + !!UI.App.model.features[0].brep + ', occt on ' + !!(UI.occt && UI.occt.on && UI.occt.on()) + ', canImport ' + !!(UI.occt && UI.occt.canImport && UI.occt.canImport()) + ', step cyl ' + /CYLINDRICAL_SURFACE/.test(step));
      // Insert Bends: the PM, the base's inside face clicked from above as the fixed face
      UI.setView('Top'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var ib = rfKDRibbon(/Insert Bends/);
      assert(ib, 'Insert Bends on the ribbon');
      ib.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Insert Bends', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfKDClick(UI.worldToScreen([1.2, 0.06, 1])); await idle(); await wait(30);
      var ff = UI.pmSpec().values.fixedFace;
      assert(ff && Math.abs(ff[1] - 0.06) < 1e-6, 'fixed face on the base: ' + JSON.stringify(ff));
      var txt = '';
      for (i = 0; i < 60 && !/found/.test(txt); i++) { await wait(50); txt = D.querySelector('#pm').textContent; }
      assert(/1 found \(their own radius\)/.test(txt), 'PM: ' + txt.replace(/\s+/g, ' ').slice(250, 900));
      await pmAccept(); await wait(30);
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'insertBends' && !UI.App.build.errors[f.id], 'Insert Bends: ' + UI.App.build.errors[f.id]);
      near(K.massProps(UI.App.mesh, 1).volume, v0, 1e-12, 'the part is unchanged (its bend was already rounded)');
      var sh = UI.App.model.sheet, Kf = +sh.kFactor;
      near(+sh.thickness, 0.06, 1e-9, 'T measured');
      var want = 1.88 + 1.38 + Math.PI / 2 * (0.06 + Kf * 0.06), flat = anvil.flat();
      near(Math.max(flat.size[0], flat.size[1]), want, 1e-6, 'flat length (K ' + Kf + ')'); near(Math.min(flat.size[0], flat.size[1]), 2, 1e-9, 'flat width');
      // Flatten
      var fb = rfKDRibbon(/^Flatten\b|\bFlatten$/);
      assert(fb, 'Flatten on the ribbon');
      fb.click(); await idle(); await wait(30);
      assert(UI.App.model.flatState === true && UI.flatShown(), 'flattened');
      // Flat to DXF ▸ ✓
      var xb = rfKDRibbon(/Flat to/);
      assert(xb, 'Flat to DXF on the ribbon');
      xb.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'PM ' + (UI.hasPM() && UI.pmTitle()));
      await pmAccept(); await wait(30);
      var dxf = saved.length && saved[saved.length - 1].text;
      assert(dxf && /\.dxf$/i.test(saved[saved.length - 1].name), 'a DXF saved: ' + (saved.length && saved[saved.length - 1].name));
      var c = W.DxfCheck ? W.DxfCheck.check(dxf, { units: 'in' }) : null;
      if (c) {
        assert(c.ok, 'DXF: ' + c.errors.join('; '));
        assert(c.loops.filter(function (l) { return l.layer === 'OUTLINE' && l.closed; }).length === 1, 'one closed outline');
        near(c.extents.max[0] - c.extents.min[0], flat.size[0], 1e-6, 'DXF width'); near(c.extents.max[1] - c.extents.min[1], flat.size[1], 1e-6, 'DXF height');
      }
      assert(/\nOUTLINE\r?\n/.test(dxf) && /\nBEND\r?\n/.test(dxf), 'OUTLINE and BEND layers');
      rfKDRibbon(/^Flatten\b|\bFlatten$/).click(); await idle();
      assert(!UI.App.model.flatState, 'folded again');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'flat ' + Math.max(flat.size[0], flat.size[1]).toFixed(6) + ' × 2, DXF ' + dxf.length + ' bytes' + (c ? '' : ' (DxfCheck not loaded)');
    } finally { UI.download = down; if (UI.hasPM()) UI.pmCancel(); }
  });
  // --- end rfKD ---
