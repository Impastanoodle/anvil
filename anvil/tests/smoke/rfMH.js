  // ---- rfMH (2026-11-12, lane progress): one progress service for everything the user waits on (ui-progress.js). The
  // user, after major freezes on big imported models: "we need a loading bar where applicable". A bar in the status bar
  // for every operation that outlasts its delay, a card in the middle of the graphics area for one that blocks the
  // document, Cancel / Esc, nesting, nothing left on screen. Timing by counting (UI.progress.listen) and conditions.
  function rfMHel() { return { st: $('pg-status'), card: $('pg-card') }; }
  function rfMHshown(e) { return !!e && !e.hidden && e.offsetWidth > 0; }
  function rfMHclean(where) {
    var e = rfMHel(), act = UI.progress.active();
    assert(!act.length, where + ': handles left open: ' + act.map(function (a) { return a.title; }).join(', '));
    assert(!rfMHshown(e.st) && !rfMHshown(e.card), where + ': a bar or card is still on screen');
    assert(!$('viewport').classList.contains('pg-wait'), where + ': the wait cursor is still on');
  }
  // resolves when cond() is true (checked after each frame / 20 ms), fails after ms
  async function rfMHuntil(cond, ms, what) {
    var t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > (ms || 5000)) fail('timed out waiting for ' + (what || 'a condition'));
      await UI.progress.paint();
    }
  }
  function rfMHflush() { return UI.progress.paint(); }   // set() writes the DOM once a frame

  step('rfMH: a slow operation shows nothing before its delay, then the status bar and the card with its title, fraction and detail (aria progressbar); a bar at the end closes at once', async function () {
    UI.progress.reset();
    var log = [], off = UI.progress.listen(function (ev) { log.push({ type: ev.type, title: ev.title, at: performance.now() }); });
    var h;
    try {
      var t0 = performance.now();
      h = UI.progress.begin('rfMH slow', { card: true, delay: 150 });
      h.set(0, 'Step 1 of 4: Boss-Extrude1');
      var e = rfMHel();
      assert(!rfMHshown(e.st) && !rfMHshown(e.card), 'shown before its delay');
      assert(UI.progress.active().length === 1 && UI.progress.active()[0].shown === false, 'active() lists it as not shown yet');
      // a timed chain of steps, as a slow operation reports them
      for (var i = 1; i <= 3; i++) { await new Promise(function (r) { W.setTimeout(r, 60); }); h.set(i / 4, 'Step ' + (i + 1) + ' of 4: Cut-Extrude' + i); }
      await rfMHuntil(function () { return rfMHshown(rfMHel().st); }, 3000, 'the bar to show');
      var shown = log.filter(function (x) { return x.type === 'show'; })[0];
      assert(shown && shown.at - t0 >= 145, 'shown after ' + (shown && Math.round(shown.at - t0)) + ' ms, before the 150 ms delay');
      await rfMHflush();
      e = rfMHel();
      assert(rfMHshown(e.card), 'no card for a card operation');
      assert(e.st.getAttribute('role') === 'progressbar' && e.st.getAttribute('aria-valuenow') === '75', 'status bar aria-valuenow ' + e.st.getAttribute('aria-valuenow'));
      assert(e.st.querySelector('.pg-name').textContent === 'rfMH slow' && e.st.querySelector('.pg-pct').textContent === '75 %', 'status bar text: ' + e.st.textContent);
      assert(e.card.querySelector('.pg-title').textContent === 'rfMH slow', 'card title: ' + e.card.querySelector('.pg-title').textContent);
      assert(e.card.querySelector('.pg-detail').textContent === 'Step 4 of 4: Cut-Extrude3', 'card detail: ' + e.card.querySelector('.pg-detail').textContent);
      var tr = e.card.querySelector('.pg-track');
      assert(tr.getAttribute('role') === 'progressbar' && tr.getAttribute('aria-valuenow') === '75', 'card bar aria');
      near(parseFloat(e.card.querySelector('.pg-fill').style.width), 75, 0.5, 'card fill %');
      assert(e.card.querySelector('.pg-cancel').hidden, 'Cancel shows on an operation that cannot be cancelled');
      assert($('viewport').classList.contains('pg-wait') && W.getComputedStyle(UI.renderer.domElement).cursor === 'wait', 'no wait cursor over the graphics area');
      // the card sits in the middle of the graphics area
      var vr = $('viewport').getBoundingClientRect(), cr = e.card.getBoundingClientRect();
      near((cr.left + cr.right) / 2, (vr.left + vr.right) / 2, 2, 'card centre x'); near((cr.top + cr.bottom) / 2, (vr.top + vr.bottom) / 2, 2, 'card centre y');
      // an unknown amount: the moving bar, no percent, no aria-valuenow
      h.set(null, 'Working it out');
      await rfMHflush();
      assert(e.st.querySelector('.pg-track').classList.contains('busy') && e.st.querySelector('.pg-pct').textContent === '' && !e.st.hasAttribute('aria-valuenow'), 'indeterminate bar');
      h.set(1, 'Done');
      h.done();
      rfMHclean('after done (at once, no frame)');
      // a quick operation never flashes a bar
      var q = UI.progress.begin('rfMH quick'); q.set(0.5); q.done();
      await rfMHflush();
      assert(!log.some(function (x) { return x.type === 'show' && x.title === 'rfMH quick'; }), 'a quick operation showed a bar');
    } finally { off(); if (h) h.done(); UI.progress.reset(); }
    rfMHclean('end');
    return 'shown after ' + Math.round(log.filter(function (x) { return x.type === 'show'; })[0].at - log[0].at) + ' ms';
  });

  step('rfMH: Cancel and Esc set cancelled() (or call the cancel function); Esc goes no further', async function () {
    UI.progress.reset();
    var a, b, called = 0;
    try {
      a = UI.progress.begin('rfMH cancellable', { card: true, delay: 0, cancel: true });
      await rfMHflush();
      var btn = rfMHel().card.querySelector('.pg-cancel');
      assert(!btn.hidden && btn.offsetWidth > 0, 'no Cancel button');
      assert(!a.cancelled(), 'cancelled before any press');
      btn.click();
      assert(a.cancelled(), 'Cancel did not set cancelled()');
      a.done();
      b = UI.progress.begin('rfMH esc', { card: true, delay: 0, cancel: function () { called++; } });
      await rfMHflush();
      var ev = new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }), reached = 0;
      var spy = function () { reached++; };
      D.addEventListener('keydown', spy);
      try { D.body.dispatchEvent(ev); } finally { D.removeEventListener('keydown', spy); }
      assert(called === 1 && b.cancelled(), 'Esc did not press Cancel (called ' + called + ')');
      assert(ev.defaultPrevented && !reached, 'Esc went on to the page');
      b.done();
      // with no Cancel on the card, Esc is left alone
      var c = UI.progress.begin('rfMH no cancel', { card: true, delay: 0 }), ev2 = new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      D.body.dispatchEvent(ev2);
      c.done();
      assert(!ev2.defaultPrevented, 'Esc was taken by a card without Cancel');
    } finally { if (a) a.done(); if (b) b.done(); UI.progress.reset(); }
    rfMHclean('end');
    return 'Cancel and Esc';
  });

  step('rfMH: handles nest (the newest shows; the card keeps the blocking operation\'s title with the newest as its detail); an operation that throws leaves no bar', async function () {
    UI.progress.reset();
    try {
      var outer = UI.progress.begin('Opening rfmh.step', { card: true, delay: 0 });
      outer.set(null, 'Reading 2.0 MB');
      var inner = UI.progress.begin('Rebuilding', { delay: 0, card: true });   // (the open's first rebuild asks for a card too)
      inner.set(0.5, 'Feature 2 of 4: Cut-Extrude1');
      await rfMHflush();
      var e = rfMHel();
      assert(e.st.querySelector('.pg-name').textContent === 'Rebuilding', 'status bar shows ' + e.st.querySelector('.pg-name').textContent);
      assert(e.card.querySelector('.pg-title').textContent === 'Opening rfmh.step', 'card title ' + e.card.querySelector('.pg-title').textContent);
      assert(e.card.querySelector('.pg-detail').textContent === 'Rebuilding: Feature 2 of 4: Cut-Extrude1', 'card detail ' + e.card.querySelector('.pg-detail').textContent);
      inner.done();
      await rfMHflush();
      assert(e.st.querySelector('.pg-name').textContent === 'Opening rfmh.step' && e.card.querySelector('.pg-detail').textContent === 'Reading 2.0 MB', 'back to the outer handle');
      var act = UI.progress.active();
      assert(act.length === 1 && act[0].title === 'Opening rfmh.step' && act[0].fraction === null && act[0].text === 'Reading 2.0 MB' && act[0].startedAt > 0, 'active(): ' + JSON.stringify(act));
      assert(JSON.stringify(W.anvil.progress()) === JSON.stringify(act), 'anvil.progress() is UI.progress.active()');
      outer.done();
      rfMHclean('nested');
      // run(): a throw closes its handle (sync and async)
      var threw = false;
      try { UI.progress.run('rfMH throws', function () { throw new Error('rfMH boom'); }, { delay: 0, card: true }); } catch (err) { threw = /boom/.test(err.message); }
      assert(threw, 'run did not pass the error on');
      rfMHclean('sync throw');
      var rej = false;
      await UI.progress.run('rfMH rejects', function () { return Promise.reject(new Error('rfMH async boom')); }, { delay: 0, paint: true }).catch(function () { rej = true; });
      assert(rej, 'run did not pass the rejection on');
      rfMHclean('async throw');
      // a caller that forgot try / finally: the window error listener closes the handle begun in the task that threw
      UI.progress.begin('rfMH forgot', { delay: 0, card: true });
      assert(UI.progress.closeOrphans(false) === 1, 'the orphan was not closed');
      rfMHclean('orphan');
      // ... but not one begun in an earlier task (another operation still running)
      var keep = UI.progress.begin('rfMH other', { delay: 0 });
      await rfMHflush();
      assert(UI.progress.closeOrphans(false) === 0, 'an older handle was closed');
      keep.done();
    } finally { UI.progress.reset(); }
    rfMHclean('end');
    return 'nested, throws';
  });

  step('rfMH: a real rebuild of a 40-feature part reports per-feature progress in order (worker) and ends at 100 %', async function () {
    UI.progress.reset();
    var code = 'p.units("mm");\np.box(200, 100, 10);\n';
    for (var i = 0; i < 19; i++) code += 'p.hole("Top", ' + (10 + i * 10) + ', -50, 4, { offset: 10 });\n';
    var sets = [], off = UI.progress.listen(function (ev) { if (ev.title === 'Rebuilding' && ev.type === 'set') sets.push({ f: ev.fraction, t: ev.text }); });
    try {
      assert(UI.App.workerOn, 'the rebuild worker is off');
      await W.anvil.run(code);
      await idle();
      var n = UI.App.model.features.length;
      assert(n >= 40, 'the part has ' + n + ' features');
      // the open's rebuild: everything up to its first 100 % (a later coalesced rebuild starts again)
      var end = -1;
      for (var q = 0; q < sets.length && end < 0; q++) if (sets[q].f === 1) end = q;
      assert(end >= 0, 'never reached 100 %: ' + sets.slice(-3).map(function (s) { return s.f + ' ' + s.t; }).join(' | '));
      sets = sets.slice(0, end + 1);
      var feats = sets.filter(function (s) { return /^Feature \d+ of \d+/.test(s.t || ''); });
      assert(feats.length >= n - 2, 'only ' + feats.length + ' feature steps reported for ' + n + ' features: ' + sets.slice(0, 5).map(function (s) { return s.t; }).join(' | '));
      var last = null, bad = [];
      feats.forEach(function (s) {
        var m = /^Feature (\d+) of (\d+)/.exec(s.t), k = +m[1];
        if (+m[2] !== n) bad.push('total ' + m[2]);
        if (last != null && k !== last + 1) bad.push(k + ' after ' + last);
        last = k;
      });
      assert(!bad.length, 'out of order: ' + bad.slice(0, 5).join(', '));
      assert(last === n, 'the last feature reported is ' + last + ' of ' + n);
      assert(/Cut-Extrude|Hole|Sketch/.test(feats[feats.length - 1].t), 'no feature name: ' + feats[feats.length - 1].t);
      for (var j = 1; j < sets.length; j++) if (sets[j].f != null && sets[j - 1].f != null && sets[j].f < sets[j - 1].f) fail('fraction went back: ' + sets[j - 1].f + ' -> ' + sets[j].f);
    } finally { off(); }
    rfMHclean('end');
    return sets.length + ' steps for ' + UI.App.model.features.length + ' features';
  });

  step('rfMH: opening a STEP file shows the card before the work starts; an export shows its card and closes; under the Mastercam profile the bar sits in its status bar', async function () {
    UI.progress.reset();
    var heavy0 = UI.progress.heavyAt.tris, prof = UI.Profiles.active ? UI.Profiles.active() : 'solidworks', got = [];
    try {
      await W.anvil.run('p.units("mm");\np.box(30, 20, 10);\n');
      await idle();
      var stepText = W.Exchange.exportSTEP(UI.App.model, UI.App.build, { fileName: 'rfmh.step' });
      var model0 = UI.App.model;
      var p = UI.openFileData('rfmh.step', stepText);
      // before any work: the card is up and painted-to-be, the document not touched yet
      var s = UI.progress.shown();
      assert(s.card && s.cardTitle === 'Opening rfmh.step', 'no card at once: ' + JSON.stringify(s));
      assert(rfMHshown(rfMHel().card) && UI.App.model === model0, 'the import started before the card showed');
      await p;
      await idle();
      assert(UI.App.model !== model0 && UI.App.model.features.some(function (f) { return f.type === 'import'; }), 'the STEP file did not open');
      rfMHclean('after the open');
      got.push('open');
      // an export on a big part (heavyAt lowered so this part counts): the card first, then the file, then nothing
      UI.progress.heavyAt.tris = 0;
      var n0 = (W.__downloads || []).length, seen = [], off = UI.progress.listen(function (ev) { if (ev.type === 'show') seen.push(ev.title); });
      try {
        UI.fileSaveAs('stl');
        assert(modalOpen(), 'no Save As dialog');
        clickModalButton('Save');
        assert(UI.progress.shown().card && /^Exporting .*\.stl$/.test(UI.progress.shown().cardTitle || ''), 'no export card: ' + JSON.stringify(UI.progress.shown()));
        await rfMHuntil(function () { return !UI.progress.active().length; }, 10000, 'the export to finish');
      } finally { off(); UI.progress.heavyAt.tris = heavy0; }
      assert(W.__downloads.length === n0 + 1 && /\.stl$/.test(W.__downloads[n0].name), 'no STL saved');
      assert(seen.some(function (t) { return /^Exporting/.test(t); }), 'the export card never showed');
      rfMHclean('after the export');
      got.push('export');
      // Mastercam: the bar is inside the blue status bar, readable on it
      UI.Profiles.set('mastercam');
      var h = UI.progress.begin('rfMH Mastercam', { delay: 0 });
      h.set(0.4, 'Mastercam');
      await rfMHflush();
      var st = rfMHel().st, sb = $('statusbar').getBoundingClientRect(), r = st.getBoundingClientRect();
      assert(rfMHshown(st) && st.parentNode === $('statusbar'), 'no bar in the Mastercam status bar');
      assert(r.top >= sb.top - 0.5 && r.bottom <= sb.bottom + 0.5 && r.right <= sb.right + 0.5 && r.width >= 120, 'the bar does not sit in the status bar: ' + JSON.stringify([r.top, r.bottom, r.width, sb.top, sb.bottom]));
      var cs = W.getComputedStyle(st), blueText = W.getComputedStyle(D.documentElement).getPropertyValue('--mc-blue-text').trim();
      assert(blueText && cs.color === W.getComputedStyle($('status-msg')).color, 'bar text ' + cs.color + ' is not the status bar\'s text colour');
      h.done();
      got.push('mastercam');
    } finally { UI.progress.heavyAt.tris = heavy0; UI.Profiles.set(prof || 'solidworks'); UI.progress.reset(); if (modalOpen()) UI.closeModal(); }
    rfMHclean('end');
    return got.join(', ');
  });

  step('rfMH: the Windows app\'s update progress (stand-in source) runs through the bar and closes at its end', async function () {
    UI.progress.reset();
    var fn = null, src = { onUpdate: function (f) { fn = f; return function () { fn = null; }; } };
    var off = UI.initUpdateProgress(src);
    try {
      assert(typeof fn === 'function', 'not subscribed');
      fn({ stage: 'copy', read: 10 * 1048576, total: 40 * 1048576, version: '9.9.9', end: false });
      var a = UI.progress.active();
      assert(a.length === 1 && a[0].title === 'Copying the update (Anvil 9.9.9)' && Math.abs(a[0].fraction - 0.25) < 1e-9 && a[0].text === '10.0 MB of 40.0 MB', 'copy: ' + JSON.stringify(a));
      fn({ stage: 'verify', read: 40 * 1048576, total: 40 * 1048576, version: '9.9.9', end: false });
      a = UI.progress.active();
      assert(a.length === 1 && /^Checking the update copy/.test(a[0].title) && a[0].fraction === 1, 'verify: ' + JSON.stringify(a));
      fn({ stage: 'verify', read: 1, total: 1, version: '9.9.9', end: true });
    } finally { if (off) off(); UI.progress.reset(); }
    rfMHclean('end');
    return 'copy, verify, end';
  });

  step('rfMH: Edit > Rebuild takes the card as Ctrl+B does; a big main-thread rebuild paints its card before the work; Flatten / Fold on a big part show their card and keep toggleFlatten\'s boolean', async function () {
    UI.progress.reset();
    var heavy0 = { tris: UI.progress.heavyAt.tris, features: UI.progress.heavyAt.features }, worker0 = UI.App.workerOn, got = [];
    try {
      await W.anvil.run('p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();');
      await idle();
      // Edit > Rebuild (the Quick Access and ribbon Rebuild run this row): the worker rebuild with a card
      var rows = menuRows('Rebuild').filter(function (r) { return /^\s*Rebuild/.test(r.text) && r.menu.indexOf('Edit') >= 0; });
      assert(rows.length, 'no Edit > Rebuild row');
      rows[0].row.click();
      if (UI.closeMenus) UI.closeMenus();
      assert(UI.progress.active().some(function (a) { return a.title === 'Rebuilding' && a.card; }), 'Edit > Rebuild has no card handle: ' + JSON.stringify(UI.progress.active()));
      await idle();
      rfMHclean('after Edit > Rebuild');
      got.push('menu');
      // the main thread (worker off) on a model counted as big: the card first, then the same build
      UI.setWorkerOn(false);
      UI.progress.heavyAt.features = 0;
      var b0 = UI.App.build, p = UI.rebuild({ card: true });
      assert(!p.applied && UI.App.build === b0, 'a big main-thread rebuild ran before its card painted');
      assert(UI.progress.shown().card && UI.progress.shown().cardTitle === 'Rebuilding' && rfMHshown(rfMHel().card), 'no Rebuilding card before the work');
      var b1 = await p;
      assert(b1 === UI.App.build && b1 !== b0, 'the rebuild did not run');
      rfMHclean('after the main-thread rebuild');
      var q = UI.rebuild();
      assert(q.applied, 'a rebuild without card stopped being synchronous');
      await q;
      got.push('main thread');
      UI.setWorkerOn(worker0);
      // Flatten / Fold: the card on a big part, toggleFlatten's boolean through the Promise; UI.toggleFlatten still sync
      UI.progress.heavyAt.tris = 0;
      var f = UI.flattenWithBar(true);
      assert(f && typeof f.then === 'function' && UI.progress.shown().cardTitle === 'Flattening' && !UI.App.model.flatState, 'no Flattening card before the work');
      assert((await f) === true && UI.App.model.flatState, 'did not flatten');
      await idle();
      rfMHclean('after Flatten');
      var g = UI.flattenWithBar(false);
      assert(UI.progress.shown().cardTitle === 'Folding', 'no Folding card');
      assert((await g) === true && !UI.App.model.flatState, 'did not fold');
      await idle();
      UI.progress.heavyAt.tris = heavy0.tris; UI.progress.heavyAt.features = heavy0.features;
      assert(UI.flattenWithBar(true) === true && UI.App.model.flatState, 'a small part: not the plain boolean at once');
      assert(UI.toggleFlatten(false) === true && !UI.App.model.flatState, 'UI.toggleFlatten lost its boolean');
      await idle();
      got.push('flatten');
    } finally {
      UI.progress.heavyAt.tris = heavy0.tris; UI.progress.heavyAt.features = heavy0.features;
      UI.setWorkerOn(worker0); await idle(); UI.progress.reset();
    }
    rfMHclean('end');
    return got.join(', ');
  });
