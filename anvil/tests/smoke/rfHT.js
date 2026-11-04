  // --- rfHT (2026-11-04, lane bodydel: Delete/Keep Body) --- user: "the capability to delete a solid when fully
  // selected". Two separate inch blocks; a double-click on the 2x3 block selects the whole body, Delete opens the
  // Delete/Keep Body PropertyManager with that body listed (the doomed body red in the preview), ✓: one body left
  // (the holed block's exact volume), Body-Delete/Keep1 in the tree; suppressing it brings both back; one undo step.
  // Insert ▸ Features ▸ Delete/Keep Body opens it empty: Keep Bodies, a click on the holed block, ✓: only that block;
  // Edit Feature reopens it with Keep Bodies and the body listed. The Solid Bodies folder row + Delete opens it too. ---
  (function () {
    var rfHTTwo = 'p.units("in");\np.sketch("Front").rect(0, 0, 2, 3).end().extrude(1);\np.sketch("Front").rect(4, 0, 1, 1).circle(4.5, 0.5, 0.25).end().extrude(0.5);';
    var rfHTA = 6, rfHTB = 0.5 - Math.PI * 0.0625 * 0.5;
    function rfHTEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect(), press = type === 'mousedown';
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: press ? 1 : 0, detail: type === 'dblclick' ? 2 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfHTScr(p) { var s = UI.worldToScreen(p); return [Math.round(s[0]), Math.round(s[1])]; }
    function rfHTClick(p) { rfHTEv('mousedown', p, $('viewport')); rfHTEv('mouseup', p); }
    function rfHTKey(key) { var ev = new W.KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }); D.body.dispatchEvent(ev); return ev; }
    function rfHTVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfHTItems() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-item'), function (r) { return r.textContent; }); }
    function rfHTOk() { var b = D.querySelector('#pm .pm-ok'); assert(b, 'the ✓ button'); b.click(); }
    function rfHTTree(name) { return Array.prototype.some.call(D.querySelectorAll('#tree [data-fid]'), function (r) { return r.textContent.indexOf(name) >= 0; }); }
    async function rfHTPart() {
      await anvil.newPart(); await idle();
      await anvil.run(rfHTTwo); await idle();
      UI.setView('Front'); UI.zoomToFit(); await idle(); await wait(60);
      assert(UI.App.build.bodies.length === 2, 'two bodies: ' + UI.App.build.bodies.length);
    }

    step('rfHT: double-click a block (whole body selected), Delete: the Delete/Keep Body PM lists it, ✓: one body left with the holed block\'s exact volume, Body-Delete/Keep1 in the tree; suppress brings it back; one undo step', async function () {
      var errs0 = errors.length;
      await rfHTPart();
      var n0 = UI.App.model.features.length, u0 = UI.App.undo.length, s = rfHTScr([1, 1.5, 1]);
      rfHTClick(s); await idle(); rfHTClick(s); rfHTEv('dblclick', s, $('viewport')); await idle(); await wait(30);
      assert(UI.App.sel && UI.App.sel.kind === 'body' && UI.App.sel.index === 0, 'the whole body selected: ' + JSON.stringify(UI.App.sel));
      rfHTKey('Delete'); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Delete/Keep Body', 'Delete/Keep Body PM: ' + (UI.hasPM() && UI.pmTitle()));
      var items = rfHTItems();
      assert(items.length === 1 && /Boss-Extrude1/.test(items[0]), 'the body listed: ' + items.join(', '));
      var del = D.querySelector('#pm input[data-key="type:delete"]');
      assert(del && del.checked, 'Delete Bodies chosen');
      assert(UI.groups.preview.children.length === 1, 'the doomed body in red: ' + UI.groups.preview.children.length);
      assert(!UI.App.sel, 'the selection moved into the box');
      rfHTOk(); await idle(); await wait(30);
      assert(!UI.hasPM(), 'PM closed');
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'deleteBody' && f.name === 'Body-Delete/Keep1' && !f.keep && f.bodies.length === 1 && f.bodies[0].at, 'feature: ' + JSON.stringify(f));
      assert(!UI.App.build.errors[f.id] && !(UI.App.build.warnings || {})[f.id], 'no error / warning');
      assert(UI.App.build.bodies.length === 1, 'one body left: ' + UI.App.build.bodies.length);
      near(rfHTVol(), rfHTB, 1e-5, 'the holed block left');
      assert(rfHTTree('Body-Delete/Keep1'), 'Body-Delete/Keep1 in the FeatureManager tree');
      assert(UI.App.model.features.length === n0 + 1 && UI.App.undo.length === u0 + 1, 'one feature, one undo step');
      await UI.suppressFeature([f.id]); await idle();
      assert(UI.App.build.bodies.length === 2, 'suppressed: both bodies back');
      near(rfHTVol(), rfHTA + rfHTB, 1e-5, 'both blocks');
      await UI.unsuppressFeature([f.id]); await idle();
      assert(UI.App.build.bodies.length === 1, 'unsuppressed: one body');
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
      return 'left ' + fmt(rfHTVol()) + ' in³';
    });

    step('rfHT: Insert ▸ Features ▸ Delete/Keep Body opens it empty; Keep Bodies, a click on the holed block, ✓: only that block; Edit Feature reopens it (Keep Bodies, the body listed); the Solid Bodies row + Delete opens it with that body', async function () {
      var errs0 = errors.length;
      await rfHTPart();
      var rows = menuRows('Features ▸ Delete/Keep Body');
      assert(rows.length === 1 && /Insert/.test(rows[0].menu), 'one Insert row: ' + JSON.stringify(rows.map(function (r) { return r.menu + ' / ' + r.text; })));
      rows[0].row.click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Delete/Keep Body', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      assert(!rfHTItems().length, 'opens empty');
      var keep = D.querySelector('#pm input[data-key="type:keep"]');
      assert(keep, 'Keep Bodies option'); keep.click(); await wait(20);
      assert(UI.pmSpec().values.type === 'keep', 'Keep Bodies chosen');
      rfHTClick(rfHTScr([4.8, 0.2, 0.5])); await idle(); await wait(30);
      var items = rfHTItems();
      assert(items.length === 1 && /Boss-Extrude2/.test(items[0]), 'the holed block listed: ' + items.join(', '));
      assert(UI.groups.preview.children.length === 1, 'the other block red: ' + UI.groups.preview.children.length);
      rfHTOk(); await idle(); await wait(30);
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'deleteBody' && f.keep === true, 'keep feature: ' + JSON.stringify(f));
      assert(UI.App.build.bodies.length === 1, 'one body');
      near(rfHTVol(), rfHTB, 1e-5, 'the holed block kept');
      UI.editFeature(f); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === f.name, 'editing PM: ' + (UI.hasPM() && UI.pmTitle()));
      assert(D.querySelector('#pm input[data-key="type:keep"]').checked, 'Keep Bodies on edit');
      items = rfHTItems();
      assert(items.length === 1 && /Boss-Extrude2/.test(items[0]), 'listed on edit: ' + items.join(', '));
      UI.pmCancel(); await idle();
      // the Solid Bodies folder row, then Delete
      UI.App.model.features.pop(); await UI.rebuild(); await idle(); UI.refreshTree(); await wait(30);
      assert(UI.App.build.bodies.length === 2, 'two bodies again');
      var row = D.querySelector('#tree .ti[data-body="1"]');
      if (!row) { var fold = D.querySelector('#tree .bodies-folder'); if (fold) fold.click(); await wait(20); row = D.querySelector('#tree .ti[data-body="1"]'); }
      assert(row, 'the Solid Bodies row of body 2');
      row.click(); await wait(20);
      assert(UI.App.sel && UI.App.sel.kind === 'body' && UI.App.sel.index === 1, 'body 2 selected from the tree');
      rfHTKey('Delete'); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Delete/Keep Body', 'PM from the tree row');
      items = rfHTItems();
      assert(items.length === 1 && /Boss-Extrude2/.test(items[0]), 'tree body listed: ' + items.join(', '));
      UI.pmCancel(); await idle();
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
      return 'ok';
    });
  })();
