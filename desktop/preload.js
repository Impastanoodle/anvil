// preload.js — the small bridge between Anvil's page and the desktop app (sandboxed, context-isolated).
// window.anvilDesktop = { isDesktop: true, version, checkForUpdates() } tells the page it runs in the Windows app.
// The update prompt ("Anvil x.y.z is ready — Restart to update / Later") is drawn here, over the page, so Anvil's
// own files need no change for it.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

let info = { version: '' };
try { info = ipcRenderer.sendSync('anvil-desktop:info') || info; } catch (e) { /* main not ready */ }

contextBridge.exposeInMainWorld('anvilDesktop', {
  isDesktop: true,
  version: info.version,
  checkForUpdates: () => ipcRenderer.invoke('anvil-desktop:check-updates')
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
