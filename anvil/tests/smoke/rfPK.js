  // --- rfPK (2026-11-18, lane smmirror) --- the Mirror PropertyManager on sheet metal: an Edge-Flange picked in the
  // FeatureManager mirrors (✓ lit; the copy is a flange in the flat: kernel group rfPK, the full shop flow in rfPG job 2);
  // a Sketched Bend is refused with the kernel's reason in the greyed ✓ and the status bar (SolidWorks does not list it
  // among the sheet-metal features it mirrors).
  (function () {
    var T = 0.1196;
    var RFPK_GUS = 'p.name("PK-GUS").units("in");\np.sheet(' + T + ', 0.12, 0.44);\np.sketch("Top").rect(-2, -5, 4, 5).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').line(-2.6, -3, 2.6, -3).end();\np.sketchedBend(90, { sketch: 3, fixed: [0, ' + T + ', 1.2] });\n' +
      'p.flange(1.5, [[2, ' + T + ', 1.2]], { position: "inside", lengthRef: "outer" });\n';
    function rfPKRow(id) { return D.querySelector('#tree .ti[data-fid="' + id + '"]'); }
    function rfPKRowEv(row, type) {
      var r = row.getBoundingClientRect(), nm = row.querySelector('.nm') || row;
      nm.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, view: W, button: 0, detail: 1, clientX: r.left + 40, clientY: r.top + r.height / 2 }));
    }
    function rfPKClickRow(id) { var row = rfPKRow(id); assert(row, 'tree row ' + id); rfPKRowEv(row, 'mousedown'); rfPKRowEv(row, 'mouseup'); rfPKRowEv(row, 'click'); }
    async function rfPKMirrorPM(fid) {
      rfPKClickRow(fid); await idle(); await wait(20);
      UI.setRibbonTab('Features');
      var caret = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /^(Linear Pattern|Mirror|Circular Pattern) options/.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '')).trim()); })[0];
      assert(caret, 'the pattern flyout on the Features tab');
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var mi = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return /^\s*Mirror\b/.test(m.textContent); })[0];
      assert(mi, 'Mirror in the flyout');
      mi.click(); await idle(); await wait(40);
      assert(UI.hasPM() && UI.pmTitle() === 'Mirror', 'Mirror PM: ' + (UI.hasPM() && UI.pmTitle()));
      return D.querySelector('#pm .pm-ok');
    }

    step('rfPK: Mirror PM on an 11 ga gusset: SketchBend1 picked in the FeatureManager gives a grey ✓ with the reason (Sketched Bends are not mirrored); Edge-Flange1 picked gives a lit ✓, Mirror1 builds and the flat has the mirrored bend', async function () {
      var errs0 = errors.length, notes = [], du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      await anvil.run(RFPK_GUS); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'PK-GUS: ' + JSON.stringify(anvil.summary().errors));
      var sb = UI.App.model.features.filter(function (f) { return f.type === 'sketchedBend'; })[0], ef = UI.App.model.features.filter(function (f) { return f.type === 'flange'; })[0];
      var bends0 = (anvil.flat().bends || []).length;
      var ok = await rfPKMirrorPM(sb.id);
      notes.push('SketchBend1: ✓ ' + (ok.classList.contains('disabled') ? 'grey: ' + ok.title : 'lit') + '; status ' + statusText().slice(0, 160));
      assert(ok.classList.contains('disabled') && /Cannot mirror SketchBend1: SolidWorks mirrors Edge Flanges, Miter Flanges, Hems and Closed Corners, not a Sketched Bend/.test(ok.title), 'refused with the reason: ' + notes.join('; '));
      UI.pmCancel(); await idle();
      ok = await rfPKMirrorPM(ef.id);
      notes.push('Edge-Flange1: ✓ ' + (ok.classList.contains('disabled') ? 'grey: ' + ok.title : 'lit'));
      assert(!ok.classList.contains('disabled'), 'a flange mirrors: ' + notes.join('; '));
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, mf = fs[fs.length - 1], fl = anvil.flat();
      notes.push(mf.name + ' ' + ((anvil.summary().errors || {})[mf.id] || 'ok') + ', bends ' + bends0 + ' -> ' + (fl.bends || []).length + ', blank ' + fl.size.map(function (x) { return x.toFixed(4); }).join(' x '));
      assert(mf.type === 'mirror' && !Object.keys(anvil.summary().errors || {}).length && (fl.bends || []).length === bends0 + 1, 'Mirror1 is a flange in the flat: ' + notes.join('; '));
      near(Math.max(fl.size[0], fl.size[1]), 6.583914290233, 1e-6, 'the blank = the flange on both edges (kernel rfPK)');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
  })();
