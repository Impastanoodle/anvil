  // ---- rfNZ (2026-11-17, lane freezerec): a not-responding report says where and what (ui-reports.js,
  // reports-watchdog.js; the desktop half is desktop/check.js reports). The freeze of 2026-11-16 left a report with one
  // frame and no file ("(anonymous)  ?:7765:17"), a summary that sent the reader to that frame although the main thread
  // had been outside JavaScript, and nothing about the 29 s of orbiting before it. Page side: one breadcrumb per
  // gesture in the graphics area (no positions, no names), a "slow frame" crumb for a hitch over 1 s, the browser's own
  // long-frame record in the report, and report.md telling a JavaScript loop from a block outside JavaScript.
  async function rfNZwait(fn, ms, what) {
    var t0 = Date.now();
    for (;;) { var v = fn(); if (v) return v; if (Date.now() - t0 > (ms || 5000)) fail('waited too long for ' + what); await wait(50); }
  }
  // the session record a watchdog worker keeps in IndexedDB, once it holds n crumbs
  async function rfNZsession(db, id, n) {
    for (var t0 = Date.now(); Date.now() - t0 < 8000; ) {
      var rec = await new Promise(function (res) {
        var q = W.indexedDB.open(db, 1);
        q.onerror = function () { res(null); };
        q.onsuccess = function () { var g = q.result.transaction('sessions', 'readonly').objectStore('sessions').get(id); g.onsuccess = function () { q.result.close(); res(g.result || null); }; g.onerror = function () { q.result.close(); res(null); }; };
      });
      if (rec && rec.crumbs.length === n) return rec;
      await wait(100);
    }
    fail('waited too long for the worker to save ' + n + ' crumbs');
  }
  function rfNZfrom(mark) { return UI.reports.crumbs().filter(function (c) { return c.at >= mark; }); }
  // a pad inside the graphics area: its events do not bubble, so the listeners of ui-reports.js (window, capture phase)
  // see them and Anvil's own (the view does not turn, nothing is selected) do not
  function rfNZpad() { var p = D.createElement('div'); p.id = 'rfnz-pad'; p.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px'; D.getElementById('viewport').appendChild(p); return p; }
  function rfNZmouse(el, type, o) { el.dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: false, cancelable: true, view: W, clientX: 300, clientY: 300, button: 0, buttons: 0 }, o || {}))); }
  function rfNZkey(el, key, o) { el.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: key, bubbles: false, cancelable: true }, o || {}))); }

  step('rfNZ: hover, click, orbit, pan, the wheel and keys leave one breadcrumb per gesture, with no positions and no letters', async function () {
    var pad = rfNZpad(), box = D.createElement('input');
    D.body.appendChild(box);
    try {
      UI.reports.crumb('rfNZ marker before the gestures');
      await wait(5);
      var mark = Date.now(), i;
      for (i = 0; i < 7; i++) { rfNZmouse(pad, 'mousemove', { clientX: 300 + i * 9, clientY: 311 }); await wait(60); }
      rfNZmouse(pad, 'mousedown', { clientX: 363, clientY: 311, buttons: 1 }); rfNZmouse(W, 'mouseup', { clientX: 363, clientY: 311 });
      rfNZmouse(pad, 'mousedown', { button: 1, buttons: 4 });
      var mid = rfNZfrom(mark).map(function (c) { return c.text; });
      assert(mid.indexOf('graphics area: middle button pressed') >= 0, 'the press is written down at once, before whatever it starts: ' + JSON.stringify(mid));
      rfNZmouse(pad, 'mousemove', { clientX: 340, clientY: 320, button: 1, buttons: 4 });
      assert(rfNZfrom(mark).some(function (c) { return c.text === 'graphics area: drag with the middle button (orbit), in progress'; }), 'a drag under way says so (a freeze in the middle of an orbit shows it)');
      await wait(320);
      rfNZmouse(W, 'mouseup', { clientX: 377, clientY: 333, button: 1 });
      rfNZmouse(pad, 'mousedown', { button: 1, buttons: 4, ctrlKey: true }); rfNZmouse(pad, 'mousemove', { clientX: 350, clientY: 350, button: 1, buttons: 4, ctrlKey: true }); rfNZmouse(W, 'mouseup', { button: 1 });
      rfNZmouse(pad, 'mousedown', { button: 2, buttons: 2 }); rfNZmouse(W, 'mouseup', { button: 2 });
      for (i = 0; i < 14; i++) pad.dispatchEvent(new W.WheelEvent('wheel', { bubbles: false, deltaY: -100, clientX: 312, clientY: 318 }));
      await rfNZwait(function () { return rfNZfrom(mark).some(function (c) { return /^graphics area: wheel ×14 \(zoom\)/.test(c.text); }); }, 3000, 'the wheel line');
      rfNZkey(pad, 'k'); rfNZkey(pad, 'Escape'); rfNZkey(pad, 'z', { ctrlKey: true }); rfNZkey(pad, 'Delete');
      rfNZkey(box, 'W'); rfNZkey(box, 'o'); rfNZkey(box, 'm'); rfNZkey(box, 'Enter');
      var c = rfNZfrom(mark), t = c.map(function (x) { return x.text + (x.n > 1 ? ' ×' + x.n : ''); });
      var want = [/^graphics area: hover 0\.\d s \(pointer moving 0\.\d s\)$/, /^graphics area: click$/, /^graphics area: drag with the middle button \(orbit\) 0\.[3-9] s$/, /^graphics area: drag with the Ctrl \+ middle button \(pan\) 0(\.\d)? s$/,
        /^graphics area: right click$/, /^graphics area: wheel ×14 \(zoom\)/, /^key: a key$/, /^key: Escape$/, /^key: Ctrl\+Z$/, /^key: Delete$/, /^key: typing in a box ×3$/, /^key: Enter in a box$/];
      var at = 0;
      want.forEach(function (re) { var j = -1; for (var k = at; k < t.length; k++) if (re.test(t[k])) { j = k; break; } assert(j >= 0, 'no crumb ' + re + ' after #' + at + ' in ' + JSON.stringify(t)); at = j + 1; });
      assert(t.length === want.length, 'one line per gesture, ' + want.length + ' in all: ' + JSON.stringify(t));
      assert(!/3\d\d/.test(t.join(' | ')) && !t.some(function (x) { return /^key: [A-Za-z]$/.test(x); }), 'no positions and no letters typed: ' + JSON.stringify(t));
      // a report holds them; a long run of gestures keeps the newest 30 and never pushes the other crumbs out
      var info = await UI.reports.make('manual', { userText: 'rfNZ: gestures' });
      assert(/\| graphics area: drag with the middle button \(orbit\) 0\.\d s \|/.test(info.md) && /\| key: typing in a box \(×3\) \|/.test(info.md), 'the gesture lines are in report.md');
      for (i = 0; i < 45; i++) { rfNZmouse(pad, 'mousedown', { buttons: 1 }); rfNZmouse(W, 'mouseup', {}); rfNZkey(pad, 'F' + (1 + i % 9)); }
      var all = UI.reports.crumbs(), hand = all.filter(function (x) { return /^(graphics area|key): /.test(x.text); });
      assert(hand.length === 30 && all.some(function (x) { return x.text === 'rfNZ marker before the gestures'; }), 'the newest 30 gesture lines are kept (' + hand.length + '), the marker before them is still there');
      return t.length + ' gesture lines: ' + t.slice(0, 6).join(' | ');
    } finally { pad.remove(); box.remove(); }
  });

  step('rfNZ: the watchdog worker rewrites a gesture line in place (a tab closed in the middle of an orbit has the line)', async function () {
    var id = 'rfNZtab' + Date.now().toString(36), db = UI.reports.watchdog().db;
    var w = new (W.Worker._orig || W.Worker)('reports-watchdog.js');
    try {
      w.postMessage({ type: 'start', session: id, db: db, freezeMs: 60000, crumbs: [{ at: Date.now() - 500, text: 'rfNZ: before' }] });
      w.postMessage({ type: 'crumbs', list: [{ at: Date.now(), text: 'graphics area: middle button pressed', g: 'g1' }] });
      w.postMessage({ type: 'crumbs', list: [{ at: Date.now(), text: 'graphics area: drag with the middle button (orbit), in progress', g: 'g1' }, { at: Date.now(), text: 'rfNZ: after' }] });
      w.postMessage({ type: 'reported' });   // saves now
      var rec = await rfNZsession(db, id, 3);
      var t = rec.crumbs.map(function (c) { return c.text; });
      assert(t.join(' | ') === 'rfNZ: before | graphics area: drag with the middle button (orbit), in progress | rfNZ: after', 'the pressed line was rewritten in place: ' + JSON.stringify(t));
      var list = [];
      for (var i = 0; i < 40; i++) list.push({ at: Date.now(), text: 'graphics area: click', g: 'h' + i });
      w.postMessage({ type: 'crumbs', list: list });
      w.postMessage({ type: 'reported' });
      rec = await rfNZsession(db, id, 32);
      t = rec.crumbs.map(function (c) { return c.text; });
      assert(rec.crumbs.filter(function (c) { return c.g != null; }).length === 30 && t[0] === 'rfNZ: before' && t.indexOf('rfNZ: after') >= 0 && !t.some(function (x) { return /in progress/.test(x); }), 'the worker keeps the newest 30 gesture lines and every other crumb: ' + t.length);
      return rec.crumbs.length + ' crumbs kept by the worker';
    } finally { w.postMessage({ type: 'stop' }); await wait(200); w.terminate(); }
  });

  step('rfNZ: a 1.5 s hitch leaves a slow-frame crumb (script and render time) and no report', async function () {
    var n0 = UI.reports.made().length, f0 = UI.reports.freezes().length, mark = Date.now();
    // the callback is made in the app's frame (new W.Function): the browser gives a frame's long-frame record to the
    // window whose script it was
    new W.Function('ms', 'setTimeout(function rfNZHitch() { UI.reports._block(ms); }, 0);')(1500);
    var c = await rfNZwait(function () { return rfNZfrom(mark).filter(function (x) { return /^slow frame /.test(x.text); })[0]; }, 8000, 'the slow-frame crumb');
    await wait(400);
    var sup = UI.reports.longFrames().support;
    assert(/^slow frame 1\.[3-9] s \(/.test(c.text), 'the hitch, about 1.5 s: ' + c.text);
    // the suite's frame gets long tasks but no long-animation-frame entries from the browser (an embedded frame): there the
    // line names the task; the script / render split is pinned by desktop/check.js reports (row 1c)
    assert(/^slow frame 1\.[3-9] s \((script 1\.[3-9] s, render 0(\.\d)? s|one task of 1\.[3-9] s)/.test(c.text), 'how much was script and how much rendering, or the task: ' + c.text);
    assert(UI.reports.made().length === n0 && UI.reports.freezes().length === f0, 'no report for a hitch under 3 s');
    assert(rfNZfrom(mark).filter(function (x) { return /^slow frame /.test(x.text); }).length === 1, 'one crumb for one hitch');
    return c.text + (sup.loaf ? '' : ' (this browser has no long-animation-frame record)');
  });

  step('rfNZ: a 4 s block is reported with what the browser recorded about the frame: how long, script or rendering, which script', async function () {
    var f0 = UI.reports.freezes().length;
    assert(UI.reports.watchdog().running, 'the watchdog worker runs');
    new W.Function('ms', 'setTimeout(function rfNZBlock() { UI.reports._block(ms); }, 0);')(4000);
    var fr = await rfNZwait(function () { var f = UI.reports.freezes(); return f.length > f0 && f[f.length - 1].report ? f[f.length - 1] : null; }, 12000, 'the freeze report');
    var md = fr.report.md, sup = UI.reports.longFrames().support;
    assert(/^> How to read a not-responding report/m.test(md) && /outside JavaScript/.test(md.split('\n').slice(0, 9).join('\n')), 'the reader\'s guide says how to read the samples, the processes and the page record');
    assert(/## What the page itself recorded/.test(md) && /No call stack: in a browser/.test(md), 'the page record section, and still no stack in a browser');
    if (/^- frame from /m.test(md)) {
      assert(/- frame from -?0\.\d s to [34]\.\d s \([34](\.\d)? s\): script [34](\.\d)? s, rendering 0(\.\d)? s/.test(md), 'the frozen frame, from when to when, script and rendering: ' + md.split('\n').filter(function (l) { return /frame from|script:/.test(l); }).join(' / '));
      assert(/  - script: TimerHandler:setTimeout/.test(md) && /The page's own record: a frame of [34](\.\d)? s with script [34]/.test(md) && /The longest script: TimerHandler:setTimeout/.test(md), 'the script that held the frame is named, and the reading of it is under Where it was stuck');
    }
    else assert(/- long task from -?0\.\d s to [34]\.\d s \([34](\.\d)? s\)/.test(md) && /The page's own record has a long task of [34](\.\d)? s and no long frame: the browser did not say which script\./.test(md), 'an embedded frame gets the long task only: ' + md.split('\n').filter(function (l) { return /long task|long frame/.test(l); }).join(' / '));
    return 'freeze ' + fr.ms + ' ms; ' + (md.split('\n').filter(function (l) { return /^- frame from/.test(l); })[0] || 'no long-animation-frame record in this browser');
  });

  step('rfNZ: report.md tells a block outside JavaScript from a loop (fixtures: the 2026-11-16 freeze, a waiting call, a loop, a pause never answered, an old report)', async function () {
    var F = UI.reports.format, at = Date.now();
    function report(where, more) {
      var r = Object.assign({ format: 'anvil-problem-report', v: 1, kind: 'not-responding', at: at, version: '0.1.30', app: 'Windows app', durationMs: 9569, freezeStart: at - 9569, operation: [], crumbs: [], console: [], state: {}, files: {}, where: where }, more || {});
      if (!where.summary) where.summary = F.whereSummary(r);
      r.summary = F.summary(r);
      return { r: r, md: F.markdown(r) };
    }
    // 1. the freeze of 2026-11-16 as it would be recorded now: one pause, delivered 3.7 s late, on the entry of a click
    // handler; the GPU process busy; no long frame; two shaders compiled
    var gpu = [{ name: 'GPU', cpu: 97.2, mb: 213 }, { name: 'window', cpu: 3.1, mb: 312 }, { name: 'main', cpu: 0.6, mb: 191 }];
    var a = report({ note: 'Sampled from the main process.', samples: [{ afterMs: 5838, lateMs: 3731, depth: 1, entry: true, frames: [{ fn: '(anonymous)', file: 'ui-commands.js', line: 7765, col: 17, src: 'var t = e.target;' }], procs: gpu, cpuMs: 9569 }], cpu: { ms: 9569, procs: gpu } },
      { page: { longFrames: [], longTasks: [], graphics: [{ at: at - 4000, what: 'WebGL context lost' }], programs: { before: 12, after: 14 }, support: 'long-animation-frame, longtask' } });
    assert(a.r.where.kind === 'outside' && /\*\*Outside JavaScript\.\*\* The window's main thread was busy outside JavaScript for at least 3\.7 s of the 9\.6 s: painting, the graphics card, layout, garbage collection or a synchronous call\./.test(a.md), 'says outside JavaScript, for how long: ' + a.r.where.summary);
    assert(/is the first JavaScript that ran afterwards \(\(anonymous\) \(ui-commands\.js:7765\), a callback that had only just been called/.test(a.md) && /It is not where Anvil was stuck/.test(a.md), 'the stack is called what it is');
    assert(!/stopped in the same place/.test(a.md), 'no "stopped in the same place"');
    assert(/The GPU process was the busy one \(97 % of one processor thread\) while the window's own process was nearly idle \(3\.1 %\)/.test(a.md) && /\| GPU \| 97 % \| 213 MB \|/.test(a.md) && /Processor use in the 9\.6 s up to this sample[^\n]*GPU 97 %, window 3\.1 %/.test(a.md), 'which process was working, as a sentence, a table and per sample');
    assert(/Sample 1, asked 5\.8 s into the freeze, answered 3\.7 s later \(9\.6 s into the freeze, when the main thread ran JavaScript again\):/.test(a.md) && /1\. \(anonymous\) {2}ui-commands\.js:7765:17\n {7}var t = e\.target;/.test(a.md), 'the sample: when asked, when answered, the frame with its file and source line');
    assert(/- no long frame and no long task: the time did not go to the page's scripts or rendering steps/.test(a.md) && /- WebGL programs \(compiled shaders\): 12 before, 14 after \(2 made during the freeze: a shader compile\)/.test(a.md) && /- WebGL context lost at 5\.6 s/.test(a.md), 'the page record: no long frame, the shaders compiled, the context lost');
    assert(/busy outside JavaScript: see Where it was stuck/.test(a.r.summary), 'the one-line summary says it too: ' + a.r.summary);
    // 2. a call that waits (a synchronous request): the stack is the JavaScript that made the call; nothing was busy
    var idle = [{ name: 'main', cpu: 4.4, mb: 190 }, { name: 'window', cpu: 2, mb: 300 }, { name: 'GPU', cpu: 1, mb: 200 }];
    var b = report({ samples: [{ afterMs: 5100, lateMs: 4200, depth: 3, entry: false, frames: [{ fn: 'afterWait', file: '(injected)', line: 1, col: 40 }, { fn: 'syncWait', file: 'ui-app.js', line: 20, col: 4 }] }], cpu: { ms: 9300, procs: idle } },
      { page: { longFrames: [{ at: at - 9500, ms: 9400, blockingMs: 9350, scriptMs: 9390, renderMs: 10, layoutMs: 4, scripts: [{ invoker: 'TimerHandler:setTimeout', type: 'user-callback', file: 'ui-app.js', fn: 'syncWait', pos: 1234, ms: 9390, forcedLayoutMs: 0 }] }], longTasks: [], graphics: [], support: 'long-animation-frame, longtask' } });
    assert(b.r.where.kind === 'outside' && /is the JavaScript that was waiting: afterWait \(\(injected\):1\) had just come back from a call that left JavaScript/.test(b.md) && /No process of Anvil was busy \(main 4\.4 %, window 2 %, GPU 1 %\): the window was waiting, not working/.test(b.md), 'a waiting call: ' + b.r.where.summary);
    assert(/- frame from 0\.1 s to 9\.5 s \(9\.4 s\): script 9\.4 s, rendering 0 s/.test(b.md) && / {2}- script: TimerHandler:setTimeout {2}syncWait {2}\(ui-app\.js, character 1234\) {2}9\.4 s/.test(b.md) && /The longest script: TimerHandler:setTimeout {2}syncWait/.test(b.md), 'the long frame and its script: ' + b.md.split('\n').filter(function (l) { return /frame from|script:/.test(l); }).join(' / '));
    // 3. a loop: both pauses answered at once
    var busy = [{ fn: 'busy', file: 'kernel.js', line: 10, col: 3 }, { fn: 'rebuild', file: 'kernel-rebuild.js', line: 99, col: 1 }];
    var c = report({ samples: [{ afterMs: 5000, lateMs: 2, depth: 2, entry: false, frames: busy }, { afterMs: 10000, lateMs: 1, depth: 2, entry: false, frames: busy }], cpu: { ms: 12000, procs: [{ name: 'window', cpu: 99, mb: 400 }] } });
    assert(c.r.where.kind === 'javascript' && /\*\*JavaScript was running\.\*\* Every pause was answered at once \(within 2 ms\)/.test(c.md) && /Every sample with a stack \(2\) was stopped in the same place: busy \(kernel\.js:10\)\. Functions seen in most samples: busy \(kernel\.js:10\) ×2, rebuild \(kernel-rebuild\.js:99\) ×2\./.test(c.md) && !/Outside JavaScript/.test(c.md), 'a loop reads as a loop: ' + c.r.where.summary);
    assert(/Sample 2, asked 10 s into the freeze, answered at once \(1 ms\):/.test(c.md) && !/busy outside JavaScript/.test(c.r.summary), 'answered at once');
    // 4. a pause not answered yet (the report as written while the window is still frozen)
    var d = report({ samples: [{ afterMs: 5000, waitingMs: 22000, pending: true }] }, { ongoing: true, durationMs: 27000 });
    assert(d.r.where.kind === 'outside' && /Sample 1, asked 5 s into the freeze: not answered after 22 s \(the main thread has run no JavaScript since\):/.test(d.md) && /busy outside JavaScript for at least 22 s of the 27 s/.test(d.md), 'a pause still waiting: ' + d.r.where.summary);
    // 5. a report written by 0.1.29 or older (no timing, its own summary) still reads as it did
    var e = report({ note: 'Sampled.', samples: [{ afterMs: 5838, frames: [{ fn: '(anonymous)', file: '', line: 7765, col: 17 }] }], summary: 'Every sample with a stack (1) was stopped in the same place: (anonymous) (:7765).' });
    assert(/Sample 1, 5\.8 s into the freeze:/.test(e.md) && /1\. \(anonymous\) {2}\?:7765:17/.test(e.md) && /Every sample with a stack \(1\)/.test(e.md) && !/## What the page itself recorded/.test(e.md), 'an old report is formatted as before');
    assert(F.verdict({ durationMs: 9000, where: { samples: [{ afterMs: 5838, frames: [{ fn: 'f', file: 'a.js', line: 1 }] }] } }).kind === 'unknown', 'samples with no timing: not called a loop, not called outside');
    return 'outside (GPU), outside (waiting call), loop, pending, old format';
  });
