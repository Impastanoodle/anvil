  // --- r12/occtui12 ---
  step('r12/occtui12: Tools ▸ OpenCascade kernel ▸ Use OpenCascade / Show the quick result first / Wait for the exact solid / Engine file…, and the same choice in Options (radio buttons); UI.occt.swapMode() remembers it per browser', async function () {
    var swap0 = UI.occt.swapMode(), stored = null;
    try { stored = W.localStorage.getItem('anvil.occtSwap'); } catch (e) { }
    assert(swap0 === (stored === 'wait' ? 'wait' : 'quick'), 'default "quick" unless stored: ' + swap0 + ' / ' + stored);
    try {
      UI.occt.swapMode('wait', { remember: false });
      var rows = menuRows('OpenCascade kernel ▸ ');
      if (UI.closeMenus) UI.closeMenus();
      var labels = rows.map(function (r) { return r.text.replace(/^✓/, ''); });
      assert(rows.length === 4 && rows[0].menu.indexOf('Tools') >= 0, 'four items in Tools: ' + labels.join(' | '));
      var quick = rows.filter(function (r) { return /Show the quick result first/.test(r.text); })[0], waitR = rows.filter(function (r) { return /Wait for the exact solid/.test(r.text); })[0];
      assert(quick && waitR && waitR.chk === '✓' && quick.chk === '', 'wait checked: ' + JSON.stringify(rows.map(function (r) { return r.chk; })));
      var threw = false; try { UI.occt.swapMode('fast'); } catch (e) { threw = true; }
      assert(threw && UI.occt.swapMode() === 'wait', 'an unknown mode is refused');
      UI.openTaskPane('props');
      var rq = D.querySelector('[data-role="occt-swap-quick"]'), rw = D.querySelector('[data-role="occt-swap-wait"]');
      assert(rq && rw && rw.checked && !rq.checked, 'Options radios reflect the mode');
      UI.occt.swapMode('quick', { remember: false });
      UI.openTaskPane('props');
      rq = D.querySelector('[data-role="occt-swap-quick"]');
      assert(rq && rq.checked, 'Options radios follow a change');
      return labels.join(' | ');
    } finally { UI.occt.swapMode(swap0, { remember: false }); if (UI.closeTaskPane) UI.closeTaskPane(); }
  });
  step('r12/occtui12: "Show the quick result first": after an edit Anvil\'s result shows at once (no held frame), then OpenCascade\'s exact solid cross-fades in with the camera and the selected face unchanged (skipped without vendor/occt)', async function () {
    var was = anvil.occt().on, swap0 = UI.occt.swapMode();
    UI.occt.swapMode('quick', { remember: false });
    try {
      if (!await occtDriving(exByName('Spur gear (12 teeth)').code)) return 'skipped: OpenCascade not installed';
      await wait(200);
      var top = faceWithNormal([0, 1, 0]);
      UI.App.sel = { kind: 'face', index: top, point: [10, 8, -10] }; UI.updateHighlights();   // on the hub, clear of the teeth that move
      var cam0 = JSON.stringify(UI.viewPose ? UI.viewPose() : null), fades0 = UI.occt.fades(), t0 = performance.now();
      UI.App.model.features.filter(function (x) { return x.type === 'cpattern'; })[0].n = 11;
      await UI.rebuild();
      var tShown = performance.now() - t0;
      assert(!UI.App.build.occt && !(UI.App.holdFrameUntil > performance.now()) && !UI.occt.rollback().cue, 'Anvil\'s result shown at once, not held');
      await anvil.occtIdle(); await idle();
      for (var k = 0; k < 40 && UI.occt.fades() === fades0; k++) await wait(25);
      assert(UI.App.build.occt, 'OpenCascade\'s solid swapped in');
      assert(UI.occt.fades() > fades0, 'cross-faded');
      var fe = D.querySelector('#viewport canvas.occt-fade'), gl = D.querySelector('#viewport canvas.gl');
      assert(fe && fe.previousSibling === gl && fe.width === gl.width && fe.style.pointerEvents === 'none', 'fade canvas laid over the 3D canvas, under the overlays');
      assert(JSON.stringify(UI.viewPose ? UI.viewPose() : null) === cam0, 'camera unchanged');
      assert(UI.App.sel && UI.App.sel.kind === 'face' && Math.abs(UI.App.mesh.faces[UI.App.sel.index].normal[1] - 1) < 1e-6, 'the top face is still selected: ' + JSON.stringify(UI.App.sel && UI.App.sel.kind));
      for (var j = 0; j < 40 && fe.style.visibility !== 'hidden'; j++) await wait(25);
      assert(fe.style.visibility === 'hidden', 'the fade ends');
      return 'Anvil\'s result after ' + tShown.toFixed(0) + ' ms, exact solid faded in';
    } finally { UI.App.sel = null; UI.occt.swapMode(swap0, { remember: false }); anvil.occt(was, { remember: false }); await idle(); }
  });
  step('r12/occtui12: rebuild feedback: the status chip counts errors / warnings (click: What\'s Wrong), tree rows keep their icon with a red / amber badge and a tooltip, a Dangling sketch is tagged, What\'s Wrong lists both with Go To / Edit and filters', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(-20, -20, 20, 20).extrude(10);'); await idle();
    var ext = UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[0];
    try { await anvil.append('p.sketch({ face: ' + ext.id + ', normal: [0, 1, 0] }).circle(0, 0, 5);\np.sketch("Front").rect(0, 0, 5, 30).extrude(5, { draft: 95 });'); } catch (e) { }
    await idle();
    UI.App.model.features.splice(UI.App.model.features.indexOf(ext), 1);
    await UI.rebuild(); await idle();
    var b = UI.App.build, errId = +Object.keys(b.errors)[0], warnId = +Object.keys(b.warnings)[0];
    assert(errId && warnId && /Dangling/.test(b.warnings[warnId]), 'one error and one Dangling warning: ' + JSON.stringify([b.errors, b.warnings]));
    var chip = D.querySelector('#status-right .rb-chip');
    assert(chip && chip.classList.contains('err') && /1 rebuild error, 1 warning/.test(chip.textContent) && chip.getAttribute('data-act') === 'whatswrong', 'status chip: ' + (chip && chip.outerHTML.slice(0, 120)));
    var er = D.querySelector('#tree .ti[data-fid="' + errId + '"]'), wr = D.querySelector('#tree .ti[data-fid="' + warnId + '"]');
    assert(er && er.querySelector('.rb-badge.err') && /draft/i.test(er.title) && er.classList.contains('err'), 'error row badge / tooltip');
    assert(er.querySelector('.rb-ico svg') && er.querySelector('.rb-ico').innerHTML !== W.Icons('error', 16), 'the feature keeps its own icon');
    assert(wr && wr.querySelector('.rb-badge.warn') && wr.classList.contains('dangling') && wr.querySelector('.rb-tag') && /Edit Sketch Plane/.test(wr.title), 'dangling row');
    assert(D.querySelector('#tree .ti .rb-badge.err'), 'the part is badged');
    chip.click();
    assert(modalOpen() && D.getElementById('whats-wrong'), 'What\'s Wrong opened from the chip');
    var trs = D.querySelectorAll('#whats-wrong tr.ww-row');
    assert(trs.length === 2 && trs[0].classList.contains('error') && trs[1].classList.contains('dangling'), 'two rows, error first: ' + trs.length);
    assert(trs[1].querySelector('.ww-edit') && /Edit Sketch/.test(trs[1].querySelector('.ww-edit').textContent), 'Edit Sketch for the sketch');
    D.querySelector('[data-role="ww-show-warning"]').click();
    assert(D.querySelectorAll('#whats-wrong tr.ww-row').length === 1, 'Show warnings off filters');
    D.querySelector('[data-role="ww-show-warning"]').click();
    D.querySelectorAll('#whats-wrong tr.ww-row')[1].querySelector('.ww-go').click();
    assert(!modalOpen(), 'Go To closes the dialog');
    assert(UI.App.sel && UI.App.sel.kind === 'feature' && UI.App.sel.id === warnId, 'Go To selects the sketch');
    var sel = D.querySelector('#tree .ti.selected');
    assert(sel && sel.getAttribute('data-fid') === String(warnId) && sel.getClientRects().length, 'its row is selected and shown');
    // right-click ▸ What's Wrong?
    er = D.querySelector('#tree .ti[data-fid="' + errId + '"]');
    er.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 300 }));
    var mi = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (x) { return /What's Wrong\?/.test(x.textContent); })[0];
    assert(mi, 'What\'s Wrong? in the feature menu');
    mi.click();
    assert(modalOpen() && D.querySelector('#whats-wrong tr.ww-row.sel[data-id="' + errId + '"]'), 'opened on that feature');
    UI.closeModal();
    return D.querySelector('#status-right .rb-chip').textContent;
  });
  // --- end r12/occtui12 ---
