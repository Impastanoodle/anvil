  // --- rfJE (2026-11-05, lane flatopts): Flat-Pattern1 PM ▸ Parameters (Merge faces, Simplify bends, Show slit) and
  // Corner Options (Corner treatment) with real clicks on the boxes: ✓ saves model.flatOptions (only the changed boxes),
  // the flat follows, Edit Feature shows the saved boxes, undo clears them. Self-contained. ---
  (function () {
    var T = 0.0598, R = 0.0598;
    var TRAY = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (q) { return 'p.flange(1, [' + JSON.stringify(q) + '], { position: "bendOutside", lengthRef: "outer" });\n'; }).join('');
    function rfJEarea(f) { return f.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function rfJEbox(label) { var b = pmField(label); assert(b && b.type === 'checkbox', 'box "' + label + '"'); return b; }
    function rfJEclick(el) {
      var r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      ['mousedown', 'mouseup', 'click'].forEach(function (t) { el.dispatchEvent(new W.MouseEvent(t, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })); });
    }
    function rfJEopen() {
      var row = D.querySelector('#tree .ti.fp-row');
      assert(row, 'Flat-Pattern row in the tree');
      row.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    }

    step('rfJE: Flat-Pattern1 ▸ Edit Feature: Merge faces, Simplify bends, Show slit under Parameters and Corner treatment under Corner Options (SolidWorks\' defaults); click Show slit on and Merge faces off, ✓: the flat gets a slit in each tray corner and its bend regions as faces; reopen shows the saved boxes; undo clears them', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(TRAY); await idle();
      var a0 = rfJEarea(anvil.flat());
      rfJEopen(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Flat-Pattern1', 'PM ' + (UI.hasPM() && UI.pmTitle()));
      var heads = Array.prototype.map.call(D.querySelectorAll('#pm .pm-group > h4'), function (h) { return h.textContent.replace(/^[▸▾]/, '').trim(); });
      assert(heads.indexOf('Parameters') === 0 && heads.indexOf('Corner Options') > 0, 'groups: ' + heads.join(' | '));
      var txt = $('pm').textContent, order = ['Fixed face', 'Grain direction', 'Merge faces', 'Simplify bends', 'Show slit', 'Corner treatment'].map(function (w) { return txt.indexOf(w); });
      assert(order.every(function (i, k) { return i >= 0 && (k === 0 || i > order[k - 1]); }), 'SolidWorks\' order: ' + order.join(', '));
      assert(rfJEbox('Merge faces').checked && rfJEbox('Simplify bends').checked && !rfJEbox('Show slit').checked && rfJEbox('Corner treatment').checked, 'defaults');
      assert(['Merge faces', 'Simplify bends', 'Show slit', 'Corner treatment'].every(function (w) { return !rfJEbox(w).disabled; }), 'no dead boxes');
      rfJEclick(rfJEbox('Show slit')); await wait(20);
      rfJEclick(rfJEbox('Merge faces')); await wait(20);
      var v = UI.pmSpec().values;
      assert(v.showSlit === true && v.mergeFaces === false, 'values: ' + JSON.stringify([v.showSlit, v.mergeFaces]));
      await pmAccept(); await wait(20);
      assert(!UI.hasPM(), 'PM closed');
      assert(JSON.stringify(UI.App.model.flatOptions) === JSON.stringify({ mergeFaces: false, showSlit: true }), 'saved: ' + JSON.stringify(UI.App.model.flatOptions));
      var f1 = anvil.flat(), g = 0.004, Ls = R + T;
      near(a0 - rfJEarea(f1), 4 * (g * Ls + g * g / 4), 1e-9, 'four corner slits');
      assert(f1.regionLines && f1.regionLines.length === 8, 'bend regions kept as faces: ' + (f1.regionLines && f1.regionLines.length));
      rfJEopen(); await wait(30);
      assert(rfJEbox('Show slit').checked && !rfJEbox('Merge faces').checked && rfJEbox('Simplify bends').checked, 'Edit Feature shows the saved boxes');
      UI.pmCancel(); await idle();
      UI.undo(); await idle(); await wait(20);
      assert(!UI.App.model.flatOptions, 'undo clears them');
      near(rfJEarea(anvil.flat()), a0, 1e-12, 'the flat as before');
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
