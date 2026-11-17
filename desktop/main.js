// main.js — Anvil as a Windows program (Electron). Runs the same static files as anvil/serve.ps1, offline, in its own
// window:
// - app://anvil/ serves the anvil/ folder (bundled in resources\anvil by the installer; ../anvil when run from the
//   repo). The scheme is privileged (standard, secure, fetch, CORS, streams), so module workers, the 48 MB
//   OpenCascade engine, IndexedDB and localStorage work, and the origin is the same in every version: settings, the
//   recovered work and the engine store survive an update (they live in %APPDATA%\Anvil).
// - app://anvil/api/dxf2dwg and api/dwg2dxf: the DWG converters of serve.ps1 (converters.js).
// - downloads (parts, DXF, DWG, STEP, PDF, SVG) open the Windows Save As dialog with the suggested name; file inputs
//   open the normal Open dialog (Chromium's own). File ▸ Open / Save / Save As / exports go through anvilDesktop.files
//   (preload.js): Windows' own Open / Save boxes, writes only to a path picked in one ("Open / Save dialogs" below).
// - links to the web open in the user's browser; a minimal menu (Alt shows it); one instance; window size and place
//   remembered; updates from a release folder (updates.js).
// Test hooks (environment, for scripts only): ANVIL_ROOT serves another anvil folder (e.g. the repo, with its tests),
// ANVIL_USER_DATA moves the user-data folder, ANVIL_TEST_SAVE_DIR saves downloads there without a dialog,
// ANVIL_TEST_LOG appends one JSON line per event (downloads, update checks, converter runs) to that file;
// ANVIL_TEST_OPEN_FILE answers the Open box, ANVIL_TEST_UNLOAD_ANSWERS ("cancel,close") the unsaved-work question,
// ANVIL_TEST_DIALOGS=log logs the "update not installed" box, ANVIL_TEST_VERSION plays another version,
// ANVIL_UPDATE_TEMP / ANVIL_UPDATE_SETTLE_MS move the update's temp folder / shorten the helper's wait.
// - OpenCascade: the native engine (OpenCascade 7.6.3 for Windows, desktop/native) runs in its own process
//   (occt-host.js); the page talks to it through a MessagePort and falls back to the WebAssembly worker if it cannot
//   start. ANVIL_OCCT_NATIVE names another addon folder; ANVIL_OCCT_ENGINE=wasm (or "occtEngine": "wasm" in
//   settings.json) keeps the WebAssembly engine.
// - problem reports ("problem reports" below): not responding, crashes, errors and Help ▸ Report a Problem… write a
//   report folder under <userData>\reports for the user to hand to Claude (desktop/README.md *Problem reports*).
//   ANVIL_TEST_DIALOGS=log also stands in for the "reload after a crash" box (reloads at once).
'use strict';
const { app, BrowserWindow, protocol, session, shell, Menu, dialog, ipcMain, screen, utilityProcess, MessageChannelMain, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const converters = require('./converters');
const updates = require('./updates');

if (process.env.ANVIL_USER_DATA) app.setPath('userData', path.resolve(process.env.ANVIL_USER_DATA));
app.setAppUserModelId('com.anvil.cad');

const ROOT = path.resolve(process.env.ANVIL_ROOT || (app.isPackaged ? path.join(process.resourcesPath, 'anvil') : path.join(__dirname, '..', 'anvil')));
const ORIGIN = 'app://anvil';
const ICON = path.join(__dirname, 'assets', 'icon.png');
const VERSION = process.env.ANVIL_TEST_VERSION || app.getVersion();   // a test can play the next version (check.js update-restart)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.wasm': 'application/wasm', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.gz': 'application/gzip' };

function testLog(event, data) {
  const f = process.env.ANVIL_TEST_LOG;
  if (!f) return;
  try { fs.appendFileSync(f, JSON.stringify(Object.assign({ at: new Date().toISOString(), event }, data || {})) + '\n'); } catch (e) { /* ignore */ }
}

// ---- settings (user-editable) and state (the app's own) in the user-data folder ----------------------------------
// the Desktop that holds Output: %USERPROFILE%\Desktop (the shop PC), else the Desktop Windows reports (kept in OneDrive on the home PC)
const DESKTOP = (() => { const d = path.join(app.getPath('home'), 'Desktop'); if (fs.existsSync(path.join(d, 'Output'))) return d; try { return app.getPath('desktop'); } catch (e) { return d; } })();
const DEFAULT_RELEASES = path.join(DESKTOP, 'Output', 'Anvil Releases');
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } }
function writeJson(file, obj) { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2)); } catch (e) { /* ignore */ } }
function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }
function settings() {
  const s = readJson(settingsFile());
  const out = Object.assign({ updateFolder: DEFAULT_RELEASES, checkEveryHours: 2 }, s || {});
  if (!s) writeJson(settingsFile(), out);   // written once so it can be found and edited
  return out;
}
function stateFile() { return path.join(app.getPath('userData'), 'window-state.json'); }
const appState = readJson(stateFile()) || {};
function saveState() { writeJson(stateFile(), appState); }

// ---- the app:// scheme -------------------------------------------------------------------------------------------
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

function notFound(p, head) {
  return new Response(head ? null : '404 ' + p, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
async function serve(req) {
  const u = new URL(req.url);
  let p;
  try { p = decodeURIComponent(u.pathname); } catch (e) { return notFound(u.pathname, false); }
  const head = req.method === 'HEAD';
  if (u.host !== 'anvil') return notFound(p, head);
  if (p === '/api/dxf2dwg') return converters.dxf2dwg(req, ROOT, (m) => testLog('converter', { msg: m }));
  if (p === '/api/dwg2dxf') return converters.dwg2dxf(req, ROOT, (m) => testLog('converter', { msg: m }));
  // test hook (desktop/check.js reports, only with ANVIL_TEST_LOG): answers after ?ms, so a synchronous request to it
  // keeps the page's main thread waiting outside JavaScript
  if (p === '/api/test-wait' && process.env.ANVIL_TEST_LOG) { await new Promise((res) => setTimeout(res, Math.min(60000, +u.searchParams.get('ms') || 0))); return new Response('waited', { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } }); }
  if (req.method !== 'GET' && !head) return new Response(null, { status: 405 });
  if (p === '/') p = '/index.html';
  let file = path.join(ROOT, p);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return notFound(p, head);
  let st;
  try { st = await fs.promises.stat(file); if (st.isDirectory()) { file = path.join(file, 'index.html'); st = await fs.promises.stat(file); } } catch (e) { return notFound(p, head); }
  if (!st.isFile()) return notFound(p, head);
  const headers = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': String(st.size) };
  if (head) return new Response(null, { status: 200, headers });
  return new Response(await fs.promises.readFile(file), { status: 200, headers });
}

// ---- the window --------------------------------------------------------------------------------------------------
let win = null;
function onScreen(b) {
  if (!b || !(b.width > 200) || !(b.height > 150)) return false;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x < a.x + a.width - 50 && b.x + b.width > a.x + 50 && b.y >= a.y - 10 && b.y < a.y + a.height - 50;
  });
}
function createWindow() {
  const saved = appState.window || {};
  const opts = { width: 1440, height: 900, minWidth: 800, minHeight: 500, show: false, title: 'Anvil', icon: ICON, backgroundColor: '#f4f6f8', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, plugins: true } };
  if (onScreen(saved.bounds)) Object.assign(opts, saved.bounds);
  win = new BrowserWindow(opts);
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  // a page title of Anvil's own wins; with none, "Anvil <version>"
  // an open document with a path on disk shows its file name ("bracket.anvil.json * - Anvil")
  win.on('page-title-updated', (e, title) => {
    const t = composeTitle(win.webContents, title);
    if (t) { e.preventDefault(); win.setTitle(t); return; }
    if (!title || /^app:\/\//.test(title)) { e.preventDefault(); win.setTitle('Anvil ' + VERSION); }
  });
  win.on('close', () => {
    appState.window = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    saveState();
  });
  win.on('closed', () => { win = null; });
  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    if (url.startsWith(ORIGIN + '/') || url === 'about:blank' || url.startsWith('blob:')) {
      return { action: 'allow', overrideBrowserWindowOptions: { icon: ICON, autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true, plugins: true } } };
    }
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN + '/')) return;
    e.preventDefault();
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
  });
  // Anvil asks before leaving with unsaved changes (beforeunload): Electron would silently refuse to close, so ask here
  // (Restart to update asks the same question, in its own words; Cancel keeps Anvil open and the update offered)
  wc.on('will-prevent-unload', (e) => {
    const updating = !!updater.state.pendingInstaller;
    testLog('unload-question', { updating });
    const q = updating
      ? { buttons: ['Restart and update', 'Cancel'], message: 'Install Anvil ' + ((updater.state.offered || {}).version || '') + ' and restart?', detail: 'Changes you made may not be saved. Cancel, then save your work, and choose Restart to update again.' }
      : { buttons: ['Close Anvil', 'Cancel'], message: 'Close Anvil?', detail: 'Changes you made may not be saved. Anvil keeps a recovery copy of open work.' };
    const answers = process.env.ANVIL_TEST_UNLOAD_ANSWERS;   // a test stands in for the question: "cancel,close"
    let r;
    if (answers) { const list = answers.split(','); const a = list[unloadAnswered++] || list[list.length - 1]; r = a === 'close' ? 0 : 1; testLog('unload-answer', { answer: a }); }
    else r = dialog.showMessageBoxSync(win, Object.assign({ type: 'question', defaultId: 1, cancelId: 1, title: 'Anvil' }, q));
    if (r === 0) e.preventDefault();
    else if (updating) { updater.cancelInstall(); if (updater.state.offered) sendOffer(updater.state.offered); }
  });
  wc.on('console-message', (e) => { if (e.level === 'error') testLog('console-error', { message: e.message, source: e.sourceId, line: e.lineNumber }); });
  wc.on('did-navigate', () => { pageLoaded = false; docPaths.delete(wc.id); });
  wc.on('did-finish-load', () => { pageLoaded = true; if (updater.state.offered) sendOffer(updater.state.offered); });
  watchWindow(win);   // problem reports: heartbeat, not responding, renderer crash
  win.loadURL(ORIGIN + '/index.html');
}

// ---- downloads: the Windows Save As dialog -----------------------------------------------------------------------
function setupDownloads() {
  session.defaultSession.on('will-download', (e, item) => {
    const name = item.getFilename() || 'download';
    const testDir = process.env.ANVIL_TEST_SAVE_DIR;
    const ext = path.extname(name).slice(1).toLowerCase();
    const dir = appState.saveFolder && fs.existsSync(appState.saveFolder) ? appState.saveFolder : app.getPath('documents');
    const dialogOpts = { title: 'Save As', defaultPath: path.join(dir, name),
      filters: ext ? [{ name: ext.toUpperCase() + ' file', extensions: [ext] }, { name: 'All files', extensions: ['*'] }] : [] };
    testLog('download-offered', { name, defaultPath: dialogOpts.defaultPath, filters: dialogOpts.filters.map((f) => f.extensions.join(',')) });
    if (testDir) item.setSavePath(path.join(testDir, name));   // a test stands in for the dialog
    else item.setSaveDialogOptions(dialogOpts);
    item.once('done', (ev, state) => {
      testLog('download-done', { name, state, path: item.getSavePath() });
      if (state === 'completed' && !testDir) { appState.saveFolder = path.dirname(item.getSavePath()); saveState(); }
    });
  });
}

// ---- Windows' own Open / Save dialogs for the page (preload.js anvilDesktop.files) -------------------------------
// The page never names a path to write on its own: a path is writable only once the user picked it in an Open or Save
// dialog in this session (Open makes the opened document's own path writable, so Ctrl+S saves over it with no
// dialog). Writes go to a temporary file beside the target first and then replace it, so a failed write (read-only,
// locked, a network folder gone) leaves the old file as it was; the document stays open in Anvil either way.
// Test hooks: ANVIL_TEST_SAVE_DIR answers the Save dialog with that folder + the suggested name, ANVIL_TEST_OPEN_FILE
// answers the Open dialog with that file ("cancel": cancelled); both log 'dialog-save' / 'dialog-open'.
const allowedPaths = new Set();   // lower-cased full paths picked in a dialog (or dropped on the window) this session
const docPaths = new Map();       // webContents id -> the open document's path (window title)
function pathKey(p) { return path.resolve(String(p)).toLowerCase(); }
function allow(p) { allowedPaths.add(pathKey(p)); }
function lastFolder() {
  return appState.saveFolder && fs.existsSync(appState.saveFolder) ? appState.saveFolder : app.getPath('documents');
}
function rememberFolder(p) { appState.saveFolder = path.dirname(p); saveState(); }
function cleanName(n) { return String(n || 'Untitled').replace(/^.*[\\/]/, '').replace(/[<>:"|?*\x00-\x1f]+/g, '_') || 'Untitled'; }
function cleanFilters(f) {
  return (Array.isArray(f) ? f : []).slice(0, 20).map((x) => ({ name: String(x && x.name || 'Files').slice(0, 120),
    extensions: (Array.isArray(x && x.extensions) ? x.extensions : ['*']).map((e) => String(e).replace(/[^\w*]/g, '')).filter(Boolean).slice(0, 20) }))
    .filter((x) => x.extensions.length);
}
// a plain-English reason for a failed read / write
function fileError(e, p) {
  const name = path.basename(p || '');
  const why = { EACCES: name + ' is read-only, or you do not have permission to change it.', EPERM: name + ' is read-only, or you do not have permission to change it.',
    EBUSY: name + ' is open in another program. Close it there and save again.', ENOENT: 'The folder ' + path.dirname(p || '') + ' is not there (a network drive offline?).',
    ENOTDIR: 'The folder ' + path.dirname(p || '') + ' is not there.', EROFS: name + ' is on a read-only drive.', ENOSPC: 'The drive is full.',
    EEXIST: name + ' could not be replaced.' }[e && e.code];
  return { error: why || ((e && e.message) || String(e)), code: (e && e.code) || null };
}
function toBuffer(data) {
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  throw new Error('nothing to write');
}
async function writeSafely(target, data) {
  const buf = toBuffer(data);
  const tmp = target + '.anvil-' + process.pid + '-' + Date.now().toString(36) + '.tmp';
  try {
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, target);
  } catch (e) {
    try { await fs.promises.unlink(tmp); } catch (e2) { /* never made */ }
    throw e;
  }
  return buf.length;
}
// the page writes its own title (ui-app.js titleText: "bracket.anvil.json * - Anvil", "Draw1 - Sheet1 * - Anvil");
// a title of Anvil's own shape is shown as it is, else the document's file name with the page's "*"
function composeTitle(wc, pageTitle) {
  const t = String(pageTitle || '');
  if (/ - Anvil$/.test(t) && t.length <= 300 && !/[\x00-\x1f]/.test(t)) return t;
  const p = docPaths.get(wc.id);
  if (!p) return null;
  return path.basename(p) + (/ \*( - Anvil)?$/.test(t) ? ' *' : '') + ' - Anvil';
}
ipcMain.handle('anvil-desktop:open-dialog', async (e, o) => {
  o = o || {};
  const w = BrowserWindow.fromWebContents(e.sender) || win;
  const opts = { title: 'Open', defaultPath: lastFolder(), properties: ['openFile'], filters: cleanFilters(o.filters) };
  testLog('dialog-open', { defaultPath: opts.defaultPath, filters: opts.filters.map((f) => f.extensions.join(',')) });
  let file;
  if (process.env.ANVIL_TEST_OPEN_FILE) file = process.env.ANVIL_TEST_OPEN_FILE === 'cancel' ? null : process.env.ANVIL_TEST_OPEN_FILE;
  else { const r = await dialog.showOpenDialog(w, opts); file = r.canceled ? null : r.filePaths[0]; }
  if (!file) return null;
  try {
    const st = await fs.promises.stat(file);
    if (st.size > 1024 * 1024 * 1024) return { error: path.basename(file) + ' is larger than 1 GB.' };
    const data = await fs.promises.readFile(file);
    allow(file); rememberFolder(file);
    testLog('file-opened', { path: file, bytes: data.length });
    return { path: file, name: path.basename(file), data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  } catch (err) { return Object.assign({ path: file }, fileError(err, file)); }
});
ipcMain.handle('anvil-desktop:save-dialog', async (e, o) => {
  o = o || {};
  const w = BrowserWindow.fromWebContents(e.sender) || win;
  const doc = docPaths.get(e.sender.id);
  // near: a file this session opened (an imported STEP / DXF, a drawing): the box starts in its folder (SolidWorks
  // saves an imported file's new part beside it). Only a path already allowed counts; the folder is just the default.
  const near = o.near && allowedPaths.has(pathKey(o.near)) && fs.existsSync(path.dirname(path.resolve(String(o.near)))) ? path.dirname(path.resolve(String(o.near))) : null;
  const dir = near || (o.kind === 'document' && doc && fs.existsSync(path.dirname(doc)) ? path.dirname(doc) : lastFolder());
  const opts = { title: o.title ? String(o.title).slice(0, 80) : 'Save As', defaultPath: path.join(dir, cleanName(o.name)), filters: cleanFilters(o.filters) };
  testLog('dialog-save', { defaultPath: opts.defaultPath, filters: opts.filters.map((f) => f.extensions.join(',')), kind: o.kind || null, near: !!near });
  let file;
  if (process.env.ANVIL_TEST_SAVE_DIR) file = process.env.ANVIL_TEST_SAVE_DIR === 'cancel' ? null : path.join(process.env.ANVIL_TEST_SAVE_DIR, path.basename(opts.defaultPath));
  else { const r = await dialog.showSaveDialog(w, opts); file = r.canceled ? null : r.filePath; }
  if (!file) return null;
  allow(file); rememberFolder(file);
  return { path: file, name: path.basename(file) };
});
// a file the user dropped on the window (preload.js files.dropped, which only has a path for a real File from a drop
// or a file input): that exact file, if it is a plain file of at most 1 GB, becomes writable like one picked in the
// Open box (Ctrl+S writes back to it). Nothing else is opened up: no folder, no other name.
ipcMain.handle('anvil-desktop:dropped-file', async (e, p) => {
  if (typeof p !== 'string' || !p || !path.isAbsolute(p)) return null;
  const file = path.resolve(p);
  try {
    const st = await fs.promises.stat(file);
    if (!st.isFile() || st.size > 1024 * 1024 * 1024) return null;
  } catch (err) { return null; }
  allow(file);
  testLog('file-dropped', { path: file });
  return { path: file, name: path.basename(file) };
});
// write(path, data, { sibling }): path must have been picked in a dialog (or opened) this session; sibling writes
// a companion file of that name (an OBJ's .mtl) into the same folder
ipcMain.handle('anvil-desktop:write-file', async (e, target, data, o) => {
  o = o || {};
  if (!target || !allowedPaths.has(pathKey(target))) { testLog('write-refused', { path: String(target) }); return { error: 'Anvil can only save to a file you chose in a Save or Open box.', code: 'NOTALLOWED' }; }
  let file = path.resolve(String(target));
  if (o.sibling != null) {
    const s = String(o.sibling);
    if (!/^[^\\/:*?"<>|]+\.(mtl)$/i.test(s)) return { error: 'not a companion file name: ' + s, code: 'NOTALLOWED' };
    file = path.join(path.dirname(file), s);
  }
  try {
    const bytes = await writeSafely(file, data);
    testLog('file-written', { path: file, bytes });
    return { path: file, bytes };
  } catch (err) { const r = fileError(err, file); testLog('write-failed', { path: file, code: r.code, message: r.error }); return r; }
});
// ---- Recent Documents (File menu, File ▸ Browse Recent Documents; ui-app.js "Recent documents (rfIK)") ----------
// The last RECENT_MAX documents opened or saved, newest first, kept in recent.json in the user-data folder: paths only,
// never file contents. The page can add only a path it may already write (picked in a box, dropped, or reopened from
// this list); reopening one through recent-open makes that one path writable again, exactly as picking it in the Open
// box does. A path that is not there any more is listed as missing (a network folder that does not answer within
// 1.5 s is not called missing).
const RECENT_MAX = 10;
function recentFile() { return path.join(app.getPath('userData'), 'recent.json'); }
function recentRead() {
  const j = readJson(recentFile());
  return (j && Array.isArray(j.files) ? j.files : []).filter((f) => f && typeof f.path === 'string' && path.isAbsolute(f.path)).slice(0, RECENT_MAX);
}
function recentWrite(list) { writeJson(recentFile(), { files: list.slice(0, RECENT_MAX) }); }
function statQuick(p) {
  return Promise.race([fs.promises.stat(p).then((st) => (st.isFile() ? 'file' : 'other'), () => 'missing'), new Promise((res) => setTimeout(() => res('slow'), 1500))]);
}
async function recentList() {
  const list = recentRead();
  const states = await Promise.all(list.map((f) => statQuick(f.path)));
  return list.map((f, i) => ({ path: f.path, name: path.basename(f.path), folder: path.dirname(f.path), at: f.at || null, missing: states[i] === 'missing' || states[i] === 'other' }));
}
ipcMain.handle('anvil-desktop:recent-list', () => recentList());
ipcMain.handle('anvil-desktop:recent-add', (e, p) => {
  if (typeof p !== 'string' || !p || !allowedPaths.has(pathKey(p))) { testLog('recent-refused', { path: String(p) }); return recentList(); }
  const file = path.resolve(p), k = pathKey(file);
  recentWrite([{ path: file, at: new Date().toISOString() }].concat(recentRead().filter((f) => pathKey(f.path) !== k)));
  testLog('recent-added', { path: file });
  return recentList();
});
ipcMain.handle('anvil-desktop:recent-remove', (e, p) => {
  const k = typeof p === 'string' && p ? pathKey(p) : null;
  if (k) recentWrite(recentRead().filter((f) => pathKey(f.path) !== k));
  testLog('recent-removed', { path: String(p) });
  return recentList();
});
ipcMain.handle('anvil-desktop:recent-clear', () => { recentWrite([]); testLog('recent-cleared', {}); return []; });
// reopen one: only a path on the list; { path, name, data } as the Open box gives, or { missing: true, path, name }
ipcMain.handle('anvil-desktop:recent-open', async (e, p) => {
  const k = typeof p === 'string' && p ? pathKey(p) : null;
  const hit = k && recentRead().find((f) => pathKey(f.path) === k);
  if (!hit) return { error: 'That file is not on the Recent Documents list.', code: 'NOTALLOWED' };
  const file = path.resolve(hit.path);
  let st;
  try { st = await fs.promises.stat(file); } catch (err) { testLog('recent-missing', { path: file }); return { missing: true, path: file, name: path.basename(file) }; }
  if (!st.isFile()) return { missing: true, path: file, name: path.basename(file) };
  if (st.size > 1024 * 1024 * 1024) return { path: file, name: path.basename(file), error: path.basename(file) + ' is larger than 1 GB.' };
  try {
    const data = await fs.promises.readFile(file);
    allow(file); rememberFolder(file);
    testLog('file-opened', { path: file, bytes: data.length, via: 'recent' });
    return { path: file, name: path.basename(file), data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  } catch (err) { return Object.assign({ path: file, name: path.basename(file) }, fileError(err, file)); }
});

// the page names its open document (null: none); only a path picked in a dialog is taken. The window title shows it.
// title: the page's title for it (ui-app.js syncDocument), which may not have reached wc.getTitle() yet
ipcMain.handle('anvil-desktop:set-document', (e, p, title) => {
  const wc = e.sender;
  if (p && allowedPaths.has(pathKey(p))) docPaths.set(wc.id, path.resolve(String(p))); else docPaths.delete(wc.id);
  const w = BrowserWindow.fromWebContents(wc);
  const pt = typeof title === 'string' && title ? title : wc.getTitle();
  if (w) w.setTitle(composeTitle(wc, pt) || (pt && !/^app:\/\//.test(pt) ? pt : 'Anvil ' + VERSION));
  testLog('document', { asked: p || null, path: docPaths.get(wc.id) || null, title: w ? w.getTitle() : null });
  return docPaths.get(wc.id) || null;
});

// ---- menu (Anvil draws its own SolidWorks-style menus in the page; this one shows with Alt) -----------------------
function about() {
  dialog.showMessageBox(win, { type: 'info', title: 'About Anvil', buttons: ['OK'], icon: ICON, message: 'Anvil ' + VERSION,
    detail: 'Parametric CAD for sheet metal, parts, assemblies and drawings.\n\nElectron ' + process.versions.electron + ', Chromium ' + process.versions.chrome +
      '\n' + occtAbout() + '\nProgram files: ' + ROOT + '\nSettings: ' + app.getPath('userData') });
}
async function checkNow() {
  const r = await updater.check(true);
  if (r.state === 'ready') return;
  const msg = { 'up to date': 'Anvil ' + VERSION + ' is the newest version.', 'no folder': 'The update folder was not found:\n' + (r.folder || ''),
    'no release': 'No release has been put in the update folder yet.' }[r.state] || ('No update: ' + r.state + (r.message ? ' (' + r.message + ')' : ''));
  dialog.showMessageBox(win, { type: 'info', title: 'Anvil updates', buttons: ['OK'], message: msg, detail: 'Update folder: ' + settings().updateFolder + '\nSet in ' + settingsFile() });
}
function setupMenu() {
  const wc = () => win && win.webContents;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ label: 'Quit', click: () => app.quit() }] },
    { label: 'View', submenu: [
      { label: 'Reload', click: () => wc() && wc().reload() },
      { label: 'Toggle Developer Tools', accelerator: 'F12', click: () => wc() && wc().toggleDevTools() },
      { type: 'separator' },
      { label: 'Actual Size', click: () => wc() && wc().setZoomLevel(0) },
      { label: 'Zoom In', click: () => wc() && wc().setZoomLevel(wc().getZoomLevel() + 0.5) },
      { label: 'Zoom Out', click: () => wc() && wc().setZoomLevel(wc().getZoomLevel() - 0.5) },
      { type: 'separator' },
      { label: 'Toggle Full Screen', accelerator: 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) }
    ] },
    { label: 'Help', submenu: [
      { label: 'Check for Updates', click: checkNow },
      { label: 'Open Update Settings', click: () => { settings(); shell.openPath(settingsFile()); } },
      { type: 'separator' },
      { label: 'About Anvil', click: about }
    ] }
  ]));
}

// ---- OpenCascade for Windows in its own process (occt-host.js) ---------------------------------------------------
// One utility process per engine start (the page's startWorker); the page stops it (terminate: Cancel, a model switch)
// by killing it, so a long build never blocks the next one. The page and the process talk directly on a MessagePort.
const OCCT_ADDON = path.resolve(process.env.ANVIL_OCCT_NATIVE ||
  (app.isPackaged ? path.join(process.resourcesPath, 'occt-native') : path.join(DESKTOP, 'Output', 'Anvil Native', 'addon')));
// shipped unpacked (asarUnpack), next to app.asar
const OCCT_HOST = path.join(__dirname, 'occt-host.js').replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
const occtHosts = new Map();   // id -> { child, wc, stopped }
const occtInfo = { state: 'not started yet', loadMs: null, message: null };
function occtNative() { return process.env.ANVIL_OCCT_ENGINE !== 'wasm' && settings().occtEngine !== 'wasm' && fs.existsSync(OCCT_HOST); }
function occtStart(wc, id) {
  const fail = (message) => { Object.assign(occtInfo, { state: 'failed', message }); testLog('occt-native-failed', { id, message }); if (!wc.isDestroyed()) wc.send('anvil-desktop:occt-exit', { id, message }); };
  let child;
  try { child = utilityProcess.fork(OCCT_HOST, ['--root', ROOT, '--addon', OCCT_ADDON], { serviceName: 'Anvil OpenCascade', stdio: 'pipe' }); }
  catch (e) { fail('the engine process did not start: ' + e.message); return; }
  const h = { child, wc, stopped: false, t0: Date.now() };
  occtHosts.set(id, h);
  const ch = new MessageChannelMain();
  child.postMessage({ type: 'port' }, [ch.port1]);
  wc.postMessage('anvil-desktop:occt-port', { id }, [ch.port2]);
  let errText = '';
  if (child.stdout) child.stdout.on('data', () => { });
  if (child.stderr) child.stderr.on('data', (d) => { errText = (errText + d).slice(-2000); });
  child.on('message', (m) => {
    if (m && m.type === 'ready') { Object.assign(occtInfo, { state: 'native', loadMs: m.loadMs, message: null }); testLog('occt-native-ready', { id, pid: child.pid, loadMs: m.loadMs, startMs: Date.now() - h.t0 }); }
    if (m && m.type === 'hostFailed') { Object.assign(occtInfo, { state: 'failed', message: m.message }); testLog('occt-native-failed', { id, message: m.message }); }
  });
  child.on('exit', (code) => {
    occtHosts.delete(id);
    testLog('occt-native-exit', { id, code, stopped: h.stopped });
    if (!h.stopped) fail('the engine process stopped (exit code ' + code + ')' + (errText.trim() ? ': ' + errText.trim().split('\n').pop() : ''));
  });
}
function occtStop(id) { const h = occtHosts.get(id); if (!h || h.stopped) return; h.stopped = true; try { h.child.kill(); } catch (e) { /* gone */ } }
function occtStopAll(wc) { for (const [id, h] of occtHosts) if (!wc || h.wc === wc) occtStop(id); }
function occtAbout() {
  if (!occtNative()) return 'OpenCascade: WebAssembly engine (the Windows engine is switched off)';
  if (occtInfo.state === 'native') return 'OpenCascade: 7.6.3 for Windows (native, loaded in ' + Math.round(occtInfo.loadMs) + ' ms)';
  if (occtInfo.state === 'failed') return 'OpenCascade: WebAssembly engine (the Windows engine did not run: ' + occtInfo.message + ')';
  return 'OpenCascade: 7.6.3 for Windows (' + occtInfo.state + ')';
}
ipcMain.on('anvil-desktop:occt-start', (e, id) => occtStart(e.sender, String(id)));
ipcMain.on('anvil-desktop:occt-stop', (e, id) => occtStop(String(id)));
app.on('web-contents-created', (e, wc) => { wc.once('destroyed', () => occtStopAll(wc)); wc.on('render-process-gone', () => occtStopAll(wc)); });
app.on('before-quit', () => occtStopAll());

// ---- updates -----------------------------------------------------------------------------------------------------
let pageLoaded = false;   // set once the page has loaded; an offer found earlier is sent then (did-finish-load)
function sendOffer(o) { if (win && pageLoaded) win.webContents.send('anvil-desktop:update', { version: o.version, notes: o.notes, current: VERSION }); }
let unloadAnswered = 0;
// relaunch: what the helper starts when the installer did not (this exe, with the arguments it was started with)
const updater = updates.create({ currentVersion: VERSION, settings, log: testLog, offer: (o) => sendOffer(o), userData: app.getPath('userData'),
  relaunch: () => ({ exe: process.execPath, args: process.argv.slice(1) }) });
// the last run handed an update to the helper: did it install? (window-state.json pendingUpdate, then cleared)
function reportLastUpdate() {
  const pending = appState.pendingUpdate;
  if (!pending) return;
  delete appState.pendingUpdate; saveState();
  const r = updater.afterRestart(pending);
  if (!r || r.ok) return;
  testLog('update-not-installed-shown', { wanted: r.to, running: VERSION });
  if (process.env.ANVIL_TEST_DIALOGS === 'log') return;   // a test reads the log instead of the box
  dialog.showMessageBox(win, { type: 'warning', title: 'Anvil update', buttons: ['OK', 'Open the update log'], defaultId: 0, cancelId: 0,
    message: 'Anvil ' + r.to + ' was not installed.',
    detail: 'You are still using Anvil ' + VERSION + '; your parts and settings are as they were. Try Restart to update again, or run "Anvil Setup ' + r.to + '.exe" from the update folder yourself.\n\nWhat happened is written in ' + r.log })
    .then((x) => { if (x.response === 1) shell.openPath(r.log); }).catch(() => {});
}
ipcMain.on('anvil-desktop:info', (e) => { e.returnValue = { version: VERSION, occtNative: occtNative() }; });
ipcMain.handle('anvil-desktop:check-updates', () => updater.check(true));
ipcMain.on('anvil-desktop:update-later', () => updater.later());
ipcMain.on('anvil-desktop:update-restart', async (e) => {
  try {
    if (!(await updater.prepareInstall())) throw new Error('there is no update ready');
    updater.log('update-quitting', {});
    app.quit();
  } catch (err) { updater.log('update-failed', { message: err.message }); e.sender.send('anvil-desktop:update-failed', err.message); }
});
app.on('will-quit', () => {
  testLog('quitting', {});
  sessionEnd();   // problem reports: this run ended cleanly
  const job = updater.runPendingInstall();
  if (job) { appState.pendingUpdate = { from: job.from, to: job.to, at: new Date().toISOString() }; saveState(); testLog('update-installing', { to: job.to }); }
});

// ---- problem reports (lane reports; anvil/ui-reports.js is the page side and the report format) -----------------
// <userData>\reports\<yyyy-mm-dd_hh-mm-ss>_<kind>\ holds report.md (for Claude and the user), report.json (the same,
// structured), screenshot.png when one could be taken, and model.anvil.json only when the user ticked Include the
// model. The newest REPORTS_KEEP folders are kept. Nothing is uploaded anywhere.
// - Not responding: the page (preload.js) sends a heartbeat every second; when it stops for 5 s (or the window's
//   'unresponsive' event fires) this process attaches the DevTools protocol to the window (webContents.debugger),
//   pauses it, takes the call stack and resumes, every 5 s while the freeze lasts (up to 12 samples), and writes the
//   report at once with the breadcrumbs the page sent as they happened. Each sample keeps how long its pause took to
//   arrive (at once = a JavaScript loop; late = the main thread was outside JavaScript) and which process used the
//   processor meanwhile (lane freezerec: "one sample" and "which process was working" below). When the page answers again it gets the report
//   ('anvil-desktop:report'), adds its state and console, and shows its bar. A run that ends while frozen (closed,
//   killed) is told on the next start (.session.json).
// - render-process-gone (the window crashed), child-process-gone (a helper process crashed), this process's own
//   uncaughtException / unhandledRejection: a 'crash' report; after a window crash the window is reloaded (it asks,
//   unless ANVIL_TEST_DIALOGS=log) and the page offers the work AutoRecover kept.
const ReportFormat = (() => { try { return require(path.join(ROOT, 'ui-reports.js')); } catch (e) { return null; } })();
const REPORTS_KEEP = 30, FREEZE_MS = 5000, SAMPLE_EVERY_MS = 5000, MAX_SAMPLES = 12, CRUMB_RING = 200, GESTURE_KEEP = 30;
const rp = { crumbs: [], extra: null, extraAt: 0, watch: true, hb: new Map(), freeze: null, notices: [], lastStamp: '', scripts: new Map(), listening: new WeakSet(), cpu: [] };
function reportsDir() { return path.join(app.getPath('userData'), 'reports'); }
function insideReports(dir) {
  if (typeof dir !== 'string' || !dir) return null;
  const root = path.resolve(reportsDir()), d = path.resolve(dir);
  return d.startsWith(root + path.sep) && path.dirname(d) === root && fs.existsSync(d) ? d : null;
}
function rpScrub(text, secrets) { return ReportFormat ? ReportFormat.scrub(text, secrets) : String(text); }
function newReportDir(kind, at) {
  const stamp = ReportFormat ? ReportFormat.stamp(at) : new Date(at).toISOString().replace(/[:.]/g, '-');
  let id = stamp + '_' + kind, n = 2;
  while (fs.existsSync(path.join(reportsDir(), id))) id = stamp + '_' + kind + '-' + (n++);
  const dir = path.join(reportsDir(), id);
  fs.mkdirSync(dir, { recursive: true });
  return { id, dir };
}
function pruneReports() {
  try {
    const root = reportsDir();
    const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d_/.test(d.name)).map((d) => d.name).sort();
    dirs.slice(0, Math.max(0, dirs.length - REPORTS_KEEP)).forEach((n) => { try { fs.rmSync(path.join(root, n), { recursive: true, force: true }); testLog('report-pruned', { id: n }); } catch (e) { /* in use */ } });
  } catch (e) { /* no folder yet */ }
}
// the memory of Anvil's processes (working set), e.g. "window 812 MB, GPU 310 MB, main 95 MB …, total 1.3 GB"
function procMemory() {
  try {
    const by = {};
    let total = 0;
    app.getAppMetrics().forEach((m) => {
      const mb = (m.memory && m.memory.workingSetSize || 0) / 1024;
      const k = m.type === 'Tab' ? 'window' : m.type === 'Browser' ? 'main' : m.type === 'Utility' ? (m.serviceName || m.name || 'utility') : m.type;
      by[k] = (by[k] || 0) + mb; total += mb;
    });
    return Object.keys(by).sort((a, b) => by[b] - by[a]).map((k) => k + ' ' + Math.round(by[k]) + ' MB').join(', ') + '; total ' + (total / 1024).toFixed(2) + ' GB';
  } catch (e) { return 'unknown'; }
}
function writeReport(dir, r) {
  if (ReportFormat) r.summary = ReportFormat.summary(r);
  r.state = r.state || {};
  if (!r.state['process memory']) r.state['process memory'] = procMemory();
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(r, null, 1));
  fs.writeFileSync(path.join(dir, 'report.md'), ReportFormat ? ReportFormat.markdown(r) : '# Anvil problem report: ' + r.kind + '\n\n(see report.json)\n');
}
function readReportJson(dir) { return readJson(path.join(dir, 'report.json')); }
// a report written here (not responding, crash), from what the page last sent
function mainReport(kind, at, more) {
  const x = rp.extra || {}, sec = x.secrets || [];
  const scrubState = (s) => { const o = {}; Object.keys(s || {}).forEach((k) => { o[k] = typeof s[k] === 'string' ? rpScrub(s[k], sec) : s[k]; }); return o; };
  return Object.assign({ format: 'anvil-problem-report', v: 1, kind, at, version: VERSION, app: 'Windows app', startedAgo: at - rpStarted,
    operation: x.operation || [], progressLoaded: x.progressLoaded !== false,
    crumbs: rp.crumbs.map((c) => ({ at: c.at, text: rpScrub(c.text, sec), n: c.n })), console: [],
    state: scrubState(x.state), stateAt: rp.extraAt || null, stateNote: x.state ? null : 'the page had not described itself yet',
    files: { screenshot: false, model: false } }, more || {});
}
const rpStarted = Date.now();
function noticeToPage(m) {
  testLog('report-notice', { kind: m.kind, id: m.id, previous: !!m.previous });
  if (win && !win.isDestroyed() && pageLoaded) win.webContents.send('anvil-desktop:report', m);
  else rp.notices.push(m);
}
async function screenshotInto(dir, wc) {
  try {
    const img = await Promise.race([wc.capturePage(), new Promise((res) => setTimeout(() => res(null), 4000))]);
    if (!img || img.isEmpty()) return false;
    fs.writeFileSync(path.join(dir, 'screenshot.png'), img.toPNG());
    return true;
  } catch (e) { return false; }
}

// ---- the session marker: a run that ends while frozen is told on the next start
function sessionFile() { return path.join(reportsDir(), '.session.json'); }
function sessionWrite(o) { writeJson(sessionFile(), Object.assign({ pid: process.pid, startedAt: new Date(rpStarted).toISOString(), clean: false, freeze: null }, o || {})); }
function sessionStart() {
  const prev = readJson(sessionFile());
  if (prev && !prev.clean && prev.freeze && prev.freeze.dir) {
    const dir = insideReports(prev.freeze.dir), r = dir && readReportJson(dir);
    if (r) {
      r.ongoing = true;
      r.where = r.where || {};
      r.where.note = (r.where.note ? r.where.note + ' ' : '') + 'Anvil did not answer again: it was closed (or ended) while frozen.';
      try { writeReport(dir, r); } catch (e) { /* read-only? */ }
      testLog('report-previous-freeze', { id: r.id || path.basename(dir) });
      rp.notices.push({ id: path.basename(dir), kind: 'not-responding', dir, durationMs: r.durationMs, operation: r.operation || [], summary: r.summary, previous: true });
    }
  }
  sessionWrite();
}
function sessionEnd() { if (rp.freeze) return; sessionWrite({ clean: true }); }

// ---- not responding
function hbOf(wc) { let s = rp.hb.get(wc.id); if (!s) { s = { last: Date.now(), alive: false }; rp.hb.set(wc.id, s); } return s; }
ipcMain.on('anvil-desktop:hb', (e, vis) => {
  const s = hbOf(e.sender);
  s.last = Date.now();
  if (vis === 'hidden') s.hidden = true; else if (vis === 'visible') s.hidden = false;   // a hidden page's timers are slowed: not a freeze
  // rfOF: 'waiting' = the page is about to sit in window.print() until the user closes Windows' Print box (the
  // "stopped responding for 9.6 s" report of 2026-11-16 was that box). Its silence is not a freeze; any later
  // heartbeat means the page runs again.
  if ((vis === 'waiting') !== !!s.waiting) { s.waiting = vis === 'waiting'; testLog('page-waiting', { on: s.waiting }); }
  if (rp.freeze && rp.freeze.wc === e.sender) endFreeze();
});
// A gesture crumb (c.g: what the hand did in the graphics area, ui-reports.js "gestures") is sent when the gesture
// starts and again as it goes on and ends: the same g rewrites the line in place. Only the newest GESTURE_KEEP of them
// are kept, so a morning of orbiting does not push the commands out of the ring.
ipcMain.on('anvil-desktop:crumbs', (e, list, extra) => {
  (Array.isArray(list) ? list : []).slice(0, 400).forEach((c) => {
    if (!c || typeof c.text !== 'string') return;
    const last = rp.crumbs[rp.crumbs.length - 1], at = +c.at || Date.now(), text = c.text.slice(0, 300);
    if (c.g != null) {
      const g = String(c.g).slice(0, 24), n = c.n > 1 ? +c.n : undefined;
      for (let i = rp.crumbs.length - 1; i >= 0 && i >= rp.crumbs.length - 60; i--) if (rp.crumbs[i].g === g) { Object.assign(rp.crumbs[i], { at, text, n }); return; }
      rp.crumbs.push({ at, text, g, n });
      for (let i = rp.crumbs.length - 1, k = 0; i >= 0; i--) if (rp.crumbs[i].g != null && ++k > GESTURE_KEEP) rp.crumbs.splice(i, 1);
      return;
    }
    if (last && last.g == null && last.text === text && at - last.at < 1000) { last.n = (last.n || 1) + 1; last.at = at; return; }
    rp.crumbs.push({ at, text });
  });
  if (rp.crumbs.length > CRUMB_RING) rp.crumbs.splice(0, rp.crumbs.length - CRUMB_RING);
  if (extra && typeof extra === 'object') { rp.extra = extra; rp.extraAt = Date.now(); }
});
ipcMain.on('anvil-desktop:report-watch', (e, on) => {
  rp.watch = !!on;
  testLog('report-watch', { on: rp.watch });
  if (rp.watch) attachDebugger(e.sender); else releaseDebugger(e.sender);
});
function withTimeout(p, ms, what) { return Promise.race([p, new Promise((res, rej) => setTimeout(() => rej(new Error(what + ' timed out after ' + ms + ' ms')), ms))]); }
function shortUrl(u) { u = String(u || ''); return u.startsWith(ORIGIN + '/') ? u.slice(ORIGIN.length + 1) : rpScrub(u); }
// The DevTools protocol session is attached, and its debugger enabled, when the page has loaded, and both are kept:
// attaching and Debugger.enable need the window's own thread, so they cannot be done once it is stuck, while
// Debugger.pause is one of the few commands Chromium hands a busy thread as an interrupt. Breakpoints are switched
// off (setBreakpointsActive false), so a `debugger;` statement never stops Anvil; only Debugger.pause does. The cost
// is small (V8 keeps script sources; one scriptParsed message per new script); the not-responding switch in Tools ▸
// Options turns it off with the watch.
// Two things are listened to for as long as the session lives (lane freezerec, rfNZ):
// - Debugger.scriptParsed: the file of every script by its id. A paused call frame's own `url` is deprecated in the
//   protocol and comes back empty in this Electron (the 2026-11-16 report read "(anonymous)  ?:7765:17"), so a frame is
//   named through its location.scriptId. A script with no URL is told apart by who made it: no JavaScript stack, or
//   Electron's own bundle = injected (executeJavaScript, the DevTools console); a stack in the page = eval or new
//   Function (which of the two is read from its source when the window answers again).
// - Debugger.paused: every pause is answered with a resume at once (any pause here is ours: breakpoints are off), and
//   handed to the sample that asked for it, however late it arrives.
function scriptsOf(wc) { let m = rp.scripts.get(wc.id); if (!m) { m = new Map(); rp.scripts.set(wc.id, m); } return m; }
function listenDebugger(wc) {
  if (rp.listening.has(wc)) return;
  rp.listening.add(wc);
  const dbg = wc.debugger;
  dbg.on('message', (ev, method, p) => {
    if (method === 'Debugger.scriptParsed') {
      const m = scriptsOf(wc), top = p.stackTrace && p.stackTrace.callFrames && p.stackTrace.callFrames[0];
      const maker = top ? (top.url || (m.get(top.scriptId) || {}).url || '') : null;
      m.set(p.scriptId, { url: p.url || '', by: p.url ? null : maker == null || /^node:electron\//.test(maker) ? 'injected' : 'made' });
      if (m.size > 6000) { let n = 0; for (const [k, v] of m) if (!v.url) { m.delete(k); if (++n >= 2000) break; } }
    } else if (method === 'Debugger.paused') onPaused(wc, p);
  });
  dbg.on('detach', () => { rp.scripts.delete(wc.id); });
}
function attachDebugger(wc) {
  if (wc.isDestroyed()) return 'the window is gone';
  const dbg = wc.debugger;
  listenDebugger(wc);
  if (!dbg.isAttached()) {
    try { dbg.attach('1.3'); } catch (e) { testLog('report-debugger', { attached: false, message: e.message }); return e.message; }
  }
  dbg.sendCommand('Debugger.enable').then(() => dbg.sendCommand('Debugger.setBreakpointsActive', { active: false }))
    .then(() => testLog('report-debugger', { attached: true, enabled: true, scripts: scriptsOf(wc).size }), (e) => testLog('report-debugger', { attached: true, enabled: false, message: e.message }));
  return null;
}
function releaseDebugger(wc) {
  if (!wc || wc.isDestroyed() || !wc.debugger.isAttached()) return;
  wc.debugger.sendCommand('Debugger.disable').catch(() => {}).then(() => { try { wc.debugger.detach(); } catch (e) { /* already */ } });
}
// the file of a call frame: Anvil's own path ("ui-core.js"), or what a script with no URL is
function frameFile(wc, cf) {
  const sc = scriptsOf(wc).get(cf.location.scriptId), url = cf.url || (sc && sc.url) || '';
  if (url) return shortUrl(url);
  if (!sc) return '(no file: a script the debugger was not told about)';
  return sc.kind === 'function' ? '(new Function)' : sc.kind === 'eval' ? '(eval)' : sc.by === 'injected' ? '(injected)' : '(eval or new Function)';
}

// ---- which process was working: processor seconds of every process of Anvil, once a second
// app.getAppMetrics() costs about 0.1 ms. cumulativeCPUUsage is processor seconds since the process started, so the
// use between two snapshots is exact, as a percentage of one processor thread (a busy main thread reads 100 %).
function procName(m) {
  if (m.type === 'Tab') return 'window';
  if (m.type === 'Browser') return 'main';
  if (m.type !== 'Utility') return m.type;
  const n = m.serviceName || m.name || 'utility';
  return /NodeService/.test(n) ? 'OpenCascade' : /NetworkService/.test(n) ? 'network' : n.replace(/\.mojom\./, ' ').replace(/Service$/, '');
}
function cpuSnap() {
  try {
    const procs = new Map();
    app.getAppMetrics().forEach((m) => { procs.set(m.pid, { name: procName(m), sec: m.cpu && m.cpu.cumulativeCPUUsage, mb: Math.round((m.memory && m.memory.workingSetSize || 0) / 1024) }); });
    return { at: Date.now(), procs };
  } catch (e) { return null; }
}
// [{ name, cpu (% of one thread between the two snapshots), mb (now) }], the busiest first
function cpuBetween(a, b) {
  if (!a || !b || b.at - a.at < 200) return null;
  const by = new Map();
  for (const [pid, p] of b.procs) {
    const was = a.procs.get(pid), o = by.get(p.name) || { name: p.name, cpu: null, mb: 0 };
    if (was && typeof p.sec === 'number' && typeof was.sec === 'number') o.cpu = (o.cpu || 0) + Math.max(0, p.sec - was.sec) / ((b.at - a.at) / 1000) * 100;
    o.mb += p.mb;
    by.set(p.name, o);
  }
  return [...by.values()].map((o) => ({ name: o.name, cpu: o.cpu == null ? null : Math.round(o.cpu * 10) / 10, mb: o.mb })).sort((x, y) => (y.cpu || 0) - (x.cpu || 0));
}

// ---- one sample: the window is asked to pause; the answer (Debugger.paused, onPaused) may come at once or late
// A pause is an interrupt for running JavaScript: a loop takes it within milliseconds. A main thread that is not
// running JavaScript (painting, waiting for the graphics card, layout, garbage collection, a synchronous call) takes it
// only when it next runs some. So the time the pause took to arrive is kept (lateMs), and no pause is given up on: one
// that has not arrived is written into the report as waiting, and the next is asked only after it has.
function askSample(f) {
  const wc = f.wc;
  if (wc.isDestroyed() || f.pending) return;
  const pend = { sentAt: Date.now() };
  if (!wc.debugger.isAttached()) {
    const why = attachDebugger(wc);
    if (why) { f.samples.push({ afterMs: pend.sentAt - f.start, error: 'the debugger could not attach (' + why + '; are DevTools open on the window?)' }); return; }
    pend.cold = true;   // enabled only now: the wait for the pause includes the wait for Debugger.enable
  }
  f.pending = pend;
  wc.debugger.sendCommand('Debugger.pause').catch((e) => { pend.error = e.message; });
}
function onPaused(wc, p) {
  const at = Date.now();
  wc.debugger.sendCommand('Debugger.resume').catch(() => {});   // never leave Anvil stopped
  const f = rp.freeze, pend = f && f.wc === wc ? f.pending : null;
  if (!pend) { testLog('report-pause-stray', {}); return; }
  f.pending = null;
  const all = p.callFrames || [], top = all[0], fl = top && top.functionLocation;
  const frames = all.slice(0, 40).map((cf) => {
    const o = { fn: cf.functionName || '(anonymous)', file: frameFile(wc, cf), line: cf.location.lineNumber + 1, col: cf.location.columnNumber + 1 };
    Object.defineProperty(o, 'sid', { value: cf.location.scriptId, enumerable: false });
    return o;
  });
  // entry: one frame deep and still at the top of its function = a callback that had only just been called
  const smp = { afterMs: pend.sentAt - f.start, lateMs: at - pend.sentAt, depth: all.length,
    entry: !!(top && fl && all.length === 1 && top.location.scriptId === fl.scriptId && top.location.lineNumber - fl.lineNumber <= 2), frames };
  if (pend.cold) smp.cold = true;
  const snap = cpuSnap(), procs = cpuBetween(f.markSnap, snap);
  if (procs) { smp.procs = procs; smp.cpuMs = snap.at - f.markSnap.at; }
  if (snap) { f.markSnap = snap; f.lastSnap = snap; }
  f.samples.push(smp);
  testLog('report-sample', { n: f.samples.length, frames: frames.length, top: frames[0] ? frames[0].fn : null, file: frames[0] ? frames[0].file : null, lateMs: smp.lateMs, entry: smp.entry, error: null });
  if (!f.ended) writeFreeze();
  if (f.onSample) f.onSample();
}
// when the window answers again: which no-URL scripts were eval and which new Function, and the source line of each
// sample's top frame in Anvil's own files (so the reader need not find that version of the file)
async function nameFrames(f) {
  const wc = f.wc, table = scriptsOf(wc), src = new Map();
  const source = async (sid) => {
    if (!src.has(sid)) src.set(sid, src.size >= 8 ? null : await withTimeout(wc.debugger.sendCommand('Debugger.getScriptSource', { scriptId: sid }), 1500, 'the source').then((r) => r.scriptSource || '', () => null));
    return src.get(sid);
  };
  for (const smp of f.samples) {
    for (let i = 0; i < (smp.frames || []).length; i++) {
      const fr = smp.frames[i], sc = table.get(fr.sid);
      if (!sc) continue;
      if (!sc.url && sc.by === 'made' && !sc.kind) { const s = await source(fr.sid); if (s != null) sc.kind = /^\(function anonymous\(/.test(s) ? 'function' : 'eval'; fr.file = frameFile(wc, { location: { scriptId: fr.sid } }); }
      else if (!sc.url) fr.file = frameFile(wc, { location: { scriptId: fr.sid } });
      else if (i === 0 && (sc.url.startsWith(ORIGIN + '/') || /[\\/]preload\.js$/.test(sc.url))) { const s = await source(fr.sid); const line = s && s.split('\n')[fr.line - 1]; if (line) fr.src = line.trim().slice(0, 160); }
    }
  }
}
function freezeReport() {
  const f = rp.freeze, now = Date.now();
  const samples = f.samples.slice();
  if (f.pending) {
    const w = { afterMs: f.pending.sentAt - f.start, waitingMs: now - f.pending.sentAt, pending: true };
    const procs = cpuBetween(f.markSnap, f.lastSnap);
    if (procs) { w.procs = procs; w.cpuMs = f.lastSnap.at - f.markSnap.at; }
    samples.push(w);
  }
  const r = mainReport('not-responding', f.at, { id: f.id, durationMs: now - f.start, ongoing: !f.ended, freezeStart: f.start,
    where: { note: 'Sampled from the main process with the DevTools protocol: every ' + SAMPLE_EVERY_MS / 1000 + ' s while the window did not answer (it noticed after ' + (f.why === 'unresponsive' ? 'the window\'s unresponsive event' : FREEZE_MS / 1000 + ' s without a heartbeat') +
      ') the window was asked to pause, and how long each pause took to arrive was kept.', samples } });
  if (f.ended) r.durationMs = f.durationMs;
  const procs = cpuBetween(f.cpu0, f.lastSnap);
  if (procs) r.where.cpu = { ms: f.lastSnap.at - f.cpu0.at, procs };
  if (f.screenshot) r.files.screenshot = true;
  for (let i = r.crumbs.length - 1; i >= 0; i--) if (r.crumbs[i].at <= f.start + 50 && !/^slow frame /.test(r.crumbs[i].text)) { r.lastCrumb = r.crumbs[i].text; break; }
  r.where.summary = ReportFormat && ReportFormat.whereSummary ? ReportFormat.whereSummary(r) : '';
  return r;
}
function writeFreeze() { try { writeReport(rp.freeze.dir, freezeReport()); } catch (e) { testLog('report-write-failed', { message: e.message }); } }
function sampleFreeze() {
  const f = rp.freeze;
  if (!f || f.ended) return;
  if (f.pending) { writeFreeze(); return; }   // still waiting for the last pause: the report says for how long
  if (f.samples.length < MAX_SAMPLES) askSample(f);
}
function startFreeze(wc, why) {
  if (rp.freeze || !rp.watch || wc.isDestroyed()) return;
  const s = hbOf(wc), at = Date.now();
  let made;
  try { made = newReportDir('not-responding', at); } catch (e) { testLog('report-write-failed', { message: e.message }); return; }
  // processor use is counted from the snapshot nearest the last heartbeat (the 1 s timer below keeps the last few)
  const snap = cpuSnap();
  let cpu0 = rp.cpu.find((c) => c.at >= s.last - 1200) || rp.cpu[0] || snap;
  rp.freeze = { wc, why, start: s.last, at, id: made.id, dir: made.dir, samples: [], ended: false, pending: null, cpu0, markSnap: cpu0, lastSnap: snap || cpu0 };
  testLog('freeze-start', { id: made.id, why, sinceMs: at - s.last });
  writeFreeze();
  sessionWrite({ freeze: { dir: made.dir, id: made.id, since: new Date(s.last).toISOString() } });
  pruneReports();
  sampleFreeze();
  rp.freeze.timer = setInterval(sampleFreeze, SAMPLE_EVERY_MS);
}
async function endFreeze() {
  const f = rp.freeze;
  if (!f || f.ended) return;
  f.ended = true;
  f.durationMs = Date.now() - f.start;
  clearInterval(f.timer);
  f.lastSnap = cpuSnap() || f.lastSnap;
  // a pause still on its way lands on the first JavaScript the window runs: normally before this heartbeat
  if (f.pending) await Promise.race([new Promise((res) => { f.onSample = res; }), new Promise((res) => setTimeout(res, 1500))]);
  if (f.pending) { f.samples.push({ afterMs: f.pending.sentAt - f.start, error: 'the pause was asked for and had not arrived ' + Math.round((Date.now() - f.pending.sentAt) / 100) / 10 + ' s later, though the window answered again' + (f.pending.error ? ' (' + f.pending.error + ')' : '') }); f.pending = null; }
  testLog('freeze-end', { id: f.id, durationMs: f.durationMs, samples: f.samples.length });
  if (!f.wc.isDestroyed()) {
    try { await nameFrames(f); } catch (e) { /* the frames keep what they had */ }
    f.screenshot = await screenshotInto(f.dir, f.wc);
  }
  writeFreeze();
  rp.freeze = null;
  sessionWrite();
  const r = readReportJson(f.dir) || {};
  noticeToPage({ id: f.id, kind: 'not-responding', dir: f.dir, durationMs: f.durationMs, startedAt: f.start, operation: r.operation || [], summary: r.summary });
}
setInterval(() => {
  if (!rp.watch || !win || win.isDestroyed()) return;
  const snap = cpuSnap();
  if (snap) { rp.cpu.push(snap); if (rp.cpu.length > 8) rp.cpu.shift(); if (rp.freeze && !rp.freeze.ended) rp.freeze.lastSnap = snap; }
  if (rp.freeze) return;
  const wc = win.webContents, s = rp.hb.get(wc.id);
  if (s && s.alive && !s.hidden && !s.waiting && !win.isMinimized() && pageLoaded && Date.now() - s.last > FREEZE_MS) startFreeze(wc, 'heartbeat');
}, 1000).unref();

// ---- crashes
async function crashReport(kind, crash, wc, opts) {
  const at = Date.now();
  let made;
  try { made = newReportDir('crash', at); } catch (e) { return null; }
  const r = mainReport('crash', at, { id: made.id, crash, where: { note: 'No call stack: ' + (crash.where || 'the process that crashed cannot be asked any more') + '.', samples: [] } });
  if (wc && !wc.isDestroyed() && opts && opts.screenshot) r.files.screenshot = await screenshotInto(made.dir, wc);
  try { writeReport(made.dir, r); } catch (e) { return null; }
  pruneReports();
  testLog('report-crash', { id: made.id, reason: crash.reason || null });
  return { id: made.id, dir: made.dir, summary: r.summary, kind: 'crash' };
}
function watchWindow(w) {
  const wc = w.webContents;
  wc.on('did-start-navigation', (e, url, inPlace, isMain) => {
    const main = e && e.isMainFrame != null ? e.isMainFrame : isMain, same = e && e.isSameDocument != null ? e.isSameDocument : inPlace;
    if (main !== false && !same) hbOf(wc).alive = false;
  });
  wc.on('did-finish-load', () => {
    const s = hbOf(wc); s.alive = true; s.last = Date.now();
    if (rp.watch) attachDebugger(wc);
    rp.notices.splice(0).forEach((m) => noticeToPage(m));
  });
  w.on('unresponsive', () => { const waiting = !!hbOf(wc).waiting; testLog('window-unresponsive', { waiting }); if (!waiting) startFreeze(wc, 'unresponsive'); });
  w.on('responsive', () => { if (rp.freeze && rp.freeze.wc === wc) endFreeze(); });
  wc.on('render-process-gone', async (e, d) => {
    if (d && d.reason === 'clean-exit') return;
    const frozen = rp.freeze && rp.freeze.wc === wc ? rp.freeze : null;
    if (frozen) { frozen.ended = true; frozen.durationMs = Date.now() - frozen.start; clearInterval(frozen.timer); writeFreeze(); rp.freeze = null; sessionWrite(); }
    hbOf(wc).alive = false;
    const info = await crashReport('crash', { reason: d && d.reason, exitCode: d && d.exitCode, process: 'the window (renderer)', where: 'the window\'s process was gone before it could be asked', frozenBefore: frozen ? Math.round(frozen.durationMs / 1000) + ' s (' + frozen.id + ')' : 'no' }, null);
    if (info) rp.notices.push(Object.assign({ durationMs: null, operation: (rp.extra && rp.extra.operation) || [], previous: false }, info));
    if (w.isDestroyed()) return;
    let reload = true;
    if (process.env.ANVIL_TEST_DIALOGS !== 'log') {
      const r = await dialog.showMessageBox(w, { type: 'error', title: 'Anvil', buttons: ['Reload Anvil', 'Close Anvil'], defaultId: 0, cancelId: 1,
        message: 'Anvil\'s window stopped (' + (d && d.reason) + ').',
        detail: 'A problem report was saved' + (info ? ' in ' + info.dir : '') + '. Reload opens Anvil again and offers the work AutoRecover kept.' });
      reload = r.response === 0;
    }
    testLog('crash-reload', { reload });
    if (reload) { if (!wc.isDestroyed()) wc.reload(); } else app.quit();
  });
}
app.on('child-process-gone', async (e, d) => {
  if (!d || d.reason === 'clean-exit' || d.reason === 'killed') return;   // the OpenCascade process is killed on purpose (Cancel, a new part)
  const info = await crashReport('crash', { reason: d.reason, exitCode: d.exitCode, process: [...new Set([d.type, d.serviceName, d.name].filter(Boolean))].join(' / '), where: 'a helper process of Anvil stopped; the window kept running' }, null);
  if (info) noticeToPage(Object.assign({ quiet: true }, info));
});
function mainError(kind, err) {
  try { console.error(err); } catch (e) { /* no console */ }
  crashReport('crash', { reason: 'the main process hit ' + kind, message: rpScrub(err && err.message || String(err)), stack: rpScrub(err && err.stack ? String(err.stack).split('\n').slice(0, 12).join('\n') : ''), process: 'the main process (desktop/main.js)', where: 'see the stack above' }, null)
    .then((info) => { if (info) noticeToPage(Object.assign({ quiet: true }, info)); }, () => {});
}
process.on('uncaughtException', (err) => mainError('an uncaught exception', err));
process.on('unhandledRejection', (err) => mainError('an unhandled promise rejection', err));
// test hook (desktop/check.js reports): ANVIL_TEST_MAIN_ERRORS=1 throws once and rejects once in this process after the
// page has loaded, so the two handlers above can be checked
if (process.env.ANVIL_TEST_MAIN_ERRORS === '1') {
  app.once('web-contents-created', (e, wc) => wc.once('did-finish-load', () => setTimeout(() => {
    setTimeout(() => { throw new Error('check: a deliberate uncaught exception in main.js'); }, 0);
    Promise.reject(new Error('check: a deliberate unhandled rejection in main.js'));
  }, 1500)));
}

// ---- the page's own reports and the dialog's buttons
ipcMain.handle('anvil-desktop:report-save', async (e, o) => {
  o = o || {};
  let r;
  try { r = JSON.parse(String(o.json || '')); } catch (err) { return { error: 'not a report' }; }
  if (!r || r.format !== 'anvil-problem-report' || !/^[\w-]+$/.test(String(r.kind || ''))) return { error: 'not a report' };
  const made = newReportDir(r.kind, +r.at || Date.now());
  r.id = made.id;
  if (o.screenshot) r.files = Object.assign(r.files || {}, { screenshot: await screenshotInto(made.dir, e.sender) });
  if (typeof o.model === 'string' && o.model) { fs.writeFileSync(path.join(made.dir, 'model.anvil.json'), o.model); r.files = Object.assign(r.files || {}, { model: true }); }
  writeReport(made.dir, r);
  pruneReports();
  testLog('report-saved', { id: made.id, kind: r.kind, screenshot: !!(r.files && r.files.screenshot), model: !!(r.files && r.files.model) });
  return { dir: made.dir, id: made.id };
});
ipcMain.handle('anvil-desktop:report-complete', (e, dir, o) => {
  const d = insideReports(dir), r = d && readReportJson(d);
  if (!r) return { ok: false };
  o = o || {};
  const sec = Array.isArray(o.secrets) ? o.secrets.filter((x) => typeof x === 'string') : [];
  const clean = (t) => rpScrub(t, sec);
  if (o.state && typeof o.state === 'object') { r.state = {}; Object.keys(o.state).forEach((k) => { r.state[k] = typeof o.state[k] === 'string' ? clean(o.state[k]) : o.state[k]; }); r.stateAt = Date.now(); r.stateNote = 'taken by the page when it answered again'; }
  if (Array.isArray(o.console)) r.console = o.console.slice(-100).map((c) => ({ at: c.at, level: c.level, text: clean(c.text) }));
  // the page's ring is the fuller one (what it did after it came back; its gesture lines are final); main's copy is
  // kept only when the page's is older (a reload in between)
  const newest = (l) => (l && l.length ? Math.max.apply(null, l.slice(-5).map((c) => +c.at || 0)) : 0);
  if (Array.isArray(o.crumbs) && o.crumbs.length && newest(o.crumbs) >= newest(r.crumbs)) r.crumbs = o.crumbs.slice(-CRUMB_RING).map((c) => ({ at: c.at, text: clean(c.text), n: c.n }));
  // what the page itself recorded about the frozen frame (ui-reports.js "long frames"): long animation frames, long
  // tasks, WebGL context events, the count of WebGL programs before and after; every string is scrubbed again here
  if (o.page && typeof o.page === 'object') {
    try { r.page = JSON.parse(JSON.stringify(o.page, (k, v) => (typeof v === 'string' ? clean(v).slice(0, 300) : v))); } catch (err) { /* not serialisable: left out */ }
    if (r.where && ReportFormat && ReportFormat.whereSummary) r.where.summary = ReportFormat.whereSummary(r);
  }
  writeReport(d, r);
  testLog('report-completed', { id: path.basename(d) });
  return { ok: true };
});
ipcMain.handle('anvil-desktop:report-model', (e, dir, json) => {
  const d = insideReports(dir), r = d && readReportJson(d);
  if (!r || typeof json !== 'string' || !json) return { ok: false };
  fs.writeFileSync(path.join(d, 'model.anvil.json'), json);
  r.files = Object.assign(r.files || {}, { model: true });
  writeReport(d, r);
  testLog('report-model', { id: path.basename(d) });
  return { ok: true };
});
ipcMain.handle('anvil-desktop:report-list', () => {
  try {
    const root = reportsDir();
    return fs.readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory() && /^\d{4}-/.test(x.name)).map((x) => x.name).sort().reverse().map((n) => {
      const r = readReportJson(path.join(root, n)) || {};
      return { id: n, kind: r.kind || null, at: r.at || null, summary: r.summary || null, dir: path.join(root, n), hasModel: !!(r.files && r.files.model) };
    });
  } catch (e) { return []; }
});
ipcMain.handle('anvil-desktop:report-read', (e, dir) => { const d = insideReports(dir); try { return d ? fs.readFileSync(path.join(d, 'report.md'), 'utf8') : ''; } catch (err) { return ''; } });
ipcMain.handle('anvil-desktop:report-folder', () => { try { fs.mkdirSync(reportsDir(), { recursive: true }); } catch (e) { /* ignore */ } return reportsDir(); });
ipcMain.handle('anvil-desktop:report-open', (e, dir) => {
  const d = (dir && insideReports(dir)) || reportsDir();
  try { fs.mkdirSync(d, { recursive: true }); } catch (err) { /* ignore */ }
  testLog('report-open-folder', { dir: d });
  if (process.env.ANVIL_TEST_DIALOGS === 'log') return d;
  shell.openPath(d);
  return d;
});
ipcMain.handle('anvil-desktop:copy', (e, text) => { clipboard.writeText(String(text || '').slice(0, 4000000)); testLog('copied', { chars: String(text || '').length }); return true; });

// ---- start -------------------------------------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('app', (req) => serve(req).catch((e) => new Response('500 ' + e.message, { status: 500 })));
    setupDownloads();
    setupMenu();
    sessionStart();   // problem reports: did the last run end frozen?
    createWindow();
    win.once('ready-to-show', reportLastUpdate);
    testLog('started', { version: VERSION, root: ROOT, userData: app.getPath('userData'), pid: process.pid });
    updater.start();
  });
  app.on('window-all-closed', () => app.quit());
}
