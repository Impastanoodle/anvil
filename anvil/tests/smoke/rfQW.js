  // --- rfQW (2026-11-19, head; user: "make anvil default to ips") --- Anvil opened in MMGS on a metric Mounting Bracket
  // while every new document was IPS, and the built-in samples without .units() opened as inch documents with mm
  // numbers (2 in steel). The start-up part and the Design Library entry are the bracket drawn in inches (codeIn) unless
  // Tools > Default units says millimeters; every other sample says it is metric. Self-contained; anvil.units put back.
  (function () {
    step('rfQW: with inches the default the start-up Mounting Bracket is the inch one (IPS, 5 x 3 x 1/8, the hand volume), millimeters as the default keeps the metric one, and every built-in sample names its units', async function () {
      var saved = null; try { saved = W.localStorage.getItem('anvil.units'); } catch (e) { }
      var errs0 = errors.length;
      try {
        var ex = UI.EXAMPLES[0];
        assert(ex.name === 'Mounting Bracket' && ex.codeIn && /\.units\("in"\)/.test(ex.codeIn) && /\.units\("mm"\)/.test(ex.code), 'the bracket has an inch and a metric script');
        W.localStorage.removeItem('anvil.units');
        assert(UI.defaultUnits() === 'in', 'default units: ' + UI.defaultUnits());
        assert(UI.exampleCode(ex) === ex.codeIn, 'inches the default: the inch bracket');
        var r = await anvil.run(UI.exampleCode(ex)); await idle();
        assert(!(r && r.error), 'the inch bracket builds: ' + (r && r.error));
        assert(UI.App.model.units === 'in' && /IPS/.test($('status-right').textContent), 'IPS: ' + UI.App.model.units + ' / ' + $('status-right').textContent);
        assert(Object.keys(UI.App.build.errors).length === 0, 'no rebuild errors: ' + JSON.stringify(UI.App.build.errors));
        // plate + boss - bore - four corner holes - two slots
        var want = 5 * 3 * 0.125 + Math.PI * 0.625 * 0.625 * 0.75 - Math.PI * 0.25 * 0.25 * 0.875 - 4 * Math.PI * 0.1875 * 0.1875 * 0.125 - 2 * (0.5 * 0.25 + Math.PI * 0.125 * 0.125) * 0.125;
        var vol = anvil.mass().volume, bb = anvil.summary().bbox;
        near(vol, want, 1e-9, 'volume against the hand value');
        near(bb.max[0] - bb.min[0], 5, 1e-9, 'length'); near(bb.max[2] - bb.min[2], 3, 1e-9, 'width'); near(bb.max[1] - bb.min[1], 0.875, 1e-9, 'height');
        // every sample that has no inch script is a metric part and says so: a script without .units() takes the default
        var unnamed = UI.EXAMPLES.filter(function (e) { return e.kind !== 'assembly' && !/\.units\(/.test(e.code); }).map(function (e) { return e.name; });
        assert(unnamed.length === 0, 'samples without .units(): ' + unnamed.join(', '));
        var sm = UI.EXAMPLES.filter(function (e) { return e.name === 'Sheet Metal Bracket'; })[0];
        await anvil.run(UI.exampleCode(sm)); await idle();
        assert(UI.App.model.units === 'mm' && /MMGS/.test($('status-right').textContent) && UI.App.model.sheet.thickness === 2, 'the 2 mm sheet bracket stays metric: ' + UI.App.model.units);
        // millimeters as the default: the metric bracket, as before
        UI.setDefaultUnits('mm');
        assert(UI.exampleCode(ex) === ex.code, 'millimeters the default: the metric bracket');
        await anvil.newPart(); await idle();
        assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
        return 'inch bracket ' + vol.toFixed(6) + ' in^3 (hand ' + want.toFixed(6) + ')';
      } finally { try { if (saved == null) W.localStorage.removeItem('anvil.units'); else W.localStorage.setItem('anvil.units', saved); } catch (e) { } }
    });
  })();
