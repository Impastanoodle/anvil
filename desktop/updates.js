// updates.js — Anvil's updates from a folder (the GitHub repo is private, so no web updates). desktop/release.js puts
// "Anvil Setup <version>.exe" and latest.json { version, file, sha256, date, notes } in the release folder; this
// module looks there at start-up (after a short delay, never blocking it) and every few hours. When latest.json names
// a newer version whose installer is there and matches its sha256, the page shows a small prompt ("Anvil x.y.z is
// ready — Restart to update / Later", drawn by preload.js). Restart copies the installer to the temp folder, checks
// it again, quits Anvil (the normal close, so unsaved-work questions still come up) and runs the installer silently
// for this user with --force-run, which starts the new Anvil when it is done.
// settings.json in the app's user-data folder (%APPDATA%\Anvil): { updateFolder, checkEveryHours }. A missing folder
// means no checks and no messages.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function newer(a, b) {   // is version a newer than b ("1.2.3")
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0), pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256'), s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

function create(opts) {
  // opts: { app, currentVersion, settings() -> object, log(event, data), offer(info), defaultFolder }
  const state = { offered: null, skipped: {}, timer: null, pendingInstaller: null, checking: false };

  async function check(manual) {
    if (state.checking) return { state: 'busy' };
    state.checking = true;
    try {
      const s = opts.settings();
      const folder = s.updateFolder;
      if (!folder || !fs.existsSync(folder)) { opts.log('update-check', { result: 'no folder', folder }); return { state: 'no folder', folder }; }
      const latestFile = path.join(folder, 'latest.json');
      if (!fs.existsSync(latestFile)) { opts.log('update-check', { result: 'no latest.json', folder }); return { state: 'no release', folder }; }
      const latest = JSON.parse(fs.readFileSync(latestFile, 'utf8').replace(/^﻿/, ''));
      if (!latest || !latest.version || !latest.file || !latest.sha256) { opts.log('update-check', { result: 'bad latest.json' }); return { state: 'bad latest.json' }; }
      if (!newer(latest.version, opts.currentVersion)) { opts.log('update-check', { result: 'up to date', latest: latest.version }); return { state: 'up to date', latest: latest.version }; }
      if (!manual && state.skipped[latest.version]) return { state: 'skipped', latest: latest.version };
      const installer = path.join(folder, path.basename(latest.file));
      if (!fs.existsSync(installer)) { opts.log('update-check', { result: 'installer missing', installer }); return { state: 'installer missing' }; }
      const hash = await sha256File(installer);
      if (hash.toLowerCase() !== String(latest.sha256).toLowerCase()) { opts.log('update-check', { result: 'sha256 mismatch', installer }); return { state: 'sha256 mismatch' }; }
      state.offered = { version: latest.version, notes: latest.notes || '', installer, sha256: hash };
      opts.log('update-offered', { version: latest.version, installer });
      opts.offer({ version: latest.version, notes: latest.notes || '', current: opts.currentVersion });
      return { state: 'ready', latest: latest.version };
    } catch (e) {
      opts.log('update-check', { result: 'error', message: e.message });
      return { state: 'error', message: e.message };
    } finally { state.checking = false; }
  }

  function start() {
    const hours = Math.max(0.25, +opts.settings().checkEveryHours || 2);
    setTimeout(() => check(false), +process.env.ANVIL_UPDATE_DELAY_MS || 8000);
    state.timer = setInterval(() => check(false), hours * 3600 * 1000);
  }

  function later() { if (state.offered) state.skipped[state.offered.version] = true; opts.log('update-later', {}); }

  // copies the installer out of the release folder, checks it again and arms the install; the caller then quits
  async function prepareInstall() {
    const o = state.offered;
    if (!o) return false;
    const dir = path.join(os.tmpdir(), 'anvil-update');
    fs.mkdirSync(dir, { recursive: true });
    const copy = path.join(dir, path.basename(o.installer));
    fs.copyFileSync(o.installer, copy);
    if ((await sha256File(copy)) !== o.sha256) throw new Error('the installer copy did not match its sha256');
    state.pendingInstaller = copy;
    opts.log('update-armed', { installer: copy });
    return true;
  }
  function cancelInstall() { state.pendingInstaller = null; }
  // called from will-quit: runs the armed installer silently for this user, then it starts the new Anvil
  function runPendingInstall() {
    if (!state.pendingInstaller) return false;
    const child = spawn(state.pendingInstaller, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    state.pendingInstaller = null;
    return true;
  }
  return { check, start, later, prepareInstall, cancelInstall, runPendingInstall, state, newer };
}

module.exports = { create, newer, sha256File };
