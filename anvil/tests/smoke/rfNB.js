  // --- rfNB (2026-11-15, lane NB: Geometry Nesting a shop can cut — the Mastercam profile's Transform ▸ Geometry
  // Nesting on an inch bracket's flat: sheet preset, quantity typed, grain, Max sheets with the reason, bend lines
  // with each blank in the preview and the DXF, one DXF for all sheets, the report, ✓ makes the Nest document) ---
  (function () {
    function rfNBRibbon(re) {
      var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return t.textContent === 'Transform'; })[0];
      assert(tab, 'a Transform tab in the Mastercam profile');
      tab.click();
      var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return re.test(x.getAttribute('aria-label') || x.textContent); })[0];
      assert(b, 'ribbon button ' + re);
      return b;
    }
    function rfNBType(inp, text) {
      inp.focus();
      inp.value = '';
      for (var i = 0; i < text.length; i++) {
        inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: text[i], bubbles: true }));
        inp.value += text[i];
        inp.dispatchEvent(new W.Event('input', { bubbles: true }));
        inp.dispatchEvent(new W.KeyboardEvent('keyup', { key: text[i], bubbles: true }));
      }
    }
    function rfNBMsg() { var m = D.querySelector('#pm .pm-msg'); return m ? m.textContent : ''; }

    step('rfNB: Geometry Nesting (Mastercam profile) on an inch bracket\'s flat — 48 × 120 from the list, quantity 24 typed, 180° only (grain): one sheet, each blank\'s bend line drawn with it; quantity 200 with Max sheets 1 says how many did not fit and why; Save DXF as one file with bend lines gives the blanks on CUT and every bend on BEND; Save report lists the part and count; ✓ makes the Nest document with a BEND layer', async function () {
      var errs0 = errors.length, prof = UI.Profiles.active ? UI.Profiles.active() : 'solidworks', dl = UI.download, saved = [];
      try {
        UI.Profiles.set('mastercam'); await idle();
        await anvil.newPart(); await idle();
        await anvil.run(['p.name("NBBracket").units("in");', 'p.sheet(0.06, 0.06, 0.71);', 'p.sketch("Top").rect(0, -6, 10, 6).end().baseFlange(0.06);',
          'p.flange(2, [[0, 0.06, 3]]);', 'p.hole("Top", 5, -3, 0.5, { offset: 0.06 });'].join('\n')); await idle();
        rfNBRibbon(/Nesting/).click(); await idle(); await wait(20);
        assert(UI.pmTitle() === 'Geometry Nesting', 'PM ' + UI.pmTitle());
        var size = pmField('Size');
        assert(Array.prototype.map.call(size.options, function (o) { return o.value; }).join(',') === '48x96,60x120,48x120,custom', 'sheet list');
        setInput(size, '48x120'); await wait(20);
        assert(+pmField('Length (X)').value === 120 && +pmField('Width (Y)').value === 48, 'sheet 120 × 48');
        clickPmButton('Add flat pattern'); await wait(20);
        var st = UI.nestState();
        assert(st.parts.length === 1 && st.parts[0].part.marks.length === 1 && st.parts[0].part.marks[0].layer === 'BEND', 'the flat with its bend line');
        // the quantity typed key by key, then Enter: nests at once (first Enter), the panel stays
        var qty = D.querySelector('#pm input.nest-qty');
        rfNBType(qty, '24'); pressEnter(qty); await wait(20);
        setInput(pmField('Rotation'), '180'); await wait(20);
        st = UI.nestState();
        assert(st.result && st.result.placed === 24 && st.result.sheets.length === 1 && st.result.opts.rotation === 180, 'nest ' + (st.result && st.result.placed));
        assert(st.result.placements.every(function (p) { return p.angle === 0 || p.angle === 180; }), 'grain: 0 / 180 only');
        assert(UI.hasPM() && W.Nest.check(st.result).ok, 'panel open, no overlap');
        var svg = D.querySelector('#pm [data-role="nest-preview"]');
        assert(svg.querySelectorAll('path').length === 24 && svg.querySelectorAll('polyline.nest-mark[data-layer="BEND"]').length === 24, 'preview: 24 blanks, 24 bend lines');
        var pmt = D.querySelector('#pm').textContent; assert(/Remnant[\s\S]*120(\.0+)? × [\d.]+ in/.test(pmt), 'remnant row: ' + pmt.slice(pmt.indexOf('Remnant'), pmt.indexOf('Remnant') + 60));
        // too many for one sheet: the message names the part and the reason
        qty = D.querySelector('#pm input.nest-qty');
        setInput(qty, 200); await wait(20);
        setInput(pmField('Max sheets'), 1); await wait(20);
        clickPmButton('Nest'); await wait(30);
        st = UI.nestState();
        assert(st.result.sheets.length === 1 && st.result.unplaced.length === 200 - st.result.placed && st.result.placed > 24, 'placed ' + st.result.placed);
        assert(new RegExp((200 - st.result.placed) + ' × NBBracket: no room on 1 sheet').test(rfNBMsg()), 'message: ' + rfNBMsg());
        setInput(pmField('Max sheets'), 10); await wait(20);
        clickPmButton('Nest'); await wait(30);
        st = UI.nestState();
        var nSheets = st.result.sheets.length;
        assert(st.result.placed === 200 && !st.result.unplaced.length && nSheets >= 2, 'all 200 on ' + nSheets);
        // Save DXF: one file, sheets side by side, bend lines on
        setInput(pmField('DXF files'), 'one');
        pmField('Bend / etch lines in DXF').checked = true; pmField('Bend / etch lines in DXF').dispatchEvent(new W.Event('change', { bubbles: true })); await wait(20);
        UI.download = function (name, text) { saved.push({ name: name, text: text }); };
        clickPmButton('Save DXF'); await wait(20);
        assert(saved.length === 1 && /NBBracket-nest\.dxf$/.test(saved[0].name), 'saved ' + saved.map(function (s) { return s.name; }));
        var back = W.DxfImport.parse(saved[0].text), by = {};
        back.entities.forEach(function (e) { by[e.layer] = (by[e.layer] || 0) + 1; });
        assert(by.BEND === 200 && by.SHEET === 4 * nSheets && back.entities.filter(function (e) { return e.layer === 'CUT' && e.t === 'circle'; }).length === 200, 'layers ' + JSON.stringify(by));
        clickPmButton('Save report'); await wait(20);
        assert(saved.length === 2 && /report\.txt$/.test(saved[1].name) && /\tNBBracket\t\d+/.test(saved[1].text) && /200 of 200 parts on /.test(saved[1].text), 'report ' + (saved[1] && saved[1].text));
        UI.download = dl;
        // ✓: the Nest document, its sheet sketches carry the bend lines on BEND
        // the bracket has unsaved changes: ✓ asks first (Don't Save), as File ▸ New would
        var ok = UI.pmOK(); await wait(50);
        if (modalOpen()) clickModalButton('Don\'t Save');
        await ok; await idle();
        var m = UI.App.model, sk = m.features.filter(function (f) { return f.type === 'sketch'; });
        assert(m.name === 'Nest' && sk.length === nSheets, 'document ' + m.name + ' with ' + sk.length + ' sheets');
        assert(sk[0].layers.some(function (l) { return l.name === 'BEND'; }) && sk[0].entities.some(function (e) { return e.layer === 'BEND'; }), 'BEND layer in the sheet sketch');
        assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
        return nSheets + ' sheets for 200; ' + JSON.stringify(by);
      } finally {
        UI.download = dl;
        if (UI.hasPM && UI.hasPM()) UI.pmCancel();
        UI.Profiles.set(prof || 'solidworks'); await idle();
      }
    });
  })();
