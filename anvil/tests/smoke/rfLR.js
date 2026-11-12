  // --- rfLR (2026-11-11, lane smokeleak) --- state that leaked between groups: four steps failed in every full run and
  // passed alone (rfIK, rfJV, rfKM job b, rfKP), and rfKM job a failed alone and passed in the full run. The causes,
  // each with its check here: (1) Corner Relief (and Closed Corner, Jog, Rip …) remember their last values for the
  // session, as SolidWorks does, and UI.sheetMetalMemory(null) forgot only Edge Flange and Hem, so a step that asked
  // for a fresh start still got an earlier step's Circular .25; (2) a step that ended with a dialog open (rfIG's
  // "Make Dimension Driven?") blocked Ctrl+O two files later: the runner now records what every step leaves behind
  // and fails the step that leaves a dialog; (3) with OpenCascade on (the default wherever the engine is installed,
  // and what a plain ?only= run used before the page ran the suite's setup step for it) an inch STEP opened as a
  // millimetre part. Self-contained; every setting it changes is put back.
  (function () {
    var T14 = 0.0747, RB = 0.075, KF = 0.44;
    var RFLR_BOX = 'p.name("LR-Box").units("in");\np.sheet(' + T14 + ', ' + RB + ', ' + KF + ');\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
      [[5, T14, 0], [10, T14, 3], [5, T14, 6], [0, T14, 3]].map(function (e) { return 'p.flange(2, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    function rfLRCaret() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0]; }
    function rfLRMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf(text) >= 0; })[0]; }
    async function rfLRUntil(fn, ms, label) {
      var t0 = performance.now();
      for (;;) { var v = fn(); if (v) return v; if (performance.now() - t0 > ms) fail('waited ' + ms + ' ms for ' + label); await wait(25); }
    }
    // Sheet Metal ▸ Corners ▸ Corner Relief, as the user opens it
    async function rfLROpenRelief() {
      UI.setRibbonTab('Sheet Metal');
      var caret = await rfLRUntil(function () { var c = rfLRCaret(); return c && !c.disabled ? c : null; }, 3000, 'the Corners flyout');
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click();
      var mi = await rfLRUntil(function () { return rfLRMenuItem('Corner Relief'); }, 3000, 'Corner Relief in the Corners flyout');
      mi.click();
      await rfLRUntil(function () { return UI.hasPM() && UI.pmTitle() === 'Corner Relief'; }, 3000, 'the Corner Relief PropertyManager');
      return UI.pmSpec().values;
    }

    step('rfLR: Corner Relief opens with the type and size last accepted this session (Circular .25, as SolidWorks keeps them), and UI.sheetMetalMemory(null) puts every sheet-metal command back to its first-use values (Rectangular at 2 T; it forgot only Edge Flange and Hem, so rfJV / rfKM / rfKP got an earlier step\'s relief in a full run)', async function () {
      var errs0 = errors.length, size0 = Math.round(2 * T14 * 1e4) / 1e4;
      UI.sheetMetalMemory(null);
      try {
        await anvil.newPart(); await idle();
        await anvil.run(RFLR_BOX); await idle();
        assert(!Object.keys(anvil.summary().errors || {}).length, 'box: ' + JSON.stringify(anvil.summary().errors));
        var v = await rfLROpenRelief();
        assert(v.reliefType === 'rect' && Math.abs(v.size - size0) < 1e-12 && pmField('Relief type').value === 'rect', 'first use: Rectangular at 2 T: ' + v.reliefType + ' ' + v.size);
        clickPmButton('Collect all corners');
        await rfLRUntil(function () { return UI.pmSpec().values.corners.length === 4; }, 3000, 'four corners collected');
        setInput(pmField('Relief type'), 'circular');
        await rfLRUntil(function () { return pmField('Size'); }, 3000, 'the Size box');
        setInput(pmField('Size'), 0.25);
        await pmAccept();
        var fs = UI.App.model.features, cr = fs[fs.length - 1];
        assert(cr.type === 'cornerRelief' && cr.reliefType === 'circular' && cr.size === 0.25 && !UI.App.build.errors[cr.id], 'Corner Relief: ' + JSON.stringify(cr) + ' ' + UI.App.build.errors[cr.id]);
        // the next Corner Relief of the session starts from it
        v = await rfLROpenRelief();
        assert(v.reliefType === 'circular' && v.size === 0.25 && pmField('Relief type').value === 'circular', 'remembered for the session: ' + v.reliefType + ' ' + v.size);
        UI.pmCancel(); await idle();
        var mem = UI.sheetMetalMemory();
        assert(mem.commands && mem.commands.cornerRelief.reliefType === 'circular' && mem.commands.cornerRelief.size === 0.25, 'UI.sheetMetalMemory() shows it: ' + JSON.stringify(mem.commands && mem.commands.cornerRelief));
        // forget: the first-use values again, for this command and the others
        UI.sheetMetalMemory(null);
        mem = UI.sheetMetalMemory();
        var c = mem.commands;
        assert(mem.flange === null && mem.hem === null && c.cornerRelief.reliefType === 'rect' && c.cornerRelief.size === null && c.cornerRelief.centeredOnBend === true, 'forgotten: ' + JSON.stringify(c.cornerRelief));
        assert(c.closedCorner.cornerType === 'butt' && c.closedCorner.gap === null && c.jog === null && c.miterFlange === null && c.rip.gap === null && c.breakCorner.size === null && !Object.keys(c.insertBends).length && c.formingTool.tool === 'dimple' && !Object.keys(c.formingTool.dims).length,
          'the other commands too: ' + JSON.stringify(c));
        v = await rfLROpenRelief();
        assert(v.reliefType === 'rect' && Math.abs(v.size - size0) < 1e-12 && pmField('Relief type').value === 'rect', 'after forgetting: Rectangular at 2 T again: ' + v.reliefType + ' ' + v.size);
        UI.pmCancel(); await idle();
        assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
        return 'Rectangular ' + size0 + ' → Circular .25 remembered → forgotten: Rectangular ' + size0;
      } finally {
        if (UI.hasPM()) UI.pmCancel();
        UI.sheetMetalMemory(null);
      }
    });

    step('rfLR: the runner sees what a step leaves behind: an open dialog, an open PropertyManager and a remembered Corner Relief each show in leftDiff, and nothing does once they are put back (a step that ends with a dialog open is failed by the runner)', async function () {
      UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(RFLR_BOX); await idle();
      var a = leftState();
      assert(a.dialog === '' && a.pm === '' && /"cornerRelief"/.test(a.sheetMetalMemory), 'a clean start: ' + JSON.stringify([a.dialog, a.pm]));
      try {
        UI.showModal({ title: 'rfLR question', body: '<p>left open?</p>', buttons: [{ id: 'rflr-ok', label: 'OK', primary: true, action: function () { UI.closeModal(); } }] });
        var d1 = leftDiff(a, leftState());
        assert(d1.length === 1 && /^dialog: .*rfLR question/.test(d1[0]), 'the dialog: ' + JSON.stringify(d1));
        clickModalButton('OK');
        assert(!modalOpen() && !leftDiff(a, leftState()).length, 'answered: nothing left: ' + JSON.stringify(leftDiff(a, leftState())));
        await rfLROpenRelief();
        var d2 = leftDiff(a, leftState());
        assert(d2.some(function (x) { return /^pm:  → Corner Relief/.test(x); }), 'the open PropertyManager: ' + JSON.stringify(d2));
        clickPmButton('Collect all corners');
        await rfLRUntil(function () { return UI.pmSpec().values.corners.length === 4; }, 3000, 'four corners collected');
        setInput(pmField('Relief type'), 'tear');
        await pmAccept();
        var d3 = leftDiff(a, leftState());
        assert(d3.indexOf('sheetMetalMemory.commands.cornerRelief.reliefType: rect → tear') >= 0, 'the remembered relief, by its field: ' + JSON.stringify(d3));
        assert(!d3.some(function (x) { return /^(dialog|pm): /.test(x); }), 'no dialog or PropertyManager left: ' + JSON.stringify(d3));
        UI.sheetMetalMemory(null);
        var d4 = leftDiff(a, leftState()).filter(function (x) { return /^(dialog|pm|sheetMetalMemory|profile|selectionFilter|desktopBridge|occt|units)\b/.test(x); });
        assert(!d4.length, 'put back: ' + JSON.stringify(d4));
        return 'dialog, PropertyManager and memory each listed; nothing after the reset';
      } finally {
        if (modalOpen()) UI.closeModal();
        if (UI.hasPM()) UI.pmCancel();
        UI.sheetMetalMemory(null);
      }
    });

    // ---- an inch STEP through File ▸ Open, on both engines
    function rfLRStep(units, code) {
      var m = K.newModel('LR'); K.runScript(m, 'p.units("' + units + '");\n' + code);
      return W.Exchange.exportSTEP(m, K.rebuild(m), { faceted: true });
    }
    function rfLRMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var hit = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name);
      hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    // File ▸ Open…, the file picked, Open: resolves to the import feature of the new part
    async function rfLROpen(name, text) {
      await anvil.newPart(); await idle(); UI.markClean();
      rfLRMenu('File', 'Open…');
      await rfLRUntil(function () { return modalOpen() && D.querySelector('#modal .open-input'); }, 3000, 'the Open dialog');
      var inp = D.querySelector('#modal .open-input'), dt = new W.DataTransfer();
      dt.items.add(new W.File([text], name, { type: 'application/step' }));
      inp.files = dt.files; inp.dispatchEvent(new W.Event('change'));
      await wait(50);
      clickModalButton('Open');
      var f = await rfLRUntil(function () { return !modalOpen() && (UI.App.model.features || []).filter(function (x) { return x.type === 'import'; })[0]; }, 25000, name + ' to open');
      await idle();
      return f;
    }
    function rfLRSize() {
      var p = UI.App.mesh.positions, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) { if (p[i + k] < lo[k]) lo[k] = p[i + k]; if (p[i + k] > hi[k]) hi[k] = p[i + k]; }
      return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    }
    function rfLRIs(size, want) { return size.every(function (s, k) { return Math.abs(s - want[k]) < 1e-3 * want[k]; }); }

    step('rfLR: a customer\'s inch STEP (3 x 1.5 x 6 with a Ø.5 hole) opened with File ▸ Open… is an inch part 3 x 1.5 x 6 on Anvil\'s reader and through OpenCascade (there it opened in millimetres, 38.1 for 1.5, which is what rfKM job a met when run alone on a PC with the engine); a millimetre STEP stays millimetres on both (the OpenCascade half skipped without vendor/occt)', async function () {
      var errs0 = errors.length, was = anvil.occt().on, out = [];
      var inch = rfLRStep('in', 'p.sketch("Front").rect(0, 0, 3, 1.5).end().extrude(6);\np.sketch("Top").circle(1.5, -3, 0.25).end().extrude(1, { cut: true, through: true, both: true });\n');
      var mm = rfLRStep('mm', 'p.sketch("Front").rect(0, 0, 30, 20).end().extrude(10);\np.sketch("Top").circle(15, -5, 3).end().extrude(1, { cut: true, through: true, both: true });\n');
      assert(/'INCH'/.test(inch) && !/'INCH'/.test(mm) && /CYLINDRICAL_SURFACE/.test(inch), 'the two customer files: inches and millimetres, the hole a cylinder');
      try {
        for (var pass = 0; pass < 2; pass++) {
          var on = pass === 1;
          await anvil.newPart(); await idle();
          anvil.occt(on, { remember: false }); await idle();
          if (on) {   // the engine started first: a plain plate
            await anvil.run('p.units("in");\np.box(2, 0.0598, 2);\n'); await idle();
            var st = await Promise.race([anvil.occtIdle(), wait(25000).then(function () { return anvil.occt(); })]);
            if (!st || st.state === 'failed' || !UI.occt.canImport()) { out.push('OpenCascade: skipped, not installed'); break; }
          }
          var f = await rfLROpen('customer-inch.step', inch);
          if (on) await Promise.race([anvil.occtIdle(), wait(25000)]);
          await idle();
          assert(!!f.brep === on, (on ? 'read by OpenCascade (the file kept on the feature)' : 'read by Anvil\'s reader') + ': brep ' + !!f.brep);
          assert(UI.App.model.units === 'in' && rfLRIs(rfLRSize(), [3, 1.5, 6]), (on ? 'OpenCascade' : 'Anvil') + ': an inch part 3 x 1.5 x 6: units ' + UI.App.model.units + ', size ' + rfLRSize().map(fmt).join(' x '));
          assert(!Object.keys(anvil.summary().errors || {}).length, 'no errors: ' + JSON.stringify(anvil.summary().errors));
          f = await rfLROpen('customer-mm.step', mm);
          if (on) await Promise.race([anvil.occtIdle(), wait(25000)]);
          await idle();
          assert(UI.App.model.units === 'mm' && rfLRIs(rfLRSize(), [30, 20, 10]), (on ? 'OpenCascade' : 'Anvil') + ': a millimetre part 30 x 20 x 10: units ' + UI.App.model.units + ', size ' + rfLRSize().map(fmt).join(' x '));
          out.push((on ? 'OpenCascade' : 'Anvil') + ': in 3 x 1.5 x 6, mm 30 x 20 x 10');
        }
        assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
        return out.join('; ');
      } finally {
        if (modalOpen()) UI.closeModal();
        await anvil.newPart(); await idle(); UI.markClean();
        anvil.occt(was, { remember: false }); await idle();
      }
    });
  })();
  // --- end rfLR ---
