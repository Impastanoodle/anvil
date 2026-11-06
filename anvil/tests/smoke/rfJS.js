  // --- rfJS (2026-11-06, lane sweptflange) --- Sheet Metal ▸ Swept Flange: the ribbon button (its own icon, next to
  // Lofted-Bend), the PM (Profile and Path, Sheet Metal Parameters, Custom Bend Allowance, Flat-Pattern Options), the
  // sheet set from the PM, the flat and its DXF, the tree icon, Edit Feature, and a path along an edge clicked in the
  // viewport. Self-contained.
  (function () {
    var T = 0.06;
    function rfJSEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfJSClick(p) { rfJSEv('mousemove', p); rfJSEv('mousedown', p, $('viewport')); rfJSEv('mouseup', p); }
    function rfJSButton() { UI.setRibbonTab('Sheet Metal'); return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /^Swept Flange$/.test((b.getAttribute('aria-label') || '').trim()); })[0]; }
    function rfJSSelect(label, value) {
      // 'Path' also matches the 'Path sketch' radio: the select whose own label it is
      var s = Array.prototype.filter.call(D.querySelectorAll('#pm select'), function (x) { var l = x.closest('label') || (x.parentElement && x.parentElement.querySelector('label')) || x.previousElementSibling; return l && l.textContent.trim() === label; })[0] || pmField(label);
      assert(s && s.tagName === 'SELECT', 'select ' + label); s.value = value; s.dispatchEvent(new W.Event('change', { bubbles: true })); }
    function rfJSNum(label, value) { var n = pmField(label); assert(n, 'field ' + label); n.value = String(value); n.dispatchEvent(new W.Event('input', { bubbles: true })); n.dispatchEvent(new W.Event('change', { bubbles: true })); }

    step('rfJS: Sheet Metal ▸ Swept Flange (its own icon, after Lofted-Bend): an L profile along a 10 path, the thickness set in the PM; flat (flats + BA) × 10 with one bend line, DXF OUTLINE + BEND, the tree icon; Edit Feature ▸ Reverse direction + Flatten along path', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sketch("Top").line(0, 0, 0, -10).end();\np.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).end();\n'); await idle();
      var b = rfJSButton();
      assert(b, 'Swept Flange button');
      var btns = Array.prototype.slice.call(D.querySelectorAll('#ribbon button')), lb = btns.filter(function (x) { return /Lofted/.test(x.getAttribute('aria-label') || ''); })[0];
      assert(lb && btns.indexOf(b) === btns.indexOf(lb) + 1, 'right after Lofted-Bend');
      assert(b.dataset.icon === 'sweptFlange' && W.Icons.has && W.Icons.has('sweptFlange'), 'its own icon: ' + b.dataset.icon);
      b.click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Swept Flange', 'PM ' + (UI.hasPM() && UI.pmTitle()));
      var heads = Array.prototype.map.call(D.querySelectorAll('#pm .pm-group > h4'), function (h) { return h.textContent.replace(/^[▸▾]/, '').trim(); });
      var want = ['Profile and Path', 'Sheet Metal Parameters', 'Custom Bend Allowance', 'Flat-Pattern Options'];
      want.forEach(function (h, i) { assert(heads.indexOf(h) >= 0 && (i === 0 || heads.indexOf(h) > heads.indexOf(want[i - 1])), 'groups ' + heads.join(' | ')); });
      var sks = UI.App.model.features.filter(function (q) { return q.type === 'sketch'; });
      rfJSSelect('Profile', String(sks[1].id)); rfJSSelect('Path', String(sks[0].id));
      rfJSNum('Thickness', T); await wait(20);
      await pmAccept();
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'sweptFlange' && f.profile === sks[1].id && f.path === sks[0].id && !f.flip && f.flatten === 'profile' && f.name === 'Swept Flange1' && !UI.App.build.errors[f.id], 'feature ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      near(+UI.App.model.sheet.thickness, T, 1e-12, 'the sheet set from the PM');
      var W1 = (2 - T) + (1 - T) + Math.PI / 2 * 1.5 * T;
      var flat = anvil.flat();
      assert(flat.loops.length === 1 && flat.bends.length === 1, 'flat: ' + flat.loops.length + ' loop, ' + flat.bends.length + ' bends');
      near(flat.size[0], W1, 1e-9, 'flat width'); near(flat.size[1], 10, 1e-9, 'flat length');
      var dxf = anvil.dxfOutput({ export: 'sheet' });
      assert(/\n8\nBEND\n/.test(dxf) && /\n8\nOUTLINE\n/.test(dxf), 'DXF with OUTLINE and BEND');
      var rows = Array.prototype.filter.call(D.querySelectorAll('#tree *'), function (el) { return el.querySelector && el.querySelector('svg') && /Swept Flange1/.test(el.textContent) && el.textContent.length < 40; });
      var ic = rows.length && rows[rows.length - 1].querySelector('svg');
      assert(ic && W.Icons.node && ic.outerHTML === W.Icons.node('sweptFlange', 16).outerHTML, 'tree icon is the Swept Flange icon');
      UI.editFeature(f); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Swept Flange1' && UI.pmSpec().values.prof === String(sks[1].id), 'Edit Feature reopens');
      pmField('Reverse direction').click(); await wait(10);
      pmField('Flatten along path').click(); await wait(20);
      await pmAccept();
      var f2 = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f2.flip === true && f2.flatten === 'path' && !UI.App.build.errors[f2.id], 'edited ' + JSON.stringify(f2));
      near(anvil.flat().size[0], (2 - 2 * T) + (1 - 2 * T) + Math.PI / 2 * 1.5 * T, 1e-9, 'flipped: the sketch is the outside face');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfJS: Swept Flange PM ▸ Edges of the part: the front top edge of a 6 × 4 Base Flange clicked in the viewport, a 1 tall profile at its end: the flange adds T × 1 × 6', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.sketch("Right").line(-4, ' + T + ', -4, ' + (T + 1) + ').end();\n'); await idle();
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var v0 = anvil.mass().volume;
      rfJSButton().click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Swept Flange', 'PM');
      D.querySelector('#pm input[data-key="pathKind:edges"]').click(); await wait(20);
      assert(!D.querySelector('#pm [data-key="pathSk"]') && /Path edges/.test($('pm').innerHTML), 'the edge box replaces the path sketch');
      rfJSClick(UI.worldToScreen([3, T, 4])); await idle(); await wait(20);
      assert(UI.pmSpec().values.edges.length === 1 && /1 edge/.test($('pm').textContent), 'edge taken: ' + JSON.stringify(UI.pmSpec().values.edges));
      await pmAccept();
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'sweptFlange' && f.edges && f.edges.length === 1 && f.path == null && !UI.App.build.errors[f.id], 'feature ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      near(anvil.mass().volume, v0 + T * 6, 1e-6, 'plate + T × 1 × 6');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
