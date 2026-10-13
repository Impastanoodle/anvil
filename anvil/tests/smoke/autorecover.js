  // ---- AutoRecover, save prompts, Zoom to Fit, narrow window (bent-channel items 5, 11, 18; complex-sketch 8, 10, 12)
  // the "Save changes to …?" box, when it is the one showing: Don't Save
  function dontSaveIfAsked() { if (modalOpen() && /Save changes to/.test($('modal-body').textContent)) clickModalButton("Don't Save"); }
  function recoverCopy() { try { return JSON.parse(W.localStorage.getItem('anvil.recover')); } catch (e) { return null; } }
  step('autorecover: an edit makes the document dirty ("Dirty1 *", a recovery copy kept); undo to the opened state, Save and a plain rebuild leave it clean', async function () {
    await anvil.newPart('Dirty1'); await idle();
    assert(!UI.isDirty() && !$('doc-title').classList.contains('dirty') && recoverCopy() == null, 'a new part is not dirty');
    await anvil.append('p.box(10, 10, 10);'); await idle();
    assert(UI.isDirty() && $('doc-title').classList.contains('dirty'), 'not dirty after an edit');
    var star = W.getComputedStyle($('doc-title'), '::after').content;
    assert(/\*/.test(star) && $('doc-title').textContent === 'Dirty1' && D.title === 'Dirty1 * - Anvil', 'title star: ' + star + ' / ' + D.title);
    var rec = recoverCopy();
    assert(rec && rec.name === 'Dirty1' && rec.model.features.length === 2 && rec.savedAt > 0 && rec.drawing === null, 'recovery copy: ' + JSON.stringify(rec && { name: rec.name, n: rec.model.features.length }));
    assert(anvil.summary().dirty === true, 'summary().dirty');
    await UI.undo(); await idle();
    assert(!UI.isDirty() && recoverCopy() == null && D.title === 'Dirty1 - Anvil', 'undo back to the opened state is clean, copy dropped');
    await UI.redo(); await idle();
    assert(UI.isDirty() && recoverCopy(), 'redo is dirty again');
    UI.fileSave();
    assert(modalOpen(), 'Save asks for a name');
    D.querySelector('#modal-body input').value = 'SmokeDirty1';
    clickModalButton('OK');
    assert(!UI.isDirty() && recoverCopy() == null && UI.App.fileName === 'SmokeDirty1' && !$('doc-title').classList.contains('dirty'), 'Save cleared it');
    await UI.rebuild(); await idle();
    assert(!UI.isDirty(), 'a rebuild with no change made the saved part dirty');
    forgetDocs(['SmokeDirty1']);
    return D.title;
  });
  step('autorecover: start-up offers unsaved work ("Anvil found unsaved work from …: Dirty2") — Recover opens it still unsaved, Discard deletes the copy; a copy equal to the open part is not offered', async function () {
    await anvil.newPart('Dirty2'); await idle();
    await anvil.append('p.box(12, 8, 4);'); await idle();
    var raw = W.localStorage.getItem('anvil.recover');
    assert(raw, 'no recovery copy');
    await anvil.newPart('Other'); await idle();
    assert(recoverCopy() == null, 'New dropped the copy');
    // Recover (UI.offerRecovery is what boot runs once the start-up part is up)
    W.localStorage.setItem('anvil.recover', raw);
    assert(UI.offerRecovery() === true && modalOpen(), 'no Document Recovery dialog');
    var txt = $('modal-body').textContent;
    assert(/Anvil found unsaved work from .+: Dirty2/.test(txt), 'dialog text: ' + txt);
    clickModalButton('Recover');
    await idle(); await wait(30); await idle();
    var s = anvil.summary();
    assert(s.name === 'Dirty2' && s.features === 2 && Math.abs(s.volume - 384) < 1e-6, 'recovered: ' + JSON.stringify({ name: s.name, f: s.features, v: s.volume }));
    assert(UI.isDirty() && recoverCopy() && recoverCopy().name === 'Dirty2', 'the recovered part is still unsaved, its copy kept');
    // Discard
    await anvil.newPart('Other'); await idle();
    W.localStorage.setItem('anvil.recover', raw);
    assert(UI.offerRecovery() === true && modalOpen(), 'dialog for Discard');
    clickModalButton('Discard');
    assert(!modalOpen() && recoverCopy() == null && anvil.summary().name === 'Other', 'Discard kept the open part and deleted the copy');
    // the copy matches the open document: dropped without asking
    await anvil.append('p.box(1, 1, 1);'); await idle();
    var same = W.localStorage.getItem('anvil.recover');
    UI.markClean(); W.localStorage.setItem('anvil.recover', same);
    assert(UI.offerRecovery() === false && !modalOpen() && recoverCopy() == null, 'a copy of the open part was offered');
    return txt;
  });
  step('autorecover: File ▸ New, File ▸ New ▸ Part and Open with unsaved changes ask "Save changes to Keep1?" — Cancel keeps the part, Don\'t Save goes on, Save saves first; the page warns before unload', async function () {
    await anvil.newPart('Keep1'); await idle();
    await anvil.append('p.box(5, 5, 5);'); await idle();
    UI.fileNew();
    clickModalButton('New part');
    assert(modalOpen() && /Save changes to Keep1\?/.test($('modal-body').textContent), 'no save prompt: ' + $('modal-body').textContent);
    var btns = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (b) { return b.textContent; }).join('|');
    assert(btns === "Save|Don't Save|Cancel", 'buttons ' + btns);
    clickModalButton('Cancel');
    await idle();
    assert(!modalOpen() && anvil.summary().name === 'Keep1' && anvil.summary().features === 2 && UI.isDirty(), 'Cancel did not keep the part');
    // the page asks before it is closed or reloaded while dirty
    var ev = new W.Event('beforeunload', { cancelable: true });
    W.dispatchEvent(ev);
    assert(ev.defaultPrevented, 'beforeunload not cancelled with unsaved changes');
    UI.fileOpen();
    assert(/Save changes to Keep1\?/.test($('modal-body').textContent), 'Open did not ask');
    clickModalButton('Cancel');
    assert(!modalOpen() && anvil.summary().name === 'Keep1', 'Open ▸ Cancel');
    // File ▸ New ▸ Part (menu): Save, named in the prompt, then the new part
    var p = UI.newPart();
    assert(/Save changes to Keep1\?/.test($('modal-body').textContent), 'New ▸ Part did not ask');
    clickModalButton('Save');
    assert(modalOpen() && D.querySelector('#modal-body input'), 'Save asks for a name');
    D.querySelector('#modal-body input').value = 'SmokeKeep1';
    clickModalButton('OK');
    await p; await idle();
    var files = JSON.parse(W.localStorage.getItem('anvil.files') || '{}');
    assert(files.SmokeKeep1 && files.SmokeKeep1.model.features.length === 2, 'not saved before New');
    assert(anvil.summary().name === 'Part1' && anvil.summary().features === 0 && !UI.isDirty() && recoverCopy() == null, 'new part after Save');
    ev = new W.Event('beforeunload', { cancelable: true });
    W.dispatchEvent(ev);
    assert(!ev.defaultPrevented, 'beforeunload cancelled with nothing unsaved');
    // a clean document goes straight on
    UI.fileNew(); clickModalButton('New part'); await idle();
    assert(!modalOpen(), 'a clean part asked to save');
    // Don't Save
    await anvil.append('p.box(3, 3, 3);'); await idle();
    p = UI.newPart('Fresh');
    clickModalButton("Don't Save");
    await p; await idle();
    assert(anvil.summary().name === 'Fresh' && anvil.summary().features === 0 && !UI.isDirty(), "Don't Save");
    assert(typeof UI.confirmDiscard === 'function', 'UI.confirmDiscard (Close Drawing) missing');
    forgetDocs(['SmokeKeep1']);
    return btns;
  });
  step('view: Zoom to Fit in a sketch keeps the geometry and the dimension labels inside the graphics area with a margin', async function () {
    await rskNew();
    var f = UI.activeSketchFeature(), showDims = UI.App.view.showDims;
    UI.setTool('line'); rskClick([0, 0]); rskClick([60, 0]); rskClick([60, 40]); rskClick([0, 40]); rskClick([0, 0]);
    UI.setTool('select');
    // labels well away from the geometry (25 mm off a 60 × 40 rectangle)
    f.dims = [{ e: 0, k: 'len', off: -25 }, { e: 1, k: 'len', off: 25 }, { e: 2, k: 'len', off: -25 }, { e: 3, k: 'len', off: 25 }];
    UI.updateSketches();
    UI.zoomView(0.3); UI.finishViewAnimation();
    UI.zoomToFit(); UI.finishViewAnimation();
    r4Dims();
    var vr = $('viewport').getBoundingClientRect(), w = vr.width, h = vr.height;
    var texts = Array.prototype.filter.call(D.querySelectorAll('#dim-layer g.dim text'), function (t) { return t.getBoundingClientRect().width > 0; });
    assert(texts.length >= 4, texts.length + ' labels drawn');
    var bad = [], m = Math.min(w, h) * 0.03;
    texts.forEach(function (t) { var r = t.getBoundingClientRect(); if (r.left - vr.left < m || r.top - vr.top < m || r.right - vr.left > w - m || r.bottom - vr.top > h - m) bad.push(t.textContent + ' @ ' + Math.round(r.left - vr.left) + ',' + Math.round(r.top - vr.top)); });
    assert(!bad.length, 'labels at the edge of a ' + Math.round(w) + ' × ' + Math.round(h) + ' view: ' + bad.join('; '));
    var pl = UI.activePlane(), gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
    [[0, 0], [60, 0], [60, 40], [0, 40]].forEach(function (q) { var s = UI.worldToScreen(K.to3D(pl, q[0], q[1])); gx0 = Math.min(gx0, s[0]); gx1 = Math.max(gx1, s[0]); gy0 = Math.min(gy0, s[1]); gy1 = Math.max(gy1, s[1]); });
    assert(gx0 > w * 0.08 && gx1 < w * 0.92 && gy0 > h * 0.08 && gy1 < h * 0.92, 'geometry margin: ' + [gx0, gy0, gx1, gy1].map(Math.round).join(','));
    UI.App.view.showDims = showDims;
    UI.exitSketch(true); await idle();
    return 'geometry ' + [gx0, gy0, gx1, gy1].map(Math.round).join(',') + ' in ' + Math.round(w) + ' × ' + Math.round(h);
  });
  step('view: F zooms to fit right after OK in a PropertyManager (and with a check box focused)', async function () {
    await anvil.run('p.box(40, 30, 20);'); await idle();
    UI.cmdPlane(); await idle();
    assert(UI.hasPM(), 'Plane PM');
    var ok = D.querySelector('#pm .pm-ok');
    assert(ok, 'no ✓ button');
    ok.focus(); ok.click(); await idle();
    assert(!UI.hasPM(), 'the PM stayed open');
    UI.zoomView(0.1); UI.finishViewAnimation();
    var s0 = UI.cam.scale, t = D.activeElement || D.body;
    t.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }));
    UI.finishViewAnimation();
    assert(UI.cam.scale > s0 * 3, 'F did not fit after OK (focus on ' + t.tagName + '): ' + s0 + ' → ' + UI.cam.scale);
    // a focused check box does not take F (it keeps Space)
    var cb = D.createElement('input'); cb.type = 'checkbox'; $('tp-strip').appendChild(cb); cb.focus();
    UI.zoomView(0.1); UI.finishViewAnimation();
    var s1 = UI.cam.scale;
    cb.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'F', bubbles: true, cancelable: true }));
    UI.finishViewAnimation();
    cb.remove();
    assert(UI.cam.scale > s1 * 3, 'F with a check box focused: ' + s1 + ' → ' + UI.cam.scale);
    // a text box still keeps its letters
    var tx = $('cmd-search'); tx.focus();
    UI.zoomView(0.5); UI.finishViewAnimation();
    var s2 = UI.cam.scale;
    tx.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }));
    tx.blur();
    assert(UI.cam.scale === s2, 'F typed into Search Commands zoomed');
    UI.zoomToFit(); UI.finishViewAnimation();
    return 'scale ' + s0.toFixed(4) + ' → fit';
  });
  step('api: anvil.dxfFlat() / flat() during a rebuild say "rebuild in progress" (summary().rebuilding); the Async forms wait and match the finished build', async function () {
    await anvil.run(P9_LB + '\np.flange(1.5, [[0, 0.06, 1.5]]);'); await idle();
    var before = anvil.flat().size.slice();
    UI.pushUndo();
    UI.App.model.sheet.thickness = 0.075;   // a parameter change, rebuilt in the background
    var p = UI.rebuild();
    if (!UI.rebuildPending()) { await p; return 'main-thread build (worker off): nothing pending to test'; }
    var msg = '';
    try { anvil.dxfFlat(); } catch (e) { msg = e.message; }
    assert(/rebuild in progress/.test(msg), 'dxfFlat during the rebuild: ' + (msg || 'no error'));
    msg = ''; try { anvil.flat(); } catch (e) { msg = e.message; }
    assert(/rebuild in progress/.test(msg), 'flat during the rebuild: ' + (msg || 'no error'));
    assert(anvil.summary().rebuilding === true, 'summary().rebuilding');
    var dxf = await anvil.dxfFlatAsync();
    assert(/SECTION/.test(dxf) && /EOF/.test(dxf), 'dxfFlatAsync text');
    var after = anvil.flat();
    assert(anvil.summary().rebuilding === false && Math.abs(after.size[0] - before[0]) > 1e-6, 'flat after the rebuild: ' + before + ' → ' + after.size);
    return msg;
  });
  step('layout: a 400 px window does not scroll sideways (menu bar fits, the app and the graphics area cannot be scrolled)', async function () {
    await withFrameWidth(400, async function () {
      await wait(60);
      var sw = D.documentElement.scrollWidth;
      assert(sw <= W.innerWidth, 'page ' + sw + ' px wide in a ' + W.innerWidth + ' px window');
      var mr = $('menus').getBoundingClientRect();
      assert(mr.width > 0 && mr.right <= W.innerWidth, 'menus ' + Math.round(mr.right));
      D.scrollingElement.scrollLeft = 80; $('app').scrollLeft = 80; $('viewport').scrollLeft = 80;
      assert(D.scrollingElement.scrollLeft === 0 && $('app').scrollLeft === 0 && $('viewport').scrollLeft === 0, 'scrolled: page ' + D.scrollingElement.scrollLeft + ', app ' + $('app').scrollLeft + ', viewport ' + $('viewport').scrollLeft);
      // the Modify box focused at the right edge of the graphics area moves nothing
      var de = $('dim-edit'), x0 = $('viewport').getBoundingClientRect().left;
      de.hidden = false; de.style.left = ($('viewport').clientWidth - 20) + 'px'; de.style.top = '60px';
      de.querySelector('input').focus();
      var moved = $('viewport').getBoundingClientRect().left - x0 || D.scrollingElement.scrollLeft || $('viewport').scrollLeft;
      de.querySelector('input').blur(); de.hidden = true; de.style.left = ''; de.style.top = '';
      assert(!moved, 'focusing the Modify box shifted the app ' + moved + ' px');
    });
    return 'ok';
  });
