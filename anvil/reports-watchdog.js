// reports-watchdog.js — the browser's not-responding watch (lane reports, rfMI). A dedicated worker runs on its own
// thread, so it keeps going while the page's main thread is stuck. The page (ui-reports.js) sends a heartbeat every
// 250 ms ({ type: 'hb', t, gap }: gap = the time since its previous tick) and its breadcrumbs. When no heartbeat has
// come for freezeMs (3 s) the worker marks the freeze open in IndexedDB with the last crumbs, so a tab closed while
// frozen is reported on the next load (ui-reports.js checkLastSession). When the heartbeat comes back it tells the
// page how long the freeze lasted ({ type: 'freeze', ms, startedAt, operation }). No call stack is possible here.
'use strict';
var S = { session: null, dbName: 'anvil-reports', freezeMs: 3000, startedAt: 0, lastHb: 0, crumbs: [], operation: [], freeze: null, timer: null, lastSave: 0 };
var dbP = null;
function db() {
  if (dbP) return dbP;
  dbP = new Promise(function (res, rej) {
    var q = indexedDB.open(S.dbName, 1);
    q.onupgradeneeded = function () { var d = q.result; if (!d.objectStoreNames.contains('reports')) d.createObjectStore('reports', { keyPath: 'id' }); if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' }); };
    q.onsuccess = function () { res(q.result); };
    q.onerror = function () { rej(q.error); };
  });
  dbP.catch(function () { dbP = null; });
  return dbP;
}
function save() {
  if (!S.session) return;
  S.lastSave = Date.now();
  var rec = { id: S.session, startedAt: S.startedAt, lastSeen: Date.now(), lastHb: S.lastHb, crumbs: S.crumbs.slice(-200), operation: S.operation, freeze: S.freeze };
  db().then(function (d) { var t = d.transaction('sessions', 'readwrite'); t.objectStore('sessions').put(rec); }, function () { });
}
function check() {
  var t = Date.now();
  if (!S.freeze && !S.hidden && t - S.lastHb > S.freezeMs) { S.freeze = { since: S.lastHb, reported: false }; save(); return; }
  if (t - S.lastSave > 2000) save();
}
self.onmessage = function (e) {
  var m = e.data || {};
  if (m.type === 'start') {
    S.session = m.session; S.dbName = m.db || S.dbName; S.freezeMs = m.freezeMs || S.freezeMs;
    S.startedAt = S.lastHb = Date.now();
    S.crumbs = (m.crumbs || []).slice(-200);
    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(check, 250);
    save();
  } else if (m.type === 'hb') {
    var t = Date.now(), gap = m.gap || 0;
    S.lastHb = t;
    // a hidden tab: its timers are slowed, so its gaps are not freezes (an open one is dropped)
    S.hidden = !!m.hidden;
    if (S.hidden) { if (S.freeze) { S.freeze = null; save(); } return; }
    // the page's own gap is the better measure (the heartbeat that was due came late by the block's length); half an
    // interval is taken off, the average wait before the block started
    if (S.freeze || gap > S.freezeMs + 250) {
      var ms = Math.max(gap - 125, S.freeze ? t - S.freeze.since - 125 : 0);
      if (gap > 0 && S.freeze) ms = gap - 125;
      self.postMessage({ type: 'freeze', ms: ms, startedAt: t - ms, operation: S.operation, session: S.session });
      S.freeze = null;
      save();
    }
  } else if (m.type === 'crumbs') {
    (m.list || []).forEach(function (c) { S.crumbs.push(c); });
    if (S.crumbs.length > 200) S.crumbs.splice(0, S.crumbs.length - 200);
    if (m.extra && m.extra.operation) S.operation = m.extra.operation;
  } else if (m.type === 'reported') {
    save();
  } else if (m.type === 'stop') {
    if (S.timer) clearInterval(S.timer);
    S.timer = null;
    var id = S.session;
    if (id) db().then(function (d) { var tr = d.transaction('sessions', 'readwrite'); tr.objectStore('sessions').delete(id); }, function () { });
    S.session = null;
  }
};
