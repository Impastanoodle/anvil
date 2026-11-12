// ui-progress.js — one progress service for every operation the user may wait on (lane progress, local-2026-11-12c).
// User 2026-11-12, after "major freezes on complex 3d imported solidworks models": "we need a loading bar where
// applicable". Before this a long operation showed at most a line in the status bar and some showed nothing, so the
// user could not tell working from frozen.
//
// Contract (fixed with lanes importperf and reports):
//   var h = UI.progress.begin(title, opts)   -> { set(fraction, text), done(), cancelled() }
//     fraction 0..1, or null for "busy, amount unknown"; text = one line of detail ("Feature 14 of 60: Cut-Extrude7")
//     opts.cancel  true (h.cancelled() turns true when the user presses Cancel) or a function to call on Cancel
//     opts.delay   ms before anything shows (default 400: quick operations never flash a bar)
//     opts.card    true: the operation blocks the document; a card in the middle of the graphics area as well
//   Handles nest: the newest shown one drives the bars, and the bar returns to the one under it on done().
//   UI.progress.active() -> [{ title, fraction, text, startedAt, shown, card }]
// Helpers built on it:
//   UI.progress.run(title, fn, opts)  begin, fn(h), done in finally; with opts.paint (or a heavy model, opts.heavy)
//     the card shows at once and one frame is painted BEFORE fn runs (main-thread work that cannot be sliced), and
//     run returns a Promise; otherwise fn runs at once and run returns what fn returns (a Promise is followed).
//   UI.progress.paint() -> Promise resolved after the page has painted (a frame, then a task)
//   UI.progress.heavy() -> true when the model on screen is large enough that main-thread work on it takes long
//   UI.progress.listen(fn) -> unsubscribe; fn({ type: 'begin' | 'set' | 'done' | 'show' | 'cancel', title, fraction,
//     text }) for every change (tests record the order of a rebuild's steps with it)
//   UI.progress.cancel() presses Cancel on the card (Esc does the same while a card with Cancel is up)
// What the user sees: a slim bar in the status bar (name, bar, percent; a moving bar when the amount is unknown) for
// every operation that outlasts its delay; for opts.card also a card in the middle of the graphics area (title, bar,
// one line of detail, elapsed time after 5 s, Cancel when allowed) and the wait cursor over the graphics area.
// An operation that throws closes its bar: callers use try / finally; a handle begun in the task that threw (or
// touched just before an unhandled rejection) is closed by the error listeners below.
(function (UI) {
  'use strict';
  var stack = [], listeners = [], seq = 0, els = null, renderPending = 0, tickTimer = 0;
  var DEFAULT_DELAY = 400, ELAPSED_AFTER = 5000;
  var HEAVY = { tris: 250000, features: 120 };   // UI.progress.heavyAt: what counts as a big model (tests lower it)
  function nowMs() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  function $(id) { return document.getElementById(id); }
  function crumb(text) { try { if (UI.reports && UI.reports.crumb) UI.reports.crumb(text); } catch (e) { } }
  var lastCrumb = { text: '', at: 0 };
  function crumbOnce(text) {
    var t = nowMs();
    if (text === lastCrumb.text && t - lastCrumb.at < 1000) return;   // a drag's stream of rebuilds is one line
    lastCrumb = { text: text, at: t };
    crumb(text);
  }
  function emit(type, h) {
    var ev = { type: type, title: h.title, fraction: h.fraction, text: h.text, id: h.id };
    listeners.slice().forEach(function (fn) { try { fn(ev); } catch (e) { } });
  }

  function begin(title, opts) {
    opts = opts || {};
    var h = {
      id: ++seq, title: String(title || 'Working'), fraction: null, text: '', card: !!opts.card,
      cancelOpt: opts.cancel || null, cancelledFlag: false, startedAt: Date.now(), t0: nowMs(), touched: nowMs(),
      delay: opts.delay == null ? DEFAULT_DELAY : Math.max(0, +opts.delay || 0), shown: false, closed: false, timer: 0, fresh: true
    };
    Promise.resolve().then(function () { h.fresh = false; });
    var api = {
      set: function (fraction, text) {
        if (h.closed) return api;
        h.fraction = fraction == null || !isFinite(fraction) ? null : Math.max(0, Math.min(1, +fraction));
        if (text !== undefined) h.text = text == null ? '' : String(text);
        h.touched = nowMs(); h.fresh = true;
        Promise.resolve().then(function () { h.fresh = false; });
        emit('set', h);
        if (h.shown) schedule();
        return api;
      },
      done: function () { close(h); return api; },
      cancelled: function () { return h.cancelledFlag; },
      get title() { return h.title; }
    };
    h.api = api;
    stack.push(h);
    crumbOnce('progress: ' + h.title);
    emit('begin', h);
    if (h.delay === 0) show(h);
    else h.timer = setTimeout(function () { h.timer = 0; show(h); }, h.delay);
    return api;
  }
  function show(h) {
    if (h.closed || h.shown) return;
    h.shown = true;
    emit('show', h);
    render();
  }
  function close(h) {
    if (h.closed) return;
    h.closed = true;
    if (h.timer) { clearTimeout(h.timer); h.timer = 0; }
    var i = stack.indexOf(h);
    if (i >= 0) stack.splice(i, 1);
    var ms = Math.round(nowMs() - h.t0);
    if (ms >= 100) crumb('progress: ' + h.title + ' done (' + ms + ' ms)');
    emit('done', h);
    render();   // a bar that reached the end closes at once (no fade, no minimum time on screen)
  }
  function shownStack() { return stack.filter(function (h) { return h.shown && !h.closed; }); }
  function active() {
    return stack.map(function (h) { return { title: h.title, fraction: h.fraction, text: h.text, startedAt: h.startedAt, shown: h.shown, card: h.card }; });
  }

  // ---- what is on screen ----------------------------------------------------------------------------------------
  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function ensureEls() {
    if (els && document.body.contains(els.status) && document.body.contains(els.card)) return els;
    var bar = $('statusbar'), vp = $('viewport');
    if (!bar || !vp) return null;
    var st = $('pg-status') || el('div', '', { id: 'pg-status', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', hidden: '' });
    if (!st.firstChild) {
      st.appendChild(el('span', 'pg-name'));
      var tr = el('span', 'pg-track'); tr.appendChild(el('span', 'pg-fill')); st.appendChild(tr);
      st.appendChild(el('span', 'pg-pct'));
    }
    var msg = $('status-msg');
    if (st.parentNode !== bar) bar.insertBefore(st, msg ? msg.nextSibling : bar.firstChild);
    var card = $('pg-card') || el('div', '', { id: 'pg-card', role: 'alertdialog', 'aria-live': 'polite', hidden: '' });
    if (!card.firstChild) {
      card.appendChild(el('div', 'pg-title'));
      var ct = el('div', 'pg-track', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }); ct.appendChild(el('span', 'pg-fill')); card.appendChild(ct);
      var row = el('div', 'pg-row');
      row.appendChild(el('span', 'pg-detail'));
      row.appendChild(el('span', 'pg-pct'));
      card.appendChild(row);
      var foot = el('div', 'pg-foot');
      foot.appendChild(el('span', 'pg-time'));
      var cb = el('button', 'pg-cancel', { type: 'button' }); cb.textContent = 'Cancel';
      cb.addEventListener('click', function (e) { e.stopPropagation(); cancel(); });
      foot.appendChild(cb);
      card.appendChild(foot);
      ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu', 'pointerdown'].forEach(function (t) { card.addEventListener(t, function (e) { e.stopPropagation(); }); });
    }
    if (card.parentNode !== vp) vp.appendChild(card);
    els = { status: st, card: card, vp: vp };
    return els;
  }
  function pct(f) { return f == null ? '' : Math.round(f * 100) + ' %'; }
  function setBar(track, f) {
    var fill = track.querySelector('.pg-fill');
    track.classList.toggle('busy', f == null);
    var w = f == null ? '' : (f * 100).toFixed(1) + '%';
    if (fill.style.width !== w) fill.style.width = w;
  }
  function setAria(node, f, label) {
    if (f == null) node.removeAttribute('aria-valuenow'); else node.setAttribute('aria-valuenow', String(Math.round(f * 100)));
    node.setAttribute('aria-valuetext', label);
  }
  function setText(node, t) { if (node.textContent !== t) node.textContent = t; }
  function clock(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  // which handle is up: the status bar shows the newest shown handle; the card shows while any shown handle has a card,
  // with the oldest such handle's title (the operation the user started) and the newest handle's bar and detail
  // (opening a file: "Rebuilding: Feature 14 of 60")
  function cardState() {
    var list = shownStack(), top = list[list.length - 1] || null, ci = -1;
    for (var i = 0; i < list.length; i++) if (list[i].card) { ci = i; break; }
    var ch = ci >= 0 ? list[ci] : null, canceller = null;
    if (ch) for (var j = list.length - 1; j >= ci; j--) if (list[j].cancelOpt) { canceller = list[j]; break; }
    return { list: list, top: top, card: ch, canceller: canceller };
  }
  function render() {
    if (renderPending) { cancelAnimationFrame(renderPending); renderPending = 0; }
    var e = ensureEls();
    if (!e) return;
    var s = cardState(), top = s.top;
    if (!top) {
      if (!e.status.hidden) e.status.hidden = true;
      if (!e.card.hidden) e.card.hidden = true;
      e.vp.classList.remove('pg-wait');
      if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
      return;
    }
    e.status.hidden = false;
    setText(e.status.querySelector('.pg-name'), top.title);
    setText(e.status.querySelector('.pg-pct'), pct(top.fraction));
    setBar(e.status.querySelector('.pg-track'), top.fraction);
    setAria(e.status, top.fraction, top.title + (top.fraction == null ? '' : ' ' + pct(top.fraction)) + (top.text ? ': ' + top.text : ''));
    e.status.setAttribute('aria-label', top.title);
    e.status.title = top.title + (top.text ? ' — ' + top.text : '');
    var ch = s.card;
    if (!ch) {
      if (!e.card.hidden) e.card.hidden = true;
      e.vp.classList.remove('pg-wait');
      if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
      return;
    }
    e.card.hidden = false;
    e.vp.classList.add('pg-wait');
    setText(e.card.querySelector('.pg-title'), ch.title);
    var detail = top === ch ? ch.text : top.title + (top.text ? ': ' + top.text : '');
    setText(e.card.querySelector('.pg-detail'), detail || (top.fraction == null ? 'Working…' : ''));
    setText(e.card.querySelector('.pg-pct'), pct(top.fraction));
    var tr = e.card.querySelector('.pg-track');
    setBar(tr, top.fraction);
    setAria(tr, top.fraction, ch.title + (top.fraction == null ? '' : ' ' + pct(top.fraction)));
    tr.setAttribute('aria-label', ch.title);
    e.card.setAttribute('aria-label', ch.title);
    var el5 = nowMs() - ch.t0;
    setText(e.card.querySelector('.pg-time'), el5 >= ELAPSED_AFTER ? 'Elapsed ' + clock(el5) : '');
    var cb = e.card.querySelector('.pg-cancel');
    cb.hidden = !s.canceller;
    cb.disabled = !!(s.canceller && s.canceller.cancelledFlag);
    if (!tickTimer) tickTimer = setInterval(function () { if (cardState().card) schedule(); else { clearInterval(tickTimer); tickTimer = 0; } }, 1000);
  }
  // set() is called many times a second by a busy worker: the DOM is written once a frame (or after 100 ms when no
  // frame comes, a hidden page)
  function schedule() {
    if (renderPending) return;
    var fired = false;
    function go() { if (fired) return; fired = true; renderPending = 0; render(); }
    renderPending = requestAnimationFrame(go);
    setTimeout(go, 100);
  }
  function cancel() {
    var s = cardState(), h = s.canceller || (s.top && s.top.cancelOpt ? s.top : null);
    if (!h || h.cancelledFlag) return false;
    h.cancelledFlag = true;
    crumb('progress: ' + h.title + ' cancelled');
    emit('cancel', h);
    if (typeof h.cancelOpt === 'function') { try { h.cancelOpt(); } catch (e) { console.warn(e); } }
    render();
    return true;
  }
  // Esc presses Cancel while a card with Cancel is up (before the one-Esc rule ends a command underneath)
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    var s = cardState();
    if (!s.card || !s.canceller || s.canceller.cancelledFlag) return;
    e.preventDefault(); e.stopImmediatePropagation();
    cancel();
  }, true);
  // a handle whose caller forgot try / finally: closed when the error reaches the window. "Fresh" = begun or set in the
  // task that threw (cleared at its microtask checkpoint); an unhandled rejection is reported after that checkpoint, so
  // it also takes handles touched in the last 50 ms. Handles of other operations (a worker rebuild in flight) stay.
  function closeOrphans(rejection) {
    var t = nowMs(), n = 0;
    stack.slice().forEach(function (h) { if (h.fresh || (rejection && t - h.touched < 50)) { close(h); n++; } });
    return n;
  }
  window.addEventListener('error', function () { closeOrphans(false); });
  window.addEventListener('unhandledrejection', function () { closeOrphans(true); });

  // ---- helpers --------------------------------------------------------------------------------------------------
  function paint() {
    return new Promise(function (resolve) {
      var done = false;
      function fin() { if (!done) { done = true; resolve(); } }
      try { requestAnimationFrame(function () { setTimeout(fin, 0); }); } catch (e) { }
      setTimeout(fin, 120);   // a hidden page has no frames
    });
  }
  function heavy() {
    var App = UI.App || {}, m = App.mesh, n = App.model && App.model.features ? App.model.features.length : 0;
    return !!((m && m.triCount >= HEAVY.tris) || n >= HEAVY.features);
  }
  function run(title, fn, opts) {
    opts = opts || {};
    var pre = !!(opts.paint || (opts.heavy !== false && opts.card && heavy()));
    if (!pre) {
      var h = begin(title, opts), r;
      try { r = fn(h); }
      catch (e) { h.done(); throw e; }
      if (r && typeof r.then === 'function') return r.then(function (v) { h.done(); return v; }, function (e) { h.done(); throw e; });
      h.done();
      return r;
    }
    var o = {}; Object.keys(opts).forEach(function (k) { o[k] = opts[k]; }); o.delay = 0;
    var hp = begin(title, o);
    return paint().then(function () { return fn(hp); }).then(function (v) { hp.done(); return v; }, function (e) { hp.done(); throw e; });
  }
  function listen(fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }
  // tests: drop every handle (a test that stopped half way leaves nothing on screen for the next group)
  function reset() { stack.slice().forEach(close); }

  // the two (hidden) elements exist from the start, so the window's DOM is the same before and after an operation
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureEls); else ensureEls();

  UI.progress = {
    begin: begin, active: active, run: run, paint: paint, heavy: heavy, listen: listen, cancel: cancel, reset: reset, closeOrphans: closeOrphans,
    heavyAt: HEAVY, DEFAULT_DELAY: DEFAULT_DELAY,
    shown: function () { var s = cardState(); return { status: !!s.top, card: !!s.card, title: s.top ? s.top.title : null, cardTitle: s.card ? s.card.title : null }; }
  };
})(UI);
