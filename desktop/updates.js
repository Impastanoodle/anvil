// updates.js — Anvil's updates from a folder (the GitHub repo is private, so no web updates). desktop/release.js puts
// "Anvil Setup <version>.exe" and latest.json { version, file, sha256, date, notes } in the release folder; this
// module looks there at start-up (after a short delay, never blocking it) and every few hours. When latest.json names
// a newer version whose installer is there and matches its sha256, the page shows a small prompt ("Anvil x.y.z is
// ready — Restart to update / Later", drawn by preload.js). Restart copies the installer to the temp folder, checks
// it again, quits Anvil (the normal close, so unsaved-work questions still come up) and hands the installer to a
// helper (HELPER, Windows PowerShell) that waits for Anvil to end, runs it silently for this user with --force-run
// (which starts the new Anvil when it is done) and starts the installed Anvil again if it did not. main.js keeps the
// job in window-state.json (pendingUpdate); the next start says whether the update installed (afterRestart). Every
// step goes to update.log in the user-data folder.
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

// electron-builder's NSIS installer (package.json build.nsis: oneClick, per user): /S silent, --updated as
// electron-updater passes it, --force-run starts the app when a silent install is done
const INSTALLER_ARGS = ['/S', '--updated', '--force-run'];
// The helper, run by Windows PowerShell 5.1 as a script block (read from update-helper.ps1.txt; not a script file, so the
// execution policy does not apply). $JobFile names update-job.json: { pid, installer, args, log, from, to, relaunch: { exe, args }, settleMs }.
// It waits for Anvil to end (90 s at most; the installer closes it otherwise), runs the installer and waits for it;
// exit code 0: the installer starts the new Anvil (--force-run), or the helper does after settleMs; any other code,
// or an installer that did not start: the helper starts the installed Anvil again (the old version when the
// installer stopped before replacing it), which then says the update was not installed (main.js afterRestart).
const HELPER = String.raw`
$ErrorActionPreference = 'Continue'
$job = Get-Content -Raw -LiteralPath $JobFile | ConvertFrom-Json
function Log($step, $extra) {
  $o = [ordered]@{ at = (Get-Date).ToUniversalTime().ToString('o'); step = $step; by = 'helper' }
  if ($extra) { foreach ($k in $extra.Keys) { $o[$k] = $extra[$k] } }
  try { [IO.File]::AppendAllText($job.log, ($o | ConvertTo-Json -Compress) + [Environment]::NewLine) } catch { }
}
function Quote($a) { if ($a -match '[\s"]') { '"' + ($a -replace '"', '\"') + '"' } else { $a } }
function ArgLine($list) { (@($list) | Where-Object { $_ -ne $null -and $_ -ne '' } | ForEach-Object { Quote ([string]$_) }) -join ' ' }
function Launch($why) {
  $exe = $job.relaunch.exe
  if (-not (Test-Path -LiteralPath $exe)) { Log 'no-program-to-start' @{ exe = $exe; why = $why }; return }
  $al = ArgLine $job.relaunch.args
  try {
    if ($al) { $p = Start-Process -FilePath $exe -ArgumentList $al -PassThru } else { $p = Start-Process -FilePath $exe -PassThru }
    Log 'started-anvil' @{ exe = $exe; why = $why; pid = $p.Id }
  } catch { Log 'could-not-start-anvil' @{ exe = $exe; message = $_.Exception.Message } }
}
Log 'helper-started' @{ pid = $PID; waitingFor = $job.pid; installer = $job.installer }
$t0 = Get-Date
while ((Get-Process -Id $job.pid -ErrorAction SilentlyContinue) -and ((Get-Date) - $t0).TotalSeconds -lt 90) { Start-Sleep -Milliseconds 200 }
if (Get-Process -Id $job.pid -ErrorAction SilentlyContinue) { Log 'anvil-still-running' @{ seconds = 90; note = 'the installer closes it' } }
else { Log 'anvil-closed' @{ seconds = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1) } }
$code = $null
try {
  $p = Start-Process -FilePath $job.installer -ArgumentList (ArgLine $job.args) -PassThru -ErrorAction Stop
  $null = $p.Handle
  Log 'installer-started' @{ pid = $p.Id; args = (ArgLine $job.args) }
  $p.WaitForExit(); $code = $p.ExitCode
} catch { Log 'installer-did-not-start' @{ message = $_.Exception.Message } }
Log 'installer-finished' @{ exitCode = $code }
if ($code -eq 0) {
  $seen = $false; $t1 = Get-Date
  while (-not $seen -and ((Get-Date) - $t1).TotalMilliseconds -lt $job.settleMs) {
    Start-Sleep -Milliseconds 500
    $seen = [bool](Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $job.relaunch.exe } | Select-Object -First 1)
  }
  if ($seen) { Log 'anvil-running-again' @{ exe = $job.relaunch.exe } } else { Launch 'the installer did not start Anvil' }
} else {
  Log 'install-failed' @{ exitCode = $code }
  Launch 'the install failed'
}
Log 'helper-done' $null
`;

function create(opts) {
  // opts: { app, currentVersion, settings() -> object, log(event, data), offer(info), defaultFolder }
  const state = { offered: null, skipped: {}, timer: null, pendingInstaller: null, checking: false };
  // update.log in the user-data folder: one JSON line per step of an install (Anvil, then the helper), so the first
  // real update can be followed afterwards. Kept under ~256 KB (the older part goes to update.log.old).
  function logFile() { return path.join(opts.userData || os.tmpdir(), 'update.log'); }
  function ulog(step, data) {
    const f = logFile();
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      try { if (fs.statSync(f).size > 256 * 1024) fs.renameSync(f, f + '.old'); } catch (e) { /* none yet */ }
      fs.appendFileSync(f, JSON.stringify(Object.assign({ at: new Date().toISOString(), step, by: 'anvil ' + opts.currentVersion }, data || {})) + '\n');
    } catch (e) { /* the log never stops an update */ }
    opts.log(step, data);
  }
  function readLog() {
    try {
      return fs.readFileSync(logFile(), 'utf8').split(/\r?\n/).filter(Boolean)
        .map((l) => { try { return JSON.parse(l.replace(/^﻿/, '')); } catch (e) { return { step: '?', raw: l }; } });
    } catch (e) { return []; }
  }

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
    ulog('update-restart-clicked', { version: o.version, current: opts.currentVersion });
    const dir = process.env.ANVIL_UPDATE_TEMP || path.join(os.tmpdir(), 'anvil-update');
    fs.mkdirSync(dir, { recursive: true });
    const copy = path.join(dir, path.basename(o.installer));
    fs.copyFileSync(o.installer, copy);
    if ((await sha256File(copy)) !== o.sha256) { ulog('update-copy-bad', { copy }); throw new Error('the installer copy did not match its sha256'); }
    state.pendingInstaller = copy;
    ulog('update-armed', { version: o.version, installer: copy, from: o.installer });
    return true;
  }
  function cancelInstall() { if (state.pendingInstaller) ulog('update-cancelled', { reason: 'the close was cancelled' }); state.pendingInstaller = null; }
  // called from will-quit: hands the armed installer to the helper (HELPER above), which waits for this process to
  // end, runs the installer silently for this user, and starts the installed Anvil again if the installer did not (a
  // failed install). Returns the job ({ from, to, ... }) or null. With no PowerShell the installer is started
  // directly, as before.
  function runPendingInstall() {
    if (!state.pendingInstaller) return null;
    const installer = state.pendingInstaller, o = state.offered || {};
    state.pendingInstaller = null;
    const job = { pid: process.pid, installer, args: INSTALLER_ARGS.slice(), log: logFile(), from: opts.currentVersion, to: o.version || null,
      relaunch: opts.relaunch ? opts.relaunch() : { exe: process.execPath, args: [] }, settleMs: +process.env.ANVIL_UPDATE_SETTLE_MS || 30000 };
    const jobFile = path.join(path.dirname(installer), 'update-job.json'), helperFile = path.join(path.dirname(installer), 'update-helper.ps1.txt');
    try {
      fs.writeFileSync(jobFile, JSON.stringify(job, null, 1));
      fs.writeFileSync(helperFile, HELPER);
      // PowerShell reads the helper's text and runs it as a script block (not a script file: no execution policy);
      // the paths travel in the environment, so the command line is plain base64. cmd's "start" gives PowerShell its
      // own (hidden) console: started straight from here without one (detached) it does not run, and a child that is
      // not detached ends with Anvil.
      const boot = '$JobFile = $env:ANVIL_UPDATE_JOB; & ([scriptblock]::Create([IO.File]::ReadAllText($env:ANVIL_UPDATE_HELPER)))';
      const encoded = Buffer.from(boot, 'utf16le').toString('base64');
      const sys = process.env.SystemRoot || 'C:\\Windows';
      const ps = path.join(sys, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), cmd = path.join(sys, 'System32', 'cmd.exe');
      if (!fs.existsSync(ps) || !fs.existsSync(cmd)) throw new Error('no PowerShell at ' + ps);
      const child = spawn(cmd, ['/d', '/c', 'start', '""', '/min', ps, '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
        { detached: true, stdio: 'ignore', windowsHide: true, env: Object.assign({}, process.env, { ANVIL_UPDATE_JOB: jobFile, ANVIL_UPDATE_HELPER: helperFile }) });
      child.unref();
      ulog('update-helper-started', { helperPid: child.pid, installer, args: job.args, relaunch: job.relaunch });
    } catch (e) {
      ulog('update-helper-failed', { message: e.message, fallback: 'the installer is started directly' });
      try {
        const child = spawn(installer, INSTALLER_ARGS, { detached: true, stdio: 'ignore', windowsHide: false });
        child.unref();
        ulog('update-installer-started', { installer, args: INSTALLER_ARGS });
      } catch (e2) { ulog('update-installer-failed', { message: e2.message }); return null; }
    }
    return job;
  }
  // at start-up: the job left by the last run says whether the update installed (this is the new version) or not
  function afterRestart(pending) {
    if (!pending || !pending.to) return null;
    if (pending.to === opts.currentVersion) { ulog('update-succeeded', { from: pending.from, to: pending.to }); return { ok: true, from: pending.from, to: pending.to }; }
    ulog('update-not-installed', { wanted: pending.to, running: opts.currentVersion, lastSteps: readLog().slice(-6).map((e) => e.step + (e.exitCode != null ? ' ' + e.exitCode : '')) });
    return { ok: false, from: pending.from, to: pending.to, log: logFile() };
  }
  return { check, start, later, prepareInstall, cancelInstall, runPendingInstall, afterRestart, state, newer, log: ulog, logFile, readLog };
}

module.exports = { create, newer, sha256File, INSTALLER_ARGS, HELPER };
