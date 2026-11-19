  // --- rfQF (2026-11-18, lane smrelief; kernel group rfQF has the closed forms) --- Corner-Trim in the flat
  // (test-reports/2026-11-18-shop-flow-7.md H2): with the tray flattened, Corners ▸ Break-Corner/Corner-Trim opens
  // Corner-Trim (folded it is still Break Corner); Relief at the bend corners, Circular R .125, ✓: the feature sits under
  // Flat-Pattern1 (not in the feature list), the flat loses the four reliefs, the folded part is unchanged; a double-click
  // on its row reopens it with the values, Break the outer corners (chamfer .1) added, ✓: 8 corners more. Self-contained.
  (function () {
    var TRAY = 'p.units("in"); p.sheet(0.06, 0.06, 0.5); p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n' +
      [[4, 0.06, 0], [4, 0.06, 6], [0, 0.06, 3], [8, 0.06, 3]].map(function (e) { return 'p.flange(1, [[' + e.join(', ') + ']], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    function rfQFvol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfQFarea(fl) { return fl.loops.reduce(function (s, l, i) { return s + Math.abs(K.signedArea(l)) * (i ? -1 : 1); }, 0); }
    function rfQFitem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf(text) >= 0; })[0]; }
    function rfQFcaret() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0]; }
    async function rfQFflyout() {
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = rfQFcaret();
      assert(caret && !caret.disabled, 'the Corners flyout');
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var mi = rfQFitem('Break-Corner/Corner-Trim');
      assert(mi, 'Break-Corner/Corner-Trim in the flyout');
      mi.click(); await idle(); await wait(30);
    }
    function rfQFrow(name) { return Array.prototype.filter.call(D.querySelectorAll('#tree .ti'), function (r) { var nm = r.querySelector('.nm'); return nm && nm.textContent.trim() === name; })[0]; }
    async function rfQFflat(on) { var r = UI.toggleFlatten(on); if (r && r.then) await r; await idle(); await wait(40); await idle(); }

    step('rfQF: Corner-Trim from the Corners flyout on the flattened tray: Circular R .125 at the four bend corners, the row under Flat-Pattern1, the folded part unchanged; double-click reopens it, chamfer .1 on the outer corners added; folded, the flyout opens Break Corner', async function () {
      var errs0 = errors.length, notes = [], du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      await anvil.run(TRAY); await idle();
      var v0 = rfQFvol(), n0 = UI.App.model.features.length;
      // folded: Break Corner as before
      await rfQFflyout();
      assert(UI.hasPM() && UI.pmTitle() === 'Break Corner', 'folded: Break Corner PM (' + (UI.hasPM() && UI.pmTitle()) + ')');
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle(); await wait(20);
      await rfQFflat(true);
      assert(UI.App.flat, 'flattened');
      var a0 = rfQFarea(UI.App.flat);
      await rfQFflyout();
      assert(UI.hasPM() && UI.pmTitle() === 'Corner-Trim', 'flat: Corner-Trim PM (' + (UI.hasPM() && UI.pmTitle()) + ')');
      var rel = pmField('Relief at the bend corners');
      assert(rel && rel.type === 'checkbox', 'Relief Options check box');
      if (!rel.checked) { rel.click(); await wait(20); }
      setInput(pmField('Relief radius'), 0.125); await wait(20);
      var cen = pmField('Centered on bend lines');
      assert(cen && cen.checked && cen.disabled, 'Centered on bend lines (ticked, locked)');
      assert(/4 corners where bend lines meet/.test(statusText()), 'status: ' + statusText());
      notes.push(statusText().slice(0, 80));
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, f = fs[fs.length - 1];
      assert(fs.length === n0 + 1 && f.type === 'cornerTrim' && f.relief === 'circular' && f.size === 0.125 && !f.breakCorner, 'feature: ' + JSON.stringify(f));
      assert(UI.App.flat && UI.App.flat.trims && UI.App.flat.trims[0].reliefs.length === 4, 'the flat has the four reliefs: ' + JSON.stringify(UI.App.flat && UI.App.flat.trims));
      var a1 = rfQFarea(UI.App.flat);
      assert(a0 - a1 > 0.1 && a0 - a1 < 4 * Math.PI * 0.125 * 0.125, 'flat area removed ' + (a0 - a1));
      // the tree: under Flat-Pattern1, not in the feature list
      UI.refreshTree(); await wait(20);
      var row = rfQFrow('Corner-Trim1');
      assert(row && /fp-kid/.test(row.className), 'Corner-Trim1 is a Flat-Pattern1 row: ' + (row ? row.className : 'none'));
      assert(Array.prototype.filter.call(D.querySelectorAll('#tree .ti'), function (r) { var nm = r.querySelector('.nm'); return nm && nm.textContent.trim() === 'Corner-Trim1'; }).length === 1, 'listed once');
      // double-click: Edit Feature, the values back; add the chamfer
      row.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true })); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Corner-Trim1', 'Edit Feature: ' + (UI.hasPM() && UI.pmTitle()));
      near(+pmField('Relief radius').value, 0.125, 1e-9, 'radius kept');
      var br = pmField('Break the outer corners');
      assert(br && !br.checked, 'no break yet');
      br.click(); await wait(20);
      setInput(pmField('Distance'), 0.1); await wait(20);
      await pmAccept(); await wait(30);
      f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(UI.App.model.features.length === n0 + 1 && f.breakCorner === 'chamfer' && f.breakSize === 0.1, 'edited: ' + JSON.stringify(f));
      near(a1 - rfQFarea(UI.App.flat), 8 * 0.005, 1e-9, 'eight chamfers .1');
      notes.push('flat ' + rfQFarea(UI.App.flat).toFixed(6));
      // folded: the part as it was
      await rfQFflat(false);
      near(rfQFvol(), v0, 1e-12, 'folded volume unchanged');
      UI.setView('Isometric');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
  })();
