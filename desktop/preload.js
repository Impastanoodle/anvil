// preload.js — the small bridge between Anvil's page and the desktop app (sandboxed, context-isolated).
// window.anvilDesktop = { isDesktop: true, version, checkForUpdates(), occtHost } tells the page it runs in the Windows
// app; occtHost (null when the native engine is switched off) reaches OpenCascade for Windows (below).
// The update prompt ("Anvil x.y.z is ready — Restart to update / Later") is drawn here, over the page, so Anvil's
// own files need no change for it.
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

let info = { version: '' };
try { info = ipcRenderer.sendSync('anvil-desktop:info') || info; } catch (e) { /* main not ready */ }

// OpenCascade for Windows (main.js starts occt-host.js in its own process and hands this page a MessagePort to it).
// ui-occt.js wraps it as a Worker: id = start(onMessage), post(id, message), stop(id) (kills the process). A process
// that cannot load the engine, or stops by itself, sends { type: 'hostFailed', message } and the page uses the
// WebAssembly worker instead.
const hosts = new Map();   // id -> { onMessage, port, queue }
let hostSeq = 0;
ipcRenderer.on('anvil-desktop:occt-port', (e, d) => {
  const h = hosts.get(d && d.id), port = e.ports && e.ports[0];
  if (!h || !port) { if (port) port.close(); return; }
  h.port = port;
  port.onmessage = (ev) => { if (hosts.get(d.id) === h) h.onMessage(ev.data); };
  h.queue.splice(0).forEach((m) => port.postMessage(m));
});
ipcRenderer.on('anvil-desktop:occt-exit', (e, d) => {
  const h = hosts.get(d && d.id);
  if (h) h.onMessage({ type: 'hostFailed', message: d.message });
});
function stopHost(id) {
  const h = hosts.get(id);
  if (!h) return;
  hosts.delete(id);
  if (h.port) h.port.close();
  ipcRenderer.send('anvil-desktop:occt-stop', id);
}
window.addEventListener('pagehide', () => { Array.from(hosts.keys()).forEach(stopHost); });
const occtHost = !info.occtNative ? null : {
  start: (onMessage) => {
    const id = 'h' + (++hostSeq) + '-' + Date.now().toString(36);
    hosts.set(id, { onMessage, port: null, queue: [] });
    ipcRenderer.send('anvil-desktop:occt-start', id);
    return id;
  },
  post: (id, m) => { const h = hosts.get(id); if (!h) return; if (h.port) h.port.postMessage(m); else h.queue.push(m); },
  stop: stopHost
};

// ---- problem reports (lane reports; ui-reports.js, main.js "problem reports") ----------------------------------------
// A heartbeat every second: main.js calls the window not responding when it stops for 5 s (this script runs on the
// page's own thread, so a busy page stops it too). Breadcrumbs go to main.js as they happen (ui-reports.js batches them
// every 250 ms), so a page that never comes back still has them in its report. Open / Save boxes and dropped files are
// crumbed here (kind and size only) and sent at once, before a big file can freeze the page.
// A hidden window (minimised, covered) has its timers slowed by Chromium, down to once a minute after 5 minutes: it says
// so, and main.js does not count the gaps then.
setInterval(() => ipcRenderer.send('anvil-desktop:hb'), 1000);
ipcRenderer.send('anvil-desktop:hb');
document.addEventListener('visibilitychange', () => ipcRenderer.send('anvil-desktop:hb', document.hidden ? 'hidden' : 'visible'));
let reportListener = null;
const reportQueue = [];
ipcRenderer.on('anvil-desktop:report', (e, m) => { if (reportListener) reportListener(m); else reportQueue.push(m); });
function extOf(name) { const m = /\.([A-Za-z0-9_]{1,8})(\.json)?$/.exec(String(name || '')); return m ? '.' + m[1].toLowerCase() + (m[2] || '') : '(no extension)'; }
function sizeOf(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' bytes'; }
function lenOf(d) { return d == null ? 0 : typeof d === 'string' ? d.length : d.byteLength != null ? d.byteLength : d.length || 0; }
function deskCrumb(text) {
  ipcRenderer.send('anvil-desktop:crumbs', [{ at: Date.now(), text }], null);
  try { window.dispatchEvent(new CustomEvent('anvil-desktop-crumb', { detail: '\u0001' + text })); } catch (e) { /* no page yet */ }
}
const reports = {
  // the page's breadcrumbs ([{ at, text }]) and, every few seconds, { state, operation, secrets, progressLoaded }
  crumbs: (list, extra) => ipcRenderer.send('anvil-desktop:crumbs', list || [], extra || null),
  // a report the page made: { id, json, screenshot, model } -> { dir }
  save: (o) => ipcRenderer.invoke('anvil-desktop:report-save', o || {}),
  // the page completes a report main.js wrote (not responding): { state, console, crumbs, secrets }
  complete: (dir, o) => ipcRenderer.invoke('anvil-desktop:report-complete', dir, o || {}),
  addModel: (dir, json) => ipcRenderer.invoke('anvil-desktop:report-model', dir, json),
  list: () => ipcRenderer.invoke('anvil-desktop:report-list'),
  read: (dir) => ipcRenderer.invoke('anvil-desktop:report-read', dir),
  folder: () => ipcRenderer.invoke('anvil-desktop:report-folder'),
  openFolder: (dir) => ipcRenderer.invoke('anvil-desktop:report-open', dir || null),
  copy: (text) => ipcRenderer.invoke('anvil-desktop:copy', String(text)),
  setWatch: (on) => ipcRenderer.send('anvil-desktop:report-watch', !!on),
  // fn({ id, kind, dir, durationMs, operation, summary, previous, quiet }): a report main.js wrote
  onReport: (fn) => { reportListener = fn; reportQueue.splice(0).forEach((m) => fn(m)); }
};

contextBridge.exposeInMainWorld('anvilDesktop', {
  reports,
  isDesktop: true,
  version: info.version,
  checkForUpdates: () => ipcRenderer.invoke('anvil-desktop:check-updates'),
  occtHost,
  // Windows' own Open / Save dialogs (main.js). open({ filters }) -> { path, name, data: Uint8Array } | { error } | null
  // (cancelled); saveDialog({ name, filters, kind: 'document' | 'export', title, near }) -> { path, name } | null
  // (near: a file opened this session, an import or a drawing: the box starts in its folder);
  // write(path, data, { sibling }) -> { path, bytes } | { error, code } (only a path picked in a dialog this session);
  // setDocument(path | null, title?): the open document's file and the page's title for it (the window title).
  // dropped(file): a File the user dropped on the window (ui-app.js openDroppedFile) -> { path, name } | null. Only a
  // File that is a real file on disk has a path (webUtils.getPathForFile; a File the page made itself has none), and
  // main.js then lets Ctrl+S write back to that one path, as for a file picked in the Open box.
  files: {
    dropped: (file) => {
      let p = '';
      try { p = webUtils.getPathForFile(file) || ''; } catch (e) { p = ''; }
      if (p) deskCrumb('file dropped on the window: ' + extOf(p) + ', ' + sizeOf(file && file.size || 0));
      return p ? ipcRenderer.invoke('anvil-desktop:dropped-file', p) : Promise.resolve(null);
    },
    open: (o) => ipcRenderer.invoke('anvil-desktop:open-dialog', o || {}).then((r) => { if (r && r.data) deskCrumb('file opened (Open box): ' + extOf(r.name) + ', ' + sizeOf(lenOf(r.data))); return r; }),
    saveDialog: (o) => ipcRenderer.invoke('anvil-desktop:save-dialog', o || {}),
    write: (p, data, o) => { deskCrumb('file written: ' + extOf(o && o.sibling || p) + ', ' + sizeOf(lenOf(data))); return ipcRenderer.invoke('anvil-desktop:write-file', p, data, o || {}); },
    setDocument: (p, title) => ipcRenderer.invoke('anvil-desktop:set-document', p || null, typeof title === 'string' ? title : null),
    // File ▸ Recent Documents (main.js recent.json, paths only): list() -> [{ path, name, folder, at, missing }] newest
    // first; add(path) (a path the page may already write) / remove(path) / clear() -> the list; open(path) -> as open()
    // gives, or { missing: true, path, name } (only a path on the list; it becomes writable as an Open-box pick does)
    recent: {
      list: () => ipcRenderer.invoke('anvil-desktop:recent-list'),
      add: (p) => ipcRenderer.invoke('anvil-desktop:recent-add', p),
      remove: (p) => ipcRenderer.invoke('anvil-desktop:recent-remove', p),
      clear: () => ipcRenderer.invoke('anvil-desktop:recent-clear'),
      open: (p) => ipcRenderer.invoke('anvil-desktop:recent-open', p).then((r) => { if (r && r.data) deskCrumb('file opened (Recent Documents): ' + extOf(r.name) + ', ' + sizeOf(lenOf(r.data))); return r; })
    }
  }
});

function el(tag, style, text) {
  const e = document.createElement(tag);
  if (style) e.style.cssText = style;
  if (text != null) e.textContent = text;
  return e;
}
function showUpdate(u) {
  const old = document.getElementById('anvil-desktop-update');
  if (old) old.remove();
  const box = el('div', 'position:fixed;right:16px;bottom:40px;z-index:2147483647;max-width:360px;padding:12px 14px;background:#fff;color:#1d2733;' +
    'border:1px solid #9fb3c8;border-left:4px solid #2a6fb5;border-radius:4px;box-shadow:0 4px 18px rgba(0,0,0,.25);font:13px/1.4 "Segoe UI",Arial,sans-serif;');
  box.id = 'anvil-desktop-update';
  box.appendChild(el('div', 'font-weight:600;margin-bottom:4px;', 'Anvil ' + u.version + ' is ready'));
  if (u.notes) box.appendChild(el('div', 'color:#4a5866;margin-bottom:8px;', u.notes));
  box.appendChild(el('div', 'color:#4a5866;margin-bottom:10px;', 'You have ' + u.current + '. Restart to install it; your parts and settings stay.'));
  const row = el('div', 'display:flex;gap:8px;justify-content:flex-end;');
  const later = el('button', 'padding:4px 12px;border:1px solid #9fb3c8;background:#f3f6f9;border-radius:3px;cursor:pointer;font:inherit;', 'Later');
  const go = el('button', 'padding:4px 12px;border:1px solid #2a6fb5;background:#2a6fb5;color:#fff;border-radius:3px;cursor:pointer;font:inherit;', 'Restart to update');
  later.id = 'anvil-desktop-update-later';
  go.id = 'anvil-desktop-update-restart';
  later.onclick = () => { box.remove(); ipcRenderer.send('anvil-desktop:update-later'); };
  go.onclick = () => { go.disabled = true; go.textContent = 'Restarting…'; ipcRenderer.send('anvil-desktop:update-restart'); };
  row.appendChild(later); row.appendChild(go);
  box.appendChild(row);
  (document.body || document.documentElement).appendChild(box);
}
ipcRenderer.on('anvil-desktop:update', (e, u) => {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => showUpdate(u), { once: true });
  else showUpdate(u);
});
ipcRenderer.on('anvil-desktop:update-failed', (e, msg) => {
  const box = document.getElementById('anvil-desktop-update');
  if (box) box.remove();
  alert('The update could not be started: ' + msg);
});
