  // ---- rfOF (2026-11-17, head): Print is a wait, not a freeze (ui-reports.js printDoc, reports-watchdog.js "wait";
  // the desktop half is desktop/check.js reports, row 1f). The "stopped responding for 9.6 s" report of 2026-11-16 was
  // the Print button of the Standard toolbar: window.print() does not return until the system's Print box is closed,
  // so the page's thread stood still outside JavaScript with no breadcrumb. Here the Print box is a stand-in that
  // holds the page's thread for 4 s (over the watchdog's 3 s).
  async function rfOFwait(fn, ms, what) {
    var t0 = Date.now();
    for (;;) { var v = fn(); if (v) return v; if (Date.now() - t0 > (ms || 5000)) fail('waited too long for ' + what); await wait(50); }
  }
  function rfOFfrom(mark) { return UI.reports.crumbs().filter(function (c) { return c.at >= mark; }).map(function (c) { return c.text; }); }

  step('rfOF: the Print button waits for the Print box: a breadcrumb before and after, no slow-frame line, no not-responding report', async function () {
    assert(UI.reports.watchdog().running, 'the watchdog worker runs');
    var n0 = UI.reports.made().length, f0 = UI.reports.freezes().length, mark = Date.now(), real = W.print, seen = null;
    W.print = function () { seen = { waiting: UI.reports.waiting(), crumbs: rfOFfrom(mark) }; UI.reports._block(4000); };
    try {
      $('std-print').click();
      assert(seen, 'the Print button called window.print()');
      assert(seen.waiting && seen.crumbs.indexOf('Print: the Print box is open (Anvil waits until it is closed)') >= 0, 'before the box opens the page says it will wait: ' + seen.crumbs.join(' | '));
      assert(!UI.reports.waiting(), 'the wait is over when print() returns');
      // long enough for the worker's 250 ms check, the slow-frame clock (300 ms after its tick) and a report (350 ms)
      await wait(1500);
      var t = rfOFfrom(mark);
      assert(t.some(function (x) { return /^Print: the Print box closed after [34](\.\d)? s$/.test(x); }), 'how long the box was open: ' + t.join(' | '));
      assert(!t.some(function (x) { return /^slow frame |^not responding/.test(x); }), 'no slow-frame or not-responding line for the wait: ' + t.join(' | '));
      assert(UI.reports.made().length === n0 && UI.reports.freezes().length === f0 && !$('rp-bar'), 'no report and no bar');
      return t.join(' | ');
    } finally { W.print = real; }
  });

  step('rfOF: a print started another way (UI.reports.print, beforeprint and afterprint from the browser) waits the same way, and a real 4 s block afterwards is still reported', async function () {
    var n0 = UI.reports.made().length, f0 = UI.reports.freezes().length, mark = Date.now(), real = W.print, calls = 0;
    W.print = function () { calls++; UI.reports._block(3600); };
    try {
      UI.reports.print();
      // a print started some other way (the browser's own menu): beforeprint / afterprint say the same
      W.dispatchEvent(new W.Event('beforeprint'));
      assert(UI.reports.waiting(), 'beforeprint starts the wait');
      W.dispatchEvent(new W.Event('afterprint'));
      assert(!UI.reports.waiting(), 'afterprint ends it');
      await wait(1200);
      var t = rfOFfrom(mark);
      assert(calls === 1 && t.filter(function (x) { return /^Print: the Print box is open/.test(x); }).length >= 1 && UI.reports.freezes().length === f0 && UI.reports.made().length === n0, 'no report for the wait: ' + t.join(' | '));
    } finally { W.print = real; }
    // the watch is back: the same hold without Print is a freeze
    new W.Function('ms', 'setTimeout(function rfOFBlock() { UI.reports._block(ms); }, 0);')(4000);
    var fr = await rfOFwait(function () { var f = UI.reports.freezes(); return f.length > f0 && f[f.length - 1].report ? f[f.length - 1] : null; }, 12000, 'the freeze report');
    UI.reports.hide();
    return 'the wait: no report; the block after it: ' + fr.ms + ' ms reported';
  });

  // (head, 2026-11-17) Zoom to Area left on took the next tool's first press (ui-sketch.js setTool, ui-core.js
  // loadModel): what made rfNK flow a fail after rfNG in every full run since 2026-11-16
  step('rfOF: Zoom to Area ends when a sketch tool is picked and when a document is opened', async function () {
    await anvil.newPart(); await idle();
    UI.App.zoomAreaMode = true; UI.refreshHud();
    await anvil.newPart(); await idle();
    assert(!UI.App.zoomAreaMode, 'a new document does not start in Zoom to Area');
    await UI.newSketchOnPlane('Front'); await idle();
    try {
      UI.App.zoomAreaMode = true; UI.refreshHud();
      UI.setTool('line'); await wait(30);
      assert(!UI.App.zoomAreaMode, 'picking Line ends Zoom to Area');
    } finally { UI.App.zoomAreaMode = false; UI.setTool('select'); UI.exitSketch(true); await anvil.newPart(); await idle(); }
    return 'ended by a tool pick and by a new document';
  });
