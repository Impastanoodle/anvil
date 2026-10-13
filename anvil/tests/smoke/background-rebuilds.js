  // ---- background rebuilds (Web Worker)
  step('worker mode is on by default over http and a rebuild goes through the worker', async function () {
    assert(typeof UI.whenIdle === 'function', 'UI.whenIdle() is missing');
    assert(typeof UI.rebuild === 'function', 'UI.rebuild is missing');
    assert(typeof anvil.busy === 'function' && typeof anvil.workerOn === 'function', 'anvil.busy() / anvil.workerOn() are missing');
    assert(UI.App.workerOn === true, 'App.workerOn should default to true over http, got ' + JSON.stringify(UI.App.workerOn));
    assert(anvil.workerOn() === true, 'anvil.workerOn() getter should report true, got ' + JSON.stringify(anvil.workerOn()));
    var p = anvil.run('p.box(10, 20, 30);');
    assert(p && typeof p.then === 'function', 'anvil.run must return a Promise, got ' + Object.prototype.toString.call(p));
    // a fast build may already be done before the first poll; busy/status are reported, the final state is asserted
    var sawBusy = !!anvil.busy(), sawStatus = /Rebuilding/.test(statusText());
    for (var i = 0; i < 400 && anvil.busy(); i++) {
      sawBusy = true;
      if (/Rebuilding/.test(statusText())) sawStatus = true;
      await wait(5);
    }
    var s = await p;
    await idle();
    assert(s && typeof s.volume === 'number', 'the promise must resolve to a summary, got ' + JSON.stringify(s));
    near(s.volume, 10 * 20 * 30, 1e-6, 'summary volume from the promise');
    near(anvil.summary().volume, 10 * 20 * 30, 1e-6, 'final volume');
    assert(!anvil.busy(), 'still busy after whenIdle()');
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    return 'busy observed: ' + sawBusy + ', "Rebuilding…" observed: ' + sawStatus + ', rebuild ' + s.rebuildMs + ' ms';
  });
  step('worker off: anvil.run rebuilds synchronously; the setting is persisted', async function () {
    var offVal = null, onVal = null, s;
    anvil.workerOn(false);
    try {
      assert(UI.App.workerOn === false && anvil.workerOn() === false, 'workerOn(false) did not switch the mode off: ' + JSON.stringify(UI.App.workerOn));
      try { offVal = W.localStorage.getItem('anvil.worker'); } catch (e) { }
      var p = anvil.run('p.box(20, 10, 10);');
      near(anvil.summary().volume, 2000, 1e-6, 'volume right after the call, before any await (sync mode)');
      assert(!anvil.busy(), 'busy() should be false right after a synchronous run');
      s = await p;
      near(s.volume, 2000, 1e-6, 'promise summary volume');
    } finally {
      anvil.workerOn(true);
    }
    assert(UI.App.workerOn === true && anvil.workerOn() === true, 'workerOn(true) did not restore the mode');
    try { onVal = W.localStorage.getItem('anvil.worker'); } catch (e) { }
    assert(offVal != null && offVal !== onVal, 'localStorage "anvil.worker" should record the off state: off=' + JSON.stringify(offVal) + ' on=' + JSON.stringify(onVal));
    await idle();
    return 'anvil.worker off=' + JSON.stringify(offVal) + ' on=' + JSON.stringify(onVal);
  });
  step('coalescing: three back-to-back runs settle on the last model', async function () {
    var p1 = anvil.run('p.box(10, 10, 10);');
    var p2 = anvil.run('p.box(20, 10, 10);');
    var p3 = anvil.run('p.box(30, 10, 10);');
    [p1, p2].forEach(function (p) { if (p && typeof p.then === 'function') p.then(null, function () { }); });
    var s3 = await p3;
    await idle();
    assert(!anvil.busy(), 'still busy after whenIdle()');
    var s = anvil.summary();
    near(s.volume, 3000, 1e-6, 'final volume is the third model');
    near(s.bbox.max[0], 30, 1e-6, 'final bbox is the third box');
    near(s3.volume, 3000, 1e-6, 'the third promise resolves to its own summary');
    assert(UI.App.model.features.length === 2, 'features: ' + names().join());
    return 'volume ' + s.volume + ', bbox.max ' + s.bbox.max.map(fmt).join(', ');
  });
  step('menu item "Rebuild in background (Web Worker)" toggles workerOn', async function () {
    var before = UI.App.workerOn;
    function findRow() {
      var lis = D.querySelectorAll('#menus > li');
      for (var i = 0; i < lis.length; i++) {
        lis[i].dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        var mi = D.querySelectorAll('.menu .mi');
        for (var j = 0; j < mi.length; j++) if (mi[j].textContent.indexOf('Rebuild in background') >= 0) return { row: mi[j], menu: lis[i].textContent, chk: (mi[j].querySelector('.chk') || {}).textContent };
      }
      if (UI.closeMenus) UI.closeMenus();
      return null;
    }
    var hit = findRow();
    assert(hit, 'no menu item containing "Rebuild in background" in any menu (' + Array.prototype.map.call(D.querySelectorAll('#menus > li'), function (l) { return l.textContent; }).join(', ') + ')');
    hit.row.click();
    assert(UI.App.workerOn === !before, 'clicking the item should flip workerOn from ' + before + ', got ' + JSON.stringify(UI.App.workerOn));
    var hit2 = findRow();
    assert(hit2, 'menu item vanished after the first toggle');
    hit2.row.click();
    assert(UI.App.workerOn === before, 'second click should restore workerOn = ' + before + ', got ' + JSON.stringify(UI.App.workerOn));
    if (UI.closeMenus) UI.closeMenus();
    await idle();
    return 'in the ' + hit.menu + ' menu; check mark ' + JSON.stringify(hit.chk) + ' → ' + JSON.stringify(hit2.chk);
  });
  step('after a worker build the main-thread cache holds every feature; a sync rebuild reuses all of them', async function () {
    assert(typeof UI.buildCacheInfo === 'function', 'UI.buildCacheInfo is missing');
    anvil.workerOn(true);
    assert(UI.App.workerOn === true, 'worker mode should be on');
    var s = await anvil.run('p.box(30, 20, 10);\np.hole("Top", 15, -10, 6, { offset: 10 });\np.linearPattern({ dir: "x", spacing: 10, count: 2 });');
    await idle();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    var n = UI.App.model.features.length;
    var info = UI.buildCacheInfo();
    assert(info && info.steps === n, 'cache steps ' + JSON.stringify(info) + ' vs ' + n + ' features');
    assert(info.partial === n - 1, 'every step but the last should be partial: ' + JSON.stringify(info));
    var b = await UI.rebuild({ sync: true });
    assert(b && b.reused === n, 'a sync rebuild right after the worker build should reuse all ' + n + ' features, reused ' + JSON.stringify(b && b.reused));
    assert(UI.App.build.reused === n, 'App.build.reused = ' + UI.App.build.reused);
    near(anvil.summary().volume, s.volume, 1e-6, 'volume unchanged by the cached rebuild');
    // the full cache from that sync build carries on: an appended feature only builds itself
    await anvil.append('p.box(5, 5, 5, { at: [100, 0, 0] });');
    await idle();
    var info2 = UI.buildCacheInfo();
    assert(info2.steps === n + 2, 'cache after the append: ' + JSON.stringify(info2) + ' vs ' + (n + 2) + ' features');
    var b2 = await UI.rebuild({ sync: true });
    assert(b2.reused === n + 2, 'unchanged model after the append: reused ' + b2.reused + ' of ' + (n + 2));
    near(anvil.summary().volume, s.volume + 125, 1e-6, 'volume with the cube');
    return 'steps ' + info.steps + ' (' + info.partial + ' partial), sync rebuild reused ' + b.reused + '/' + n;
  });

