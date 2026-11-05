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

contextBridge.exposeInMainWorld('anvilDesktop', {
  isDesktop: true,
  version: info.version,
  checkForUpdates: () => ipcRenderer.invoke('anvil-desktop:check-updates'),
  occtHost,
  // Windows' own Open / Save dialogs (main.js). open({ filters }) -> { path, name, data: Uint8Array } | { error } | null
  // (cancelled); saveDialog({ name, filters, kind: 'document' | 'export', title }) -> { path, name } | null;
  // write(path, data, { sibling }) -> { path, bytes } | { error, code } (only a path picked in a dialog this session);
  // setDocument(path | null): the open document's file (the window title shows its name).
  // dropped(file): a File the user dropped on the window (ui-app.js openDroppedFile) -> { path, name } | null. Only a
  // File that is a real file on disk has a path (webUtils.getPathForFile; a File the page made itself has none), and
  // main.js then lets Ctrl+S write back to that one path, as for a file picked in the Open box.
  files: {
    dropped: (file) => {
      let p = '';
      try { p = webUtils.getPathForFile(file) || ''; } catch (e) { p = ''; }
      return p ? ipcRenderer.invoke('anvil-desktop:dropped-file', p) : Promise.resolve(null);
    },
    open: (o) => ipcRenderer.invoke('anvil-desktop:open-dialog', o || {}),
    saveDialog: (o) => ipcRenderer.invoke('anvil-desktop:save-dialog', o || {}),
    write: (p, data, o) => ipcRenderer.invoke('anvil-desktop:write-file', p, data, o || {}),
    setDocument: (p) => ipcRenderer.invoke('anvil-desktop:set-document', p || null)
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
