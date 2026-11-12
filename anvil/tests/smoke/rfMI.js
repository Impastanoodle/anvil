  // ---- rfMI (2026-11-12, lane reports): problem reports the user can hand to Claude (ui-reports.js,
  // reports-watchdog.js). User: "a crash report or not responding report to send to you for fixing". Browser side:
  // breadcrumbs in order, an error report once a minute per error, the watchdog sees a 4 s block of the main thread,
  // report.md has its sections and none of the document's names, Help > Report a Problem makes a manual report, the
  // model only when ticked. The desktop side (stacks, crashes, the folder) is desktop/check.js reports.
  async function rfMIwait(fn, ms, what) {
    var t0 = Date.now();
    for (;;) { var v = fn(); if (v) return v; if (Date.now() - t0 > (ms || 5000)) fail('waited too long for ' + what); await wait(50); }
  }
  function rfMIfrom(mark) { return UI.reports.crumbs().filter(function (c) { return c.at >= mark; }).map(function (c) { return c.text; }); }
  function rfMIindex(list, re, after) { for (var i = after || 0; i < list.length; i++) if (re.test(list[i])) return i; return -1; }
  function rfMIdropErrors(re) { for (var k = errors.length - 1; k >= 0; k--) if (re.test(errors[k])) errors.splice(k, 1); }

  step('rfMI: commands, tools, PropertyManagers, a rebuild, a theme and a profile switch leave breadcrumbs in order', async function () {
    assert(UI.reports && UI.reports.crumb && UI.reports.note && UI.reports.snapshot && UI.reports.make && UI.reports.list, 'the UI.reports API');
    await anvil.run('p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).extrude(0.5);\n');
    await idle();
    var mark = Date.now(), prof = anvil.profile(), theme = UI.theme();
    await wait(5);
    try {
      assert(UI.Commands.run('fillet'), 'Fillet runs from the command registry');
      await rfMIwait(function () { return UI.hasPM(); }, 3000, 'the Fillet PropertyManager');
      UI.pmCancel();
      UI.setTool('select');
      await UI.rebuild(); await idle();
      UI.setTheme(theme === 'dark' ? 'light' : 'dark');
      anvil.profile('mastercam');
      UI.reports.crumb('rfMI marker');
    } finally { anvil.profile(prof); UI.setTheme(theme); await idle(); }
    var c = rfMIfrom(mark);
    var want = [/^command: fillet/, /^PropertyManager open: /, /^PropertyManager cancel: /, /^tool: select/, /^rebuild started/, /^rebuild done in \d+ ms/, /^theme: /, /^interface profile: mastercam/, /^rfMI marker/];
    var at = 0, idx = [];
    want.forEach(function (re) { var i = rfMIindex(c, re, at); assert(i >= 0, 'no crumb ' + re + ' after #' + at + ' in ' + JSON.stringify(c)); idx.push(i); at = i + 1; });
    var snap = UI.reports.snapshot();
    ['interface profile', 'theme', 'engine', 'document', 'features', 'bodies', 'faces', 'triangles', 'sketch entities', 'window', 'GPU', 'operating system', 'running for'].forEach(function (k) { assert(snap[k] != null, 'snapshot has ' + k); });
    assert(/extrude 1/.test(snap.features) && snap.faces >= 6 && snap.triangles >= 12, 'the snapshot counts the part: ' + JSON.stringify(snap));
    return c.length + ' crumbs; order ' + idx.join(' < ');
  });

  step('rfMI: a thrown error and a rejected promise make one error report each, not two within a minute; a quiet status item opens the bar', async function () {
    UI.reports._resetErrors();
    UI.reports.testBars = true;   // the suite's frame shows nothing unless a test asks
    try {
    var n0 = UI.reports.made().length, tag = 'rfMI-' + Date.now().toString(36);
    // the callbacks are made in the app's frame (new W.Function): an exception is reported to the window of its function
    var thrower = new W.Function('tag', 'setTimeout(function () { throw new Error("rfMI thrown " + tag); });');
    thrower(tag);
    await rfMIwait(function () { return UI.reports.made().length >= n0 + 1; }, 3000, 'the error report');
    new W.Function('tag', 'Promise.reject(new Error("rfMI rejected " + tag));')(tag);
    await rfMIwait(function () { return UI.reports.made().length >= n0 + 2; }, 3000, 'the rejection report');
    thrower(tag);   // the same error again: crumb only
    await wait(300);
    var made = UI.reports.made().slice(n0);
    rfMIdropErrors(/rfMI (thrown|rejected)/);
    assert(made.length === 2 && made.every(function (m) { return m.kind === 'error'; }), 'two error reports: ' + JSON.stringify(made.map(function (m) { return m.kind + ' ' + m.summary; })));
    assert(/rfMI thrown/.test(made[0].md) && /rfMI rejected/.test(made[1].md) && /window\.onerror/.test(made[0].md) && /unhandledrejection/.test(made[1].md), 'each report holds its error and how it was caught');
    var thrown = UI.reports.crumbs().filter(function (c) { return /rfMI thrown/.test(c.text); });
    assert(thrown.length === 2, 'the repeat is a breadcrumb only: ' + JSON.stringify(thrown));
    var qi = D.getElementById('rp-status');
    assert(qi && !D.getElementById('rp-bar'), 'no bar for an error, a quiet "Report saved" instead');
    var r = qi.getBoundingClientRect(), sb = $('statusbar').getBoundingClientRect();
    assert(r.width > 20 && Math.abs(r.bottom - sb.bottom) < 2 && r.top >= sb.top - 1, 'the item sits in the status bar: ' + JSON.stringify([r.top, r.bottom, sb.top, sb.bottom]));
    qi.click();
    var bar = D.getElementById('rp-bar');
    assert(bar && /error/.test(bar.textContent) && !D.getElementById('rp-status'), 'the item opens the bar');
    bar.querySelector('[data-rp="dismiss"]').click();
    assert(!D.getElementById('rp-bar'), 'Dismiss closes it');
    var rows = await UI.reports.list();
    assert(rows.length && rows.length <= 10 && rows[0].kind === 'error', 'kept in this browser (IndexedDB, newest 10): ' + rows.length);
    } finally { UI.reports.testBars = false; UI.reports.hide(); }
  });

  step('rfMI: a 4 s block of the main thread is seen by the watchdog and reported with its length within 20 %', async function () {
    var wd = UI.reports.watchdog();
    assert(wd.running && wd.db === 'anvil-reports-test', 'the watchdog worker runs, on the test database: ' + JSON.stringify(wd));
    var f0 = UI.reports.freezes().length;
    UI.reports.crumb('rfMI before the block');
    await wait(400);   // the crumb reaches the worker
    var t = Date.now();
    while (Date.now() - t < 4000) { /* a busy main thread */ }
    var fr = await rfMIwait(function () { var f = UI.reports.freezes(); return f.length > f0 && f[f.length - 1].report ? f[f.length - 1] : null; }, 5000, 'the freeze report');
    assert(Math.abs(fr.ms - 4000) <= 800, 'freeze length ' + fr.ms + ' ms, wanted 4000 ± 20 %');
    var md = fr.report.md;
    assert(/^# Anvil problem report: not-responding/.test(md) && /stopped responding for \d(\.\d)? s/.test(md), 'the report says how long: ' + md.split('\n').slice(0, 8).join(' / '));
    assert(/No call stack: in a browser/.test(md), 'says there is no stack in a browser');
    assert(/rfMI before the block/.test(md), 'holds the last crumbs');
    return 'freeze ' + fr.ms + ' ms';
  });

  step('rfMI: a tab closed while frozen (its watchdog kept the open freeze in IndexedDB) is reported by the next page load', async function () {
    // another tab's watchdog: it starts, gets crumbs and an operation, then no heartbeat (that tab froze), then it is
    // ended with no pagehide (the tab was closed frozen); this page's checkLastSession plays the next load
    var id = 'rfMItab' + Date.now().toString(36), db = UI.reports.watchdog().db;
    var w = new (W.Worker._orig || W.Worker)('reports-watchdog.js');
    w.postMessage({ type: 'start', session: id, db: db, freezeMs: 1000, crumbs: [{ at: Date.now() - 500, text: 'rfMI: the other tab opened a STEP, 40.0 MB' }] });
    w.postMessage({ type: 'crumbs', list: [{ at: Date.now(), text: 'rfMI: rebuild started' }], extra: { operation: [{ title: 'Import STEP', fraction: 0.4, runningMs: 900 }] } });
    await wait(1700);   // the worker opens the freeze after 1 s of silence and saves it
    w.terminate();
    UI.reports.testBars = true;
    try {
      var found = [];
      var t0 = Date.now();
      while (!found.length && Date.now() - t0 < 16000) { await wait(500); found = await UI.reports._checkLastSession(); }   // a session seen in the last 10 s may be a live tab
      assert(found.length === 1 && found[0].previous && found[0].kind === 'not-responding', 'one report of the closed tab: ' + JSON.stringify(found.map(function (f) { return f.summary; })));
      var md = found[0].md;
      assert(/and the tab was closed while Import STEP was running/.test(md) && /rfMI: the other tab opened a STEP/.test(md) && /rfMI: rebuild started/.test(md) && /No call stack/.test(md), 'what that tab was doing: ' + md.split('\n').slice(6, 8).join(' / '));
      var bar = await rfMIwait(function () { return D.getElementById('rp-bar'); }, 3000, 'the bar');
      assert(/did not respond last time and was closed/.test(bar.textContent), 'the bar says so: ' + bar.textContent.slice(0, 90));
      var again = await UI.reports._checkLastSession();
      assert(!again.length, 'reported once (the session record is gone)');
    } finally { UI.reports.testBars = false; UI.reports.hide(); }
  });

  step('rfMI: report.md has every section and none of the document\'s names, paths, properties or note text', async function () {
    var m = K.newModel('ZebraQuokkaBracket');
    UI.loadModel(m); await idle();
    UI.App.model.properties = { custom: { Customer: 'AcmeWombatCo', Description: 'Gizmo for Platypus Ltd' } };
    UI.App.model.drawings = [{ name: 'Sheet', sheets: [{ name: 'Sheet1', views: [], notes: [{ id: 1, text: 'NOTE KOOKABURRA RIVET' }] }] }];
    UI.App.fileName = 'ZebraQuokkaBracket';
    var keepPath = UI.App.filePath;
    UI.App.filePath = 'C:\\Jobs\\Wallaby Works\\ZebraQuokkaBracket.anvil.json';
    try {
      W.console.warn('could not read C:\\Jobs\\Wallaby Works\\ZebraQuokkaBracket.anvil.json for AcmeWombatCo');
      UI.reports.crumb('opened ZebraQuokkaBracket for AcmeWombatCo (NOTE KOOKABURRA RIVET)');
      var info = await UI.reports.make('manual', { userText: 'rfMI: the flange is on the wrong side' });
      var md = info.md;
      ['# Anvil problem report: manual', 'this is an Anvil problem report', '`CLAUDE.md`', 'Where it was stuck', '**What happened:**', '- Anvil version:', '## What the user wrote', '## Operation in progress',
        '## Last breadcrumbs', '## Console errors and warnings', '## State', 'interface profile', 'triangles', '## Files in this folder'].forEach(function (s) { assert(md.indexOf(s) >= 0, 'report.md lacks "' + s + '"'); });
      ['ZebraQuokkaBracket', 'AcmeWombatCo', 'Platypus', 'KOOKABURRA', 'Wallaby', 'C:\\Jobs'].forEach(function (s) { assert(md.indexOf(s) < 0, 'report.md leaks "' + s + '"'); });
      assert(/<name>/.test(md) && /could not read <path \.anvil\.json>/.test(md), 'names and paths are replaced, the kind kept: ' + md.split('\n').filter(function (l) { return /could not|opened/.test(l); }).join(' / '));
      var row = (await UI.reports.list()).filter(function (x) { return x.id === info.id; })[0];
      assert(row && !row.hasModel, 'no model without the tick');
    } finally { UI.App.filePath = keepPath; UI.App.fileName = null; await anvil.newPart(); await idle(); }
  });

  step('rfMI: Help > Report a Problem saves a manual report; Include the model adds it; Copy for Claude copies a message with the report', async function () {
    UI.reports.testBars = true;
    try {
    var rows = menuRows('Report a Problem');
    assert(rows.length === 1 && /Help/.test(rows[0].menu), 'Help > Report a Problem…: ' + JSON.stringify(rows.map(function (r) { return r.menu + ' ' + r.text; })));
    rows[0].row.click();
    assert(modalOpen() && D.getElementById('rp-text') && D.getElementById('rp-include-model'), 'the dialog: a text box and Include the model');
    D.getElementById('rp-text').value = 'rfMI: the hole moved after a rebuild';
    var n0 = UI.reports.made().length;
    clickModalButton('Save report');
    var bar = await rfMIwait(function () { return D.getElementById('rp-bar'); }, 5000, 'the bar');
    var info = UI.reports.made()[n0];
    assert(info && info.kind === 'manual' && /the hole moved/.test(info.md) && !modalOpen(), 'a manual report with the text');
    var rows2 = await UI.reports.list(), row = rows2.filter(function (x) { return x.id === info.id; })[0];
    assert(row && !row.hasModel, 'the model is absent until ticked');
    ['copy', 'view', 'model', 'dismiss'].forEach(function (k) { assert(bar.querySelector('[data-rp="' + k + '"]'), 'the bar has ' + k); });
    var cb = bar.querySelector('[data-rp="model"]');
    cb.click();
    await rfMIwait(function () { return info.modelAdded; }, 3000, 'the model added');
    row = (await UI.reports.list()).filter(function (x) { return x.id === info.id; })[0];
    assert(row && row.hasModel, 'Include the model adds it');
    bar.querySelector('[data-rp="copy"]').click();
    var copied = await rfMIwait(function () { return UI.reports.lastCopied; }, 3000, 'the copy');
    assert(/please find the cause and fix it/.test(copied) && /# Anvil problem report: manual/.test(copied), 'Copy for Claude: one sentence and the report: ' + copied.slice(0, 120));
    bar.querySelector('[data-rp="view"]').click();
    await rfMIwait(function () { return modalOpen() && D.querySelector('#modal .rp-view'); }, 3000, 'View report');
    assert(/the hole moved/.test(D.querySelector('#modal .rp-view').textContent), 'View report shows report.md');
    clickModalButton('Close');
    bar.querySelector('[data-rp="dismiss"]').click();
    assert(!D.getElementById('rp-bar'), 'dismissed');
    } finally { UI.reports.testBars = false; UI.reports.hide(); if (modalOpen() && UI.closeModal) UI.closeModal(); }
  });

  step('rfMI: Tools > Options has a Reports line (where, Report a Problem, the not-responding switch)', async function () {
    UI.openTaskPane('props');
    var box = await rfMIwait(function () { return D.querySelector('#tp-body [data-role="reports"]'); }, 3000, 'the Reports section');
    assert(/kept in this browser/.test(box.textContent) && box.querySelector('[data-rp="watch"]').checked, 'where reports are kept, the watch on');
    UI.closeTaskPane();
  });
